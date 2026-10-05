import SwiftUI
import WatchKit
import HealthKit
import WatchConnectivity

@main
struct RunaryWatchApp: App {
  @WKApplicationDelegateAdaptor(WatchDelegate.self) var delegate
  var body: some Scene { WindowGroup { WatchRunView(model: WatchRun.shared) } }
}
final class WatchDelegate: NSObject, WKApplicationDelegate {
  func handle(_ workoutConfiguration: HKWorkoutConfiguration) { WatchRun.shared.launchRequested = true }
  func handleActiveWorkoutRecovery() { WatchRun.shared.recoverWorkout() }
}
struct WatchHeart: Codable {
  var id: String
  var time: Double
  var bpm: Double
}
struct WatchArchive: Codable {
  var id: String
  var hearts: [WatchHeart]
  var acknowledged: [String]
}
final class WatchRun: NSObject, ObservableObject, WCSessionDelegate, HKWorkoutSessionDelegate, HKLiveWorkoutBuilderDelegate {
  static let shared = WatchRun()
  @Published var metrics: [String: Any] = [:]
  @Published var message = "아이폰 Runary에서 내부 측정을 시작해 주세요."
  @Published var launchRequested = false
  @Published var active = false
  @Published var latestHeart: WatchHeart?
  private let health = HKHealthStore()
  private var workout: HKWorkoutSession?
  private var builder: HKLiveWorkoutBuilder?
  private var archive: WatchArchive?
  private var authorizing = false
  private var sending = false
  private var lastBackgroundSend = 0.0
  private var lastPhoneMessage = 0.0
  private var backgroundQueued = Set<String>()
  private var pendingRequest: String?
  private var deleted = Set<String>()
  private var deleteAfterEnd: String?
  private var sessionEnded = false
  var collectingHeart: Bool { workout?.state == .running }
  private var root: URL {
    FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0].appendingPathComponent("InternalHearts", isDirectory: true)
  }
  override init() {
    super.init()
    deleted = Set((try? JSONDecoder().decode([String].self, from: Data(contentsOf: root.appendingPathComponent("deleted.json")))) ?? [])
    if WCSession.isSupported() { WCSession.default.delegate = self; WCSession.default.activate() }
  }
  private func persist() throws {
    guard let archive else { return }
    try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
    var directory = root; var values = URLResourceValues(); values.isExcludedFromBackup = true
    try directory.setResourceValues(values)
    let url = root.appendingPathComponent(archive.id + ".json")
    try JSONEncoder().encode(archive).write(to: url, options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
  }
  private func load(_ id: String) throws -> WatchArchive {
    guard UUID(uuidString: id) != nil else { return WatchArchive(id: id, hearts: [], acknowledged: []) }
    let url = root.appendingPathComponent(id + ".json")
    guard FileManager.default.fileExists(atPath: url.path) else { return WatchArchive(id: id, hearts: [], acknowledged: []) }
    return try JSONDecoder().decode(WatchArchive.self, from: Data(contentsOf: url))
  }
  // Starting another Watch workout can end the runner's existing workout. The
  // runner explicitly confirms on the Watch before this new session is created.
  func startConfirmed() {
    guard !authorizing, workout == nil, let id = metrics["id"] as? String,
          UUID(uuidString: id) != nil, metrics["status"] as? String == "running" else { return }
    do { archive = try load(id) } catch { message = "저장된 심박을 읽을 수 없어요. 원본은 보존했습니다."; return }
    authorizing = true; message = "심박 권한을 확인하고 있어요."
    let heart = HKObjectType.quantityType(forIdentifier: .heartRate)!
    health.requestAuthorization(toShare: [HKObjectType.workoutType()], read: [heart]) { [weak self] success, error in
      DispatchQueue.main.async {
        guard let self else { return }; self.authorizing = false
        guard success, error == nil, self.metrics["id"] as? String == id, self.metrics["status"] as? String == "running" else {
          self.message = "심박 측정을 시작하지 못했어요. 아이폰 측정은 계속됩니다."; self.reportError("authorizationOrState"); return
        }
        do {
          let config = HKWorkoutConfiguration(); config.activityType = .running; config.locationType = .outdoor
          let session = try HKWorkoutSession(healthStore: self.health, configuration: config)
          self.configure(session)
          let date = Date()
          session.startActivity(with: date)
          self.builder?.beginCollection(withStart: date) { [weak self] success, _ in
            guard !success else { return }
            DispatchQueue.main.async {
              guard let self, self.workout === session else { return }
              self.message = "심박 수집을 시작하지 못했어요."; self.reportError("collectionStart"); session.end()
            }
          }
          self.active = true; self.message = "심박 대기"
        } catch { self.message = "워치 운동을 시작하지 못했어요."; self.reportError("sessionStart") }
      }
    }
  }
  private func configure(_ session: HKWorkoutSession) {
    workout = session; sessionEnded = false; session.delegate = self
    let builder = session.associatedWorkoutBuilder(); self.builder = builder
    builder.delegate = self
    builder.dataSource = HKLiveWorkoutDataSource(healthStore: health, workoutConfiguration: session.workoutConfiguration)
  }
  func recoverWorkout() {
    health.recoverActiveWorkoutSession { [weak self] session, _ in
      DispatchQueue.main.async {
        guard let self, let session else { return }
        self.configure(session); self.active = true
        self.accept(WCSession.default.receivedApplicationContext)
        self.message = "워치 측정에 다시 연결했어요."
      }
    }
  }
  private func deleteRecords(_ ids: [String]) {
    for id in ids where UUID(uuidString: id) != nil {
      do {
        deleted.insert(id)
        try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
        try JSONEncoder().encode(Array(deleted)).write(to: root.appendingPathComponent("deleted.json"), options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
        if archive?.id == id && workout != nil { deleteAfterEnd = id; workout?.end(); continue }
        let url = root.appendingPathComponent(id + ".json")
        if FileManager.default.fileExists(atPath: url.path) { try FileManager.default.removeItem(at: url) }
        if archive?.id == id { archive = nil; latestHeart = nil; metrics = [:]; message = "아이폰에서 새 러닝을 시작해 주세요." }
      } catch { message = "워치 기록 삭제를 완료하지 못했어요. 다시 연결해 주세요." }
    }
  }
  private func accept(_ payload: [String: Any]) {
    if payload["kind"] as? String == "delete", let ids = payload["ids"] as? [String] { deleteRecords(ids); return }
    guard payload["kind"] as? String == "run", let id = payload["id"] as? String, UUID(uuidString: id) != nil, !deleted.contains(id) else { return }
    if let current = archive, current.id != id, workout != nil {
      message = "이전 워치 측정을 마친 뒤 연결해 주세요."; return
    }
    // Context and interactive messages may arrive in reverse order.
    let sent = payload["sent"] as? Double ?? 0
    guard sent >= lastPhoneMessage else { return }; lastPhoneMessage = sent
    metrics = payload
    if archive == nil || archive?.id != id {
      do { archive = try load(id); latestHeart = archive?.hearts.last; sessionEnded = false } catch { message = "저장된 심박을 읽을 수 없어요. 원본은 보존했습니다."; return }
    }
    let state = payload["status"] as? String
    if state == "paused" || (state == "interrupted" && payload["preserveWatch"] as? Bool != true) { workout?.pause() }
    if state == "running", workout?.state == .paused { workout?.resume() }
    if state == "saving" || state == "completed" { workout?.end() }
    sendHearts()
  }
  func request(_ command: String) {
    guard pendingRequest == nil, let id = metrics["id"] as? String else { return }
    guard WCSession.default.isReachable else { message = "아이폰 연결 후 다시 눌러 주세요."; return }
    pendingRequest = command
    WCSession.default.sendMessage(["id": id, "request": command], replyHandler: { [weak self] reply in
      DispatchQueue.main.async {
        self?.pendingRequest = nil
        if reply["accepted"] as? Bool != true { self?.message = reply["error"] as? String ?? "아이폰에서 다시 시도해 주세요." }
      }
    }, errorHandler: { [weak self] _ in DispatchQueue.main.async { self?.pendingRequest = nil; self?.message = "아이폰 연결을 확인해 주세요." } })
  }
  private func reportError(_ code: String) {
    guard let id = archive?.id, WCSession.default.isReachable else { return }
    WCSession.default.sendMessage(["id": id, "error": code], replyHandler: nil, errorHandler: nil)
  }
  private func sendHearts() {
    guard !sending, let archive, WCSession.default.activationState == .activated else { return }
    let acknowledged = Set(archive.acknowledged)
    let candidates = archive.hearts.filter { !acknowledged.contains($0.id) }
    let batch = Array((WCSession.default.isReachable ? candidates : candidates.filter { !backgroundQueued.contains($0.id) }).prefix(200))
    let values = batch.map { ["id": $0.id, "time": $0.time, "bpm": $0.bpm] as [String: Any] }
    let state = workout?.state == .running ? "running" : workout?.state == .paused ? "paused" : sessionEnded || workout?.state == .ended ? "stopped" : "waiting"
    let packet: [String: Any] = ["id": archive.id, "state": state, "sent": Date().timeIntervalSince1970, "hearts": values]
    if WCSession.default.isReachable {
      sending = true
      WCSession.default.sendMessage(packet, replyHandler: { [weak self] reply in
        DispatchQueue.main.async {
          guard let self else { return }; self.sending = false
          guard self.archive?.id == archive.id, reply["accepted"] as? Bool == true else { return }
          self.archive?.acknowledged.append(contentsOf: batch.map(\.id))
          do { try self.persist() } catch { self.message = "심박 보관 오류" }
          if !batch.isEmpty { self.sendHearts() }
        }
      }, errorHandler: { [weak self] _ in DispatchQueue.main.async { self?.sending = false } })
    } else if !batch.isEmpty, Date().timeIntervalSince1970 - lastBackgroundSend > 30,
              WCSession.default.outstandingUserInfoTransfers.count < 4 {
      // Bounded batches, not one queued background transfer per beat. No ACK
      // means samples remain locally available for deduplicated reconnect.
      lastBackgroundSend = Date().timeIntervalSince1970
      backgroundQueued.formUnion(batch.map(\.id))
      WCSession.default.transferUserInfo(packet)
    }
  }
  func session(_ session: WCSession, activationDidCompleteWith activationState: WCSessionActivationState, error: Error?) {
    DispatchQueue.main.async { [weak self] in self?.accept(session.receivedApplicationContext); self?.sendHearts() }
  }
  func sessionReachabilityDidChange(_ session: WCSession) {
    DispatchQueue.main.async { [weak self] in self?.sendHearts() }
  }
  func session(_ session: WCSession, didFinish userInfoTransfer: WCSessionUserInfoTransfer, error: Error?) {
    guard error != nil else { return }
    DispatchQueue.main.async { [weak self] in
      let values = userInfoTransfer.userInfo["hearts"] as? [[String: Any]] ?? []
      self?.backgroundQueued.subtract(values.compactMap { $0["id"] as? String })
    }
  }
  func session(_ session: WCSession, didReceiveUserInfo userInfo: [String: Any]) {
    DispatchQueue.main.async { [weak self] in self?.accept(userInfo) }
  }
  func session(_ session: WCSession, didReceiveApplicationContext applicationContext: [String: Any]) {
    DispatchQueue.main.async { [weak self] in self?.accept(applicationContext) }
  }
  func session(_ session: WCSession, didReceiveMessage message: [String: Any]) {
    DispatchQueue.main.async { [weak self] in self?.accept(message) }
  }
  func workoutSession(_ workoutSession: HKWorkoutSession, didChangeTo toState: HKWorkoutSessionState, from fromState: HKWorkoutSessionState, date: Date) {
    DispatchQueue.main.async { [weak self] in
      guard let self, self.workout === workoutSession else { return }
      self.active = toState == .running || toState == .paused
      if toState == .ended {
        self.sessionEnded = true
        let builder = self.builder
        builder?.endCollection(withEnd: date) { [weak self] _, _ in
          DispatchQueue.main.async {
            guard let self, self.workout === workoutSession, self.builder === builder else { return }
            builder?.discardWorkout(); self.builder = nil; self.workout = nil
            if let id = self.deleteAfterEnd { self.deleteAfterEnd = nil; self.deleteRecords([id]) } else { self.sendHearts() }
          }
        }
      }
      self.sendHearts()
    }
  }
  func workoutSession(_ workoutSession: HKWorkoutSession, didFailWithError error: Error) {
    DispatchQueue.main.async { [weak self] in
      guard let self, self.workout === workoutSession else { return }
      self.message = "워치 운동이 중단됐어요. 아이폰 측정은 계속됩니다."
      self.reportError("sessionStopped"); self.workout = nil; self.active = false; self.sessionEnded = true
      let builder = self.builder; self.builder = nil
      builder?.endCollection(withEnd: Date()) { _, _ in builder?.discardWorkout() }
      self.sendHearts()
    }
  }
  func workoutBuilderDidCollectEvent(_ workoutBuilder: HKLiveWorkoutBuilder) {}
  func workoutBuilder(_ workoutBuilder: HKLiveWorkoutBuilder, didCollectDataOf collectedTypes: Set<HKSampleType>) {
    let heart = HKObjectType.quantityType(forIdentifier: .heartRate)!
    guard collectedTypes.contains(heart), let stats = workoutBuilder.statistics(for: heart),
          let quantity = stats.mostRecentQuantity(), let interval = stats.mostRecentQuantityDateInterval() else { return }
    let bpm = quantity.doubleValue(for: .count().unitDivided(by: .minute()))
    let time = interval.end.timeIntervalSince1970
    DispatchQueue.main.async { [weak self] in
      guard let self, self.builder === workoutBuilder, self.workout?.state == .running, bpm.isFinite, bpm > 0 else { return }
      let sample = WatchHeart(id: "\(time):\(bpm)", time: time, bpm: bpm)
      guard self.archive?.hearts.last?.id != sample.id else { return }
      self.archive?.hearts.append(sample); self.latestHeart = sample; self.message = "측정 중"
      do { try self.persist(); self.sendHearts() }
      catch { self.message = "심박 보관을 중단했어요. 아이폰 측정은 계속됩니다."; self.workout?.end(); self.reportError("storage") }
    }
  }
}
struct WatchRunView: View {
  @ObservedObject var model: WatchRun
  @State private var confirm = false
  @State private var confirmFinish = false
  var body: some View {
    TimelineView(.periodic(from: .now, by: 1)) { context in
      ScrollView {
        Text("Runary").font(.headline).foregroundStyle(Color.orange)
        if model.metrics["id"] != nil {
          let now = context.date.timeIntervalSince1970
          let age = now - (model.metrics["sent"] as? Double ?? 0)
          let fresh = age >= -2 && age <= 10 && model.metrics["status"] as? String == "running"
          let heart = model.latestHeart.flatMap { model.collectingHeart && now - $0.time >= -2 && now - $0.time <= 15 ? $0.bpm : nil }
          LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 12) {
            metric("시간", duration(context.date))
            metric("거리 (km)", String(format: "%.2f", (model.metrics["distance"] as? Double ?? 0) / 1000))
            metric("페이스 (/km)", pace(fresh && now - (model.metrics["lastLocation"] as? Double ?? 0) <= 10 ? model.metrics["pace"] as? Double : nil))
            metric("심박 (bpm)", heart.map { String(Int($0.rounded())) } ?? "—")
          }
          Text(model.message).font(.caption2).foregroundStyle(.secondary)
          if context.date.timeIntervalSince1970 - (model.metrics["sent"] as? Double ?? 0) > 10 { Text("아이폰 지표 업데이트 대기").font(.caption2).foregroundStyle(.orange) }
          if !model.active && model.metrics["status"] as? String == "running" {
            Button("워치 측정 시작") { confirm = true }.tint(.orange)
          } else if model.active {
            Button(model.metrics["status"] as? String == "running" ? "일시정지" : "재개") {
              model.request(model.metrics["status"] as? String == "running" ? "pause" : "resume")
            }
            Button("종료", role: .destructive) { confirmFinish = true }
          }
          let cadence = fresh && now - (model.metrics["lastMotion"] as? Double ?? 0) <= 10 ? model.metrics["cadence"] as? Double : nil
          Text("케이던스 \(cadence.map { String(Int($0.rounded())) } ?? "—") spm").font(.caption)
        } else { Text(model.message).font(.caption) }
      }
    }
    .confirmationDialog("러닝을 종료할까요?", isPresented: $confirmFinish, titleVisibility: .visible) {
      Button("측정 종료", role: .destructive) { model.request("finish") }
    }
    .confirmationDialog("다른 워치 운동을 종료한 뒤 시작해 주세요.", isPresented: $confirm, titleVisibility: .visible) {
      Button("Runary 워치 측정 시작") { model.startConfirmed() }
    }
  }
  private func metric(_ label: String, _ value: String) -> some View {
    VStack(spacing: 3) { Text(label).font(.caption2).foregroundStyle(.secondary); Text(value).font(.system(size: 23, weight: .semibold)).monospacedDigit().minimumScaleFactor(0.65).lineLimit(1) }
  }
  private func duration(_ date: Date) -> String {
    let age = max(0, date.timeIntervalSince1970 - (model.metrics["sent"] as? Double ?? date.timeIntervalSince1970))
    let extra = model.metrics["status"] as? String == "running" ? min(age, 10) : 0
    let seconds = Int((model.metrics["duration"] as? Double ?? 0) + extra)
    return String(format: "%02d:%02d", seconds / 60, seconds % 60)
  }
  private func pace(_ value: Double?) -> String {
    guard let value, value.isFinite else { return "—" }
    return String(format: "%d′%02d″", Int(value) / 60, Int(value) % 60)
  }
}
