import Foundation
import HealthKit
import WatchConnectivity
import Combine

// Reads stored HealthKit samples only; never starts a sensor or workout session.
final class WatchHealthReader: ObservableObject {
  @Published private(set) var needsPermission = false
  @Published private(set) var message = "건강 앱 심박 대기"
  @Published private(set) var requesting = false
  var deliver: ((String, [TrackingWatchHealthSample], [String]) -> Void)?
  private let health = HKHealthStore()
  private var runID: String?
  private var started = 0.0
  private var running = false
  private var responded = false
  private var generation = UUID()
  private var permissionGeneration = UUID()
  private var queries: [HKQuery] = []
  private var seen = Set<String>()
  private var reading = Set<String>()
  private var deleted = Set<String>()

  func refreshPermission() {
    guard !requesting, let type = HKObjectType.quantityType(forIdentifier: .heartRate) else { return }
    let token = UUID(); permissionGeneration = token
    health.getRequestStatusForAuthorization(toShare: [], read: [type]) { [weak self] status, error in
      DispatchQueue.main.async {
        guard let self, self.permissionGeneration == token else { return }
        self.responded = error == nil && status == .unnecessary
        self.needsPermission = error == nil && status == .shouldRequest
        if error != nil || status == .unknown { self.message = "건강 심박 읽기를 확인하지 못했어요." }
        if self.responded { self.stopQueries() }
        self.beginIfNeeded()
      }
    }
  }
  func requestPermission() {
    guard !requesting, let type = HKObjectType.quantityType(forIdentifier: .heartRate) else { return }
    requesting = true; let token = UUID(); permissionGeneration = token
    health.getRequestStatusForAuthorization(toShare: [], read: [type]) { [weak self] status, error in
      guard error == nil, status != .unknown else {
        DispatchQueue.main.async { self?.finishPermission(token: token, completed: false) }; return
      }
      if status == .unnecessary {
        DispatchQueue.main.async { self?.finishPermission(token: token, completed: true) }; return
      }
      self?.health.requestAuthorization(toShare: [], read: [type]) { success, error in
        DispatchQueue.main.async { self?.finishPermission(token: token, completed: success && error == nil) }
      }
    }
  }
  private func finishPermission(token: UUID, completed: Bool) {
    guard permissionGeneration == token else { return }
    requesting = false
    // A completed request means answered, not permission granted.
    if completed { responded = true; needsPermission = false; stopQueries(); beginIfNeeded() }
    else { message = "건강 심박 권한 요청을 완료하지 못했어요." }
  }
  func sync(_ display: TrackingWatchDisplay, at now: Double) {
    guard display.stateFresh(at: now) else { return }
    let id = display.metrics["id"] as? String
    if runID != id {
      stopQueries(); runID = id; seen = []; deleted = []
      started = display.metrics["started"] as? Double ?? now
    }
    running = id != nil && display.metrics["status"] as? String == "running"
    if !running { stopQueries(); message = "건강 앱 심박 대기" }
    else { beginIfNeeded() }
  }
  func remove(runID id: String) {
    if runID == id { stopQueries(); runID = nil; running = false; seen = []; deleted = [] }
  }
  private func stopQueries() {
    generation = UUID(); for query in queries { health.stop(query) }; queries = []; reading = []
  }
  private func beginIfNeeded() {
    guard responded, running, queries.isEmpty, let id = runID,
          UUID(uuidString: id) != nil, started.isFinite,
          Date().timeIntervalSince1970 - started < TrackingWatchHealthBatch.lifetime,
          let type = HKObjectType.quantityType(forIdentifier: .heartRate) else { return }
    let token = UUID(); generation = token
    message = "건강 앱에 저장된 새 심박 대기"
    let predicate = HKQuery.predicateForSamples(withStart: Date(timeIntervalSince1970: started), end: nil, options: [])
    let handler: (HKAnchoredObjectQuery, [HKSample]?, [HKDeletedObject]?, HKQueryAnchor?, Error?) -> Void = { [weak self] _, samples, removed, _, error in
      DispatchQueue.main.async {
        guard let self, self.generation == token, self.runID == id else { return }
        if error != nil { self.stopQueries(); self.message = "건강 심박 조회를 완료하지 못했어요."; return }
        let newlyDeleted = (removed ?? []).map { $0.uuid.uuidString }.filter { !self.deleted.contains($0) }
        self.deleted.formUnion(newlyDeleted)
        for offset in stride(from: 0, to: newlyDeleted.count, by: TrackingWatchHealthBatch.maxItems) {
          self.deliver?(id, [], Array(newlyDeleted[offset..<min(offset + TrackingWatchHealthBatch.maxItems, newlyDeleted.count)]))
        }
        var singles: [TrackingWatchHealthSample] = []; var series: [HKQuantitySample] = []
        for sample in (samples ?? []).compactMap({ $0 as? HKQuantitySample }) {
          let parent = sample.uuid.uuidString
          guard !self.seen.contains(parent), !self.reading.contains(parent), !self.deleted.contains(parent) else { continue }
          if sample.count == 1 {
            self.seen.insert(parent)
            singles.append(TrackingWatchHealthSample(parent: parent, index: nil, seriesCount: nil,
              time: sample.startDate.timeIntervalSince1970,
              bpm: sample.quantity.doubleValue(for: HKUnit.count().unitDivided(by: .minute())),
              source: sample.sourceRevision.source.bundleIdentifier))
          } else if sample.count > 1 && sample.count <= 100_000 { series.append(sample) }
        }
        self.emit(singles, id: id)
        if !series.isEmpty { self.readSeries(series, type: type, id: id, token: token) }
      }
    }
    let query = HKAnchoredObjectQuery(type: type, predicate: predicate, anchor: nil, limit: HKObjectQueryNoLimit, resultsHandler: handler)
    query.updateHandler = handler; queries.append(query); health.execute(query)
  }
  private func readSeries(_ samples: [HKQuantitySample], type: HKQuantityType, id: String, token: UUID) {
    let expected = Dictionary(samples.map { ($0.uuid.uuidString, $0.count) }, uniquingKeysWith: { first, _ in first })
    reading.formUnion(expected.keys)
    var values: [String: [TrackingWatchHealthSample]] = [:]; var finished = false
    let predicate = HKQuery.predicateForObjects(with: Set(samples.map { $0.uuid }))
    let query = HKQuantitySeriesSampleQuery(quantityType: type, predicate: predicate) { [weak self] query, quantity, interval, sample, done, error in
      DispatchQueue.main.async {
        guard let self, self.generation == token, self.runID == id, !finished else { return }
        if error != nil {
          finished = true; self.reading.subtract(expected.keys); self.health.stop(query); self.queries.removeAll { $0 === query }
          self.message = "건강 심박 묶음을 읽지 못했어요."; return
        }
        if let quantity, let interval, let sample, let count = expected[sample.uuid.uuidString] {
          let parent = sample.uuid.uuidString
          let index = values[parent, default: []].count
          values[parent, default: []].append(TrackingWatchHealthSample(parent: parent, index: index, seriesCount: count,
            time: interval.start.timeIntervalSince1970, bpm: quantity.doubleValue(for: HKUnit.count().unitDivided(by: .minute())),
            source: sample.sourceRevision.source.bundleIdentifier))
        }
        if done {
          finished = true; self.reading.subtract(expected.keys); self.health.stop(query); self.queries.removeAll { $0 === query }
          for (parent, count) in expected {
            guard let children = values[parent], children.count == count else { self.message = "건강 심박 묶음 수신이 미완료예요."; continue }
            self.seen.insert(parent); self.emit(children, id: id)
          }
        }
      }
    }
    query.includeSample = true; query.orderByQuantitySampleStartDate = true; queries.append(query); health.execute(query)
  }
  private func emit(_ values: [TrackingWatchHealthSample], id: String) {
    let now = Date().timeIntervalSince1970
    let accepted = values.filter { $0.time >= started && $0.valid(at: now) && !deleted.contains($0.parent) }
    for offset in stride(from: 0, to: accepted.count, by: TrackingWatchHealthBatch.maxItems) {
      deliver?(id, Array(accepted[offset..<min(offset + TrackingWatchHealthBatch.maxItems, accepted.count)]), [])
    }
    if !accepted.isEmpty { message = "건강 저장소의 심박을 읽었어요." }
  }
}
