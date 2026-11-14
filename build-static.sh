#!/usr/bin/env bash
set -euo pipefail

root_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
mkdir -p "$root_dir/dist"
for asset in index.html style.css app.js manifest.webmanifest sw.js icon-180.png icon-512.png; do
  cp "$root_dir/$asset" "$root_dir/dist/$asset"
done
# GitHub Pages can serve these files directly without a Jekyll build.
touch "$root_dir/dist/.nojekyll"
