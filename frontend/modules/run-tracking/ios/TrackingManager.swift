import Foundation
import UIKit
import CoreLocation
import CoreMotion
import HealthKit
import WatchConnectivity

final class TrackingManager: NSObject, CLLocationManagerDelegate, WCSessionDelegate {
  static var enabled: Bool { Bundle.main.object(forInfoDictionaryKey: "RunaryInternalTracking") as? Bool == true }
  static let shared = TrackingManager()
  private let location = CLLocationManager()
  private let motion = CMPedometer()
  private let health = HKHealthStore()
  private var store: TrackingStore?
  private var engine: TrackingEngine? { didSet { mapRevision = UUID().uuidString; watchResponseAt = nil; watchRequest = nil } }
  private var mapRevision = UUID().uuidString
  private var pending: [TrackingEvent] = []
  private var watchRecoveryStart: Double?
  private var historyCache: [String: TrackingSummary] = [:]
  private var tick: Timer?
  private var preparing = false
  private var ready: CLLocation?
  private var gpsReadyAt: Double?
  private var prepareAt: Double?
  private var phase = "idle"
  private var notice: String?
  private var watchState = "off"
  private var watchRequestedAt: Double?
  private var watchResponseAt: Double?
  private var watchRequest: UUID?
  private var writeFailedAt: Double?
  private var writeRetries = 0
  private var observers: [NSObjectProtocol] = []
  private var now: Double { Date().timeIntervalSince1970 }

