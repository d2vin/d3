#!/usr/bin/env python3
"""Build browser media from the original D3 GIF artwork.

Run from the repository root with Python 3.9+:
  python3 -m venv /tmp/d3-media
  /tmp/d3-media/bin/pip install -r scripts/media-requirements.txt
  /tmp/d3-media/bin/python scripts/optimize-media.py

The original files stay untouched. Outputs are muted H.264 MP4s with fast-start
metadata and WebP posters. Set FFMPEG to use an existing ffmpeg executable.
"""
from pathlib import Path
import argparse
import json
import os
import subprocess

from PIL import Image, ImageOps
import imageio_ffmpeg

ROOT = Path(__file__).resolve().parents[1]
DEST = ROOT / 'assets'
FFMPEG = os.environ.get('FFMPEG') or imageio_ffmpeg.get_ffmpeg_exe()
# source, output basename, poster frame, output FPS, constant rate factor
MOVIES = [
    ('homedark.gif', 'home-dark', 0, 6, 28),
    ('homelight.gif', 'home-light', 0, 6, 28),
    ('recordstore.gif', 'record-store', 0, 3, 28),
    ('shop.gif', 'shop', 0, 10, 24),
    ('LoadingScreen.gif', 'entrance', 60, 30, 24),
]
POSTERS = [
    ('backround-museum.gif', 'museum'),
    ('color-backround.gif', 'color-room'),
    ('yellowbackground.gif', 'yellow-room'),
    ('redplanet1.gif', 'red-planet'),
    ('yellowplanet1.gif', 'yellow-planet'),
]


def poster(source, basename, frame=0):
    with Image.open(ROOT / source) as im:
        im.seek(frame)
        # Preserve alpha in the planet artwork. Prefer lossless pixel edges;
        # use high-quality WebP for a large, grain-heavy city poster.
        rgba = im.convert('RGBA')
        target = DEST / f'{basename}.webp'
        rgba.save(target, lossless=True, method=6)
        if target.stat().st_size > 190_000:
            rgba.save(target, quality=95, method=6)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    names = [item[1] for item in MOVIES + POSTERS]
    parser.add_argument('--only', nargs='+', choices=names, help='Rebuild only these basenames')
    args = parser.parse_args()
    DEST.mkdir(exist_ok=True)
    for source, basename, frame, fps, crf in MOVIES:
        if args.only and basename not in args.only:
            continue
        poster(source, basename, frame)
        target = DEST / f'{basename}.mp4'
        temporary = DEST / f'.{basename}.tmp.mp4'
        subprocess.run([
            FFMPEG, '-hide_banner', '-loglevel', 'error', '-y',
            '-i', str(ROOT / source), '-an',
            '-vf', f'fps={fps},pad=ceil(iw/2)*2:ceil(ih/2)*2',
            '-c:v', 'libx264', '-preset', 'medium', '-crf', str(crf),
            '-pix_fmt', 'yuv420p', '-movflags', '+faststart',
            '-threads', '2', str(temporary),
        ], check=True)
        temporary.replace(target)
        print(f'{target.relative_to(ROOT)}: {target.stat().st_size:,} bytes', flush=True)
    for source, basename in POSTERS:
        if not args.only or basename in args.only:
            poster(source, basename)
    with Image.open(ROOT / 'homelight.gif') as im:
        ImageOps.fit(im.convert('RGB'), (1200, 630), method=Image.Resampling.NEAREST).save(
            DEST / 'social-preview.jpg', quality=88, optimize=True)
    manifest = {}
    for source, basename, frame, fps, crf in MOVIES:
        target = DEST / f'{basename}.mp4'
        if not target.exists() or not (DEST / f'{basename}.webp').exists():
            continue
        manifest[basename] = {
            'source': source,
            'sourceBytes': (ROOT / source).stat().st_size,
            'video': f'assets/{basename}.mp4',
            'videoBytes': target.stat().st_size,
            'poster': f'assets/{basename}.webp',
            'posterBytes': (DEST / f'{basename}.webp').stat().st_size,
        }
    for source, basename in POSTERS:
        if not (DEST / f'{basename}.webp').exists():
            continue
        manifest[basename] = {
            'source': source,
            'poster': f'assets/{basename}.webp',
            'posterBytes': (DEST / f'{basename}.webp').stat().st_size,
        }
    (DEST / 'media-manifest.json').write_text(json.dumps(manifest, indent=2) + '\n')


if __name__ == '__main__':
    main()
