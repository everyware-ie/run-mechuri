import Foundation

enum TrackingHealthHeartRules {
  // Generous data-validation ceiling, also safe for Watch integer formatting.
  static func valid(_ bpm: Double) -> Bool { bpm.isFinite && bpm > 0 && bpm <= 1_000 }
}

// FRD §8-7: HealthKit UUID + series ordinal is shared with the phone reader.
struct TrackingWatchHealthSample: Codable {
  let parent: String
  let index: Int?
  let seriesCount: Int?
  let time: Double
  let bpm: Double
  let source: String
  var payload: [String: Any] {
    var value: [String: Any] = ["parent": parent, "time": time, "bpm": bpm, "source": source]
    if let index { value["index"] = index; value["seriesCount"] = seriesCount }
    return value
  }
  func valid(at now: Double) -> Bool {
    guard UUID(uuidString: parent) != nil, time.isFinite, time <= now + 2,
          TrackingHealthHeartRules.valid(bpm), source.count <= 200, !source.isEmpty else { return false }
    if let index { return index >= 0 && (seriesCount ?? 0) >= 2 && index < (seriesCount ?? 0) && (seriesCount ?? 0) <= 100_000 }
    return seriesCount == nil
  }
}

struct TrackingWatchHealthBatch: Codable {
  static let lifetime = 86_400.0
  static let maxItems = 100
  let batchID: String
  let runID: String
  let sent: Double
  let samples: [TrackingWatchHealthSample]
  let deleted: [String]
  var payload: [String: Any] {
    ["kind": "healthBatch", "version": 1, "batchID": batchID, "id": runID, "sent": sent,
     "samples": samples.map { $0.payload }, "deleted": deleted]
  }
  init(runID: String, sent: Double, samples: [TrackingWatchHealthSample], deleted: [String]) {
    self.batchID = UUID().uuidString; self.runID = runID; self.sent = sent
    self.samples = samples; self.deleted = deleted
  }
  init?(_ payload: [String: Any], at now: Double) {
    guard payload["kind"] as? String == "healthBatch", payload["version"] as? Int == 1,
          let batchID = payload["batchID"] as? String, let runID = payload["id"] as? String,
          let sent = payload["sent"] as? Double,
          let values = payload["samples"] as? [[String: Any]], let deleted = payload["deleted"] as? [String],
          values.count <= Self.maxItems, deleted.count <= Self.maxItems else { return nil }
    var samples: [TrackingWatchHealthSample] = []
    for value in values {
      guard let parent = value["parent"] as? String, let time = value["time"] as? Double,
            let bpm = value["bpm"] as? Double, let source = value["source"] as? String,
            value["index"] == nil || value["index"] is Int,
            value["seriesCount"] == nil || value["seriesCount"] is Int else { return nil }
      samples.append(TrackingWatchHealthSample(parent: parent, index: value["index"] as? Int,
        seriesCount: value["seriesCount"] as? Int, time: time, bpm: bpm, source: source))
    }
    self.batchID = batchID; self.runID = runID; self.sent = sent; self.samples = samples; self.deleted = deleted
    guard valid(at: now) else { return nil }
  }
  func valid(at now: Double) -> Bool {
    UUID(uuidString: batchID) != nil && UUID(uuidString: runID) != nil && now.isFinite && sent.isFinite &&
      now - sent >= -2 && now - sent <= Self.lifetime &&
      samples.count <= Self.maxItems && deleted.count <= Self.maxItems &&
      (!samples.isEmpty || !deleted.isEmpty) && samples.allSatisfy { $0.valid(at: now) && $0.time <= sent + 2 } &&
      deleted.allSatisfy { UUID(uuidString: $0) != nil }
  }
}

// Bounded, persisted until the phone confirms saving, including across relaunch.
struct TrackingWatchHealthOutbox: Codable {
  static let limit = 256
  private(set) var batches: [TrackingWatchHealthBatch] = []
  mutating func prune(at now: Double) {
    batches.removeAll { !$0.valid(at: now) }; batches = Array(batches.suffix(Self.limit))
  }
  mutating func append(_ batch: TrackingWatchHealthBatch, at now: Double) {
    prune(at: now); guard batch.valid(at: now) else { return }
    batches.append(batch); batches = Array(batches.suffix(Self.limit))
  }
  mutating func acknowledge(_ id: String) { batches.removeAll { $0.batchID == id } }
  mutating func delete(runID: String) { batches.removeAll { $0.runID == runID } }
  func next(runID: String?, at now: Double) -> TrackingWatchHealthBatch? {
    // Current heart must not wait behind historical/deletion background traffic.
    batches.last { batch in
      batch.runID == runID && batch.samples.contains { now - $0.time >= -2 && now - $0.time <= 15 }
    } ?? batches.first
  }
}
