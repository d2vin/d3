export const ROOMS = Object.freeze([
  "home",
  "records",
  "museum",
  "shop",
  "observatory",
]);
export const DISCOVERIES = Object.freeze(["listened", "created", "signal"]);

export function readRoute(hash, hasSignal = false) {
  const room = hash.replace(/^#\/?/, "").split("/")[0];
  if (!ROOMS.includes(room)) return "home";
  return room === "observatory" && !hasSignal ? "home" : room;
}

export function readDiscoveries(value) {
  try {
    const parsed = JSON.parse(value);
    return new Set(
      Array.isArray(parsed)
        ? parsed.filter((item) => DISCOVERIES.includes(item))
        : [],
    );
  } catch {
    return new Set();
  }
}

export function weeklyPlanet(now = new Date()) {
  // One featured study per UTC week. Stable across time zones and reloads.
  return Math.floor(now.getTime() / 604800000) % 7;
}

export function formatTime(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return "--:--";
  return `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;
}
