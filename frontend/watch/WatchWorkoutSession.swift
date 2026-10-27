import Foundation
import HealthKit
import WatchKit

// The phone owns the record. This session only supplies workout runtime and HR.
final class WatchWorkoutSession: NSObject, ObservableObject, HKWorkoutSessionDelegate {
  @Published private(set) var state = "off"
  @Published private(set) var needsPermission = false
  var changed: (() -> Void)?
  private let health = HKHealthStore()
  private var session: HKWorkoutSession?
  private var runID: String?
  private var blockedID: String?
  private var latest: [String: Any] = [:]
  private var lastSent = -Double.greatestFiniteMagnitude
  private var timer: Timer?
  private var requesting = false
  private var recovering = false
  private var desiredPaused = false
  override init() {
    super.init()
    blockedID = UserDefaults.standard.string(forKey: "RunaryBlockedWorkout")
    timer = Timer.scheduledTimer(withTimeInterval: 3, repeats: true) { [weak self] _ in self?.reconcile() }
  }
  var payload: [String: Any] { ["workoutState": state, "workoutRunID": runID ?? latest["id"] as? String ?? ""] }
  func accept(_ message: [String: Any]) {
    guard let sent = message["sent"] as? Double, sent.isFinite, sent > lastSent else { return }
    lastSent = sent; latest = message; reconcile()
  }
  func requestPermission() {
    guard !requesting else { return }
    requesting = true
    health.requestAuthorization(toShare: [HKObjectType.workoutType()], read: [HKObjectType.quantityType(forIdentifier: .heartRate)!]) { _, _ in
      DispatchQueue.main.async { self.requesting = false; self.reconcile() }
    }
  }
  func retry() {
    blockedID = nil; UserDefaults.standard.removeObject(forKey: "RunaryBlockedWorkout"); reconcile()
  }
  func recover() {
    guard !recovering, session == nil else { return }
    recovering = true
    let savedID = UserDefaults.standard.string(forKey: "RunaryWorkoutRunID")
    health.recoverActiveWorkoutSession { recovered, _ in
      DispatchQueue.main.async {
        self.session = recovered; self.runID = savedID; recovered?.delegate = self
        self.changed?()
        DispatchQueue.main.asyncAfter(deadline: .now() + 5) {
          self.recovering = false
          let fresh = Date().timeIntervalSince1970 - self.lastSent <= 10
          if !fresh || self.latest["id"] as? String != savedID { self.stop() }
          self.reconcile()
        }
      }
    }
  }
  func stopLocally() {
    if let id = latest["id"] as? String { block(id) } else { stop() }
  }
  private func publish(_ value: String) { if state != value { state = value; changed?() } }
  private func stop() {
    let old = session; session = nil; runID = nil
    UserDefaults.standard.removeObject(forKey: "RunaryWorkoutRunID")
    old?.end()
  }
  func reconcile() {
    guard !recovering else { return }
    let age = Date().timeIntervalSince1970 - lastSent
    let id = latest["id"] as? String
    let status = latest["status"] as? String
    guard age >= -2, age <= 120, latest["workoutEnabled"] as? Bool == true,
          let id, ["running", "paused"].contains(status ?? "") else { needsPermission = false; stop(); publish("off"); return }
    guard blockedID != id else { stop(); publish("blocked"); return }
    needsPermission = health.authorizationStatus(for: HKObjectType.workoutType()) != .sharingAuthorized
    guard !needsPermission else { stop(); publish("permission"); return }
    desiredPaused = status == "paused" || age > 30
    if let session, runID == id {
      if desiredPaused && session.state == .running { session.pause() }
      if !desiredPaused && session.state == .paused { session.resume() }
      return
    }
    // Never resurrect a session from stale application context or in the background.
    guard age <= 10, status == "running", WKExtension.shared().applicationState == .active else { publish("waiting"); return }
    stop()
    do {
      let configuration = HKWorkoutConfiguration(); configuration.activityType = .running; configuration.locationType = .outdoor
      let newSession = try HKWorkoutSession(healthStore: health, configuration: configuration)
      UserDefaults.standard.set(id, forKey: "RunaryWorkoutRunID")
      session = newSession; runID = id; newSession.delegate = self
      publish("starting"); newSession.startActivity(with: Date())
    } catch { block(id) }
  }
  private func block(_ id: String) {
    blockedID = id; UserDefaults.standard.set(id, forKey: "RunaryBlockedWorkout")
    stop(); publish("blocked")
  }
  func workoutSession(_ workoutSession: HKWorkoutSession, didChangeTo toState: HKWorkoutSessionState, from fromState: HKWorkoutSessionState, date: Date) {
    DispatchQueue.main.async {
      guard self.session === workoutSession else { return }
      switch toState {
      case .running: self.publish("running"); if self.desiredPaused { workoutSession.pause() }
      case .paused: self.publish("paused")
      case .ended, .stopped: if let id = self.runID { self.block(id) }
      default: break
      }
    }
  }
  func workoutSession(_ workoutSession: HKWorkoutSession, didFailWithError error: Error) {
    DispatchQueue.main.async { if self.session === workoutSession, let id = self.runID { self.block(id) } }
  }
}
