#!/bin/sh
set -eu
root=$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)
task_tmp=$(mktemp -d "${TMPDIR:-/private/tmp}/runary-watch-exceptions.XXXXXX")
trap 'rm -rf "$task_tmp"' EXIT
# Compile the real controller bodies, replacing only imports and the SwiftUI
# app/view entry point. The doubles provide controlled time and Apple callbacks.
python3 - "$root" "$task_tmp" <<'PY'
from pathlib import Path
import sys
root, target = map(Path, sys.argv[1:])
workout = (root / 'watch/WatchWorkoutSession.swift').read_text()
model = (root / 'watch/RunaryWatchApp.swift').read_text()
start = model.index('final class WatchRun:')
end = model.index('\nstruct WatchRunView:')
assert start < end
workout = '\n'.join(line for line in workout.splitlines() if not line.startswith('import '))
(target / 'Controllers.swift').write_text('import Foundation\n' + workout + '\n' + model[start:end])
PY
xcrun swiftc -module-cache-path "$task_tmp/cache" \
  "$root/modules/run-tracking/tests/WatchPlatformDoubles.swift" \
  "$root/modules/run-tracking/ios/TrackingWatchDisplay.swift" \
  "$root/modules/run-tracking/ios/TrackingWatchHealth.swift" \
  "$task_tmp/Controllers.swift" \
  "$root/modules/run-tracking/tests/WatchExceptionChecks.swift" -o "$task_tmp/checks"
"$task_tmp/checks"
