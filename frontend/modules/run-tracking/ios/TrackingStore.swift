import Foundation

// Journal checkpoints are durable boundaries. An incomplete append is never
// considered committed, and resume truncates only the uncommitted tail.
final class TrackingStore {
  let root: URL
  init(root: URL) throws {
    self.root = root
    try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
    var resource = root
    var values = URLResourceValues(); values.isExcludedFromBackup = true
    try resource.setResourceValues(values)
    #if os(iOS) || os(watchOS)
    try FileManager.default.setAttributes([.protectionKey: FileProtectionType.completeUntilFirstUserAuthentication], ofItemAtPath: root.path)
    #endif
  }
  private func folder(_ id: String) throws -> URL {
    guard UUID(uuidString: id) != nil else { throw NSError(domain: "TrackingStore", code: 1) }
    return root.appendingPathComponent(id, isDirectory: true)
  }
  func append(id: String, started: Double, events: [TrackingEvent], summary: TrackingSummary) throws {
    let directory = try folder(id)
    try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
    #if os(iOS) || os(watchOS)
    try FileManager.default.setAttributes([.protectionKey: FileProtectionType.completeUntilFirstUserAuthentication], ofItemAtPath: directory.path)
    #endif
    let url = directory.appendingPathComponent("events.jsonl")
    if !FileManager.default.fileExists(atPath: url.path) {
      try Data().write(to: url, options: .atomic)
      #if os(iOS) || os(watchOS)
      try FileManager.default.setAttributes([.protectionKey: FileProtectionType.completeUntilFirstUserAuthentication], ofItemAtPath: url.path)
      #endif
    }
    let handle = try FileHandle(forWritingTo: url)
    defer { try? handle.close() }
    let offset = try handle.seekToEnd()
    do {
      let encoder = JSONEncoder()
      var data = Data()
      // The header is only appended once, and is committed with the first batch.
      if offset == 0 {
        data.append(try encoder.encode(TrackingEvent(kind: "start", time: started)))
        data.append(0x0a)
      }
      for event in events { data.append(try encoder.encode(event)); data.append(0x0a) }
      data.append(try encoder.encode(TrackingEvent(kind: "checkpoint", time: summary.lastSaved ?? started)))
      data.append(0x0a)
      try handle.write(contentsOf: data)
      try handle.synchronize()
    } catch {
      try? handle.truncate(atOffset: offset)
      throw error
    }
    // The journal is authoritative if an atomic derived-summary write fails.
    try? JSONEncoder().encode(summary).write(to: directory.appendingPathComponent("summary.json"), options: .atomic)
  }
  func load(_ id: String, repair: Bool = false) throws -> TrackingEngine {
    let url = try folder(id).appendingPathComponent("events.jsonl")
    let data = try Data(contentsOf: url)
    var decoded: [TrackingEvent] = []
    var committed = 0, offset = 0, committedBytes = 0
    let decoder = JSONDecoder()
    // split retains the empty last line so a truncated JSON record is detectable.
    for line in data.split(separator: 0x0a, omittingEmptySubsequences: false) {
      if line.isEmpty { break }
      guard let event = try? decoder.decode(TrackingEvent.self, from: Data(line)) else { break }
      decoded.append(event); offset += line.count + 1
      if event.kind == "checkpoint", offset <= data.count { committed = decoded.count; committedBytes = offset }
    }
    guard committed > 0, let start = decoded.first, start.kind == "start" else {
      throw NSError(domain: "TrackingStore", code: 2, userInfo: [NSLocalizedDescriptionKey: "저장된 기록을 읽을 수 없어요. 원본은 보존했습니다."])
    }
    let engine = TrackingEngine(id: id, started: start.time)
    for event in decoded.prefix(committed).dropFirst() { engine.apply(event) }
    if committedBytes < data.count {
      engine.errors.append("uncommittedOrDamagedTail")
      if repair {
        let file = try FileHandle(forWritingTo: url); defer { try? file.close() }
        try file.truncate(atOffset: UInt64(committedBytes)); try file.synchronize()
      }
    }
    return engine
  }
  func ids() throws -> [String] {
    try FileManager.default.contentsOfDirectory(at: root, includingPropertiesForKeys: nil)
      .map(\.lastPathComponent).filter { UUID(uuidString: $0) != nil }
  }
  func deletedIDs() -> [String] {
    (try? JSONDecoder().decode([String].self, from: Data(contentsOf: root.appendingPathComponent("deleted.json")))) ?? []
  }
  func delete(_ id: String) throws {
    let directory = try folder(id)
    // Keep a durable deletion marker so delayed Watch samples never resurrect
    // a deleted run. This carries no coordinates or sensor values.
    let prior = deletedIDs()
    let ids = Array(Set(prior + [id]))
    try JSONEncoder().encode(ids).write(to: root.appendingPathComponent("deleted.json"), options: .atomic)
    do { try FileManager.default.removeItem(at: directory) } catch {
      try? JSONEncoder().encode(prior).write(to: root.appendingPathComponent("deleted.json"), options: .atomic)
      throw error
    }
  }
}
