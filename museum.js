const WIDTH = 960;
const HEIGHT = 600;
const MAX_POINTS = 600;
const MAX_STROKES = 90;
const COLORS = [
  ["Moonlight", "#f5dca4"],
  ["Coral", "#f59287"],
  ["Lilac", "#b8a1ed"],
  ["Mint", "#92d2be"],
  ["Sky", "#8bc6e8"],
];

export const EXPERIMENTS = Object.freeze([
  {
    id: "solar",
    name: "Solar study",
    description: "Drag to uncover the warm terrain of a sleeping sun.",
    action: "Reveal a patch",
    color: "#f5bd75",
  },
  {
    id: "redshift",
    name: "Red shift",
    description: "Drag to uncover a cool world beyond the red horizon.",
    action: "Reveal a patch",
    color: "#ee998e",
  },
  {
    id: "orbit",
    name: "Orbit",
    description:
      "Tap or drag to place small satellites and trace their orbits.",
    action: "Place a satellite",
    color: "#b8a1ed",
  },
  {
    id: "echo",
    name: "Echo",
    description: "Tap or drag to leave ripples in the quiet of space.",
    action: "Make a ripple",
    color: "#8bc6e8",
  },
  {
    id: "prism",
    name: "Prism",
    description:
      "Paint a pixel trail. Change colors to build your own spectrum.",
    action: "Paint a tile",
    color: "#92d2be",
  },
  {
    id: "constellation",
    name: "Constellation",
    description: "Tap to place stars. Each new star connects to the last.",
    action: "Place a star",
    color: "#f5dca4",
  },
  {
    id: "garden",
    name: "Night garden",
    description: "Tap or drag to plant tiny flowers under an impossible moon.",
    action: "Plant a flower",
    color: "#dba4c3",
  },
]);

/** Keep pointer coordinates inside the artwork, regardless of CSS size. */
export function normalizePoint(clientX, clientY, rect) {
  return {
    x: Math.max(
      0,
      Math.min(1, (clientX - rect.left) / Math.max(1, rect.width)),
    ),
    y: Math.max(
      0,
      Math.min(1, (clientY - rect.top) / Math.max(1, rect.height)),
    ),
  };
}

/** The visible part of a canvas may be smaller than its rendered cover size. */
export function visibleCanvasBounds(canvasRect, frameRect) {
  const left = Math.max(canvasRect.left, frameRect.left);
  const top = Math.max(canvasRect.top, frameRect.top);
  const right = Math.min(
    canvasRect.left + canvasRect.width,
    frameRect.left + frameRect.width,
  );
  const bottom = Math.min(
    canvasRect.top + canvasRect.height,
    frameRect.top + frameRect.height,
  );
  if (right <= left || bottom <= top)
    return { minX: 0, maxX: 1, minY: 0, maxY: 1 };
  const start = normalizePoint(left, top, canvasRect);
  const end = normalizePoint(right, bottom, canvasRect);
  return { minX: start.x, maxX: end.x, minY: start.y, maxY: end.y };
}

function planetIndex(index) {
  return Number.isFinite(index)
    ? Math.max(0, Math.min(EXPERIMENTS.length - 1, Math.floor(index)))
    : 0;
}

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function button(label, onClick) {
  const node = element("button", "experiment-button", label);
  node.type = "button";
  node.addEventListener("click", onClick);
  return node;
}

function pixel(ctx, x, y, size, color) {
  ctx.fillStyle = color;
  ctx.fillRect(Math.round(x / 4) * 4, Math.round(y / 4) * 4, size, size);
}

function star(ctx, x, y, size, color) {
  ctx.fillStyle = color;
  ctx.fillRect(
    Math.round((x - size / 2) / 4) * 4,
    Math.round((y - 2) / 4) * 4,
    size,
    4,
  );
  ctx.fillRect(
    Math.round((x - 2) / 4) * 4,
    Math.round((y - size / 2) / 4) * 4,
    4,
    size,
  );
}

