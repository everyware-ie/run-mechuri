#!/bin/sh
set -eu
root=$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)
task_tmp=$(mktemp -d "${TMPDIR:-/private/tmp}/runary-clips.XXXXXX")
storage_tmp=$(mktemp -d "$root/.clip-storage-checks.XXXXXX")
trap 'rm -rf "$task_tmp" "$storage_tmp"' EXIT
xcrun swiftc -module-cache-path "$task_tmp/cache" \
  "$root/modules/route-renderer/ios/LocalClipStorage.swift" \
  "$root/modules/route-renderer/tests/LocalClipStorageChecks.swift" -o "$task_tmp/checks"
"$task_tmp/checks" "$storage_tmp"

xcrun swiftc -module-cache-path "$task_tmp/cache" \
  "$root/modules/route-renderer/ios/SegmentedRoute.swift" \
  "$root/modules/route-renderer/tests/SegmentedRouteChecks.swift" -o "$task_tmp/segments"
"$task_tmp/segments"
