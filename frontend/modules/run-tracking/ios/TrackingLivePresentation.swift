import Foundation

// Persisted run identities survive suspension/relaunch. Only a successful,
// explicit app resume clears suppression; ordinary refresh never does.
struct TrackingLivePresentation {
  var knownRun: String?
  var dismissedRun: String?
  private(set) var generation = UUID()

  mutating func missingCard(for id: String) {
    if knownRun == id { dismissedRun = id }
  }

  mutating func dismissed(_ id: String, generation: UUID) {
    guard generation == self.generation else { return }
    dismissedRun = id
  }

  mutating func restore(_ id: String) {
    generation = UUID()
    if knownRun == id { knownRun = nil }
    if dismissedRun == id { dismissedRun = nil }
  }
}
