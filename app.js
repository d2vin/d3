import {
  readRoute,
  readDiscoveries,
  weeklyPlanet,
  formatTime,
} from "./world-state.js";
import { sceneLayout } from "./scene-layout.js";
import { createIntroStars } from "./intro-stars.js";
import { createIntroAudio } from "./intro-audio.js";
import { createPlanetAudio } from "./planet-audio.js";
import { createSceneTransitions } from "./scene-transitions.js";

const $ = (selector) => document.querySelector(selector);
const storage = {
  get(key) {
    try {
      return localStorage.getItem(`d3:${key}`);
    } catch {
      return null;
    }
  },
  set(key, value) {
    try {
      localStorage.setItem(`d3:${key}`, value);
    } catch {
      /* Private browsing still works. */
    }
  },
};
const discovered = readDiscoveries(storage.get("discoveries"));
const motionQuery = matchMedia("(prefers-reduced-motion: reduce)");
let motionPreference = storage.get("motion");
let soundEnabled = storage.get("sound") === "on";
let entered = false;
let room = "home";
let cleanupRoom = () => {};
let mediaCleanup = () => {};
let mediaVersion = 0;
let roomVersion = 0;
let revealFrame = 0;
let toastTimer;
let introVideo;
let audio;
let audioRequest = 0;
let fitArt = false;
let scenePan = 0;
let panGesture = null;
let experimentReady = false;
let experimentRequest = 0;
const soundButton = $("#sound-toggle");
const motionButton = $("#motion-toggle");
const scene = $("#scene");
const surface = $("#scene-surface");
const sceneImage = $("#scene-image");
const sceneVideo = $("#scene-video");
const revealImage = $("#scene-reveal");
const content = $("#room-content");
const sceneTransitions = createSceneTransitions({
  element: $("#main"),
  canAnimate: () => !reducedMotion() && !document.hidden,
});
const introStars = createIntroStars($("#intro-stars"));
const introAudio = createIntroAudio({
  loop: $("#intro-loop-audio"),
  entry: $("#intro-enter-audio"),
  onError: () =>
    toast("The intro sound couldn't play. Restart the intro to try again."),
});
const planetAudio = createPlanetAudio({
  onPlaying(index, playing) {
    document
      .querySelector(`[data-planet-sound="${index}"]`)
      ?.classList.toggle("is-sounding", playing);
  },
});
planetAudio.setEnabled(soundEnabled);
// Unlock during a gesture so later hover sounds can play without another click.
for (const event of ["pointerdown", "pointerup"])
  document.addEventListener(
    event,
    (input) => {
      if (input.type === "pointerup" || input.pointerType !== "touch")
        planetAudio.unlock();
    },
    { capture: true },
  );
