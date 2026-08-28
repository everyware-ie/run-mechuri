import AVFoundation
import CoreGraphics
import ExpoModulesCore
import UIKit

// FRD: docs/specs/frd/route-rendering.md
//
// v0 스코프 (관통용): 기본 드로잉 프리셋 1개 + 정지 이미지 배경만.
// 프리셋 3개, 다듬기(§3), 각인(§7), 배경 영상(§8), 겹친 구간 처리(§3-3)는 이후.
//
// 접근: 실시간 화면 캡처가 아니라 프레임을 하나씩 오프라인으로 그려
// AVAssetWriter로 인코딩한다 (2026-08-16 mp4 스파이크 테스트에서
// 실시간 캡처가 배경 합성과 함께 무너지는 것을 확인하고 전환하기로 한 방향).

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

struct RenderClipOptionsInput: Record {
  @Field var points: [RoutePointInput] = []
  @Field var backgroundImagePath: String = ""
  @Field var outputFileName: String = ""
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

      let projected = self.projectPoints(options.points)
      let cumulativeDistances = self.cumulativeDistances(options.points)
      let totalDistance = cumulativeDistances.last ?? 0

      let outputURL = self.outputURL(named: options.outputFileName)
      try self.writeClip(
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

  /// 위경도를 캔버스 좌표(0..<width, 0..<height)로 투영한다.
  /// §4: 회전 0(북쪽이 위), 크기는 여백 안에 들어오는 최대 크기, 위치는 화면 가운데.
  private func projectPoints(_ points: [RoutePointInput]) -> [CGPoint] {
    let lats = points.map { $0.latitude }
    let lons = points.map { $0.longitude }
    let minLat = lats.min()!
    let maxLat = lats.max()!
    let minLon = lons.min()!
    let maxLon = lons.max()!
    let midLat = (minLat + maxLat) / 2

    // 경도는 위도에 따라 실제 거리가 줄어들므로 cos(위도)로 보정해
    // 남북/동서 비율이 실제 거리와 맞도록 한다.
    let lonScale = cos(midLat * .pi / 180)

    let spanX = (maxLon - minLon) * lonScale
    let spanY = maxLat - minLat
    let span = max(spanX, spanY, 0.000001) // 정지 좌표 등 극단값 방어

    let shortSide = CGFloat(min(ClipSpec.width, ClipSpec.height))
    let usable = shortSide * (1 - ClipSpec.marginRatio * 2)
    let scale = usable / CGFloat(span)

    let centerX = CGFloat(ClipSpec.width) / 2
    let centerY = CGFloat(ClipSpec.height) / 2
    // 투영 후 중심을 다시 맞추기 위해 프로젝션된 값들의 중심을 계산해 보정한다.
    var raw: [CGPoint] = points.map { point in
      let x = (point.longitude - minLon) * lonScale
      // 화면 좌표는 y가 아래로 증가하므로 위도는 반전한다(북쪽=위=작은 y).
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
  /// targetDistance까지 그려진 폴리라인의 좌표 배열(마지막 구간은 보간)을 돌려준다.
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

  private func loadImage(path: String) -> UIImage? {
    let cleanedPath = path.replacingOccurrences(of: "file://", with: "")
    return UIImage(contentsOfFile: cleanedPath)
  }

  /// 배경 위에 progress까지 그려진 경로를 합성한 한 프레임(§8: 배경 → 경로 순서).
  private func drawFrame(background: UIImage, polyline: [CGPoint]) -> UIImage {
    let size = CGSize(width: ClipSpec.width, height: ClipSpec.height)
    let renderer = UIGraphicsImageRenderer(size: size)
    return renderer.image { context in
      // 배경: 화면을 가득 채우도록 짧은 축 기준 확대 후 중앙 크롭 (배경 선택 FRD §4-1과 동일한 사상)
      let bgSize = background.size
      let scale = max(size.width / bgSize.width, size.height / bgSize.height)
      let scaledSize = CGSize(width: bgSize.width * scale, height: bgSize.height * scale)
      let origin = CGPoint(x: (size.width - scaledSize.width) / 2, y: (size.height - scaledSize.height) / 2)
      background.draw(in: CGRect(origin: origin, size: scaledSize))

      // 경로 (기본 드로잉 프리셋: 처음부터 선으로 그려져 나간다, §6-1)
      guard polyline.count >= 2 else { return }
      let path = UIBezierPath()
      path.move(to: polyline[0])
      for point in polyline.dropFirst() {
        path.addLine(to: point)
      }
      path.lineWidth = 10
      path.lineCapStyle = .round
      path.lineJoinStyle = .round
      UIColor.white.setStroke()
      path.stroke()

      _ = context // UIGraphicsImageRenderer의 컨텍스트는 draw(in:)/stroke()가 암묵적으로 사용
    }
  }

  // MARK: - 인코딩

  private func outputURL(named name: String) -> URL {
    let tempDir = FileManager.default.temporaryDirectory
    return tempDir.appendingPathComponent("\(name).mp4")
  }

  private func writeClip(
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
      let targetDistance = totalDistance * progressFraction
      let polyline = pointsUpTo(distance: targetDistance, projected: projectedPoints, cumulative: cumulativeDistances)
      let frameImage = drawFrame(background: background, polyline: polyline)

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
