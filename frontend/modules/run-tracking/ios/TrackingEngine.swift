import Foundation

// Sensor readiness and live Watch status must not trust a stale delivery.
enum TrackingSampleRules {
  static func preparedLocation(latitude: Double, longitude: Double, accuracy: Double, time: Double, now: Double) -> Bool {
    latitude.isFinite && longitude.isFinite && abs(latitude) <= 90 && abs(longitude) <= 180 &&
      accuracy.isFinite && accuracy >= 0 && accuracy <= 20 && time.isFinite && now.isFinite &&
      now - time >= -2 && now - time <= 15
  }
  static func watchConnection(state: String, sent: Double, received: Double, previous: Double?) -> String? {
    guard sent.isFinite, received.isFinite, received - sent >= -2, received - sent <= 10,
          sent >= (previous ?? -.greatestFiniteMagnitude) else { return nil }
    switch state {
    case "running", "paused": return "connected"
    case "waiting": return "waiting"
    case "stopped": return "failed"
    default: return nil
    }
  }
}

// FRD: internal-run-tracking §3-1. Pure engine: sample time and receipt time differ.
struct TrackingEvent: Codable {
  var kind: String
  var time: Double
  var latitude: Double?
  var longitude: Double?
  var accuracy: Double?
  var received: Double?
  var background: Bool?
  var value: Double?
  var cadence: Double?
  var intervalStart: Double?
  var sampleID: String?
  var detail: String?
}

struct TrackingPoint: Codable {
  var latitude: Double
  var longitude: Double
  var time: Double
  var segment: Int
}
struct TrackingHeart: Codable {
  var id: String
  var time: Double
  var bpm: Double
  var received: Double
}
struct TrackingInterval: Codable {
  var start: Double
  var end: Double?
}
struct TrackingSummary: Codable {
  var id: String
  var started: Double
  var status: String
  var duration: Double
  var elapsed: Double
  var distance: Double
  var pace: Double?
  var averagePace: Double?
  var heartRate: Double?
  var averageHeartRate: Double?
  var maxHeartRate: Double?
  var steps: Int
  var cadence: Double?
  var averageCadence: Double?
  var lastLocation: Double?
  var lastHeart: Double?
  var lastMotion: Double?
  var lastSaved: Double?
  var segments: Int
  var rawCount: Int
  var acceptedCount: Int
  var rejected: [String: Int]
  var backgroundCount: Int
  var foregroundCount: Int
  var maxSampleGap: Double
  var maxReceiptGap: Double
  var meanAccuracy: Double?
  var incomplete: Bool
  var errors: [String]
  var batteryStart: Double?
  var batteryEnd: Double?
  var charging: Bool
  var watchEnabled: Bool
  var feedback: String?
  var preparedAt: Double?
  var readyAt: Double?
  var lowPower: Bool
  var metricVersion: Int
}

final class TrackingEngine {
  let id: String
  let started: Double
  var status = "running"
  var intervals: [TrackingInterval]
  var points: [TrackingPoint] = []
  var hearts: [TrackingHeart] = []
  var steps = 0
  var motionObservedSeconds = 0.0
  var motionBaseline = 0.0
  var motionLastEnd: Double?
  var currentCadence: Double?
  var lastMotion: Double?
  var lastSaved: Double?
  var ended: Double?
  var distance = 0.0
  var segment = 1
  var rawCount = 0
  var rejected: [String: Int] = [:]
  var backgroundCount = 0
  var foregroundCount = 0
  var accuracyTotal = 0.0
  var maxSampleGap = 0.0
  var maxReceiptGap = 0.0
  var lastReceipt: Double?
  var lastValidLocationTime: Double?
  var watchRecoveryIntervals: [TrackingInterval] = []
  var incomplete = false
  var errors: [String] = []
  var batteryStart: Double?
  var batteryEnd: Double?
  var charging = false
  var watchEnabled = false
  var feedback: String?
  var preparedAt: Double?
  var readyAt: Double?
  var lowPower = false
  private var heartIDs = Set<String>()
  private var breakPending = false

