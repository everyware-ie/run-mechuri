import Foundation

// Internal QA telemetry only. This payload cannot control a run or carry sensor values.
struct TrackingWatchProbe: Codable {
  let id: String
  let sent: Double
  let phase: String
  let state: Int
  let authorization: Int
  let event: String
  init?(_ payload: [String: Any], at now: Double) {
    guard payload["kind"] as? String == "sessionProbe", payload["variant"] as? String == "workout",
          let id = payload["probeID"] as? String, UUID(uuidString: id) != nil,
          let sent = payload["sent"] as? Double, sent.isFinite, now - sent >= -2, now - sent <= 600,
          let phase = payload["phase"] as? String, ["active", "inactive", "background", "unknown"].contains(phase),
          let state = payload["state"] as? Int, (1...6).contains(state),
          let authorization = payload["authorization"] as? Int, (0...2).contains(authorization),
          let event = payload["event"] as? String, ["scene", "start", "state", "end", "permission", "error"].contains(event) else { return nil }
    self.id = id; self.sent = sent; self.phase = phase; self.state = state
    self.authorization = authorization; self.event = event
  }
}

// Shared by the phone module and the generated Watch app. No workout/sensor API.
struct TrackingWatchDisplay {
  private(set) var metrics: [String: Any] = [:]
  private(set) var phonePhase = "unknown"
  private(set) var startPending = false
  private(set) var requestID: String?
  private(set) var notice: String?
  private(set) var startSupported = false
  private var lastSent = -Double.greatestFiniteMagnitude

  @discardableResult mutating func accept(_ payload: [String: Any]) -> Bool {
    guard let sent = payload["sent"] as? Double, sent.isFinite, sent >= lastSent else { return false }
    if payload["kind"] as? String == "noRun" {
      let phase = payload["phase"] as? String ?? "idle"
      guard ["idle", "preparing", "ready", "needsPhone"].contains(phase) else { return false }
      metrics = [:]; phonePhase = phase; startPending = payload["startPending"] as? Bool == true
      requestID = payload["requestID"] as? String
      startSupported = payload["startSupported"] as? Bool == true
      notice = payload["notice"] as? String; lastSent = sent; return true
    }
    guard payload["kind"] as? String == "run", payload["displayOnly"] as? Bool == true,
          let id = payload["id"] as? String, UUID(uuidString: id) != nil,
          let status = payload["status"] as? String,
          ["running", "paused", "interrupted", "saving", "completed"].contains(status) else { return false }
    metrics = payload; phonePhase = status; startPending = payload["startPending"] as? Bool == true
    requestID = payload["requestID"] as? String
    startSupported = payload["startSupported"] as? Bool == true
    notice = payload["notice"] as? String; lastSent = sent; return true
  }
  mutating func clear(id: String) { if metrics["id"] as? String == id { metrics = [:] } }
  func stateFresh(at time: Double) -> Bool {
    let age = time - lastSent
    return phonePhase != "unknown" && age >= -2 && age <= 10
  }
  func fresh(at time: Double) -> Bool { !metrics.isEmpty && stateFresh(at: time) }
  func canStart(at time: Double) -> Bool {
    stateFresh(at: time) && startSupported && metrics.isEmpty && !startPending && ["idle", "ready"].contains(phonePhase)
  }
  func heart(at time: Double) -> Double? {
    guard fresh(at: time), metrics["status"] as? String == "running",
          let measured = metrics["lastHeart"] as? Double, measured.isFinite,
          time - measured >= -2, time - measured <= 15,
          let value = metrics["heartRate"] as? Double, value.isFinite, value > 0 else { return nil }
    return value
  }
  func duration(at time: Double) -> Double {
    let base = metrics["duration"] as? Double ?? 0
    let extra = metrics["status"] as? String == "running" ? max(0, min(time - lastSent, 10)) : 0
    return max(0, base + extra)
  }
}

// A live Watch command can wait briefly for the phone's foreground/GPS gate.
// The same ID becomes the new record ID, so retries cannot recreate a finished run.
struct TrackingWatchRequest: Codable {
  let id: String
  let action: String
  let sent: Double
  init?(message: [String: Any], at time: Double) {
    guard let id = message["id"] as? String, UUID(uuidString: id) != nil,
          let action = message["request"] as? String, ["start", "resume"].contains(action),
          let sent = message["sent"] as? Double, sent.isFinite,
          time - sent >= -2, time - sent <= 10 else { return nil }
    self.id = id; self.action = action; self.sent = sent
  }
  func valid(at time: Double) -> Bool { time - sent >= -2 && time - sent <= 120 }
}

struct TrackingWatchRequests: Codable {
  private var seen: [String: Double] = [:]
  func contains(_ id: String, at time: Double) -> Bool {
    guard let received = seen[id] else { return false }
    return time - received <= 120
  }
  mutating func insert(_ id: String, at time: Double) {
    seen = seen.filter { time - $0.value <= 120 }
    seen[id] = time
  }
}