function starfield(ctx, seed = 0) {
  ctx.fillStyle = "#151222";
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
  for (let i = 0; i < 98; i += 1) {
    const x = ((i * 137 + seed * 41) % 937) + 10;
    const y = ((i * i * 43 + seed * 59) % 565) + 12;
    pixel(ctx, x, y, i % 11 === 0 ? 4 : 2, i % 3 === 0 ? "#786483" : "#44354f");
  }
}

function drawPlanet(ctx, cx, cy, radius, colors) {
  for (let y = -radius; y <= radius; y += 8) {
    for (let x = -radius; x <= radius; x += 8) {
      if (x * x + y * y > radius * radius) continue;
      const wave = Math.sin((x + y) * 0.026) + Math.cos(y * 0.062);
      const band =
        Math.abs(Math.floor((y + radius + wave * 18) / 27)) % colors.length;
      pixel(ctx, cx + x, cy + y, 8, colors[band]);
    }
  }
}

function buildBase(id) {
  const canvas = document.createElement("canvas");
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  const ctx = canvas.getContext("2d");
  starfield(
    ctx,
    EXPERIMENTS.findIndex((item) => item.id === id),
  );
  if (id === "solar" || id === "redshift") {
    const warm = id === "solar";
    drawPlanet(
      ctx,
      486,
      298,
      211,
      warm
        ? ["#ee9974", "#c96667", "#f5c17c", "#e08068", "#f3d393"]
        : ["#788ad1", "#6065a0", "#93bcda", "#af9acf", "#78a1b9"],
    );
    ctx.strokeStyle = warm ? "#9b5669" : "#836788";
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.ellipse(486, 315, 328, 60, -0.22, 0, Math.PI * 2);
    ctx.stroke();
  } else if (id === "orbit") {
    drawPlanet(ctx, 480, 300, 74, ["#927498", "#b294b0", "#765f8e"]);
    ctx.strokeStyle = "#3d314e";
    ctx.lineWidth = 2;
    for (const radius of [142, 205, 275]) {
      ctx.beginPath();
      ctx.ellipse(480, 300, radius * 1.2, radius * 0.7, -0.25, 0, Math.PI * 2);
      ctx.stroke();
    }
  } else if (id === "echo") {
    ctx.strokeStyle = "#393147";
    ctx.lineWidth = 2;
    for (let y = 120; y < HEIGHT; y += 60) {
      ctx.beginPath();
      ctx.moveTo(40, y);
      ctx.lineTo(WIDTH - 40, y);
      ctx.stroke();
    }
    drawPlanet(ctx, 735, 140, 40, ["#5b596f", "#7a728b", "#a09aae"]);
  } else if (id === "prism") {
    ctx.fillStyle = "#201b31";
    for (let y = 30; y < HEIGHT; y += 40) {
      for (let x = 30; x < WIDTH; x += 40) ctx.fillRect(x, y, 3, 3);
    }
    const colors = ["#66576c", "#715b73", "#676182", "#576c7c", "#577573"];
    colors.forEach((color, i) => pixel(ctx, 402 + i * 26, 286, 22, color));
  } else if (id === "constellation") {
    [
      [120, 100],
      [790, 175],
      [760, 490],
      [190, 440],
    ].forEach(([x, y]) => star(ctx, x, y, 10, "#7b6b8f"));
  } else {
    drawPlanet(ctx, 740, 120, 48, ["#ab8fa3", "#c1a5b3", "#d0b9c0"]);
    ctx.fillStyle = "#242335";
    ctx.fillRect(0, 520, WIDTH, 80);
    for (let x = 0; x < WIDTH; x += 20)
      pixel(ctx, x, 512 + (x % 3) * 8, 20, "#242335");
    ctx.fillStyle = "#3b344b";
    for (let x = 20; x < WIDTH; x += 47) ctx.fillRect(x, 545 + (x % 29), 12, 4);
  }
  return canvas;
}

