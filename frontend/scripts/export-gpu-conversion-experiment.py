"""Generate a foreground GPU conversion experiment from the parallel harness source."""
import argparse
from pathlib import Path
p = argparse.ArgumentParser()
p.add_argument('--source', required=True)
p.add_argument('--output', required=True)
a = p.parse_args()
if Path(a.source).resolve() == Path(a.output).resolve():
    p.error('Output must be separate')
s = Path(a.source).read_text()
def replace(old, new):
    global s
    if s.count(old) != 1:
        raise ValueError(f'Unexpected anchor count: {old[:70]}')
    s = s.replace(old, new)
replace('import UIKit\n', 'import UIKit\nimport CoreImage\nimport Metal\n')
replace('  private final class FrameSlot {', '  private var gpuConversionContext: CIContext?\n\n  private final class FrameSlot {')
replace('    let pixelBufferAttributes: [String: Any] = [', '''    let useGPU = ProcessInfo.processInfo.arguments.contains("--gpu-conversion")
    guard !useGPU || !ProcessInfo.processInfo.arguments.contains("--parallel-frames") else { throw RouteRendererError.encodingFailed }
    if useGPU {
      guard let device = MTLCreateSystemDefaultDevice() else { throw RouteRendererError.encodingFailed }
      gpuConversionContext = CIContext(mtlDevice: device, options: [.cacheIntermediates: false, .workingColorSpace: CGColorSpace(name: CGColorSpace.sRGB)!])
      NSLog("[gpu-conversion] device=%@", device.name)
      if #available(iOS 26.0, *) {
        NSLog("[gpu-conversion] backgroundSupportedForCurrentApp=%d", BGTaskScheduler.supportedResources.contains(.gpu) ? 1 : 0)
      }
    }
    defer { gpuConversionContext = nil }
    var pixelBufferAttributes: [String: Any] = [''')
replace('      kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32ARGB,', '      kCVPixelBufferPixelFormatTypeKey as String: useGPU ? kCVPixelFormatType_32BGRA : kCVPixelFormatType_32ARGB,')
replace('    let adaptor = AVAssetWriterInputPixelBufferAdaptor(', '''    if useGPU {
      pixelBufferAttributes[kCVPixelBufferMetalCompatibilityKey as String] = true
      pixelBufferAttributes[kCVPixelBufferIOSurfacePropertiesKey as String] = [:] as [String: Any]
    }
    let adaptor = AVAssetWriterInputPixelBufferAdaptor(''')
replace('    CVPixelBufferLockBaseAddress(pixelBuffer, [])', '''    if let gpuContext = gpuConversionContext {
      guard let cgImage = image.cgImage else { return nil }
      let input = CIImage(cgImage: cgImage)
      let scaled = input.applyingFilter("CILanczosScaleTransform", parameters: [
        kCIInputScaleKey: CGFloat(ClipSpec.height) / CGFloat(cgImage.height),
        kCIInputAspectRatioKey: (CGFloat(ClipSpec.width) / CGFloat(cgImage.width)) / (CGFloat(ClipSpec.height) / CGFloat(cgImage.height))
      ])
      gpuContext.render(scaled, to: pixelBuffer,
                        bounds: CGRect(x: 0, y: 0, width: ClipSpec.width, height: ClipSpec.height),
                        colorSpace: CGColorSpace(name: CGColorSpace.sRGB))
      return pixelBuffer
    }
    CVPixelBufferLockBaseAddress(pixelBuffer, [])''')
Path(a.output).write_text(s)
