import test from "node:test";
import assert from "node:assert/strict";
import { createSceneTransitions } from "../scene-transitions.js";

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

const flush = () => new Promise((resolve) => setImmediate(resolve));

function setup({ native = true, webAnimations = true, allowed = true } = {}) {
  const markers = new Map();
  const styles = new Map();
  const nativeTransitions = [];
  const animations = [];
  const errors = [];
  const document = {
    documentElement: {
      setAttribute: (name, value) => markers.set(name, value),
      removeAttribute: (name) => markers.delete(name),
      style: {
        setProperty: (name, value) => styles.set(name, value),
        removeProperty: (name) => styles.delete(name),
      },
    },
  };
  if (native) {
    document.startViewTransition = (callback) => {
      const ready = deferred();
      const updated = deferred();
      const finished = deferred();
      const transition = {
        ready: ready.promise,
        updateCallbackDone: updated.promise,
        finished: finished.promise,
        skips: 0,
        skipTransition() {
          this.skips++;
        },
        async update() {
          await callback();
          updated.resolve();
        },
        readyResult: ready,
        finishedResult: finished,
        updatedResult: updated,
      };
      nativeTransitions.push(transition);
      return transition;
    };
  }
  const element = {};
  if (webAnimations) {
    element.animate = (frames, options) => {
      const done = deferred();
      const animation = {
        frames,
        options,
        finished: done.promise,
        done,
        cancelled: false,
        cancel() {
          this.cancelled = true;
          done.reject(new Error("Animation cancelled"));
        },
      };
      animations.push(animation);
      return animation;
    };
  }
  const controller = createSceneTransitions({
    document,
    element,
    canAnimate: () => allowed,
    onError: (error) => errors.push(error),
  });
  return {
    controller,
    document,
    element,
    nativeTransitions,
    animations,
    errors,
    markers,
    styles,
  };
}

function assertCleared(state) {
  assert.equal(state.markers.has("data-scene-transition"), false);
  assert.equal(state.styles.has("--scene-fade-duration"), false);
  assert.ok(state.animations.every((animation) => animation.cancelled));
}

test("native snapshots render once and retain the requested duration until finished", async () => {
  const state = setup();
  let renders = 0;
  const completed = state.controller.run(() => renders++, { duration: 1000 });
  const transition = state.nativeTransitions[0];
  assert.equal(renders, 0);
  assert.equal(state.styles.get("--scene-fade-duration"), "1000ms");
  assert.equal(state.markers.get("data-scene-transition"), "native");
  await transition.update();
  await transition.update();
  assert.equal(renders, 1);
  transition.readyResult.resolve();
  transition.finishedResult.resolve();
  await completed;
  assertCleared(state);
});

test("a later navigation discards the old native update even when skip invokes it late", async () => {
  const state = setup();
  const renders = [];
  const first = state.controller.run(() => renders.push("records"));
  const old = state.nativeTransitions[0];
  const latest = state.controller.run(() => renders.push("museum"));
  const current = state.nativeTransitions[1];
  await first;
  await old.update();
  old.readyResult.reject(new Error("Skipped"));
  old.finishedResult.reject(new Error("Skipped"));
  await flush();
  assert.equal(old.skips, 1);
  assert.deepEqual(renders, []);
  assert.equal(state.markers.get("data-scene-transition"), "native");
  await current.update();
  current.finishedResult.resolve();
  await latest;
  assert.deepEqual(renders, ["museum"]);
  assertCleared(state);
});

test("finish commits pending navigation immediately, while cancel discards it", async () => {
  for (const operation of ["finish", "cancel"]) {
    const state = setup();
    let renders = 0;
    const completed = state.controller.run(() => renders++);
    const transition = state.nativeTransitions[0];
    const stopped = state.controller[operation]();
    assert.equal(renders, operation === "finish" ? 1 : 0);
    await transition.update();
    transition.readyResult.reject(new Error("Skipped"));
    transition.finishedResult.reject(new Error("Skipped"));
    await Promise.all([completed, stopped]);
    assert.equal(renders, operation === "finish" ? 1 : 0);
    assertCleared(state);
  }
});

