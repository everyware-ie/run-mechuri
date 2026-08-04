#!/bin/bash
# PreToolUse 훅 — gh pr create 감지 시 PR 체크리스트 자동 주입 + FRD 승인 상태 게이트
#
# 게이트: 이 PR이 참조하는 mechuri-docs FRD의 status가 approved가 아니면 PR
# 생성을 차단한다(exit 2). FRD 참조는 아래 세 경로에서 모은다:
#   1) gh pr create 커맨드라인의 인라인 본문(--body "..." 등)
#   2) --body-file / -F 로 지정한 파일 내용
#   3) 이 브랜치가 새로 만든 확인 스텁(docs/product/features/*.md)의 FRD 링크
#      → 본문을 어떤 방식으로 넘기든(--fill·에디터·stdin 포함) 스텁 기반으로 검증
# 어떤 경로에서도 FRD 링크가 없으면 검사 대상이 아니다(chore/docs 등).
# 허브 접근 실패(네트워크 등) 시에는 차단하지 않고 경고만 한다.

INPUT=$(cat)

COMMAND=$(echo "$INPUT" | python3 -c "
import json, sys
try:
    d = json.load(sys.stdin)
    print(d.get('tool_input', {}).get('command', ''))
except:
    print('')
" 2>/dev/null)

if ! echo "$COMMAND" | grep -q "gh pr create"; then
    exit 0
fi

ROOT=$(git rev-parse --show-toplevel 2>/dev/null)

# ── 검사 대상 텍스트(corpus) 수집 ──
CORPUS="$COMMAND"

# --body-file / -F 로 넘긴 파일 내용 포함 ('-'(stdin)는 훅 시점에 읽을 수 없음)
BODY_FILE=$(echo "$COMMAND" | grep -oE '(--body-file|-F)[= ]+[^ ]+' | head -1 | sed -E 's/^(--body-file|-F)[= ]+//')
if [ -n "$BODY_FILE" ] && [ "$BODY_FILE" != "-" ]; then
    [ -f "$BODY_FILE" ] || BODY_FILE="$ROOT/$BODY_FILE"
    if [ -f "$BODY_FILE" ]; then
        CORPUS="$CORPUS
$(cat "$BODY_FILE")"
    fi
fi

# 이 브랜치가 새로 만든 확인 스텁 내용 포함(본문 전달 방식과 무관하게 검증)
if [ -n "$ROOT" ] && [ -d "$ROOT/docs/product/features" ]; then
    BASE_REF=""
    for ref in origin/main main; do
        git -C "$ROOT" rev-parse --verify "$ref" >/dev/null 2>&1 && { BASE_REF="$ref"; break; }
    done
    BASE_STUBS=$(git -C "$ROOT" ls-tree -r --name-only "$BASE_REF" -- docs/product/features/ 2>/dev/null \
        | grep -E '\.md$' | grep -v 'README.md')
    while IFS= read -r stub; do
        [ -z "$stub" ] && continue
        base=$(basename "$stub")
        [ "$base" = "README.md" ] && continue
        relstub="docs/product/features/$base"
        echo "$BASE_STUBS" | grep -qx "$relstub" && continue
        CORPUS="$CORPUS
$(cat "$stub")"
    done <<EOF
$(find "$ROOT/docs/product/features" -maxdepth 1 -name '*.md' 2>/dev/null)
EOF
fi

# ── FRD 참조 (ref, path) 추출 — 링크의 ref(브랜치/태그/커밋)를 보존 ──
# 2026-08-03 이관: FRD 정본이 이 레포 docs/specs/frd/ 로 이동.
#   ref="local" → 로컬 파일에서 status 확인
#   ref=<브랜치> → 이관 전 형식(허브 URL), 하위호환으로 gh api 조회
FRD_REFS=$(CORPUS="$CORPUS" python3 <<'PYEOF' 2>/dev/null
import os, re
corpus = os.environ.get("CORPUS", "")
seen = set()
out = []
# 로컬 상대경로 (예: ../../specs/frd/session.md, docs/specs/frd/session.md)
for m in re.finditer(r'(?:\.{1,2}/)*(?:docs/)?specs/frd/([A-Za-z0-9._-]+\.md)', corpus):
    out.append(("local", "docs/specs/frd/" + m.group(1)))
# 하위호환: 이관 전 허브 절대 URL
for m in re.finditer(r'mechuri-docs/blob/([^/\s]+)/(products/\S+?/specs/frd/[^\s]+?\.md)', corpus):
    out.append((m.group(1), m.group(2)))
for ref, path in out:
    if (ref, path) in seen:
        continue
    seen.add((ref, path))
    print(ref + "\t" + path)
PYEOF
)

if [ -n "$FRD_REFS" ]; then
    BLOCKED=""
    UNVERIFIED=""

    while IFS=$'\t' read -r ref path; do
        [ -z "$path" ] && continue
        if [ "$ref" = "local" ]; then
            if [ -f "$ROOT/$path" ]; then
                RAW=$(cat "$ROOT/$path")
            else
                UNVERIFIED="${UNVERIFIED}  - $path (이 레포에 해당 FRD 파일이 없음 — 경로 확인)\n"
                continue
            fi
        else
            RAW=$(gh api "repos/everyware-ie/mechuri-docs/contents/$path?ref=$ref" -H "Accept: application/vnd.github.raw" 2>/dev/null)
            if [ -z "$RAW" ]; then
                UNVERIFIED="${UNVERIFIED}  - $path @${ref} (허브 접근 실패 — 네트워크 또는 권한 확인)\n"
                continue
            fi
        fi
        STATUS=$(echo "$RAW" | grep -m1 -E "^status:" | sed -E 's/^status:[[:space:]]*//')
        if [ "$STATUS" != "approved" ]; then
            BLOCKED="${BLOCKED}  - $path @${ref} (현재 status: ${STATUS:-알수없음})\n"
        fi
    done <<< "$FRD_REFS"

    if [ -n "$BLOCKED" ]; then
        echo "[pre-pr-checklist] 이 PR이 참조하는 FRD가 아직 approved 상태가 아닙니다:" >&2
        echo -e "$BLOCKED" >&2
        echo "허브에서 팀 검토를 마치고 status: approved로 갱신한 뒤 PR을 생성하세요." >&2
        echo "(CLAUDE.md: approved 아닌 FRD는 구현 근거가 아니다)" >&2
        exit 2
    fi

    if [ -n "$UNVERIFIED" ]; then
        echo "[pre-pr-checklist] 경고 — 다음 FRD의 승인 상태를 확인하지 못했습니다 (차단하지 않음):" >&2
        echo -e "$UNVERIFIED" >&2
    fi
fi

python3 -c "
import json
msg = '''[PR 생성 전 체크리스트]

- [ ] 브랜치 네이밍 준수? (형식: <작업자>/<타입>/<기능>)
- [ ] 라벨 붙였나? (커밋 타입과 동일 — chore/feat/fix/docs 등)
- [ ] 단일 목적 PR인가? (스코프 오염 없나)
- [ ] 관련 docs 업데이트 필요한 변경 완료하였는가?
- [ ] 세션 중 발견한 범위 외 내용들을 별도 깃허브 이슈로 기록해두었는가
- [ ] 관련 mechuri-docs FRD가 있다면 status: approved인가? (본문·스텁 링크로 자동 검증됨)'''
print(json.dumps({'systemMessage': msg}))
"

exit 0
