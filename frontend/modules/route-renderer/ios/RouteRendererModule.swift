import AVFoundation
import CoreGraphics
import ExpoModulesCore
import UIKit

// FRD: docs/specs/frd/route-rendering.md, docs/specs/frd/result-editing.md
//
// 접근: 실시간 화면 캡처가 아니라 프레임을 하나씩 오프라인으로 그려
// AVAssetWriter로 인코딩한다 (2026-08-16 mp4 스파이크 테스트에서
// 실시간 캡처가 배경 합성과 함께 무너지는 것을 확인하고 전환하기로 한 방향).
//
// result-editing FRD §4: 렌더러는 초기값(회전0·화면맞춤·가운데)을 정하고,
// 편집은 같은 값을 사용자가 바꾼다. 여기서는 그 "바뀐 값"(transform)을 받아 적용한다.
// 편집 화면의 실시간 미리보기(frontend/src/components/route-preview.tsx, SVG 기반)와
// 같은 투영·변형 순서를 쓴다 — 미리보기와 최종 결과물 모양이 어긋나면 안 되기 때문이다.

// MARK: - 출력 규격 (§9)

private enum ClipSpec {
  static let width = 1080
  static let height = 1920
  static let fps: Int32 = 30
  static let drawSeconds: Double = 9
  static let holdSeconds: Double = 3
  static var drawFrames: Int { Int(drawSeconds) * Int(fps) }
  static var holdFrames: Int { Int(holdSeconds) * Int(fps) }
  static var totalFrames: Int { drawFrames + holdFrames }
  /// §4 프레이밍 제안값: 경로 바깥 여백은 화면 짧은 축 기준 8%.
  static let marginRatio: CGFloat = 0.08
}

struct RoutePointInput: Record {
  @Field var latitude: Double = 0
  @Field var longitude: Double = 0
}

struct RouteTransformInput: Record {
  @Field var x: Double = 0
  @Field var y: Double = 0
  @Field var scale: Double = 1
  @Field var rotationDeg: Double = 0
}

struct RenderClipOptionsInput: Record {
  @Field var points: [RoutePointInput] = []
  @Field var backgroundImagePath: String = ""
  @Field var outputFileName: String = ""
  @Field var preset: String = "default-drawing"
  @Field var transform: RouteTransformInput = RouteTransformInput()
}

struct RenderClipResultPayload: Record {
  @Field var outputPath: String = ""
}

enum RouteRendererError: Error, LocalizedError {
  case notEnoughPoints
  case backgroundImageNotFound
  case writerSetupFailed
  case pixelBufferPoolMissing

  var errorDescription: String? {
    switch self {
    case .notEnoughPoints:
      return "그릴 수 있는 좌표가 2개 미만입니다"
    case .backgroundImageNotFound:
      return "배경 이미지를 불러올 수 없습니다"
    case .writerSetupFailed:
      return "비디오 인코더 초기화에 실패했습니다"
    case .pixelBufferPoolMissing:
      return "프레임 버퍼 풀을 만들지 못했습니다"
    }
  }
}

private enum RoutePreset: String {
  case defaultDrawing = "default-drawing"
  case lightRunner = "light-runner"
  case segmentLighting = "segment-lighting"
}

public class RouteRendererModule: Module {
  public func definition() -> ModuleDefinition {
    Name("RouteRenderer")

    AsyncFunction("renderClip") { (options: RenderClipOptionsInput) async throws -> RenderClipResultPayload in
      guard options.points.count >= 2 else {
        throw RouteRendererError.notEnoughPoints
      }
      guard let background = self.loadImage(path: options.backgroundImagePath) else {
        throw RouteRendererError.backgroundImageNotFound
      }
      let preset = RoutePreset(rawValue: options.preset) ?? .defaultDrawing

      let baseProjected = self.projectPoints(options.points)
      let projected = self.applyTransform(baseProjected, transform: options.transform)
      let cumulativeDistances = self.cumulativeDistances(options.points)
      let totalDistance = cumulativeDistances.last ?? 0

      let outputURL = self.outputURL(named: options.outputFileName)
      try self.writeClip(
        preset: preset,
        projectedPoints: projected,
        cumulativeDistances: cumulativeDistances,
        totalDistance: totalDistance,
        background: background,
        to: outputURL
      )

      var result = RenderClipResultPayload()
      result.outputPath = outputURL.absoluteString
      return result
    }
  }

