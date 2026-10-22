"""Generate a local static-reuse experiment from the parallel experiment source.
Parallel mode must stay disabled; the mutable per-clip text cache is serial only.
"""
import argparse
from pathlib import Path
p = argparse.ArgumentParser()
p.add_argument('--source', required=True)
p.add_argument('--output', required=True)
a = p.parse_args()
if Path(a.source).resolve() == Path(a.output).resolve():
    p.error('Keep the input source separate')
s = Path(a.source).read_text()
def replace(old, new, count=1):
    global s
    if s.count(old) != count:
        raise ValueError(f'Unexpected anchor count: {old[:70]}')
    s = s.replace(old, new)
replace('  private func drawFrame(\n', '''  private final class StaticFrameCache {
    var images: [String: UIImage] = [:]
    var bytes = 0
    var hits = 0
    var misses = 0
    var fixedTexts = Set<String>()
  }
  private var staticFrameCache: StaticFrameCache?

  private func drawFrame(
''')
for width in [5, 10]:
    line=f'        self.strokePath(projectedPoints, color: UIColor.white.withAlphaComponent(0.2), width: {width})'
    replace(line, f'        if self.staticFrameCache == nil {{\n  {line}\n        }}')
replace('      let preparedBackground = prepareBackground(background)', '''      let reuse = ProcessInfo.processInfo.arguments.contains("--static-reuse")
      guard !reuse || !ProcessInfo.processInfo.arguments.contains("--parallel-frames") else {
        throw RouteRendererError.encodingFailed
      }
      staticFrameCache = reuse ? StaticFrameCache() : nil
      defer { staticFrameCache = nil }
      if let cache = staticFrameCache {
        cache.fixedTexts = Set(["DIST", "TIME", "PACE", "BPM", "AVG BPM", "DATE", "PLACE", stamp.placeName, formatStampDate(stamp.runDate)])
        for line in stamp.captionLines ?? stamp.caption.components(separatedBy: "\\n") { cache.fixedTexts.insert(line) }
        if let hr = stamp.averageHeartRate {
          cache.fixedTexts.insert(formatHeartRate(hr, includeUnit: true))
          cache.fixedTexts.insert(formatHeartRate(hr, includeUnit: false))
        }
      }
      var preparedBackground = prepareBackground(background)
      if reuse && preset != .defaultDrawing {
        preparedBackground = autoreleasepool {
          UIGraphicsImageRenderer(size: CGSize(width: ClipSpec.width, height: ClipSpec.height)).image { _ in
            preparedBackground.draw(in: CGRect(x: 0, y: 0, width: ClipSpec.width, height: ClipSpec.height))
            self.strokePath(projectedPoints, color: UIColor.white.withAlphaComponent(0.2), width: preset == .lightRunner ? 5 : 10)
          }
        }
      }''')
replace('      NSLog("[frame-memory]', '''      if let cache = staticFrameCache {
        NSLog("[static-reuse] entries=%d hits=%d misses=%d bytes=%d", cache.images.count, cache.hits, cache.misses, cache.bytes)
      }
      NSLog("[frame-memory]''')
replace('      let topY = origin.y - font.ascender\n', '''      let topY = origin.y - font.ascender
      if let cache = staticFrameCache, cache.fixedTexts.contains(text) {
        // Keep subpixel positioning: integer point bounds preserve the original 3x pixel grid.
        let bounds = CGRect(x: floor(x) - 24, y: floor(topY) - 24,
                            width: ceil(w + x - floor(x)) + 48, height: ceil(font.lineHeight) + 48)
        let key = "\\(text)|\\(font.fontName)|\\(font.pointSize)|\\(x)|\\(topY)|\\(String(describing: (color ?? self.lineWarm).cgColor))|\\(isSoftShadow)"
        if let image = cache.images[key] {
          cache.hits += 1
          image.draw(in: bounds)
          return
        }
        let format = UIGraphicsImageRendererFormat.default()
        let estimatedBytes = Int(ceil(bounds.width * format.scale) * ceil(bounds.height * format.scale)) * 4
        if bounds.width > 0 && bounds.height > 0 && cache.bytes + estimatedBytes <= 16 * 1024 * 1024 {
          let image = UIGraphicsImageRenderer(size: bounds.size, format: format).image { context in
            context.cgContext.translateBy(x: -bounds.minX, y: -bounds.minY)
            context.cgContext.setShadow(offset: .zero, blur: 6, color: stampShadowColor.cgColor)
            (text as NSString).draw(at: CGPoint(x: x, y: topY), withAttributes: attrs)
          }
          let actualBytes = image.cgImage.map { $0.bytesPerRow * $0.height } ?? estimatedBytes
          if cache.bytes + actualBytes <= 16 * 1024 * 1024 {
            cache.images[key] = image
            cache.bytes += actualBytes
          }
          cache.misses += 1
          image.draw(in: bounds)
          return
        }
      }
''')
Path(a.output).write_text(s)
