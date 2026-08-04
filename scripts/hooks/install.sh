#!/bin/sh
# Git hooks 설치 스크립트
# 사용법: sh scripts/hooks/install.sh

HOOKS_DIR="$(git rev-parse --show-toplevel)/.git/hooks"
SCRIPT_DIR="$(git rev-parse --show-toplevel)/scripts/hooks"

for hook in pre-commit commit-msg pre-push; do
    src="$SCRIPT_DIR/$hook"
    dest="$HOOKS_DIR/$hook"

    chmod +x "$src"
    ln -sf "$src" "$dest"
    echo "설치 완료: $hook"
done

echo ""
echo "Git hooks 설치가 완료됐습니다."