  // MARK: - 좌표 처리

  /// 위경도를 캔버스 좌표(0..<width, 0..<height)로 투영한다. 렌더러 초기값(§4):
  /// 회전 0(북쪽이 위), 여백 안에 들어오는 최대 크기, 화면 가운데.
  private func projectPoints(_ points: [RoutePointInput]) -> [CGPoint] {
    let lats = points.map { $0.latitude }
    let lons = points.map { $0.longitude }
    let minLat = lats.min()!
    let maxLat = lats.max()!
    let minLon = lons.min()!
    let maxLon = lons.max()!
    let midLat = (minLat + maxLat) / 2

    let lonScale = cos(midLat * .pi / 180)

    let spanX = (maxLon - minLon) * lonScale
    let spanY = maxLat - minLat
    let span = max(spanX, spanY, 0.000001)

    let shortSide = CGFloat(min(ClipSpec.width, ClipSpec.height))
    let usable = shortSide * (1 - ClipSpec.marginRatio * 2)
    let scale = usable / CGFloat(span)

    let centerX = CGFloat(ClipSpec.width) / 2
    let centerY = CGFloat(ClipSpec.height) / 2
    var raw: [CGPoint] = points.map { point in
      let x = (point.longitude - minLon) * lonScale
      let y = maxLat - point.latitude
      return CGPoint(x: x * scale, y: y * scale)
    }
    let rawMinX = raw.map { $0.x }.min()!
    let rawMaxX = raw.map { $0.x }.max()!
    let rawMinY = raw.map { $0.y }.min()!
    let rawMaxY = raw.map { $0.y }.max()!
    let rawCenterX = (rawMinX + rawMaxX) / 2
    let rawCenterY = (rawMinY + rawMaxY) / 2

    raw = raw.map { CGPoint(x: $0.x - rawCenterX + centerX, y: $0.y - rawCenterY + centerY) }
    return raw
  }

  /// result-editing FRD §4: 사용자가 바꾼 크기·위치·회전을 렌더러 초기값 위에 적용한다.
  /// 편집 화면 미리보기(route-preview.tsx)와 같은 순서: 중심 기준 스케일 → 회전 → 이동.
  private func applyTransform(_ points: [CGPoint], transform: RouteTransformInput) -> [CGPoint] {
    let centerX = CGFloat(ClipSpec.width) / 2
    let centerY = CGFloat(ClipSpec.height) / 2
    let rotationRad = CGFloat(transform.rotationDeg) * .pi / 180
    let scale = CGFloat(transform.scale)
    let cosR = cos(rotationRad)
    let sinR = sin(rotationRad)

    return points.map { point in
      let relX = (point.x - centerX) * scale
      let relY = (point.y - centerY) * scale
      let rotatedX = relX * cosR - relY * sinR
      let rotatedY = relX * sinR + relY * cosR
      return CGPoint(
        x: rotatedX + centerX + CGFloat(transform.x),
        y: rotatedY + centerY + CGFloat(transform.y)
      )
    }
  }

  private func cumulativeDistances(_ points: [RoutePointInput]) -> [Double] {
    var result: [Double] = [0]
    for i in 1..<points.count {
      let d = haversineMeters(
        lat1: points[i - 1].latitude, lon1: points[i - 1].longitude,
        lat2: points[i].latitude, lon2: points[i].longitude
      )
      result.append(result[i - 1] + d)
    }
    return result
  }

  private func haversineMeters(lat1: Double, lon1: Double, lat2: Double, lon2: Double) -> Double {
    let earthRadius = 6_371_000.0
    let dLat = (lat2 - lat1) * .pi / 180
    let dLon = (lon2 - lon1) * .pi / 180
    let a = sin(dLat / 2) * sin(dLat / 2)
      + cos(lat1 * .pi / 180) * cos(lat2 * .pi / 180) * sin(dLon / 2) * sin(dLon / 2)
    let c = 2 * atan2(sqrt(a), sqrt(1 - a))
    return earthRadius * c
  }

