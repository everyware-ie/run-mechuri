import Foundation
import Darwin

// HealthRecordCache.swift의 규칙을 하나씩 확인한다.
// 실행: scripts/check-health-record-cache.sh

@main struct HealthRecordCacheChecks {
  static let hour: TimeInterval = 3600
  static let now = Date(timeIntervalSince1970: 1_800_000_000)
  static let extras = HealthRecordExtras(averageHeartRate: 152.5, hasRoute: true)

  // macOS가 계산해 주는 값 대신 파일에 실제로 쓰인 백업 제외 표시를 읽는다(클립 보관 검사와 같다).
  static func excluded(at url: URL) throws -> Bool {
    let key = "com.apple.metadata:com_apple_backup_excludeItem"
    let size = getxattr(url.path, key, nil, 0, 0, 0)
    guard size > 0 else { return false }
    var data = Data(count: size)
    let read = data.withUnsafeMutableBytes { getxattr(url.path, key, $0.baseAddress, size, 0, 0) }
    guard read == size else { throw NSError(domain: NSPOSIXErrorDomain, code: Int(errno)) }
    return try PropertyListSerialization.propertyList(from: data, format: nil) as? String == "com.apple.backupd"
  }

  static func main() throws {
    // 1. 처음에는 아무것도 없다
    var cache = HealthRecordCache()
    precondition(cache.extras(for: "a", end: now.addingTimeInterval(-48 * hour), now: now) == nil)

    // 2. 끝난 지 24시간이 지난 기록만 보관하고 돌려준다. 경계는 정확히 24시간이다
    precondition(cache.store(extras, for: "a", end: now.addingTimeInterval(-24 * hour), now: now), "exactly 24h is settled")
    precondition(cache.extras(for: "a", end: now.addingTimeInterval(-24 * hour), now: now) == extras)
    precondition(!cache.store(extras, for: "b", end: now.addingTimeInterval(-24 * hour + 1), now: now), "23h59m59s is not settled")
    precondition(cache.entries["b"] == nil, "a recent record must not be stored")

    // 3. 보관한 값이 있어도 아직 안정되지 않은 기록이면 쓰지 않는다
    precondition(cache.extras(for: "a", end: now.addingTimeInterval(-hour), now: now) == nil, "recent records are always queried again")

    // 4. 같은 값을 다시 보관해도 바뀐 것으로 치지 않는다. 다른 값이면 바뀐다
    precondition(!cache.store(extras, for: "a", end: now.addingTimeInterval(-48 * hour), now: now))
    let changed = HealthRecordExtras(averageHeartRate: nil, hasRoute: false)
    precondition(cache.store(changed, for: "a", end: now.addingTimeInterval(-48 * hour), now: now))
    precondition(cache.extras(for: "a", end: now.addingTimeInterval(-48 * hour), now: now) == changed, "nil heart rate and no route are real values")

    // 5. 건강 앱 목록에 없는 기록은 지운다
    var pruned = HealthRecordCache()
    for id in ["x", "y", "z"] { pruned.store(extras, for: id, end: now.addingTimeInterval(-72 * hour), now: now) }
    precondition(!pruned.prune(keeping: ["x", "y", "z", "new"]), "nothing to remove")
    precondition(pruned.prune(keeping: ["x", "z"]))
    precondition(Set(pruned.entries.keys) == ["x", "z"], "a deleted record must not remain")
    precondition(pruned.prune(keeping: []))
    precondition(pruned.entries.isEmpty)

    // 6. 파일로 저장하고 다시 읽는다. 폴더와 파일 모두 백업에서 제외한다
    let files = FileManager.default
    let root = files.temporaryDirectory.appendingPathComponent("health-cache-checks-\(UUID().uuidString)", isDirectory: true)
    defer { try? files.removeItem(at: root) }
    let url = root.appendingPathComponent("HealthRecordCache", isDirectory: true).appendingPathComponent("extras.json")
    precondition(HealthRecordCacheStore.load(from: url) == HealthRecordCache(), "a missing file is an empty cache")
    var saved = HealthRecordCache()
    saved.store(extras, for: "a", end: now.addingTimeInterval(-48 * hour), now: now)
    saved.store(changed, for: "b", end: now.addingTimeInterval(-48 * hour), now: now)
    try HealthRecordCacheStore.save(saved, to: url)
    precondition(HealthRecordCacheStore.load(from: url) == saved, "round trip must keep every value, including nil and false")
    let fileExcluded = try excluded(at: url)
    let folderExcluded = try excluded(at: url.deletingLastPathComponent())
    precondition(fileExcluded, "the file must be excluded from backup")
    precondition(folderExcluded, "the folder must be excluded from backup")

    // 7. 덮어써도 백업 제외가 유지되고 값이 갱신된다
    saved.store(HealthRecordExtras(averageHeartRate: 160, hasRoute: true), for: "c", end: now.addingTimeInterval(-96 * hour), now: now)
    try HealthRecordCacheStore.save(saved, to: url)
    precondition(HealthRecordCacheStore.load(from: url).entries.count == 3)
    let stillExcluded = try excluded(at: url)
    precondition(stillExcluded, "overwriting must keep the backup exclusion")

    // 8. 망가진 파일, 다른 버전, 빈 파일은 버리고 빈 보관 정보로 시작한다
    try Data("not json".utf8).write(to: url)
    precondition(HealthRecordCacheStore.load(from: url) == HealthRecordCache(), "a corrupted file is ignored")
    try Data("{\"version\":999,\"entries\":{\"a\":{\"hasRoute\":true}}}".utf8).write(to: url)
    precondition(HealthRecordCacheStore.load(from: url) == HealthRecordCache(), "a different version is ignored")
    try Data().write(to: url)
    precondition(HealthRecordCacheStore.load(from: url) == HealthRecordCache(), "an empty file is ignored")

    // 9. 쓸 수 없는 위치는 오류로 알리되 멈추지 않는다(호출하는 쪽이 무시한다)
    let blocked = root.appendingPathComponent("blocked")
    try Data("file".utf8).write(to: blocked)
    var failed = false
    do { try HealthRecordCacheStore.save(saved, to: blocked.appendingPathComponent("x").appendingPathComponent("extras.json")) } catch { failed = true }
    precondition(failed, "an unwritable location must fail instead of crashing")

    print("Health record cache: 24h boundary, recent records, pruning, round trip, backup exclusion, overwrite, corrupted/version/empty files and write failure checks passed")
  }
}
