import assert from "node:assert/strict";
import test from "node:test";
import {
  EXPERIMENTS,
  mountMuseum,
  normalizePoint,
  visibleCanvasBounds,
} from "../museum.js";
import {
  jaggedCirclePath,
  jaggedCirclePoints,
  cutoutRadius,
} from "../legacy-painting.js";

// A deliberately small DOM/canvas adapter checks interaction state and teardown.
// Pixel output, layout, native touch handling and real downloads need browser checks.
function installDOM(t) {
  const originalDocument = globalThis.document;
  const originalRequest = globalThis.requestAnimationFrame;
  const originalCancel = globalThis.cancelAnimationFrame;
  const originalRevoke = URL.revokeObjectURL;
  const frames = new Map();
  const downloads = [];
  const revokedUrls = [];
  const arcs = [];
  const cursors = [];
  const moves = [];
  const drawnImages = [];
  let frameId = 0;
  const noop = () => {};
  const context = new Proxy(
    {},
    {
      get: (target, key) => {
        if (key === "arc") return (...args) => arcs.push(args);
        if (key === "strokeRect") return (...args) => cursors.push(args);
        if (key === "moveTo") return (...args) => moves.push(args);
        if (key === "drawImage") return (...args) => drawnImages.push(args);
        return target[key] || noop;
      },
      set: (target, key, value) => {
        target[key] = value;
        return true;
      },
    },
  );
  class Element {
    constructor(tag) {
      this.tagName = tag;
      this.children = [];
      this.attributes = {};
      this.listeners = {};
      this.style = {
        setProperty: (name, value) => {
          this.style[name] = value;
        },
      };
      this.dataset = {};
      this.textContent = "";
      this.captures = new Set();
      this.complete = true;
      this.naturalWidth = 1137;
    }
    append(...nodes) {
      nodes.forEach((node) => {
        node.parent = this;
        this.children.push(node);
      });
    }
    replaceChildren(...nodes) {
      this.children = [];
      this.append(...nodes);
    }
    setAttribute(name, value) {
      this.attributes[name] = value;
    }
    addEventListener(name, fn) {
      (this.listeners[name] ||= []).push(fn);
    }
    emit(name, values = {}) {
      (this.listeners[name] || []).forEach((fn) =>
        fn({ preventDefault: noop, ...values }),
      );
    }
    click() {
      if (!this.disabled) this.emit("click");
      if (this.download) downloads.push(this.download);
    }
    getContext() {
      return context;
    }
    getBoundingClientRect() {
      return { left: 20, top: 30, width: 480, height: 300 };
    }
    setPointerCapture(id) {
      this.captures.add(id);
    }
    hasPointerCapture(id) {
      return this.captures.has(id);
    }
    releasePointerCapture(id) {
      this.captures.delete(id);
    }
    toBlob(callback) {
      callback(new Blob(["test image"]));
    }
    showModal() {
      this.open = true;
    }
    close() {
      this.open = false;
    }
    remove() {
      if (this.parent)
        this.parent.children = this.parent.children.filter(
          (node) => node !== this,
        );
    }
  }
  globalThis.document = {
    createElement: (tag) => new Element(tag),
    createElementNS: (_, tag) => new Element(tag),
  };
  globalThis.requestAnimationFrame = (fn) => {
    frames.set(++frameId, fn);
    return frameId;
  };
  globalThis.cancelAnimationFrame = (id) => frames.delete(id);
  URL.revokeObjectURL = (url) => {
    revokedUrls.push(url);
    originalRevoke(url);
  };
  t.after(() => {
    globalThis.document = originalDocument;
    globalThis.requestAnimationFrame = originalRequest;
    globalThis.cancelAnimationFrame = originalCancel;
    URL.revokeObjectURL = originalRevoke;
  });
  const flatten = (node) => [node, ...node.children.flatMap(flatten)];
  return {
    container: () => new Element("div"),
    nodes: flatten,
    frames,
    downloads,
    revokedUrls,
    arcs,
    cursors,
    moves,
    drawnImages,
    flush() {
      for (const [id, fn] of [...frames]) {
        frames.delete(id);
        fn();
      }
    },
  };
}

function controls(harness, container) {
  const nodes = harness.nodes(container);
  return {
    planets: nodes.filter((node) => node.className === "experiment-planet"),
    canvas: nodes.find((node) => node.tagName === "canvas"),
    cutout: nodes.find((node) => node.tagName === "path"),
    legacy: nodes.find((node) => node.tagName === "svg"),
    images: nodes.filter((node) => node.tagName === "image"),
    size: nodes.find((node) => node.className === "experiment-range"),
    title: nodes.find((node) => node.className === "experiment-title"),
    button: (label) =>
      nodes.find(
        (node) => node.tagName === "button" && node.textContent === label,
      ),
    status: nodes.find((node) => node.className === "experiment-status"),
  };
}

