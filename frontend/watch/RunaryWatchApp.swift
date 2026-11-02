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
      WatchRun.shared.handlePhoneLaunch()
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
  @Published private var pendingStop: [String: Any]? = UserDefaults.standard.dictionary(forKey: "RunaryPendingStop")
  var stopping: Bool { pendingStop != nil }
  private var active = false
  private var timer: Timer?
  private var refreshToken: UUID?
  private var phoneLaunchPermit = TrackingWatchLaunchPermit()
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
  @discardableResult private func accept(_ payload: [String: Any], phoneLaunchToken: UUID? = nil) -> Bool {
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
    let launchedRunID = phoneLaunchToken.flatMap { phoneLaunchPermit.consume($0, payload: payload, at: Date().timeIntervalSince1970) }
    workout.accept(payload, launchedRunID: launchedRunID)
    healthReader.sync(display, at: Date().timeIntervalSince1970)
    error = stopping ? "종료 요청 전달 중" : nil
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
  func handlePhoneLaunch() {
    launchHandled = true
    phoneLaunchPermit.begin(at: Date().timeIntervalSince1970)
    // Replies requested before the HealthKit callback are not a launch handshake.
    refreshToken = nil
    healthReader.refreshPermission()
    refreshFromPhone(force: true)
  }
  func refreshFromPhone(force: Bool = false) {
    guard WCSession.default.activationState == .activated else { return }
    _ = accept(WCSession.default.receivedApplicationContext)
    let now = Date().timeIntervalSince1970
    guard refreshToken == nil, force || now - lastAttempt >= 3 else { return }
    let token = UUID(); refreshToken = token; lastAttempt = now
    let launchToken = phoneLaunchPermit.token
    // A Watch message can wake the phone in the background. Do not silently
    // skip the request based on a cached reachability check; handle its result.
    var message = handshake; message["kind"] = "displayReady"; message["sent"] = now
    WCSession.default.sendMessage(message, replyHandler: { [weak self] payload in
      DispatchQueue.main.async {
        guard let self, self.refreshToken == token else { return }
        self.refreshToken = nil; _ = self.accept(payload, phoneLaunchToken: launchToken)
      }
    }, errorHandler: { [weak self] _ in
      DispatchQueue.main.async { if self?.refreshToken == token { self?.refreshToken = nil } }
    })
    DispatchQueue.main.asyncAfter(deadline: .now() + 8) { [weak self] in
      if self?.refreshToken == token { self?.refreshToken = nil }
    }
  }
  func request(_ command: String, expectedRunID: String? = nil) {
    if let expectedRunID, !display.canControl(runID: expectedRunID) { return }
    if command == "finish", let id = metrics["id"] as? String {
      // Retries retain the original record and stop time until its own ack.
      guard pendingStop == nil else { flushStop(); return }
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
    DispatchQueue.main.async { [weak self] in self?.refreshFromPhone(force: true); self?.flushHealthOutbox(); self?.flushStop() }
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
  @State private var finishRunID: String?
  private let accent = Color(red: 1, green: 0.35, blue: 0.17)
  var body: some View {
    TimelineView(.periodic(from: .now, by: 1)) { context in
      let now = context.date.timeIntervalSince1970
      let fresh = model.display.fresh(at: now)
      let status = model.metrics["status"] as? String ?? "idle"
      let workoutAction = workout.needsPermission || workout.state == "blocked"
      if model.metrics["id"] != nil {
        TabView {
          GeometryReader { geometry in
            VStack(alignment: .leading, spacing: 5) {
              HStack(spacing: 4) {
                Text(header(status, fresh: fresh)).font(.system(size: 12, weight: .semibold)).foregroundStyle(status == "running" ? accent : .primary).lineLimit(1).minimumScaleFactor(0.7)
                Spacer(minLength: 0)
                if workoutAction {
                  Button { if workout.needsPermission { workout.requestPermission() } else { workout.retry() } } label: {
                    Image(systemName: workout.needsPermission ? "exclamationmark.circle" : "arrow.clockwise").frame(width: 44, height: 44).contentShape(Rectangle())
                  }.buttonStyle(.plain).tint(accent).accessibilityLabel(workout.needsPermission ? "워치 운동 연결" : "워치 측정 다시 시작").disabled(!fresh || model.pending || model.display.startPending || model.stopping)
                }
              }
              if status == "completed" { Label("기록 저장됨", systemImage: "checkmark.circle.fill").font(.caption2).foregroundStyle(accent) }
              HStack(alignment: .firstTextBaseline, spacing: 4) {
                Text(String(format: "%.2f", (model.metrics["distance"] as? Double ?? 0) / 1000)).font(.system(size: workoutAction ? (geometry.size.height < 180 ? 28 : 36) : (geometry.size.height < 180 ? 38 : 50), weight: .bold)).monospacedDigit().lineLimit(1).minimumScaleFactor(0.6)
                Text("km").font(.caption2).foregroundStyle(.secondary)
              }.opacity(fresh || status == "completed" ? 1 : 0.45)
              HStack(alignment: .top, spacing: 5) {
                metric("시간", duration(context.date))
                metric("평균 페이스", pace(model.metrics["averagePace"] as? Double))
                VStack(alignment: .leading, spacing: 2) {
                  Label("bpm", systemImage: "heart.fill").font(.system(size: 9)).foregroundStyle(accent)
                  Text(model.display.heart(at: now).map { String(Int($0.rounded())) } ?? "-").font(.system(size: 16, weight: .semibold)).monospacedDigit()
                }.frame(maxWidth: .infinity, alignment: .leading)
              }.opacity(fresh || status == "completed" ? 1 : 0.45)
              Spacer(minLength: 0)
              if model.stopping {
                ProgressView().frame(maxWidth: .infinity)
                Text("종료 요청 전달 중").font(.caption2).frame(maxWidth: .infinity)
              } else if model.pending || model.display.startPending {
                ProgressView().frame(maxWidth: .infinity)
                Text("아이폰 반영 확인 중").font(.caption2).frame(maxWidth: .infinity)
              } else if model.display.canControl(runID: model.metrics["id"] as? String) {
                HStack(spacing: 6) {
                  Button { finishRunID = model.metrics["id"] as? String; confirmFinish = true } label: { Image(systemName: "stop.fill").frame(maxWidth: .infinity, minHeight: 44).background(Color.gray.opacity(0.22), in: Capsule()) }
                    .accessibilityLabel("종료").tint(.gray)
                  Button { model.request(status == "running" ? "pause" : "resume") } label: { Image(systemName: status == "running" ? "pause.fill" : "play.fill").frame(maxWidth: .infinity, minHeight: 44).background(status == "running" ? Color.gray.opacity(0.22) : accent, in: Capsule()).foregroundStyle(status == "running" ? Color.primary : Color.black) }
                    .accessibilityLabel(status == "running" ? "일시정지" : "재개").tint(status == "running" ? .gray : accent).disabled(!fresh)
                }.buttonStyle(.plain)
              } else { Text(status == "saving" ? "아이폰에서 저장 중" : "아이폰에서 영상을 만들 수 있어요").font(.caption2) }
            }.frame(width: geometry.size.width, height: geometry.size.height, alignment: .topLeading)
          }.tag(0)
          ScrollView {
            VStack(alignment: .leading, spacing: 10) {
              Text("연결과 러닝 정보").font(.headline)
              if !fresh { Text("연결 확인 중\n아이폰 상태를 다시 확인하고 있어요.").font(.caption) }
              Text("케이던스 \(fresh && status == "running" && now - (model.metrics["lastMotion"] as? Double ?? 0) <= 10 ? (model.metrics["cadence"] as? Double).map { String(Int($0.rounded())) } ?? "-" : "-") spm").font(.caption)
              if workout.needsPermission { Button("워치 운동 연결") { workout.requestPermission() }.disabled(model.stopping || !fresh) }
              if workout.state == "blocked" {
                Text("워치 측정이 중단됐어요. 아이폰 러닝은 계속돼요.").font(.caption2)
                Button("워치 측정 다시 시작") { workout.retry() }.disabled(model.stopping || !fresh)
              }
              if healthReader.needsPermission { Button("건강 심박 연결") { healthReader.requestPermission() }.disabled(healthReader.requesting) }
              if status == "running" { Text(healthReader.message).font(.caption2).foregroundStyle(.secondary) }
              if model.display.startPending { Button("요청 취소") { model.request("cancelStart") }.disabled(model.pending) }
              if let notice = model.display.notice { Text(notice).font(.caption2).foregroundStyle(accent) }
              if let error = model.error { Text(error).font(.caption2).foregroundStyle(accent) }
              if let notice = model.healthRelayNotice { Text(notice).font(.caption2).foregroundStyle(accent) }
            }
          }.tag(1)
        }.tabViewStyle(.page(indexDisplayMode: .automatic))
      } else {
        VStack(spacing: 12) {
          Text(model.stopping ? "종료 요청 전달 중" : model.display.startPending ? "시작 확인 중" : "Runary").font(.headline).foregroundStyle(accent)
          Spacer(minLength: 0)
          if model.stopping {
            ProgressView()
            Text("아이폰의 저장 확인을\n기다리고 있어요").font(.caption).multilineTextAlignment(.center)
          } else if model.display.startPending {
            ProgressView()
            Text(model.display.phonePhase == "needsPhone" ? "아이폰에서 시작 확인" : "아이폰에서 시작을\n확인하고 있어요").font(.caption).multilineTextAlignment(.center)
            Button("요청 취소") { model.request("cancelStart") }.disabled(model.pending)
          } else {
            Button { model.request("start") } label: {
              Image(systemName: "play.fill").font(.system(size: 28)).frame(width: 76, height: 76).background(model.display.canStart(at: now) ? accent : Color.gray.opacity(0.3), in: Circle()).foregroundStyle(.black)
            }.buttonStyle(.plain).accessibilityLabel("러닝 시작").disabled(model.pending || !model.display.canStart(at: now))
            Text("러닝 시작").font(.headline)
          }
          Spacer(minLength: 0)
          Text(model.display.canStart(at: now) ? "아이폰 GPS로 측정해요" : model.display.notice ?? model.error ?? "아이폰 상태 확인 중").font(.caption2).foregroundStyle(.secondary).multilineTextAlignment(.center)
        }
      }
    }
    .onAppear { model.setActive(scenePhase == .active) }
    .onChange(of: scenePhase) { _, phase in model.setActive(phase == .active) }
    .onDisappear { model.setActive(false) }
    .onChange(of: model.metrics["id"] as? String) { _, _ in confirmFinish = false; finishRunID = nil }
    .onChange(of: model.metrics["status"] as? String) { _, _ in
      if !model.display.canControl(runID: finishRunID) { confirmFinish = false; finishRunID = nil }
    }
    .sheet(isPresented: $confirmFinish) {
      ScrollView {
        VStack(alignment: .leading, spacing: 12) {
          Text("러닝을\n종료할까요?").font(.title3).bold()
          Text(String(format: "%.2f km", (model.metrics["distance"] as? Double ?? 0) / 1000) + " · " + duration(Date())).font(.caption)
          Text("평균 " + pace(model.metrics["averagePace"] as? Double)).font(.caption).foregroundStyle(.secondary)
          Button("종료") {
            let id = finishRunID; confirmFinish = false; finishRunID = nil
            if let id { model.request("finish", expectedRunID: id) }
          }.tint(accent).disabled(model.pending || !model.display.canControl(runID: finishRunID))
          Button("돌아가기") { confirmFinish = false }
        }
      }
    }
  }
  private func header(_ status: String, fresh: Bool) -> String {
    if model.stopping { return "종료 요청 전달 중" }
    if !fresh { return "연결 확인 중" }
    if model.error != nil { return "제어 요청 확인 필요" }
    if workout.needsPermission { return "워치 연결 필요" }
    if workout.state == "blocked" { return "워치 측정 중단" }
    switch status { case "running": return "러닝 중"; case "paused": return "일시정지"; case "interrupted": return "측정 중단"; case "saving": return "저장 중"; default: return "Runary" }
  }
  private func metric(_ label: String, _ value: String) -> some View {
    VStack(alignment: .leading, spacing: 2) { Text(label).font(.system(size: 9)).foregroundStyle(.secondary); Text(value).font(.system(size: 16, weight: .semibold)).monospacedDigit().minimumScaleFactor(0.6).lineLimit(1) }.frame(maxWidth: .infinity, alignment: .leading)
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
