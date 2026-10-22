import ActivityKit
import SwiftUI
import WidgetKit

private let accent = Color(red: 1, green: 87 / 255, blue: 43 / 255)
private let muted = Color(red: 170 / 255, green: 178 / 255, blue: 187 / 255)
private let canvas = Color(red: 17 / 255, green: 22 / 255, blue: 27 / 255)

@main
struct RunaryWidgets: WidgetBundle {
  var body: some Widget { RunaryLiveWidget() }
}

struct RunaryLiveWidget: Widget {
  var body: some WidgetConfiguration {
    ActivityConfiguration(for: RunaryLiveAttributes.self) { context in
      RunaryLiveCard(state: context.state, runID: context.attributes.runID, stale: context.isStale)
        .activityBackgroundTint(canvas)
        .activitySystemActionForegroundColor(.white)
        .widgetURL(runURL(context.attributes.runID))
    } dynamicIsland: { context in
      DynamicIsland {
        DynamicIslandExpandedRegion(.bottom) {
          RunaryLiveCard(state: context.state, runID: context.attributes.runID, stale: context.isStale)
        }
      } compactLeading: {
        Image(systemName: context.state.running ? "figure.run" : "pause.fill").foregroundStyle(accent)
          .accessibilityLabel("Runary")
      } compactTrailing: {
        Text(context.state.distanceText).monospacedDigit().privacySensitive()
          .accessibilityLabel("거리 \(context.state.distanceText) 킬로미터")
      } minimal: {
        HStack(spacing: 2) {
          Image(systemName: context.state.running ? "figure.run" : "pause.fill").foregroundStyle(accent)
          Text(context.state.distanceText).monospacedDigit().privacySensitive()
        }.font(.system(size: 10, weight: .semibold)).lineLimit(1).minimumScaleFactor(0.5)
          .accessibilityLabel("Runary 거리 \(context.state.distanceText) 킬로미터")
      }
      .widgetURL(runURL(context.attributes.runID))
      .keylineTint(accent)
    }
  }
}

private func runURL(_ id: String) -> URL {
  // Run IDs originate in the native engine. Never encode a control action.
  URL(string: "frontend://internal-live-run/\(id.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? "")")!
}

struct RunaryLiveCard: View {
  let state: RunaryLiveState
  let runID: String
  let stale: Bool
  @ScaledMetric(relativeTo: .largeTitle) private var distanceSize = 50
  @ScaledMetric(relativeTo: .headline) private var metricSize = 19

  private var label: String {
    if state.storageError || state.phase == "saving" { return "저장 확인 필요" }
    if state.actionError { return "앱에서 확인" }
    if stale { return "업데이트 확인" }
    switch state.phase {
    case "running": return "러닝 중"
    case "paused": return "일시정지 중"
    default: return "중단됨"
    }
  }
  var body: some View {
    VStack(alignment: .leading, spacing: 8) {
      HStack {
        HStack(spacing: 5) { Circle().fill(accent).frame(width: 5, height: 5); Text("RUNARY").tracking(1.5) }
        Spacer(minLength: 8)
        Text(label).foregroundStyle(state.phase == "paused" ? accent : muted)
      }.font(.system(size: 11, weight: .semibold))
      if state.confirmation != nil && state.controllable {
        confirmation
      } else {
        HStack(alignment: .center, spacing: 12) {
          HStack(alignment: .firstTextBaseline, spacing: 4) {
            Text(state.distanceText).font(.system(size: min(distanceSize, 72), weight: .bold, design: .rounded))
              .monospacedDigit()
            Text("km").font(.system(size: 17)).foregroundStyle(muted).fixedSize(horizontal: true, vertical: false)
          }.lineLimit(1).minimumScaleFactor(0.4).privacySensitive()
          Spacer(minLength: 0)
          controls
        }.frame(minHeight: 54)
        Rectangle().fill(.white.opacity(0.1)).frame(height: 0.5)
        HStack(alignment: .top, spacing: 12) {
          metric("시간") { time }
          metric("평균 페이스") {
            metricValue(state.paceText, unit: "/km")
          }
          metric("심박") {
            HStack(alignment: .firstTextBaseline, spacing: 4) {
              Image(systemName: "heart").font(.system(size: 13, weight: .medium)).foregroundStyle(accent)
              metricValue(stale ? "-" : state.heart(at: Date().timeIntervalSince1970).map { String(Int($0.rounded())) } ?? "-", unit: "bpm")
            }
          }
        }.privacySensitive()
      }
    }
    .foregroundStyle(.white)
    .padding(.horizontal, 14).padding(.vertical, 10)
    .frame(minHeight: 160)
  }

