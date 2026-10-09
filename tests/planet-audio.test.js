import test from "node:test";
import assert from "node:assert/strict";
import { createPlanetAudio, PLANET_SOUNDS } from "../planet-audio.js";

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

async function flush() {
  await new Promise((resolve) => setImmediate(resolve));
}

function setup() {
  const fetches = [];
  const decodes = [];
  const sources = [];
  const errors = [];
  const playing = [];
  let contextCount = 0;
  let resumeCount = 0;
  const context = {
    state: "suspended",
    destination: {},
    resume() {
      resumeCount++;
      this.state = "running";
      return Promise.resolve();
    },
    decodeAudioData(data) {
      decodes.push(data);
      return Promise.resolve({ data });
    },
    createBufferSource() {
      const source = {
        buffer: null,
        loop: null,
        starts: 0,
        stops: 0,
        disconnected: false,
        connect(destination) {
          assert.equal(destination, context.destination);
        },
        disconnect() {
          this.disconnected = true;
        },
        start(when) {
          assert.equal(when, 0);
          this.starts++;
        },
        stop() {
          this.stops++;
        },
      };
      sources.push(source);
      return source;
    },
  };
  const fetchResponses = new Map();
  const controller = createPlanetAudio({
    createContext() {
      contextCount++;
      return context;
    },
    fetchAudio(url) {
      fetches.push(url);
      return (
        fetchResponses.get(url) ||
        Promise.resolve({
          ok: true,
          arrayBuffer: () => Promise.resolve(url),
        })
      );
    },
    onError: (error) => errors.push(error),
    onPlaying: (index, active) => playing.push([index, active]),
  });
  return {
    controller,
    context,
    fetches,
    fetchResponses,
    decodes,
    sources,
    errors,
    playing,
    contextCount: () => contextCount,
    resumeCount: () => resumeCount,
  };
}

test("hotspots retain the original planet sound mapping", () => {
  assert.deepEqual(PLANET_SOUNDS, [
    "planet-3.mp3",
    "planet-6.mp3",
    "planet-4.mp3",
    "planet-5.mp3",
    "planet-2.mp3",
    "planet-7.mp3",
    "planet-8.mp3",
  ]);
});

test("audio stays lazy and silent until enabled and unlocked by a gesture", async () => {
  const state = setup();
  assert.equal(await state.controller.unlock(), false);
  assert.equal(state.controller.play(0), false);
  state.controller.setEnabled(true);
  assert.equal(state.controller.play(0), false);
  assert.equal(state.contextCount(), 0);
  assert.deepEqual(state.fetches, []);

  const unlocking = state.controller.unlock();
  assert.equal(state.contextCount(), 1);
  assert.equal(state.resumeCount(), 1);
  assert.equal(await unlocking, true);
  assert.equal(state.controller.play(0), true);
  assert.equal(state.controller.play(-1), false);
  assert.equal(state.controller.play(7), false);
  assert.equal(state.controller.play(1.5), false);
  await flush();
  assert.deepEqual(state.fetches, ["planet-3.mp3"]);
  assert.equal(state.sources[0].starts, 1);
  assert.equal(state.sources[0].loop, false);
});

test("a tap queues its clip while the gesture's audio resume is pending", async () => {
  const state = setup();
  const resume = deferred();
  state.context.resume = () => resume.promise;
  state.controller.setEnabled(true);
  const unlocking = state.controller.unlock();
  assert.equal(state.controller.play(1), true);
  await flush();
  assert.deepEqual(state.fetches, []);
  state.context.state = "running";
  resume.resolve();
  assert.equal(await unlocking, true);
  await flush();
  assert.equal(state.sources[0].buffer.data, "planet-6.mp3");
});

test("a release gesture retries resume while an earlier pointerdown resume is pending", async () => {
  const state = setup();
  const resumes = [];
  state.context.resume = () => {
    const resume = deferred();
    resumes.push(resume);
    return resume.promise;
  };
  state.controller.setEnabled(true);
  const pointerdown = state.controller.unlock();
  const pointerup = state.controller.unlock();
  assert.equal(resumes.length, 2);
  assert.equal(state.controller.play(0), true);
  state.context.state = "running";
  resumes[1].resolve();
  assert.equal(await pointerup, true);
  await flush();
  assert.equal(state.sources.length, 1);
  // An older blocked attempt must neither hold up nor invalidate the new one.
  resumes[0].reject(new Error("earlier activation was blocked"));
  assert.equal(await pointerdown, false);
  assert.deepEqual(state.errors, []);
  assert.equal(state.controller.play(1), true);
  await flush();
  assert.equal(state.sources.length, 2);
});

