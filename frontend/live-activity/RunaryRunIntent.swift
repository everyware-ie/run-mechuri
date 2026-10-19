import AppIntents
#if !RUNARY_WIDGET_EXTENSION
internal import RunTracking
#endif

@available(iOS 17.0, *)
struct RunaryRunIntent: LiveActivityIntent {
  static var title: LocalizedStringResource = "러닝 제어"
  static var isDiscoverable: Bool = false
  static var openAppWhenRun: Bool = false
  @Parameter(title: "동작") var action: String
  @Parameter(title: "기록") var runID: String
  @Parameter(title: "상태") var revision: String
  @Parameter(title: "종료 확인") var confirmation: String

  init() { action = ""; runID = ""; revision = ""; confirmation = "" }
  init(_ action: String, runID: String, revision: String, confirmation: String? = nil) {
    self.action = action; self.runID = runID; self.revision = revision; self.confirmation = confirmation ?? ""
  }
  func perform() async throws -> some IntentResult {
    #if RUNARY_WIDGET_EXTENSION
    // LiveActivityIntent is also compiled into the app, where iOS executes it.
    // Never pretend success if the system fails to route to that process.
    try RunaryIntentError.requireHost()
    #else
    try await RunaryLiveControl.perform(action: action, runID: runID, revision: revision,
      confirmation: confirmation.isEmpty ? nil : confirmation)
    #endif
    return .result()
  }
}

enum RunaryIntentError: LocalizedError {
  case hostRequired
  static func requireHost() throws { throw Self.hostRequired }
  var errorDescription: String? { "앱에서 러닝 상태를 확인해 주세요." }
}
