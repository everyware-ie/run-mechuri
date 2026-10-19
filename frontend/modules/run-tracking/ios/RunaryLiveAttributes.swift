import ActivityKit

@available(iOS 16.4, *)
public struct RunaryLiveAttributes: ActivityAttributes {
  public typealias ContentState = RunaryLiveState
  public var runID: String
  public init(runID: String) { self.runID = runID }
}
