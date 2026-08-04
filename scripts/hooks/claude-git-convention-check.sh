#!/bin/bash
# PreToolUse 훅 — git commit 감지 시 git.md 컨벤션을 context에 자동 주입

INPUT=$(cat)

COMMAND=$(echo "$INPUT" | python3 -c "
import json, sys
try:
    d = json.load(sys.stdin)
    print(d.get('tool_input', {}).get('command', ''))
except:
    print('')
" 2>/dev/null)

if echo "$COMMAND" | grep -qE "git commit"; then
    ROOT=$(git rev-parse --show-toplevel 2>/dev/null)
    GIT_MD="$ROOT/.claude/conventions/git.md"
    if [ -f "$GIT_MD" ]; then
        python3 - "$GIT_MD" <<'PYEOF'
import json, sys
path = sys.argv[1]
content = open(path).read()
msg = "[git commit 전 컨벤션 자동 확인]\n\n" + content
print(json.dumps({"systemMessage": msg}))
PYEOF
    fi
fi

exit 0