  init(id: String, started: Double) {
    self.id = id; self.started = started
    intervals = [TrackingInterval(start: started)]
  }
  func duration(at time: Double) -> Double {
    intervals.reduce(0) { $0 + max(0, min($1.end ?? time, time) - $1.start) }
  }
  func active(at time: Double) -> Bool {
    intervals.contains { time >= $0.start && time <= ($0.end ?? .greatestFiniteMagnitude) }
  }
  func apply(_ event: TrackingEvent) {
    switch event.kind {
    case "pause", "interrupt", "finish", "saving":
      if status == "running", !intervals.isEmpty { intervals[intervals.count - 1].end = event.time }
      status = event.kind == "pause" ? "paused" : event.kind == "interrupt" ? "interrupted" : event.kind == "saving" ? "saving" : "completed"
      if status == "completed" || status == "saving" { ended = ended ?? event.time }
      currentCadence = nil
    case "resume":
      guard status == "paused" || status == "interrupted" else { return }
      status = "running"; segment += 1; breakPending = false
      lastValidLocationTime = nil; lastReceipt = nil
      intervals.append(TrackingInterval(start: event.time))
      motionBaseline = 0; motionLastEnd = nil; lastMotion = nil; currentCadence = nil
    case "watchRecovery":
      if let start = event.intervalStart, start <= event.time { watchRecoveryIntervals.append(TrackingInterval(start: start, end: event.time)) }
    case "checkpoint": lastSaved = event.time
    case "preparation": preparedAt = event.intervalStart; readyAt = event.value
    case "power": lowPower = lowPower || event.value == 1
    case "battery":
      if batteryStart == nil { batteryStart = event.value }
      if let value = event.value { batteryEnd = value }; charging = charging || event.detail == "charging"
    case "watch": watchEnabled = event.value == 1
    case "feedback": feedback = event.detail
    case "error":
      if let detail = event.detail { errors.append(detail); errors = Array(errors.suffix(50)) }
    case "gap": incomplete = true; breakPending = true
    case "heart": addHeart(event)
    case "motion": addMotion(event)
    case "location": addLocation(event)
    default: break
    }
  }
  private func reject(_ reason: String) { rejected[reason, default: 0] += 1 }
  private func addLocation(_ e: TrackingEvent) {
    rawCount += 1
    if e.background == true { backgroundCount += 1 } else { foregroundCount += 1 }
    guard let lat = e.latitude, let lon = e.longitude, let accuracy = e.accuracy,
          lat.isFinite, lon.isFinite, abs(lat) <= 90, abs(lon) <= 180,
          accuracy.isFinite, accuracy >= 0, accuracy <= 35, e.time.isFinite else { reject("accuracyOrCoordinate"); return }
    guard active(at: e.time), e.time <= (e.received ?? e.time) + 2 else { reject("outsideInterval"); return }
    // Batch delivery is retained; old start-cache and out-of-order points are not.
    if let previousTime = lastValidLocationTime, e.time <= previousTime { reject("outOfOrder"); return }
    let sampleGap = e.time - (lastValidLocationTime ?? e.time)
    maxSampleGap = max(maxSampleGap, sampleGap)
    lastValidLocationTime = e.time
    let receipt = e.received ?? e.time
    if let lastReceipt { maxReceiptGap = max(maxReceiptGap, receipt - lastReceipt) }
    lastReceipt = receipt
    let point = TrackingPoint(latitude: lat, longitude: lon, time: e.time, segment: segment)
    var next = point
    if let previous = points.last, previous.segment == segment, !breakPending {
      let dt = e.time - previous.time
      let d = Self.meters(previous, point)
            if d / max(dt, 0.001) > 12 { reject("jump"); incomplete = true; breakPending = true; return }
      // A long gap alone never proves missing GPS. A displaced 30s+ endpoint is
      // conservatively marked uncertain, not silently bridged or called a stop.
      if sampleGap > 30 && d > max(10, accuracy) {
        incomplete = true; breakPending = true
      } else if d < max(2, min(5, accuracy * 0.15)) {
        reject("stationaryNoise"); return
      } else { distance += d }
    }
    if breakPending { segment += 1; next.segment = segment; breakPending = false }
    points.append(next); accuracyTotal += accuracy
  }
  private func addHeart(_ e: TrackingEvent) {
    guard let value = e.value, value.isFinite, value > 0,
          let sampleID = e.sampleID, !heartIDs.contains(sampleID), e.time.isFinite,
          active(at: e.time) || watchRecoveryIntervals.contains(where: { e.time >= $0.start && e.time <= ($0.end ?? $0.start) }),
          e.time <= (e.received ?? e.time) + 2 else { return }
    heartIDs.insert(sampleID)
    hearts.append(TrackingHeart(id: sampleID, time: e.time, bpm: value, received: e.received ?? e.time))
  }
  private func addMotion(_ e: TrackingEvent) {
    guard status == "running", let count = e.value, count.isFinite,
          let start = e.intervalStart, let interval = intervals.last,
          start >= interval.start - 0.01, e.time >= start,
          e.time <= (e.received ?? e.time) + 2,
          e.time >= (motionLastEnd ?? start), count >= motionBaseline else { return }
    steps += Int(count - motionBaseline)
    motionObservedSeconds += max(0, e.time - (motionLastEnd ?? start))
    motionBaseline = count; motionLastEnd = e.time; lastMotion = e.received ?? e.time
    currentCadence = e.cadence.flatMap { $0.isFinite && $0 >= 0 ? $0 * 60 : nil }
  }
  func summary(at time: Double) -> TrackingSummary {
    let duration = self.duration(at: status == "running" ? time : intervals.last?.end ?? time)
    let recent = points.filter { $0.segment == segment && $0.time >= time - 10 }
    var pace: Double?
    if status == "running", let first = recent.first, let last = recent.last, time - last.time <= 10,
       last.time - first.time >= 5 {
      let d = zip(recent, recent.dropFirst()).reduce(0) { $0 + Self.meters($1.0, $1.1) }
      if d >= 10 { pace = (last.time - first.time) / (d / 1000) }
    }
    let newestHeart = hearts.max { $0.time < $1.time }
    let heart = (status == "running" || (status == "interrupted" && !watchRecoveryIntervals.isEmpty)) && time - (newestHeart?.time ?? 0) <= 15 ? newestHeart?.bpm : nil
    let cadence = status == "running" && time - (lastMotion ?? 0) <= 10 && time - (motionLastEnd ?? 0) <= 10 ? currentCadence : nil
    return TrackingSummary(id: id, started: started, status: status, duration: duration,
      elapsed: max(0, (ended ?? (status == "running" ? time : intervals.last?.end ?? time)) - started), distance: distance, pace: pace,
      averagePace: distance >= 20 ? duration / (distance / 1000) : nil,
      heartRate: heart, averageHeartRate: hearts.isEmpty ? nil : hearts.reduce(0) { $0 + $1.bpm } / Double(hearts.count),
      maxHeartRate: hearts.map(\.bpm).max(), steps: steps, cadence: cadence,
      averageCadence: motionObservedSeconds > 0 ? Double(steps) / (motionObservedSeconds / 60) : nil,
      lastLocation: lastValidLocationTime, lastHeart: newestHeart?.time, lastMotion: lastMotion, lastSaved: lastSaved,
      segments: segment, rawCount: rawCount, acceptedCount: points.count, rejected: rejected,
      backgroundCount: backgroundCount, foregroundCount: foregroundCount, maxSampleGap: maxSampleGap,
      maxReceiptGap: maxReceiptGap, meanAccuracy: points.isEmpty ? nil : accuracyTotal / Double(points.count),
      incomplete: incomplete, errors: errors, batteryStart: batteryStart, batteryEnd: batteryEnd,
      charging: charging, watchEnabled: watchEnabled, feedback: feedback,
      preparedAt: preparedAt, readyAt: readyAt, lowPower: lowPower, metricVersion: 1)
  }
  static func meters(_ a: TrackingPoint, _ b: TrackingPoint) -> Double {
    let rad = Double.pi / 180
    let p1 = a.latitude * rad, p2 = b.latitude * rad
    let h = pow(sin((p2 - p1) / 2), 2) + cos(p1) * cos(p2) * pow(sin((b.longitude - a.longitude) * rad / 2), 2)
    return 6_371_000 * 2 * asin(sqrt(min(1, max(0, h))))
  }
}
