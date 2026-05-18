const canvas = document.querySelector("#markCanvas");
const ctx = canvas.getContext("2d");
const canvasEmpty = document.querySelector("#canvasEmpty");
const imageInput = document.querySelector("#imageInput");
const shapeSelect = document.querySelector("#shapeSelect");
const textInput = document.querySelector("#textInput");
const imageSize = document.querySelector("#imageSize");
const selectionCount = document.querySelector("#selectionCount");
const selectedInfo = document.querySelector("#selectedInfo");
const deleteButton = document.querySelector("#deleteButton");
const clearButton = document.querySelector("#clearButton");
const saveButton = document.querySelector("#saveButton");
const selectionList = document.querySelector("#selectionList");

const config = window.COORD_MARK_CONFIG;
const rectangleLikeShapes = new Set(["rectangle", "text"]);

let sourceImage = null;
let selections = [];
let selectedIds = new Set();
let dragStart = null;
let dragCurrent = null;
let moveDrag = null;
let resizeDrag = null;
let nextSelectionId = 1;

imageInput.addEventListener("change", async () => {
  const file = imageInput.files[0];
  if (!file) {
    resetCanvas();
    return;
  }

  sourceImage = await loadImage(file);
  selections = [];
  selectedIds = new Set();
  nextSelectionId = 1;
  imageSize.textContent = `${sourceImage.naturalWidth} x ${sourceImage.naturalHeight}`;
  setupCanvas();
  renderAll();
});

textInput.addEventListener("input", () => {
  selectedSelections()
    .filter((selection) => selection.shape === "text")
    .forEach((selection) => {
      selection.text = textInput.value || config.initial.defaultText;
    });
  renderAll();
});

window.addEventListener("resize", () => {
  if (!sourceImage) {
    return;
  }
  setupCanvas();
  renderAll();
});

canvas.addEventListener("contextmenu", (event) => {
  event.preventDefault();
});

canvas.addEventListener("pointerdown", (event) => {
  if (!sourceImage) {
    return;
  }

  const point = imagePointFromCanvas(canvasPoint(event));
  const resizeTarget = event.button === 0 && !event.ctrlKey ? findResizeTarget(point) : null;
  if (resizeTarget) {
    event.preventDefault();
    selectOnly(resizeTarget.selection.id);
    syncTextInputFromSelection();
    dragStart = null;
    dragCurrent = null;
    moveDrag = null;
    resizeDrag = {
      handle: resizeTarget.handle,
      original: { ...resizeTarget.selection },
    };
    canvas.setPointerCapture(event.pointerId);
    renderAll();
    return;
  }

  const hitSelection = findSelectionAt(point);
  if (hitSelection) {
    event.preventDefault();
    dragStart = null;
    dragCurrent = null;
    resizeDrag = null;

    if (event.button === 0 && event.ctrlKey) {
      toggleSelected(hitSelection.id);
      syncTextInputFromSelection();
      moveDrag = null;
      renderAll();
      return;
    }

    if (event.button === 2) {
      if (!selectedIds.has(hitSelection.id)) {
        selectOnly(hitSelection.id);
      }
      const originals = event.ctrlKey ? duplicateSelectedSelections() : selectedSelections().map(cloneSelection);
      syncTextInputFromSelection();
      moveDrag = {
        start: point,
        originals,
      };
      canvas.setPointerCapture(event.pointerId);
    } else {
      selectOnly(hitSelection.id);
      syncTextInputFromSelection();
      moveDrag = null;
    }
    renderAll();
    return;
  }

  if (event.button !== 0 || event.ctrlKey) {
    return;
  }

  selectedIds = new Set();
  dragStart = point;
  dragCurrent = point;
  moveDrag = null;
  resizeDrag = null;
  canvas.setPointerCapture(event.pointerId);
  renderAll();
});

canvas.addEventListener("pointermove", (event) => {
  if (resizeDrag) {
    const point = imagePointFromCanvas(canvasPoint(event));
    resizeSelection(resizeDrag.original, resizeDrag.handle, point);
    renderAll();
    return;
  }

  if (moveDrag) {
    const point = imagePointFromCanvas(canvasPoint(event));
    moveSelections(moveDrag.originals, point.x - moveDrag.start.x, point.y - moveDrag.start.y);
    renderAll();
    return;
  }

  if (!dragStart) {
    return;
  }

  dragCurrent = imagePointFromCanvas(canvasPoint(event));
  renderAll();
});