document.addEventListener(
  "keydown",
  (event) => {
    if (!event.repeat && ["Tab", "Enter", " "].includes(event.key))
      planetAudio.unlock();
  },
  { capture: true },
);
const planets = [
  "Yellow planet",
  "Red planet",
  "Orbit",
  "Echo",
  "Prism",
  "Constellation",
  "Night garden",
];
const rooms = {
  home: {
    title: "The city",
    eyebrow: "Welcome to Dimension 3",
    description: "Three doors. A sky full of possibilities. Where to?",
    image: "home-dark",
    alt: "A blue-violet pixel city beneath a starry sky",
    video: true,
  },
  records: {
    title: "Record store",
    eyebrow: "Stay for a while",
    description: "One session on the turntable. Nothing to rush.",
    image: "record-store",
    alt: "Pixel artwork and record sleeves in a dimly lit record store",
    video: true,
  },
  museum: {
    title: "Museum",
    eyebrow: "An exhibition you can touch",
    description: "Seven little experiments. No wrong way to play.",
    image: "museum",
    alt: "A pixel-art museum with planets hanging on its walls",
  },
  shop: {
    title: "Curiosity shop",
    eyebrow: "Small things, long stories",
    description: "Look closer. There is something to take with you.",
    image: "shop",
    alt: "Warm lights illuminate shelves of curious objects in a pixel-art shop",
    video: true,
  },
  observatory: {
    title: "After hours",
    eyebrow: "You followed the signal",
    description:
      "The same city, seen in another light. This view is yours to keep.",
    image: "home-light",
    alt: "The city illuminated in vivid pixel colors",
    video: true,
  },
};

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}
function button(label, action, className = "button") {
  const node = el("button", className, label);
  node.type = "button";
  node.addEventListener("click", action);
  return node;
}
function link(label, href, className = "button") {
  const node = el("a", className, label);
  node.href = href;
  return node;
}
function image(name, alt, className) {
  const node = el("img", className);
  node.src = `./assets/${name}.webp`;
  node.alt = alt;
  node.width = 800;
  node.height = 450;
  node.loading = "lazy";
  return node;
}
function announce(message) {
  $("#status").textContent = message;
}
function toast(message) {
  const node = $("#toast");
  clearTimeout(toastTimer);
  node.textContent = message;
  node.hidden = false;
  toastTimer = setTimeout(() => {
    node.hidden = true;
  }, 5000);
}
function discover(key) {
  if (discovered.has(key)) return;
  discovered.add(key);
  storage.set("discoveries", JSON.stringify([...discovered]));
  $("#secret-map-link").hidden = !discovered.has("signal");
  const messages = {
    listened: "A record heard. One more memory of D3.",
    created: "Your first mark. The museum is a little more yours.",
    signal: "A hidden door opened. Find After hours on the map.",
  };
  toast(messages[key]);
  updateDiscoveries();
}
function reducedMotion() {
  return motionPreference
    ? motionPreference === "reduced"
    : motionQuery.matches || Boolean(navigator.connection?.saveData);
}
function updateSettings() {
  if (reducedMotion()) sceneTransitions.finish();
  soundButton.textContent = soundEnabled ? "Sound on" : "Sound off";
  soundButton.setAttribute("aria-pressed", String(soundEnabled));
  motionButton.textContent = reducedMotion() ? "Motion off" : "Motion on";
  motionButton.setAttribute("aria-pressed", String(!reducedMotion()));
  document.body.dataset.motion = reducedMotion() ? "reduced" : "full";
  cleanupRoom.setReducedMotion?.(reducedMotion());
  introStars.setActive(
    !entered && introAudio.phase === "title" && !document.hidden,
    reducedMotion(),
  );
}
function setSound(enabled) {
  soundEnabled = enabled;
  storage.set("sound", enabled ? "on" : "off");
  planetAudio.setEnabled(enabled);
  if (enabled) planetAudio.unlock();
  if (!enabled && audio) {
    audioRequest++;
    audio.pause();
  }
  introAudio.setEnabled(enabled);
  updateSettings();
}
soundButton.addEventListener("click", () => setSound(!soundEnabled));
motionButton.addEventListener("click", () => {
  motionPreference = reducedMotion() ? "full" : "reduced";
  storage.set("motion", motionPreference);
  updateSettings();
  if (entered) loadScene(rooms[room]);
  else updateIntroMotion();
});
motionQuery.addEventListener("change", () => {
  if (motionPreference) return;
  updateSettings();
  if (entered) loadScene(rooms[room]);
  else updateIntroMotion();
});

