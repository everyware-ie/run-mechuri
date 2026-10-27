import SwiftUI
import WatchConnectivity
import WatchKit
import HealthKit

@main
struct RunaryWatchApp: App {
  @WKApplicationDelegateAdaptor(WatchAppDelegate.self) private var delegate
  var body: some Scene { WindowGroup { WatchRunView(model: WatchRun.shared) } }
}

final class WatchAppDelegate: NSObject, WKApplicationDelegate {
  func handleActiveWorkoutRecovery() {
    DispatchQueue.main.async { WatchRun.shared.workout.recover(); WatchRun.shared.refreshFromPhone(force: true) }
  }
  func handle(_ workoutConfiguration: HKWorkoutConfiguration) {
    // The latest phone state and explicit opt-in decide whether to start a workout.
    DispatchQueue.main.async {
      WatchRun.shared.launchHandled = true
      WatchRun.shared.healthReader.refreshPermission()
      WatchRun.shared.refreshFromPhone(force: true)
    }
  }
}

// Phone GPS controls, optional Watch workout runtime, and stored HealthKit heart relay.
final class WatchRun: NSObject, ObservableObject, WCSessionDelegate {
  static let shared = WatchRun()
  @Published var display = TrackingWatchDisplay()
  @Published var error: String?
  @Published var pending = false
  @Published private(set) var healthRelayNotice: String?
  let healthReader = WatchHealthReader()
  let workout = WatchWorkoutSession()
  private var healthOutbox = TrackingWatchHealthOutbox()
  private var healthOutboxDirty = true
  private var healthSendToken: UUID?
  private var lastHealthAttempt = -Double.greatestFiniteMagnitude
  var launchHandled = false
  private var handshake: [String: Any] {
    ["appBuild": Bundle.main.object(forInfoDictionaryKey: "CFBundleVersion") as? String ?? "?",
     "launchHandled": launchHandled, "syncVersion": 4].merging(workout.payload) { _, new in new }
  }
  private var stopSendToken: UUID?
  private var pendingStop: [String: Any]? = UserDefaults.standard.dictionary(forKey: "RunaryPendingStop")
  private var active = false
  private var timer: Timer?
  private var refreshToken: UUID?
  private var commandToken: UUID?
  private var lastAttempt = -Double.greatestFiniteMagnitude
  private var deleted = Set<String>()
  var metrics: [String: Any] { display.metrics }
  private var root: URL {
    FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0].appendingPathComponent("InternalHearts", isDirectory: true)
  }
  override init() {
    super.init()
    deleted = Set((try? JSONDecoder().decode([String].self, from: Data(contentsOf: root.appendingPathComponent("deleted.json")))) ?? [])
    healthOutbox = (try? JSONDecoder().decode(TrackingWatchHealthOutbox.self, from: Data(contentsOf: root.appendingPathComponent("health-relay.json")))) ?? TrackingWatchHealthOutbox()
    for id in deleted { healthOutbox.delete(runID: id) }
    workout.changed = { [weak self] in guard let self else { return }; self.setActive(self.active) }
    healthReader.deliver = { [weak self] id, samples, deleted in self?.enqueueHealth(id: id, samples: samples, deleted: deleted) }
    if WCSession.isSupported() { WCSession.default.delegate = self; WCSession.default.activate() }
  }
  @discardableResult private func accept(_ payload: [String: Any]) -> Bool {
    if payload["kind"] as? String == "stopAck", payload["id"] as? String == pendingStop?["id"] as? String {
      pendingStop = nil; UserDefaults.standard.removeObject(forKey: "RunaryPendingStop"); error = nil; return true
    }
    if payload["kind"] as? String == "healthAck", payload["accepted"] as? Bool == true,
       let batchID = payload["batchID"] as? String, UUID(uuidString: batchID) != nil {
      acknowledgeHealth(batchID); return true
    }
    if payload["kind"] as? String == "delete", let ids = payload["ids"] as? [String] {
      for id in ids where UUID(uuidString: id) != nil {
        deleted.insert(id); display.clear(id: id)
        healthReader.remove(runID: id); healthOutbox.delete(runID: id); healthOutboxDirty = true
        _ = persistHealthOutbox(); cancelHealthTransfers(runID: id)
        do {
          try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
          try JSONEncoder().encode(Array(deleted)).write(to: root.appendingPathComponent("deleted.json"), options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
          let url = root.appendingPathComponent(id + ".json")
          if FileManager.default.fileExists(atPath: url.path) { try FileManager.default.removeItem(at: url) }
        } catch { self.error = "워치 기록 삭제를 완료하지 못했어요." }
      }
      return true
    }
    if let id = payload["id"] as? String, deleted.contains(id) { return false }
    guard display.accept(payload) else { return false }
    workout.accept(payload)
    healthReader.sync(display, at: Date().timeIntervalSince1970)
    error = nil
    return true
  }
  func setActive(_ value: Bool) {
    active = value
    timer?.invalidate(); timer = nil
    workout.reconcile()
    guard active || ["running", "paused", "starting"].contains(workout.state) else { return }
    healthReader.refreshPermission(); flushHealthOutbox(); flushStop()
    refreshFromPhone(force: true)
    timer = Timer.scheduledTimer(withTimeInterval: 3, repeats: true) { [weak self] _ in
      self?.refreshFromPhone(); self?.flushHealthOutbox(); self?.flushStop()
    }
  }
  func refreshFromPhone(force: Bool = false) {
    guard WCSession.default.activationState == .activated else { return }
    _ = accept(WCSession.default.receivedApplicationContext)
    let now = Date().timeIntervalSince1970
    guard refreshToken == nil, force || now - lastAttempt >= 3 else { return }
    let token = UUID(); refreshToken = token; lastAttempt = now
    // A Watch message can wake the phone in the background. Do not silently
    // skip the request based on a cached reachability check; handle its result.
    var message = handshake; message["kind"] = "displayReady"; message["sent"] = now
    WCSession.default.sendMessage(message, replyHandler: { [weak self] payload in
      DispatchQueue.main.async {
        guard let self, self.refreshToken == token else { return }
        self.refreshToken = nil; _ = self.accept(payload)
      }
    }, errorHandler: { [weak self] _ in
      DispatchQueue.main.async { if self?.refreshToken == token { self?.refreshToken = nil } }
    })
    DispatchQueue.main.asyncAfter(deadline: .now() + 8) { [weak self] in
      if self?.refreshToken == token { self?.refreshToken = nil }
    }
  }
  func request(_ command: String) {
    if command == "finish", let id = metrics["id"] as? String {
      pendingStop = ["kind": "stopRequest", "id": id, "sent": Date().timeIntervalSince1970]
      UserDefaults.standard.set(pendingStop, forKey: "RunaryPendingStop")
      workout.stopLocally(); error = "종료 요청 전달 중"; flushStop(); return
    }
    guard !pending, pendingStop == nil, WCSession.default.activationState == .activated else { return }
    let now = Date().timeIntervalSince1970
    let id: String
    if command == "start" {
      guard display.canStart(at: now) else { refreshFromPhone(force: true); return }
      id = UUID().uuidString
    } else if command == "cancelStart", let requestID = display.requestID { id = requestID }
    else {
      guard display.fresh(at: now), !display.startPending, let runID = metrics["id"] as? String else { return }
      id = runID
    }
    let token = UUID(); commandToken = token; pending = true; error = nil
    if command == "start" || command == "resume" { healthReader.requestPermission() }
    WCSession.default.sendMessage(["id": id, "request": command, "sent": now], replyHandler: { [weak self] reply in
      DispatchQueue.main.async {
        guard let self, self.commandToken == token else { return }
        self.commandToken = nil; self.pending = false
        if let snapshot = reply["snapshot"] as? [String: Any] { _ = self.accept(snapshot) }
        if reply["accepted"] as? Bool != true, self.metrics.isEmpty || self.metrics["id"] as? String == id {
          self.error = reply["error"] as? String ?? "아이폰에서 요청을 확인하지 못했어요."
        }
        self.refreshFromPhone(force: true)
      }
    }, errorHandler: { [weak self] _ in
      DispatchQueue.main.async {
        guard let self, self.commandToken == token else { return }
        self.commandToken = nil; self.pending = false; self.error = "아이폰 연결을 자동으로 확인하고 있어요."
        self.refreshFromPhone(force: true)
      }
    })
    DispatchQueue.main.asyncAfter(deadline: .now() + 8) { [weak self] in
      guard let self, self.commandToken == token else { return }
      self.commandToken = nil; self.pending = false; self.refreshFromPhone(force: true)
    }
  }
  private func flushStop() {
    guard let stop = pendingStop, WCSession.default.activationState == .activated else { return }
    let queued = WCSession.default.outstandingUserInfoTransfers.contains { $0.userInfo["kind"] as? String == "stopRequest" && $0.userInfo["id"] as? String == stop["id"] as? String }
    if !queued { WCSession.default.transferUserInfo(stop) }
    guard stopSendToken == nil else { return }
    let token = UUID(); stopSendToken = token
    WCSession.default.sendMessage(stop, replyHandler: { [weak self] reply in
      DispatchQueue.main.async {
        guard let self, self.stopSendToken == token else { return }
        self.stopSendToken = nil
        if reply["accepted"] as? Bool == true {
          _ = self.accept(["kind": "stopAck", "id": stop["id"] ?? ""])
          if let snapshot = reply["snapshot"] as? [String: Any] { _ = self.accept(snapshot) }
        }
      }
    }, errorHandler: { [weak self] _ in DispatchQueue.main.async { if self?.stopSendToken == token { self?.stopSendToken = nil } } })
    DispatchQueue.main.asyncAfter(deadline: .now() + 8) { [weak self] in if self?.stopSendToken == token { self?.stopSendToken = nil } }

  }
  func session(_ session: WCSession, activationDidCompleteWith activationState: WCSessionActivationState, error: Error?) {
    DispatchQueue.main.async { [weak self] in
      self?.healthReader.refreshPermission(); self?.refreshFromPhone(force: true); self?.flushHealthOutbox(); self?.flushStop()
    }
  }
  func sessionReachabilityDidChange(_ session: WCSession) {
    DispatchQueue.main.async { [weak self] in self?.refreshFromPhone(force: true); self?.flushHealthOutbox() }
  }
  func session(_ session: WCSession, didReceiveUserInfo userInfo: [String: Any]) {
    DispatchQueue.main.async { [weak self] in _ = self?.accept(userInfo) }
  }
  func session(_ session: WCSession, didReceiveApplicationContext applicationContext: [String: Any]) {
    DispatchQueue.main.async { [weak self] in _ = self?.accept(applicationContext) }
  }
  func session(_ session: WCSession, didReceiveMessage message: [String: Any], replyHandler: @escaping ([String: Any]) -> Void) {
    DispatchQueue.main.async { [weak self] in
      let accepted = self?.accept(message) == true
      var reply = self?.handshake ?? [:]
      reply["kind"] = "displayAck"; reply["id"] = message["id"] as? String ?? ""
      reply["sent"] = Date().timeIntervalSince1970; reply["accepted"] = accepted
      replyHandler(reply)
    }
  }
  func session(_ session: WCSession, didReceiveMessage message: [String: Any]) {
    DispatchQueue.main.async { [weak self] in _ = self?.accept(message) }
  }
  private func enqueueHealth(id: String, samples: [TrackingWatchHealthSample], deleted removed: [String]) {
    guard !deleted.contains(id) else { return }
    let now = Date().timeIntervalSince1970
    if healthOutbox.batches.count >= TrackingWatchHealthOutbox.limit { healthRelayNotice = "연결이 오래 끊겨 일부 심박의 전달 대기가 만료됐어요." }
    healthOutbox.append(TrackingWatchHealthBatch(runID: id, sent: now, samples: samples, deleted: removed), at: now)
    healthOutboxDirty = true
    if persistHealthOutbox() { flushHealthOutbox() }
  }
  @discardableResult private func persistHealthOutbox() -> Bool {
    guard healthOutboxDirty else { return true }
    do {
      try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
      var url = root; var values = URLResourceValues(); values.isExcludedFromBackup = true; try url.setResourceValues(values)
      try JSONEncoder().encode(healthOutbox).write(to: root.appendingPathComponent("health-relay.json"), options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
      healthOutboxDirty = false
      if healthRelayNotice == "심박 전달 대기를 저장하지 못했어요." { healthRelayNotice = nil }
      return true
    } catch { healthRelayNotice = "심박 전달 대기를 저장하지 못했어요."; return false }
  }
  private func cancelHealthTransfers(runID: String? = nil, batchID: String? = nil) {
    for transfer in WCSession.default.outstandingUserInfoTransfers where transfer.userInfo["kind"] as? String == "healthBatch" {
      if (runID != nil && transfer.userInfo["id"] as? String == runID) ||
         (batchID != nil && transfer.userInfo["batchID"] as? String == batchID) { transfer.cancel() }
    }
  }
  private func acknowledgeHealth(_ id: String) {
    healthOutbox.acknowledge(id); healthOutboxDirty = true; _ = persistHealthOutbox(); cancelHealthTransfers(batchID: id)
  }
  private func flushHealthOutbox() {
    let session = WCSession.default
    guard session.activationState == .activated else { return }
    let now = Date().timeIntervalSince1970
    let count = healthOutbox.batches.count; healthOutbox.prune(at: now)
    if count != healthOutbox.batches.count { healthOutboxDirty = true }
    guard persistHealthOutbox() else { return }
    let ids = Set(healthOutbox.batches.map { $0.batchID })
    for transfer in session.outstandingUserInfoTransfers where transfer.userInfo["kind"] as? String == "healthBatch" {
      if let id = transfer.userInfo["batchID"] as? String, !ids.contains(id) { transfer.cancel() }
    }
    let queued = Set(session.outstandingUserInfoTransfers.compactMap { $0.userInfo["kind"] as? String == "healthBatch" ? $0.userInfo["batchID"] as? String : nil })
    for batch in healthOutbox.batches where !queued.contains(batch.batchID) { session.transferUserInfo(batch.payload) }
    guard healthSendToken == nil, now - lastHealthAttempt >= 3,
          let batch = healthOutbox.next(runID: metrics["id"] as? String, at: now) else { return }
    let token = UUID(); healthSendToken = token; lastHealthAttempt = now
    session.sendMessage(batch.payload, replyHandler: { [weak self] reply in
      DispatchQueue.main.async {
        guard let self, self.healthSendToken == token else { return }
        self.healthSendToken = nil
        if reply["accepted"] as? Bool == true, reply["batchID"] as? String == batch.batchID {
          self.acknowledgeHealth(batch.batchID)
          if let snapshot = reply["snapshot"] as? [String: Any] { _ = self.accept(snapshot) }
        }
      }
    }, errorHandler: { [weak self] _ in
      DispatchQueue.main.async { if self?.healthSendToken == token { self?.healthSendToken = nil } }
    })
    DispatchQueue.main.asyncAfter(deadline: .now() + 8) { [weak self] in
      if self?.healthSendToken == token { self?.healthSendToken = nil }
    }
  }
}

struct WatchRunView: View {
  @ObservedObject var model: WatchRun
  @ObservedObject private var workout = WatchRun.shared.workout
  @ObservedObject private var healthReader = WatchRun.shared.healthReader
  @Environment(\.scenePhase) private var scenePhase
  @State private var confirmFinish = false
  var body: some View {
    TimelineView(.periodic(from: .now, by: 1)) { context in
      let now = context.date.timeIntervalSince1970
      let fresh = model.display.fresh(at: now)
      let running = model.metrics["status"] as? String == "running"
      ScrollView {
        Text("Runary").font(.headline).foregroundStyle(Color.orange)
        if workout.needsPermission {
          Button("워치 운동 연결") { workout.requestPermission() }
        }
        if workout.state == "blocked" {
          Text("워치 측정이 중단됐어요. 아이폰 기록은 계속돼요.").font(.caption2)
          Button("워치 측정 다시 시작") { workout.retry() }
        }
        if model.metrics["id"] != nil {
          let heart = model.display.heart(at: now)
          Text(String(format: "%.2f", (model.metrics["distance"] as? Double ?? 0) / 1000))
            .font(.system(size: 46, weight: .bold)).monospacedDigit()
          Text("km").font(.caption).foregroundStyle(.secondary)
          HStack(alignment: .top, spacing: 8) {
            metric("시간", duration(context.date))
            metric("평균 페이스", pace(model.metrics["averagePace"] as? Double))
            metric("♥ bpm", heart.map { String(Int($0.rounded())) } ?? "-")
          }
          Text(runMessage).font(.caption2).foregroundStyle(.secondary)
          if healthReader.needsPermission {
            Button("건강 심박 연결") { healthReader.requestPermission() }.disabled(healthReader.requesting)
          }
          if running { Text(healthReader.message).font(.caption2).foregroundStyle(.secondary) }
          if !fresh { Text("아이폰 상태를 자동으로 확인하고 있어요.").font(.caption2).foregroundStyle(.orange) }
          else if running && heart == nil {
            Text(model.metrics["lastHeart"] == nil ? "건강 앱에 새 심박이 저장되면 표시해요." : "심박 동기화가 늦어지고 있어요.")
              .font(.caption2).foregroundStyle(.secondary)
          }
          if ["running", "paused", "interrupted"].contains(model.metrics["status"] as? String ?? ""), !model.display.startPending {
            HStack {
              Button { model.request(running ? "pause" : "resume") } label: { Image(systemName: running ? "pause.fill" : "play.fill").frame(minWidth: 44, minHeight: 44) }
                .tint(.orange).accessibilityLabel(running ? "일시정지" : "재개").disabled(model.pending || !fresh)
              Button { confirmFinish = true } label: { Image(systemName: "stop.fill").frame(minWidth: 44, minHeight: 44) }
                .accessibilityLabel("종료").disabled(model.pending)
            }
          }
          let cadence = fresh && running && now - (model.metrics["lastMotion"] as? Double ?? 0) <= 10 ? model.metrics["cadence"] as? Double : nil
          Text("케이던스 \(cadence.map { String(Int($0.rounded())) } ?? "-") spm").font(.caption)
        } else if model.display.startPending {
          Text(model.display.phonePhase == "needsPhone" ? "아이폰 Runary를 열어 시작을 확인해 주세요." : "아이폰에서 시작을 확인하고 있어요.").font(.caption)
          ProgressView()
        } else if model.display.canStart(at: now) {
          Text("러닝을 시작해 볼까요?").font(.caption)
          Button("러닝 시작") { model.request("start") }.disabled(model.pending)
          Text("아이폰 GPS로 측정해요.").font(.caption2).foregroundStyle(.secondary)
        } else if model.display.stateFresh(at: now) && !model.display.startSupported {
          Text("워치에서 시작하려면 아이폰 Runary를 업데이트해 주세요.").font(.caption)
        } else if model.display.stateFresh(at: now) && model.display.phonePhase == "preparing" {
          Text("아이폰 GPS를 준비하고 있어요.").font(.caption)
          ProgressView()
        } else {
          Text("아이폰 상태를 자동으로 확인하고 있어요.").font(.caption)
          ProgressView()
        }
        if model.display.startPending {
          if model.metrics["id"] != nil { Text(model.metrics["requestPhase"] as? String == "needsPhone" ? "아이폰 Runary를 열면 재개해요." : "아이폰 GPS 준비 후 재개해요.").font(.caption) }
          Button("요청 취소") { model.request("cancelStart") }.disabled(model.pending)
        }
        if let notice = model.display.notice { Text(notice).font(.caption2).foregroundStyle(.orange) }
        if let error = model.error { Text(error).font(.caption2).foregroundStyle(.orange) }
        if let notice = model.healthRelayNotice { Text(notice).font(.caption2).foregroundStyle(.orange) }
      }
    }
    .onAppear { model.setActive(scenePhase == .active) }
    .onChange(of: scenePhase) { _, phase in model.setActive(phase == .active) }
    .onDisappear { model.setActive(false) }
    .confirmationDialog("러닝을 종료할까요?", isPresented: $confirmFinish, titleVisibility: .visible) {
      Button("측정 종료", role: .destructive) { model.request("finish") }
    }
  }
  private var runMessage: String {
    switch model.metrics["status"] as? String {
    case "running": return "아이폰에서 측정 중"
    case "paused": return "일시정지"
    case "interrupted": return "측정 중단"
    case "saving": return "아이폰에서 저장 중"
    default: return "러닝 완료"
    }
  }
  private func metric(_ label: String, _ value: String) -> some View {
    VStack(alignment: .leading, spacing: 3) { Text(label).font(.caption2).foregroundStyle(.secondary); Text(value).font(.system(size: 18, weight: .semibold)).monospacedDigit().minimumScaleFactor(0.65).lineLimit(1) }
  }
  private func duration(_ date: Date) -> String {
    let seconds = Int(model.display.duration(at: date.timeIntervalSince1970))
    return String(format: "%02d:%02d", seconds / 60, seconds % 60)
  }
  private func pace(_ value: Double?) -> String {
    guard let value, value.isFinite, value > 0 else { return "-" }
    return String(format: "%d′%02d″", Int(value) / 60, Int(value) % 60)
  }
}