test("finishing an update already awaiting image decode does not render twice", async () => {
  const state = setup();
  const decoded = deferred();
  let renders = 0;
  const completed = state.controller.run(() => {
    renders++;
    return decoded.promise;
  });
  const updating = state.nativeTransitions[0].update();
  const stopped = state.controller.finish();
  assert.equal(renders, 1);
  assertCleared(state);
  decoded.resolve();
  await Promise.all([completed, stopped, updating]);
  assert.equal(renders, 1);
});

test("initial navigation and reduced motion render synchronously with no animation", async () => {
  for (const options of [
    { setup: { allowed: false }, run: {} },
    { setup: {}, run: { animate: false } },
    { setup: {}, run: { duration: 0 } },
  ]) {
    const state = setup(options.setup);
    let renders = 0;
    const completed = state.controller.run(() => renders++, options.run);
    assert.equal(renders, 1);
    assert.equal(state.nativeTransitions.length, 0);
    assert.equal(state.animations.length, 0);
    await completed;
    assertCleared(state);
  }
});

test("fallback fades out, updates, fades in, then removes all opacity effects", async () => {
  const state = setup({ native: false });
  let renders = 0;
  const completed = state.controller.run(() => renders++);
  assert.equal(renders, 0);
  assert.equal(state.markers.get("data-scene-transition"), "fallback");
  assert.deepEqual(state.animations[0].frames, [
    { opacity: 1 },
    { opacity: 0 },
  ]);
  assert.equal(state.animations[0].options.duration, 350);
  state.animations[0].done.resolve();
  await flush();
  assert.equal(renders, 1);
  assert.deepEqual(state.animations[1].frames, [
    { opacity: 0 },
    { opacity: 1 },
  ]);
  state.animations[1].done.resolve();
  await completed;
  assertCleared(state);
});

test("cancelled fallback never applies its delayed update or clears a newer fade", async () => {
  const state = setup({ native: false });
  const renders = [];
  const first = state.controller.run(() => renders.push("old"));
  const latest = state.controller.run(() => renders.push("new"));
  await first;
  await flush();
  assert.equal(state.animations[0].cancelled, true);
  assert.deepEqual(renders, []);
  assert.equal(state.markers.get("data-scene-transition"), "fallback");
  state.animations[1].done.resolve();
  await flush();
  state.animations[2].done.resolve();
  await latest;
  assert.deepEqual(renders, ["new"]);
  assertCleared(state);
});

test("turning motion off during a fallback commits the destination without leaving it transparent", async () => {
  const state = setup({ native: false });
  let renders = 0;
  const completed = state.controller.run(() => renders++);
  const stopped = state.controller.finish();
  assert.equal(renders, 1);
  await Promise.all([completed, stopped]);
  assert.equal(state.animations.length, 1);
  assertCleared(state);
});

test("native snapshot failure uses fallback and suppresses its delayed native callback", async () => {
  const state = setup();
  let renders = 0;
  const completed = state.controller.run(() => renders++);
  const transition = state.nativeTransitions[0];
  transition.readyResult.reject(new Error("Snapshot unavailable"));
  transition.updatedResult.reject(new Error("Skipped"));
  transition.finishedResult.reject(new Error("Skipped"));
  await flush();
  assert.equal(state.animations.length, 1);
  await transition.update();
  assert.equal(renders, 0);
  state.animations[0].done.resolve();
  await flush();
  assert.equal(renders, 1);
  state.animations[1].done.resolve();
  await completed;
  assert.equal(renders, 1);
  assertCleared(state);
});

test("native failure after rendering only fades the destination in", async () => {
  const state = setup();
  let renders = 0;
  const completed = state.controller.run(() => renders++);
  const transition = state.nativeTransitions[0];
  await transition.update();
  transition.readyResult.reject(new Error("Duplicate snapshot name"));
  await flush();
  assert.equal(state.animations.length, 1);
  assert.deepEqual(state.animations[0].frames, [
    { opacity: 0 },
    { opacity: 1 },
  ]);
  state.animations[0].done.resolve();
  await completed;
  assert.equal(renders, 1);
  assertCleared(state);
});

