#!/usr/bin/env bash
# Build the Chrome add-on into dist/chrome. A private local/defaults.json (never committed)
# seeds first-run settings for your own copy, e.g. {"shortcuts": ["books", "science"]}.
set -euo pipefail
cd "$(dirname "$0")/.."
out=dist/chrome
rm -rf "$out" && mkdir -p "$out"
cp src/content/respawn.js src/content/respawn.css "$out"/
cp extension/manifest.json "$out"/
if [ -f local/defaults.json ]; then
  printf 'window.__RS_CFG = %s;\n' "$(cat local/defaults.json)" > "$out/defaults.js"
  python3 - "$out/manifest.json" <<'PY'
import json, sys
p = sys.argv[1]; m = json.load(open(p))
m["content_scripts"][0]["js"] = ["defaults.js"] + m["content_scripts"][0]["js"]
json.dump(m, open(p, "w"), indent=2)
PY
fi
node --check "$out/respawn.js"
python3 -c "import json,sys; json.load(open(sys.argv[1]))" "$out/manifest.json"
echo "built $out"