// Only a deliberate start gesture begins the title and its audio.
function updateIntroMotion() {
  introStars.setActive(
    !entered && introAudio.phase === "title" && !document.hidden,
    reducedMotion(),
  );
  if (
    entered ||
    introAudio.phase !== "title" ||
    reducedMotion() ||
    document.hidden
  ) {
    introVideo?.pause();
    if (introVideo) introVideo.hidden = true;
    return;
  }
  if (!introVideo) {
    introVideo = el("video");
    introVideo.muted = true;
    introVideo.loop = true;
    introVideo.playsInline = true;
    introVideo.preload = "none";
    introVideo.src = "./assets/entrance.mp4";
    introVideo.setAttribute("aria-hidden", "true");
    introVideo.hidden = true;
    const video = introVideo;
    video.addEventListener("playing", () => {
      video.hidden = entered || introAudio.phase !== "title" || reducedMotion();
    });
    video.addEventListener("error", () => {
      video.hidden = true;
    });
    $(".entry-art").append(introVideo);
  }
  introVideo.play().catch(() => {});
}
function startIntro(enabled = true) {
  if (entered || introAudio.phase !== "gate") return;
  setSound(enabled);
  introAudio.start(enabled);
  $("#intro-gate").hidden = true;
  $("#entry-art").hidden = false;
  $("#intro-stars").hidden = false;
  $("#entry-copy").hidden = false;
  updateIntroMotion();
  $("#entry-art").focus({ preventScroll: true });
  announce("Dimension 3. Click or press Enter again to enter the city.");
}
function enter({ focus = true } = {}) {
  if (entered) return;
  const fromTitle = introAudio.phase === "title";
  // Keep play() in the click/Enter call stack. Direct room links stay silent.
  introAudio.enter();
  entered = true;
  renderRoute({ focus, animate: fromTitle, duration: 1000 });
}
function showWorld() {
  introStars.setActive(false, reducedMotion());
  introVideo?.pause();
  if (introVideo) {
    introVideo.removeAttribute("src");
    introVideo.load();
    introVideo.remove();
    introVideo = null;
  }
  $("#entry-screen").hidden = true;
  $("#world").hidden = false;
  $("#replay-intro").hidden = false;
  document.body.classList.add("entered");
}
$("#start-intro").addEventListener("click", () => startIntro());
$("#start-muted").addEventListener("click", () => startIntro(false));
$("#entry-art").addEventListener("click", () => enter());
document.addEventListener("keydown", (event) => {
  if (entered || event.key !== "Enter") return;
  if (event.repeat) {
    event.preventDefault();
    return;
  }
  if (event.target.closest("button,a,input,select,dialog")) return;
  event.preventDefault();
  if (introAudio.phase === "gate") startIntro();
  else enter();
});
$(".skip-link").addEventListener("click", (event) => {
  event.preventDefault();
  $("#main").focus();
  $("#main").scrollIntoView({ block: "start" });
});
function restartIntro() {
  sceneTransitions.cancel();
  planetAudio.stop();
  introAudio.reset();
  audioRequest++;
  audio?.pause();
  $("#player").hidden = true;
  document.body.classList.remove("has-player");
  clearTimeout(toastTimer);
  $("#toast").hidden = true;
  document.querySelectorAll("dialog[open]").forEach((dialog) => dialog.close());
  closeExperiment(false);
  cleanupRoom();
  cleanupRoom = () => {};
  mediaCleanup();
  mediaVersion++;
  roomVersion++;
  sceneVideo.pause();
  entered = false;
  document.body.classList.remove("entered");
  $("#entry-screen").hidden = false;
  $("#world").hidden = true;
  $("#replay-intro").hidden = true;
  $("#intro-gate").hidden = false;
  $("#entry-art").hidden = true;
  $("#intro-stars").hidden = true;
  $("#entry-copy").hidden = true;
  document.title = "Dimension 3 — A small world after dark";
  history.replaceState(null, "", location.pathname + location.search);
  updateIntroMotion();
  $("#start-intro").focus({ preventScroll: true });
  announce("Intro restarted. Click or press Enter to start with sound.");
}
$("#replay-intro").addEventListener("click", restartIntro);
$("#restart-intro").addEventListener("click", restartIntro);

function loadScene(config) {
  const version = ++mediaVersion;
  mediaCleanup();
  sceneVideo.pause();
  sceneVideo.hidden = true;
  sceneVideo.removeAttribute("src");
  sceneVideo.load();
  scene.dataset.room = room;
  scene.style.setProperty(
    "--scene-backdrop",
    `url('./assets/${config.image}.webp')`,
  );
  sceneImage.src = `./assets/${config.image}.webp`;
  sceneImage.alt = config.alt;
  sceneImage.width = room === "museum" ? 1137 : 800;
  sceneImage.height = room === "museum" ? 796 : 450;
  layoutScene();
  scene.classList.remove("is-revealing", "lights-on");
  revealImage.hidden = true;
  revealImage.removeAttribute("src");
  const lightSwitch = $("#city-lights");
  if (lightSwitch) {
    lightSwitch.textContent = "Switch on the city lights";
    lightSwitch.setAttribute("aria-pressed", "false");
  }
  if (reducedMotion() || !config.video) {
    mediaCleanup = () => {};
    return;
  }
  const show = () => {
    if (version === mediaVersion)
      sceneVideo.hidden = reducedMotion() || !entered;
  };
  const fail = () => {
    if (version === mediaVersion) sceneVideo.hidden = true;
  };
  sceneVideo.addEventListener("playing", show);
  sceneVideo.addEventListener("error", fail);
  sceneVideo.src = `./assets/${config.image}.mp4`;
  sceneVideo.muted = true;
  if (!document.hidden) sceneVideo.play().catch(fail);
  mediaCleanup = () => {
    sceneVideo.removeEventListener("playing", show);
    sceneVideo.removeEventListener("error", fail);
  };
}
sceneImage.addEventListener("error", () => {
  announce(
    "The scene artwork could not load. The Map and room controls are still available.",
  );
});
document.addEventListener("visibilitychange", () => {
  if (document.hidden) sceneTransitions.finish();
  introAudio.setHidden(document.hidden);
  if (document.hidden) planetAudio.stop();
  cleanupRoom.setActive?.(
    !document.hidden && document.body.classList.contains("experiment-open"),
  );
  introStars.setActive(
    !entered && introAudio.phase === "title" && !document.hidden,
    reducedMotion(),
  );
  if (document.hidden) {
    sceneVideo.pause();
    introVideo?.pause();
  } else if (!reducedMotion()) {
    if (entered && rooms[room].video && sceneVideo.getAttribute("src"))
      sceneVideo.play().catch(() => {});
    else if (!entered) updateIntroMotion();
  }
});

