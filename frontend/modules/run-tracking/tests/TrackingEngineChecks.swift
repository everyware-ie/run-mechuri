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
    let relayRun = UUID().uuidString
    let parent = UUID().uuidString
    let storedHeart = TrackingWatchHealthSample(parent: parent, index: nil, seriesCount: nil,
      time: 110, bpm: 150, source: "com.apple.health")
    let relay = TrackingWatchHealthBatch(runID: relayRun, sent: 111, samples: [storedHeart], deleted: [])
    check(TrackingWatchHealthBatch(relay.payload, at: 112)?.samples.count == 1, "Stored Watch heart is accepted without a workout payload")
    check(TrackingWatchHealthBatch(relay.payload, at: 100) == nil, "Future relay packet is rejected")
    check(TrackingWatchHealthBatch(relay.payload, at: 86_512) == nil, "Relay packet expires after one day")
    var malformed = relay.payload; malformed["samples"] = [["parent": parent, "time": 110.0, "bpm": Double.nan, "source": "com.apple.health"]]
    check(TrackingWatchHealthBatch(malformed, at: 112) == nil, "Invalid heart makes the complete packet fail validation")
    malformed = relay.payload; malformed["samples"] = Array(repeating: storedHeart.payload, count: 101)
    check(TrackingWatchHealthBatch(malformed, at: 112) == nil, "Relay limits packet size")
    malformed = relay.payload; malformed["id"] = "bad-id"
    check(TrackingWatchHealthBatch(malformed, at: 112) == nil, "Relay requires a real run UUID")
    malformed = relay.payload; malformed["deleted"] = ["bad-parent"]
    check(TrackingWatchHealthBatch(malformed, at: 112) == nil, "Deletion notices require HealthKit UUIDs")
    malformed = relay.payload; malformed["samples"] = [["parent": parent, "time": 110.0, "bpm": 150.0, "source": "com.apple.health", "index": "0"]]
    check(TrackingWatchHealthBatch(malformed, at: 112) == nil, "Malformed series cannot become a representative sample")
    let futureSample = TrackingWatchHealthBatch(runID: relayRun, sent: 111,
      samples: [TrackingWatchHealthSample(parent: parent, index: nil, seriesCount: nil, time: 120, bpm: 150, source: "com.apple.health")], deleted: [])
    check(!futureSample.valid(at: 121), "A sample cannot postdate its packet even when delivered late")
    let badSeries = TrackingWatchHealthSample(parent: parent, index: 2, seriesCount: 2, time: 110, bpm: 150, source: "com.apple.health")
    check(!badSeries.valid(at: 112), "Series ordinal must be within the complete parent count")
    let relayEngine = TrackingEngine(id: relayRun, started: 100)
    relayEngine.apply(TrackingEvent(kind: "heartSource", time: 100, detail: "health"))
    for value in relay.samples {
      let event = TrackingEvent.healthHeart(parentID: value.parent, index: value.index, time: value.time,
        received: 112, bpm: value.bpm, source: value.source)
      relayEngine.apply(event); relayEngine.apply(event)
      relayEngine.apply(.healthHeart(parentID: parent, time: 110, received: 300, bpm: 150, source: "com.apple.health"))
    }
    check(relayEngine.hearts.count == 1 && relayEngine.summary(at: 112).averageHeartRate == 150, "Phone Health sync and two Watch delivery paths count the same sample once")
    relayEngine.apply(.healthHeart(parentID: UUID().uuidString, time: 113, received: 114, bpm: 1e100, source: "com.apple.health"))
    check(relayEngine.hearts.count == 1, "Extreme health values cannot overflow Watch formatting or averages")
    relayEngine.apply(TrackingEvent(kind: "pause", time: 120))
    relayEngine.apply(.healthHeart(parentID: UUID().uuidString, time: 125, received: 126, bpm: 160, source: "com.apple.health"))
    check(relayEngine.hearts.count == 1, "Relay never counts the paused interval")
    relayEngine.apply(TrackingEvent(kind: "resume", time: 130))
    relayEngine.apply(TrackingEvent(kind: "finish", time: 140))
    relayEngine.apply(.healthHeart(parentID: UUID().uuidString, time: 135, received: 300, bpm: 160, source: "com.apple.health"))
    check(relayEngine.hearts.count == 2 && relayEngine.summary(at: 300).duration == 30, "Late relay adds a real past sample without extending completed duration")
    relayEngine.apply(.healthHeart(parentID: UUID().uuidString, time: 150, received: 300, bpm: 170, source: "com.apple.health"))
    check(relayEngine.hearts.count == 2, "A sample from the next run cannot enter an ended run")
    relayEngine.apply(TrackingEvent(kind: "heartDeleted", time: 300, sampleID: parent))
    relayEngine.apply(.healthHeart(parentID: parent, time: 110, received: 301, bpm: 150, source: "com.apple.health"))
    check(relayEngine.hearts.count == 1, "Deleted HealthKit samples cannot return through relay retries")
    var outbox = TrackingWatchHealthOutbox(); outbox.append(relay, at: 112)
    let otherRun = TrackingWatchHealthBatch(runID: UUID().uuidString, sent: 112, samples: [storedHeart], deleted: [])
    outbox.append(otherRun, at: 112)
    check(outbox.next(runID: otherRun.runID, at: 112)?.batchID == otherRun.batchID, "Fresh current heart bypasses another run's old queue")
    check(outbox.next(runID: otherRun.runID, at: 130)?.batchID == relay.batchID, "Stale data keeps background order rather than pretending it is live")
    outbox.delete(runID: relayRun)
    check(outbox.batches.count == 1 && outbox.batches[0].runID == otherRun.runID, "Run deletion removes only that run's pending relay")
    outbox = try JSONDecoder().decode(TrackingWatchHealthOutbox.self, from: JSONEncoder().encode(outbox))
    check(outbox.batches[0].samples[0].parent == parent, "Relay identity survives a Watch app relaunch")
    outbox.acknowledge(UUID().uuidString)
    check(outbox.batches.count == 1, "Unrelated acknowledgment cannot drop pending data")
    outbox.acknowledge(otherRun.batchID)
    check(outbox.batches.isEmpty, "Only the matching saved acknowledgment clears a batch")
    for _ in 0...TrackingWatchHealthOutbox.limit { outbox.append(TrackingWatchHealthBatch(runID: relayRun, sent: 112, samples: [storedHeart], deleted: []), at: 112) }
    check(outbox.batches.count == TrackingWatchHealthOutbox.limit, "Offline relay buffer remains bounded")
    outbox.prune(at: 86_513)
    check(outbox.batches.isEmpty, "Expired raw relay data is discarded on reconnect")
    let probeID = UUID().uuidString
    let probePayload: [String: Any] = ["kind": "sessionProbe", "variant": "workout", "probeID": probeID,
      "sent": 100.0, "phase": "background", "state": 2, "authorization": 2, "event": "scene", "heartRate": 999]
    let probe = TrackingWatchProbe(probePayload, at: 101)
    check(probe?.phase == "background" && probe?.state == 2, "QA probe accepts bounded session/scene metadata")
    let encodedProbe = String(data: try JSONEncoder().encode(probe!), encoding: .utf8) ?? ""
    check(!encodedProbe.contains("heartRate"), "Probe storage excludes injected sensor data")
    check(TrackingWatchProbe(probePayload, at: 701) == nil, "Expired probe telemetry is rejected")
    var badProbe = probePayload; badProbe["state"] = 99
    check(TrackingWatchProbe(badProbe, at: 101) == nil, "Invalid session state cannot enter QA telemetry")
    check(!TrackingSampleRules.preparationTimedOut(started: 100, lastReady: nil, now: 130), "Initial GPS wait includes the 30-second boundary")
    check(TrackingSampleRules.preparationTimedOut(started: 100, lastReady: nil, now: 131), "No GPS fix still expires after 30 seconds")
    check(!TrackingSampleRules.preparationTimedOut(started: 100, lastReady: 155, now: 160), "Fresh GPS keeps Start ready even when the user spends a minute on preparation")
    check(!TrackingSampleRules.preparationTimedOut(started: 100, lastReady: 160, now: 180), "Continued valid fixes keep preparation alive")
    check(TrackingSampleRules.preparationTimedOut(started: 100, lastReady: 160, now: 191), "Losing valid GPS still cancels after 30 seconds without progress")
    check(TrackingSampleRules.preparedLocation(latitude: 37, longitude: 127, accuracy: 20, time: 100, now: 115), "Readiness accepts the 15s/20m boundary")
    check(!TrackingSampleRules.preparedLocation(latitude: 37, longitude: 127, accuracy: 5, time: 103, now: 100), "Future GPS cannot enable Start")
    check(!TrackingSampleRules.preparedLocation(latitude: 91, longitude: 127, accuracy: 5, time: 100, now: 100), "Invalid prepared coordinate cannot enable Start")
    check(!TrackingSampleRules.preparedLocation(latitude: 37, longitude: 127, accuracy: .nan, time: 100, now: 100), "Invalid readiness accuracy is rejected")
    check(TrackingSampleRules.watchConnection(state: "running", sent: 100, received: 105, previous: nil) == "connected", "Live workout response confirms connection")
    check(TrackingSampleRules.watchConnection(state: "waiting", sent: 100, received: 105, previous: nil) == "waiting", "Opening Watch is not starting a workout")
    check(TrackingSampleRules.watchConnection(state: "stopped", sent: 100, received: 105, previous: nil) == "failed", "Stopped workout is never connected")
    check(TrackingSampleRules.watchConnection(state: "running", sent: 100, received: 111, previous: nil) == nil, "Delayed Watch packet does not revive current state")
    check(TrackingSampleRules.watchConnection(state: "running", sent: 100, received: 105, previous: 101) == nil, "Out-of-order Watch response cannot overwrite newer state")
    let displayID = UUID().uuidString
    var watchDisplay = TrackingWatchDisplay()
    let displayPayload: [String: Any] = ["kind": "run", "displayOnly": true, "id": displayID,
      "sent": 100.0, "status": "running", "duration": 30.0, "heartRate": 155.0, "lastHeart": 98.0,
      "watchEnabled": false]
    check(watchDisplay.accept(displayPayload) && watchDisplay.metrics["id"] as? String == displayID,
      "HealthKit run appears on Watch without direct Watch collection enabled")
    check(watchDisplay.heart(at: 105) == 155, "Watch displays fresh phone HealthKit heart")
    check(watchDisplay.heart(at: 111) == nil, "Stale phone context never displays current heart")
    check(watchDisplay.duration(at: 125) == 40, "Disconnected Watch stops extrapolating time after 10 seconds")
    var oldDisplay = displayPayload; oldDisplay["sent"] = 99.0; oldDisplay["status"] = "completed"
    check(!watchDisplay.accept(oldDisplay) && watchDisplay.metrics["status"] as? String == "running",
      "Delayed application context cannot replace newer Watch display")
    var pausedDisplay = displayPayload; pausedDisplay["sent"] = 106.0; pausedDisplay["status"] = "paused"
    check(watchDisplay.accept(pausedDisplay) && watchDisplay.duration(at: 110) == 30 && watchDisplay.heart(at: 110) == nil,
      "Paused phone run stops Watch duration and current heart without touching a workout")
    var lateHeartDisplay = displayPayload; lateHeartDisplay["sent"] = 107.0; lateHeartDisplay["lastHeart"] = 80.0
    check(watchDisplay.accept(lateHeartDisplay) && watchDisplay.heart(at: 108) == nil, "Fresh phone message does not revive stale HealthKit heart")
    var invalidDisplay = displayPayload; invalidDisplay["sent"] = Double.nan
    check(!watchDisplay.accept(invalidDisplay), "Invalid timestamps cannot poison Watch ordering")
    watchDisplay.clear(id: displayID)
    check(watchDisplay.metrics.isEmpty, "Deleting displayed phone record clears Watch metrics")
    check(!watchDisplay.accept(["kind": "run", "id": displayID, "sent": 200.0, "status": "running"]),
      "Legacy direct-workout payload cannot switch the display app into a collection mode")
    check(watchDisplay.accept(["kind": "noRun", "sent": 201.0, "startSupported": true]) && watchDisplay.metrics.isEmpty,
      "Opening Watch after phone finalization shows no active workout")
    check(watchDisplay.canStart(at: 202), "Confirmed idle state enables a Watch request without a reconnect action")
    check(!watchDisplay.canStart(at: 212), "A stale idle context cannot claim there is no phone run")
    check(!TrackingWatchDisplay().canStart(at: 100), "Before synchronization the Watch does not claim the phone is idle")
    var oldPhoneDisplay = TrackingWatchDisplay()
    _ = oldPhoneDisplay.accept(["kind": "noRun", "sent": 100.0])
    check(oldPhoneDisplay.stateFresh(at: 101) && !oldPhoneDisplay.canStart(at: 101), "An older phone cannot offer an unsupported Watch start")
    let nextID = UUID().uuidString
    var nextRun = displayPayload; nextRun["id"] = nextID; nextRun["sent"] = 203.0
    check(watchDisplay.accept(nextRun) && !watchDisplay.canStart(at: 204), "A new phone run replaces idle and prevents a second start")
    check(!watchDisplay.accept(["kind": "noRun", "sent": 202.0]) && watchDisplay.metrics["id"] as? String == nextID,
      "A delayed finish reply cannot erase a newer run")
    check(watchDisplay.accept(["kind": "noRun", "sent": 205.0, "phase": "needsPhone", "startPending": true, "requestID": nextID])
      && !watchDisplay.canStart(at: 206) && watchDisplay.requestID == nextID,
      "Pending phone foreground/GPS gates prevent duplicate Watch starts and retain the cancellation ID")
    check(watchDisplay.accept(["kind": "noRun", "sent": 207.0, "phase": "preparing", "startPending": true]) && !watchDisplay.canStart(at: 208),
      "GPS preparation is not an idle or running state")
    check(!watchDisplay.accept(["kind": "noRun", "sent": 208.0, "phase": "running"]), "Invalid no-run phase cannot clear a pending request")
    let watchStart = TrackingWatchRequest(message: ["id": nextID, "request": "start", "sent": 100.0], at: 105)
    check(watchStart?.valid(at: 219) == true && watchStart?.valid(at: 221) == false, "A live start expires instead of starting hours later")
    check(TrackingWatchRequest(message: ["id": nextID, "request": "start", "sent": 100.0], at: 111) == nil,
      "A delayed queued command cannot start a new phone run")
    check(TrackingWatchRequest(message: ["id": nextID, "request": "start", "sent": 100.0], at: 90) == nil,
      "Future Watch commands are rejected")
    check(TrackingWatchRequest(message: ["id": "invalid", "request": "start", "sent": 100.0], at: 101) == nil,
      "Watch record IDs must be UUIDs")
    let recoveredStart = try JSONDecoder().decode(TrackingWatchRequest.self, from: JSONEncoder().encode(watchStart!))
    check(recoveredStart.id == nextID && recoveredStart.action == "start" && recoveredStart.valid(at: 110),
      "A pending request survives phone process initialization with its original deadline")
    var requests = TrackingWatchRequests(); requests.insert(nextID, at: 100)
    let restoredRequests = try JSONDecoder().decode(TrackingWatchRequests.self, from: JSONEncoder().encode(requests))
    check(restoredRequests.contains(nextID, at: 105), "A start attached to an existing run remains handled after relaunch or finish")
    check(!restoredRequests.contains(UUID().uuidString, at: 105), "A genuinely new Watch start has its own identity")

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

    let healthRun = TrackingEngine(id: UUID().uuidString, started: 100)
    healthRun.apply(TrackingEvent(kind: "heartSource", time: 100, detail: "health"))
    healthRun.apply(TrackingEvent(kind: "pause", time: 110))
    healthRun.apply(TrackingEvent(kind: "resume", time: 120))
    healthRun.apply(TrackingEvent(kind: "finish", time: 130))
    let lateHeart = TrackingEvent(kind: "heart", time: 105, received: 200, value: 140, sampleID: "health-a", detail: "health:com.apple.health")
    healthRun.apply(lateHeart); healthRun.apply(lateHeart)
    healthRun.apply(TrackingEvent(kind: "heart", time: 125, received: 200, value: 160, sampleID: "health-b", detail: "health:com.apple.health"))
    for time in [99.0, 115.0, 131.0, 205.0] {
      healthRun.apply(TrackingEvent(kind: "heart", time: time, received: 200, value: 250, sampleID: "excluded-\(time)", detail: "health:com.apple.health"))
    }
    check(healthRun.hearts.count == 2 && healthRun.summary(at: 200).averageHeartRate == 150, "Late HealthKit import excludes pause/outside/future values and duplicates")
    check(healthRun.summary(at: 200).heartRate == nil && healthRun.ended == 130 && healthRun.duration(at: 200) == 20, "Completed import changes history only, never live heart or workout time")
    healthRun.apply(TrackingEvent(kind: "heartDeleted", time: 210, sampleID: "health-b"))
    check(healthRun.summary(at: 220).averageHeartRate == 140 && healthRun.summary(at: 220).maxHeartRate == 140, "Explicit HealthKit deletion removes sample from both statistics")
    check(healthRun.summary(at: 220).heartSource == "health" && !healthRun.watchEnabled, "HealthKit mode does not enable a competing Watch workout")
    let legacyWatch = TrackingEngine(id: UUID().uuidString, started: 100)
    legacyWatch.apply(TrackingEvent(kind: "watch", time: 100, value: 1))
    legacyWatch.apply(TrackingEvent(kind: "heart", time: 105, received: 106, value: 145, sampleID: "watch-heart"))
    legacyWatch.apply(TrackingEvent(kind: "heartDeleted", time: 110, sampleID: "watch-heart"))
    check(legacyWatch.summary(at: 110).heartSource == "watch" && legacyWatch.hearts.count == 1, "Legacy Watch data stays readable and cannot be deleted by a HealthKit notice")

    let seriesRun = TrackingEngine(id: UUID().uuidString, started: 100)
    let seriesControls = [TrackingEvent(kind: "heartSource", time: 100, detail: "health"),
      TrackingEvent(kind: "pause", time: 110), TrackingEvent(kind: "resume", time: 120),
      TrackingEvent(kind: "finish", time: 130)]
    seriesControls.forEach(seriesRun.apply)
    let representative = TrackingEvent(kind: "heart", time: 100, received: 200, value: 160,
      sampleID: "series-a", detail: "health:com.apple.health")
    seriesRun.apply(representative)
    let replacement = TrackingEvent(kind: "heartSeries", time: 200, sampleID: "series-a")
    seriesRun.apply(replacement)
    let seriesTimes = [99.0, 105, 115, 125, 131]
    let seriesValues = [250.0, 140, 250, 180, 250]
    let seriesEvents = zip(seriesTimes, seriesValues).enumerated().map { index, entry in
      TrackingEvent.healthHeart(parentID: "series-a", index: index, time: entry.0, received: 200,
        bpm: entry.1, source: "com.apple.health")
    }
    seriesEvents.forEach(seriesRun.apply)
    check(seriesRun.hearts.count == 2, "Series spanning both run edges retains only active individual measurements")
    check(seriesRun.summary(at: 200).averageHeartRate == 160 && seriesRun.summary(at: 200).maxHeartRate == 180,
      "Series uses individual values for average and maximum, replacing old representative")
    check(seriesRun.hearts.allSatisfy { $0.parentSampleID == "series-a" && $0.id != "series-a" },
      "Each series child retains a distinct identity and original HealthKit UUID")
    seriesRun.apply(replacement); seriesEvents.forEach(seriesRun.apply)
    check(seriesRun.hearts.count == 2, "Reimporting series does not remove or duplicate saved children")
    let sameTime = TrackingEvent.healthHeart(parentID: "series-b", index: 0, time: 125, received: 200, bpm: 150, source: "other.app")
    let sameTimeSecond = TrackingEvent.healthHeart(parentID: "series-b", index: 1, time: 125, received: 200, bpm: 150, source: "other.app")
    seriesRun.apply(sameTime); seriesRun.apply(sameTimeSecond); seriesRun.apply(sameTime)
    check(seriesRun.hearts.count == 4, "Distinct measurements at identical timestamps survive while repeat imports deduplicate")
    let seriesDeletion = TrackingEvent(kind: "heartDeleted", time: 210, sampleID: "series-a")
    seriesRun.apply(seriesDeletion)
    check(seriesRun.hearts.count == 2 && seriesRun.summary(at: 220).maxHeartRate == 150,
      "Parent deletion removes all its children and recomputes statistics without touching another series")
    seriesEvents.forEach(seriesRun.apply)
    check(seriesRun.hearts.count == 2, "Delayed series read cannot resurrect an explicitly deleted parent")
    seriesRun.apply(TrackingEvent(kind: "heartDeleted", time: 220, sampleID: "not-yet-received"))
    seriesRun.apply(.healthHeart(parentID: "not-yet-received", index: 0, time: 125, received: 230, bpm: 300, source: "other.app"))
    check(seriesRun.hearts.count == 2, "Deletion arriving before the first series child also prevents resurrection")
    check(seriesRun.ended == 130 && seriesRun.duration(at: 999) == 20 && seriesRun.points.isEmpty,
      "Series import and deletion preserve workout duration, end and route")
    let liveSeries = TrackingEngine(id: UUID().uuidString, started: 100)
    liveSeries.apply(.healthHeart(parentID: "live-series", index: 0, time: 105, received: 126, bpm: 140, source: "other.app"))
    liveSeries.apply(.healthHeart(parentID: "live-series", index: 1, time: 125, received: 126, bpm: 180, source: "other.app"))
    check(liveSeries.summary(at: 127).heartRate == 180, "Live freshness uses newest child's actual time, not series start")

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
    let healthEvents = [TrackingEvent(kind: "heartSource", time: 100, detail: "health"), TrackingEvent(kind: "finish", time: 130), lateHeart]
    let archivedHealth = TrackingEngine(id: UUID().uuidString, started: 100)
    healthEvents.forEach(archivedHealth.apply); try save(store, archivedHealth, healthEvents, at: 200)
    let reloadedHealth = try store.load(archivedHealth.id)
    reloadedHealth.apply(lateHeart)
    check(reloadedHealth.healthHeartEnabled && reloadedHealth.hearts.count == 1 && reloadedHealth.hearts[0].source == "health:com.apple.health", "HealthKit source and deduplication survive journal replay")
    check(reloadedHealth.ended == 130 && reloadedHealth.duration(at: 999) == 30, "Late import checkpoint does not extend completed workout after relaunch")
    let seriesJournal = TrackingEngine(id: UUID().uuidString, started: 100)
    let seriesLog = seriesControls + [representative, replacement] + seriesEvents + [sameTime, sameTimeSecond, seriesDeletion]
    seriesLog.forEach(seriesJournal.apply); try save(store, seriesJournal, seriesLog, at: 220)
    let reloadedSeries = try store.load(seriesJournal.id)
    seriesEvents.forEach(reloadedSeries.apply); reloadedSeries.apply(sameTime)
    check(reloadedSeries.hearts.count == 2 && reloadedSeries.hearts.allSatisfy { $0.parentSampleID == "series-b" },
      "Parent identity, deleted-parent protection and series deduplication survive journal replay")
    check(reloadedSeries.summary(at: 999).maxHeartRate == 150 && reloadedSeries.ended == 130,
      "Series statistics and original end time survive relaunch")
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
