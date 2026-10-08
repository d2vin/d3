import assert from "node:assert/strict";
import test from "node:test";
import {
  EXPERIMENTS,
  mountMuseum,
  normalizePoint,
  visibleCanvasBounds,
} from "../museum.js";

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
  let frameId = 0;
  const noop = () => {};
  const context = new Proxy(
    {},
    {
      get: (target, key) => {
        if (key === "arc") return (...args) => arcs.push(args);
        if (key === "strokeRect") return (...args) => cursors.push(args);
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
      this.style = { setProperty: noop };
      this.dataset = {};
      this.textContent = "";
      this.captures = new Set();
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
  globalThis.document = { createElement: (tag) => new Element(tag) };
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
  const cleanup = mountMuseum(container);
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
  assert.equal(harness.arcs.length, 8);
  assert.ok(harness.arcs.every(([x]) => x >= 320 && x <= 640));
  for (let i = 0; i < 100; i += 1)
    ui.canvas.emit("keydown", { key: "ArrowLeft" });
  ui.canvas.emit("keydown", { key: "Enter" });
  harness.flush();
  const cursor = harness.cursors.at(-1);
  assert.ok(cursor[0] >= 320 && cursor[0] + cursor[2] <= 640);
  ui.canvas.emit("pointerdown", {
    isPrimary: true,
    pointerType: "touch",
    pointerId: 5,
    clientX: 120,
    clientY: 250,
  });
  ui.canvas.emit("pointerup", { pointerId: 5 });
  harness.flush();
  const mark = harness.arcs.at(-1);
  assert.equal(mark[0], 416);
  assert.equal(mark[1], 200);
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
  t.after(cleanup);
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
  assert.match(ui.canvas.attributes["aria-label"], /3 marks\./);
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