test("pointer coordinates scale with the displayed canvas and clamp outside its edges", () => {
  const rect = { left: 20, top: 30, width: 480, height: 300 };
  assert.deepEqual(normalizePoint(260, 180, rect), { x: 0.5, y: 0.5 });
  assert.deepEqual(normalizePoint(-100, 10000, rect), { x: 0, y: 1 });
  assert.deepEqual(normalizePoint(10000, -100, rect), { x: 1, y: 0 });
  assert.deepEqual(
    normalizePoint(0, 0, { left: 0, top: 0, width: 0, height: 0 }),
    { x: 0, y: 0 },
  );
});

test("the initial planet is selected and untrusted indexes have a valid fallback", (t) => {
  const harness = installDOM(t);
  for (const [initialPlanet, expected] of [
    [undefined, 0],
    [4, 4],
    [-2, 0],
    [99, 6],
    [2.8, 2],
    [NaN, 0],
    [Infinity, 0],
    ["4", 0],
  ]) {
    const container = harness.container();
    const cleanup = mountMuseum(container, { initialPlanet });
    const ui = controls(harness, container);
    assert.equal(ui.title.textContent, EXPERIMENTS[expected].name);
    assert.equal(ui.planets[expected].attributes["aria-pressed"], "true");
    assert.equal(
      ui.planets.filter((node) => node.attributes["aria-pressed"] === "true")
        .length,
      1,
    );
    cleanup();
  }
});

test("the selection API reopens a preserved planet without losing its drawing", (t) => {
  const harness = installDOM(t);
  const container = harness.container();
  const cleanup = mountMuseum(container);
  const ui = controls(harness, container);
  ui.button("Add a mark").click();
  cleanup.selectPlanet(6);
  harness.flush();
  assert.equal(ui.title.textContent, "Night garden");
  assert.match(ui.canvas.attributes["aria-label"], /0 marks\./);
  ui.button("Add a mark").click();
  cleanup.selectPlanet(0);
  harness.flush();
  assert.match(ui.canvas.attributes["aria-label"], /1 mark\./);
  cleanup.selectPlanet(100);
  harness.flush();
  assert.equal(ui.title.textContent, "Night garden");
  assert.match(ui.canvas.attributes["aria-label"], /1 mark\./);
  cleanup();
  assert.doesNotThrow(() => cleanup.selectPlanet(0));
  assert.equal(harness.frames.size, 0);
});

test("synthetic and keyboard marks stay in the visible crop while pointer coordinates remain exact", (t) => {
  const harness = installDOM(t);
  const container = harness.container();
  const frame = { left: 0, top: 0, width: 400, height: 750 };
  const canvasRect = { left: -400, top: 0, width: 1200, height: 750 };
  container.getBoundingClientRect = () => frame;
  const cleanup = mountMuseum(container, { reducedMotion: true });
  const ui = controls(harness, container);
  ui.canvas.getBoundingClientRect = () => canvasRect;
  assert.deepEqual(visibleCanvasBounds(canvasRect, frame), {
    minX: 1 / 3,
    maxX: 2 / 3,
    minY: 0,
    maxY: 1,
  });
  for (let i = 0; i < 8; i += 1) ui.button("Add a mark").click();
  harness.flush();
  const circles = ui.cutout.attributes.d.split("Z").filter(Boolean);
  assert.equal(circles.length, 8);
  for (const circle of circles) {
    const xs = [...circle.matchAll(/[ML]([\d.-]+),/g)].map((match) =>
      Number(match[1]),
    );
    const center = (Math.max(...xs) + Math.min(...xs)) / 2;
    assert.ok(center >= 1137 / 3 && center <= (1137 * 2) / 3);
  }
  ui.button("Clear").click();
  for (let i = 0; i < 100; i += 1)
    ui.canvas.emit("keydown", { key: "ArrowLeft" });
  ui.canvas.emit("keydown", { key: "Enter" });
  ui.canvas.emit("blur");
  harness.flush();
  assert.equal(
    ui.cutout.attributes.d,
    jaggedCirclePath(1137 / 3 + 18, 796 / 2, 40),
  );
  ui.button("Clear").click();
  ui.canvas.emit("pointerdown", {
    isPrimary: true,
    pointerType: "touch",
    pointerId: 5,
    clientX: 120,
    clientY: 250,
  });
  ui.canvas.emit("pointerup", { pointerId: 5 });
  harness.flush();
  assert.equal(
    ui.cutout.attributes.d,
    jaggedCirclePath((1137 * 520) / 1200, 796 / 3, 40),
  );
  cleanup();
});

