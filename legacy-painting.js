export const LEGACY_WIDTH = 1137;
export const LEGACY_HEIGHT = 796;

export const LEGACY_PAINTINGS = Object.freeze({
  solar: {
    animation: "./yellowplanet1.gif",
    poster: "./assets/yellow-planet.webp",
  },
  redshift: {
    animation: "./redplanet1.gif",
    poster: "./assets/red-planet.webp",
  },
});

export function cutoutRadius(value) {
  return Math.max(10, Math.min(100, Number.isFinite(value) ? value : 40));
}

/** Original 64-point circle: snap to a 5px grid and join with right angles. */
export function jaggedCirclePoints(cx, cy, radius, grid = 5) {
  const points = [];
  let previous;
  for (let i = 0; i <= 64; i += 1) {
    const angle = (i * Math.PI * 2) / 64;
    const next = {
      x: Math.round((cx + radius * Math.cos(angle)) / grid) * grid,
      y: Math.round((cy + radius * Math.sin(angle)) / grid) * grid,
    };
    if (previous) {
      const dx = Math.abs(next.x - previous.x);
      const dy = Math.abs(next.y - previous.y);
      points.push(
        dx >= dy ? { x: next.x, y: previous.y } : { x: previous.x, y: next.y },
      );
    }
    points.push(next);
    previous = next;
  }
  return points;
}

export function jaggedCirclePath(cx, cy, radius) {
  return `${jaggedCirclePoints(cx, cy, radius)
    .map(({ x, y }, index) => `${index === 0 ? "M" : "L"}${x},${y}`)
    .join(" ")}Z`;
}
