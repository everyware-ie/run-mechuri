import Foundation

@main
struct WatchExceptionChecks {
  static var checks = 0
  static var failures = 0
  static func check(_ value: @autoclosure () -> Bool, _ message: String) {
    checks += 1
    if !value() { failures += 1; print("FAIL: " + message) }
  }
  static func drain() { Foundation.RunLoop.main.run(until: Foundation.Date().addingTimeInterval(0.02)) }
  static func reset() {
    drain(); UserDefaults.standard.values = [:]
    HKWorkoutSession.created = []; HKWorkoutSession.failCreation = false
    HKHealthStore.authorization = .sharingAuthorized; HKHealthStore.permissionRequests = 0
    WKExtension.shared().applicationState = .active; Date.clock = 1_000
    WCSession.default.receivedApplicationContext = [:]; WCSession.default.messages = []
    WCSession.default.outstandingUserInfoTransfers = []; WCSession.default.reply = nil
  }
  static func run(_ id: String, sent: Double = Date.clock, status: String = "running", enabled: Bool = true) -> [String: Any] {
    ["kind": "run", "displayOnly": true, "workoutEnabled": enabled,
     "id": id, "sent": sent, "status": status, "duration": 20.0, "distance": 50.0]
  }
  static func main() {
    defer { try? Foundation.FileManager.default.removeItem(at: FileManager.root) }
    let id = UUID().uuidString
    reset()
    let denied = WatchWorkoutSession(); HKHealthStore.authorization = .sharingDenied
    denied.accept(run(id)); drain()
    check(denied.state == "permission" && denied.needsPermission, "Denied workout permission is explicit and creates no session")
    for _ in 0..<3 { denied.reconcile() }
    check(HKWorkoutSession.created.isEmpty && HKHealthStore.permissionRequests == 0, "State polling never repeats an OS permission request")
    denied.requestPermission(); drain()
    check(HKHealthStore.permissionRequests == 1 && denied.state == "permission", "An answered but denied request is not treated as granted")
    HKHealthStore.authorization = .sharingAuthorized; denied.reconcile(); drain()
    check(denied.state == "running" && HKWorkoutSession.created.count == 1, "Granted permission resumes the same desired run")

    reset()
    let connection = WatchWorkoutSession(); connection.accept(run(id)); drain()
    Date.clock += 31; connection.reconcile(); drain()
    check(connection.state == "paused" && HKWorkoutSession.created.count == 1, "31 seconds without phone state pauses the existing session")
    connection.accept(run(id)); drain()
    check(connection.state == "running" && HKWorkoutSession.created.count == 1, "Reconnection resumes that session without duplicating it")
    Date.clock += 121; connection.reconcile(); drain()
    check(connection.state == "off" && HKWorkoutSession.created.first?.state == .ended, "More than two minutes without phone state ends the Watch session")
    WKExtension.shared().applicationState = .background
    connection.accept(run(id)); drain()
    check(connection.state == "waiting" && HKWorkoutSession.created.count == 1, "A cached background update cannot silently recreate the timed-out session")
    connection.accept(run(id), launchedRunID: id); drain()
    check(connection.state == "running" && HKWorkoutSession.created.count == 2, "An explicit fresh handoff restores the timed-out run exactly once")

    reset()
    let conflict = WatchWorkoutSession(); conflict.accept(run(id)); drain()
    let first = HKWorkoutSession.created[0]; first.transition(.ended); drain()
    check(conflict.state == "blocked", "An externally ended session is blocked for that record")
    Date.clock += 1; conflict.accept(run(id)); drain()
    check(conflict.state == "blocked" && HKWorkoutSession.created.count == 1, "Fresh phone state cannot restart a conflicted workout")
    conflict.retry(); drain()
    check(conflict.state == "running" && HKWorkoutSession.created.count == 2, "Only explicit retry starts the blocked workout again")
    first.fail(); first.transition(.paused); drain()
    check(conflict.state == "running", "Late callbacks from the replaced session cannot change the new session")
    Date.clock += 1; conflict.accept(run(id, enabled: false)); drain()
    check(conflict.state == "off" && HKWorkoutSession.created.last?.state == .ended, "Opt-out stops runtime without altering the phone record")

    reset()
    HKWorkoutSession.failCreation = true
    let failure = WatchWorkoutSession(); failure.accept(run(id)); drain()
    check(failure.state == "blocked", "A platform start error is displayed as interrupted instead of running")
    for _ in 0..<3 { failure.reconcile() }
    check(HKWorkoutSession.created.isEmpty, "A platform failure does not enter an automatic start loop")

    reset()
    WKExtension.shared().applicationState = .background
    let handoff = WatchWorkoutSession(); handoff.accept(run(id), launchedRunID: id); drain()
    check(handoff.state == "running", "An explicit fresh handoff can start in the background")
    Date.clock += 1; handoff.accept(run(id, status: "completed")); drain()
    check(handoff.state == "off", "Completed state stops the explicitly launched session")

    reset()
    let model = WatchRun()
    model.session(WCSession.default, didReceiveApplicationContext: run(id)); drain()
    Date.clock += 2
    model.request("finish", expectedRunID: id); drain()
    let firstStop = UserDefaults.standard.dictionary(forKey: "RunaryPendingStop")!
    check(model.workout.state == "blocked" && model.stopping, "Offline stop ends the Watch workout immediately and exposes its pending state")
    Date.clock += 7
    model.request("finish", expectedRunID: id); drain()
    let repeatedStop = UserDefaults.standard.dictionary(forKey: "RunaryPendingStop")!
    check(repeatedStop["sent"] as? Double == firstStop["sent"] as? Double, "Repeated offline finish preserves the first stop timestamp")
    model.session(WCSession.default, didReceiveApplicationContext: run(id)); drain()
    check(model.error == "종료 요청 전달 중", "Phone snapshots cannot erase the pending stop explanation")
    let before = WCSession.default.messages.count
    model.request("resume"); drain()
    check(!WCSession.default.messages.dropFirst(before).contains { $0["request"] as? String == "resume" }, "A pending stop cannot send a contradictory resume")
    let other = UUID().uuidString
    model.session(WCSession.default, didReceiveApplicationContext: run(other)); drain()
    model.request("finish", expectedRunID: other); drain()
    check(UserDefaults.standard.dictionary(forKey: "RunaryPendingStop")?["id"] as? String == id, "A replacement run cannot overwrite the previous pending stop")
    model.session(WCSession.default, didReceiveUserInfo: ["kind": "stopAck", "id": other]); drain()
    check(UserDefaults.standard.dictionary(forKey: "RunaryPendingStop") != nil, "An unrelated acknowledgment cannot clear a pending stop")
    model.session(WCSession.default, didReceiveUserInfo: ["kind": "stopAck", "id": id]); drain()
    check(UserDefaults.standard.dictionary(forKey: "RunaryPendingStop") == nil && !model.stopping, "The matching acknowledgment clears the persisted pending stop")

    reset()
    let original = WatchRun()
    original.session(WCSession.default, didReceiveApplicationContext: run(id)); drain()
    original.request("finish", expectedRunID: id); drain()
    let savedTime = UserDefaults.standard.dictionary(forKey: "RunaryPendingStop")?["sent"] as? Double
    let restored = WatchRun()
    check(restored.stopping, "App initialization restores an unacknowledged stop instead of offering another start")
    Date.clock += 1
    restored.session(WCSession.default, didReceiveApplicationContext: run(id)); drain()
    check(restored.workout.state == "blocked", "A restored pending stop never resumes that workout from cached phone state")
    WCSession.default.messages = []
    WCSession.default.reply = { message in
      message["kind"] as? String == "stopRequest" ? ["accepted": true] : nil
    }
    restored.sessionReachabilityDidChange(WCSession.default); drain()
    let resent = WCSession.default.messages.filter { $0["kind"] as? String == "stopRequest" }
    check(resent.count == 1 && resent.first?["sent"] as? Double == savedTime, "Reachability recovery retries the original stop with its original time")
    check(!restored.stopping && UserDefaults.standard.dictionary(forKey: "RunaryPendingStop") == nil, "A successful retry confirms the pending stop without creating another record")

    reset()
    HKHealthStore.authorization = .sharingDenied
    let permissionModel = WatchRun()
    permissionModel.session(WCSession.default, didReceiveApplicationContext: run(id)); drain()
    check(permissionModel.workout.state == "permission" && permissionModel.display.canControl(runID: id), "Denied workout permission preserves the phone run's control eligibility")
    permissionModel.request("finish", expectedRunID: id); drain()
    check(permissionModel.stopping && UserDefaults.standard.dictionary(forKey: "RunaryPendingStop")?["id"] as? String == id, "The same run can still be finished while workout permission is denied")

    reset()
    let blockedModel = WatchRun()
    blockedModel.session(WCSession.default, didReceiveApplicationContext: run(id)); drain()
    HKWorkoutSession.created[0].transition(.ended); drain()
    check(blockedModel.workout.state == "blocked" && blockedModel.display.canControl(runID: id), "An interrupted workout preserves the phone run's control eligibility")
    blockedModel.request("finish", expectedRunID: id); drain()
    check(blockedModel.stopping && UserDefaults.standard.dictionary(forKey: "RunaryPendingStop")?["id"] as? String == id, "The same run can still be finished after workout interruption")
    print("Watch exception controller checks: \(checks - failures)/\(checks) passed (platform doubles, no sensors)")
    if failures > 0 { exit(1) }
  }
}
