import Foundation

// Headless controller tests only. No Apple service, user permissions, or sensor
// data is accessed. The test script compiles the production controller bodies
// unchanged against these platform doubles. SwiftUI rendering is not covered.
protocol ObservableObject: AnyObject {}
@propertyWrapper struct Published<Value> {
  var wrappedValue: Value
  init(wrappedValue: Value) { self.wrappedValue = wrappedValue }
}
struct Date {
  static var clock = 1_000.0
  var timeIntervalSince1970: Double { Self.clock }
}
final class Timer {
  static func scheduledTimer(withTimeInterval: Double, repeats: Bool, block: @escaping (Timer) -> Void) -> Timer { Timer() }
  func invalidate() {}
}
final class UserDefaults {
  static let standard = UserDefaults()
  var values: [String: Any] = [:]
  func string(forKey key: String) -> String? { values[key] as? String }
  func dictionary(forKey key: String) -> [String: Any]? { values[key] as? [String: Any] }
  func set(_ value: Any?, forKey key: String) { values[key] = value }
  func removeObject(forKey key: String) { values.removeValue(forKey: key) }
}
final class FileManager {
  static let `default` = FileManager()
  static let root = Foundation.FileManager.default.temporaryDirectory.appendingPathComponent("runary-watch-controller-" + UUID().uuidString)
  func urls(for directory: Foundation.FileManager.SearchPathDirectory, in domain: Foundation.FileManager.SearchPathDomainMask) -> [URL] { [Self.root] }
  func createDirectory(at url: URL, withIntermediateDirectories: Bool) throws { try Foundation.FileManager.default.createDirectory(at: url, withIntermediateDirectories: withIntermediateDirectories) }
  func fileExists(atPath path: String) -> Bool { Foundation.FileManager.default.fileExists(atPath: path) }
  func removeItem(at url: URL) throws { try Foundation.FileManager.default.removeItem(at: url) }
}
enum WKApplicationState { case active, inactive, background }
final class WKExtension {
  static let instance = WKExtension()
  static func shared() -> WKExtension { instance }
  var applicationState = WKApplicationState.active
}
enum HKAuthorizationStatus { case notDetermined, sharingDenied, sharingAuthorized }
enum HKQuantityTypeIdentifier { case heartRate }
class HKObjectType: Hashable {
  static func workoutType() -> HKObjectType { HKObjectType() }
  static func quantityType(forIdentifier: HKQuantityTypeIdentifier) -> HKObjectType? { HKObjectType() }
  static func == (lhs: HKObjectType, rhs: HKObjectType) -> Bool { lhs === rhs }
  func hash(into hasher: inout Hasher) { hasher.combine(ObjectIdentifier(self)) }
}
final class HKHealthStore {
  static var authorization = HKAuthorizationStatus.sharingAuthorized
  static var permissionRequests = 0
  static var recovered: HKWorkoutSession?
  func authorizationStatus(for type: HKObjectType) -> HKAuthorizationStatus { Self.authorization }
  func requestAuthorization(toShare: Set<HKObjectType>, read: Set<HKObjectType>, completion: (Bool, Error?) -> Void) {
    Self.permissionRequests += 1; completion(true, nil)
  }
  func recoverActiveWorkoutSession(completion: (HKWorkoutSession?, Error?) -> Void) { completion(Self.recovered, nil) }
}
enum HKWorkoutActivityType { case running }
enum HKWorkoutSessionLocationType { case outdoor }
final class HKWorkoutConfiguration {
  var activityType = HKWorkoutActivityType.running
  var locationType = HKWorkoutSessionLocationType.outdoor
}
enum HKWorkoutSessionState { case notStarted, running, paused, ended, stopped }
protocol HKWorkoutSessionDelegate: AnyObject {
  func workoutSession(_ session: HKWorkoutSession, didChangeTo: HKWorkoutSessionState, from: HKWorkoutSessionState, date: Date)
  func workoutSession(_ session: HKWorkoutSession, didFailWithError: Error)
}
enum WatchTestError: Error { case unavailable }
final class HKWorkoutSession {
  static var created: [HKWorkoutSession] = []
  static var failCreation = false
  weak var delegate: HKWorkoutSessionDelegate?
  private(set) var state = HKWorkoutSessionState.notStarted
  init(healthStore: HKHealthStore, configuration: HKWorkoutConfiguration) throws {
    if Self.failCreation { throw WatchTestError.unavailable }
    Self.created.append(self)
  }
  func transition(_ value: HKWorkoutSessionState) {
    let previous = state; state = value
    delegate?.workoutSession(self, didChangeTo: value, from: previous, date: Date())
  }
  func startActivity(with date: Date) { transition(.running) }
  func pause() { transition(.paused) }
  func resume() { transition(.running) }
  func end() { transition(.ended) }
  func fail() { delegate?.workoutSession(self, didFailWithError: WatchTestError.unavailable) }
}
enum WCSessionActivationState { case notActivated, activated }
protocol WCSessionDelegate: AnyObject {}
final class WCSessionUserInfoTransfer {
  let userInfo: [String: Any]
  private(set) var cancelled = false
  init(_ userInfo: [String: Any]) { self.userInfo = userInfo }
  func cancel() { cancelled = true }
}
final class WCSession {
  static let `default` = WCSession()
  static func isSupported() -> Bool { true }
  weak var delegate: WCSessionDelegate?
  var activationState = WCSessionActivationState.activated
  var receivedApplicationContext: [String: Any] = [:]
  var outstandingUserInfoTransfers: [WCSessionUserInfoTransfer] = []
  var messages: [[String: Any]] = []
  var reply: (([String: Any]) -> [String: Any]?)?
  func activate() {}
  func transferUserInfo(_ payload: [String: Any]) {
    outstandingUserInfoTransfers.append(WCSessionUserInfoTransfer(payload))
  }
  func sendMessage(_ payload: [String: Any], replyHandler: @escaping ([String: Any]) -> Void, errorHandler: @escaping (Error) -> Void) {
    messages.append(payload)
    if let result = reply?(payload) { replyHandler(result) } else { errorHandler(WatchTestError.unavailable) }
  }
}
final class WatchHealthReader {
  var deliver: ((String, [TrackingWatchHealthSample], [String]) -> Void)?
  func refreshPermission() {}
  func requestPermission() {}
  func sync(_ display: TrackingWatchDisplay, at now: Double) {}
  func remove(runID: String) {}
}