test("unavailable or throwing animation APIs still render the destination", async () => {
  for (const method of ["missing", "native-throws", "fallback-throws"]) {
    const state = setup({
      native: method === "native-throws",
      webAnimations: method === "fallback-throws",
    });
    if (method === "native-throws")
      state.document.startViewTransition = () => {
        throw new Error("Unsupported document state");
      };
    if (method === "fallback-throws")
      state.element.animate = () => {
        throw new Error("Animation unavailable");
      };
    let renders = 0;
    await state.controller.run(() => renders++);
    assert.equal(renders, 1);
    assertCleared(state);
  }
});

test("failed opacity animation clears its effects and still commits navigation", async () => {
  const state = setup({ native: false });
  let renders = 0;
  const completed = state.controller.run(() => renders++);
  state.animations[0].done.reject(new Error("Animation interrupted"));
  await completed;
  assert.equal(renders, 1);
  assert.equal(state.errors.length, 1);
  assertCleared(state);
});

test("throwing or rejected room updates cannot leave the fallback faded out", async () => {
  for (const asynchronous of [false, true]) {
    const state = setup({ native: false });
    let renders = 0;
    const failure = new Error("Room update failed");
    const completed = state.controller.run(() => {
      renders++;
      if (asynchronous) return Promise.reject(failure);
      throw failure;
    });
    state.animations[0].done.resolve();
    await flush();
    state.animations[1].done.resolve();
    await completed;
    assert.equal(renders, 1);
    assert.deepEqual(state.errors, [failure]);
    assertCleared(state);
  }
});

test("a live outgoing layer keeps its media active over the rendered destination until the full fade finishes", async () => {
  const state = setup();
  const decoded = deferred();
  const layer = Object.assign(state.element, {
    hidden: false,
    videoPlaying: true,
    canvasRunning: true,
  });
  let rendered = false;
  let cleanups = 0;
  const completed = state.controller.run(
    () => {
      rendered = true;
      return decoded.promise;
    },
    {
      duration: 1200,
      liveElement: layer,
      onFinish() {
        cleanups++;
        layer.hidden = true;
        layer.videoPlaying = false;
        layer.canvasRunning = false;
      },
    },
  );
  assert.equal(rendered, true);
  assert.equal(state.markers.get("data-scene-transition"), "live");
  assert.equal(state.nativeTransitions.length, 0);
  assert.equal(state.animations.length, 0);
  assert.equal(layer.hidden, false);
  assert.equal(layer.videoPlaying, true);
  assert.equal(layer.canvasRunning, true);
  decoded.resolve();
  await flush();
  assert.deepEqual(state.animations[0].frames, [
    { opacity: 1 },
    { opacity: 0 },
  ]);
  assert.equal(state.animations[0].options.duration, 1200);
  assert.equal(layer.hidden, false);
  assert.equal(layer.videoPlaying, true);
  assert.equal(layer.canvasRunning, true);
  assert.equal(cleanups, 0);
  state.animations[0].done.resolve();
  await completed;
  assert.equal(layer.hidden, true);
  assert.equal(layer.videoPlaying, false);
  assert.equal(layer.canvasRunning, false);
  assert.equal(cleanups, 1);
  assertCleared(state);
});

test("cancelling or finishing a live fade hides the outgoing layer before removing its opacity effect", async () => {
  for (const operation of ["cancel", "finish"]) {
    const state = setup();
    const layer = Object.assign(state.element, { hidden: false });
    let cleanups = 0;
    const completed = state.controller.run(() => {}, {
      liveElement: layer,
      onFinish() {
        cleanups++;
        layer.hidden = true;
      },
    });
    await flush();
    const animation = state.animations[0];
    const cancelAnimation = animation.cancel.bind(animation);
    animation.cancel = () => {
      assert.equal(layer.hidden, true);
      cancelAnimation();
    };
    const stopped = state.controller[operation]();
    assert.equal(layer.hidden, true);
    assert.equal(cleanups, 1);
    await Promise.all([completed, stopped]);
    await state.controller.cancel();
    await state.controller.finish();
    assert.equal(cleanups, 1);
    assertCleared(state);
  }
});