function setReveal(event) {
  if (room !== "home" || !entered || event.target.closest("a,button")) return;
  if (event.pointerType === "touch" && !event.buttons) return;
  const rect = surface.getBoundingClientRect();
  const x = ((event.clientX - rect.left) / rect.width) * 100;
  const y = ((event.clientY - rect.top) / rect.height) * 100;
  cancelAnimationFrame(revealFrame);
  revealFrame = requestAnimationFrame(() => {
    if (room !== "home") return;
    if (!revealImage.getAttribute("src"))
      revealImage.src = "./assets/home-light.webp";
    revealImage.hidden = false;
    scene.style.setProperty("--reveal-x", `${x}%`);
    scene.style.setProperty("--reveal-y", `${y}%`);
    scene.classList.add("is-revealing");
  });
}
function layoutScene() {
  const bounds = scene.getBoundingClientRect();
  const geometry = sceneLayout(
    bounds.width,
    bounds.height,
    room === "museum" ? 1137 / 796 : 16 / 9,
    fitArt,
    scenePan,
  );
  scenePan = geometry.pan;
  for (const key of ["width", "height", "left", "top"]) {
    surface.style[key] = `${geometry[key]}px`;
    // The original planet paintings share the museum's composition and pan.
    $("#museum-stage").style.setProperty(
      `--museum-art-${key}`,
      `${geometry[key]}px`,
    );
  }
  scene.dataset.pannable = String(geometry.maxPan > 0);
  return geometry;
}
window.addEventListener("resize", layoutScene);
$("#art-fit").addEventListener("click", () => {
  fitArt = !fitArt;
  document.body.classList.toggle("art-fitted", fitArt);
  $("#art-fit").setAttribute("aria-pressed", String(fitArt));
  $("#art-fit").textContent = fitArt ? "Fill screen" : "Fit art";
  scenePan = 0;
  layoutScene();
});
scene.addEventListener("pointerdown", (event) => {
  if (
    event.target.closest("a,button") ||
    !event.isPrimary ||
    event.button !== 0
  )
    return;
  panGesture = { id: event.pointerId, x: event.clientX, pan: scenePan };
  scene.setPointerCapture(event.pointerId);
  setReveal(event);
});
scene.addEventListener("pointermove", (event) => {
  if (panGesture?.id === event.pointerId) {
    scenePan = panGesture.pan + event.clientX - panGesture.x;
    layoutScene();
  }
  setReveal(event);
});
scene.addEventListener("keydown", (event) => {
  if (
    event.target !== scene ||
    !["ArrowLeft", "ArrowRight", "Home"].includes(event.key)
  )
    return;
  event.preventDefault();
  scenePan =
    event.key === "Home"
      ? 0
      : scenePan + (event.key === "ArrowLeft" ? 80 : -80);
  layoutScene();
});
scene.addEventListener("focusin", (event) => {
  const target = event.target.closest(".scene-hotspot");
  if (!target) return;
  const bounds = scene.getBoundingClientRect(),
    rect = target.getBoundingClientRect();
  if (rect.left < bounds.left + 16) scenePan += bounds.left + 16 - rect.left;
  else if (rect.right > bounds.right - 16)
    scenePan -= rect.right - bounds.right + 16;
  layoutScene();
});
for (const name of ["pointerleave", "pointerup", "pointercancel"])
  scene.addEventListener(name, () => {
    panGesture = null;
    cancelAnimationFrame(revealFrame);
    scene.classList.remove("is-revealing");
  });

