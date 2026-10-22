import Foundation

@main
struct LiveActivityChecks {
  static var count = 0
  static func check(_ condition: @autoclosure () -> Bool, _ name: String) { precondition(condition(), name); count += 1 }
  static func main() throws {
    var session = RunaryLiveSession()
    session.observe(runID: "run", phase: "running", storageError: false)
    let initial = session.revision
    check(!session.accept(.pause, runID: "other", revision: initial, confirmation: nil), "Another card cannot pause the current run")
    check(session.accept(.pause, runID: "run", revision: initial, confirmation: nil), "Running allows pause")
    session.observe(runID: "run", phase: "paused", storageError: false)
    check(!session.accept(.pause, runID: "run", revision: initial, confirmation: nil), "Repeated pause is ignored")
    check(session.accept(.resume, runID: "run", revision: session.revision, confirmation: nil), "Paused allows direct resume")
    let failedRequest = session.revision
    session.invalidate()
    check(!session.accept(.resume, runID: "run", revision: failedRequest, confirmation: nil), "A failed command cannot replay after permissions change without a new tap")
    session.observe(runID: "run", phase: "running", storageError: false)
    check(!session.accept(.pause, runID: "run", revision: initial, confirmation: nil), "Old pause stays invalid after pause and resume")
    check(session.accept(.askFinish, runID: "run", revision: session.revision, confirmation: nil), "Finish can be requested while running")
    let confirmRevision = session.revision, token = session.confirmation
    check(!session.accept(.finish, runID: "run", revision: confirmRevision, confirmation: nil), "Finish requires a separate confirmation token")
    session.observe(runID: "run", phase: "paused", storageError: false)
    check(!session.accept(.finish, runID: "run", revision: confirmRevision, confirmation: token), "Watch or app pause invalidates a pending finish")
    check(session.accept(.askFinish, runID: "run", revision: session.revision, confirmation: nil), "Paused also allows finish")
    let cancelledRevision = session.revision, cancelledToken = session.confirmation
    check(session.accept(.cancelFinish, runID: "run", revision: cancelledRevision, confirmation: cancelledToken), "Cancel returns to paused without resuming")
    check(session.phase == "paused" && session.confirmation == nil, "Confirmation does not own measurement phase")
    check(!session.accept(.finish, runID: "run", revision: cancelledRevision, confirmation: cancelledToken), "Cancelled confirmation cannot save later")
    _ = session.accept(.askFinish, runID: "run", revision: session.revision, confirmation: nil)
    let finishRevision = session.revision, finishToken = session.confirmation
    check(session.accept(.finish, runID: "run", revision: finishRevision, confirmation: finishToken), "Valid confirmation can finish once")
    check(!session.accept(.finish, runID: "run", revision: finishRevision, confirmation: finishToken), "Double tap cannot finish twice")
    session.observe(runID: "run", phase: "saving", storageError: true)
    check(!session.accept(.resume, runID: "run", revision: session.revision, confirmation: nil), "Failed save cannot resume")
    session.observe(runID: "new", phase: "running", storageError: false)
    check(!session.accept(.finish, runID: "run", revision: finishRevision, confirmation: finishToken), "An old card cannot finish the next run")

    var state = RunaryLiveState(phase: "running", revision: session.revision, snapshotAt: 100,
      duration: 3659, distance: 5230, averagePace: 359.8, heartRate: 142, lastHeart: 99,
      storageError: false, actionError: false)
    check(state.distanceText == "5.23" && state.paceText == "6'00\"", "Distance and average pace use native units and correct rounding")
    check(RunaryLiveState.timeText(state.duration) == "1:00:59", "Time handles an hour")
    check(state.heart(at: 113) == 142 && state.heart(at: 115) == nil, "Current heart expires at the real sample time")
    check(state.nextRefresh == 114 && state.staleAt == 130, "Heart and checkpoint freshness are distinct")
    state.phase = "paused"
    check(state.heart(at: 101) == nil && !state.running, "Paused card never shows a live heart or ticking clock")
    state.distance = 19; state.averagePace = nil
    check(state.paceText == "-", "Missing metrics use a hyphen")
    state.storageError = true
    check(!state.controllable && !state.running, "Save failure keeps state for app recovery rather than showing completion")
    let bytes = try JSONEncoder().encode(state)
    check(bytes.count < 4096, "Display payload fits ActivityKit's combined budget with room for attributes")
    let decoded = try JSONDecoder().decode(RunaryLiveState.self, from: bytes)
    check(decoded == state, "App and extension share a Codable payload")

    // GPS received after resume may still be cached from before the pause.
    let engine = TrackingEngine(id: "gps", started: 100)
    func location(_ time: Double, _ meters: Double) -> TrackingEvent {
      TrackingEvent(kind: "location", time: time, latitude: 0, longitude: meters / 111_195,
        accuracy: 5, received: 205)
    }
    engine.apply(location(101, 0)); engine.apply(location(106, 25))
    let distanceBefore = engine.distance
    engine.apply(TrackingEvent(kind: "pause", time: 110))
    engine.apply(TrackingEvent(kind: "resume", time: 200))
    engine.apply(location(108, 30)); engine.apply(location(180, 500))
    check(engine.points.count == 2, "Cached pre-resume positions never enter the new segment")
    engine.apply(location(201, 1000))
    check(engine.distance == distanceBefore, "Movement during pause is not bridged")
    engine.apply(location(206, 1025))
    check(abs(engine.distance - distanceBefore - 25) < 0.1, "New fixes continue distance in the resumed segment")
    check(engine.summary(at: 210).duration == 20, "Direct resume counts only active time, starting at button processing")
    print("Live Activity checks passed: \(count)")
  }
}