  @ViewBuilder private var controls: some View {
    HStack(spacing: 8) {
      if #available(iOS 17.0, *), state.controllable {
        Button(intent: intent(state.phase == "running" ? "pause" : "resume")) {
          roundIcon(state.phase == "running" ? "pause.fill" : "play.fill", primary: state.phase == "paused")
        }.buttonStyle(.plain).accessibilityLabel(state.phase == "running" ? "러닝 일시정지" : "러닝 재개")
        Button(intent: intent("askFinish")) { roundIcon("stop.fill", outline: true) }
          .buttonStyle(.plain).accessibilityLabel("러닝 종료")
      } else {
        Link(destination: runURL(runID)) { roundIcon("arrow.up.right") }
          .accessibilityLabel("앱에서 러닝 확인")
      }
    }.fixedSize()
  }
  private func roundIcon(_ name: String, primary: Bool = false, outline: Bool = false) -> some View {
    Image(systemName: name).font(.system(size: 17, weight: .semibold))
      .foregroundStyle(primary ? canvas : .white)
      .frame(width: 44, height: 44)
      .background(primary ? accent : Color.white.opacity(outline ? 0.02 : 0.09), in: Circle())
      .overlay { if outline { Circle().stroke(.white.opacity(0.2), lineWidth: 1) } }
      .contentShape(Circle())
  }
  private func metric<V: View>(_ title: String, @ViewBuilder value: () -> V) -> some View {
    VStack(alignment: .leading, spacing: 4) {
      Text(title).font(.system(size: 11, weight: .medium)).foregroundStyle(muted)
      value().font(.system(size: min(metricSize, 28), weight: .semibold, design: .rounded)).monospacedDigit()
        .lineLimit(1).minimumScaleFactor(0.45)
    }.frame(maxWidth: .infinity, alignment: .leading)
  }
  private func metricValue(_ value: String, unit: String) -> some View {
    HStack(alignment: .firstTextBaseline, spacing: 3) {
      Text(value)
      Text(unit).font(.system(size: 10)).foregroundStyle(muted).fixedSize(horizontal: true, vertical: false)
    }
  }
  @ViewBuilder private var time: some View {
    if state.running && !stale {
      let start = Date(timeIntervalSince1970: state.snapshotAt - state.duration)
      let end = Date(timeIntervalSince1970: state.staleAt)
      Text(timerInterval: start...end, countsDown: false, showsHours: state.duration >= 3600)
        .multilineTextAlignment(.leading)
    } else { Text(RunaryLiveState.timeText(state.duration)) }
  }
  @ViewBuilder private var confirmation: some View {
    Text("러닝을 종료할까요?").font(.system(size: 19, weight: .bold))
    Text("\(state.distanceText) km  ·  \(RunaryLiveState.timeText(state.duration))")
      .font(.system(size: 14)).foregroundStyle(muted).privacySensitive()
    if #available(iOS 17.0, *) {
      HStack(spacing: 10) {
        Button(intent: intent("cancelFinish")) { Text("돌아가기").frame(maxWidth: .infinity, minHeight: 44) }
          .tint(.white.opacity(0.12))
        Button(intent: intent("finish")) { Text("종료·저장").frame(maxWidth: .infinity, minHeight: 44) }
          .tint(accent)
      }.buttonStyle(.borderedProminent).font(.system(size: 14, weight: .semibold))
    }
  }
  @available(iOS 17.0, *) private func intent(_ action: String) -> RunaryRunIntent {
    RunaryRunIntent(action, runID: runID, revision: state.revision, confirmation: state.confirmation)
  }
}
