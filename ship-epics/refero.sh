#!/usr/bin/env bash
# Call a Refero MCP tool over HTTP and print its text result.
# Usage: refero.sh <tool> '<json arguments>'
#   refero.sh refero_search_screens '{"query":"kanban empty state","platform":"web"}'
#   refero.sh refero_search_flows   '{"query":"create a page","platform":"web"}'
#   refero.sh refero_get_screen     '{"ids":["<uuid>"]}'
# Tools: refero_search_screens, refero_get_similar_screens, refero_get_screen_image,
#        refero_get_screen, refero_search_flows, refero_get_flow, refero_search_styles,
#        refero_get_style, refero_search_sites, refero_search_apps
set -eo pipefail
TOOL="$1"; ARGS="${2:-}"; [ -z "$ARGS" ] && ARGS="{}"
# Token: $REFERO_AUTH if set ("Bearer mcp-…"), else the refero MCP server's header in ~/.claude.json.
AUTH="${REFERO_AUTH:-}"
[ -z "$AUTH" ] && AUTH=$(python3 - <<'PY'
import json, os
d = json.load(open(os.path.expanduser("~/.claude.json")))
servers = [d.get("mcpServers", {})] + [p.get("mcpServers", {}) for p in d.get("projects", {}).values()]
print(next(s["refero"]["headers"]["Authorization"] for s in servers if "refero" in s))
PY
)
U=https://api.refero.design/mcp
H=(-H "Authorization: $AUTH" -H "Content-Type: application/json" -H "Accept: application/json, text/event-stream")
R=$(curl -s -i -m 30 "${H[@]}" -X POST $U -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"pond-research","version":"0"}}}')
SID=$(echo "$R" | grep -i '^mcp-session-id:' | awk '{print $2}' | tr -d '\r' || true)
S=(); [ -n "$SID" ] && S=(-H "Mcp-Session-Id: $SID")
curl -s -m 30 "${H[@]}" ${S[@]+"${S[@]}"} -X POST $U -d '{"jsonrpc":"2.0","method":"notifications/initialized"}' >/dev/null
BODY=$(python3 -c 'import json,sys; print(json.dumps({"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":sys.argv[1],"arguments":json.loads(sys.argv[2])}}))' "$TOOL" "$ARGS")
curl -s -m 90 "${H[@]}" ${S[@]+"${S[@]}"} -X POST $U -d "$BODY" | sed 's/^data: //' | python3 -c '
import json,sys
for line in sys.stdin:
    line=line.strip()
    if not line.startswith("{"): continue
    d=json.loads(line)
    if "error" in d: print("error:", d["error"]); continue
    for c in d.get("result",{}).get("content",[]):
        if c.get("type")=="text": print(c["text"])
        elif c.get("type")=="image": print("[image returned]")'
