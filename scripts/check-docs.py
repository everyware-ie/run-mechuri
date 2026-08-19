#!/usr/bin/env python3
"""기획 문서 정합성 검사.

사용법: python3 scripts/check-docs.py [--staged]

검사 항목
  [오류] 상대 링크가 실제 파일을 가리키는가
  [오류] 스펙 문서의 frontmatter 필수 필드와 status 유효값
  [오류] FRD의 derives_from이 실제 PRD를 가리키는가
  [정보] [확인 필요] 항목 집계

오류가 하나라도 있으면 종료 코드 1.
"""
import os
import re
import subprocess
import sys

ROOT = subprocess.run(
    ["git", "rev-parse", "--show-toplevel"], capture_output=True, text=True
).stdout.strip()

# frontmatter 필수 필드. 키는 type 값.
REQUIRED = {
    "prd": ["title", "product", "type", "status", "updated"],
    "frd": ["title", "product", "type", "status", "updated", "derives_from"],
    "decision": ["title", "product", "type", "status", "date"],
    "meeting": ["title", "product", "type", "updated"],
}
VALID_STATUS = {
    "prd": ["draft", "review", "approved"],
    "frd": ["draft", "review", "approved"],
    "decision": ["proposed", "decided", "deferred", "rejected"],
    "meeting": [],
}
# frontmatter를 요구하는 경로. 인덱스와 안내 문서는 제외한다.
SPEC_DIRS = ("docs/specs/prd", "docs/specs/frd", "docs/decisions", "docs/meetings")
EXEMPT_NAMES = ("README.md", "index.md")

errors = []
notes = []


def rel(path):
    return os.path.relpath(path, ROOT)


def parse_frontmatter(text):
    if not text.startswith("---\n"):
        return None
    end = text.find("\n---", 4)
    if end == -1:
        return None
    body = text[4:end]
    fm = {}
    for line in body.split("\n"):
        m = re.match(r"^([a-z_]+):\s*(.*)$", line)
        if m:
            fm[m.group(1)] = m.group(2).strip()
    return fm


def all_docs():
    for dirpath, dirnames, filenames in os.walk(os.path.join(ROOT, "docs")):
        dirnames[:] = [d for d in dirnames if d != ".git"]
        for name in filenames:
            if name.endswith(".md"):
                yield os.path.join(dirpath, name)


def check_links(path, text):
    here = os.path.dirname(path)
    for m in re.finditer(r"\]\(([^)\s]+)\)", text):
        target = m.group(1)
        if target.startswith(("http://", "https://", "#", "mailto:")):
            continue
        resolved = os.path.normpath(os.path.join(here, target.split("#")[0]))
        if not os.path.exists(resolved):
            errors.append(f"{rel(path)}: 깨진 링크 -> {target}")


def check_frontmatter(path, text):
    r = rel(path)
    if not r.startswith(SPEC_DIRS) or os.path.basename(path) in EXEMPT_NAMES:
        return
    fm = parse_frontmatter(text)
    if fm is None:
        errors.append(f"{r}: frontmatter가 없다")
        return
    doctype = fm.get("type")
    if doctype not in REQUIRED:
        errors.append(f"{r}: type이 없거나 알 수 없는 값이다 ({doctype})")
        return
    for field in REQUIRED[doctype]:
        if field not in fm:
            errors.append(f"{r}: frontmatter에 {field}가 없다")
    status = fm.get("status")
    valid = VALID_STATUS[doctype]
    if valid and status and status not in valid:
        errors.append(f"{r}: status 값이 유효하지 않다 ({status}) - 허용: {'/'.join(valid)}")
    if doctype == "frd":
        src = fm.get("derives_from", "")
        if src:
            resolved = os.path.normpath(os.path.join(os.path.dirname(path), src))
            if not os.path.exists(resolved):
                errors.append(f"{r}: derives_from이 가리키는 파일이 없다 -> {src}")


def check_open_items(path, text):
    n = text.count("[확인 필요]")
    if n:
        notes.append((rel(path), n))


def main():
    for path in sorted(all_docs()):
        with open(path, encoding="utf-8") as f:
            text = f.read()
        check_links(path, text)
        check_frontmatter(path, text)
        check_open_items(path, text)

    if notes:
        print("[확인 필요] 열려 있는 항목")
        for r, n in sorted(notes, key=lambda x: -x[1]):
            print(f"  {n:>3}건  {r}")
        print()

    if errors:
        print(f"오류 {len(errors)}건")
        for e in errors:
            print(f"  {e}")
        return 1

    print("문서 정합성 검사 통과")
    return 0


if __name__ == "__main__":
    sys.exit(main())
