# Browser media

These files are derived from the artwork already present in the repository. The original GIFs remain at the repository root.

- `home-dark`, `home-light`, `record-store`, `shop`, and `entrance` each have a silent H.264 MP4 loop and a WebP poster. All are 800 × 450 (16:9).
- `museum.webp`, `color-room.webp`, `yellow-room.webp`, `red-planet.webp`, and `yellow-planet.webp` preserve the 1137 × 796 composition of the corresponding original artwork. The planet images contain the planet at its original position within that canvas.
- `social-preview.jpg` is a 1200 × 630 crop of the original color city artwork.
- `favicon.svg` is a simple pixel star using the site's night and lavender colors.
- `media-manifest.json` records source files and the exact output byte sizes.

MP4s use the widely supported H.264 codec, `yuv420p` pixel format, and fast-start metadata. Their audio is intentionally absent; existing site soundtracks stay independently controllable. Home and record-store videos retain the original low frame rates. Posters use lossless WebP where practical, and quality 95 for the two city images to keep them under 200 KB.

Rebuild the derived media from the repository root:

```sh
python3 -m venv /tmp/d3-media
/tmp/d3-media/bin/pip install -r scripts/media-requirements.txt
/tmp/d3-media/bin/python scripts/optimize-media.py
```

Use `--only home-dark home-light` to rebuild selected outputs. `FFMPEG` may point to an existing ffmpeg executable; otherwise the pinned `imageio-ffmpeg` distribution supplies it. Video outputs are replaced only after encoding succeeds.
