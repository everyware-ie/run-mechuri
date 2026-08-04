#!/bin/bash
# PostToolUse 훅 — gh pr create 감지 후 AI 메타데이터 자동 삽입

INPUT=$(cat)

# Bash 도구의 실행 명령 추출
COMMAND=$(echo "$INPUT" | python3 -c "
import json, sys
try:
    d = json.load(sys.stdin)
    print(d.get('tool_input', {}).get('command', ''))
except:
    pass
" 2>/dev/null)

# gh pr create 가 아니면 종료
if ! echo "$COMMAND" | grep -q "gh pr create"; then
    exit 0
fi

# PR 번호 획득 (현재 브랜치 기준)
PR_NUMBER=$(gh pr view --json number -q .number 2>/dev/null)
if [ -z "$PR_NUMBER" ]; then
    exit 0
fi

# stats 생성
STATS=$(cd "$(git rev-parse --show-toplevel)" && python3 scripts/ai-session-stats.py 2>/dev/null)
if [ -z "$STATS" ]; then
    exit 0
fi

# 현재 PR 본문 + stats 병합
CURRENT_BODY=$(gh pr view "$PR_NUMBER" --json body -q .body 2>/dev/null)
gh pr edit "$PR_NUMBER" --body "${CURRENT_BODY}

${STATS}" 2>/dev/null

echo "{\"systemMessage\": \"✅ AI 메타데이터가 PR #${PR_NUMBER}에 자동 추가되었습니다.\"}"
