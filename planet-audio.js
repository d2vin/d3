// Match the original museum's seven planet sounds to the current hotspot order.
export const PLANET_SOUNDS = Object.freeze([
  "planet-3.mp3",
  "planet-6.mp3",
  "planet-4.mp3",
  "planet-5.mp3",
  "planet-2.mp3",
  "planet-7.mp3",
  "planet-8.mp3",
]);

export function createPlanetAudio({
  createContext = () => {
    const Context = globalThis.AudioContext || globalThis.webkitAudioContext;
    return Context ? new Context() : null;
  },
  fetchAudio = (url) => fetch(url),
  onError = () => {},
  onPlaying = () => {},
} = {}) {
  let enabled = false;
  let context = null;
  let ready = null;
  let resumePending = null;
  const buffers = new Map();
  const sources = new Map();
  const requests = new Map();

  function report(error) {
    // Audio is optional; an unavailable clip must not interrupt navigation.
    try {
      onError(error);
    } catch {}
  }

  function showPlaying(index, playing) {
    try {
      onPlaying(index, playing);
    } catch {}
  }

  function stopIndex(index) {
    requests.delete(index);
    const source = sources.get(index);
    sources.delete(index);
    if (source) {
      try {
        source.stop();
      } catch {}
      source.disconnect();
      showPlaying(index, false);
    }
  }

  function stop() {
    requests.clear();
    for (const index of sources.keys()) stopIndex(index);
  }

  function load(index) {
    if (!buffers.has(index)) {
      const request = Promise.resolve()
        .then(() => fetchAudio(PLANET_SOUNDS[index]))
        .then((response) => {
          if (!response.ok) throw new Error("Planet sound could not be loaded");
          return response.arrayBuffer();
        })
        .then((data) => context.decodeAudioData(data))
        .catch((error) => {
          if (buffers.get(index) === request) buffers.delete(index);
          throw error;
        });
      buffers.set(index, request);
    }
    return buffers.get(index);
  }

  return {
    setEnabled(value) {
      enabled = Boolean(value);
      if (!enabled) stop();
    },
    unlock() {
      if (!enabled) return Promise.resolve(false);
      try {
        if (!context || context.state === "closed") {
          stop();
          context = createContext();
          ready = null;
          resumePending = null;
        }
        if (!context) return Promise.resolve(false);
        if (context.state === "running") {
          ready = Promise.resolve(true);
        } else {
          // Call resume directly inside the trusted gesture. Loading a sound
          // later can then use this same context without another autoplay gate.
          // Retry on each gesture even if an earlier resume is still pending:
          // a touch pointerdown can precede the browser's activation on release.
          const targetContext = context;
          const resumed = targetContext.resume();
          const attempt = Promise.resolve(resumed).then(
            () => {
              if (resumePending === attempt) resumePending = null;
              const running = targetContext.state === "running";
              if (!running && ready === attempt) ready = null;
              return running;
            },
            (error) => {
              if (resumePending === attempt) resumePending = null;
              if (ready === attempt) {
                ready = null;
                if (enabled) report(error);
              }
              return false;
            },
          );
          ready = attempt;
          resumePending = attempt;
        }
        return ready;
      } catch (error) {
        ready = null;
        resumePending = null;
        report(error);
        return Promise.resolve(false);
      }
    },
    play(index, { restart = true } = {}) {
      if (
        !enabled ||
        !context ||
        !ready ||
        context.state === "closed" ||
        (context.state !== "running" && !resumePending) ||
        !Number.isInteger(index) ||
        index < 0 ||
        index >= PLANET_SOUNDS.length
      ) {
        return false;
      }
      if (!restart && (requests.has(index) || sources.has(index))) return true;
      stopIndex(index);
      const request = {};
      requests.set(index, request);
      const wanted = () => enabled && requests.get(index) === request;
      Promise.resolve(ready)
        .then((unlocked) => (unlocked && wanted() ? load(index) : null))
        .then((buffer) => {
          if (!buffer || !wanted() || context.state !== "running") return;
          const source = context.createBufferSource();
          source.buffer = buffer;
          source.loop = false;
          source.connect(context.destination);
          source.onended = () => {
            source.disconnect();
            if (sources.get(index) === source) {
              sources.delete(index);
              showPlaying(index, false);
            }
          };
          sources.set(index, source);
          try {
            source.start(0);
          } catch (error) {
            sources.delete(index);
            source.disconnect();
            throw error;
          }
          showPlaying(index, true);
        })
        .catch((error) => {
          if (wanted()) report(error);
        })
        .finally(() => {
          if (requests.get(index) === request) requests.delete(index);
        });
      return true;
    },
    stop,
  };
}