test("superseding a live fade while its poster is pending cleans it without altering the newer transition", async () => {
  const state = setup();
  const decoded = deferred();
  let cleanups = 0;
  const first = state.controller.run(() => decoded.promise, {
    liveElement: state.element,
    onFinish: () => cleanups++,
  });
  const latest = state.controller.run(() => {});
  assert.equal(cleanups, 1);
  assert.equal(state.markers.get("data-scene-transition"), "native");
  decoded.resolve();
  await first;
  await flush();
  assert.equal(cleanups, 1);
  assert.equal(state.animations.length, 0);
  assert.equal(state.markers.get("data-scene-transition"), "native");
  const transition = state.nativeTransitions[0];
  await transition.update();
  transition.finishedResult.resolve();
  await latest;
  assertCleared(state);
});

test("finish cleans a live outgoing layer immediately even while poster decode is pending", async () => {
  const state = setup();
  const decoded = deferred();
  let renders = 0;
  let cleanups = 0;
  const completed = state.controller.run(
    () => {
      renders++;
      return decoded.promise;
    },
    {
      liveElement: state.element,
      onFinish: () => cleanups++,
    },
  );
  const stopped = state.controller.finish();
  assert.equal(renders, 1);
  assert.equal(cleanups, 1);
  assertCleared(state);
  decoded.resolve();
  await Promise.all([completed, stopped]);
  assert.equal(cleanups, 1);
  assert.equal(state.animations.length, 0);
});

test("reduced motion, disabled animation and missing live animation APIs clean the layer synchronously", async () => {
  for (const options of [
    { setup: { allowed: false }, run: {} },
    { setup: {}, run: { animate: false } },
    { setup: { webAnimations: false }, run: {} },
  ]) {
    const state = setup(options.setup);
    const decoded = deferred();
    const events = [];
    const completed = state.controller.run(
      () => {
        events.push("render");
        return decoded.promise;
      },
      {
        ...options.run,
        liveElement: state.element,
        onFinish: () => events.push("cleanup"),
      },
    );
    assert.deepEqual(events, ["render", "cleanup"]);
    assert.equal(state.nativeTransitions.length, 0);
    assert.equal(state.animations.length, 0);
    decoded.resolve();
    await completed;
    assertCleared(state);
  }
});

test("live animation failures clean once and never leave an outgoing layer blocking the destination", async () => {
  for (const failure of ["throw", "reject"]) {
    const state = setup();
    const error = new Error("Live animation interrupted");
    if (failure === "throw") {
      state.element.animate = () => {
        throw error;
      };
    }
    let cleanups = 0;
    const completed = state.controller.run(() => {}, {
      liveElement: state.element,
      onFinish: () => cleanups++,
    });
    await flush();
    if (failure === "reject") state.animations[0].done.reject(error);
    await completed;
    assert.equal(cleanups, 1);
    assert.deepEqual(state.errors, [error]);
    assertCleared(state);
  }
});

test("cleanup runs only for applied updates, with callback failures safely observed", async () => {
  const state = setup();
  let cleanups = 0;
  const notApplied = state.controller.run(() => {}, {
    onFinish: () => cleanups++,
  });
  await state.controller.cancel();
  await notApplied;
  await state.nativeTransitions[0].update();
  assert.equal(cleanups, 0);
  for (const asynchronous of [false, true]) {
    const error = new Error("Cleanup failed");
    await state.controller.run(() => {}, {
      animate: false,
      liveElement: state.element,
      onFinish() {
        cleanups++;
        if (asynchronous) return Promise.reject(error);
        throw error;
      },
    });
    assert.ok(state.errors.includes(error));
  }
  assert.equal(cleanups, 2);
  assertCleared(state);
});
