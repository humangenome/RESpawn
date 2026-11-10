#!/usr/bin/env bash
# Build RESpawn for Chrome and Firefox.
#   scripts/build.sh          your own copy: dist/chrome and dist/firefox. A private local/defaults.json
#                             (never committed) seeds first-run settings, e.g. {"shortcuts": ["books", "science"]}.
#   scripts/build.sh --store  store packages: dist/store/respawn-chrome-<version>.zip and
#                             respawn-firefox-<version>.zip, never with local/defaults.json in them.
set -euo pipefail
cd "$(dirname "$0")/.."
store=0; [ "${1:-}" = "--store" ] && store=1
base=dist; [ $store = 1 ] && base=dist/store
rm -rf "$base/chrome" "$base/firefox"

for target in chrome firefox; do
  out="$base/$target"
  mkdir -p "$out"
  cp src/content/respawn.js src/content/respawn.css "$out"/
  cp src/background/background.js "$out"/
  [ -d extension/icons ] && cp -r extension/icons "$out"/
  python3 - "$target" "$out" "$store" <<'PY'
import json, os, sys
target, out, store = sys.argv[1], sys.argv[2], sys.argv[3] == "1"
m = json.load(open("extension/manifest.json"))
if not os.path.isdir("extension/icons"):
    m.pop("icons", None)
if target == "firefox":
    # Firefox needs its own id and, for new add-ons, a statement of what data leaves the browser: none.
    # "gecko_android" lists it for Firefox on Android phones too: the phone pass (11/10) made post pages fit the screen,
    # put the shortcut bar under Reddit's phone header and sized everything for thumbs (respawn.css, 640 px and narrower).
    m["browser_specific_settings"] = {"gecko": {"id": "respawn@humangenome", "strict_min_version": "142.0",
                                                "data_collection_permissions": {"required": ["none"]}},
                                      "gecko_android": {"strict_min_version": "142.0"}}
    # Firefox allows names up to 45 characters
    if len(m["name"]) > 45:
        m["name"] = m.get("firefox_name") or m["short_name"]
    # Firefox runs the background helper as a background script, not a service worker
    if "background" in m:
        m["background"] = {"scripts": [m["background"]["service_worker"]]}
m.pop("firefox_name", None)
if not store and os.path.isfile("local/defaults.json"):
    with open(os.path.join(out, "defaults.js"), "w") as f:
        f.write("window.__RS_CFG = %s;\n" % json.dumps(json.load(open("local/defaults.json"))))
    m["content_scripts"][0]["js"] = ["defaults.js"] + m["content_scripts"][0]["js"]
json.dump(m, open(os.path.join(out, "manifest.json"), "w"), indent=2)
PY
  node --check "$out/respawn.js"; node --check "$out/background.js"
done

if [ $store = 1 ]; then
  v=$(python3 -c "import json;print(json.load(open('extension/manifest.json'))['version'])")
  for target in chrome firefox; do
    [ -f "$base/$target/defaults.js" ] && { echo "private settings found in the store build" >&2; exit 1; }
    rm -f "$base/respawn-$target-$v.zip"
    (cd "$base/$target" && zip -qr -X "../respawn-$target-$v.zip" .)
  done
  echo "built $base/respawn-chrome-$v.zip and $base/respawn-firefox-$v.zip"
else
  echo "built $base/chrome and $base/firefox"
fi
