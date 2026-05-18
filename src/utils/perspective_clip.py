"""Standalone perspective correction and clipping helpers.

This module is intentionally portable: it does not import anything from this
project. Copy it into another project and install the public dependencies:

    pip install numpy imageio scikit-image

Corner coordinates use image coordinates: (x, y), where x is the column and y
is the row. The four points may be in any order.
"""

from __future__ import annotations

from pathlib import Path
from typing import Iterable, Sequence

import imageio.v3 as imageio
import numpy as np
from skimage import draw, exposure, morphology, transform
from skimage.color import rgb2gray
from skimage.feature import corner_foerstner, corner_peaks
from skimage.filters import gaussian, sobel
from skimage.segmentation import watershed
from skimage.util import img_as_ubyte

Point = Sequence[float]
Corners = Iterable[Point]


def read_image(image_path: str | Path) -> np.ndarray:
    """Read an image file into a numpy array."""
    return imageio.imread(image_path)


def save_image(image_path: str | Path, image: np.ndarray) -> None:
    """Save an image array to disk."""
    imageio.imwrite(image_path, img_as_ubyte(image))


def order_corners(corners: Corners) -> np.ndarray:
    """Return corners ordered as top-left, top-right, bottom-right, bottom-left.

    Args:
        corners: Four (x, y) points in any order.
    """
    points = np.asarray(list(corners), dtype=np.float32)
    if points.shape != (4, 2):
        raise ValueError("corners must contain exactly four (x, y) points.")

    ordered = np.zeros((4, 2), dtype=np.float32)
    point_sums = points.sum(axis=1)
    point_diffs = np.diff(points, axis=1).reshape(4)

    ordered[0] = points[np.argmin(point_sums)]
    ordered[2] = points[np.argmax(point_sums)]
    ordered[1] = points[np.argmin(point_diffs)]
    ordered[3] = points[np.argmax(point_diffs)]
    return ordered


def output_size_from_corners(corners: Corners) -> tuple[int, int]:
    """Calculate corrected image size as (width, height)."""
    top_left, top_right, bottom_right, bottom_left = order_corners(corners)

    top_width = np.linalg.norm(top_right - top_left)
    bottom_width = np.linalg.norm(bottom_right - bottom_left)
    width = max(1, int(round(max(top_width, bottom_width))))

    left_height = np.linalg.norm(bottom_left - top_left)
    right_height = np.linalg.norm(bottom_right - top_right)
    height = max(1, int(round(max(left_height, right_height))))

    return width, height


def perspective_clip(
    image: np.ndarray,
    corners: Corners,
    output_size: tuple[int, int] | None = None,
) -> np.ndarray:
    """Perspective-correct and crop an image by four document corners.

    Args:
        image: Source image as a numpy array.
        corners: Four source points in (x, y) image coordinates.
        output_size: Optional (width, height). If omitted, it is inferred from
            the edge lengths of the quadrilateral.

    Returns:
        The corrected clipped image as a numpy array.
    """
    source = order_corners(corners)
    width, height = output_size or output_size_from_corners(source)
    destination = np.array(
        [
            [0, 0],
            [width - 1, 0],
            [width - 1, height - 1],
            [0, height - 1],
        ],
        dtype=np.float32,
    )

    projective_transform = transform.ProjectiveTransform()
    if not projective_transform.estimate(destination, source):
        raise ValueError("Could not estimate perspective transform from corners.")

    output_shape = (height, width) + tuple(image.shape[2:])
    corrected = transform.warp(
        image,
        projective_transform,
        output_shape=output_shape,
        mode="reflect",
        preserve_range=True,
    )
    return corrected.astype(image.dtype, copy=False)


def clip_image_file(
    input_path: str | Path,
    output_path: str | Path,
    corners: Corners,
    output_size: tuple[int, int] | None = None,
) -> np.ndarray:
    """Read, perspective-correct, crop, save, and return an image."""
    image = read_image(input_path)
    corrected = perspective_clip(image, corners, output_size=output_size)
    save_image(output_path, corrected)
    return corrected


