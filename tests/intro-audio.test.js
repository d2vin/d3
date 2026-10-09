import test from "node:test";
import assert from "node:assert/strict";
import { createIntroAudio } from "../intro-audio.js";

function setup() {
  const events = [];
  const errors = [];
  function audio(name) {
    return {
      currentTime: 0,
      paused: true,
      loop: false,
      pending: [],
      play() {
        events.push(`${name}:play`);
        this.paused = false;
        return new Promise((resolve, reject) =>
          this.pending.push({ resolve, reject }),
        );
      },
      pause() {
        events.push(`${name}:pause`);
        this.paused = true;
      },
    };
  }
  const loop = audio("loop");
  const entry = audio("entry");
  const controller = createIntroAudio({
    loop,
    entry,
    onError: (error) => errors.push(error),
  });
  return { controller, loop, entry, events, errors };
}

test("the first gesture starts the looping title sound synchronously; the second plays the entry sound", () => {
  const { controller, loop, entry, events } = setup();
  assert.deepEqual(events, []);
  assert.equal(controller.phase, "gate");
  controller.start();
  assert.deepEqual(events, ["loop:play"]);
  assert.equal(controller.phase, "title");
  assert.equal(loop.loop, true);
  loop.currentTime = 4;
  controller.enter();
  assert.deepEqual(events, [
    "loop:play",
    "loop:pause",
    "entry:pause",
    "entry:play",
  ]);
  assert.equal(loop.currentTime, 0);
  assert.equal(loop.paused, true);
  assert.equal(entry.loop, false);
  assert.equal(controller.phase, "world");
  controller.enter();
  controller.start();
  assert.equal(events.filter((event) => event.endsWith(":play")).length, 2);
});

test("direct room entry skips both sounds", () => {
  const { controller, events } = setup();
  controller.enter();
  controller.setEnabled(false);
  controller.setEnabled(true);
  controller.setHidden(true);
  controller.setHidden(false);
  assert.equal(controller.phase, "world");
  assert.equal(
    events.some((event) => event.endsWith(":play")),
    false,
  );
});

test("mute stops both sounds and unmute resumes only the title loop", () => {
  const { controller, loop, entry, events } = setup();
  controller.start(false);
  assert.deepEqual(events, []);
  controller.setEnabled(true);
  assert.equal(loop.paused, false);
  controller.setEnabled(false);
  assert.equal(loop.paused, true);
  controller.setEnabled(true);
  controller.enter();
  assert.equal(entry.paused, false);
  entry.currentTime = 2;
  controller.setEnabled(false);
  assert.equal(entry.paused, true);
  assert.equal(entry.currentTime, 0);
  controller.setEnabled(true);
  assert.equal(events.filter((event) => event === "entry:play").length, 1);
  assert.equal(loop.paused, true);
});

test("reset is silent and permits the complete intro to play again", () => {
  const { controller, loop, entry, events } = setup();
  controller.start();
  controller.enter();
  entry.currentTime = 1.5;
  controller.reset();
  assert.equal(controller.phase, "gate");
  assert.equal(loop.paused, true);
  assert.equal(entry.paused, true);
  assert.equal(entry.currentTime, 0);
  const playCount = events.filter((event) => event.endsWith(":play")).length;
  controller.setHidden(true);
  controller.setHidden(false);
  assert.equal(
    events.filter((event) => event.endsWith(":play")).length,
    playCount,
  );
  controller.start();
  controller.enter();
  assert.equal(events.filter((event) => event === "loop:play").length, 2);
  assert.equal(events.filter((event) => event === "entry:play").length, 2);
});

test("visibility pauses the title in place and never replays the entry sound", () => {
  const { controller, loop, entry, events } = setup();
  controller.start();
  loop.currentTime = 3;
  controller.setHidden(true);
  assert.equal(loop.paused, true);
  assert.equal(loop.currentTime, 3);
  controller.setHidden(false);
  assert.equal(loop.paused, false);
  controller.enter();
  controller.setHidden(true);
  controller.setHidden(false);
  assert.equal(entry.paused, false);
  assert.equal(events.filter((event) => event === "entry:play").length, 1);
});

test("obsolete play rejections are ignored after reset, hide and mute", async () => {
  for (const cancel of ["reset", "mute", "hide"]) {
    const { controller, loop, errors } = setup();
    controller.start();
    if (cancel === "reset") controller.reset();
    if (cancel === "mute") controller.setEnabled(false);
    if (cancel === "hide") controller.setHidden(true);
    loop.pending[0].reject(new Error("stale playback"));
    await Promise.resolve();
    assert.deepEqual(errors, []);
  }
});

test("late playback completion cannot revive a sound after reset or mute", async () => {
  const { controller, loop, entry, errors } = setup();
  controller.start();
  controller.reset();
  loop.paused = false;
  loop.pending[0].resolve();
  await Promise.resolve();
  assert.equal(loop.paused, true);
  controller.start();
  controller.enter();
  controller.setEnabled(false);
  entry.paused = false;
  entry.pending[0].resolve();
  await Promise.resolve();
  assert.equal(entry.paused, true);
  assert.deepEqual(errors, []);
});

test("a stale request does not stop or report an error over a newer title playback", async () => {
  const { controller, loop, errors } = setup();
  controller.start();
  controller.reset();
  controller.start();
  loop.pending[0].reject(new Error("old request"));
  await Promise.resolve();
  assert.equal(loop.paused, false);
  assert.deepEqual(errors, []);
  loop.pending[1].resolve();
  await Promise.resolve();
  assert.equal(loop.paused, false);
});

test("active playback failures are reported without an unhandled rejection", async () => {
  const { controller, loop, errors } = setup();
  const failure = new Error("sound unavailable");
  controller.start();
  loop.pending[0].reject(failure);
  await Promise.resolve();
  assert.deepEqual(errors, [failure]);
});