canvas.addEventListener("pointerup", () => {
  if (resizeDrag) {
    resizeDrag = null;
    renderAll();
    return;
  }

  if (moveDrag) {
    moveDrag = null;
    renderAll();
    return;
  }

  if (!dragStart || !dragCurrent) {
    return;
  }

  const box = boxFromDrag(dragStart, dragCurrent, shapeSelect.value);
  if (isValidSelectionBox(box, shapeSelect.value)) {
    const selection = {
      id: nextSelectionId++,
      shape: shapeSelect.value,
      ...box,
    };
    if (selection.shape === "text") {
      selection.text = textInput.value || config.initial.defaultText;
    }
    selections.push(selection);
    selectOnly(selection.id);
    syncTextInputFromSelection();
  }

  dragStart = null;
  dragCurrent = null;
  renderAll();
});

canvas.addEventListener("pointercancel", () => {
  dragStart = null;
  dragCurrent = null;
  moveDrag = null;
  resizeDrag = null;
  renderAll();
});

deleteButton.addEventListener("click", deleteSelected);
clearButton.addEventListener("click", () => {
  selections = [];
  selectedIds = new Set();
  renderAll();
});
saveButton.addEventListener("click", saveCoordinateData);

document.addEventListener("keydown", (event) => {
  if (event.key === "Delete" || event.key === "Backspace") {
    const activeTag = document.activeElement.tagName;
    if (activeTag === "INPUT" || activeTag === "SELECT") {
      return;
    }
    deleteSelected();
  }
});

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(config.messages.imageLoadFailed));
    image.src = URL.createObjectURL(file);
  });
}

function setupCanvas() {
  const maxWidth = canvas.parentElement.clientWidth;
  const width = Math.max(config.initial.minCanvasWidth, Math.min(maxWidth, sourceImage.naturalWidth));
  const height = Math.round(width * sourceImage.naturalHeight / sourceImage.naturalWidth);
  canvas.width = width;
  canvas.height = height;
  canvas.hidden = false;
  canvasEmpty.hidden = true;
}

function resetCanvas() {
  sourceImage = null;
  selections = [];
  selectedIds = new Set();
  dragStart = null;
  dragCurrent = null;
  moveDrag = null;
  resizeDrag = null;
  canvas.hidden = true;
  canvasEmpty.hidden = false;
  imageSize.textContent = "-";
  renderControls();
}

function renderAll() {
  drawCanvas();
  renderControls();
}

function drawCanvas() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(sourceImage, 0, 0, canvas.width, canvas.height);

  selections.forEach((selection) => {
    drawSelection(selection, selectedIds.has(selection.id));
  });

  if (dragStart && dragCurrent) {
    const preview = {
      id: 0,
      shape: shapeSelect.value,
      ...boxFromDrag(dragStart, dragCurrent, shapeSelect.value),
    };
    if (preview.shape === "text") {
      preview.text = textInput.value || config.initial.defaultText;
    }
    drawSelection(preview, true, true);
  }
}

function drawSelection(selection, isSelected, isPreview = false) {
  const box = canvasBox(selection);
  const color = isPreview ? config.colors.preview : isSelected ? config.colors.selected : config.colors[selection.shape];
  ctx.save();
  ctx.lineWidth = isSelected ? 3 : 2;
  ctx.strokeStyle = color;
  ctx.fillStyle = withAlpha(color, isPreview ? 0.16 : 0.10);
  ctx.setLineDash(isPreview ? [8, 5] : []);

  if (selection.shape === "arrow") {
    drawArrow(selection, color);
  } else if (selection.shape === "circle") {
    ctx.beginPath();
    ctx.ellipse(
      box.left + box.width / 2,
      box.top + box.height / 2,
      box.width / 2,
      box.height / 2,
      0,
      0,
      Math.PI * 2,
    );
    ctx.fill();
    ctx.stroke();
  } else {
    ctx.fillRect(box.left, box.top, box.width, box.height);
    ctx.strokeRect(box.left, box.top, box.width, box.height);
    if (selection.shape === "text") {
      drawText(selection, box, color);
    }
  }

  if (isSelected && !isPreview) {
    drawResizeHints(selection, box);
  }
  ctx.restore();
}