def detect_document_corners(
    image: np.ndarray,
    intermediate_height: int = 256,
) -> np.ndarray:
    """Detect likely document corners and return four (x, y) points.

    This is a lightweight extraction of the original project's automatic corner
    detection. It works best when the document is clearly separated from the
    background. For production workflows, manually supplied corners are still
    more predictable.
    """
    if image.ndim not in (2, 3):
        raise ValueError("image must be a grayscale or RGB/RGBA array.")

    scale_ratio = intermediate_height / image.shape[0]
    resized = transform.resize(
        image,
        output_shape=(intermediate_height, int(image.shape[1] * scale_ratio)),
        mode="reflect",
        anti_aliasing=True,
        preserve_range=True,
    )
    gray = rgb2gray(resized) if resized.ndim == 3 else resized.astype(float)
    gray = exposure.rescale_intensity(gray, out_range=(0.0, 1.0))
    blurred = gaussian(gray, sigma=1)

    markers = np.zeros_like(gray, dtype=int)
    markers[0, :] = 1
    markers[-1, :] = 1
    markers[:, 0] = 1
    markers[:, -1] = 1
    center = (gray.shape[0] // 2, gray.shape[1] // 2)
    markers[center] = 2

    elevation_map = sobel(blurred)
    disk_rows, disk_cols = draw.disk(center, 16, shape=elevation_map.shape)
    elevation_map[disk_rows, disk_cols] = 0.0

    segmented = watershed(image=elevation_map, markers=markers)
    if len(np.unique(segmented)) != 2:
        raise ValueError("Could not separate document from background.")

    mask = segmented == 2
    closing_diameter = 25
    pad_width = closing_diameter * 2
    padded = np.pad(mask, pad_width=pad_width, mode="constant", constant_values=False)
    closed = morphology.binary_closing(padded, morphology.disk(closing_diameter))
    closed = closed[pad_width:-pad_width, pad_width:-pad_width]

    accuracy, roundness = corner_foerstner(closed, sigma=2)
    corner_response = (roundness > 0.3) * (accuracy > 0.5) * accuracy
    detected = corner_peaks(corner_response, min_distance=1)
    if len(detected) < 4:
        raise ValueError("Could not detect four document corners.")

    ordered_candidates = _sort_row_col_points_clockwise(detected, closed.shape)
    angles = np.abs(_point_angles_in_degrees(ordered_candidates))
    selected_indices = np.sort(np.argsort(angles)[::-1][:4])
    selected = ordered_candidates[selected_indices]
    if selected.shape != (4, 2) or not np.any(selected):
        raise ValueError("Could not detect four document corners.")

    xy_points = np.fliplr(selected.astype(np.float32)) / scale_ratio
    return order_corners(xy_points)


def auto_clip_image(
    image: np.ndarray,
    output_size: tuple[int, int] | None = None,
) -> np.ndarray:
    """Automatically detect document corners, then perspective-crop the image."""
    corners = detect_document_corners(image)
    return perspective_clip(image, corners, output_size=output_size)


def auto_clip_image_file(
    input_path: str | Path,
    output_path: str | Path,
    output_size: tuple[int, int] | None = None,
) -> np.ndarray:
    """Read an image, auto-detect corners, perspective-crop, save, and return it."""
    image = read_image(input_path)
    corrected = auto_clip_image(image, output_size=output_size)
    save_image(output_path, corrected)
    return corrected


def _sort_row_col_points_clockwise(points: np.ndarray, image_shape: tuple[int, ...]) -> np.ndarray:
    center = np.array([image_shape[0] / 2, image_shape[1] / 2])
    shifted = points - center
    angles = np.degrees(np.arctan2(shifted[:, 0], shifted[:, 1]))
    angles = np.where(angles < 0, -angles, -(angles - 360))
    sorted_points = points[np.argsort(angles)][::-1]
    top_left_index = np.argmin(np.sum(sorted_points, axis=1))
    return np.roll(sorted_points, -top_left_index, axis=0)


def _point_angles_in_degrees(points: np.ndarray) -> np.ndarray:
    incoming = points - np.roll(points, 1, axis=0)
    outgoing = np.roll(incoming, -1, axis=0)
    denominator = np.linalg.norm(incoming, axis=1) * np.linalg.norm(outgoing, axis=1)
    denominator = np.where(denominator == 0, np.finfo(float).eps, denominator)
    crossproducts = np.cross(incoming, outgoing) / denominator
    crossproducts = np.clip(crossproducts, -1.0, 1.0)
    return np.arcsin(crossproducts) / np.pi * 180

