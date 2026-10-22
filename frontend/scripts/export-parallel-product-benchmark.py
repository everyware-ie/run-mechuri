"""Create a temporary validation source; do not ship CLI controls or the harness.

Use current product source. --serial-frames forces one frame per batch;
--fallback-test switches to serial after four batches, in this copy only.
--raw-frame-hashes compares pre-encoder RGB; --keep-awake preserves the test session.
"""
import argparse
from pathlib import Path
p = argparse.ArgumentParser()
p.add_argument('--source', required=True)
p.add_argument('--output', required=True)
a = p.parse_args()
source, output = Path(a.source), Path(a.output)
if source.resolve() == output.resolve():
    p.error('Output must be separate')
s = source.read_text()
if 'runPreparationBenchmark()' in s:
    p.error('Source already has a harness')
if 'private final class ParallelRenderBudget' not in s:
    p.error('Expected current parallel product source')
if 'private final class ParallelRenderBudget' in s:
    s = s.replace('  private var serialOnly = false', '  private var serialOnly = false\n  private var checks = 0', 1)
    s = s.replace('  var allowsParallel: Bool {', '''  var allowsParallel: Bool {
    checks += 1
    if ProcessInfo.processInfo.arguments.contains("--serial-frames") { useSerial() }
    if ProcessInfo.processInfo.arguments.contains("--fallback-test"), checks > 4 { useSerial() }''', 1)
# This control changes scheduling only. Memory and timing are logged for either implementation.
s = s.replace('import UIKit\n', 'import UIKit\nimport Darwin\nimport CryptoKit\n', 1)
s = s.replace('      NSLog("[encoding-performance]', '''      var info = task_vm_info_data_t()
      var memoryCount = mach_msg_type_number_t(MemoryLayout<task_vm_info_data_t>.size / MemoryLayout<integer_t>.size)
      let memoryStatus = withUnsafeMutablePointer(to: &info) { ptr in
        ptr.withMemoryRebound(to: integer_t.self, capacity: Int(memoryCount)) {
          task_info(mach_task_self_, task_flavor_t(TASK_VM_INFO), $0, &memoryCount)
        }
      }
      NSLog("[product-memory] status=%d residentPeakMiB=%.1f footprintMiB=%.1f", memoryStatus,
        Double(info.resident_size_peak) / 1048576, Double(info.phys_footprint) / 1048576)
      NSLog("[encoding-performance]''', 1)

# Compare defined RGB bytes before the unchanged encoder, omitting unused alpha and row padding.
s = s.replace('  private func writeClip(', '''  private func frameDigest(_ buffer: CVPixelBuffer) -> String {
    CVPixelBufferLockBaseAddress(buffer, .readOnly)
    defer { CVPixelBufferUnlockBaseAddress(buffer, .readOnly) }
    let width = CVPixelBufferGetWidth(buffer), height = CVPixelBufferGetHeight(buffer)
    let stride = CVPixelBufferGetBytesPerRow(buffer)
    let base = CVPixelBufferGetBaseAddress(buffer)!
    var data = Data(count: width * height * 4)
    data.withUnsafeMutableBytes { bytes in
      let target = bytes.baseAddress!
      for row in 0..<height { memcpy(target.advanced(by: row * width * 4), base.advanced(by: row * stride), width * 4) }
      let pixels = bytes.bindMemory(to: UInt32.self)
      for index in pixels.indices { pixels[index] &= 0xffffff00 }
    }
    return SHA256.hash(data: data).map { String(format: "%02x", $0) }.joined()
  }

''' + '  private func writeClip(', 1)
s = s.replace('            guard adaptor.append(buffer,', '''            if ProcessInfo.processInfo.arguments.contains("--raw-frame-hashes") {
              NSLog("[raw-frame] index=%d hash=%@", index, self.frameDigest(buffer))
            }
            guard adaptor.append(buffer,''', 1)
b = Path(__file__).with_name('export-preparation-benchmark.swift').read_text().replace('0..<3', '0..<1')
b = b.replace('              options.preset = "light-runner"', '''              options.preset = ProcessInfo.processInfo.arguments.first(where: { $0.hasPrefix("--preset=") })?.replacingOccurrences(of: "--preset=", with: "") ?? "light-runner"''')
b = b.replace('              options.stampLayout = "glass"', '''              options.stampLayout = ProcessInfo.processInfo.arguments.first(where: { $0.hasPrefix("--layout=") })?.replacingOccurrences(of: "--layout=", with: "") ?? "glass"
              if ProcessInfo.processInfo.arguments.contains("--video-test") {
                options.backgroundVideoPath = root.appendingPathComponent("synthetic-video.mp4").path
              }''')
b = b.replace('              let result = try module.render(options, job: job)', '''              if ProcessInfo.processInfo.arguments.contains("--cancel-test") {
                DispatchQueue.global().asyncAfter(deadline: .now() + 2) { job.cancel() }
                do {
                  _ = try module.render(options, job: job)
                  throw RouteRendererError.encodingFailed
                } catch RouteRendererError.cancelled {
                  guard !FileManager.default.fileExists(atPath: module.outputURL(named: options.outputFileName).path) else {
                    throw RouteRendererError.encodingFailed
                  }
                  NSLog("[product-benchmark] CANCELLED cleanup=pass")
                  DispatchQueue.main.async { UIApplication.shared.isIdleTimerDisabled = false }
                  return
                }
              }
              let result = try module.render(options, job: job)''')
# Exercise the real background lease on demand. File copy plays the role of native persistence ACK.
b = b.replace('              let result = try module.render(options, job: job)', '              if ProcessInfo.processInfo.arguments.contains("--with-lease") {\n                let ready = DispatchSemaphore(value: 0)\n                DispatchQueue.main.sync {\n                  let lease = RenderBackgroundLease(job: job)\n                  module.leases[job.id] = lease\n                  lease.onFinish = { [weak module] in module?.leases[job.id] = nil }\n                  lease.start { ready.signal() }\n                }\n                guard ready.wait(timeout: .now() + 10) == .success else { throw RouteRendererError.backgroundExpired }\n              }\n              let result = try module.render(options, job: job)')
b = b.replace('              NSLog("[preparation-benchmark] end', '              if ProcessInfo.processInfo.arguments.contains("--with-lease") {\n                DispatchQueue.main.async { module.leases[job.id]?.finish(success: true) }\n              }\n              NSLog("[preparation-benchmark] end')
# Optionally let the real React app run while the same native renderer executes.
# This exercises co-resident UI/JS memory; it is not the JS share->storage E2E flow.
b = b.replace('UIApplication.shared.isIdleTimerDisabled = false',
  'UIApplication.shared.isIdleTimerDisabled = ProcessInfo.processInfo.arguments.contains("--keep-awake")')
s += '\n' + b
output.write_text(s)