function drawText(selection, box, color) {
  const text = selection.text || config.initial.defaultText;
  const fontSize = Math.max(8, box.height * 0.72);
  ctx.save();
  ctx.fillStyle = color;
  ctx.font = `${fontSize}px "Segoe UI", "Microsoft YaHei", Arial, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, box.left + box.width / 2, box.top + box.height / 2, Math.max(1, box.width - 8));
  ctx.restore();
}

function drawResizeHints(selection, box) {
  ctx.setLineDash([]);
  ctx.fillStyle = "#ffffff";
  ctx.strokeStyle = config.colors.selected;
  ctx.lineWidth = 2;

  if (selection.shape === "arrow") {
    const start = canvasPointFromImage({ x: selection.startX, y: selection.startY });
    const end = canvasPointFromImage({ x: selection.endX, y: selection.endY });
    drawHandle(start.x, start.y);
    drawHandle(end.x, end.y);
    return;
  }

  if (selection.shape === "circle") {
    const centerX = box.left + box.width / 2;
    const centerY = box.top + box.height / 2;
    const radius = box.width / 2;
    drawHandle(centerX + radius, centerY);
    drawHandle(centerX - radius, centerY);
    drawHandle(centerX, centerY - radius);
    drawHandle(centerX, centerY + radius);
    return;
  }

  [
    [box.left, box.top],
    [box.left + box.width / 2, box.top],
    [box.left + box.width, box.top],
    [box.left + box.width, box.top + box.height / 2],
    [box.left + box.width, box.top + box.height],
    [box.left + box.width / 2, box.top + box.height],
    [box.left, box.top + box.height],
    [box.left, box.top + box.height / 2],
  ].forEach(([x, y]) => drawHandle(x, y));
}

function drawHandle(x, y) {
  ctx.beginPath();
  ctx.arc(x, y, 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
}

function drawArrow(selection, color) {
  const start = canvasPointFromImage({ x: selection.startX, y: selection.startY });
  const end = canvasPointFromImage({ x: selection.endX, y: selection.endY });
  const angle = Math.atan2(end.y - start.y, end.x - start.x);
  const length = Math.hypot(end.x - start.x, end.y - start.y);
  const headLength = Math.min(22, Math.max(10, length * 0.22));
  const headAngle = Math.PI / 7;

  ctx.beginPath();
  ctx.moveTo(start.x, start.y);
  ctx.lineTo(end.x, end.y);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(end.x, end.y);
  ctx.lineTo(
    end.x - headLength * Math.cos(angle - headAngle),
    end.y - headLength * Math.sin(angle - headAngle),
  );
  ctx.lineTo(
    end.x - headLength * Math.cos(angle + headAngle),
    end.y - headLength * Math.sin(angle + headAngle),
  );
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
}

function renderControls() {
  selectionCount.textContent = String(selections.length);
  const selected = selectedSelections();
  selectedInfo.textContent = selected.length === 1 ? describeSelection(selected[0]) : selected.length > 1 ? `${selected.length} 个标记` : "-";
  deleteButton.disabled = selected.length === 0;
  clearButton.disabled = selections.length === 0;
  saveButton.disabled = !sourceImage;

  selectionList.innerHTML = selections.map((selection) => `
    <div class="selection-item ${selectedIds.has(selection.id) ? "is-selected" : ""}" data-id="${selection.id}">
      <strong>#${selection.id} ${selectionName(selection.shape)}</strong>
      <span>${describeSelection(selection)}</span>
    </div>
  `).join("");

  selectionList.querySelectorAll(".selection-item").forEach((item) => {
    item.addEventListener("click", (event) => {
      const id = Number(item.dataset.id);
      if (event.ctrlKey) {
        toggleSelected(id);
      } else {
        selectOnly(id);
      }
      syncTextInputFromSelection();
      renderAll();
    });
  });
}

function deleteSelected() {
  if (selectedIds.size === 0) {
    return;
  }
  selections = selections.filter((selection) => !selectedIds.has(selection.id));
  selectedIds = new Set();
  renderAll();
}

function selectOnly(id) {
  selectedIds = new Set([id]);
}

function toggleSelected(id) {
  const next = new Set(selectedIds);
  if (next.has(id)) {
    next.delete(id);
  } else {
    next.add(id);
  }
  selectedIds = next;
}

function selectedSelections() {
  return selections.filter((selection) => selectedIds.has(selection.id));
}

function syncTextInputFromSelection() {
  const selectedText = selectedSelections().find((selection) => selection.shape === "text");
  if (selectedText) {
    textInput.value = selectedText.text || config.initial.defaultText;
  }
}

function cloneSelection(selection) {
  return { ...selection };
}

function duplicateSelectedSelections() {
  const clones = selectedSelections().map((selection) => ({
    ...selection,
    id: nextSelectionId++,
  }));
  selections.push(...clones);
  selectedIds = new Set(clones.map((selection) => selection.id));
  return clones.map(cloneSelection);
}

function saveCoordinateData() {
  if (!sourceImage) {
    return;
  }

  const content = buildCoordinateText();
  const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = config.export.filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function buildCoordinateText() {
  const rectangles = selections.filter((selection) => selection.shape === "rectangle");
  const circles = selections.filter((selection) => selection.shape === "circle");
  const arrows = selections.filter((selection) => selection.shape === "arrow");
  const texts = selections.filter((selection) => selection.shape === "text");
  const lines = [
    `图象尺寸为：${formatNumber(sourceImage.naturalWidth)} * ${formatNumber(sourceImage.naturalHeight)}, 左上角为坐标原点，x轴向右，y轴向下。`,
    "",
    `方形框共有 ${rectangles.length} 个，坐标表示(x,y,w,h)，其中(x,y)为方形框的中心点坐标，w和h分别为方形框的宽度和高度。`,
    ...formatBoxLines(rectangles, "方形框"),
    "",
    `圆形框共有 ${circles.length} 个，坐标表示(x,y,w,h)，其中(x,y)为该圆外接方形框的中心点坐标，w和h分别为该圆外接方形框的宽度和高度。`,
    ...formatBoxLines(circles, "圆形框"),
    "",
    `箭头共有 ${arrows.length} 个，坐标表示(x1,y1,x2,y2)，其中(x1,y1)为箭头的起点坐标，(x2,y2)为箭头的终点坐标。`,
    ...formatArrowLines(arrows),
    "",
    `文字框共有 ${texts.length} 个，坐标表示(x,y,w,h,text)，其中(x,y)为文字框的中心点坐标，w和h分别为文字框的宽度和高度，text为文字内容，并且文字框隐藏，只显示文字。`,
    ...formatTextLines(texts),
    "",
  ];
  return lines.join("\n");
}

function formatBoxLines(items, label) {
  if (items.length === 0) {
    return ["无。"];
  }
  return items.map((selection, index) => {
    const centerX = selection.left + selection.width / 2;
    const centerY = selection.top + selection.height / 2;
    return `${index + 1}.第 ${index + 1} 个${label}的坐标为：(${formatNumber(centerX)},${formatNumber(centerY)},${formatNumber(selection.width)},${formatNumber(selection.height)}),`;
  });
}

function formatArrowLines(items) {
  if (items.length === 0) {
    return ["无。"];
  }
  return items.map((selection, index) => (
    `${index + 1}.第 ${index + 1} 个箭头的坐标为：(${formatNumber(selection.startX)},${formatNumber(selection.startY)},${formatNumber(selection.endX)},${formatNumber(selection.endY)}),`
  ));
}

function formatTextLines(items) {
  if (items.length === 0) {
    return ["无。"];
  }
  return items.map((selection, index) => {
    const centerX = selection.left + selection.width / 2;
    const centerY = selection.top + selection.height / 2;
    return `${index + 1}.第 ${index + 1} 个文字框的坐标为：(${formatNumber(centerX)},${formatNumber(centerY)},${formatNumber(selection.width)},${formatNumber(selection.height)},"${escapeText(selection.text || config.initial.defaultText)}"),`;
  });
}

function moveSelections(originals, deltaX, deltaY) {
  const groupOffset = constrainedGroupOffset(originals, deltaX, deltaY);
  originals.forEach((original) => {
    const selection = selections.find((candidate) => candidate.id === original.id);
    if (!selection) {
      return;
    }

    const width = original.right - original.left;
    const height = original.bottom - original.top;
    const left = original.left + groupOffset.x;
    const top = original.top + groupOffset.y;

    selection.left = left;
    selection.top = top;
    selection.right = left + width;
    selection.bottom = top + height;
    selection.width = width;
    selection.height = height;
    if (original.shape === "arrow") {
      selection.startX = original.startX + groupOffset.x;
      selection.startY = original.startY + groupOffset.y;
      selection.endX = original.endX + groupOffset.x;
      selection.endY = original.endY + groupOffset.y;
    }
  });
}

function constrainedGroupOffset(originals, deltaX, deltaY) {
  if (originals.length === 0) {
    return { x: 0, y: 0 };
  }

  const bounds = originals.reduce(
    (acc, selection) => ({
      left: Math.min(acc.left, selection.left),
      top: Math.min(acc.top, selection.top),
      right: Math.max(acc.right, selection.right),
      bottom: Math.max(acc.bottom, selection.bottom),
    }),
    { left: Infinity, top: Infinity, right: -Infinity, bottom: -Infinity },
  );

  return {
    x: Math.max(-bounds.left, Math.min(sourceImage.naturalWidth - bounds.right, deltaX)),
    y: Math.max(-bounds.top, Math.min(sourceImage.naturalHeight - bounds.bottom, deltaY)),
  };
}

function resizeSelection(original, handle, point) {
  const selection = selections.find((candidate) => candidate.id === original.id);
  if (!selection) {
    return;
  }

  const next = original.shape === "arrow"
    ? resizedArrowBox(original, handle, point)
    : original.shape === "circle"
      ? resizedCircleBox(original, point)
      : resizedRectangleBox(original, handle, point);

  selection.left = next.left;
  selection.top = next.top;
  selection.right = next.right;
  selection.bottom = next.bottom;
  selection.width = next.width;
  selection.height = next.height;
  if (selection.shape === "arrow") {
    selection.startX = next.startX;
    selection.startY = next.startY;
    selection.endX = next.endX;
    selection.endY = next.endY;
  }
}

function resizedRectangleBox(original, handle, point) {
  let { left, top, right, bottom } = original;
  const minSize = config.initial.minSelectionSize;

  if (handle.includes("w")) {
    left = Math.min(point.x, right - minSize);
  }
  if (handle.includes("e")) {
    right = Math.max(point.x, left + minSize);
  }
  if (handle.includes("n")) {
    top = Math.min(point.y, bottom - minSize);
  }
  if (handle.includes("s")) {
    bottom = Math.max(point.y, top + minSize);
  }

  left = Math.max(0, Math.min(sourceImage.naturalWidth - minSize, left));
  top = Math.max(0, Math.min(sourceImage.naturalHeight - minSize, top));
  right = Math.max(left + minSize, Math.min(sourceImage.naturalWidth, right));
  bottom = Math.max(top + minSize, Math.min(sourceImage.naturalHeight, bottom));

  return boxFromEdges(left, top, right, bottom);
}

function resizedCircleBox(original, point) {
  const centerX = (original.left + original.right) / 2;
  const centerY = (original.top + original.bottom) / 2;
  const maxRadius = Math.max(
    config.initial.minSelectionSize / 2,
    Math.min(centerX, centerY, sourceImage.naturalWidth - centerX, sourceImage.naturalHeight - centerY),
  );
  const radius = Math.max(
    config.initial.minSelectionSize / 2,
    Math.min(maxRadius, Math.hypot(point.x - centerX, point.y - centerY)),
  );
  return boxFromEdges(centerX - radius, centerY - radius, centerX + radius, centerY + radius);
}

function resizedArrowBox(original, handle, point) {
  const clamped = clampPoint(point);
  const minLength = config.initial.minSelectionSize;
  let start = { x: original.startX, y: original.startY };
  let end = { x: original.endX, y: original.endY };

  if (handle === "arrow-start") {
    start = clamped;
  } else {
    end = clamped;
  }

  if (Math.hypot(end.x - start.x, end.y - start.y) < minLength) {
    return arrowBoxFromPoints(
      { x: original.startX, y: original.startY },
      { x: original.endX, y: original.endY },
    );
  }
  return arrowBoxFromPoints(start, end);
}

function findSelectionAt(point) {
  for (let index = selections.length - 1; index >= 0; index -= 1) {
    const selection = selections[index];
    if (containsPoint(selection, point)) {
      return selection;
    }
  }
  return null;
}

function findResizeTarget(point) {
  for (let index = selections.length - 1; index >= 0; index -= 1) {
    const selection = selections[index];
    const handle = selection.shape === "arrow"
      ? arrowResizeHandle(selection, point)
      : selection.shape === "circle"
        ? circleResizeHandle(selection, point)
        : rectangleResizeHandle(selection, point);
    if (handle) {
      return { selection, handle };
    }
  }
  return null;
}

function rectangleResizeHandle(selection, point) {
  const pad = config.initial.hitPadding;
  const nearLeft = Math.abs(point.x - selection.left) <= pad;
  const nearRight = Math.abs(point.x - selection.right) <= pad;
  const nearTop = Math.abs(point.y - selection.top) <= pad;
  const nearBottom = Math.abs(point.y - selection.bottom) <= pad;
  const withinX = point.x >= selection.left - pad && point.x <= selection.right + pad;
  const withinY = point.y >= selection.top - pad && point.y <= selection.bottom + pad;

  if (nearLeft && nearTop) return "nw";
  if (nearRight && nearTop) return "ne";
  if (nearRight && nearBottom) return "se";
  if (nearLeft && nearBottom) return "sw";
  if (nearTop && withinX) return "n";
  if (nearRight && withinY) return "e";
  if (nearBottom && withinX) return "s";
  if (nearLeft && withinY) return "w";
  return null;
}

function circleResizeHandle(selection, point) {
  const centerX = (selection.left + selection.right) / 2;
  const centerY = (selection.top + selection.bottom) / 2;
  const radius = (selection.right - selection.left) / 2;
  const distance = Math.hypot(point.x - centerX, point.y - centerY);
  return Math.abs(distance - radius) <= config.initial.hitPadding ? "circle" : null;
}

function arrowResizeHandle(selection, point) {
  const startDistance = Math.hypot(point.x - selection.startX, point.y - selection.startY);
  const endDistance = Math.hypot(point.x - selection.endX, point.y - selection.endY);
  if (startDistance <= config.initial.hitPadding * 1.5) return "arrow-start";
  if (endDistance <= config.initial.hitPadding * 1.5) return "arrow-end";
  return null;
}

function containsPoint(selection, point) {
  if (selection.shape === "arrow") {
    return distanceToSegment(
      point,
      { x: selection.startX, y: selection.startY },
      { x: selection.endX, y: selection.endY },
    ) <= config.initial.hitPadding;
  }

  const padded = {
    left: selection.left - config.initial.hitPadding,
    top: selection.top - config.initial.hitPadding,
    right: selection.right + config.initial.hitPadding,
    bottom: selection.bottom + config.initial.hitPadding,
  };
  if (point.x < padded.left || point.x > padded.right || point.y < padded.top || point.y > padded.bottom) {
    return false;
  }

  if (rectangleLikeShapes.has(selection.shape)) {
    return true;
  }

  const centerX = (selection.left + selection.right) / 2;
  const centerY = (selection.top + selection.bottom) / 2;
  const radiusX = Math.max((selection.right - selection.left) / 2 + config.initial.hitPadding, 1);
  const radiusY = Math.max((selection.bottom - selection.top) / 2 + config.initial.hitPadding, 1);
  return ((point.x - centerX) / radiusX) ** 2 + ((point.y - centerY) / radiusY) ** 2 <= 1;
}

function boxFromDrag(start, end, shape) {
  if (shape === "arrow") {
    return arrowBoxFromPoints(start, end);
  }

  if (shape === "circle") {
    const deltaX = end.x - start.x;
    const deltaY = end.y - start.y;
    const side = Math.max(Math.abs(deltaX), Math.abs(deltaY));
    const signedEnd = {
      x: start.x + (deltaX < 0 ? -side : side),
      y: start.y + (deltaY < 0 ? -side : side),
    };
    return normalizedBox(start, signedEnd);
  }

  return normalizedBox(start, end);
}

function arrowBoxFromPoints(start, end) {
  const clampedStart = clampPoint(start);
  const clampedEnd = clampPoint(end);
  const left = Math.min(clampedStart.x, clampedEnd.x);
  const top = Math.min(clampedStart.y, clampedEnd.y);
  const right = Math.max(clampedStart.x, clampedEnd.x);
  const bottom = Math.max(clampedStart.y, clampedEnd.y);
  return {
    ...boxFromEdges(left, top, right, bottom),
    startX: clampedStart.x,
    startY: clampedStart.y,
    endX: clampedEnd.x,
    endY: clampedEnd.y,
  };
}

function normalizedBox(start, end) {
  let left = Math.min(start.x, end.x);
  let top = Math.min(start.y, end.y);
  let right = Math.max(start.x, end.x);
  let bottom = Math.max(start.y, end.y);

  const clampedLeftTop = clampPoint({ x: left, y: top });
  const clampedRightBottom = clampPoint({ x: right, y: bottom });
  left = Math.min(clampedLeftTop.x, clampedRightBottom.x);
  top = Math.min(clampedLeftTop.y, clampedRightBottom.y);
  right = Math.max(clampedLeftTop.x, clampedRightBottom.x);
  bottom = Math.max(clampedLeftTop.y, clampedRightBottom.y);

  return boxFromEdges(left, top, right, bottom);
}

function boxFromEdges(left, top, right, bottom) {
  return {
    left,
    top,
    right,
    bottom,
    width: right - left,
    height: bottom - top,
  };
}

function canvasPoint(event) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: (event.clientX - rect.left) * canvas.width / rect.width,
    y: (event.clientY - rect.top) * canvas.height / rect.height,
  };
}

function imagePointFromCanvas(point) {
  return clampPoint({
    x: point.x * sourceImage.naturalWidth / canvas.width,
    y: point.y * sourceImage.naturalHeight / canvas.height,
  });
}

function canvasBox(selection) {
  const scaleX = canvas.width / sourceImage.naturalWidth;
  const scaleY = canvas.height / sourceImage.naturalHeight;
  return {
    left: selection.left * scaleX,
    top: selection.top * scaleY,
    width: (selection.right - selection.left) * scaleX,
    height: (selection.bottom - selection.top) * scaleY,
  };
}

function canvasPointFromImage(point) {
  return {
    x: point.x * canvas.width / sourceImage.naturalWidth,
    y: point.y * canvas.height / sourceImage.naturalHeight,
  };
}

function clampPoint(point) {
  return {
    x: Math.max(0, Math.min(sourceImage.naturalWidth, point.x)),
    y: Math.max(0, Math.min(sourceImage.naturalHeight, point.y)),
  };
}

function describeSelection(selection) {
  if (selection.shape === "arrow") {
    return `start:${selection.startX.toFixed(1)},${selection.startY.toFixed(1)} end:${selection.endX.toFixed(1)},${selection.endY.toFixed(1)}`;
  }
  if (selection.shape === "text") {
    return `${selection.text || config.initial.defaultText} | x:${selection.left.toFixed(1)}, y:${selection.top.toFixed(1)}, w:${selection.width.toFixed(1)}, h:${selection.height.toFixed(1)}`;
  }
  return `x:${selection.left.toFixed(1)}, y:${selection.top.toFixed(1)}, w:${selection.width.toFixed(1)}, h:${selection.height.toFixed(1)}`;
}

function formatNumber(value) {
  const fixed = Number(value).toFixed(config.export.numberPrecision);
  return fixed.replace(/\.?0+$/, "");
}

function selectionName(shape) {
  return config.labels[shape] || shape;
}

function isValidSelectionBox(box, shape) {
  if (shape === "arrow") {
    return Math.hypot(box.endX - box.startX, box.endY - box.startY) >= config.initial.minSelectionSize;
  }
  return box.width >= config.initial.minSelectionSize && box.height >= config.initial.minSelectionSize;
}

function distanceToSegment(point, start, end) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared === 0) {
    return Math.hypot(point.x - start.x, point.y - start.y);
  }
  const t = Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared));
  const projection = {
    x: start.x + t * dx,
    y: start.y + t * dy,
  };
  return Math.hypot(point.x - projection.x, point.y - projection.y);
}

function escapeText(text) {
  return String(text).replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function withAlpha(hex, alpha) {
  const value = hex.replace("#", "");
  const r = parseInt(value.slice(0, 2), 16);
  const g = parseInt(value.slice(2, 4), 16);
  const b = parseInt(value.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
