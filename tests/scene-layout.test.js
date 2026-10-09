import test from "node:test";
import assert from "node:assert/strict";
import { sceneLayout } from "../scene-layout.js";

const close = (actual, expected) =>
  assert.ok(Math.abs(actual - expected) < 1e-8);

test("portrait cover fills the height and keeps the art centered", () => {
  const art = sceneLayout(390, 844, 16 / 9);
  close(art.width, 1500.4444444444443);
  close(art.height, 844);
  close(art.left, (390 - art.width) / 2);
  assert.equal(art.top, 0);
});

test("landscape cover fills the width and crops vertically", () => {
  const art = sceneLayout(844, 390, 16 / 9);
  close(art.width, 844);
  close(art.height, 474.75);
  close(art.top, -42.375);
  assert.equal(art.left, 0);
  assert.equal(art.maxPan, 0);
});

test("fit reveals the complete artwork and clears a previous pan", () => {
  const art = sceneLayout(390, 844, 16 / 9, true, 500);
  close(art.width, 390);
  close(art.height, 219.375);
  close(art.top, 312.3125);
  assert.equal(art.pan, 0);
});

test("horizontal dragging reaches both edges without exposing empty canvas", () => {
  const right = sceneLayout(390, 844, 16 / 9, false, 10000);
  const left = sceneLayout(390, 844, 16 / 9, false, -10000);
  close(right.left, 0);
  close(left.left + left.width, 390);
  assert.equal(right.pan, right.maxPan);
  assert.equal(left.pan, left.minPan);
  const resized = sceneLayout(844, 390, 16 / 9, false, right.pan);
  assert.equal(resized.pan, 0);
});

test("museum artwork preserves its original aspect ratio", () => {
  const art = sceneLayout(390, 844, 1137 / 796, false, 90);
  close(art.width / art.height, 1137 / 796);
  close(art.left, (390 - art.width) / 2 + 90);
  assert.equal(art.pan, 90);
});

test("invalid viewport measurements and pan never produce NaN", () => {
  for (const value of [undefined, null, 0, -1, NaN, Infinity]) {
    const art = sceneLayout(value, value, value, false, value);
    for (const result of Object.values(art)) assert.ok(Number.isFinite(result));
    assert.ok(art.width > 0 && art.height > 0);
  }
});