test("all seven experiments retain artwork, support touch and keyboard, and undo whole strokes", (t) => {
  const harness = installDOM(t);
  const container = harness.container();
  let discoveries = 0;
  const cleanup = mountMuseum(container, {
    onDiscover: (id) => {
      assert.equal(id, "museum");
      discoveries += 1;
    },
  });
  const ui = controls(harness, container);
  assert.equal(ui.planets.length, 7);
  for (const planet of ui.planets) {
    planet.click();
    ui.button("Add a mark").click();
    harness.flush();
    assert.match(ui.canvas.attributes["aria-label"], /1 mark\./);
  }
  assert.equal(discoveries, 1);
  ui.planets[0].click();
  harness.flush();
  assert.match(ui.canvas.attributes["aria-label"], /1 mark\./);
  ui.canvas.emit("pointerdown", {
    isPrimary: true,
    pointerType: "touch",
    pointerId: 9,
    clientX: 50,
    clientY: 80,
  });
  ui.canvas.emit("pointermove", { pointerId: 9, clientX: 350, clientY: 230 });
  ui.canvas.emit("pointerup", { pointerId: 9 });
  harness.flush();
  assert.match(ui.canvas.attributes["aria-label"], /2 marks\./);
  assert.equal(ui.canvas.captures.size, 0);
  ui.button("Undo").click();
  harness.flush();
  assert.match(ui.canvas.attributes["aria-label"], /1 mark\./);
  ui.canvas.emit("keydown", { key: "ArrowLeft" });
  ui.canvas.emit("keydown", { key: "Enter" });
  harness.flush();
  assert.match(ui.canvas.attributes["aria-label"], /2 marks\./);
  ui.button("Clear").click();
  harness.flush();
  assert.match(ui.canvas.attributes["aria-label"], /0 marks\./);
  assert.equal(ui.button("Undo").disabled, true);
  assert.equal(ui.button("Clear").disabled, true);
  cleanup();
});

test("the original circle uses 64 grid-snapped right-angle steps and bounded sizes", () => {
  const points = jaggedCirclePoints(100, 100, 40);
  assert.equal(points.length, 129);
  assert.deepEqual(points[0], { x: 140, y: 100 });
  assert.deepEqual(points.at(-1), points[0]);
  for (let i = 0; i < points.length; i += 1) {
    assert.equal(points[i].x % 5, 0);
    assert.equal(points[i].y % 5, 0);
    if (i)
      assert.ok(
        points[i].x === points[i - 1].x || points[i].y === points[i - 1].y,
      );
  }
  assert.deepEqual(
    [-100, 10, 45, 100, 200, NaN].map(cutoutRadius),
    [10, 10, 45, 100, 100, 40],
  );
});

test("yellow hover previews clear on leave, stamps persist, and wheel/slider/keys control their size", (t) => {
  const harness = installDOM(t);
  const container = harness.container();
  const cleanup = mountMuseum(container, { reducedMotion: true });
  const ui = controls(harness, container);
  assert.equal(ui.canvas.width, 1137);
  assert.equal(ui.canvas.height, 796);
  assert.equal(ui.size.value, "40");
  const point = {
    clientX: 260,
    clientY: 180,
    pointerType: "mouse",
    pointerId: 1,
  };
  ui.canvas.emit("pointermove", point);
  harness.flush();
  assert.equal(ui.cutout.attributes.d, jaggedCirclePath(568.5, 398, 40));
  assert.match(ui.canvas.attributes["aria-label"], /0 marks\./);
  ui.canvas.emit("pointerleave");
  harness.flush();
  assert.equal(ui.cutout.attributes.d, "");
  ui.canvas.emit("wheel", { deltaY: -1 });
  assert.equal(ui.size.value, "45");
  ui.canvas.emit("pointerdown", { ...point, isPrimary: true, button: 0 });
  ui.canvas.emit("pointermove", { ...point, clientX: 400 });
  ui.canvas.emit("pointerup", { pointerId: 1 });
  ui.canvas.emit("pointerleave");
  harness.flush();
  assert.equal(ui.cutout.attributes.d, jaggedCirclePath(568.5, 398, 45));
  assert.match(ui.canvas.attributes["aria-label"], /1 mark\./);
  for (let i = 0; i < 20; i += 1) ui.canvas.emit("wheel", { deltaY: 1 });
  assert.equal(ui.size.value, "10");
  for (let i = 0; i < 30; i += 1) ui.canvas.emit("keydown", { key: "+" });
  assert.equal(ui.size.value, "100");
  ui.canvas.emit("keydown", { key: "-" });
  assert.equal(ui.size.value, "95");
  ui.size.value = "65";
  ui.size.emit("input");
  assert.equal(ui.size.attributes["aria-valuetext"], "65 pixels");
  cleanup();
});

