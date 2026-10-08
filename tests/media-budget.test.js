import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, statSync } from "node:fs";
const root = new URL("../", import.meta.url);
const manifest = JSON.parse(
  readFileSync(new URL("assets/media-manifest.json", root)),
);

test("optimized media remain within the mobile download budget", () => {
  let total = 0;
  for (const [name, asset] of Object.entries(manifest)) {
    const posterBytes = statSync(new URL(asset.poster, root)).size;
    assert.equal(
      posterBytes,
      asset.posterBytes,
      `${name} manifest must match its poster`,
    );
    assert.ok(posterBytes <= 200_000, `${name} poster exceeds 200KB`);
    if (!asset.video) continue;
    const bytes = statSync(new URL(asset.video, root)).size;
    assert.equal(
      bytes,
      asset.videoBytes,
      `${name} manifest must match its video`,
    );
    assert.ok(bytes <= 3_000_000, `${name} loop exceeds 3MB`);
    total += bytes;
  }
  assert.ok(
    total <= 7_500_000,
    "Scene loops exceed their combined 7.5MB budget",
  );
  assert.ok(
    manifest["home-dark"].videoBytes <= 2_000_000,
    "The first city loop exceeds 2MB",
  );
});
