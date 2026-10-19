import Foundation

// Shared with the extension. Only display values, never route or sensor samples.
public struct RunaryLiveState: Codable, Hashable {
  public var phase: String
  public var revision: String
  public var confirmation: String?
  public var snapshotAt: Double
  public var duration: Double
  public var distance: Double
  public var averagePace: Double?
  public var heartRate: Double?
  public var lastHeart: Double?
  public var storageError: Bool
  public var actionError: Bool

  public var running: Bool { phase == "running" && !storageError }
  public var controllable: Bool { ["running", "paused"].contains(phase) && !storageError && !actionError }
  public var staleAt: Double { snapshotAt + 30 }
  public var nextRefresh: Double {
    guard running, heartRate != nil, let lastHeart else { return staleAt }
    return min(staleAt, lastHeart + 15)
  }
  public func heart(at time: Double) -> Double? {
    guard running, let lastHeart, time >= lastHeart - 2, time <= lastHeart + 15,
          time <= staleAt, let heartRate, heartRate.isFinite, heartRate > 0 else { return nil }
    return heartRate
  }
  public var distanceText: String { String(format: "%.2f", locale: Locale(identifier: "en_US_POSIX"), max(0, distance.isFinite ? distance : 0) / 1000) }
  public var paceText: String {
    guard distance >= 20, let pace = averagePace, pace.isFinite, pace > 0, pace < 360_000 else { return "-" }
    let seconds = Int(pace.rounded())
    return String(format: "%d'%02d\"", seconds / 60, seconds % 60)
  }
  public static func timeText(_ duration: Double) -> String {
    let seconds = Int(max(0, min(duration.isFinite ? duration : 0, 35_999_999)))
    return seconds >= 3600 ? String(format: "%d:%02d:%02d", seconds / 3600, seconds / 60 % 60, seconds % 60) : String(format: "%d:%02d", seconds / 60, seconds % 60)
  }
}

enum RunaryLiveAction: String { case pause, resume, askFinish, cancelFinish, finish }

// A new generation rejects stale buttons, including a pause→resume→pause cycle.
// A process restart also creates a new generation, invalidating old requests.
struct RunaryLiveSession {
  private(set) var runID: String?
  private(set) var phase = "idle"
  private(set) var storageError = false
  private(set) var revision = UUID().uuidString
  private(set) var confirmation: String?

  mutating func observe(runID: String?, phase: String, storageError: Bool) {
    guard self.runID != runID || self.phase != phase || self.storageError != storageError else { return }
    self.runID = runID; self.phase = phase; self.storageError = storageError
    invalidate()
  }
  mutating func invalidate() { revision = UUID().uuidString; confirmation = nil }
  mutating func accept(_ action: RunaryLiveAction, runID: String, revision: String, confirmation: String?) -> Bool {
    guard self.runID == runID, self.revision == revision, !storageError else { return false }
    switch action {
    case .pause: return phase == "running" && self.confirmation == nil
    case .resume: return phase == "paused" && self.confirmation == nil
    case .askFinish:
      guard ["running", "paused"].contains(phase), self.confirmation == nil else { return false }
      invalidate(); self.confirmation = UUID().uuidString; return true
    case .cancelFinish:
      guard let confirmation, confirmation == self.confirmation else { return false }
      invalidate(); return true
    case .finish:
      guard ["running", "paused"].contains(phase), let confirmation, confirmation == self.confirmation else { return false }
      invalidate(); return true
    }
  }
}
