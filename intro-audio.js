// Keep play() in the click handler's call stack so browsers allow the sounds.
export function createIntroAudio({ loop, entry, onError = () => {} }) {
  let phase = "gate";
  let enabled = true;
  let hidden = false;
  let entryStarted = false;
  const requests = new Map([
    [loop, 0],
    [entry, 0],
  ]);

  function wanted(audio) {
    return (
      enabled &&
      (audio === loop
        ? phase === "title" && !hidden
        : phase === "world" && entryStarted)
    );
  }

  function stop(audio, rewind = true) {
    requests.set(audio, requests.get(audio) + 1);
    audio.pause();
    if (rewind) audio.currentTime = 0;
  }

  function play(audio) {
    const request = requests.get(audio) + 1;
    requests.set(audio, request);
    function failed(error) {
      if (
        requests.get(audio) === request &&
        wanted(audio) &&
        error?.name !== "AbortError"
      ) {
        onError(error);
      }
    }
    try {
      // Do not defer this call or await another sound first.
      const playback = audio.play();
      Promise.resolve(playback).then(() => {
        if (!wanted(audio)) {
          // A delayed play must not revive audio after reset, mute or hiding.
          const onlyHidden =
            audio === loop && phase === "title" && enabled && hidden;
          stop(audio, !onlyHidden);
        }
      }, failed);
    } catch (error) {
      failed(error);
    }
  }

  return {
    get phase() {
      return phase;
    },
    start(soundEnabled = true) {
      if (phase !== "gate") return;
      enabled = Boolean(soundEnabled);
      phase = "title";
      loop.loop = true;
      entry.loop = false;
      if (wanted(loop)) play(loop);
    },
    enter() {
      if (phase === "world") return;
      entryStarted = phase === "title" && enabled;
      phase = "world";
      stop(loop);
      stop(entry);
      if (wanted(entry)) play(entry);
    },
    reset() {
      phase = "gate";
      entryStarted = false;
      stop(loop);
      stop(entry);
    },
    setEnabled(value) {
      const next = Boolean(value);
      if (enabled === next) return;
      enabled = next;
      if (!enabled) {
        entryStarted = false;
        stop(loop);
        stop(entry);
      } else if (wanted(loop)) {
        play(loop);
      }
    },
    setHidden(value) {
      const next = Boolean(value);
      if (hidden === next) return;
      hidden = next;
      if (hidden) stop(loop, false);
      else if (wanted(loop)) play(loop);
    },
  };
}
