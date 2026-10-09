# Dimension 3

A small, static art-and-music world. No framework, build step, remote fonts, accounts, or service credentials are required.

## Run locally

```sh
npm run dev
```

Open http://127.0.0.1:4174. The development server uses Python 3. Serve the repository root as static files in production, as before; JavaScript modules must be served over HTTP rather than opened through `file://`.

```sh
npm run check
```

The check runs JavaScript syntax checks and Node's built-in test runner. There are no npm dependencies to install. Tests cover routes and discovery-state recovery, audio-time formatting, weekly rotation, cover/fit geometry and pan bounds, scaled pointer coordinates, all seven museum activities, stroke undo/clear, bounded drawings, export/cleanup state, and scene-transition cancellation, reduced motion and fallback behavior. The museum adapter tests behavior; browser checks are still needed for rendering, native media and actual downloads.

## Rooms and controls

- `#home`: the city, a light reveal, accessible room links and a hidden star.
- `#records`: the existing record-store track, with play/pause, seek and volume. Playback continues while navigating rooms and stops when the player is closed or sound is switched off.
- `#museum`: the original Yellow planet and Red planet painting rooms, plus five canvas experiments; the featured planet rotates weekly on a UTC schedule. Each museum planet plays its original sound on hover, keyboard focus, or tap when Sound is on. Clips finish after leaving the hotspot or opening a painting, and stop when muted, leaving the museum, hiding the page, or restarting the intro. Yellow stamps jagged circles (radius 10–100; scroll, slider, or +/- keys); Red stamps fixed small dots. Hover previews the animated reveal, click/tap or Enter stamps it, and right-click or Hue cycles the artwork colors. Use pointer/touch input, or focus the canvas and use arrow keys + Enter. Each planet keeps its drawing while the museum is open. Save an image before leaving the room; drawings are not stored after navigation/reload.
- `#shop`: stories about the existing artwork, a free city postcard and links into the listening room and museum. This is an art collection, not an inventory or checkout.
- `#observatory`: the hidden city view, unlocked by finding the star. Discoveries, motion and sound preferences are stored only in this browser. Storage failures do not prevent exploring.

Opening the root URL shows a click-to-start sound prompt. The first click (or Enter) starts the full-screen D3 title, starfield, and original intro loop; the second click enters the city with the original transition sound. Start without sound and the Sound toggle provide muted access. Direct room links go straight into the world without starting audio. Restart intro is visible on the home screen and Replay entrance is also in the Map; both stop existing music and reset the full two-step sequence. The browser's Back/Forward buttons work with room navigation.

Rooms dissolve into one another over 700 ms, and the final intro click fades into the city over one second. Native view transitions preserve the outgoing artwork, including live paintings and the current pan position, while fixed navigation and music controls remain steady. Older browsers use an opacity fade. Motion off skips transitions; rapid navigation follows the latest destination, and hiding the page finishes a pending transition. The fade waits briefly for the destination poster to decode, without waiting for its video.

Motion follows `prefers-reduced-motion` and Save-Data by default and can be changed with the Motion button. Posters remain usable if video playback fails. The site never automatically starts audible music. Artwork fills the viewport while preserving its source aspect ratio. On narrow screens, drag the artwork horizontally or focus it and use Left/Right arrows to explore; Home recenters it. Fit art shows the complete composition. The same fit/fill control works for the full-screen museum canvas. Compact navigation and music controls float above the artwork, while room details open in a drawer. Map links remain available when scene entrances are outside the visible crop. Native dialogs provide keyboard focus management.

## Assets

Original GIFs and audio are retained at the root, including the unlinked legacy experiments (`bedlam.html`, `hi.html`, `spin.html`, `main.js`, `style.css`). The restored Red/Yellow rooms also load their original animated GIFs (about 270 KB combined with the shared reveal), with optimized posters when motion is off. Other scenes use the optimized assets under `assets/`; see [media notes](assets/README.md) for the reproducible conversion commands and size manifest.

The five silent video loops total about **7.06 MB**, compared with **147.32 MB** for their GIF sources (95.2% less). The current room loads its own video; the museum module and music load only when needed. Posters for the city are below 200 KB each. These are file-size comparisons, not a Lighthouse score or a measured mobile-network loading time.

## Browser verification

Before shipping changes, check:

1. Root URL: silent sound prompt → click/Enter starts intro loop → second click/Enter stops loop and plays transition. Test muted entry, Sound toggle, home Restart intro, Map replay, and silent direct room links.
2. City → every room, Map, browser Back/Forward and direct room links. Check the room and intro fades, quick successive navigation, restarting the intro during a fade, and switching Motion off mid-transition. Direct room links should render immediately.
3. Music start/pause, seeking, sound-off, volume, room changes and closing the player.
4. All seven original planet hover/focus/tap sounds, re-entry replay, Sound off, and room/page cleanup. Original Red/Yellow artwork and animated jagged cutouts, persistent stamps versus hover preview, yellow size changes, red fixed dots, right-click/Hue, and motion-off posters. Also check every other museum activity, touch/keyboard drawing, undo/clear and PNG preview/download.
5. Shop object dialogs, postcard download, Escape/focus return and hidden-star discovery persistence.
6. Motion off and reload, keyboard-only navigation, and images remaining visible when motion is off.
7. Full-screen cover, drag/keyboard pan, Fit art, museum planet reopening and panel focus return.
8. Widths of 320, 390, 700, 1024 and 1440 CSS pixels: no horizontal overflow, all controls reachable, no overlapping scene links or player controls. Check portrait and short landscape screens.

Test real iOS Safari and Android Chrome before a production launch: the desktop browser verifies responsive layout and pointer behavior, while native download/save behavior can differ on phones.
