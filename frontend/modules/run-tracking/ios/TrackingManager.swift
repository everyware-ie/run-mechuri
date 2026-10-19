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
  private var motionCollecting = false
  private let health = HKHealthStore()
  private var store: TrackingStore?
  private var engine: TrackingEngine? { didSet { mapRevision = UUID().uuidString; watchResponseAt = nil; watchRequestedAt = nil } }
  private var mapRevision = UUID().uuidString
  private var pending: [TrackingEvent] = []
  private var watchRecoveryStart: Double?
  private var historyCache: [String: TrackingSummary] = [:]
  private var tick: Timer?
  private var phoneStartPending = false
  private var preparing = false
  private var ready: CLLocation?
  private var gpsReadyAt: Double?
  private var prepareAt: Double?
  private var phase = "idle"
  private var notice: String?
  private var watchState = "off"
  private var heartQuery: HKAnchoredObjectQuery?
  private var heartGeneration = UUID()
  private var healthRefreshes: [String: [(Result<Bool, Error>) -> Void]] = [:]
  private var healthHeartState = "off"
  private var watchRequestedAt: Double?
  private var watchResponseAt: Double?
  private var watchLaunch: (id: String, requested: Double)?
  private var watchAppInfo: String?
  private var watchRequest: TrackingWatchRequest?
  private let watchRequestKey = "RunaryPendingWatchRequest"
  private var watchRequests = TrackingWatchRequests()
  private let watchRequestsKey = "RunaryHandledWatchRequests"
  private var writeFailedAt: Double?
  private var writeRetries = 0
  private var observers: [NSObjectProtocol] = []
  private lazy var liveActivity = TrackingLiveActivity()
  private var liveSession = RunaryLiveSession()
  private var liveActionError = false
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
      self.cancelPreparation(clearWatchRequest: false)
      self.syncWatch()
      var task = UIBackgroundTaskIdentifier.invalid
      task = UIApplication.shared.beginBackgroundTask { if task != .invalid { UIApplication.shared.endBackgroundTask(task); task = .invalid } }
      if self.engine != nil { self.battery(); self.flush() }
      if task != .invalid { UIApplication.shared.endBackgroundTask(task); task = .invalid }
    })
    observers.append(NotificationCenter.default.addObserver(forName: UIApplication.didBecomeActiveNotification, object: nil, queue: .main) { [weak self] _ in
      self?.liveActivity.foreground()
      self?.continuePhoneStart(); self?.validatePermissions(); self?.continueWatchRequest(); self?.syncWatch(); self?.restartHealthHeartIfNeeded()
      self?.syncLiveActivity(force: true)
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
    if let data = UserDefaults.standard.data(forKey: watchRequestKey),
       let request = try? JSONDecoder().decode(TrackingWatchRequest.self, from: data), request.valid(at: now) {
      watchRequest = request
    } else { UserDefaults.standard.removeObject(forKey: watchRequestKey) }
    if let data = UserDefaults.standard.data(forKey: watchRequestsKey),
       let requests = try? JSONDecoder().decode(TrackingWatchRequests.self, from: data) { watchRequests = requests }
    syncLiveActivity(force: true)
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
    if location.authorizationStatus == .notDetermined { location.requestWhenInUseAuthorization(); syncWatch(); return }
    guard authorizeLocation(), CLLocationManager.locationServicesEnabled() else { cancelPreparation(); throw problem("앱 권한에서 위치 접근을 확인해 주세요.") }
    guard location.accuracyAuthorization == .fullAccuracy else { cancelPreparation(); throw problem("정확한 위치를 켜고 다시 준비해 주세요.") }
    location.allowsBackgroundLocationUpdates = false
    location.startUpdatingLocation()
    syncWatch()
  }
  func cancelPreparation(clearWatchRequest: Bool = true) {
    phoneStartPending = false
    if clearWatchRequest { setWatchRequest(nil) }
    guard preparing else { return }
    preparing = false; ready = nil; prepareAt = nil
    location.stopUpdatingLocation(); phase = engine?.status ?? "idle"; syncWatch()
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
  func start() throws {
    try requireEnabled()
    guard engine == nil else { throw problem("진행 중인 기록을 먼저 마쳐 주세요.") }
    let initialPosition = try readyForStart()
    try createRun(initialPosition: initialPosition)
  }
  // An explicit iPhone start does not wait for a location fix. The only
  // deferred request is first-use permission, never persisted across launches.
  func startImmediately() throws {
    try requireEnabled()
    guard engine == nil else { throw problem("진행 중인 기록을 먼저 마쳐 주세요.") }
    guard UIApplication.shared.applicationState == .active else { throw problem("아이폰에서 앱을 열고 시작해 주세요.") }
    if phoneStartPending { return }
    cancelPreparation()
    notice = nil
    guard CLLocationManager.locationServicesEnabled() else { throw problem("앱 권한에서 위치 접근을 확인해 주세요.") }
    if location.authorizationStatus == .notDetermined {
      phoneStartPending = true
      location.requestWhenInUseAuthorization()
      return
    }
    try requireStartPermission()
    try createRun(initialPosition: nil)
  }
  private func requireStartPermission() throws {
    guard authorizeLocation(), CLLocationManager.locationServicesEnabled(), location.accuracyAuthorization == .fullAccuracy else {
      throw problem("앱 권한에서 위치와 정확한 위치를 확인해 주세요.")
    }
  }
  private func continuePhoneStart() {
    guard phoneStartPending, UIApplication.shared.applicationState == .active,
          location.authorizationStatus != .notDetermined else { return }
    phoneStartPending = false
    guard engine == nil else { return }
    do {
      try requireEnabled()
      try requireStartPermission()
      try createRun(initialPosition: nil)
    } catch { notice = error.localizedDescription }
  }
  private func createRun(initialPosition: CLLocation?) throws {
    // All entry points execute on the main queue and share this single engine.
    guard engine == nil else { throw problem("진행 중인 기록을 먼저 마쳐 주세요.") }
    phoneStartPending = false
    let e = TrackingEngine(id: watchRequest?.action == "start" ? watchRequest!.id : UUID().uuidString, started: now)
    setWatchRequest(nil)
    engine = e; pending = []; phase = "running"; preparing = false
    if let initialPosition {
      append(TrackingEvent(kind: "preparation", time: now, received: initialPosition.timestamp.timeIntervalSince1970, value: gpsReadyAt, intervalStart: prepareAt))
    }
    ready = nil; gpsReadyAt = nil; prepareAt = nil
    append(TrackingEvent(kind: "watch", time: now, value: 0))
    append(TrackingEvent(kind: "heartSource", time: now, detail: "health"))
    if let watchAppInfo { append(TrackingEvent(kind: "watchApp", time: now, detail: watchAppInfo)) }
    battery()
    guard flush() else { haltForStorage(); throw problem("시작 기록을 저장하지 못했어요. 저장 재시도를 확인해 주세요.") }
    beginSensors()
    try connectWatch()
    beginHealthHeart(requestPermission: true)
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
    setWatchRequest(nil)
    closeWatchRecovery(); append(TrackingEvent(kind: "resume", time: now)); preparing = false; phase = "running"
    guard flush() else { haltForStorage(); throw problem("재개 상태를 저장하지 못했어요.") }
    beginSensors(); syncWatch(); launchWatch(); restartHealthHeartIfNeeded()
  }
  // Only an explicit button in the active Live Activity can use this path.
  // A resumed segment starts now and accepts no cached pre-resume coordinates.
  private func resumeFromLiveActivity() throws {
    try requireEnabled()
    guard let engine, engine.status == "paused", liveActivity.active(runID: engine.id) else { return }
    guard authorizeLocation(), CLLocationManager.locationServicesEnabled(), location.accuracyAuthorization == .fullAccuracy else {
      throw problem("위치 권한과 정확한 위치를 앱에서 확인해 주세요.")
    }
    setWatchRequest(nil); closeWatchRecovery()
    append(TrackingEvent(kind: "resume", time: now)); preparing = false; phase = "running"
    guard flush() else { haltForStorage(); throw problem("재개 상태를 저장하지 못했어요.") }
    beginSensors(); syncWatch(); launchWatch(); restartHealthHeartIfNeeded()
  }
  func performLiveAction(_ rawAction: String, runID: String, revision: String, confirmation: String?) throws {
    try requireEnabled()
    syncLiveActivity()
    guard let action = RunaryLiveAction(rawValue: rawAction), liveActivity.active(runID: runID),
          liveSession.accept(action, runID: runID, revision: revision, confirmation: confirmation) else {
      syncLiveActivity(force: true)
      return
    }
    liveActionError = false
    defer { syncLiveActivity(force: true) }
    do {
      switch action {
      case .pause: try pause()
      case .resume: try resumeFromLiveActivity()
      case .finish: try finish()
      case .askFinish, .cancelFinish: break
      }
    } catch {
      liveSession.invalidate()
      liveActionError = true
      // Keep the actual native phase and a route back to recovery. The card
      // must not disappear when finalization fails.
      notice = error.localizedDescription
      throw error
    }
  }
  func waitForLiveUpdates() async { await liveActivity.waitForUpdates() }
  private func syncLiveActivity(force: Bool = false) {
    guard Self.enabled else { return }
    let status = engine?.status ?? "idle"
    let previousRevision = liveSession.revision
    liveSession.observe(runID: engine?.id, phase: status, storageError: writeFailedAt != nil)
    if previousRevision != liveSession.revision { liveActionError = false }
    guard liveActivity.due(revision: engine?.lastSaved == nil ? nil : liveSession.revision, force: force) else { return }
    guard let summary = engine?.summary(at: now), summary.lastSaved != nil else {
      liveActivity.publish(id: nil, state: nil, force: force)
      return
    }
    let state = RunaryLiveState(phase: status, revision: liveSession.revision, confirmation: liveSession.confirmation,
      snapshotAt: now, duration: summary.duration, distance: summary.distance, averagePace: summary.averagePace,
      heartRate: summary.heartRate, lastHeart: summary.lastHeart, storageError: writeFailedAt != nil, actionError: liveActionError)
    liveActivity.publish(id: summary.id, state: state, force: force)
  }
  func finish() throws {
    try requireEnabled()
    guard let engine else { return }
    setWatchRequest(nil)
    if engine.status == "completed" { self.engine = nil; pending = []; phase = "idle"; watchState = "off"; syncWatch(); return }
    closeWatchRecovery()
    append(TrackingEvent(kind: "saving", time: engine.ended ?? now)); stopHealthHeart(); stopSensors(); preparing = false; phase = "saving"
    battery(); syncWatch()
    guard flush() else { throw problem("종료 기록을 저장하지 못했어요. 저장 재시도를 눌러 주세요.") }
    append(TrackingEvent(kind: "finish", time: engine.ended ?? now))
    guard flush() else { engine.status = "saving"; throw problem("완료 상태를 저장하지 못했어요.") }
    self.engine = nil; pending = []; phase = "idle"; watchState = "off"
    syncWatch()
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
    if restored.healthHeartEnabled { beginHealthHeart(requestPermission: false) }
  }
  private func stopHealthHeart() {
    heartGeneration = UUID()
    if let heartQuery { health.stop(heartQuery) }
    heartQuery = nil; healthHeartState = "off"
  }
  private func restartHealthHeartIfNeeded() {
    guard engine?.healthHeartEnabled == true, engine?.status == "running",
          healthHeartState != "authorizing", writeFailedAt == nil else { return }
    beginHealthHeart(requestPermission: false)
  }
  func reconnectHealthHeart() throws {
    try requireEnabled()
    guard engine?.healthHeartEnabled == true, engine?.status == "running", healthHeartState != "authorizing", writeFailedAt == nil else {
      throw problem("건강 앱 심박을 사용하는 러닝 중에 다시 연결할 수 있어요.")
    }
    beginHealthHeart(requestPermission: false)
  }
  private func beginHealthHeart(requestPermission: Bool) {
    stopHealthHeart()
    guard let e = engine, e.healthHeartEnabled, writeFailedAt == nil else { return }
    let id = e.id, generation = heartGeneration
    guard HKHealthStore.isHealthDataAvailable(), let type = HKObjectType.quantityType(forIdentifier: .heartRate) else {
      healthHeartState = "failed"; note("healthHeartUnavailable"); beginMotion(); return
    }
    let read = { [weak self] in
      guard let self, self.heartGeneration == generation, self.engine?.id == id, self.writeFailedAt == nil else { return }
      self.healthHeartState = "waiting"
      self.beginMotion()
      let predicate = HKQuery.predicateForSamples(withStart: Date(timeIntervalSince1970: e.started), end: nil, options: [])
      let handler: (HKAnchoredObjectQuery, [HKSample]?, [HKDeletedObject]?, HKQueryAnchor?, Error?) -> Void = { [weak self] _, samples, deleted, _, error in
        DispatchQueue.main.async {
          guard let self, self.heartGeneration == generation, self.engine?.id == id, self.writeFailedAt == nil else { return }
          if error != nil { self.stopHealthHeart(); self.healthHeartState = "failed"; self.note("healthHeartReadFailed"); return }
          do { try self.mergeHealthHeart(id, read: HealthHeartRead(), deletedIDs: Set((deleted ?? []).map { $0.uuid.uuidString })) }
          catch { self.healthHeartState = "failed"; return }
          self.readHealthHeart(samples ?? []) { [weak self] result in
            guard let self, self.heartGeneration == generation, self.engine?.id == id, self.writeFailedAt == nil else { return }
            do {
              try self.mergeHealthHeart(id, read: result.get(), deletedIDs: [])
              self.healthHeartState = self.engine?.hearts.isEmpty == false ? "reading" : "waiting"
            } catch { self.healthHeartState = "failed" }
          }
        }
      }
      let query = HKAnchoredObjectQuery(type: type, predicate: predicate, anchor: nil, limit: HKObjectQueryNoLimit, resultsHandler: handler)
      query.updateHandler = handler; self.heartQuery = query; self.health.execute(query)
    }
    // Recovery and foreground return only read; they never open a permission sheet.
    guard requestPermission else { read(); return }
    healthHeartState = "authorizing"
    health.getRequestStatusForAuthorization(toShare: [], read: [type]) { [weak self] status, error in
      DispatchQueue.main.async {
        guard let self, self.heartGeneration == generation, self.engine?.id == id else { return }
        if error != nil || status == .unknown { self.healthHeartState = "failed"; self.beginMotion(); return }
        if status == .unnecessary { read(); return }
        guard UIApplication.shared.applicationState == .active else { self.healthHeartState = "failed"; self.beginMotion(); return }
        self.health.requestAuthorization(toShare: [], read: [type]) { [weak self] success, error in
          DispatchQueue.main.async {
            guard let self, self.heartGeneration == generation, self.engine?.id == id else { return }
            if success && error == nil { read() } else { self.healthHeartState = "failed"; self.beginMotion() }
          }
        }
      }
    }
  }
  // Callback-time reloading prevents a delayed query from overwriting controls,
  // another import, or a deletion. No data query requests authorization.
  func refreshHealthHeart(_ id: String, completion: @escaping (Result<Bool, Error>) -> Void) {
    do {
      try requireEnabled()
      let e = engine?.id == id ? engine! : try store!.load(id)
      guard e.healthHeartEnabled, let type = HKObjectType.quantityType(forIdentifier: .heartRate), HKHealthStore.isHealthDataAvailable() else {
        throw problem("건강 앱 심박을 사용하는 기록에서만 불러올 수 있어요.")
      }
      if healthRefreshes[id] != nil { healthRefreshes[id]!.append(completion); return }
      healthRefreshes[id] = [completion]
      let end = e.ended ?? (e.status == "running" ? now : e.intervals.last?.end ?? e.started)
      let predicate = HKQuery.predicateForSamples(withStart: Date(timeIntervalSince1970: e.started), end: Date(timeIntervalSince1970: end), options: [])
      let query = HKAnchoredObjectQuery(type: type, predicate: predicate, anchor: nil, limit: HKObjectQueryNoLimit) { [weak self] _, samples, deleted, _, error in
        DispatchQueue.main.async {
          guard let self else { completion(.failure(NSError(domain: "RunaryTracking", code: 1))); return }
          if let error { self.completeHealthRefresh(id, result: .failure(error)); return }
          // Handle explicit deletions before asynchronous series expansion,
          // even when the subsequent series read fails or returns partial data.
          do { try self.mergeHealthHeart(id, read: HealthHeartRead(), deletedIDs: Set((deleted ?? []).map { $0.uuid.uuidString })) }
          catch { self.completeHealthRefresh(id, result: .failure(error)); return }
          self.readHealthHeart(samples ?? []) { [weak self] result in
            guard let self else { return }
            do {
              try self.mergeHealthHeart(id, read: result.get(), deletedIDs: [])
              self.completeHealthRefresh(id, result: .success(true))
            } catch { self.completeHealthRefresh(id, result: .failure(error)) }
          }
        }
      }
      health.execute(query)
    } catch { completion(.failure(error)) }
  }
  private func completeHealthRefresh(_ id: String, result: Result<Bool, Error>) {
    let callbacks = healthRefreshes.removeValue(forKey: id) ?? []
    callbacks.forEach { $0(result) }
  }
  private final class HealthHeartRead {
    var events: [TrackingEvent] = []
    var seriesCounts: [String: Int] = [:]
    var receivedCounts: [String: Int] = [:]
    var finished = false
  }
  // Query overlapping parent samples, then let the engine filter every child's
  // actual time. Strict parent bounds would discard series spanning a run edge.
  private func readHealthHeart(_ samples: [HKSample], completion: @escaping (Result<HealthHeartRead, Error>) -> Void) {
    let read = HealthHeartRead()
    let quantities = samples.compactMap { $0 as? HKQuantitySample }
    let unit = HKUnit.count().unitDivided(by: .minute())
    for sample in quantities where sample.count == 1 {
      read.events.append(.healthHeart(parentID: sample.uuid.uuidString, time: sample.startDate.timeIntervalSince1970,
        received: now, bpm: sample.quantity.doubleValue(for: unit), source: sample.sourceRevision.source.bundleIdentifier))
    }
    let series = quantities.filter { $0.count > 1 }
    guard !series.isEmpty else { completion(.success(read)); return }
    guard let type = HKObjectType.quantityType(forIdentifier: .heartRate) else {
      completion(.failure(problem("건강 앱 심박을 읽을 수 없어요."))); return
    }
    for sample in series { read.seriesCounts[sample.uuid.uuidString] = sample.count }
    let predicate = HKQuery.predicateForObjects(with: Set(series.map { $0.uuid }))
    let query = HKQuantitySeriesSampleQuery(quantityType: type, predicate: predicate) { [weak self] _, quantity, interval, sample, done, error in
      DispatchQueue.main.async {
        guard let self, !read.finished else { return }
        if let error { read.finished = true; completion(.failure(error)); return }
        if let quantity, let interval, let sample, read.seriesCounts[sample.uuid.uuidString] != nil {
          let parentID = sample.uuid.uuidString
          let index = read.receivedCounts[parentID, default: 0]
          read.receivedCounts[parentID] = index + 1
          read.events.append(.healthHeart(parentID: parentID, index: index, time: interval.start.timeIntervalSince1970,
            received: self.now, bpm: quantity.doubleValue(for: unit), source: sample.sourceRevision.source.bundleIdentifier))
        }
        if done {
          read.finished = true
          // A partial/empty read must not replace previously saved values.
          guard read.seriesCounts == read.receivedCounts else {
            completion(.failure(self.problem("심박 자료를 모두 읽지 못했어요. 다시 불러와 주세요."))); return
          }
          completion(.success(read))
        }
      }
    }
    query.includeSample = true
    // Immutable samples enumerate children in time order; parent UUID + ordinal
    // is stable on re-query and preserves distinct measurements at the same time.
    query.orderByQuantitySampleStartDate = true
    health.execute(query)
  }
  private func mergeHealthHeart(_ id: String, read: HealthHeartRead, deletedIDs: Set<String>) throws {
    guard let store, !store.deletedIDs().contains(id) else { throw problem("삭제한 기록에는 심박을 추가하지 않아요.") }
    let current = engine?.id == id
    guard !current || writeFailedAt == nil else { throw problem("기록 저장을 복구한 뒤 심박을 다시 불러와 주세요.") }
    let e = current ? engine! : try store.load(id, repair: true)
    guard e.healthHeartEnabled else { return }
    // A terminated process's open interval must not admit fabricated running time.
    var events: [TrackingEvent] = []
    if !current && e.status == "running" {
      let interrupt = TrackingEvent(kind: "interrupt", time: e.lastSaved ?? e.started)
      e.apply(interrupt); events.append(interrupt)
    }
    // Empty reads cannot distinguish revoked permission from no data. Only
    // explicit anchored deletion notices remove saved samples.
    for parentID in deletedIDs.sorted() where !e.hasDeletedHealthSample(parentID) {
      // Persist even when no child has arrived yet: a slower series query must
      // never resurrect an explicitly deleted HealthKit sample.
      let event = TrackingEvent(kind: "heartDeleted", time: now, sampleID: parentID)
      e.apply(event); events.append(event)
    }
    for parentID in read.seriesCounts.keys.sorted() where e.hearts.contains(where: { $0.id == parentID && $0.source?.hasPrefix("health:") == true }) {
      let event = TrackingEvent(kind: "heartSeries", time: now, sampleID: parentID)
      e.apply(event); events.append(event)
    }
    for event in read.events.sorted(by: { $0.time < $1.time }) {
      let count = e.hearts.count
      e.apply(event)
      if e.hearts.count > count { events.append(event) }
    }
    guard !events.isEmpty else { return }
    if current { pending.append(contentsOf: events); guard flush() else { throw problem("심박 저장을 다시 시도해 주세요.") } }
    else {
      var summary = e.summary(at: e.ended ?? e.intervals.last?.end ?? e.started); summary.lastSaved = now
      try store.append(id: id, started: e.started, events: events, summary: summary)
      historyCache.removeValue(forKey: id)
    }
  }
  private func closeWatchRecovery() {
    if let start = watchRecoveryStart { append(TrackingEvent(kind: "watchRecovery", time: now, intervalStart: start)); watchRecoveryStart = nil }
  }
  private func beginSensors() {
    location.allowsBackgroundLocationUpdates = true
    location.showsBackgroundLocationIndicator = true
    location.startUpdatingLocation()
    // Defer the first Motion prompt until HealthKit finishes so two system
    // permission sheets do not compete. GPS and workout time already run.
    if engine?.healthHeartEnabled != true { beginMotion() }
  }
  private func beginMotion() {
    guard !motionCollecting, engine?.status == "running", CMPedometer.isStepCountingAvailable(), let interval = engine?.intervals.last else { return }
    // A lock-screen resume reuses authorization; first-time permission sheets
    // belong to a foreground app visit, not a background App Intent.
    guard CMPedometer.authorizationStatus() != .notDetermined || UIApplication.shared.applicationState == .active else { return }
    motionCollecting = true
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
  private func stopSensors() { location.stopUpdatingLocation(); motion.stopUpdates(); motionCollecting = false; ready = nil }
  private func append(_ event: TrackingEvent) { engine?.apply(event); pending.append(event) }
  private func battery() {
    append(TrackingEvent(kind: "power", time: now, value: ProcessInfo.processInfo.isLowPowerModeEnabled ? 1 : 0))
    let value = UIDevice.current.batteryLevel
    let charging = UIDevice.current.batteryState == .charging || UIDevice.current.batteryState == .full
    append(TrackingEvent(kind: "battery", time: now, value: value < 0 ? nil : Double(value), detail: charging ? "charging" : "unplugged"))
  }
  @discardableResult private func flush() -> Bool {
    defer { syncLiveActivity() }
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
    stopHealthHeart(); stopSensors(); preparing = false; phase = engine?.status ?? "interrupted"; syncWatch()
  }
  private func checkpointIfDue() {
    if writeFailedAt != nil { return }
    if now - (engine?.lastSaved ?? 0) >= 5 { battery(); flush() }
  }
  private func onTick() {
    defer { syncLiveActivity() }
    if let request = watchRequest, !request.valid(at: now) {
      cancelPreparation(); notice = "워치의 러닝 요청 시간이 지났어요. 다시 시작해 주세요."; syncWatch()
    }
    if preparing {
      if TrackingSampleRules.preparationTimedOut(started: prepareAt, lastReady: gpsReadyAt, now: now) { cancelPreparation(); notice = "GPS 준비가 오래 걸려요. 야외에서 다시 시도해 주세요."; syncWatch() }
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
    if Int(now) % 3 == 0, engine != nil || watchRequest != nil || (WCSession.isSupported() && WCSession.default.isReachable) { syncWatch() }
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
    continuePhoneStart()
    if preparing {
      if authorizeLocation() && manager.accuracyAuthorization == .fullAccuracy { manager.startUpdatingLocation() }
      else if manager.authorizationStatus != .notDetermined { cancelPreparation(); notice = "앱 권한에서 위치와 정확한 위치를 확인해 주세요." }
    }
    validatePermissions()
  }
  func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
    if preparing {
      if let candidate = locations.last(where: { validPreparation($0) }) { ready = candidate; gpsReadyAt = now; phase = "ready" }
      continueWatchRequest(); syncWatch()
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
      "summary": summary, "watchState": watchState, "healthHeartState": healthHeartState,
      "watchStartPending": watchRequest != nil, "phoneStartPending": phoneStartPending,
      "liveActivityState": liveActivity.availability,
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
    guard let engine, engine.status != "completed" else { throw problem("측정을 시작한 뒤 워치를 연결해 주세요.") }
    watchState = "connecting"; watchRequestedAt = now
    syncWatch()
    launchWatch()
  }
  private func launchWatch() {
    guard let engine, engine.status == "running", WCSession.isSupported(), HKHealthStore.isHealthDataAvailable() else { return }
    // Only explicit start/resume calls request a launch. Context/timer updates
    // never reopen the Watch app or start a competing Watch workout.
    guard WCSession.default.activationState == .activated else {
      watchLaunch = (engine.id, now); return
    }
    watchLaunch = nil
    guard WCSession.default.isPaired, WCSession.default.isWatchAppInstalled, !WCSession.default.isReachable else { return }
    let id = engine.id
    let configuration = HKWorkoutConfiguration()
    configuration.activityType = .running; configuration.locationType = .outdoor
    append(TrackingEvent(kind: "watchLaunch", time: now, detail: "requested"))
    health.startWatchApp(with: configuration) { [weak self] success, error in
      DispatchQueue.main.async {
        guard let self, self.engine?.id == id, self.engine?.status == "running" else { return }
        if success { self.append(TrackingEvent(kind: "watchLaunch", time: self.now, detail: "succeeded")) }
        else { self.note("watchLaunchFailed:\((error as NSError?)?.domain ?? "unknown"):\((error as NSError?)?.code ?? 0)") }
        // Launch completion alone does not confirm fresh metrics on the Watch.
        self.syncWatch()
      }
    }
  }
  private func setWatchRequest(_ request: TrackingWatchRequest?) {
    watchRequest = request
    if let request, let data = try? JSONEncoder().encode(request) { UserDefaults.standard.set(data, forKey: watchRequestKey) }
    else { UserDefaults.standard.removeObject(forKey: watchRequestKey) }
  }
  private func continueWatchRequest() {
    guard !phoneStartPending, let request = watchRequest else { return }
    guard request.valid(at: now) else { cancelPreparation(); notice = "워치의 러닝 요청 시간이 지났어요."; syncWatch(); return }
    if request.action == "start", engine != nil { setWatchRequest(nil); syncWatch(); return }
    if request.action == "resume", engine?.id != request.id || !["paused", "interrupted"].contains(engine?.status ?? "") {
      setWatchRequest(nil); syncWatch(); return
    }
    guard UIApplication.shared.applicationState == .active else {
      notice = "워치에서 러닝을 요청했어요. 아이폰 Runary를 열면 GPS 준비 후 시작합니다."; syncWatch(); return
    }
    do {
      if let ready, validPreparation(ready) {
        if request.action == "start" { try start() } else { try resume() }
      } else if !preparing { try prepare() }
    } catch { setWatchRequest(nil); notice = error.localizedDescription; syncWatch() }
  }
  private func watchReply(accepted: Bool, error: String? = nil) -> [String: Any] {
    var reply: [String: Any] = ["accepted": accepted, "snapshot": watchMessage()]
    if let error { reply["error"] = error }
    return reply
  }
  private func syncDeletions() {
    guard WCSession.isSupported(), WCSession.default.activationState == .activated, let store else { return }
    let ids = store.deletedIDs()
    for start in stride(from: 0, to: ids.count, by: 200) {
      WCSession.default.transferUserInfo(["kind": "delete", "ids": Array(ids[start..<min(start + 200, ids.count)])])
    }
  }
  private func watchMessage() -> [String: Any] {
    let watchPhase = watchRequest != nil && UIApplication.shared.applicationState != .active ? "needsPhone" : phase
    guard let engine else {
      var message: [String: Any] = ["kind": "noRun", "sent": now, "phase": watchPhase, "startPending": watchRequest != nil, "startSupported": true]
      if let watchRequest { message["requestID"] = watchRequest.id }
      if let notice { message["notice"] = notice }
      return message
    }
    var message = (json(engine.summary(at: now)) as? [String: Any]) ?? [:]
    message = message.filter { !($0.value is NSNull) }
    message["kind"] = "run"; message["sent"] = now; message["displayOnly"] = true
    message["startPending"] = watchRequest != nil; message["healthHeartState"] = healthHeartState
    message["startSupported"] = true
    message["requestPhase"] = watchPhase
    if let watchRequest { message["requestID"] = watchRequest.id }
    if let notice { message["notice"] = notice }
    return message
  }
  private func syncWatch() {
    syncLiveActivity()
    guard Self.enabled, WCSession.isSupported() else { return }
    let session = WCSession.default
    guard session.isPaired else { watchState = "notPaired"; return }
    guard session.isWatchAppInstalled else { watchState = "notInstalled"; return }
    guard session.activationState == .activated else { return }
    let message = watchMessage()
    let id = engine?.id
    do { try session.updateApplicationContext(message) } catch { watchState = "disconnected" }
    if session.isReachable {
      session.sendMessage(message, replyHandler: { [weak self] reply in
        DispatchQueue.main.async { [weak self] in _ = self?.receive(reply, live: true) }
      }, errorHandler: { [weak self] _ in
        DispatchQueue.main.async { if self?.engine?.id == id { self?.watchState = "disconnected" } }
      })
    }
  }
  private func receive(_ message: [String: Any], live: Bool = false) -> [String: Any] {
    guard Self.enabled else { return ["accepted": false] }
    if message["kind"] as? String == "healthBatch" {
      guard let batch = TrackingWatchHealthBatch(message, at: now), let store else { return ["accepted": false] }
      var reply: [String: Any] = ["kind": "healthAck", "batchID": batch.batchID, "accepted": false]
      // Deleted/unknown records are discarded; a delayed batch cannot create one.
      if store.deletedIDs().contains(batch.runID) {
        reply["accepted"] = true; return reply
      }
      do {
        if engine?.id != batch.runID, !(try store.ids()).contains(batch.runID) {
          reply["accepted"] = true; return reply
        }
        let e = engine?.id == batch.runID ? engine! : try store.load(batch.runID, repair: true)
        guard e.healthHeartEnabled else { reply["accepted"] = true; return reply }
        let read = HealthHeartRead()
        for sample in batch.samples {
          read.events.append(.healthHeart(parentID: sample.parent, index: sample.index, time: sample.time,
            received: now, bpm: sample.bpm, source: sample.source))
          if let count = sample.seriesCount { read.seriesCounts[sample.parent] = count }
        }
        try mergeHealthHeart(batch.runID, read: read, deletedIDs: Set(batch.deleted))
        if engine?.id == batch.runID {
          if engine?.hearts.isEmpty == false { healthHeartState = "reading" }
          append(TrackingEvent(kind: "healthWatch", time: now, detail: "samples:\(batch.samples.count),deleted:\(batch.deleted.count)"))
          guard flush() else { return reply }
        }
        syncWatch(); reply["accepted"] = true; reply["snapshot"] = watchMessage()
      } catch { return reply }
      return reply
    }
    if message["kind"] as? String == "sessionProbe" {
      guard let probe = TrackingWatchProbe(message, at: now) else { return ["accepted": false] }
      do {
        let root = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0].appendingPathComponent("InternalRunProbe", isDirectory: true)
        try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
        var resource = root; var values = URLResourceValues(); values.isExcludedFromBackup = true; try resource.setResourceValues(values)
        let path = root.appendingPathComponent("watch-session.json")
        var history = (try? JSONDecoder().decode([TrackingWatchProbe].self, from: Data(contentsOf: path))) ?? []
        if !history.contains(where: { $0.id == probe.id && $0.sent == probe.sent && $0.event == probe.event }) {
          history.append(probe); history.sort { $0.sent < $1.sent }; history = Array(history.suffix(60))
          try JSONEncoder().encode(history).write(to: path, options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
        }
        return ["accepted": true]
      } catch { return ["accepted": false] }
    }
    if live, ["displayReady", "displayAck"].contains(message["kind"] as? String ?? ""),
       let sent = message["sent"] as? Double, sent.isFinite, now - sent >= -2, now - sent <= 10,
       let build = message["appBuild"] as? String, build.count <= 40,
       let version = message["syncVersion"] as? Int {
      let info = "build:\(build),sync:\(version),launchHandled:\(message["launchHandled"] as? Bool == true)"
      if info != watchAppInfo {
        watchAppInfo = info
        if engine != nil { append(TrackingEvent(kind: "watchApp", time: now, detail: info)) }
      }
    }
    if live, message["kind"] as? String == "displayReady" {
      if let sent = message["sent"] as? Double, sent.isFinite, now - sent >= -2, now - sent <= 10 {
        watchResponseAt = sent; watchState = "connected"
      }
      return watchMessage()
    }
    guard let id = message["id"] as? String, UUID(uuidString: id) != nil else { return ["accepted": false] }
    if live, message["request"] as? String == "cancelStart" {
      guard let sent = message["sent"] as? Double, sent.isFinite, now - sent >= -2, now - sent <= 10,
            watchRequest?.id == id else { return watchReply(accepted: false) }
      cancelPreparation(); syncWatch(); return watchReply(accepted: true)
    }
    if live, message["request"] as? String == "start" {
      guard let request = TrackingWatchRequest(message: message, at: now) else { return watchReply(accepted: false, error: "러닝 요청 시간이 지났어요.") }
      if watchRequests.contains(id, at: now) {
        return watchReply(accepted: engine != nil || watchRequest != nil, error: engine == nil && watchRequest == nil ? "이미 처리한 요청이에요. 새로 시작해 주세요." : nil)
      }
      watchRequests.insert(id, at: now)
      if let data = try? JSONEncoder().encode(watchRequests) { UserDefaults.standard.set(data, forKey: watchRequestsKey) }
      // An existing run is authoritative, including a paused/recovered one.
      if engine != nil { return watchReply(accepted: true) }
      guard let ids = try? store?.ids(), !ids.contains(id), store?.deletedIDs().contains(id) != true else {
        return watchReply(accepted: false, error: "이미 마친 러닝 요청이에요. 새로 시작해 주세요.")
      }
      if watchRequest == nil { setWatchRequest(request) }
      continueWatchRequest()
      return watchReply(accepted: engine != nil || watchRequest != nil, error: watchRequest == nil && engine == nil ? notice : nil)
    }
    if live, message["kind"] as? String == "displayAck", engine?.id == id {
      guard message["accepted"] as? Bool == true, let sent = message["sent"] as? Double,
            sent.isFinite, now - sent >= -2, now - sent <= 10, sent >= (watchResponseAt ?? -.greatestFiniteMagnitude) else { return ["accepted": false] }
      watchResponseAt = sent; watchState = "connected"; return ["accepted": true]
    }
    if live, let request = message["request"] as? String, engine?.id == id {
      guard let sent = message["sent"] as? Double, sent.isFinite, now - sent >= -2, now - sent <= 10 else {
        return watchReply(accepted: false, error: "요청 시간이 지났어요. 상태를 갱신하고 있어요.")
      }
      do {
        switch request {
        case "pause": try pause()
        case "resume":
          guard let command = TrackingWatchRequest(message: message, at: now) else { return watchReply(accepted: false) }
          if ["paused", "interrupted"].contains(engine?.status ?? "") { setWatchRequest(command); continueWatchRequest() }
        case "finish": try finish()
        default: return ["accepted": false]
        }
        return watchReply(accepted: true)
      } catch { return watchReply(accepted: false, error: error.localizedDescription) }
    }
    guard let values = message["hearts"] as? [[String: Any]], values.count <= 200 else {
      if engine?.id == id, let error = message["error"] as? String { watchState = "failed"; note("watch:\(error)") }
      return ["accepted": false]
    }
    let current = engine?.id == id
    if current && writeFailedAt != nil { return ["accepted": false] }
    guard let e = current ? engine : try? store?.load(id, repair: true), e.watchEnabled, !e.healthHeartEnabled else { return ["accepted": false] }
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
    DispatchQueue.main.async { [weak self] in
      guard let self else { return }
      self.syncDeletions(); self.syncWatch()
      if let launch = self.watchLaunch, self.engine?.id == launch.id, self.now - launch.requested <= 10 { self.launchWatch() }
      else { self.watchLaunch = nil }
    }
  }
  func sessionDidBecomeInactive(_ session: WCSession) {}
  func sessionDidDeactivate(_ session: WCSession) { session.activate() }
  func sessionReachabilityDidChange(_ session: WCSession) {
    DispatchQueue.main.async { [weak self] in self?.syncWatch() }
  }
  func session(_ session: WCSession, didReceiveMessage message: [String: Any], replyHandler: @escaping ([String: Any]) -> Void) {
    DispatchQueue.main.async { [weak self] in replyHandler(self?.receive(message, live: true) ?? ["accepted": false]) }
  }
  func session(_ session: WCSession, didReceiveMessage message: [String: Any]) {
    DispatchQueue.main.async { [weak self] in _ = self?.receive(message, live: true) }
  }
  func session(_ session: WCSession, didReceiveUserInfo userInfo: [String: Any]) {
    DispatchQueue.main.async { [weak self] in
      guard let self else { return }
      let reply = self.receive(userInfo)
      if userInfo["kind"] as? String == "healthBatch", reply["accepted"] as? Bool == true,
         let id = reply["batchID"] as? String, session.activationState == .activated {
        session.transferUserInfo(["kind": "healthAck", "batchID": id, "accepted": true])
      }
    }
  }
}
