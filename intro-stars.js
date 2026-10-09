// A light canvas backdrop keeps the original starfield across every screen shape.
export function createIntroStars(canvas) {
  const ctx = canvas.getContext("2d");
  let active = false;
  let reduced = false;
  let frame = 0;
  let lastDraw = 0;
  let width = 0;
  let height = 0;
  let stars = [];

  function resize() {
    width = window.innerWidth;
    height = window.innerHeight;
    const density = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(width * density);
    canvas.height = Math.round(height * density);
    ctx?.setTransform(density, 0, 0, density, 0, 0);
    stars = Array.from(
      { length: Math.min(320, Math.round((width * height) / 2800)) },
      (_, index) => ({
        x: (index * 173.71) % Math.max(width, 1),
        y: (index * index * 37.31) % Math.max(height, 1),
        size: index % 9 === 0 ? 2 : 1,
        phase: index * 1.31,
      }),
    );
    if (active) draw(0);
  }
  function draw(time) {
    if (!ctx) return;
    ctx.clearRect(0, 0, width, height);
    for (const star of stars) {
      ctx.globalAlpha = reduced
        ? 0.6
        : 0.4 + 0.35 * Math.sin(time / 2200 + star.phase);
      ctx.fillStyle = "#d9efff";
      ctx.fillRect(
        Math.round(star.x),
        Math.round(star.y),
        star.size,
        star.size * 2,
      );
    }
    ctx.globalAlpha = 1;
  }
  function tick(time) {
    if (!active || reduced) return;
    if (time - lastDraw > 65) {
      draw(time);
      lastDraw = time;
    }
    frame = requestAnimationFrame(tick);
  }
  window.addEventListener("resize", resize);
  resize();
  return {
    setActive(nextActive, reduce = false) {
      active = nextActive;
      reduced = reduce;
      cancelAnimationFrame(frame);
      if (!active) return;
      draw(0);
      if (!reduced) frame = requestAnimationFrame(tick);
    },
  };
}