  /// §5-4: 진행률은 점 인덱스가 아니라 거리(호 길이) 기준.
  private func pointsUpTo(distance targetDistance: Double, projected: [CGPoint], cumulative: [Double]) -> [CGPoint] {
    if targetDistance <= 0 { return [projected[0]] }
    var result: [CGPoint] = [projected[0]]
    for i in 1..<projected.count {
      if cumulative[i] <= targetDistance {
        result.append(projected[i])
      } else {
        let segmentStart = cumulative[i - 1]
        let segmentEnd = cumulative[i]
        let segmentLength = segmentEnd - segmentStart
        let t = segmentLength > 0 ? (targetDistance - segmentStart) / segmentLength : 0
        let interpolated = CGPoint(
          x: projected[i - 1].x + (projected[i].x - projected[i - 1].x) * CGFloat(t),
          y: projected[i - 1].y + (projected[i].y - projected[i - 1].y) * CGFloat(t)
        )
        result.append(interpolated)
        break
      }
    }
    return result
  }

  // MARK: - 프레임 렌더링
  //
  // 색상·레이어 구성은 2026-08-04 JiEung2 목업
  // (docs/ideation/JiEung2/2026-08-04-route-overlay-mockup.html)의 캔버스 드로잉 로직을
  // 그대로 옮긴 것이다 — 미리보기(route-preview.tsx)도 같은 값을 쓴다.

  private let lineWarm = UIColor(red: 255 / 255, green: 243 / 255, blue: 236 / 255, alpha: 1)
  private let glowColor = UIColor(red: 255 / 255, green: 107 / 255, blue: 74 / 255, alpha: 1)

  private func loadImage(path: String) -> UIImage? {
    let cleanedPath = path.replacingOccurrences(of: "file://", with: "")
    return UIImage(contentsOfFile: cleanedPath)
  }

  /// §6-3 구간 점등: 점등 횟수 5~8회 목표로 구간 단위를 자동 선택 (route-projection.ts와 동일).
  private func segmentUnitMeters(_ totalDistanceMeters: Double) -> Double {
    let km = totalDistanceMeters / 1000
    if km <= 3 { return 500 }
    if km <= 8 { return 1000 }
    if km <= 16 { return 2000 }
    return 5000
  }

  private func strokePath(_ points: [CGPoint], color: UIColor, width: CGFloat, glowRadius: CGFloat = 0, glowColor: UIColor? = nil) {
    guard points.count >= 2 else { return }
    let path = UIBezierPath()
    path.move(to: points[0])
    for point in points.dropFirst() {
      path.addLine(to: point)
    }
    path.lineWidth = width
    path.lineCapStyle = .round
    path.lineJoinStyle = .round

    guard let ctx = UIGraphicsGetCurrentContext(), glowRadius > 0 else {
      color.setStroke()
      path.stroke()
      return
    }
    ctx.saveGState()
    ctx.setShadow(offset: .zero, blur: glowRadius, color: (glowColor ?? color).cgColor)
    color.setStroke()
    path.stroke()
    ctx.restoreGState()
  }

  private func fillDot(at point: CGPoint, radius: CGFloat, color: UIColor, glowRadius: CGFloat = 0, glowColor: UIColor? = nil) {
    let rect = CGRect(x: point.x - radius, y: point.y - radius, width: radius * 2, height: radius * 2)
    let dotPath = UIBezierPath(ovalIn: rect)
    guard let ctx = UIGraphicsGetCurrentContext(), glowRadius > 0 else {
      color.setFill()
      dotPath.fill()
      return
    }
    ctx.saveGState()
    ctx.setShadow(offset: .zero, blur: glowRadius, color: (glowColor ?? color).cgColor)
    color.setFill()
    dotPath.fill()
    ctx.restoreGState()
  }

