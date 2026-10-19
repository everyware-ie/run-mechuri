import ActivityKit
import UIKit

// Called on the same main queue as TrackingManager. One worker serializes
// ActivityKit writes, so a delayed update cannot recreate a completed run.
final class TrackingLiveActivity {
  private var worker: Task<Void, Never>?
  private var queued: (id: String?, state: RunaryLiveState?)?
  private var monitored: [String: Task<Void, Never>] = [:]
  private var lastPublished: Double = 0
  private var lastRevision: String?
  private var attemptedRun: String?
  private var dismissedRun: String? = UserDefaults.standard.string(forKey: "RunaryDismissedLiveRun")
  private var knownRun: String? = UserDefaults.standard.string(forKey: "RunaryKnownLiveRun")
  private(set) var availability = "off"

  func active(runID: String) -> Bool {
    Activity<RunaryLiveAttributes>.activities.contains {
      $0.attributes.runID == runID && ($0.activityState == .active || $0.activityState == .stale)
    }
  }
  func due(revision: String?, force: Bool = false) -> Bool {
    if !force && revision == nil && lastRevision == nil && availability == "off" && lastPublished > 0 { return false }
    return force || lastRevision != revision || Date().timeIntervalSince1970 - lastPublished >= 5
  }
  func publish(id: String?, state: RunaryLiveState?, force: Bool = false) {
    let time = Date().timeIntervalSince1970
    guard due(revision: state?.revision, force: force) else { return }
    lastPublished = time; lastRevision = state?.revision
    queued = (id, state)
    guard worker == nil else { return }
    worker = Task { @MainActor [weak self] in
      guard let self else { return }
      while let next = self.queued {
        self.queued = nil
        await self.apply(id: next.id, state: next.state)
      }
      self.worker = nil
    }
  }
  func foreground() {
    // The process may have been suspended when the user swiped the card away.
    // Absence of a previously created card must not trigger recreation.
    if let knownRun, !active(runID: knownRun) { suppress(knownRun) }
    attemptedRun = nil
  }
  func waitForUpdates() async { if let worker { await worker.value } }

  @MainActor private func apply(id: String?, state: RunaryLiveState?) async {
    var matching: Activity<RunaryLiveAttributes>?
    for activity in Activity<RunaryLiveAttributes>.activities {
      if activity.attributes.runID == id && matching == nil && activity.activityState != .ended && activity.activityState != .dismissed {
        matching = activity
      } else { await activity.end(nil, dismissalPolicy: .immediate) }
    }
    guard queued == nil else { return }
    guard let id, let state else { availability = "off"; return }
    if let knownRun, knownRun == id, matching == nil { suppress(id) }
    guard ActivityAuthorizationInfo().areActivitiesEnabled else { availability = "disabled"; return }
    let content = ActivityContent(state: state, staleDate: state.running ? Date(timeIntervalSince1970: state.nextRefresh) : nil)
    if let matching {
      remember(id)
      observe(matching)
      await matching.update(content)
      availability = "active"
      return
    }
    guard dismissedRun != id else { availability = "dismissed"; return }
    guard UIApplication.shared.applicationState == .active else { availability = "waiting"; return }
    guard attemptedRun != id else { return }
    attemptedRun = id
    do {
      let activity = try Activity.request(attributes: RunaryLiveAttributes(runID: id), content: content, pushType: nil)
      remember(id)
      observe(activity); availability = "active"
    } catch { availability = "unavailable" }
  }
  private func observe(_ activity: Activity<RunaryLiveAttributes>) {
    guard monitored[activity.id] == nil else { return }
    monitored[activity.id] = Task { @MainActor [weak self] in
      for await state in activity.activityStateUpdates {
        guard let self else { return }
        if state == .dismissed {
          self.suppress(activity.attributes.runID)
          self.availability = "dismissed"
        }
        if state == .ended || state == .dismissed { break }
      }
      self?.monitored.removeValue(forKey: activity.id)
    }
  }
  private func remember(_ id: String) {
    knownRun = id
    UserDefaults.standard.set(id, forKey: "RunaryKnownLiveRun")
  }
  private func suppress(_ id: String) {
    dismissedRun = id
    UserDefaults.standard.set(id, forKey: "RunaryDismissedLiveRun")
  }
}

// Exported to the host target's App Intent. The extension never loads Expo,
// raw records, location managers or a second measurement engine.
public enum RunaryLiveControl {
  @MainActor public static func perform(action: String, runID: String, revision: String, confirmation: String?) async throws {
    let manager = TrackingManager.shared
    do {
      try manager.performLiveAction(action, runID: runID, revision: revision, confirmation: confirmation)
      await manager.waitForLiveUpdates()
    } catch {
      await manager.waitForLiveUpdates()
      throw error
    }
  }
}