test("different one-shots overlap, while revisiting one restarts its cached sound", async () => {
  const state = setup();
  state.controller.setEnabled(true);
  await state.controller.unlock();
  state.controller.play(0);
  state.controller.play(1);
  await flush();
  assert.equal(state.sources.length, 2);
  assert.equal(state.sources[0].stops, 0);
  assert.equal(state.sources[1].stops, 0);
  assert.equal(state.controller.play(0, { restart: false }), true);
  await flush();
  assert.equal(state.sources.length, 2);

  state.controller.play(0);
  await flush();
  assert.equal(state.sources.length, 3);
  assert.equal(state.sources[0].stops, 1);
  assert.equal(state.sources[0].disconnected, true);
  assert.equal(state.sources[1].stops, 0);
  assert.equal(state.sources[2].buffer, state.sources[0].buffer);
  assert.equal(state.fetches.length, 2);
  assert.equal(state.decodes.length, 2);
  assert.deepEqual(state.playing, [
    [0, true],
    [1, true],
    [0, false],
    [0, true],
  ]);
  state.sources[0].onended();
  assert.equal(state.playing.length, 4);
  state.controller.stop();
  assert.equal(state.sources[1].stops, 1);
  assert.equal(state.sources[2].stops, 1);
  assert.deepEqual(state.playing.slice(-2), [
    [1, false],
    [0, false],
  ]);
});

test("repeated hover requests share a load and only the latest starts playback", async () => {
  const state = setup();
  const response = deferred();
  state.fetchResponses.set(PLANET_SOUNDS[0], response.promise);
  state.controller.setEnabled(true);
  await state.controller.unlock();
  state.controller.play(0);
  await flush();
  state.controller.play(0);
  await flush();
  response.resolve({ ok: true, arrayBuffer: () => Promise.resolve("clip") });
  await flush();
  assert.equal(state.fetches.length, 1);
  assert.equal(state.decodes.length, 1);
  assert.equal(state.sources.length, 1);
});

test("mute and navigation stop active audio and invalidate pending clips without replay", async () => {
  for (const action of ["mute", "stop"]) {
    const state = setup();
    const response = deferred();
    state.fetchResponses.set(PLANET_SOUNDS[1], response.promise);
    state.controller.setEnabled(true);
    await state.controller.unlock();
    state.controller.play(0);
    state.controller.play(1);
    await flush();
    if (action === "mute") state.controller.setEnabled(false);
    else state.controller.stop();
    assert.equal(state.sources[0].stops, 1);
    response.resolve({ ok: true, arrayBuffer: () => Promise.resolve("late") });
    state.controller.setEnabled(true);
    await flush();
    assert.equal(state.sources.length, 1);
    assert.deepEqual(state.errors, []);
    state.controller.play(1);
    await flush();
    assert.equal(state.sources.length, 2);
    assert.equal(state.fetches.length, 2);
  }
});

test("failed loads can retry, and obsolete failures are ignored", async () => {
  const state = setup();
  state.fetchResponses.set(PLANET_SOUNDS[0], Promise.resolve({ ok: false }));
  state.controller.setEnabled(true);
  await state.controller.unlock();
  state.controller.play(0);
  await flush();
  assert.equal(state.errors.length, 1);
  state.fetchResponses.delete(PLANET_SOUNDS[0]);
  state.controller.play(0);
  await flush();
  assert.equal(state.sources.length, 1);

  const response = deferred();
  state.fetchResponses.set(PLANET_SOUNDS[1], response.promise);
  state.controller.play(1);
  await flush();
  state.controller.stop();
  response.reject(new Error("obsolete fetch"));
  await flush();
  assert.equal(state.errors.length, 1);
});

test("blocked resume stays silent, reports safely, and permits a later gesture retry", async () => {
  const state = setup();
  const failure = new Error("gesture required");
  state.context.resume = () => Promise.reject(failure);
  state.controller.setEnabled(true);
  const unlocking = state.controller.unlock();
  state.controller.play(0);
  assert.equal(await unlocking, false);
  await flush();
  assert.deepEqual(state.fetches, []);
  assert.deepEqual(state.errors, [failure]);
  state.context.resume = () => {
    state.context.state = "running";
    return Promise.resolve();
  };
  assert.equal(await state.controller.unlock(), true);
  state.controller.play(0);
  await flush();
  assert.equal(state.sources.length, 1);
});

test("missing Web Audio support does not throw or load sound files", async () => {
  const controller = createPlanetAudio({ createContext: () => null });
  controller.setEnabled(true);
  assert.equal(await controller.unlock(), false);
  assert.equal(controller.play(0), false);
  controller.stop();
});

test("natural completion clears playing feedback without clearing a newer source", async () => {
  const state = setup();
  state.controller.setEnabled(true);
  await state.controller.unlock();
  state.controller.play(0);
  await flush();
  state.sources[0].onended();
  assert.deepEqual(state.playing, [
    [0, true],
    [0, false],
  ]);
  state.controller.stop();
  assert.equal(state.sources[0].stops, 0);
});

test("a later gesture resumes a context suspended by the browser without replaying a clip", async () => {
  const state = setup();
  state.controller.setEnabled(true);
  await state.controller.unlock();
  state.context.state = "suspended";
  assert.equal(state.controller.play(0), false);
  assert.equal(await state.controller.unlock(), true);
  assert.equal(state.resumeCount(), 2);
  assert.equal(state.contextCount(), 1);
  assert.deepEqual(state.fetches, []);
  assert.deepEqual(state.playing, []);
});
