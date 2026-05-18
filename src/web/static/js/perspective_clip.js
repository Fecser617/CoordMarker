const config = window.PERSPECTIVE_CLIP_CONFIG;
const imageInput = document.querySelector("#imageInput");
const canvas = document.querySelector("#sourceCanvas");
const ctx = canvas.getContext("2d");
const sourceEmpty = document.querySelector("#sourceEmpty");
const resultImage = document.querySelector("#resultImage");
const resultEmpty = document.querySelector("#resultEmpty");
const cornerFields = document.querySelector("#cornerFields");
const inputSize = document.querySelector("#inputSize");
const resultSize = document.querySelector("#resultSize");
const outputWidth = document.querySelector("#outputWidth");
const outputHeight = document.querySelector("#outputHeight");
const detectButton = document.querySelector("#detectButton");
const clipButton = document.querySelector("#clipButton");
const message = document.querySelector("#message");

const detectUrl = config.endpoints.detect;
const clipUrl = config.endpoints.clip;
const pointLabels = config.initial.pointLabels;
const defaultCornerInsetRatio = config.initial.defaultCornerInsetRatio;
const minCanvasWidth = config.initial.minCanvasWidth;

let selectedFile = null;
let sourceImage = null;
let corners = [];
let activePoint = -1;

renderCornerFields();

imageInput.addEventListener("change", async () => {
  selectedFile = imageInput.files[0] || null;
  resetResult();
  clearMessage();

  if (!selectedFile) {
    resetSource();
    return;
  }

  sourceImage = await loadImage(selectedFile);
  inputSize.textContent = `${sourceImage.naturalWidth} x ${sourceImage.naturalHeight}`;
  setupCanvas();
  setDefaultCorners();
  draw();
  detectButton.disabled = false;
  clipButton.disabled = false;
  await detectCorners();
});

detectButton.addEventListener("click", detectCorners);
clipButton.addEventListener("click", clipImage);

window.addEventListener("resize", () => {
  if (!sourceImage) {
    return;
  }
  setupCanvas();
  draw();
});

canvas.addEventListener("pointerdown", (event) => {
  if (!corners.length) {
    return;
  }
  const point = canvasPoint(event);
  activePoint = nearestCornerIndex(point);
  canvas.setPointerCapture(event.pointerId);
});

canvas.addEventListener("pointermove", (event) => {
  if (activePoint < 0) {
    return;
  }
  const point = imagePoint(canvasPoint(event));
  corners[activePoint] = clampPoint(point);
  updateCornerFields();
  draw();
});

canvas.addEventListener("pointerup", () => {
  activePoint = -1;
});

canvas.addEventListener("pointercancel", () => {
  activePoint = -1;
});

async function detectCorners() {
  if (!selectedFile) {
    return;
  }

  setMessage(config.messages.detecting, "info");
  detectButton.disabled = true;
  try {
    const data = await postImage(detectUrl);
    corners = data.corners;
    if (data.output_size) {
      outputWidth.value = data.output_size.width;
      outputHeight.value = data.output_size.height;
    }
    updateCornerFields();
    draw();
    clearMessage();
  } catch (error) {
    setMessage(`${error.message} ${config.messages.detectFallbackSuffix}`, "error");
  } finally {
    detectButton.disabled = false;
  }
}

async function clipImage() {
  if (!selectedFile || corners.length !== 4) {
    return;
  }

  setMessage(config.messages.clipping, "info");
  clipButton.disabled = true;
  try {
    const formData = imageFormData();
    corners.forEach((point, index) => {
      formData.append(`x${index + 1}`, point.x);
      formData.append(`y${index + 1}`, point.y);
    });
    formData.append("output_width", outputWidth.value.trim());
    formData.append("output_height", outputHeight.value.trim());

    const response = await fetch(clipUrl, {
      method: "POST",
      body: formData,
    });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || config.messages.clipFailed);
    }

    resultImage.src = data.image;
    resultImage.hidden = false;
    resultEmpty.hidden = true;
    resultSize.textContent = `${data.output_size.width} x ${data.output_size.height}`;
    clearMessage();
  } catch (error) {
    setMessage(error.message, "error");
  } finally {
    clipButton.disabled = false;
  }
}

async function postImage(url) {
  const response = await fetch(url, {
    method: "POST",
    body: imageFormData(),
  });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || config.messages.requestFailed);
  }
  return data;
}

