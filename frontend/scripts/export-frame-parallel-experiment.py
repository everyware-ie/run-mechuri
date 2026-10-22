# Local experiment only. Generate a temporary module source; never ship its flags/entry point.
# python3 frontend/scripts/export-frame-parallel-experiment.py --source <clean-module.swift> --output <temporary-module.swift>
import argparse
from pathlib import Path
parser = argparse.ArgumentParser()
parser.add_argument('--source', required=True)
parser.add_argument('--output', required=True)
args = parser.parse_args()
source = Path(args.source)
output = Path(args.output)
if source.resolve() == output.resolve():
    parser.error('Output must be separate from the original module')
s = source.read_text()
if 'class FrameSlot' in s or 'runPreparationBenchmark()' in s:
    parser.error('Source already contains an experiment')
s=s.replace('import UIKit\n', 'import UIKit\nimport Darwin\n')
s=s.replace('  private func writeClip(\n', '''  private final class FrameSlot {
    var buffer: CVPixelBuffer?
    var error: Error?
    var rasterSeconds = 0.0
    var copySeconds = 0.0
  }

  private func writeClip(
''')
s=s.replace('      var completedFrame: CVPixelBuffer?\n', '''      let parallel = ProcessInfo.processInfo.arguments.contains("--parallel-frames")
      let lanes = parallel ? (0..<2).map { _ in UIGraphicsImageRenderer(size: CGSize(width: ClipSpec.width, height: ClipSpec.height)) } : []
      var slots: [FrameSlot] = []
      var completedFrame: CVPixelBuffer?
''')
s=s.replace('          let pixelBuffer: CVPixelBuffer\n', '''          if parallel && completedFrame == nil && frameIndex % 2 == 0 {
            let count = min(2, ClipSpec.drawFrames + 1 - frameIndex)
            slots = (0..<count).map { _ in FrameSlot() }
            // Each lane owns its renderer and slot. The barrier precedes all reads and ordered appends.
            let batch = slots
            DispatchQueue.concurrentPerform(iterations: count) { lane in
              autoreleasepool {
                do {
                  try job.checkCancellation()
                  let started = CFAbsoluteTimeGetCurrent()
                  let image = self.drawFrame(
                    preset: preset, background: preparedBackground, projectedPoints: projectedPoints,
                    cumulativeDistances: cumulativeDistances, totalDistance: totalDistance,
                    progressFraction: min(1, Double(frameIndex + lane) / Double(ClipSpec.drawFrames)),
                    stamp: stamp, renderer: lanes[lane]
                  )
                  batch[lane].rasterSeconds = CFAbsoluteTimeGetCurrent() - started
                  try job.checkCancellation()
                  let copyStart = CFAbsoluteTimeGetCurrent()
                  guard let buffer = self.pixelBuffer(from: image, pool: adaptor.pixelBufferPool) else {
                    throw RouteRendererError.pixelBufferPoolMissing
                  }
                  batch[lane].buffer = buffer
                  batch[lane].copySeconds = CFAbsoluteTimeGetCurrent() - copyStart
                } catch { batch[lane].error = error }
              }
            }
            for slot in slots { if let error = slot.error { throw error } }
          }
          let pixelBuffer: CVPixelBuffer
''')
s=s.replace('            pixelBuffer = cached\n          } else {', '''            pixelBuffer = cached
          } else if parallel {
            let slot = slots[frameIndex % 2]
            guard let buffer = slot.buffer else { throw RouteRendererError.encodingFailed }
            pixelBuffer = buffer
            slot.buffer = nil
            rasterSeconds += slot.rasterSeconds
            copySeconds += slot.copySeconds
            renderedFrames += 1
            if frameIndex == ClipSpec.drawFrames { completedFrame = buffer }
          } else {''')
s=s.replace('            rasterSeconds += CFAbsoluteTimeGetCurrent() - rasterStart', '''            if frameIndex == 0, let cg = image.cgImage {
              NSLog("[frame-format] bits=%d pixel=%d space=%@", cg.bitsPerComponent, cg.bitsPerPixel, String(describing: cg.colorSpace))
            }
            rasterSeconds += CFAbsoluteTimeGetCurrent() - rasterStart''')
s=s.replace('      NSLog("[encoding-performance]', '''      var info = task_vm_info_data_t()
      var count = mach_msg_type_number_t(MemoryLayout<task_vm_info_data_t>.size / MemoryLayout<integer_t>.size)
      let status = withUnsafeMutablePointer(to: &info) { ptr in
        ptr.withMemoryRebound(to: integer_t.self, capacity: Int(count)) {
          task_info(mach_task_self_, task_flavor_t(TASK_VM_INFO), $0, &count)
        }
      }
      NSLog("[frame-memory] parallel=%d status=%d residentPeakMB=%.1f footprintMB=%.1f", parallel ? 1 : 0, status, Double(info.resident_size_peak) / 1048576, Double(info.phys_footprint) / 1048576)
      NSLog("[encoding-performance]''')
b=Path(__file__).with_name('export-preparation-benchmark.swift').read_text().replace('0..<3','0..<1')
s+='\n'+b
output.write_text(s)
