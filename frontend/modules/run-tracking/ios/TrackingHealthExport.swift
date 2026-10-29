import Foundation
import HealthKit
import CoreLocation

// Local recording is authoritative. Only this phone writes the completed workout.
// Persist the actual HKWorkout before submitting it so crash retries keep its UUID.
final class TrackingHealthExport {
  private let health = HKHealthStore()
  private let root: URL
  private var busy = Set<String>()
  static let runKey = "com.mechuri.runary.runID"
  static let enabledKey = "RunaryHealthExportEnabledSince"
  var enabledSince: Double { UserDefaults.standard.double(forKey: Self.enabledKey) }
  // Write authorization is the only HealthKit status the OS reports to the app
  // (0 not requested, 1 denied, 2 allowed). Read authorization is never exposed.
  var workoutWriteStatus: Int { health.authorizationStatus(for: HKObjectType.workoutType()).rawValue }
  var routeWriteStatus: Int { health.authorizationStatus(for: HKSeriesType.workoutRoute()).rawValue }
  var heartWriteStatus: Int { health.authorizationStatus(for: HKObjectType.quantityType(forIdentifier: .heartRate)!).rawValue }
  init(root: URL) { self.root = root.appendingPathComponent("HealthExports", isDirectory: true) }
  func enable(_ enabled: Bool, completion: @escaping (Error?) -> Void) {
    guard enabled else { UserDefaults.standard.removeObject(forKey: Self.enabledKey); completion(nil); return }
    let types: Set<HKSampleType> = [HKObjectType.workoutType(), HKSeriesType.workoutRoute(), HKObjectType.quantityType(forIdentifier: .heartRate)!]
    health.requestAuthorization(toShare: types, read: [HKObjectType.workoutType(), HKObjectType.quantityType(forIdentifier: .heartRate)!]) { _, error in
      DispatchQueue.main.async {
        if error == nil, self.health.authorizationStatus(for: HKObjectType.workoutType()) == .sharingAuthorized {
          if self.enabledSince == 0 { UserDefaults.standard.set(Date().timeIntervalSince1970, forKey: Self.enabledKey) }
          completion(nil)
        } else { completion(error ?? NSError(domain: "RunaryHealth", code: 1, userInfo: [NSLocalizedDescriptionKey: "건강 앱의 운동 쓰기 권한을 확인해 주세요."])) }
      }
    }
  }
  // Called only by an explicit retry, never by background export.
  func prepareHeartLink(_ engine: TrackingEngine, completion: @escaping (Error?) -> Void) {
    guard !engine.hearts.isEmpty else { completion(nil); return }
    let type = HKObjectType.quantityType(forIdentifier: .heartRate)!
    func finish() {
      if health.authorizationStatus(for: type) == .sharingAuthorized { completion(nil) }
      else { completion(NSError(domain: "RunaryHealth", code: 4, userInfo: [NSLocalizedDescriptionKey: "운동에 심박을 연결하려면 건강 앱에서 Runary의 심박수 쓰기를 허용해 주세요."])) }
    }
    guard health.authorizationStatus(for: type) != .sharingAuthorized else { finish(); return }
    health.getRequestStatusForAuthorization(toShare: [type], read: [type]) { status, error in
      DispatchQueue.main.async {
        guard error == nil else { completion(error); return }
        guard status == .shouldRequest else { finish(); return }
        self.health.requestAuthorization(toShare: [type], read: [type]) { _, error in
          DispatchQueue.main.async {
            if let error { completion(error) } else { finish() }
          }
        }
      }
    }
  }
  private func directory(_ id: String) -> URL { root.appendingPathComponent(id, isDirectory: true) }
  func state(_ id: String) -> [String: Any] {
    guard UUID(uuidString: id) != nil else { return ["status": "off"] }
    return (try? JSONSerialization.jsonObject(with: Data(contentsOf: directory(id).appendingPathComponent("state.json"))) as? [String: Any]) ?? ["status": "off"]
  }
  private func write(_ id: String, _ state: [String: Any]) throws {
    let dir = directory(id)
    try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
    var resource = root; var values = URLResourceValues(); values.isExcludedFromBackup = true; try resource.setResourceValues(values)
    try JSONSerialization.data(withJSONObject: state).write(to: dir.appendingPathComponent("state.json"), options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
  }
  func export(_ engine: TrackingEngine) {
    let id = engine.id
    let receipt = state(id)
    let heartIDs = Set(engine.hearts.compactMap { UUID(uuidString: $0.parentSampleID ?? $0.id)?.uuidString })
    let linked = Set(receipt["linkedHearts"] as? [String] ?? [])
    guard engine.status == "completed", enabledSince > 0, engine.started >= enabledSince,
          !busy.contains(id), receipt["status"] as? String != "saved" || !heartIDs.isSubset(of: linked) else { return }
    busy.insert(id)
    var progress = state(id)
    do {
      progress["status"] = "pending"
      progress.removeValue(forKey: "errorDomain"); progress.removeValue(forKey: "errorCode")
      try write(id, progress)
      guard health.authorizationStatus(for: HKObjectType.workoutType()) == .sharingAuthorized else { throw NSError(domain: "RunaryHealth", code: 2) }
      let url = directory(id).appendingPathComponent("workout.archive")
      let workout: HKWorkout
      if FileManager.default.fileExists(atPath: url.path) {
        guard let archived = try NSKeyedUnarchiver.unarchivedObject(ofClass: HKWorkout.self, from: Data(contentsOf: url)) else { throw NSError(domain: "RunaryHealth", code: 3) }
        workout = archived
      } else {
        let summary = engine.summary(at: engine.ended ?? engine.started)
        workout = HKWorkout(activityType: .running, start: Date(timeIntervalSince1970: engine.started), end: Date(timeIntervalSince1970: engine.ended ?? engine.started), duration: summary.duration, totalEnergyBurned: nil, totalDistance: HKQuantity(unit: .meter(), doubleValue: summary.distance), metadata: [Self.runKey: id, HKMetadataKeySyncIdentifier: "runary:" + id, HKMetadataKeySyncVersion: 1, HKMetadataKeyIndoorWorkout: false])
        try NSKeyedArchiver.archivedData(withRootObject: workout, requiringSecureCoding: true).write(to: url, options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
      }
      progress["workoutID"] = workout.uuid.uuidString
      if progress["workoutSaved"] as? Bool == true { saveRoutes(engine, workout: workout, progress: progress); return }
      health.save(workout) { success, error in
        DispatchQueue.main.async {
          guard success, error == nil else { self.fail(id, progress, error: error); return }
          var next = progress; next["workoutSaved"] = true
          do { try self.write(id, next); self.saveRoutes(engine, workout: workout, progress: next) }
          catch { self.fail(id, next) }
        }
      }
    } catch { fail(id, progress, error: error) }
  }
  private func fail(_ id: String, _ progress: [String: Any], error: Error? = nil) {
    var failed = progress; failed["status"] = "failed"
    if let error = error as NSError? { failed["errorDomain"] = error.domain; failed["errorCode"] = error.code }
    try? write(id, failed); busy.remove(id)
  }
  private func saveRoutes(_ engine: TrackingEngine, workout: HKWorkout, progress: [String: Any]) {
    let groups = Dictionary(grouping: engine.points, by: \.segment)
    let saved = Set(progress["segments"] as? [Int] ?? [])
    guard let segment = groups.keys.sorted().first(where: { !saved.contains($0) && (groups[$0]?.count ?? 0) > 1 }) else {
      linkHeart(engine, workout: workout, progress: progress)
      return
    }
    guard health.authorizationStatus(for: HKSeriesType.workoutRoute()) == .sharingAuthorized else { fail(engine.id, progress); return }
    let builder = HKWorkoutRouteBuilder(healthStore: health, device: nil)
    let points = groups[segment]!.map { CLLocation(coordinate: CLLocationCoordinate2D(latitude: $0.latitude, longitude: $0.longitude), altitude: 0, horizontalAccuracy: $0.accuracy ?? -1, verticalAccuracy: -1, timestamp: Date(timeIntervalSince1970: $0.time)) }
    builder.insertRouteData(points) { success, error in
      guard success, error == nil else { DispatchQueue.main.async { self.fail(engine.id, progress, error: error) }; return }
      // Stable per-segment sync identity also covers a crash before saving the local receipt.
      builder.finishRoute(with: workout, metadata: [HKMetadataKeySyncIdentifier: "runary:\(engine.id):route:\(segment)", HKMetadataKeySyncVersion: 1]) { route, error in
        DispatchQueue.main.async {
          guard route != nil, error == nil else { self.fail(engine.id, progress, error: error); return }
          var next = progress; next["segments"] = Array(saved.union([segment])).sorted()
          do { try self.write(engine.id, next); self.saveRoutes(engine, workout: workout, progress: next) }
          catch { self.fail(engine.id, next) }
        }
      }
    }
  }
  private func linkHeart(_ engine: TrackingEngine, workout: HKWorkout, progress: [String: Any]) {
    let ids = Set(engine.hearts.compactMap { UUID(uuidString: $0.parentSampleID ?? $0.id) })
    guard !ids.isEmpty else { complete(engine.id, progress); return }
    let type = HKObjectType.quantityType(forIdentifier: .heartRate)!
    let query = HKSampleQuery(sampleType: type, predicate: HKQuery.predicateForObjects(with: ids), limit: HKObjectQueryNoLimit, sortDescriptors: nil) { _, samples, error in
      guard error == nil, let samples, Set(samples.map { $0.uuid }).isSuperset(of: ids) else {
        DispatchQueue.main.async { self.fail(engine.id, progress, error: error) }; return
      }
      // Link the existing HealthKit objects; never create copies of Apple/other-app HR.
      self.health.add(samples, to: workout) { success, error in
        DispatchQueue.main.async {
          if success && error == nil {
            var linked = progress; linked["linkedHearts"] = ids.map { $0.uuidString }.sorted()
            self.complete(engine.id, linked)
          } else { self.fail(engine.id, progress, error: error) }
        }
      }
    }
    health.execute(query)
  }
  private func complete(_ id: String, _ progress: [String: Any]) {
    var complete = progress; complete["status"] = "saved"
    do { try write(id, complete); busy.remove(id) } catch { fail(id, progress, error: error) }
  }
  func removeLocalReceipt(_ id: String) throws {
    let dir = directory(id)
    if FileManager.default.fileExists(atPath: dir.path) { try FileManager.default.removeItem(at: dir) }
  }
  func isBusy(_ id: String) -> Bool { busy.contains(id) }
}
