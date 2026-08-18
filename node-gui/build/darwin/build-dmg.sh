#!/usr/bin/env bash
set -euo pipefail

version="${1:-0.1.1-dev}"
architecture="${2:-apple-silicon}"
repo_root="$(cd "$(dirname "$0")/../../.." && pwd)"
app="$repo_root/node-gui/build/bin/zonn-node.app"
output_dir="$repo_root/node-gui/build/installer"
staging="$repo_root/node-gui/build/dmg-staging"

mkdir -p "$app/Contents/Resources" "$output_dir"
install -m 0755 "$repo_root/node-gui/build/worker/inference-worker" \
  "$app/Contents/Resources/inference-worker"
install -m 0644 "$repo_root/llm-runner/inference_worker.py" \
  "$app/Contents/Resources/inference_worker.py"

rm -rf "$staging"
mkdir -p "$staging"
cp -R "$app" "$staging/Zonn Node.app"
ln -s /Applications "$staging/Applications"

hdiutil create -volname "Zonn Node" -srcfolder "$staging" -ov -format UDZO \
  "$output_dir/Zonn-Node-${version}-macOS-${architecture}.dmg"