  /// §8 합성 순서(배경 → 경로) + 프리셋별 진행 표현(§6).
  private func drawFrame(
    preset: RoutePreset,
    background: UIImage,
    projectedPoints: [CGPoint],
    cumulativeDistances: [Double],
    totalDistance: Double,
    progressFraction: Double
  ) -> UIImage {
    let size = CGSize(width: ClipSpec.width, height: ClipSpec.height)
    let renderer = UIGraphicsImageRenderer(size: size)
    let targetDistance = totalDistance * progressFraction

    return renderer.image { _ in
      // 배경: 화면을 가득 채우도록 짧은 축 기준 확대 후 중앙 크롭
      let bgSize = background.size
      let bgScale = max(size.width / bgSize.width, size.height / bgSize.height)
      let scaledSize = CGSize(width: bgSize.width * bgScale, height: bgSize.height * bgScale)
      let origin = CGPoint(x: (size.width - scaledSize.width) / 2, y: (size.height - scaledSize.height) / 2)
      background.draw(in: CGRect(origin: origin, size: scaledSize))

      switch preset {
      case .defaultDrawing:
        // §6-1: 빈 화면에서 시작해 선으로 그려져 나간다. 따뜻한 흰색 + 옅은 글로우.
        let visible = self.pointsUpTo(distance: targetDistance, projected: projectedPoints, cumulative: cumulativeDistances)
        self.strokePath(visible, color: self.lineWarm, width: 10, glowRadius: 6, glowColor: .white)

      case .lightRunner:
        // §6-2: 옅은 전체 경로 + 지나온 길(중간 밝기) + 최근 10%(핫 트레일) + 머리 발광 점.
        // 끝점에 닿는 순간 경로 전체가 밝아진다.
        self.strokePath(projectedPoints, color: UIColor.white.withAlphaComponent(0.2), width: 5)
        let traveled = self.pointsUpTo(distance: targetDistance, projected: projectedPoints, cumulative: cumulativeDistances)
        self.strokePath(traveled, color: self.lineWarm.withAlphaComponent(0.55), width: 8)

        let isComplete = progressFraction >= 1
        if !isComplete {
          let hotStartDistance = max(0, targetDistance - totalDistance * 0.1)
          let before = self.pointsUpTo(distance: hotStartDistance, projected: projectedPoints, cumulative: cumulativeDistances)
          let hotTrail = Array(traveled.dropFirst(max(0, before.count - 1)))
          self.strokePath(hotTrail, color: self.lineWarm, width: 10, glowRadius: 14, glowColor: self.glowColor)
          if let head = traveled.last {
            self.fillDot(at: head, radius: 8, color: .white, glowRadius: 14, glowColor: self.glowColor)
          }
        } else {
          self.strokePath(projectedPoints, color: self.lineWarm, width: 14, glowRadius: 14, glowColor: self.glowColor)
        }

      case .segmentLighting:
        // §6-3: 경로 전체가 희미하게 깔린 채 시작, 구간이 하나씩 켜진다.
        // 완료된 구간은 밝게(+짧은 반짝임), 그리는 중인 구간은 중간 밝기.
        self.strokePath(projectedPoints, color: UIColor.white.withAlphaComponent(0.2), width: 10)
        guard totalDistance > 0 else { return }

        let unit = self.segmentUnitMeters(totalDistance)
        let segmentCount = Int(ceil(totalDistance / unit))
        for s in 0..<segmentCount {
          let segStartDist = Double(s) * unit
          let segEndDist = min(totalDistance, Double(s + 1) * unit)
          let segStartFraction = segStartDist / totalDistance
          let segEndFraction = segEndDist / totalDistance
          if progressFraction <= segStartFraction { break } // 아직 도달 안 함 — 이후 구간도 마찬가지

          let done = progressFraction >= segEndFraction
          let endDistance = done ? segEndDist : progressFraction * totalDistance
          let segPoints = self.pointsUpTo(distance: endDistance, projected: projectedPoints, cumulative: cumulativeDistances)
          let before = self.pointsUpTo(distance: segStartDist, projected: projectedPoints, cumulative: cumulativeDistances)
          let slice = Array(segPoints.dropFirst(max(0, before.count - 1)))

          // 방금 완료된 구간일수록 반짝임이 강하다(감쇠 계수는 목업 근사치).
          let justLit = done ? max(0, 1 - (progressFraction - segEndFraction) * 14) : 0
          let alpha: CGFloat = done ? 0.95 : 0.5
          self.strokePath(
            slice,
            color: self.lineWarm.withAlphaComponent(alpha),
            width: 10 + CGFloat(justLit) * 4,
            glowRadius: done ? 14 + CGFloat(justLit) * 26 : 0,
            glowColor: self.glowColor
          )
          if done, let boundary = self.pointsUpTo(distance: segEndDist, projected: projectedPoints, cumulative: cumulativeDistances).last {
            self.fillDot(
              at: boundary,
              radius: 4 + CGFloat(justLit) * 3,
              color: self.lineWarm,
              glowRadius: 16 + CGFloat(justLit) * 24,
              glowColor: self.glowColor
            )
          }
        }
      }
    }
  }

