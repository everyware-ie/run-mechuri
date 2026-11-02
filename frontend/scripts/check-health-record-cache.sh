#!/bin/sh
set -eu
root=$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)
task_tmp=$(mktemp -d "${TMPDIR:-/private/tmp}/runary-health-cache.XXXXXX")
trap 'rm -rf "$task_tmp"' EXIT
xcrun swiftc -module-cache-path "$task_tmp/cache" \
  "$root/modules/health-kit-bridge/ios/HealthRecordCache.swift" \
  "$root/modules/health-kit-bridge/tests/HealthRecordCacheChecks.swift" -o "$task_tmp/checks"
"$task_tmp/checks"
