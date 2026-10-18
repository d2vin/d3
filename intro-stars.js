// Extends the title video's own starfield into the space around it on any
// screen shape. Stars are drawn in the video's pixel grid (800 × 450, scaled
// like object-fit: contain with pixelated rendering) so they keep its size,
// softness, density and steady glow.
const ART_WIDTH = 800;
const ART_HEIGHT = 450;
const CELL = 50;
const SLOTS = 3;
// About five stars per 10,000 video pixels, as measured around the title.
const SLOT_CHANCE = (0.0005 * CELL * CELL) / SLOTS;
// Soft white blobs sampled from the video: peak brightness (clipped at 1) and
// Gaussian spread in video pixels. Most are tall ovals; a few are faint specks
// or lie flat.
const KINDS = [
  { weight: 0.35, peak: 1.6, spreadX: 1, spreadY: 2.2 },
  { weight: 0.3, peak: 0.78, spreadX: 0.9, spreadY: 2 },
  { weight: 0.15, peak: 0.56, spreadX: 0.8, spreadY: 1.7 },
  { weight: 0.15, peak: 0.36, spreadX: 0.7, spreadY: 1 },
  { weight: 0.05, peak: 1.4, spreadX: 1.8, spreadY: 0.9 },
];
const OFFSETS = [
  [0, 0],
  [0.5, 0],
  [0, 0.5],
  [0.5, 0.5],
];

function hash(value) {
  let t = (value + 0x6d2b79f5) | 0;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

function spriteSize(kind) {
  const reach = Math.sqrt(2 * Math.log(kind.peak / 0.03));
  return {
    width: 2 * Math.ceil(kind.spreadX * reach) + 2,
    height: 2 * Math.ceil(kind.spreadY * reach) + 2,
  };
}
const SPRITES = KINDS.flatMap((kind, kindIndex) =>
  OFFSETS.map(([offsetX, offsetY]) => ({
    kind: kindIndex,
    offsetX,
    offsetY,
    ...spriteSize(kind),
  })),
);

function pickKind(roll) {
  let kind = 0;
  while (kind < KINDS.length - 1 && roll >= KINDS[kind].weight) {
    roll -= KINDS[kind].weight;
    kind++;
  }
  return kind;
}

/** Stars for a viewport, in video pixels around the contained title art. */
export function introStarField(viewWidth, viewHeight) {
  const positive = (value) => (Number.isFinite(value) && value > 0 ? value : 1);
  viewWidth = positive(viewWidth);
  viewHeight = positive(viewHeight);
  const scale = Math.min(viewWidth / ART_WIDTH, viewHeight / ART_HEIGHT);
  const left = (viewWidth - ART_WIDTH * scale) / 2;
  const top = (viewHeight - ART_HEIGHT * scale) / 2;
  const minX = -left / scale;
  const maxX = (viewWidth - left) / scale;
  const minY = -top / scale;
  const maxY = (viewHeight - top) / scale;
  const stars = [];
  for (let row = Math.floor(minY / CELL); row * CELL < maxY; row++) {
    for (let column = Math.floor(minX / CELL); column * CELL < maxX; column++) {
      const seed = Math.imul(column, 73856093) ^ Math.imul(row, 19349663);
      for (let slot = 0; slot < SLOTS; slot++) {
        const roll = (index) => hash(seed + slot * 7 + index);
        if (roll(0) >= SLOT_CHANCE) continue;
        const sprite =
          pickKind(roll(1)) * OFFSETS.length +
          Math.floor(roll(2) * OFFSETS.length);
        const { width, height } = SPRITES[sprite];
        const x = column * CELL + Math.floor(roll(3) * CELL);
        const y = row * CELL + Math.floor(roll(4) * CELL);
        const offscreen =
          x >= maxX || x + width <= minX || y >= maxY || y + height <= minY;
        // The video already shows its own stars inside the art.
        const insideArt =
          x < ART_WIDTH && x + width > 0 && y < ART_HEIGHT && y + height > 0;
        if (offscreen || insideArt) continue;
        stars.push({
          x,
          y,
          sprite,
          seed: (seed + slot * 7919) | 0,
          blinks: roll(5) < 0.04,
        });
      }
    }
  }
  return { scale, left, top, stars };
}

function drawSprites() {
  const gap = 1;
  const atlasWidth = SPRITES.reduce(
    (sum, sprite) => sum + sprite.width + gap,
    0,
  );
  const atlasHeight = Math.max(...SPRITES.map((sprite) => sprite.height));
  const atlas = document.createElement("canvas");
  atlas.width = atlasWidth;
  atlas.height = atlasHeight;
  const atlasCtx = atlas.getContext("2d");
  if (!atlasCtx) return null;
  const pixels = atlasCtx.createImageData(atlasWidth, atlasHeight);
  let sx = 0;
  for (const sprite of SPRITES) {
    const kind = KINDS[sprite.kind];
    const centerX = sprite.width / 2 - 0.5 + sprite.offsetX - 0.25;
    const centerY = sprite.height / 2 - 0.5 + sprite.offsetY - 0.25;
    for (let y = 0; y < sprite.height; y++) {
      for (let x = 0; x < sprite.width; x++) {
        const dx = (x - centerX) / kind.spreadX;
        const dy = (y - centerY) / kind.spreadY;
        const glow = Math.min(
          1,
          kind.peak * Math.exp(-(dx * dx + dy * dy) / 2),
        );
        const index = (y * atlasWidth + sx + x) * 4;
        pixels.data.fill(255, index, index + 3);
        pixels.data[index + 3] = glow < 0.03 ? 0 : Math.round(glow * 255);
      }
    }
    sprite.sx = sx;
    sx += sprite.width + gap;
  }
  atlasCtx.putImageData(pixels, 0, 0);
  return atlas;
}

export function createIntroStars(canvas) {
  const ctx = canvas.getContext("2d");
  const atlas = ctx ? drawSprites() : null;
  let active = false;
  let reduced = false;
  let frame = 0;
  let lastDraw = 0;
  let width = 0;
  let height = 0;
  let field = introStarField(1, 1);

  function resize() {
    width = window.innerWidth;
    height = window.innerHeight;
    const density = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(width * density);
    canvas.height = Math.round(height * density);
    ctx?.setTransform(density, 0, 0, density, 0, 0);
    if (ctx) ctx.imageSmoothingEnabled = false;
    field = introStarField(width, height);
    if (active) draw(0);
  }
  // Like the video: most stars hold a steady glow with a slight stepped shimmer,
  // while a rare few blink on and off.
  function brightness(star, time) {
    if (reduced) return star.blinks ? 0.5 : 0.93;
    if (star.blinks) {
      const level = hash(star.seed + Math.floor(time / 130));
      return level < 0.45 ? 0 : level;
    }
    return 0.86 + 0.14 * hash(star.seed + Math.floor((time + star.seed) / 260));
  }
  function draw(time) {
    if (!ctx || !atlas) return;
    ctx.clearRect(0, 0, width, height);
    const { scale, left, top } = field;
    for (const star of field.stars) {
      const alpha = brightness(star, time);
      if (!alpha) continue;
      const sprite = SPRITES[star.sprite];
      ctx.globalAlpha = alpha;
      ctx.drawImage(
        atlas,
        sprite.sx,
        0,
        sprite.width,
        sprite.height,
        left + star.x * scale,
        top + star.y * scale,
        sprite.width * scale,
        sprite.height * scale,
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
