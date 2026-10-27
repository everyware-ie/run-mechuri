import Foundation
import Darwin

@main struct LocalClipStorageChecks {
  // macOS reports a computed Time Machine eligibility value for this resource
  // key. Inspect the actual exclusion metadata written by Foundation instead.
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
    let files = FileManager.default
    let root = URL(fileURLWithPath: CommandLine.arguments[1], isDirectory: true)
    try files.createDirectory(at: root, withIntermediateDirectories: true)
    defer { try? files.removeItem(at: root) }
    let missing = try LocalClipStorage.prepare(in: root, create: false)
    precondition(!files.fileExists(atPath: missing.path), "startup must not create an empty library")
    let directory = try LocalClipStorage.prepare(in: root)
    let newExcluded = try excluded(at: directory)
    precondition(newExcluded)
    let clip = directory.appendingPathComponent("existing.mp4")
    let bytes = Data("synthetic clip".utf8)
    try bytes.write(to: clip)
    var included = directory
    var values = URLResourceValues(); values.isExcludedFromBackup = false
    try included.setResourceValues(values)
    let beforeMigration = try excluded(at: directory)
    precondition(!beforeMigration)
    _ = try LocalClipStorage.prepare(in: root, create: false)
    let existingExcluded = try excluded(at: directory)
    let migratedBytes = try Data(contentsOf: clip)
    precondition(existingExcluded)
    precondition(migratedBytes == bytes, "migration must preserve existing clips")
    _ = try LocalClipStorage.prepare(in: root)
    let repeatedBytes = try Data(contentsOf: clip)
    precondition(repeatedBytes == bytes, "repeat preparation must preserve the library")
    let blockedRoot = root.appendingPathComponent("blocked", isDirectory: true)
    try files.createDirectory(at: blockedRoot, withIntermediateDirectories: true)
    try bytes.write(to: blockedRoot.appendingPathComponent("clips"))
    var rejected = false
    do { _ = try LocalClipStorage.prepare(in: blockedRoot) } catch { rejected = true }
    precondition(rejected, "an invalid storage directory must prevent encoding")
    print("Clip backup exclusion: new directory, existing-file preservation, repeat setup and failure checks passed")
  }
}
