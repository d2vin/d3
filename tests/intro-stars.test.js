import test from "node:test";
import assert from "node:assert/strict";
import { introStarField } from "../intro-stars.js";

const close = (actual, expected) =>
  assert.ok(Math.abs(actual - expected) < 1e-8);

test("stars use the contained title video's scale and position", () => {
  const wide = introStarField(2000, 711);
  close(wide.scale, 711 / 450);
  close(wide.left, (2000 - 800 * wide.scale) / 2);
  assert.equal(wide.top, 0);
  const tall = introStarField(390, 844);
  close(tall.scale, 390 / 800);
  assert.equal(tall.left, 0);
  close(tall.top, (844 - 450 * tall.scale) / 2);
});

test("stars fill only the space around the video, at its density", () => {
  for (const [width, height] of [
    [2000, 711],
    [390, 844],
    [1024, 1366],
  ]) {
    const field = introStarField(width, height);
    for (const star of field.stars) {
      assert.ok(star.x >= 800 || star.x < 0 || star.y >= 450 || star.y < 0);
    }
    const area = (width * height) / field.scale ** 2 - 800 * 450;
    const perTenThousand = (field.stars.length / area) * 10000;
    assert.ok(perTenThousand > 3 && perTenThousand < 7, `${perTenThousand}`);
  }
  assert.equal(introStarField(1600, 900).stars.length, 0);
});

test("resizing keeps each star in the same place beside the video", () => {
  const key = (star) => `${star.x},${star.y},${star.sprite}`;
  const smaller = new Set(introStarField(1400, 450).stars.map(key));
  const larger = new Set(introStarField(2000, 450).stars.map(key));
  assert.ok(smaller.size > 0);
  for (const star of smaller) assert.ok(larger.has(star));
});

test("invalid viewport measurements never produce NaN", () => {
  for (const value of [undefined, null, 0, -1, NaN, Infinity]) {
    const field = introStarField(value, value);
    for (const key of ["scale", "left", "top"]) {
      assert.ok(Number.isFinite(field[key]));
    }
  }
});
