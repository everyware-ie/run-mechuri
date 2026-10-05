import Foundation

@main
struct TrackingEngineChecks {
  static var count = 0
  static func check(_ condition: @autoclosure () -> Bool, _ name: String) {
    precondition(condition(), name); count += 1
  }
  static func gps(_ time: Double, _ meters: Double, accuracy: Double = 5, received: Double? = nil) -> TrackingEvent {
    TrackingEvent(kind: "location", time: time, latitude: 0, longitude: meters / 111_195,
      accuracy: accuracy, received: received ?? time)
  }
  static func save(_ store: TrackingStore, _ engine: TrackingEngine, _ events: [TrackingEvent], at: Double) throws {
    var summary = engine.summary(at: at); summary.lastSaved = at
    try store.append(id: engine.id, started: engine.started, events: events, summary: summary)
    engine.lastSaved = at
  }
  static func main() throws {
    check(TrackingSampleRules.preparedLocation(latitude: 37, longitude: 127, accuracy: 20, time: 100, now: 115), "Readiness accepts the 15s/20m boundary")
    check(!TrackingSampleRules.preparedLocation(latitude: 37, longitude: 127, accuracy: 5, time: 103, now: 100), "Future GPS cannot enable Start")
    check(!TrackingSampleRules.preparedLocation(latitude: 91, longitude: 127, accuracy: 5, time: 100, now: 100), "Invalid prepared coordinate cannot enable Start")
    check(!TrackingSampleRules.preparedLocation(latitude: 37, longitude: 127, accuracy: .nan, time: 100, now: 100), "Invalid readiness accuracy is rejected")
    check(TrackingSampleRules.watchConnection(state: "running", sent: 100, received: 105, previous: nil) == "connected", "Live workout response confirms connection")
    check(TrackingSampleRules.watchConnection(state: "waiting", sent: 100, received: 105, previous: nil) == "waiting", "Opening Watch is not starting a workout")
    check(TrackingSampleRules.watchConnection(state: "stopped", sent: 100, received: 105, previous: nil) == "failed", "Stopped workout is never connected")
    check(TrackingSampleRules.watchConnection(state: "running", sent: 100, received: 111, previous: nil) == nil, "Delayed Watch packet does not revive current state")
    check(TrackingSampleRules.watchConnection(state: "running", sent: 100, received: 105, previous: 101) == nil, "Out-of-order Watch response cannot overwrite newer state")
    let e = TrackingEngine(id: UUID().uuidString, started: 100)
    for offset in 0...10 { e.apply(gps(100 + Double(offset), Double(offset) * 3, received: 115)) }
    check(abs(e.distance - 30) < 0.1, "Batched sample times retain distance")
    check(abs((e.summary(at: 110).pace ?? 0) - 333.33) < 1, "10s window pace")
    check(e.summary(at: 130).pace == nil, "Old GPS never displayed as current pace")
    e.apply(gps(111, 33, accuracy: 40)); check(e.rejected["accuracyOrCoordinate"] == 1, "Bad accuracy rejected")
    e.apply(gps(109, 30)); check(e.rejected["outOfOrder"] == 1, "Out of order rejected")
    e.apply(TrackingEvent(kind: "pause", time: 120)); let beforePause = e.distance
    e.apply(gps(125, 50)); check(e.distance == beforePause, "Pause movement excluded")
    e.apply(TrackingEvent(kind: "resume", time: 200)); e.apply(gps(200, 200)); e.apply(gps(202, 206))
    check(abs(e.distance - beforePause - 6) < 0.1, "Resume does not bridge pause")
    check(e.summary(at: 205).duration == 25, "Paused wall time excluded")
    e.apply(TrackingEvent(kind: "heart", time: 201, received: 202, value: 150, sampleID: "a"))
    e.apply(TrackingEvent(kind: "heart", time: 201, received: 220, value: 150, sampleID: "a"))
    e.apply(TrackingEvent(kind: "heart", time: 130, received: 220, value: 180, sampleID: "pause"))
    check(e.hearts.count == 1, "Heart duplicate and paused samples excluded")
    check(e.summary(at: 220).heartRate == nil && e.summary(at: 220).averageHeartRate == 150, "Delayed heart included only in history")
    e.apply(TrackingEvent(kind: "motion", time: 205, received: 205, value: 10, cadence: 2.5, intervalStart: 200))
    check(e.steps == 10 && e.summary(at: 205).cadence == 150, "Cadence uses steps per second")
    check(e.summary(at: 220).cadence == nil, "Motion freshness")
    e.apply(TrackingEvent(kind: "saving", time: 230)); e.apply(TrackingEvent(kind: "finish", time: 270))
    check(e.summary(at: 999).duration == 50 && e.summary(at: 999).elapsed == 130, "Save retry cannot extend workout")

    let stationary = TrackingEngine(id: UUID().uuidString, started: 100)
    stationary.apply(gps(100, 0)); stationary.apply(gps(105, 15))
    for time in stride(from: 110.0, through: 200.0, by: 5) { stationary.apply(gps(time, 15.1)) }
    stationary.apply(gps(205, 30))
    check(stationary.segment == 1 && !stationary.incomplete, "Long stop with valid stationary samples does not break path")
    check(stationary.summary(at: 205).lastLocation == 205, "Stationary filtering preserves GPS receipt freshness")
    stationary.apply(gps(250, 120)); check(stationary.segment == 2 && stationary.incomplete, "Missing moving interval is not interpolated")
    let distanceBeforeJump = stationary.distance
    stationary.apply(gps(251, 500)); check(stationary.distance == distanceBeforeJump, "Impossible jump excluded")
    let noHeart = TrackingEngine(id: UUID().uuidString, started: 0)
    check(noHeart.summary(at: 1).averageHeartRate == nil && noHeart.summary(at: 1).averagePace == nil, "Missing optional sensors are not zero filled")

    let root = FileManager.default.temporaryDirectory.appendingPathComponent("tracking-checks-" + UUID().uuidString)
    defer { try? FileManager.default.removeItem(at: root) }
    let store = try TrackingStore(root: root)
    let journal = TrackingEngine(id: UUID().uuidString, started: 100)
    let events = [gps(100, 0), gps(110, 30)]
    events.forEach(journal.apply); try save(store, journal, events, at: 115)
    let url = root.appendingPathComponent(journal.id).appendingPathComponent("events.jsonl")
    let committed = try Data(contentsOf: url)
    let file = try FileHandle(forWritingTo: url); try file.seekToEnd()
    var tail = try JSONEncoder().encode(gps(120, 60)); tail.append(0x0a); tail.append(contentsOf: "{\"kind\":".utf8)
    try file.write(contentsOf: tail); try file.close()
    let restored = try store.load(journal.id)
    check(restored.points.count == 2 && restored.lastSaved == 115, "Truncated and uncommitted tail never affects committed route")
    check(restored.errors.contains("uncommittedOrDamagedTail"), "Tail damage visible")
    _ = try store.load(journal.id, repair: true)
    let repaired = try Data(contentsOf: url)
    check(repaired == committed, "Repair truncates only uncommitted tail")
    restored.apply(TrackingEvent(kind: "interrupt", time: restored.lastSaved!))
    check(restored.summary(at: 500).duration == 15 && restored.summary(at: 500).elapsed == 15, "Recovery never fabricates terminated time")
    restored.apply(TrackingEvent(kind: "watchRecovery", time: 200, intervalStart: 115))
    restored.apply(TrackingEvent(kind: "heart", time: 150, received: 200, value: 160, sampleID: "watch-live"))
    check(restored.hearts.count == 1 && restored.duration(at: 200) == 15, "Actual surviving watch sample preserved without adding phone duration")
    let invalidID = "../escape"
    do { _ = try store.load(invalidID); preconditionFailure("Invalid ID accepted") } catch { count += 1 }
    let emptyID = UUID().uuidString
    try FileManager.default.createDirectory(at: root.appendingPathComponent(emptyID), withIntermediateDirectories: true)
    let damagedURL = root.appendingPathComponent(emptyID).appendingPathComponent("events.jsonl")
    try Data("broken".utf8).write(to: damagedURL)
    do { _ = try store.load(emptyID, repair: true); preconditionFailure("Corruption accepted") } catch { count += 1 }
    let preserved = try Data(contentsOf: damagedURL)
    check(preserved == Data("broken".utf8), "Unrecoverable original preserved")
    let blockedID = UUID().uuidString
    try FileManager.default.createDirectory(at: root.appendingPathComponent(blockedID).appendingPathComponent("events.jsonl"), withIntermediateDirectories: true)
    let blocked = TrackingEngine(id: blockedID, started: 0)
    do { try save(store, blocked, [], at: 1); preconditionFailure("Write failure hidden") } catch { count += 1 }
    // Exercise both durable boundaries of finalization with real file errors,
    // without filling the device or touching any user record.
    for failureStage in 1...2 {
      let finalizing = TrackingEngine(id: UUID().uuidString, started: 100)
      try save(store, finalizing, [], at: 110)
      let saving = TrackingEvent(kind: "saving", time: 160)
      let finish = TrackingEvent(kind: "finish", time: 160)
      finalizing.apply(saving)
      if failureStage == 2 { try save(store, finalizing, [saving], at: 160); finalizing.apply(finish) }
      let log = root.appendingPathComponent(finalizing.id).appendingPathComponent("events.jsonl")
      let backup = log.appendingPathExtension("qa-backup")
      try FileManager.default.moveItem(at: log, to: backup)
      try FileManager.default.createDirectory(at: log, withIntermediateDirectories: true)
      do { try save(store, finalizing, failureStage == 1 ? [saving] : [finish], at: 170); preconditionFailure("Completion write failure hidden") } catch { count += 1 }
      try FileManager.default.removeItem(at: log)
      try FileManager.default.moveItem(at: backup, to: log)
      finalizing.status = "saving"
      try save(store, finalizing, failureStage == 1 ? [saving] : [finish], at: 180)
      // The manager's finalization after successful retry uses the original
      // ended time. Repeated finalization must remain safe for the journal.
      let repeatSaving = TrackingEvent(kind: "saving", time: finalizing.ended!)
      let repeatFinish = TrackingEvent(kind: "finish", time: finalizing.ended!)
      finalizing.apply(repeatSaving); finalizing.apply(repeatFinish)
      try save(store, finalizing, [repeatSaving, repeatFinish], at: 190)
      let completed = try store.load(finalizing.id)
      check(completed.status == "completed", "Retried finalization commits completed status at either boundary")
      check(completed.summary(at: 999).duration == 60 && completed.summary(at: 999).elapsed == 60, "Finalization retry keeps original end time at either boundary")
    }
    try store.delete(journal.id); let ids = try store.ids(); check(!ids.contains(journal.id), "Explicit record deletion")
    check(store.deletedIDs().contains(journal.id), "Deletion marker blocks delayed Watch resurrection")
    print("Tracking engine and journal: \(count) checks passed (synthetic coordinates only)")
  }
}
