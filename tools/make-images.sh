#!/usr/bin/env bash
# Rasterise the social card and the icons from the one SVG each.
#
# Committed as PNGs because that is what a social crawler and a home screen
# want, and generated from source because a card whose wording drifts from the
# page is worse than none.
set -euo pipefail

cd "$(dirname "$0")/.."

magick -background none tools/og-image.svg -resize 1200x630 public/og-image.png
magick -background '#0b0e15' tools/icon.svg -resize 512x512 public/icon-512.png
magick -background '#0b0e15' tools/icon.svg -resize 192x192 public/icon-192.png
magick -background '#0b0e15' tools/icon.svg -resize 180x180 public/apple-touch-icon.png
magick -background none tools/icon-maskable.svg -resize 512x512 public/icon-maskable-512.png

echo "written:"
ls -la public/*.png | awk '{print "  " $NF, $5 " bytes"}'
