#!/bin/bash
# PreToolUse 훅 — 구현 착수 시점 게이트
#
# 구현 메인 소스(backend/src/main, frontend/app·components·features·lib)를
# 편집하려 할 때, 이 브랜치에 FRD 확인 스텁(docs/product/features/<기능>.md,
# 허브 FRD 링크 포함)이 하나도 없으면 편집을 차단한다(exit 2).
#
# 게이트 대상 판정은 "무엇을 편집하는가"(메인 구현 소스)를 우선한다:
# - 테스트 파일(backend/src/test, *.test.js, *.spec.js)은 대상 아님 —
#   TDD test-first를 브랜치와 무관하게 허용한다.
# - 브랜치 타입 chore/docs는 면제 — FRD 없이 소스를 정당하게 건드리는 작업.
#   (test는 위 경로 제외로 처리하므로 타입 면제에서 뺐다)
#
# 목적: mechuri-docs의 FRD가 approved라 하더라도, "바로 진행"으로 확인 단계를
# 건너뛰지 못하게 한다. 스텁을 만들려면 허브 FRD 링크를 스텁에 적어야 하므로,
# 착수 직전 AI가 FRD를 가져와 사용자에게 보여주는 확인 단계가 강제된다.
#
# 강제 수준(정직한 한계):
# - 강제하는 것: "이 브랜치에서 FRD 확인 체크포인트(스텁)가 최소 1회 실행됐다"
# - 강제하지 못하는 것:
#     · 편집 중인 소스 파일이 정확히 그 스텁의 기능인지 (파일→기능 매핑은 shell 범위 밖)
#     · 사람이 실제로 FRD를 정독했는지
#   → 즉 파일 단위가 아니라 "브랜치 단위" 체크포인트다.
#
# 비용: 네트워크 호출 없음(로컬 git·파일 검사만). 스텁이 생긴 뒤의 편집은
# 즉시 통과하므로 편집마다 부담을 주지 않는다.

block() {
    local branch="$1" rel="$2"
    cat >&2 <<MSG
[pre-implementation] 구현 착수 전 FRD 확인 단계가 필요합니다.

편집 대상: $rel
현재 브랜치: $branch

이 브랜치에 FRD 확인 스텁이 docs/product/features/ 에 없습니다.
아직 mechuri-docs의 approved FRD를 가져와 확인하는 단계를 거치지 않았습니다.

착수 전 반드시:
  1. mechuri-docs에서 이 기능의 FRD(status: approved)를 가져와 사용자에게 보여준다
  2. 사용자 최종 확인을 받는다
  3. docs/product/features/<기능>.md 스텁을 만든다
     (허브 FRD 링크 + 참조 시점/SHA + 구현 노트 — 템플릿: docs/product/features/README.md)

스텁을 만든 뒤 다시 구현을 진행하세요.
approved FRD라도 이 확인 단계는 건너뛸 수 없습니다.
MSG
    exit 2
}

block_no_base() {
    cat >&2 <<MSG
[pre-implementation] 기준 ref(origin/main)를 확인할 수 없어 안전하게 차단합니다.

새 스텁과 기존 스텁을 구분할 기준 브랜치가 없어(얕은 클론 등),
확인 단계 수행 여부를 신뢰할 수 없습니다.

  git fetch origin

를 실행해 origin/main을 확보한 뒤 다시 진행하세요.
MSG
    exit 2
}

INPUT=$(cat)

FILE_PATH=$(echo "$INPUT" | python3 -c "
import json, sys
try:
    d = json.load(sys.stdin)
    print(d.get('tool_input', {}).get('file_path', ''))
except:
    print('')
" 2>/dev/null)

[ -z "$FILE_PATH" ] && exit 0

ROOT=$(git rev-parse --show-toplevel 2>/dev/null) || exit 0
REL="${FILE_PATH#$ROOT/}"

# 테스트 파일은 게이트 대상 아님 — TDD test-first를 브랜치 무관하게 허용
case "$REL" in
    backend/src/test/*|*.test.js|*.spec.js)
        exit 0
        ;;
esac

# 구현 메인 소스만 대상 — 그 외(docs, 설정, 스크립트, 빌드 등)는 통과
case "$REL" in
    backend/src/main/*|frontend/app/*|frontend/components/*|frontend/features/*|frontend/lib/*)
        ;;
    *)
        exit 0
        ;;
esac

BRANCH=$(git -C "$ROOT" rev-parse --abbrev-ref HEAD 2>/dev/null)

# 보호 브랜치는 PR로만 변경되므로 게이트 대상 아님
case "$BRANCH" in
    main|develop) exit 0 ;;
esac

# 차단 제외 목록 — FRD와 무관한 작업 유형은 면제.
# chore/docs만 면제(FRD 없이 메인 소스를 정당하게 건드리는 작업).
# test는 위에서 경로로 제외했으므로 타입 면제 불필요.
# 나머지(feature/fix/hotfix/refactor 등)는 모두 게이트 적용.
TYPE=$(echo "$BRANCH" | cut -d'/' -f2)
case "$TYPE" in
    chore|docs) exit 0 ;;
esac

FEATURES_DIR="$ROOT/docs/product/features"
[ -d "$FEATURES_DIR" ] || block "$BRANCH" "$REL"

# 기준 ref 결정: origin/main 우선(로컬 main의 stale 문제 회피), 없으면 main.
# 둘 다 없으면(얕은 클론 등) fail-closed로 차단한다.
BASE_REF=""
for ref in origin/main main; do
    if git -C "$ROOT" rev-parse --verify "$ref" >/dev/null 2>&1; then
        BASE_REF="$ref"
        break
    fi
done
[ -z "$BASE_REF" ] && block_no_base

# 기준 ref에 이미 있는 스텁 목록 (이 브랜치가 "새로" 만든 확인을 가려내기 위함)
BASE_STUBS=$(git -C "$ROOT" ls-tree -r --name-only "$BASE_REF" -- docs/product/features/ 2>/dev/null \
    | grep -E '\.md$' | grep -v 'README.md')

# 워킹트리의 구현 노트 중 기준 ref에 없고 FRD 링크를 담은 것이 하나라도 있으면 통과
# (2026-08-03 이관: FRD가 이 레포 docs/specs/frd/ 로 이동. 로컬 상대경로를 우선 인정하고,
#  이관 전 작성된 허브 URL 형식도 하위호환으로 계속 인정한다)
CONFIRMED=0
while IFS= read -r stub; do
    [ -z "$stub" ] && continue
    base=$(basename "$stub")
    [ "$base" = "README.md" ] && continue
    relstub="docs/product/features/$base"
    echo "$BASE_STUBS" | grep -qx "$relstub" && continue
    if grep -qE "(specs/frd/[A-Za-z0-9._-]+\.md|mechuri-docs.*specs/frd)" "$stub" 2>/dev/null; then
        CONFIRMED=1
        break
    fi
done <<EOF
$(find "$FEATURES_DIR" -maxdepth 1 -name '*.md' 2>/dev/null)
EOF

[ "$CONFIRMED" -eq 1 ] && exit 0

block "$BRANCH" "$REL"
