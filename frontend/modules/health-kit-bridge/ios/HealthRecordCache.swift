import Foundation

// FRD: docs/specs/frd/runary-record-editing.md §목록 (건강 앱 기록의 부가 정보 보관)
//
// 건강 앱의 러닝 기록마다 평균 심박과 경로 유무를 따로 조회하느라 기록이 쌓일수록
// 목록이 느려졌다. 한 번 조회한 값은 기록 ID별로 기기에 보관해 다시 조회하지 않는다.
//
// - 목록은 항상 건강 앱에서 새로 읽는다. 이 보관 정보는 목록의 기준이 아니라
//   건강 앱이 알려 준 기록에 붙는 메모일 뿐이다.
// - 보관하는 것은 평균 심박과 경로 유무뿐이다. 좌표는 보관하지 않는다.
// - 끝난 지 24시간이 안 된 기록은 보관하지 않는다. 워치 심박이나 경로가 늦게
//   동기화될 수 있다.
// - 건강 정보에서 계산한 값이므로 기기 백업에서 제외한다(홈과 보관함 FRD).
// - 읽지 못하거나 형식이 맞지 않으면 버리고 예전처럼 조회한다. 목록은 항상 나와야 한다.
//
// Foundation만 쓴다. HealthKit 없이 swiftc로 검사할 수 있다
// (modules/health-kit-bridge/tests/HealthRecordCacheChecks.swift).

struct HealthRecordExtras: Codable, Equatable {
  var averageHeartRate: Double?
  var hasRoute: Bool
}

struct HealthRecordCache: Equatable {
  /// 평균 심박 계산 방식 등이 바뀌면 올린다. 다른 버전의 파일은 버린다.
  static let version = 1
  /// 이 시간이 지난 기록만 보관한다.
  static let settleInterval: TimeInterval = 24 * 60 * 60

  private(set) var entries: [String: HealthRecordExtras]

  init(entries: [String: HealthRecordExtras] = [:]) { self.entries = entries }

  static func isSettled(end: Date, now: Date) -> Bool {
    now.timeIntervalSince(end) >= settleInterval
  }

  /// 보관한 값. 아직 안정되지 않은 기록이거나 보관한 적이 없으면 nil이다.
  func extras(for id: String, end: Date, now: Date) -> HealthRecordExtras? {
    guard Self.isSettled(end: end, now: now) else { return nil }
    return entries[id]
  }

  /// 안정된 기록만 보관한다. 보관했으면 true.
  @discardableResult
  mutating func store(_ extras: HealthRecordExtras, for id: String, end: Date, now: Date) -> Bool {
    guard Self.isSettled(end: end, now: now), entries[id] != extras else { return false }
    entries[id] = extras
    return true
  }

  /// 건강 앱 목록에 없는 기록(지운 기록)은 보관 정보에서도 지운다. 바뀌었으면 true.
  @discardableResult
  mutating func prune(keeping ids: Set<String>) -> Bool {
    let kept = entries.filter { ids.contains($0.key) }
    guard kept.count != entries.count else { return false }
    entries = kept
    return true
  }
}

enum HealthRecordCacheStore {
  private struct File: Codable {
    var version: Int
    var entries: [String: HealthRecordExtras]
  }

  static func defaultURL() throws -> URL {
    try FileManager.default
      .url(for: .applicationSupportDirectory, in: .userDomainMask, appropriateFor: nil, create: true)
      .appendingPathComponent("HealthRecordCache", isDirectory: true)
      .appendingPathComponent("extras.json")
  }

  /// 어떤 이유로든 읽지 못하면 빈 보관 정보다. 호출하는 쪽은 예전처럼 조회하면 된다.
  static func load(from url: URL) -> HealthRecordCache {
    guard let data = try? Data(contentsOf: url),
          let file = try? JSONDecoder().decode(File.self, from: data),
          file.version == HealthRecordCache.version else { return HealthRecordCache() }
    return HealthRecordCache(entries: file.entries)
  }

  /// 같은 위치에 원자적으로 쓴다. 쓰다 멈춰도 이전 파일이 망가지지 않는다.
  /// 폴더와 파일을 기기 백업에서 제외한다.
  static func save(_ cache: HealthRecordCache, to url: URL) throws {
    let files = FileManager.default
    var directory = url.deletingLastPathComponent()
    try files.createDirectory(at: directory, withIntermediateDirectories: true)
    var values = URLResourceValues()
    values.isExcludedFromBackup = true
    try directory.setResourceValues(values)
    let data = try JSONEncoder().encode(File(version: HealthRecordCache.version, entries: cache.entries))
    try data.write(to: url, options: .atomic)
    var file = url
    try file.setResourceValues(values)
  }
}
