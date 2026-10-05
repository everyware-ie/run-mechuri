import ExpoModulesCore
import UIKit

public final class RunTrackingModule: Module {
  public func definition() -> ModuleDefinition {
    Name("RunTracking")
    Constant("enabled") { TrackingManager.enabled }
    Constant("appVersion") { Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "?" }
    Constant("buildVersion") { Bundle.main.object(forInfoDictionaryKey: "CFBundleVersion") as? String ?? "?" }
    AsyncFunction("copySummary") { (text: String) throws in
      guard TrackingManager.enabled else { throw NSError(domain: "RunaryTracking", code: 1) }
      UIPasteboard.general.string = text
    }.runOnQueue(.main)
    AsyncFunction("state") { TrackingManager.shared.snapshot() }.runOnQueue(.main)
    AsyncFunction("mapSnapshot") { (revision: String?, after: Int) throws -> [String: Any] in
      try TrackingManager.shared.mapSnapshot(revision, after: after)
    }.runOnQueue(.main)
    AsyncFunction("prepare") { () throws -> [String: Any] in
      try TrackingManager.shared.prepare(); return TrackingManager.shared.snapshot()
    }.runOnQueue(.main)
    AsyncFunction("cancelPreparation") { TrackingManager.shared.cancelPreparation() }.runOnQueue(.main)
    AsyncFunction("start") { (watch: Bool) throws -> [String: Any] in
      try TrackingManager.shared.start(watch: watch); return TrackingManager.shared.snapshot()
    }.runOnQueue(.main)
    AsyncFunction("pause") { () throws in try TrackingManager.shared.pause() }.runOnQueue(.main)
    AsyncFunction("resume") { () throws in try TrackingManager.shared.resume() }.runOnQueue(.main)
    AsyncFunction("finish") { () throws in try TrackingManager.shared.finish() }.runOnQueue(.main)
    AsyncFunction("retrySave") { () throws in try TrackingManager.shared.retrySave() }.runOnQueue(.main)
    AsyncFunction("keepSaved") { () throws in try TrackingManager.shared.keepSaved() }.runOnQueue(.main)
    AsyncFunction("recover") { (id: String) throws in try TrackingManager.shared.recover(id) }.runOnQueue(.main)
    AsyncFunction("records") { () throws -> [String: Any] in try TrackingManager.shared.records() }.runOnQueue(.main)
    AsyncFunction("detail") { (id: String) throws -> [String: Any] in try TrackingManager.shared.detail(id) }.runOnQueue(.main)
    AsyncFunction("deleteRecord") { (id: String) throws in try TrackingManager.shared.delete(id) }.runOnQueue(.main)
    AsyncFunction("feedback") { (id: String, text: String) throws in try TrackingManager.shared.feedback(id, text: text) }.runOnQueue(.main)
    AsyncFunction("connectWatch") { () throws in try TrackingManager.shared.connectWatch() }.runOnQueue(.main)
  }
}
public final class RunTrackingAppDelegate: ExpoAppDelegateSubscriber {
  public func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil) -> Bool {
    if TrackingManager.enabled { _ = TrackingManager.shared }
    return true
  }
}
