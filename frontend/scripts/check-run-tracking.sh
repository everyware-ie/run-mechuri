#!/bin/sh
set -eu
root=$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)
task_tmp=$(mktemp -d "${TMPDIR:-/private/tmp}/runary-tracking.XXXXXX")
trap 'rm -rf "$task_tmp"' EXIT
xcrun swiftc -module-cache-path "$task_tmp/cache" \
  "$root/modules/run-tracking/ios/TrackingEngine.swift" \
  "$root/modules/run-tracking/ios/TrackingStore.swift" \
  "$root/modules/run-tracking/tests/TrackingEngineChecks.swift" -o "$task_tmp/checks"
"$task_tmp/checks"
