// Isolated benchmark entry point, appended to RouteRendererModule.swift only for a local build.
// Never register this as an Expo API or include EXPORT_PREPARATION_BENCHMARK in release delivery.
#if EXPORT_PREPARATION_BENCHMARK
import CoreText
extension RouteRendererModule {
  public static func runPreparationBenchmark() {
    if let files = FileManager.default.enumerator(at: Bundle.main.bundleURL, includingPropertiesForKeys: nil) {
      for case let file as URL in files where ["ttf", "otf"].contains(file.pathExtension.lowercased()) {
        CTFontManagerRegisterFontsForURL(file as CFURL, .process, nil)
      }
    }
    for name in ["JetBrainsMono-Bold", "JetBrainsMono-Medium", "SpaceGrotesk-Bold", "NotoSansKR-Bold", "NotoSansKR-Medium"] {
      guard UIFont(name: name, size: 20) != nil else {
        NSLog("[preparation-benchmark] FAILED missing font %@", name)
        return
      }
    }
    let context = AppContext()
    let module = RouteRendererModule(appContext: context)
    UIApplication.shared.isIdleTimerDisabled = true
    module.renderQueue.async {
      // Retain the otherwise weak module context for the experiment.
      withExtendedLifetime(context) {
        do {
          let root = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("export-preparation-benchmark", isDirectory: true)
          try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
          let format = UIGraphicsImageRendererFormat()
          format.scale = 1
          let fixture = UIGraphicsImageRenderer(size: CGSize(width: 4032, height: 3024), format: format).image { renderer in
            let colors = [UIColor(red: 0.06, green: 0.16, blue: 0.35, alpha: 1).cgColor,
                          UIColor(red: 0.95, green: 0.46, blue: 0.12, alpha: 1).cgColor] as CFArray
            let gradient = CGGradient(colorsSpace: CGColorSpaceCreateDeviceRGB(), colors: colors, locations: [0, 1])!
            renderer.cgContext.drawLinearGradient(gradient, start: .zero,
              end: CGPoint(x: 4032, y: 3024), options: [])
          }
          let photo = root.appendingPathComponent("synthetic-background.jpg")
          try fixture.jpegData(compressionQuality: 0.95)!.write(to: photo)
          for run in 0..<3 {
            try autoreleasepool {
              var options = RenderClipOptionsInput()
              options.backgroundImagePath = photo.path
              options.outputFileName = "preparation-baseline-\(run)"
              options.points = (0..<1000).map { i in
                let t = Double(i) / 999 * Double.pi * 2
                var point = RoutePointInput()
                point.latitude = 37 + sin(t) * 0.01
                point.longitude = 127 + cos(t) * 0.012
                return point
              }
              options.preset = "light-runner"
              options.smooth = 40
              options.corner = 30
              options.stampMode = "always"
              options.stampLayout = "glass"
              options.stampY = 0.28
              options.stampItems.date = true
              options.stampItems.place = true
              options.caption = "오늘도 한 걸음 더"
              options.captionLines = ["오늘도 한 걸음 더"]
              options.placeName = "테스트 공원"
              options.runDate = "2026-09-28T09:00:00.000Z"
              options.distanceMeters = 6010
              options.durationSeconds = 2516
              options.averagePaceSecPerKm = 418.6
              options.paceSamples = (0...270).map { 418.6 + sin(Double($0) / 18) * 30 }
              options.averageHeartRate = 156
              NSLog("[preparation-benchmark] begin run=%d thermal=%ld lowPower=%d os=%@", run,
                    ProcessInfo.processInfo.thermalState.rawValue, ProcessInfo.processInfo.isLowPowerModeEnabled ? 1 : 0,
                    ProcessInfo.processInfo.operatingSystemVersionString)
              let job = module.replaceActiveJob(outputFileName: options.outputFileName)
              let result = try module.render(options, job: job)
              let destination = root.appendingPathComponent("baseline-\(run).mp4")
              if FileManager.default.fileExists(atPath: destination.path) { try FileManager.default.removeItem(at: destination) }
              try FileManager.default.moveItem(at: URL(string: result.outputPath)!, to: destination)
              NSLog("[preparation-benchmark] end run=%d thermal=%ld", run, ProcessInfo.processInfo.thermalState.rawValue)
            }
          }
          NSLog("[preparation-benchmark] COMPLETE")
          DispatchQueue.main.async { UIApplication.shared.isIdleTimerDisabled = false }
        } catch {
          NSLog("[preparation-benchmark] FAILED %@", error.localizedDescription)
          DispatchQueue.main.async { UIApplication.shared.isIdleTimerDisabled = false }
        }
      }
    }
  }
}
#endif
