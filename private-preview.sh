#!/usr/bin/env bash
set -euo pipefail

root_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
preview_dir=""
server_pid=""
serve_started=0

cleanup() {
  if [[ "$serve_started" == 1 ]]; then
    tailscale serve --https=8443 off >/dev/null 2>&1 || true
  fi
  if [[ -n "$server_pid" ]]; then
    kill "$server_pid" >/dev/null 2>&1 || true
  fi
  if [[ -n "$preview_dir" ]]; then
    rm -rf "$preview_dir"
  fi
}
trap cleanup EXIT
trap 'exit 130' INT TERM

if ! command -v tailscale >/dev/null; then
  echo "请先在 Mac 上安装 Tailscale。" >&2
  exit 1
fi
status_json="$(tailscale status --json 2>/dev/null || true)"
if [[ -z "$status_json" ]] || ! printf '%s' "$status_json" | python3 -c 'import json,sys; s=sys.stdin.read(); sys.exit(0 if s.lstrip().startswith("{") and json.loads(s).get("BackendState") == "Running" else 1)'; then
  echo "请先打开 Tailscale，在 Mac 上登录并连接。" >&2
  exit 1
fi
if tailscale serve status --json 2>/dev/null | python3 -c 'import sys; sys.exit(":8443" not in sys.stdin.read())'; then
  echo "Tailscale HTTPS 8443 端口已有服务；为避免覆盖现有设置，预览未启动。" >&2
  exit 1
fi

preview_dir="$(mktemp -d "${TMPDIR:-/tmp}/seichi-collage.XXXXXX")"
for asset in index.html style.css app.js manifest.webmanifest sw.js icon-180.png icon-512.png; do
  cp "$root_dir/$asset" "$preview_dir/$asset"
done

python3 -m http.server 18765 --bind 127.0.0.1 --directory "$preview_dir" >/dev/null 2>&1 &
server_pid=$!
sleep 0.5
if ! kill -0 "$server_pid" >/dev/null 2>&1; then
  echo "本机网页服务未能启动，请检查 18765 端口是否已被占用。" >&2
  exit 1
fi

tailscale serve --bg --https=8443 http://127.0.0.1:18765
serve_started=1
echo "iPhone 上打开上方的 https:// 地址（端口 8443）。保持此终端窗口和 Mac 开机；按 Ctrl+C 停止预览。"
wait "$server_pid"