  override init() {
    super.init()
    guard Self.enabled else { return }
    do {
      let root = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0].appendingPathComponent("InternalRuns", isDirectory: true)
      store = try TrackingStore(root: root)
    } catch { notice = "기록 저장소를 열 수 없어요. 저장 공간을 확인해 주세요." }
    location.delegate = self
    location.desiredAccuracy = kCLLocationAccuracyBest
    location.distanceFilter = 3
    location.activityType = .fitness
    location.pausesLocationUpdatesAutomatically = false
    UIDevice.current.isBatteryMonitoringEnabled = true
    observers.append(NotificationCenter.default.addObserver(forName: UIApplication.didEnterBackgroundNotification, object: nil, queue: .main) { [weak self] _ in
      guard let self else { return }
      self.cancelPreparation()
      var task = UIBackgroundTaskIdentifier.invalid
      task = UIApplication.shared.beginBackgroundTask { if task != .invalid { UIApplication.shared.endBackgroundTask(task); task = .invalid } }
      if self.engine != nil { self.battery(); self.flush() }
      if task != .invalid { UIApplication.shared.endBackgroundTask(task); task = .invalid }
    })
    observers.append(NotificationCenter.default.addObserver(forName: UIApplication.didBecomeActiveNotification, object: nil, queue: .main) { [weak self] _ in
      self?.validatePermissions(); self?.syncWatch()
    })
    if WCSession.isSupported() { WCSession.default.delegate = self; WCSession.default.activate() }
    // A single native timer is only for checkpoint/UI freshness. Location events
    // also checkpoint; no JS timer owns collection or measurement time.
    tick = Timer.scheduledTimer(withTimeInterval: 1, repeats: true) { [weak self] _ in self?.onTick() }
    // On process relaunch attach to the latest unfinished record, with sensors
    // stopped. A second run must not silently replace this record.
    if let ids = try? store?.ids() {
      let unfinished = ids.compactMap { try? store?.load($0) }.filter { $0.status != "completed" }.max { $0.started < $1.started }
      if let unfinished { try? recover(unfinished.id) }
    }
  }
  private func requireEnabled() throws {
    guard Self.enabled else { throw problem("내부 측정은 팀 테스트 빌드에서만 사용할 수 있어요.") }
    guard store != nil else { throw problem("저장 공간을 확인해 주세요.") }
  }
  private func problem(_ text: String) -> NSError { NSError(domain: "RunaryTracking", code: 1, userInfo: [NSLocalizedDescriptionKey: text]) }
  private func authorizeLocation() -> Bool {
    location.authorizationStatus == .authorizedWhenInUse || location.authorizationStatus == .authorizedAlways
  }
  func prepare() throws {
    try requireEnabled()
    guard engine?.status != "running", engine?.status != "saving" else { return }
    guard UIApplication.shared.applicationState == .active else { throw problem("아이폰에서 앱을 열고 GPS를 준비해 주세요.") }
    notice = nil; preparing = true; prepareAt = now; phase = "preparing"; ready = nil; gpsReadyAt = nil
    if location.authorizationStatus == .notDetermined { location.requestWhenInUseAuthorization(); return }
    guard authorizeLocation(), CLLocationManager.locationServicesEnabled() else { cancelPreparation(); throw problem("앱 권한에서 위치 접근을 확인해 주세요.") }
    guard location.accuracyAuthorization == .fullAccuracy else { cancelPreparation(); throw problem("정확한 위치를 켜고 다시 준비해 주세요.") }
    location.allowsBackgroundLocationUpdates = false
    location.startUpdatingLocation()
  }
  func cancelPreparation() {
    guard preparing else { return }
    preparing = false; ready = nil; prepareAt = nil
    location.stopUpdatingLocation(); phase = "idle"
  }
  private func readyForStart() throws -> CLLocation {
    guard authorizeLocation(), location.accuracyAuthorization == .fullAccuracy,
          CLLocationManager.locationServicesEnabled(), let ready, validPreparation(ready) else {
      throw problem("GPS 준비가 완료된 뒤 시작해 주세요.")
    }
    guard UIApplication.shared.applicationState == .active else { throw problem("아이폰에서 앱을 열고 시작해 주세요.") }
    return ready
  }
  private func validPreparation(_ sample: CLLocation) -> Bool {
    TrackingSampleRules.preparedLocation(latitude: sample.coordinate.latitude, longitude: sample.coordinate.longitude,
      accuracy: sample.horizontalAccuracy, time: sample.timestamp.timeIntervalSince1970, now: now)
  }
  func start(watch: Bool) throws {
    try requireEnabled()
    guard engine == nil else { throw problem("진행 중인 기록을 먼저 마쳐 주세요.") }
    let initialPosition = try readyForStart()
    let e = TrackingEngine(id: UUID().uuidString, started: now)
    engine = e; pending = []; phase = "running"; preparing = false
    append(TrackingEvent(kind: "preparation", time: now, received: initialPosition.timestamp.timeIntervalSince1970, value: gpsReadyAt, intervalStart: prepareAt))
    append(TrackingEvent(kind: "watch", time: now, value: watch ? 1 : 0)); battery()
    guard flush() else { haltForStorage(); throw problem("시작 기록을 저장하지 못했어요. 저장 재시도를 확인해 주세요.") }
    beginSensors()
    if watch { try connectWatch() }
  }
  func pause() throws {
    try requireEnabled()
    guard engine?.status == "running" else { return }
    append(TrackingEvent(kind: "pause", time: now)); stopSensors(); phase = "paused"
    battery(); flush(); syncWatch()
  }
  func resume() throws {
    try requireEnabled()
    guard let engine, ["paused", "interrupted"].contains(engine.status) else { return }
    _ = try readyForStart()
    closeWatchRecovery(); append(TrackingEvent(kind: "resume", time: now)); preparing = false; phase = "running"
    guard flush() else { haltForStorage(); throw problem("재개 상태를 저장하지 못했어요.") }
    beginSensors(); syncWatch()
  }
  func finish() throws {
    try requireEnabled()
    guard let engine else { return }
    if engine.status == "completed" { self.engine = nil; pending = []; phase = "idle"; watchState = "off"; return }
    closeWatchRecovery()
    append(TrackingEvent(kind: "saving", time: engine.ended ?? now)); stopSensors(); preparing = false; phase = "saving"
    battery(); syncWatch()
    guard flush() else { throw problem("종료 기록을 저장하지 못했어요. 저장 재시도를 눌러 주세요.") }
    append(TrackingEvent(kind: "finish", time: engine.ended ?? now))
    guard flush() else { engine.status = "saving"; throw problem("완료 상태를 저장하지 못했어요.") }
    self.engine = nil; pending = []; phase = "idle"; watchState = "off"
  }
  func retrySave() throws {
    try requireEnabled()
    guard engine != nil else { return }
    writeFailedAt = nil; writeRetries = 0
    guard flush() else { throw problem("아직 저장할 수 없어요. 저장 공간을 확인해 주세요.") }
    if engine?.status == "saving" || engine?.status == "completed" { try finish() }
  }
  func keepSaved() throws {
    try requireEnabled()
    guard let current = engine, current.status != "running" else { throw problem("측정을 중단한 뒤 보관해 주세요.") }
    let saved = try store!.load(current.id, repair: true)
    engine = saved; pending = []; writeFailedAt = nil; writeRetries = 0
    if saved.status == "running" { append(TrackingEvent(kind: "interrupt", time: saved.lastSaved ?? saved.started)) }
    try finish()
  }
  func recover(_ id: String) throws {
    try requireEnabled()
    guard engine == nil else { throw problem("진행 중인 기록이 있어요.") }
    let restored = try store!.load(id, repair: true)
    guard restored.status != "completed" else { throw problem("이미 완료한 기록이에요.") }
    engine = restored; pending = []
    if restored.status == "running" {
      if restored.watchEnabled { watchRecoveryStart = restored.lastSaved ?? restored.started }
      append(TrackingEvent(kind: "interrupt", time: restored.lastSaved ?? restored.started))
      append(TrackingEvent(kind: "gap", time: restored.lastSaved ?? restored.started))
    }
    phase = restored.status; flush(); syncWatch()
  }
  private func closeWatchRecovery() {
    if let start = watchRecoveryStart { append(TrackingEvent(kind: "watchRecovery", time: now, intervalStart: start)); watchRecoveryStart = nil }
  }
  private func beginSensors() {
    location.allowsBackgroundLocationUpdates = true
    location.showsBackgroundLocationIndicator = true
    location.startUpdatingLocation()
    guard CMPedometer.isStepCountingAvailable(), let interval = engine?.intervals.last else { return }
    motion.startUpdates(from: Date(timeIntervalSince1970: interval.start)) { [weak self] data, error in
      DispatchQueue.main.async {
        guard let self, self.engine?.status == "running" else { return }
        if let data {
          self.append(TrackingEvent(kind: "motion", time: data.endDate.timeIntervalSince1970,
            received: self.now, value: data.numberOfSteps.doubleValue, cadence: data.currentCadence?.doubleValue,
            intervalStart: data.startDate.timeIntervalSince1970))
          self.checkpointIfDue()
        } else if error != nil { self.note("motionUnavailable") }
      }
    }
  }
  private func stopSensors() { location.stopUpdatingLocation(); motion.stopUpdates(); ready = nil }
  private func append(_ event: TrackingEvent) { engine?.apply(event); pending.append(event) }
  private func battery() {
    append(TrackingEvent(kind: "power", time: now, value: ProcessInfo.processInfo.isLowPowerModeEnabled ? 1 : 0))
    let value = UIDevice.current.batteryLevel
    let charging = UIDevice.current.batteryState == .charging || UIDevice.current.batteryState == .full
    append(TrackingEvent(kind: "battery", time: now, value: value < 0 ? nil : Double(value), detail: charging ? "charging" : "unplugged"))
  }
  @discardableResult private func flush() -> Bool {
    guard let engine, let store else { return false }
    let date = now
    var summary = engine.summary(at: date); summary.lastSaved = date
    do {
      try store.append(id: engine.id, started: engine.started, events: pending, summary: summary)
      engine.lastSaved = date; historyCache.removeValue(forKey: engine.id); pending = []; writeFailedAt = nil; writeRetries = 0
      if notice?.hasPrefix("기록을 저장") == true { notice = nil }
      return true
    } catch {
      if writeFailedAt == nil { writeFailedAt = date; writeRetries = 0 }
      notice = "기록을 저장하지 못했어요. 마지막 저장 시점과 저장 재시도를 확인해 주세요."
      // Recording memory is bounded by the retry window, not by available RAM.
      let ns = error as NSError
      if ns.code == NSFileWriteOutOfSpaceError || (date - (writeFailedAt ?? date) >= 10) || writeRetries >= 2 { haltForStorage() }
      return false
    }
  }
  private func haltForStorage() {
    guard engine != nil else { return }
    if engine?.status == "running" { append(TrackingEvent(kind: "interrupt", time: now, detail: "storage")) }
    stopSensors(); preparing = false; phase = engine?.status ?? "interrupted"; syncWatch()
  }
  private func checkpointIfDue() {
    if writeFailedAt != nil { return }
    if now - (engine?.lastSaved ?? 0) >= 5 { battery(); flush() }
  }
  private func onTick() {
    if preparing {
      if now - (prepareAt ?? now) > 30 { cancelPreparation(); notice = "GPS 준비가 오래 걸려요. 야외에서 다시 시도해 주세요." }
      else if let ready, now - ready.timestamp.timeIntervalSince1970 > 15 { self.ready = nil; phase = "preparing" }
    }
    if let failed = writeFailedAt, now - failed >= Double((writeRetries + 1) * 3), writeRetries < 2 {
      writeRetries += 1
      // Saving may have failed before or after the finish event. Once the
      // journal recovers, complete the same finalization as a manual retry.
      if flush(), let status = engine?.status, ["saving", "completed"].contains(status) { try? finish() }
    }
    if let failed = writeFailedAt, now - failed >= 10 { haltForStorage() }
    if engine != nil { validatePermissions(); checkpointIfDue() }
    if let requested = watchRequestedAt, now - requested > 10, watchState == "connecting" { watchState = "noResponse" }
    if let response = watchResponseAt, now - response > 10, ["connected", "waiting"].contains(watchState) { watchState = "disconnected" }
    if engine?.status == "running", Int(now) % 3 == 0 { syncWatch() }
  }
  private func note(_ code: String) {
    guard engine?.errors.last != code else { return }
    append(TrackingEvent(kind: "error", time: now, detail: code))
  }
  private func validatePermissions() {
    guard engine?.status == "running" else { return }
    if !authorizeLocation() || !CLLocationManager.locationServicesEnabled() || location.accuracyAuthorization != .fullAccuracy {
      append(TrackingEvent(kind: "interrupt", time: now)); stopSensors(); phase = "interrupted"
      note("locationPermissionOrService"); notice = "위치 수집이 중단됐어요. 앱 권한을 확인한 뒤 재개해 주세요."
      flush(); syncWatch()
    }
  }
  func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
    if preparing {
      if authorizeLocation() && manager.accuracyAuthorization == .fullAccuracy { manager.startUpdatingLocation() }
      else if manager.authorizationStatus != .notDetermined { cancelPreparation(); notice = "앱 권한에서 위치와 정확한 위치를 확인해 주세요." }
    }
    validatePermissions()
  }
  func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
    if preparing {
      if let candidate = locations.last(where: { validPreparation($0) }) { ready = candidate; gpsReadyAt = now; phase = "ready" }
      return
    }
    guard engine?.status == "running" else { return }
    for point in locations {
      append(TrackingEvent(kind: "location", time: point.timestamp.timeIntervalSince1970,
        latitude: point.coordinate.latitude, longitude: point.coordinate.longitude,
        accuracy: point.horizontalAccuracy, received: now, background: UIApplication.shared.applicationState != .active))
    }
    checkpointIfDue()
  }
  func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {
    guard engine?.status == "running" else { return }
    note("locationError"); validatePermissions()
  }
  private func json<T: Encodable>(_ value: T) -> Any {
    (try? JSONSerialization.jsonObject(with: JSONEncoder().encode(value))) ?? NSNull()
  }
  func snapshot() -> [String: Any] {
    guard Self.enabled else { return ["enabled": false, "phase": "disabled"] }
    let summary: Any = engine.map { json($0.summary(at: now)) } ?? NSNull()
    return ["enabled": true, "phase": phase, "notice": notice as Any? ?? NSNull(),
      "summary": summary, "watchState": watchState,
      "unsavedEvents": pending.count, "storageError": writeFailedAt != nil,
      "locationPermission": location.authorizationStatus.rawValue,
      "preciseLocation": location.accuracyAuthorization == .fullAccuracy,
      "motionPermission": CMPedometer.authorizationStatus().rawValue,
      "motionSupported": CMPedometer.isStepCountingAvailable(),
      "watchPaired": WCSession.isSupported() && WCSession.default.isPaired,
      "watchInstalled": WCSession.isSupported() && WCSession.default.isWatchAppInstalled]
  }
  // Display-only, incremental read. Never starts a second location collector or
  // replays the durable event log. A replaced engine invalidates old cursors.
  func mapSnapshot(_ revision: String?, after: Int) throws -> [String: Any] {
    try requireEnabled()
    let count = engine?.points.count ?? 0
    let reset = revision != mapRevision || after < 0 || after > count
    let start = reset ? 0 : after
    let end = min(count, start + 512)
    let points = engine.map { Array($0.points[start..<end]) } ?? []
    let prepared: TrackingPoint? = ready.flatMap {
      guard preparing, now - $0.timestamp.timeIntervalSince1970 <= 15 else { return nil }
      return TrackingPoint(latitude: $0.coordinate.latitude, longitude: $0.coordinate.longitude,
                           time: $0.timestamp.timeIntervalSince1970, segment: 0)
    }
    let position: Any = (prepared ?? engine?.points.last).map { json($0) } ?? NSNull()
    return ["revision": mapRevision, "runId": engine?.id as Any? ?? NSNull(),
            "reset": reset, "fromIndex": start, "nextIndex": end, "total": count,
            "points": json(points), "position": position]
  }
  func records() throws -> [String: Any] {
    try requireEnabled()
    var records: [TrackingSummary] = [], damaged: [String] = []
    for id in try store!.ids() {
      if let e = engine, e.id == id { records.append(e.summary(at: now)); continue }
      if let cached = historyCache[id] { records.append(cached); continue }
      do {
        let e = try store!.load(id)
        // Freeze a stopped process at the last durable checkpoint; merely reading
        // history must never accrue time after termination.
        if e.status == "running" { e.apply(TrackingEvent(kind: "interrupt", time: e.lastSaved ?? e.started)) }
        let savedSummary = e.summary(at: e.ended ?? e.lastSaved ?? e.started)
        historyCache[id] = savedSummary; records.append(savedSummary)
      } catch { damaged.append(id) }
    }
    return ["records": json(records.sorted { $0.started > $1.started }), "damaged": damaged]
  }
  func detail(_ id: String) throws -> [String: Any] {
    try requireEnabled()
    let e = engine?.id == id ? engine! : try store!.load(id)
    if e !== engine, e.status == "running" { e.apply(TrackingEvent(kind: "interrupt", time: e.lastSaved ?? e.started)) }
    return ["summary": json(e.summary(at: e.ended ?? (e === engine ? now : e.lastSaved ?? e.started))), "points": json(e.points)]
  }
  func delete(_ id: String) throws {
    try requireEnabled()
    guard engine?.id != id else { throw problem("진행 중인 기록을 먼저 종료해 주세요.") }
    try store!.delete(id); historyCache.removeValue(forKey: id); syncDeletions()
  }
  func feedback(_ id: String, text: String) throws {
    try requireEnabled()
    guard engine?.id != id else { throw problem("종료한 기록에서 메모를 남겨 주세요.") }
    let e = try store!.load(id, repair: true)
    var events: [TrackingEvent] = []
    if e.status == "running" {
      let stop = TrackingEvent(kind: "interrupt", time: e.lastSaved ?? e.started); e.apply(stop); events.append(stop)
    }
    let event = TrackingEvent(kind: "feedback", time: now, detail: String(text.prefix(500)))
    e.apply(event); events.append(event); e.lastSaved = now
    try store!.append(id: id, started: e.started, events: events, summary: e.summary(at: e.ended ?? now)); historyCache.removeValue(forKey: id)
  }
  func connectWatch() throws {
    try requireEnabled()
    guard let engine, engine.status == "running" else { throw problem("측정을 시작한 뒤 워치를 연결해 주세요.") }
    guard WCSession.isSupported(), WCSession.default.isPaired, WCSession.default.isWatchAppInstalled else {
      watchState = "notInstalled"; notice = "워치의 Runary 설치를 확인해 주세요. 아이폰 측정은 계속됩니다."; return
    }
    append(TrackingEvent(kind: "watch", time: now, value: 1)); flush()
    watchState = "connecting"; watchRequestedAt = now; syncWatch()
    let request = UUID(); watchRequest = request
    let id = engine.id
    let config = HKWorkoutConfiguration(); config.activityType = .running; config.locationType = .outdoor
    health.startWatchApp(with: config) { [weak self] success, _ in
      DispatchQueue.main.async {
        guard let self, self.engine?.id == id, self.watchRequest == request, self.watchState == "connecting" else { return }
        if !success { self.watchState = "noResponse" }
      }
    }
  }
  private func syncDeletions() {
    guard WCSession.isSupported(), WCSession.default.activationState == .activated, let store else { return }
    let ids = store.deletedIDs()
    for start in stride(from: 0, to: ids.count, by: 200) {
      WCSession.default.transferUserInfo(["kind": "delete", "ids": Array(ids[start..<min(start + 200, ids.count)])])
    }
  }
  private func syncWatch() {
    guard Self.enabled, WCSession.isSupported(), WCSession.default.activationState == .activated, let engine, engine.watchEnabled else { return }
    let summary = engine.summary(at: now)
    var message = (json(summary) as? [String: Any]) ?? [:]
    message = message.filter { !($0.value is NSNull) }
    message["kind"] = "run"; message["sent"] = now
    message["preserveWatch"] = watchRecoveryStart != nil
    do { try WCSession.default.updateApplicationContext(message) } catch { watchState = "disconnected" }
    if WCSession.default.isReachable { WCSession.default.sendMessage(message, replyHandler: nil) { _ in } }
  }
  private func receive(_ message: [String: Any], live: Bool = false) -> [String: Any] {
    guard Self.enabled, let id = message["id"] as? String, UUID(uuidString: id) != nil else { return ["accepted": false] }
    if let request = message["request"] as? String, engine?.id == id {
      do {
        switch request {
        case "pause": try pause()
        case "resume": try resume()
        case "finish": try finish()
        default: return ["accepted": false]
        }
        return ["accepted": true]
      } catch { return ["accepted": false, "error": error.localizedDescription] }
    }
    guard let values = message["hearts"] as? [[String: Any]], values.count <= 200 else {
      if engine?.id == id, let error = message["error"] as? String { watchState = "failed"; note("watch:\(error)") }
      return ["accepted": false]
    }
    let current = engine?.id == id
    if current && writeFailedAt != nil { return ["accepted": false] }
    guard let e = current ? engine : try? store?.load(id, repair: true) else { return ["accepted": false] }
    var events: [TrackingEvent] = []
    if !current && e.status == "running" {
      let saved = e.lastSaved ?? e.started
      let stop = TrackingEvent(kind: "interrupt", time: saved); e.apply(stop); events.append(stop)
      let gap = TrackingEvent(kind: "gap", time: saved); e.apply(gap); events.append(gap)
      if e.watchEnabled {
        let recovery = TrackingEvent(kind: "watchRecovery", time: now, intervalStart: saved); e.apply(recovery); events.append(recovery)
      }
    }
    if current, let start = watchRecoveryStart {
      let recovery = TrackingEvent(kind: "watchRecovery", time: now, intervalStart: start); e.apply(recovery); events.append(recovery)
    }
    for heart in values {
      guard let sampleID = heart["id"] as? String, let time = heart["time"] as? Double, let bpm = heart["bpm"] as? Double else { continue }
      let event = TrackingEvent(kind: "heart", time: time, received: now, value: bpm, sampleID: sampleID)
      e.apply(event); events.append(event)
    }
    if current {
      pending.append(contentsOf: events)
      // Queued historical samples remain useful, but say nothing about whether
      // the Watch workout is still alive. Only a fresh direct response does.
      if live, let state = message["state"] as? String, let sent = message["sent"] as? Double,
         let connection = TrackingSampleRules.watchConnection(state: state, sent: sent, received: now, previous: watchResponseAt) {
        watchResponseAt = sent; watchState = connection
        if connection == "failed" { note("watch:sessionStopped") }
      }
      return ["accepted": flush()]
    }
    do {
      var summary = e.summary(at: e.ended ?? e.lastSaved ?? e.started); summary.lastSaved = now
      try store!.append(id: id, started: e.started, events: events, summary: summary)
      historyCache.removeValue(forKey: id)
      return ["accepted": true]
    } catch { return ["accepted": false] }
  }
  func session(_ session: WCSession, activationDidCompleteWith activationState: WCSessionActivationState, error: Error?) {
    DispatchQueue.main.async { [weak self] in self?.syncDeletions(); self?.syncWatch() }
  }
  func sessionDidBecomeInactive(_ session: WCSession) {}
  func sessionDidDeactivate(_ session: WCSession) { session.activate() }
  func session(_ session: WCSession, didReceiveMessage message: [String: Any], replyHandler: @escaping ([String: Any]) -> Void) {
    DispatchQueue.main.async { [weak self] in replyHandler(self?.receive(message, live: true) ?? ["accepted": false]) }
  }
  func session(_ session: WCSession, didReceiveMessage message: [String: Any]) {
    DispatchQueue.main.async { [weak self] in _ = self?.receive(message, live: true) }
  }
  func session(_ session: WCSession, didReceiveUserInfo userInfo: [String: Any]) {
    DispatchQueue.main.async { [weak self] in _ = self?.receive(userInfo) }
  }
}
