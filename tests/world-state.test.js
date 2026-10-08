import test from "node:test";
import assert from "node:assert/strict";
import {
  readRoute,
  readDiscoveries,
  weeklyPlanet,
  formatTime,
} from "../world-state.js";

test("direct room links resolve and unknown routes recover to the city", () => {
  for (const room of ["home", "museum", "records", "shop"])
    assert.equal(readRoute(`#${room}`), room);
  for (const hash of ["", "#missing", "#<script>", "#//museum"])
    assert.equal(readRoute(hash), "home");
});
test("the hidden room becomes shareable once discovered on this device", () => {
  assert.equal(readRoute("#observatory", false), "home");
  assert.equal(readRoute("#observatory", true), "observatory");
});
test("corrupt, obsolete or hostile local storage does not break discovery state", () => {
  for (const value of ["not json", "null", "{}", "42", null])
    assert.deepEqual([...readDiscoveries(value)], []);
  assert.deepEqual(
    [...readDiscoveries('["signal","signal","unknown","created",{},null]')],
    ["signal", "created"],
  );
});
test("the weekly study is stable across timezone representations and cycles all seven", () => {
  assert.equal(
    weeklyPlanet(new Date("2026-10-08T12:00:00Z")),
    weeklyPlanet(new Date("2026-10-08T08:00:00-04:00")),
  );
  const weeks = Array.from({ length: 7 }, (_, i) =>
    weeklyPlanet(new Date(604800000 * i)),
  );
  assert.equal(new Set(weeks).size, 7);
  assert.equal(
    weeklyPlanet(new Date(0)),
    weeklyPlanet(new Date(604800000 * 7)),
  );
});
test("audio time handles unavailable metadata, seeks and long tracks", () => {
  assert.equal(formatTime(NaN), "--:--");
  assert.equal(formatTime(Infinity), "--:--");
  assert.equal(formatTime(-1), "--:--");
  assert.equal(formatTime(0), "0:00");
  assert.equal(formatTime(65.9), "1:05");
  assert.equal(formatTime(3601), "60:01");
});