test("red keeps tiny dots while hue changes through mouse, touch controls and keyboard", (t) => {
  const harness = installDOM(t);
  const container = harness.container();
  const cleanup = mountMuseum(container, {
    initialPlanet: 1,
    reducedMotion: true,
  });
  const ui = controls(harness, container);
  assert.equal(ui.size.parent.hidden, true);
  ui.canvas.emit("wheel", { deltaY: -1 });
  ui.canvas.emit("keydown", { key: "+" });
  ui.canvas.emit("pointerdown", {
    isPrimary: true,
    pointerType: "touch",
    pointerId: 1,
    clientX: 260,
    clientY: 180,
  });
  ui.canvas.emit("pointerup", { pointerId: 1 });
  harness.flush();
  assert.equal(ui.cutout.attributes.d, jaggedCirclePath(568.5, 398, 10));
  ui.canvas.emit("contextmenu");
  assert.equal(ui.legacy.style.filter, "hue-rotate(30deg)");
  ui.button("Hue").click();
  assert.equal(ui.legacy.style.filter, "hue-rotate(60deg)");
  ui.canvas.emit("keydown", { key: "h" });
  assert.equal(ui.legacy.style.filter, "hue-rotate(90deg)");
  for (let i = 0; i < 9; i += 1) ui.button("Hue").click();
  assert.equal(ui.legacy.style.filter, "hue-rotate(0deg)");
  cleanup();
});

test("animated original art swaps to stills and its jiggle pauses when hidden or motion is off", (t) => {
  const harness = installDOM(t);
  const container = harness.container();
  const cleanup = mountMuseum(container);
  const ui = controls(harness, container);
  assert.deepEqual(
    ui.images.map((image) => image.attributes.href),
    ["./yellowplanet1.gif", "./yellowbackground.gif"],
  );
  ui.button("Add a mark").click();
  harness.flush();
  assert.equal(
    harness.frames.size,
    1,
    "the original jiggle keeps one animation frame",
  );
  cleanup.setActive(false);
  harness.flush();
  assert.equal(harness.frames.size, 0);
  cleanup.setActive(true);
  harness.flush();
  assert.equal(harness.frames.size, 1);
  cleanup.setReducedMotion(true);
  harness.flush();
  assert.equal(harness.frames.size, 0);
  assert.deepEqual(
    ui.images.map((image) => image.attributes.href),
    ["./assets/yellow-planet.webp", "./assets/yellow-room.webp"],
  );
  cleanup.selectPlanet(1);
  assert.equal(ui.images[0].attributes.href, "./assets/red-planet.webp");
  cleanup.setReducedMotion(false);
  assert.equal(ui.images[0].attributes.href, "./redplanet1.gif");
  harness.flush();
  assert.equal(harness.frames.size, 1);
  cleanup.selectPlanet(2);
  harness.flush();
  assert.equal(
    harness.frames.size,
    0,
    "other experiments do not run the cutout animation",
  );
  assert.equal(ui.canvas.width, 960);
  assert.equal(ui.canvas.height, 600);
  cleanup.selectPlanet(0);
  cleanup();
  assert.equal(harness.frames.size, 0);
  assert.equal(container.children.length, 0);
  cleanup.setActive(true);
  cleanup.setReducedMotion(false);
  assert.equal(harness.frames.size, 0);
});

