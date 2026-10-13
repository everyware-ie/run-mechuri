import Foundation

// Rendered clips can contain HealthKit data. Keep them persistent on device,
// while excluding the app-owned directory from automatic device backups.
enum LocalClipStorage {
  static func prepare(in documents: URL, create: Bool = true) throws -> URL {
    var directory = documents.appendingPathComponent("clips", isDirectory: true)
    if create {
      try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
    } else if !FileManager.default.fileExists(atPath: directory.path) {
      return directory
    }
    var values = URLResourceValues()
    values.isExcludedFromBackup = true
    try directory.setResourceValues(values)
    return directory
  }
}
