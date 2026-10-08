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

The check runs JavaScript syntax checks and Node's built-in test runner. There are no npm dependencies to install. Tests cover routes and discovery-state recovery, audio-time formatting, weekly rotation, cover/fit geometry and pan bounds, scaled pointer coordinates, all seven museum activities, stroke undo/clear, bounded drawings, and export/cleanup state. The museum adapter tests behavior; browser checks are still needed for rendering, native media and actual downloads.

## Rooms and controls

- `#home`: the city, a light reveal, accessible room links and a hidden star.
- `#records`: the existing record-store track, with play/pause, seek and volume. Playback continues while navigating rooms and stops when the player is closed or sound is switched off.
- `#museum`: seven canvas experiments; the featured planet rotates weekly on a UTC schedule. Use pointer/touch input, or focus the canvas and use arrow keys + Enter. Each planet keeps its drawing while the museum is open. Save an image before leaving the room; drawings are not stored after navigation/reload.
- `#shop`: stories about the existing artwork, a free city postcard and links into the listening room and museum. This is an art collection, not an inventory or checkout.
- `#observatory`: the hidden city view, unlocked by finding the star. Discoveries, motion and sound preferences are stored only in this browser. Storage failures do not prevent exploring.

Opening the root URL shows a click-to-start sound prompt. The first click (or Enter) starts the full-screen D3 title, starfield, and original intro loop; the second click enters the city with the original transition sound. Start without sound and the Sound toggle provide muted access. Direct room links go straight into the world without starting audio. Restart intro is visible on the home screen and Replay entrance is also in the Map; both stop existing music and reset the full two-step sequence. The browser's Back/Forward buttons work with room navigation.

Motion follows `prefers-reduced-motion` and Save-Data by default and can be changed with the Motion button. Posters remain usable if video playback fails. The site never automatically starts audible music. Artwork fills the viewport while preserving its source aspect ratio. On narrow screens, drag the artwork horizontally or focus it and use Left/Right arrows to explore; Home recenters it. Fit art shows the complete composition. The same fit/fill control works for the full-screen museum canvas. Compact navigation and music controls float above the artwork, while room details open in a drawer. Map links remain available when scene entrances are outside the visible crop. Native dialogs provide keyboard focus management.

## Assets

Original GIFs and audio are retained at the root, including the unlinked legacy experiments (`bedlam.html`, `hi.html`, `spin.html`, `main.js`, `style.css`). The current site uses the optimized assets under `assets/`; see [media notes](assets/README.md) for the reproducible conversion commands and size manifest.

The five silent video loops total about **7.06 MB**, compared with **147.32 MB** for their GIF sources (95.2% less). The current room loads its own video; the museum module and music load only when needed. Posters for the city are below 200 KB each. These are file-size comparisons, not a Lighthouse score or a measured mobile-network loading time.

## Browser verification

Before shipping changes, check:

1. Root URL: silent sound prompt → click/Enter starts intro loop → second click/Enter stops loop and plays transition. Test muted entry, Sound toggle, home Restart intro, Map replay, and silent direct room links.
2. City → every room, Map, browser Back/Forward and direct room links.
3. Music start/pause, seeking, sound-off, volume, room changes and closing the player.
4. Every museum activity, mouse/touch drawing, keyboard drawing, undo/clear and PNG preview/download.
5. Shop object dialogs, postcard download, Escape/focus return and hidden-star discovery persistence.
6. Motion off and reload, keyboard-only navigation, and images remaining visible when motion is off.
7. Full-screen cover, drag/keyboard pan, Fit art, museum planet reopening and panel focus return.
8. Widths of 320, 390, 700, 1024 and 1440 CSS pixels: no horizontal overflow, all controls reachable, no overlapping scene links or player controls. Check portrait and short landscape screens.

Test real iOS Safari and Android Chrome before a production launch: the desktop browser verifies responsive layout and pointer behavior, while native download/save behavior can differ on phones.