test("legacy PNGs use original artwork dimensions and include stamps without the hover preview", (t) => {
  const harness = installDOM(t);
  const container = harness.container();
  const cleanup = mountMuseum(container, { reducedMotion: true });
  const ui = controls(harness, container);
  ui.button("Add a mark").click();
  ui.canvas.emit("pointermove", {
    clientX: 100,
    clientY: 100,
    pointerType: "mouse",
  });
  harness.flush();
  assert.equal(ui.cutout.attributes.d.split("Z").filter(Boolean).length, 2);
  ui.button("Hue").click();
  ui.button("Save image").click();
  assert.equal(
    harness.moves.length,
    1,
    "only the permanent circle enters the PNG clip path",
  );
  const drawn = harness.drawnImages.map(([source]) => source);
  assert.equal(drawn[0].src, "./assets/yellow-planet.webp");
  assert.equal(drawn[1].src, "./assets/yellow-room.webp");
  const image = harness
    .nodes(container)
    .find((node) => node.className === "experiment-export-image");
  assert.equal(image.width, 1137);
  assert.equal(image.height, 844);
  assert.equal(image.alt, "Your Yellow planet artwork");
  assert.equal(ui.canvas.getContext("2d").filter, "hue-rotate(30deg)");
  cleanup();
});

test("the legacy jiggle updates only every ten frames and is removed with reduced motion", (t) => {
  const harness = installDOM(t);
  const container = harness.container();
  const originalRandom = Math.random;
  Math.random = () => 0.75;
  const cleanup = mountMuseum(container);
  try {
    const ui = controls(harness, container);
    ui.button("Add a mark").click();
    harness.flush();
    const still = ui.cutout.attributes.d;
    for (let i = 0; i < 8; i += 1) harness.flush();
    assert.equal(ui.cutout.attributes.d, still);
    harness.flush();
    assert.equal(
      ui.cutout.attributes.d,
      jaggedCirclePath(568.5 + 1, 796 * 0.448 + 1, 40),
    );
    cleanup.setReducedMotion(true);
    harness.flush();
    assert.equal(ui.cutout.attributes.d, still);
    assert.equal(harness.frames.size, 0);
  } finally {
    cleanup();
    Math.random = originalRandom;
  }
});

test("the other experiments still draw continuous strokes and undo each gesture together", (t) => {
  const harness = installDOM(t);
  const container = harness.container();
  const cleanup = mountMuseum(container, { initialPlanet: 4 });
  const ui = controls(harness, container);
  ui.canvas.emit("pointerdown", {
    isPrimary: true,
    pointerType: "touch",
    pointerId: 7,
    clientX: 80,
    clientY: 100,
  });
  ui.canvas.emit("pointermove", { pointerId: 7, clientX: 200, clientY: 160 });
  ui.canvas.emit("pointermove", { pointerId: 7, clientX: 400, clientY: 220 });
  ui.canvas.emit("pointerup", { pointerId: 7 });
  harness.flush();
  assert.match(ui.canvas.attributes["aria-label"], /3 marks\./);
  ui.button("Undo").click();
  harness.flush();
  assert.match(ui.canvas.attributes["aria-label"], /0 marks\./);
  cleanup();
});

test("drawing is bounded, export previews a downloadable PNG, and cleanup releases resources", (t) => {
  const harness = installDOM(t);
  const container = harness.container();
  const cleanup = mountMuseum(container, { initialPlanet: 6 });
  const ui = controls(harness, container);
  for (let i = 0; i < 150; i += 1) ui.button("Add a mark").click();
  harness.flush();
  assert.match(ui.canvas.attributes["aria-label"], /90 marks\./);
  assert.match(ui.status.textContent, /canvas is full/);
  ui.button("Save image").click();
  const nodes = harness.nodes(container);
  const preview = nodes.find(
    (node) => node.className === "dialog experiment-export",
  );
  const image = nodes.find(
    (node) => node.className === "experiment-export-image",
  );
  const download = nodes.find(
    (node) => node.className === "button button-primary experiment-download",
  );
  assert.equal(preview.open, true);
  assert.match(image.src, /^blob:/);
  assert.equal(image.alt, "Your Night garden artwork");
  assert.equal(download.href, image.src);
  assert.equal(download.download, "dimension-3-garden.png");
  assert.deepEqual(
    harness.downloads,
    [],
    "saving opens a preview without forcing a download",
  );
  download.click();
  assert.deepEqual(harness.downloads, ["dimension-3-garden.png"]);
  const oldUrl = image.src;
  preview.close();
  ui.button("Save image").click();
  assert.notEqual(image.src, oldUrl);
  assert.deepEqual(harness.revokedUrls, [oldUrl]);
  const finalUrl = image.src;
  assert.ok(harness.frames.size > 0);
  cleanup();
  assert.equal(preview.open, false);
  assert.deepEqual(harness.revokedUrls, [oldUrl, finalUrl]);
  assert.equal(container.children.length, 0);
  assert.equal(harness.frames.size, 0);
});