function addHotspot({ name, icon, x, y, href, action, secret = false }) {
  const node = action
    ? button("", action, "scene-hotspot")
    : link("", href, "scene-hotspot");
  node.setAttribute("aria-label", name);
  node.style.setProperty("--x", `${x}%`);
  node.style.setProperty("--y", `${y}%`);
  node.append(
    el("span", "hotspot-icon", icon),
    el("span", "hotspot-label", name),
  );
  if (secret) node.classList.add("secret-hotspot");
  $("#scene-hotspots").append(node);
  return node;
}
function updateDiscoveries() {
  $("#secret-map-link").hidden = !discovered.has("signal");
  const count = $(".discovery-count");
  if (count) count.textContent = `${discovered.size} of 3 discovered`;
  document.querySelectorAll("[data-discovery]").forEach((node) => {
    const found = discovered.has(node.dataset.discovery);
    node.dataset.found = String(found);
    node.querySelector(".discovery-state").textContent = found
      ? "Found"
      : "To discover";
  });
  const secretLink = $("#discovered-door");
  if (secretLink) secretLink.hidden = !discovered.has("signal");
}
function addDiscoveryPanel() {
  const panel = el("section", "discovery-panel");
  panel.append(
    el("h2", "", "A few things to find"),
    el("p", "discovery-count"),
  );
  const list = el("ul", "discovery-list");
  for (const [key, label] of [
    ["listened", "A record heard"],
    ["created", "A mark of your own"],
    ["signal", "A signal in the sky"],
  ]) {
    const item = el("li");
    item.dataset.discovery = key;
    item.append(el("span", "", label), el("span", "discovery-state"));
    list.append(item);
  }
  const secretLink = link(
    "Visit After hours ↗",
    "#observatory",
    "button button-quiet",
  );
  secretLink.id = "discovered-door";
  panel.append(
    list,
    secretLink,
    el("p", "map-note", "Saved on this device. Come back whenever you like."),
  );
  content.append(panel);
  updateDiscoveries();
}
function renderHome() {
  $("#scene-hint").textContent = "Move to reveal light · Drag to look around";
  addHotspot({ name: "Museum", icon: "✳", x: 45, y: 63, href: "#museum" });
  addHotspot({
    name: "Curiosity shop",
    icon: "◇",
    x: 57,
    y: 71,
    href: "#shop",
  });
  addHotspot({
    name: "Record store",
    icon: "◎",
    x: 70,
    y: 56,
    href: "#records",
  });
  addHotspot({
    name: "Inspect the flickering star",
    icon: "✦",
    x: 23,
    y: 12,
    secret: true,
    action: () => {
      discover("signal");
      location.hash = "observatory";
    },
  });
  const nav = el("nav", "destination-list");
  nav.setAttribute("aria-label", "Choose a room");
  for (const [id, icon, label, description] of [
    ["records", "◎", "Record store", "Put a record on"],
    ["museum", "✳", "Museum", "Make something yours"],
    ["shop", "◇", "Curiosity shop", "Look a little closer"],
  ]) {
    const a = link("", `#${id}`, "destination-link");
    a.append(
      el("span", "destination-icon", icon),
      el("strong", "", label),
      el("span", "", description),
    );
    nav.append(a);
  }
  const lights = button(
    "Switch on the city lights",
    () => {
      const on = scene.classList.toggle("lights-on");
      revealImage.src = "./assets/home-light.webp";
      revealImage.hidden = !on;
      lights.textContent = on
        ? "Return to the night"
        : "Switch on the city lights";
      lights.setAttribute("aria-pressed", String(on));
    },
    "button button-quiet",
  );
  lights.id = "city-lights";
  lights.setAttribute("aria-pressed", "false");
  const feature = el("section", "feature-panel");
  const text = el("div");
  text.append(
    el("p", "eyebrow", "This week in the museum"),
    el("h2", "", planets[weeklyPlanet()]),
    el(
      "p",
      "",
      "A different study every week. Bring a little curiosity; leave with your own image.",
    ),
  );
  feature.append(
    text,
    link("Try this week’s study", "#museum", "button button-primary"),
  );
  content.append(nav, lights, feature);
  addDiscoveryPanel();
}
function renderRecords() {
  $("#scene-hint").textContent = "Stay a while. Put something on.";
  addHotspot({
    name: "Play the record store session",
    icon: "◎",
    x: 40,
    y: 62,
    action: () => togglePlayback(),
  });
  const panel = el("section", "feature-panel record-panel");
  const sleeve = button("", () => togglePlayback(), "record-sleeve");
  sleeve.setAttribute("aria-label", "Play or pause the record store session");
  sleeve.append(
    image("record-store", "Record store session artwork"),
    el("span", "sleeve-label", "D3 / Record store session"),
  );
  const info = el("div", "record-info");
  info.append(
    el("p", "eyebrow", "On the turntable"),
    el("h2", "", "Record store session"),
    el(
      "p",
      "",
      "A soundtrack for wandering. Start here, then take it with you through the city.",
    ),
  );
  const actions = el("div", "record-actions");
  const play = button(
    "Play session",
    () => togglePlayback(),
    "button button-primary",
  );
  play.id = "record-play";
  const inspect = button(
    "View sleeve & notes",
    () => openObject("record"),
    "button button-quiet",
  );
  actions.append(play, inspect);
  const credits = el("details", "credits");
  credits.append(
    el("summary", "", "About this session"),
    el(
      "p",
      "",
      "The listening room pairs the record-store artwork and music from D3’s original collection. There is one session on the turntable, ready to play in full.",
    ),
  );
  info.append(actions, credits);
  panel.append(sleeve, info);
  content.append(panel);
  syncPlayer();
}
function renderMuseum() {
  $("#scene-hint").textContent = "Touch a planet. Make a little world.";
  const positions = [
    [41.34, 16.33],
    [58.05, 33.92],
    [21, 25],
    [42, 35],
    [58, 17],
    [72, 30],
    [90, 25],
  ];
  positions.forEach(([x, y], index) => {
    let cued = false;
    function cue() {
      if (
        !cued &&
        soundEnabled &&
        !document.hidden &&
        !document.body.classList.contains("experiment-open")
      )
        cued = planetAudio.play(index);
    }
    const node = addHotspot({
      name: planets[index],
      icon: "◉",
      x,
      y,
      action: () => {
        planetAudio.unlock();
        cue();
        openExperiment(index);
      },
    });
    node.dataset.planetSound = String(index);
    node.addEventListener("pointerenter", (event) => {
      if (event.pointerType !== "touch") cue();
    });
    node.addEventListener("pointerleave", () => {
      cued = false;
    });
    node.addEventListener("focus", () => {
      if (node.matches(":focus-visible")) cue();
    });
    node.addEventListener("blur", () => {
      cued = false;
    });
  });
}
async function openExperiment(initialPlanet) {
  const version = roomVersion;
  const request = ++experimentRequest;
  const mount = $("#museum-stage");
  $("#room-panel").close();
  mount.hidden = false;
  scene.inert = true;
  document.body.classList.add("experiment-open");
  $("#close-experiment").hidden = false;
  $("#room-action").hidden = true;
  if (experimentReady) {
    cleanupRoom.setActive?.(!document.hidden);
    if (initialPlanet !== undefined) cleanupRoom.selectPlanet(initialPlanet);
    $("#close-experiment").focus();
    return;
  }
  mount.replaceChildren(el("p", "experiment-loading", "Opening the study…"));
  try {
    const { mountMuseum } = await import("./museum.js");
    if (
      version !== roomVersion ||
      request !== experimentRequest ||
      room !== "museum"
    )
      return;
    cleanupRoom = mountMuseum(mount, {
      onDiscover: () => discover("created"),
      reducedMotion: reducedMotion(),
      initialPlanet: initialPlanet ?? weeklyPlanet(),
    });
    experimentReady = true;
    cleanupRoom.setActive?.(!document.hidden);
    if (document.body.classList.contains("experiment-open"))
      $("#close-experiment").focus();
  } catch {
    if (version !== roomVersion || request !== experimentRequest) return;
    mount.replaceChildren(
      el("p", "", "The experiments could not load."),
      button("Try again", () => openExperiment(initialPlanet)),
    );
  }
}
function closeExperiment(focus = true) {
  experimentRequest++;
  cleanupRoom.setActive?.(false);
  scene.inert = false;
  $("#museum-stage").hidden = true;
  document.body.classList.remove("experiment-open");
  $("#close-experiment").hidden = true;
  $("#room-action").hidden = false;
  if (focus) $("#room-action").focus();
}
$("#close-experiment").addEventListener("click", () => closeExperiment());
$("#room-action").addEventListener("click", () => {
  if (room === "museum") openExperiment();
  else $("#room-panel").showModal();
});
const objects = {
  city: {
    title: "The city, in another light",
    image: "home-light",
    description:
      "The quiet streets have a second life in color. This postcard is a piece of that other city, ready to keep or use as a little window on your screen.",
    action: "Save the city postcard",
    href: "./assets/home-light.webp",
    download: "dimension-3-city.webp",
  },
  museum: {
    title: "A study in small worlds",
    image: "museum",
    description:
      "Seven planets hang on the museum walls. Their shapes are invitations: draw a constellation, grow a night garden, or see how a color changes everything.",
    action: "Make your own study",
    href: "#museum",
  },
  record: {
    title: "Record store session",
    image: "record-store",
    description:
      "A sleeve from the D3 listening room. The artwork and its companion track belong together here; you can keep exploring while the session plays.",
    action: "Visit the listening room",
    href: "#records",
  },
};
function renderShop() {
  $("#scene-hint").textContent = "Something on the shelf catches your eye.";
  addHotspot({
    name: "Look at the objects",
    icon: "◇",
    x: 61,
    y: 56,
    action: () => $("#room-panel").showModal(),
  });
  const grid = el("div", "card-grid objects-grid");
  for (const [id, obj] of Object.entries(objects)) {
    const card = button("", () => openObject(id), "object-card");
    card.append(
      image(obj.image, ""),
      el("span", "card-body", obj.title),
      el(
        "span",
        "object-hint",
        id === "city" ? "A postcard to keep" : "Take a closer look",
      ),
    );
    grid.append(card);
  }
  content.append(grid);
}
function openObject(id) {
  $("#room-panel").close();
  $("#room-action").focus({ preventScroll: true });
  const obj = objects[id];
  $("#object-title").textContent = obj.title;
  $("#object-description").textContent = obj.description;
  $("#object-image").src = `./assets/${obj.image}.webp`;
  $("#object-image").alt = obj.title;
  const action = $("#object-action");
  action.textContent = obj.action;
  action.href = obj.href;
  if (obj.download) action.download = obj.download;
  else action.removeAttribute("download");
  $("#object-dialog").showModal();
}
function renderObservatory() {
  $("#scene-hint").textContent =
    "Some doors are easier to find when you slow down.";
  const panel = el("section", "feature-panel");
  const words = el("div");
  words.append(
    el("p", "eyebrow", "A small souvenir"),
    el("h2", "", "Keep a little light"),
    el(
      "p",
      "",
      "You found the star above the city. Take this view with you, or return to the streets and keep exploring.",
    ),
  );
  const download = link(
    "Save the city postcard",
    "./assets/home-light.webp",
    "button button-primary",
  );
  download.download = "dimension-3-city.webp";
  panel.append(words, download);
  content.append(panel);
  addDiscoveryPanel();
}
function renderRoute({ focus = true, animate = true, duration = 700 } = {}) {
  if (!entered) {
    enter({ focus });
    return;
  }
  planetAudio.stop();
  document.querySelectorAll("dialog[open]").forEach((dialog) => dialog.close());
  const next = readRoute(location.hash, discovered.has("signal"));
  sceneTransitions.run(
    () => {
      showWorld();
      commitRoute(next, { focus });
      return waitForScenePoster();
    },
    { animate, duration },
  );
}
function waitForScenePoster() {
  // Hold the outgoing artwork until the small poster is decoded, not the video.
  // A broken/slow image must never trap navigation behind a transition.
  if (!sceneImage.decode) return Promise.resolve();
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, 1200);
    sceneImage
      .decode()
      .catch(() => {})
      .finally(() => {
        clearTimeout(timer);
        resolve();
      });
  });
}
function commitRoute(next, { focus }) {
  closeExperiment(false);
  cleanupRoom();
  cleanupRoom = () => {};
  cancelAnimationFrame(revealFrame);
  if (location.hash !== `#${next}`) history.replaceState(null, "", `#${next}`);
  room = next;
  scenePan = 0;
  experimentReady = false;
  $("#museum-stage").replaceChildren();
  roomVersion++;
  const config = rooms[room];
  document.title = `${config.title} — Dimension 3`;
  $("#room-title").textContent = config.title;
  $("#room-eyebrow").textContent = config.eyebrow;
  $("#room-description").textContent = config.description;
  $("#room-back").hidden = room === "home";
  $("#restart-intro").hidden = room !== "home";
  const actionNames = {
    home: "Explore",
    records: "Listen",
    museum: "Make art",
    shop: "Objects",
    observatory: "Postcard",
  };
  $("#room-action").textContent = actionNames[room];
  $("#panel-title").textContent = room === "home" ? "Explore D3" : config.title;
  if (room === "museum") $("#room-action").removeAttribute("aria-haspopup");
  else $("#room-action").setAttribute("aria-haspopup", "dialog");
  $("#scene-hotspots").replaceChildren();
  content.replaceChildren();
  loadScene(config);
  if (room === "home") renderHome();
  else if (room === "records") renderRecords();
  else if (room === "museum") renderMuseum();
  else if (room === "shop") renderShop();
  else renderObservatory();
  document.querySelectorAll(".map-grid a").forEach((a) => {
    if (a.hash === `#${room}`) a.setAttribute("aria-current", "page");
    else a.removeAttribute("aria-current");
  });
  window.scrollTo({ top: 0, behavior: "instant" });
  if (focus) $("#room-title").focus({ preventScroll: true });
  announce(`${config.title}. ${config.description}`);
}
window.addEventListener("hashchange", () => renderRoute());

