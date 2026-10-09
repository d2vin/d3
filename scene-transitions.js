/** Crossfade whole rooms without moving their live media or painting canvases. */
export function createSceneTransitions({
  document = globalThis.document,
  element = document?.getElementById?.("main"),
  canAnimate = () => true,
  onError = () => {},
} = {}) {
  let current = null;
  const root = document?.documentElement;

  function report(error) {
    try {
      onError(error);
    } catch {
      // An optional error reporter must not interrupt navigation.
    }
  }

  function isCurrent(request) {
    return current === request && !request.closed;
  }

  function clearMarker(request) {
    if (current !== request) return;
    root?.removeAttribute("data-scene-transition");
    root?.style.removeProperty("--scene-fade-duration");
  }

  function cleanup(request) {
    if (!request.applied || request.cleaned) return;
    request.cleaned = true;
    try {
      Promise.resolve(request.onFinish()).catch(report);
    } catch (error) {
      report(error);
    }
  }

  function stopVisuals(request) {
    request.nativeCallbackEnabled = false;
    try {
      request.native?.skipTransition();
    } catch {
      // A transition may already have finished or been skipped by the browser.
    }
    for (const animation of request.animations) {
      try {
        animation.cancel();
      } catch {
        // Restore the normal CSS appearance even if an animation has ended.
      }
    }
    request.animations.clear();
  }

  function settle(request) {
    if (request.closed) return;
    cleanup(request);
    clearMarker(request);
    request.closed = true;
    if (current === request) current = null;
    request.resolve();
  }

  function apply(request) {
    if (request.applied || !isCurrent(request)) return request.updatePromise;
    request.applied = true;
    try {
      request.updatePromise = Promise.resolve(request.update()).catch(report);
    } catch (error) {
      report(error);
    }
    return request.updatePromise;
  }

  function cancel() {
    const request = current;
    if (!request) return Promise.resolve();
    // Invalidate the request before skipTransition can schedule its callback.
    request.closed = true;
    // Hide a live outgoing layer before cancelling its opacity effect, which
    // would otherwise briefly restore its normal, fully visible appearance.
    cleanup(request);
    stopVisuals(request);
    clearMarker(request);
    current = null;
    request.resolve();
    return request.promise;
  }

  function finish() {
    const request = current;
    if (!request) return Promise.resolve();
    request.finishing = true;
    request.nativeCallbackEnabled = false;
    // Commit now, including when motion is disabled during the outgoing fade.
    const updated = apply(request);
    cleanup(request);
    stopVisuals(request);
    clearMarker(request);
    updated.then(() => settle(request));
    return request.promise;
  }

  async function liveFade(request) {
    request.mode = "live";
    root?.setAttribute("data-scene-transition", "live");
    const updated = apply(request);
    if (typeof request.liveElement.animate !== "function") {
      cleanup(request);
      clearMarker(request);
      updated.then(() => settle(request));
      return;
    }
    await updated;
    if (!isCurrent(request) || request.finishing) return;
    try {
      const animation = request.liveElement.animate(
        [{ opacity: 1 }, { opacity: 0 }],
        {
          duration: request.duration,
          easing: "ease-in-out",
          fill: "forwards",
        },
      );
      request.animations.add(animation);
      await animation.finished;
    } catch (error) {
      if (!isCurrent(request) || request.finishing) return;
      report(error);
    }
    if (!isCurrent(request) || request.finishing) return;
    cleanup(request);
    stopVisuals(request);
    settle(request);
  }

  function animateOpacity(request, from, to) {
    const animation = element.animate([{ opacity: from }, { opacity: to }], {
      duration: request.duration / 2,
      easing: "ease-in-out",
      fill: "forwards",
    });
    request.animations.add(animation);
    return animation.finished;
  }

  async function fallback(request) {
    if (!isCurrent(request) || request.finishing) return;
    request.mode = "fallback";
    stopVisuals(request);
    if (typeof element?.animate !== "function") {
      await apply(request);
      settle(request);
      return;
    }
    root?.setAttribute("data-scene-transition", "fallback");
    try {
      // If the native callback already rendered, only fade the new scene in.
      if (!request.applied) await animateOpacity(request, 1, 0);
      if (!isCurrent(request) || request.finishing) return;
      await apply(request);
      if (!isCurrent(request) || request.finishing) return;
      await animateOpacity(request, 0, 1);
    } catch (error) {
      if (!isCurrent(request) || request.finishing) return;
      report(error);
      await apply(request);
    }
    if (!isCurrent(request) || request.finishing) return;
    stopVisuals(request);
    settle(request);
  }

  function nativeFailed(request) {
    if (!isCurrent(request) || request.finishing || request.mode !== "native")
      return;
    // A rejected ready/finished promise is expected when snapshots are skipped.
    // Disable its delayed callback before starting the opacity fallback.
    void fallback(request);
  }

  function run(
    update,
    {
      duration = 700,
      animate = true,
      liveElement = null,
      onFinish = () => {},
    } = {},
  ) {
    cancel();
    let resolve;
    const promise = new Promise((done) => {
      resolve = done;
    });
    const request = {
      update,
      liveElement,
      onFinish,
      duration: Number.isFinite(duration) ? Math.max(0, duration) : 700,
      promise,
      resolve,
      applied: false,
      cleaned: false,
      updatePromise: Promise.resolve(),
      animations: new Set(),
      native: null,
      nativeCallbackEnabled: true,
      closed: false,
      finishing: false,
      mode: null,
    };
    current = request;
    let motionAllowed = false;
    try {
      motionAllowed = animate && request.duration > 0 && canAnimate();
    } catch (error) {
      report(error);
    }
    if (!motionAllowed) {
      // Initial hash navigation and reduced motion must render synchronously.
      const updated = apply(request);
      cleanup(request);
      updated.then(() => settle(request));
      return promise;
    }

    root?.style.setProperty("--scene-fade-duration", `${request.duration}ms`);
    if (liveElement) {
      // Keep an outgoing video/canvas running above the new scene; a native
      // snapshot would freeze it for the duration of the crossfade.
      void liveFade(request);
      return promise;
    }
    if (typeof document?.startViewTransition !== "function") {
      void fallback(request);
      return promise;
    }
    request.mode = "native";
    root?.setAttribute("data-scene-transition", "native");
    try {
      request.native = document.startViewTransition(() => {
        if (!isCurrent(request) || !request.nativeCallbackEnabled)
          return Promise.resolve();
        return apply(request);
      });
      // Observe all promises, including updateCallbackDone, so browser skips
      // and failed snapshots never produce unhandled rejections.
      Promise.resolve(request.native.ready).catch(() => nativeFailed(request));
      Promise.resolve(request.native.updateCallbackDone).catch(() =>
        nativeFailed(request),
      );
      Promise.resolve(request.native.finished).then(
        async () => {
          if (
            !isCurrent(request) ||
            request.finishing ||
            request.mode !== "native"
          )
            return;
          await apply(request);
          settle(request);
        },
        () => nativeFailed(request),
      );
    } catch {
      nativeFailed(request);
    }
    return promise;
  }

  return { run, finish, cancel };
}
