import base64
from io import BytesIO

import imageio.v3 as imageio
from flask import Blueprint, jsonify, render_template, request
from skimage.util import img_as_ubyte

from src.utils.perspective_clip import (
    detect_document_corners,
    output_size_from_corners,
    perspective_clip,
)

perspective_clip_bp = Blueprint("perspective_clip", __name__, url_prefix="/perspective-clip")


@perspective_clip_bp.route("/")
def index():
    return render_template("perspective_clip.html")


@perspective_clip_bp.post("/detect")
def detect():
    try:
        image = _read_uploaded_image()
        corners = detect_document_corners(image)
        output_width, output_height = output_size_from_corners(corners)

        return jsonify(
            {
                "corners": _corners_to_json(corners),
                "input_size": _image_size(image),
                "output_size": {"width": output_width, "height": output_height},
            }
        )
    except Exception as exc:
        return jsonify({"error": str(exc)}), 400


@perspective_clip_bp.post("/clip")
def clip():
    try:
        image = _read_uploaded_image()
        corners = _parse_corners(request.form)
        output_size = _parse_output_size(request.form)
        clipped = perspective_clip(image, corners, output_size=output_size)

        return jsonify(
            {
                "image": _image_to_data_url(clipped),
                "input_size": _image_size(image),
                "output_size": _image_size(clipped),
            }
        )
    except Exception as exc:
        return jsonify({"error": str(exc)}), 400


def _read_uploaded_image():
    upload = request.files.get("image")
    if upload is None or upload.filename == "":
        raise ValueError("请先选择一张图片。")
    return imageio.imread(upload.stream)


def _parse_corners(form):
    corners = []
    for index in range(1, 5):
        x_value = form.get(f"x{index}", "").strip()
        y_value = form.get(f"y{index}", "").strip()
        if not x_value or not y_value:
            raise ValueError("请确认四个角点都已经标记。")
        corners.append((float(x_value), float(y_value)))
    return corners


def _parse_output_size(form):
    width_value = form.get("output_width", "").strip()
    height_value = form.get("output_height", "").strip()
    if not width_value and not height_value:
        return None
    if not width_value or not height_value:
        raise ValueError("输出宽度和高度需要同时填写，或同时留空。")

    width = int(width_value)
    height = int(height_value)
    if width <= 0 or height <= 0:
        raise ValueError("输出宽度和高度必须大于 0。")
    return width, height


def _image_size(image):
    return {"width": int(image.shape[1]), "height": int(image.shape[0])}


def _corners_to_json(corners):
    return [{"x": float(x), "y": float(y)} for x, y in corners]


def _image_to_data_url(image):
    buffer = BytesIO()
    imageio.imwrite(buffer, img_as_ubyte(image), extension=".png")
    encoded = base64.b64encode(buffer.getvalue()).decode("ascii")
    return f"data:image/png;base64,{encoded}"