// Native dialogs handle focus trapping, Escape and focus restoration.
for (const dialog of document.querySelectorAll("dialog")) {
  dialog
    .querySelector(".dialog-close")
    .addEventListener("click", () => dialog.close());
  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) {
      const r = dialog.getBoundingClientRect();
      if (
        event.clientX < r.left ||
        event.clientX > r.right ||
        event.clientY < r.top ||
        event.clientY > r.bottom
      )
        dialog.close();
    }
  });
  dialog.addEventListener("click", (event) => {
    const a = event.target.closest("a");
    if (!a) return;
    dialog.close();
    if (a.hash && a.hash === location.hash) {
      event.preventDefault();
      if (!entered) enter();
      else {
        if (room === "museum") closeExperiment(false);
        $("#room-title").focus();
      }
    }
  });
}
$("#map-toggle").addEventListener("click", () => $("#map-dialog").showModal());
// Clicking the city wordmark while already on #home should also enter from the intro.
$(".wordmark").addEventListener("click", (event) => {
  if (!entered && location.hash === "#home") {
    event.preventDefault();
    enter();
  }
});

function getAudio() {
  if (audio) return audio;
  audio = new Audio("./recordstoresong1.mp3");
  audio.preload = "metadata";
  audio.volume = 0.65;
  audio.addEventListener("playing", () => {
    discover("listened");
    syncPlayer();
  });
  for (const name of ["pause", "ended", "loadedmetadata", "durationchange"])
    audio.addEventListener(name, syncPlayer);
  audio.addEventListener("timeupdate", updateTimeline);
  audio.addEventListener("waiting", () => {
    $("#player-state").textContent = "Loading the session…";
  });
  audio.addEventListener("error", () => {
    $("#player-state").textContent = "Track unavailable. Try Play again.";
    $("#player-play").textContent = "Retry";
    announce("The track could not load. You can try playing it again.");
  });
  return audio;
}
async function togglePlayback() {
  const track = getAudio();
  $("#player").hidden = false;
  document.body.classList.add("has-player");
  if (!track.paused) {
    audioRequest++;
    track.pause();
    return;
  }
  setSound(true);
  if (track.error) track.load();
  const request = ++audioRequest;
  $("#player-state").textContent = "Loading the session…";
  try {
    await track.play();
    if (request !== audioRequest) track.pause();
  } catch {
    if (request === audioRequest) {
      $("#player-state").textContent = "Could not play. Tap Play to retry.";
      announce("Audio could not start. Tap Play to try again.");
    }
  }
}
function syncPlayer() {
  const playing = audio && !audio.paused && !audio.ended;
  $("#player-play").textContent = playing ? "Pause" : "Play";
  $("#player-play").setAttribute(
    "aria-label",
    `${playing ? "Pause" : "Play"} record store session`,
  );
  $("#player-state").textContent = playing
    ? "Playing · explore while you listen"
    : audio?.ended
      ? "Session complete"
      : "Paused";
  const recordButton = $("#record-play");
  if (recordButton)
    recordButton.textContent = playing ? "Pause session" : "Play session";
  updateTimeline();
}
function updateTimeline() {
  if (!audio) return;
  const duration = audio.duration;
  const ready = Number.isFinite(duration) && duration > 0;
  $("#seek").disabled = !ready;
  $("#seek").value = ready ? (audio.currentTime / duration) * 100 : 0;
  $("#seek").setAttribute(
    "aria-valuetext",
    `${formatTime(audio.currentTime)} of ${formatTime(duration)}`,
  );
  $("#player-time").textContent =
    `${formatTime(audio.currentTime)} / ${formatTime(duration)}`;
}
$("#player-play").addEventListener("click", togglePlayback);
$("#seek").addEventListener("input", (event) => {
  if (audio && Number.isFinite(audio.duration))
    audio.currentTime = (audio.duration * Number(event.target.value)) / 100;
});
$("#volume").addEventListener("input", (event) => {
  if (audio) audio.volume = Number(event.target.value);
});
$("#player-close").addEventListener("click", () => {
  audioRequest++;
  audio?.pause();
  $("#player").hidden = true;
  document.body.classList.remove("has-player");
  const focusTarget =
    $("#room-panel").open && $("#record-play")
      ? $("#record-play")
      : soundButton;
  focusTarget.focus({ preventScroll: true });
});

updateSettings();
updateDiscoveries();
if (location.hash) enter({ focus: false });
else updateIntroMotion();