  // MARK: - 인코딩

  private func outputURL(named name: String) -> URL {
    let tempDir = FileManager.default.temporaryDirectory
    return tempDir.appendingPathComponent("\(name).mp4")
  }

  private func writeClip(
    preset: RoutePreset,
    projectedPoints: [CGPoint],
    cumulativeDistances: [Double],
    totalDistance: Double,
    background: UIImage,
    to outputURL: URL
  ) throws {
    if FileManager.default.fileExists(atPath: outputURL.path) {
      try? FileManager.default.removeItem(at: outputURL)
    }

    guard let writer = try? AVAssetWriter(outputURL: outputURL, fileType: .mp4) else {
      throw RouteRendererError.writerSetupFailed
    }

    let videoSettings: [String: Any] = [
      AVVideoCodecKey: AVVideoCodecType.h264,
      AVVideoWidthKey: ClipSpec.width,
      AVVideoHeightKey: ClipSpec.height,
    ]
    let writerInput = AVAssetWriterInput(mediaType: .video, outputSettings: videoSettings)
    writerInput.expectsMediaDataInRealTime = false

    let pixelBufferAttributes: [String: Any] = [
      kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32ARGB,
      kCVPixelBufferWidthKey as String: ClipSpec.width,
      kCVPixelBufferHeightKey as String: ClipSpec.height,
    ]
    let adaptor = AVAssetWriterInputPixelBufferAdaptor(
      assetWriterInput: writerInput,
      sourcePixelBufferAttributes: pixelBufferAttributes
    )

    guard writer.canAdd(writerInput) else {
      throw RouteRendererError.writerSetupFailed
    }
    writer.add(writerInput)

    writer.startWriting()
    writer.startSession(atSourceTime: .zero)

    for frameIndex in 0..<ClipSpec.totalFrames {
      let progressFraction: Double
      if frameIndex < ClipSpec.drawFrames {
        progressFraction = Double(frameIndex) / Double(ClipSpec.drawFrames)
      } else {
        progressFraction = 1.0 // 정지 구간: 완성된 경로 유지 (§5-3)
      }
      let frameImage = drawFrame(
        preset: preset,
        background: background,
        projectedPoints: projectedPoints,
        cumulativeDistances: cumulativeDistances,
        totalDistance: totalDistance,
        progressFraction: progressFraction
      )

      guard let pixelBuffer = self.pixelBuffer(from: frameImage, pool: adaptor.pixelBufferPool) else {
        throw RouteRendererError.pixelBufferPoolMissing
      }

      while !writerInput.isReadyForMoreMediaData {
        Thread.sleep(forTimeInterval: 0.01)
      }
      let presentationTime = CMTime(value: Int64(frameIndex), timescale: ClipSpec.fps)
      adaptor.append(pixelBuffer, withPresentationTime: presentationTime)
    }

    writerInput.markAsFinished()
    let semaphore = DispatchSemaphore(value: 0)
    writer.finishWriting {
      semaphore.signal()
    }
    semaphore.wait()
  }

  private func pixelBuffer(from image: UIImage, pool: CVPixelBufferPool?) -> CVPixelBuffer? {
    guard let pool = pool else { return nil }
    var pixelBufferOut: CVPixelBuffer?
    let status = CVPixelBufferPoolCreatePixelBuffer(nil, pool, &pixelBufferOut)
    guard status == kCVReturnSuccess, let pixelBuffer = pixelBufferOut else { return nil }

    CVPixelBufferLockBaseAddress(pixelBuffer, [])
    defer { CVPixelBufferUnlockBaseAddress(pixelBuffer, []) }

    let context = CGContext(
      data: CVPixelBufferGetBaseAddress(pixelBuffer),
      width: ClipSpec.width,
      height: ClipSpec.height,
      bitsPerComponent: 8,
      bytesPerRow: CVPixelBufferGetBytesPerRow(pixelBuffer),
      space: CGColorSpaceCreateDeviceRGB(),
      bitmapInfo: CGImageAlphaInfo.noneSkipFirst.rawValue
    )

    guard let cgImage = image.cgImage else { return nil }
    context?.draw(cgImage, in: CGRect(x: 0, y: 0, width: ClipSpec.width, height: ClipSpec.height))

    return pixelBuffer
  }
}