function imageFormData() {
  const formData = new FormData();
  formData.append("image", selectedFile);
  return formData;
}

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
  const width = Math.max(minCanvasWidth, Math.min(maxWidth, sourceImage.naturalWidth));
  const height = Math.round(width * sourceImage.naturalHeight / sourceImage.naturalWidth);
  canvas.width = width;
  canvas.height = height;
  canvas.hidden = false;
  sourceEmpty.hidden = true;
}

function setDefaultCorners() {
  const insetX = sourceImage.naturalWidth * defaultCornerInsetRatio;
  const insetY = sourceImage.naturalHeight * defaultCornerInsetRatio;
  corners = [
    { x: insetX, y: insetY },
    { x: sourceImage.naturalWidth - insetX, y: insetY },
    { x: sourceImage.naturalWidth - insetX, y: sourceImage.naturalHeight - insetY },
    { x: insetX, y: sourceImage.naturalHeight - insetY },
  ];
  updateCornerFields();
}

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(sourceImage, 0, 0, canvas.width, canvas.height);
  if (corners.length !== 4) {
    return;
  }

  const points = corners.map(canvasPointFromImage);
  ctx.lineWidth = 2;
  ctx.strokeStyle = "#22c55e";
  ctx.fillStyle = "rgba(34, 197, 94, 0.14)";
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  points.slice(1).forEach((point) => ctx.lineTo(point.x, point.y));
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  points.forEach((point, index) => {
    ctx.beginPath();
    ctx.arc(point.x, point.y, 7, 0, Math.PI * 2);
    ctx.fillStyle = index === activePoint ? "#f97316" : "#2563eb";
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = "#ffffff";
    ctx.stroke();
  });
}

function renderCornerFields() {
  cornerFields.innerHTML = pointLabels.map((label, index) => `
    <div class="corner-row">
      <span>${label}</span>
      <input data-axis="x" data-index="${index}" type="number" step="0.01" placeholder="x">
      <input data-axis="y" data-index="${index}" type="number" step="0.01" placeholder="y">
    </div>
  `).join("");

  cornerFields.querySelectorAll("input").forEach((input) => {
    input.addEventListener("input", () => {
      const index = Number(input.dataset.index);
      const axis = input.dataset.axis;
      if (!corners[index]) {
        return;
      }
      const value = Number(input.value);
      if (Number.isFinite(value)) {
        corners[index][axis] = value;
        corners[index] = clampPoint(corners[index]);
        draw();
      }
    });
  });
}

function updateCornerFields() {
  cornerFields.querySelectorAll("input").forEach((input) => {
    const index = Number(input.dataset.index);
    const axis = input.dataset.axis;
    input.value = corners[index] ? corners[index][axis].toFixed(2) : "";
  });
}

function canvasPoint(event) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: (event.clientX - rect.left) * canvas.width / rect.width,
    y: (event.clientY - rect.top) * canvas.height / rect.height,
  };
}

function imagePoint(point) {
  return {
    x: point.x * sourceImage.naturalWidth / canvas.width,
    y: point.y * sourceImage.naturalHeight / canvas.height,
  };
}

function canvasPointFromImage(point) {
  return {
    x: point.x * canvas.width / sourceImage.naturalWidth,
    y: point.y * canvas.height / sourceImage.naturalHeight,
  };
}

function nearestCornerIndex(point) {
  const points = corners.map(canvasPointFromImage);
  let nearestIndex = 0;
  let nearestDistance = Number.POSITIVE_INFINITY;
  points.forEach((candidate, index) => {
    const distance = Math.hypot(candidate.x - point.x, candidate.y - point.y);
    if (distance < nearestDistance) {
      nearestDistance = distance;
      nearestIndex = index;
    }
  });
  return nearestIndex;
}

function clampPoint(point) {
  return {
    x: Math.max(0, Math.min(sourceImage.naturalWidth - 1, point.x)),
    y: Math.max(0, Math.min(sourceImage.naturalHeight - 1, point.y)),
  };
}

function resetSource() {
  sourceImage = null;
  corners = [];
  canvas.hidden = true;
  sourceEmpty.hidden = false;
  inputSize.textContent = "-";
  detectButton.disabled = true;
  clipButton.disabled = true;
  updateCornerFields();
}

function resetResult() {
  resultImage.removeAttribute("src");
  resultImage.hidden = true;
  resultEmpty.hidden = false;
  resultSize.textContent = "-";
}

function setMessage(text, type) {
  message.textContent = text;
  message.className = `message ${type} is-visible`;
}

function clearMessage() {
  message.textContent = "";
  message.className = "message";
}