/** Mount the museum; the returned cleanup also exposes selectPlanet(index). */
export function mountMuseum(
  container,
  { onDiscover = () => {}, reducedMotion = false, initialPlanet = 0 } = {},
) {
  const states = new Map(EXPERIMENTS.map((experiment) => [experiment.id, []]));
  const bases = new Map();
  const initialIndex = planetIndex(initialPlanet);
  let active = EXPERIMENTS[initialIndex];
  let selectedColor = COLORS[0][1];
  let brushSize = 28;
  let drawing = null;
  let pointerId = null;
  let discovered = false;
  let frame = null;
  let disposed = false;
  let keyboardPoint = { x: 0.5, y: 0.5 };
  let showCursor = false;
  let exportUrl = null;
  let exportVersion = 0;

  const root = element("section", "experiment");
  root.setAttribute("aria-label", "Interactive planet experiments");
  root.dataset.reducedMotion = String(reducedMotion);
  const nav = element("div", "experiment-planets");
  nav.setAttribute("role", "group");
  nav.setAttribute("aria-label", "Choose a planet experiment");
  const choices = EXPERIMENTS.map((experiment, index) => {
    const choice = button("", () => selectExperiment(experiment));
    choice.className = "experiment-planet";
    choice.style.setProperty("--planet-color", experiment.color);
    choice.setAttribute("aria-pressed", String(index === initialIndex));
    const orb = element("span", "experiment-orb");
    orb.setAttribute("aria-hidden", "true");
    choice.append(
      orb,
      element("span", "experiment-planet-name", experiment.name),
    );
    nav.append(choice);
    return choice;
  });

  const heading = element("h3", "experiment-title", active.name);
  const description = element(
    "p",
    "experiment-description",
    active.description,
  );
  const keyboardHelp = element(
    "p",
    "experiment-help",
    "Use a finger, mouse, or pen. On the canvas, arrow keys move and Enter adds a mark.",
  );
  const helpId = `experiment-help-${Math.random().toString(36).slice(2, 9)}`;
  keyboardHelp.id = helpId;
  const canvas = element("canvas", "experiment-canvas");
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  canvas.tabIndex = 0;
  canvas.style.touchAction = "none";
  canvas.style.display = "block";
  canvas.setAttribute("role", "img");
  canvas.setAttribute("aria-describedby", helpId);
  canvas.textContent =
    "An interactive art canvas. Use the Add a mark button to create art with a keyboard.";
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    root.append(
      element(
        "p",
        "experiment-description",
        "Your browser could not open the art canvas. Try a browser with Canvas support.",
      ),
    );
    container.replaceChildren(root);
    const cleanup = () => root.remove();
    cleanup.selectPlanet = () => {};
    return cleanup;
  }
  ctx.imageSmoothingEnabled = false;
  const scratch = document.createElement("canvas");
  scratch.width = WIDTH;
  scratch.height = HEIGHT;
  const scratchCtx = scratch.getContext("2d");
  const tools = element("div", "experiment-tools");
  const colorLabel = element("label", "experiment-field");
  colorLabel.append(element("span", "", "Color"));
  const colorSelect = element("select", "experiment-select");
  COLORS.forEach(([name, color]) => {
    const option = element("option", "", name);
    option.value = color;
    colorSelect.append(option);
  });
  colorSelect.addEventListener("change", () => {
    selectedColor = colorSelect.value;
  });
  colorLabel.append(colorSelect);
  const sizeLabel = element("label", "experiment-field");
  const sizeCaption = element("span", "", "Brush size");
  const sizeInput = element("input", "experiment-range");
  sizeInput.type = "range";
  sizeInput.min = "12";
  sizeInput.max = "60";
  sizeInput.step = "4";
  sizeInput.value = String(brushSize);
  sizeInput.setAttribute("aria-label", "Brush size");
  sizeInput.addEventListener("input", () => {
    brushSize = Number(sizeInput.value);
    sizeInput.setAttribute("aria-valuetext", `${brushSize} pixels`);
    requestRender();
  });
  sizeLabel.append(sizeCaption, sizeInput);
  const addButton = button("Add a mark", () => {
    if (pointerId !== null) return;
    const count = pointCount();
    const bounds = visibleBounds();
    const point = {
      x:
        bounds.minX +
        (0.2 + ((count * 0.381966 + 0.5) % 1) * 0.6) *
          (bounds.maxX - bounds.minX),
      y:
        bounds.minY +
        (0.3 + ((count * 0.618034 + 0.37) % 1) * 0.4) *
          (bounds.maxY - bounds.minY),
    };
    keyboardPoint = point;
    addStroke(point);
    finishStroke();
  });
  const undoButton = button("Undo", () => {
    finishStroke();
    states.get(active.id).pop();
    announce("Last stroke removed.");
    requestRender();
  });
  const clearButton = button("Clear", () => {
    finishStroke();
    states.set(active.id, []);
    announce("Canvas cleared. Make something new.");
    requestRender();
  });
  const saveButton = button("Save image", saveImage);
  const status = element("p", "experiment-status", "Your canvas is ready.");
  status.setAttribute("role", "status");
  status.setAttribute("aria-live", "polite");
  const exportDialog = element("dialog", "dialog experiment-export");
  const exportHeading = element("div", "dialog-heading");
  const exportTitle = element("h2", "", "Your image");
  exportTitle.id = `${helpId}-export`;
  exportDialog.setAttribute("aria-labelledby", exportTitle.id);
  const exportClose = button("×", () => exportDialog.close());
  exportClose.className = "dialog-close";
  exportClose.setAttribute("aria-label", "Close image preview");
  exportHeading.append(exportTitle, exportClose);
  const exportImage = element("img", "experiment-export-image");
  exportImage.width = WIDTH;
  exportImage.height = HEIGHT + 48;
  const exportDownload = element(
    "a",
    "button button-primary experiment-download",
    "Download PNG",
  );
  exportDialog.append(
    exportHeading,
    exportImage,
    element(
      "p",
      "",
      "On phones, touch and hold the image if your browser opens it instead.",
    ),
    exportDownload,
  );
  tools.append(
    colorLabel,
    sizeLabel,
    addButton,
    undoButton,
    clearButton,
    saveButton,
  );
  root.append(
    nav,
    heading,
    description,
    canvas,
    tools,
    keyboardHelp,
    status,
    exportDialog,
  );
  container.replaceChildren(root);

  function getBase() {
    if (!bases.has(active.id)) bases.set(active.id, buildBase(active.id));
    return bases.get(active.id);
  }

  function pointCount() {
    return states
      .get(active.id)
      .reduce((total, stroke) => total + stroke.points.length, 0);
  }

  function announce(message) {
    status.textContent = message;
  }

  function visibleBounds() {
    return visibleCanvasBounds(
      canvas.getBoundingClientRect(),
      container.getBoundingClientRect(),
    );
  }

  function clampKeyboardPoint(point, bounds = visibleBounds()) {
    const marginX = Math.min(18 / WIDTH, (bounds.maxX - bounds.minX) / 4);
    const marginY = Math.min(18 / HEIGHT, (bounds.maxY - bounds.minY) / 4);
    return {
      x: Math.max(
        bounds.minX + marginX,
        Math.min(bounds.maxX - marginX, point.x),
      ),
      y: Math.max(
        bounds.minY + marginY,
        Math.min(bounds.maxY - marginY, point.y),
      ),
    };
  }

  function selectExperiment(experiment) {
    finishStroke();
    active = experiment;
    heading.textContent = experiment.name;
    description.textContent = experiment.description;
    choices.forEach((choice, index) =>
      choice.setAttribute(
        "aria-pressed",
        String(EXPERIMENTS[index].id === active.id),
      ),
    );
    colorLabel.hidden = active.id === "solar" || active.id === "redshift";
    addButton.setAttribute(
      "aria-label",
      `Add a mark: ${experiment.action.toLowerCase()}`,
    );
    announce(`${experiment.name}. ${experiment.description}`);
    showCursor = false;
    requestRender();
  }

  function addStroke(point) {
    const strokes = states.get(active.id);
    if (strokes.length >= MAX_STROKES || pointCount() >= MAX_POINTS) {
      announce(
        "This canvas is full. Undo a stroke or clear it to keep creating.",
      );
      return false;
    }
    drawing = { color: selectedColor, size: brushSize, points: [point] };
    strokes.push(drawing);
    if (!discovered) {
      discovered = true;
      onDiscover("museum");
    }
    requestRender();
    return true;
  }

  function appendPoint(point) {
    if (!drawing || pointCount() >= MAX_POINTS) return;
    const previous = drawing.points[drawing.points.length - 1];
    const distance = Math.hypot(
      (point.x - previous.x) * WIDTH,
      (point.y - previous.y) * HEIGHT,
    );
    const spacing =
      active.id === "solar" || active.id === "redshift" || active.id === "prism"
        ? 5
        : Math.max(25, brushSize);
    if (distance < spacing) return;
    drawing.points.push(point);
    requestRender();
  }

  function finishStroke() {
    if (pointerId !== null && canvas.hasPointerCapture(pointerId))
      canvas.releasePointerCapture(pointerId);
    pointerId = null;
    if (!drawing) return;
    drawing = null;
    announce(
      `${active.name}: ${states.get(active.id).length} ${states.get(active.id).length === 1 ? "stroke" : "strokes"}. Your image is ready to save.`,
    );
    requestRender();
  }

  function requestRender() {
    if (frame === null && !disposed)
      frame = requestAnimationFrame(() => {
        frame = null;
        render();
      });
  }

  function renderReveal(strokes) {
    scratchCtx.globalCompositeOperation = "source-over";
    scratchCtx.clearRect(0, 0, WIDTH, HEIGHT);
    starfield(scratchCtx, active.id === "solar" ? 0 : 1);
    scratchCtx.globalAlpha = 0.13;
    scratchCtx.drawImage(getBase(), 0, 0);
    scratchCtx.globalAlpha = 1;
    scratchCtx.globalCompositeOperation = "destination-out";
    scratchCtx.lineCap = "round";
    scratchCtx.lineJoin = "round";
    strokes.forEach((stroke) => {
      scratchCtx.lineWidth = stroke.size * 3;
      scratchCtx.beginPath();
      const first = stroke.points[0];
      scratchCtx.arc(
        first.x * WIDTH,
        first.y * HEIGHT,
        stroke.size * 1.5,
        0,
        Math.PI * 2,
      );
      scratchCtx.fill();
      scratchCtx.beginPath();
      scratchCtx.moveTo(first.x * WIDTH, first.y * HEIGHT);
      stroke.points.forEach((point) =>
        scratchCtx.lineTo(point.x * WIDTH, point.y * HEIGHT),
      );
      scratchCtx.stroke();
    });
    scratchCtx.globalCompositeOperation = "source-over";
    ctx.drawImage(scratch, 0, 0);
  }

  function renderArtwork() {
    ctx.clearRect(0, 0, WIDTH, HEIGHT);
    ctx.drawImage(getBase(), 0, 0);
    const strokes = states.get(active.id);
    if (active.id === "solar" || active.id === "redshift") {
      renderReveal(strokes);
      return;
    }
    let previousStar = null;
    let index = 0;
    strokes.forEach((stroke) => {
      stroke.points.forEach((point) => {
        const x = point.x * WIDTH;
        const y = point.y * HEIGHT;
        const size = stroke.size;
        ctx.strokeStyle = stroke.color;
        ctx.fillStyle = stroke.color;
        ctx.lineWidth = 2;
        if (active.id === "orbit") {
          ctx.globalAlpha = 0.4;
          ctx.beginPath();
          ctx.ellipse(
            480,
            300,
            Math.max(26, Math.abs(x - 480)),
            Math.max(20, Math.abs(y - 300)),
            index * 0.11,
            0,
            Math.PI * 2,
          );
          ctx.stroke();
          ctx.globalAlpha = 1;
          pixel(
            ctx,
            x - size / 5,
            y - size / 5,
            Math.max(5, size / 2.5),
            stroke.color,
          );
        } else if (active.id === "echo") {
          for (let ring = 3; ring > 0; ring -= 1) {
            ctx.globalAlpha = 1 / (ring + 0.5);
            ctx.beginPath();
            ctx.ellipse(
              x,
              y,
              size * ring,
              size * ring * 0.58,
              0,
              0,
              Math.PI * 2,
            );
            ctx.stroke();
          }
          ctx.globalAlpha = 1;
          pixel(ctx, x, y, 4, stroke.color);
        } else if (active.id === "prism") {
          const tile = Math.max(8, Math.round(size / 8) * 8);
          pixel(
            ctx,
            Math.floor(x / tile) * tile,
            Math.floor(y / tile) * tile,
            tile - 2,
            stroke.color,
          );
          ctx.fillStyle = "#ffffff55";
          ctx.fillRect(
            Math.floor(x / tile) * tile + 2,
            Math.floor(y / tile) * tile + 2,
            4,
            4,
          );
        } else if (active.id === "constellation") {
          if (previousStar) {
            ctx.globalAlpha = 0.5;
            ctx.beginPath();
            ctx.moveTo(previousStar.x, previousStar.y);
            ctx.lineTo(x, y);
            ctx.stroke();
            ctx.globalAlpha = 1;
          }
          star(ctx, x, y, size * 0.6, stroke.color);
          previousStar = { x, y };
        } else if (active.id === "garden") {
          const stemHeight = size * 1.25;
          ctx.fillStyle = "#78a18b";
          ctx.fillRect(
            Math.round(x / 4) * 4,
            Math.round(y / 4) * 4,
            4,
            stemHeight,
          );
          pixel(ctx, x - 8, y + stemHeight * 0.55, 8, "#78a18b");
          pixel(ctx, x + 4, y + stemHeight * 0.3, 8, "#78a18b");
          const petal = Math.max(8, Math.round(size / 12) * 4);
          [
            [-1, 0],
            [1, 0],
            [0, -1],
            [0, 1],
          ].forEach(([dx, dy]) =>
            pixel(ctx, x + dx * petal, y + dy * petal, petal, stroke.color),
          );
          pixel(ctx, x, y, petal, "#f5dca4");
        }
        index += 1;
      });
    });
  }

  function render() {
    if (disposed) return;
    renderArtwork();
    if (showCursor) {
      keyboardPoint = clampKeyboardPoint(keyboardPoint);
      ctx.strokeStyle = "#f8e5c5";
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 4]);
      ctx.strokeRect(
        keyboardPoint.x * WIDTH - 14,
        keyboardPoint.y * HEIGHT - 14,
        28,
        28,
      );
      ctx.setLineDash([]);
    }
    const count = pointCount();
    canvas.setAttribute(
      "aria-label",
      `${active.name} artwork, ${count} ${count === 1 ? "mark" : "marks"}. ${active.description}`,
    );
    undoButton.disabled = count === 0;
    clearButton.disabled = count === 0;
  }

  function saveImage() {
    const version = ++exportVersion;
    finishStroke();
    renderArtwork();
    const output = document.createElement("canvas");
    output.width = WIDTH;
    output.height = HEIGHT + 48;
    const outputCtx = output.getContext("2d");
    outputCtx.fillStyle = "#151222";
    outputCtx.fillRect(0, 0, WIDTH, HEIGHT + 48);
    outputCtx.drawImage(canvas, 0, 0);
    outputCtx.fillStyle = "#d2c1c9";
    outputCtx.font = "14px monospace";
    outputCtx.fillText(
      `DIMENSION 3 / ${active.name.toUpperCase()}`,
      24,
      HEIGHT + 30,
    );
    const name = active.id;
    const title = active.name;
    output.toBlob((blob) => {
      if (disposed || version !== exportVersion) return;
      if (!blob) {
        announce("The image could not be saved. Please try again.");
        return;
      }
      if (exportUrl) URL.revokeObjectURL(exportUrl);
      exportUrl = URL.createObjectURL(blob);
      exportImage.src = exportUrl;
      exportImage.alt = `Your ${title} artwork`;
      exportTitle.textContent = `Your ${title}`;
      exportDownload.href = exportUrl;
      exportDownload.download = `dimension-3-${name}.png`;
      if (!exportDialog.open) exportDialog.showModal();
      announce(
        "Your image is ready in the preview. Download it or save it from the image.",
      );
    }, "image/png");
    requestRender();
  }

  canvas.addEventListener("pointerdown", (event) => {
    if (
      pointerId !== null ||
      !event.isPrimary ||
      (event.pointerType === "mouse" && event.button !== 0)
    )
      return;
    showCursor = false;
    const point = normalizePoint(
      event.clientX,
      event.clientY,
      canvas.getBoundingClientRect(),
    );
    if (!addStroke(point)) return;
    pointerId = event.pointerId;
    canvas.setPointerCapture(pointerId);
  });
  canvas.addEventListener("pointermove", (event) => {
    if (event.pointerId !== pointerId) return;
    appendPoint(
      normalizePoint(
        event.clientX,
        event.clientY,
        canvas.getBoundingClientRect(),
      ),
    );
  });
  canvas.addEventListener("pointerup", (event) => {
    if (event.pointerId === pointerId) finishStroke();
  });
  canvas.addEventListener("pointercancel", (event) => {
    if (event.pointerId === pointerId) finishStroke();
  });
  canvas.addEventListener("lostpointercapture", () => finishStroke());
  canvas.addEventListener("keydown", (event) => {
    if (pointerId !== null) return;
    const bounds = visibleBounds();
    keyboardPoint = showCursor
      ? clampKeyboardPoint(keyboardPoint, bounds)
      : {
          x: (bounds.minX + bounds.maxX) / 2,
          y: (bounds.minY + bounds.maxY) / 2,
        };
    const directions = {
      ArrowLeft: [-0.035, 0],
      ArrowRight: [0.035, 0],
      ArrowUp: [0, -0.05],
      ArrowDown: [0, 0.05],
    };
    if (directions[event.key]) {
      event.preventDefault();
      const [dx, dy] = directions[event.key];
      keyboardPoint = clampKeyboardPoint(
        {
          x: keyboardPoint.x + dx * (bounds.maxX - bounds.minX),
          y: keyboardPoint.y + dy * (bounds.maxY - bounds.minY),
        },
        bounds,
      );
      showCursor = true;
      requestRender();
    } else if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      showCursor = true;
      addStroke({ ...keyboardPoint });
      finishStroke();
    }
  });
  canvas.addEventListener("blur", () => {
    showCursor = false;
    requestRender();
  });

  selectExperiment(active);
  render();
  const resizeObserver =
    typeof ResizeObserver === "function"
      ? new ResizeObserver(requestRender)
      : null;
  resizeObserver?.observe(canvas);
  resizeObserver?.observe(container);
  const cleanup = () => {
    disposed = true;
    resizeObserver?.disconnect();
    if (frame !== null) cancelAnimationFrame(frame);
    finishStroke();
    if (exportDialog.open) exportDialog.close();
    if (exportUrl) URL.revokeObjectURL(exportUrl);
    bases.clear();
    states.clear();
    root.remove();
  };
  cleanup.selectPlanet = (index) => {
    if (!disposed) selectExperiment(EXPERIMENTS[planetIndex(index)]);
  };
  return cleanup;
}
