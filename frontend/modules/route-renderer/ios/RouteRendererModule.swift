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

/// result-editing FRD §7 · route-rendering FRD §7 각인 항목 중 어느 게 켜져 있나.
/// (date·place는 시안 S6에서 추가, 2026-09-01)
struct StampItemsInput: Record {
  @Field var distance: Bool = true
  @Field var time: Bool = true
  @Field var pace: Bool = true
  @Field var heartRate: Bool = true
  @Field var date: Bool = false
  @Field var place: Bool = false
}

struct RenderClipOptionsInput: Record {
  @Field var points: [RoutePointInput] = []
  @Field var backgroundImagePath: String = ""
  @Field var outputFileName: String = ""
  @Field var preset: String = "default-drawing"
  @Field var transform: RouteTransformInput = RouteTransformInput()
  /// result-editing FRD §5. 0~100, 기본 0(무보정).
  @Field var smooth: Double = 0
  /// result-editing FRD §5 고급 설정: 모서리 라운딩. 0~100, 기본 0(무보정).
  @Field var corner: Double = 0
  /// result-editing FRD §7. "always" | "after" | "hidden".
  @Field var stampMode: String = "hidden"
  /// 각인 배치 프리셋 (시안 S6). "row" | "hero".
  @Field var stampLayout: String = "row"
  @Field var stampItems: StampItemsInput = StampItemsInput()
  @Field var stampX: Double = 0
  @Field var stampY: Double = 0
  /// 각인 묶음 크기 배율(2026-09-02 추가) — route-preview.tsx StampConfig.scale과 같은 개념.
  /// 자리(stampX/Y)는 그대로 두고 글자 크기·내부 간격에만 곱한다.
  @Field var stampScale: Double = 1
  /// 시안 S6 "한 줄 문구". 빈 문자열이면 안 그린다.
  @Field var caption: String = ""
  /// '장소' 각인 값 (역지오코딩 결과). 빈 문자열이면 장소 항목은 안 나온다.
  @Field var placeName: String = ""
  /// '날짜' 각인 값 계산용 — 러닝한 날 (ISO 8601).
  @Field var runDate: String = ""
  /// 각인 값 계산용 — 그려진 선 길이가 아니라 기록된 값을 쓴다(route-rendering §7-3).
  @Field var distanceMeters: Double = 0
  @Field var durationSeconds: Double = 0
  @Field var averagePaceSecPerKm: Double = 0
  /// 데이터가 없으면 nil(§2-3, 빈 자리를 남기지 않는다 — 항목 자체가 빠진다).
  @Field var averageHeartRate: Double? = nil
}

struct RenderClipResultPayload: Record {
  @Field var outputPath: String = ""
}

enum RouteRendererError: Error, LocalizedError {
  case notEnoughPoints
  case backgroundImageNotFound
  case writerSetupFailed
  case pixelBufferPoolMissing
  /// export-and-share FRD §2-4·F2: 취소는 실패가 아니다. JS 쪽은 이 케이스를 문자열로
  /// 구분하지 않고, 취소 버튼을 누른 시점을 자체적으로 기억해뒀다가 구분한다(share.tsx).
  case cancelled

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
    case .cancelled:
      return "취소했습니다"
    }
  }
}

private enum RoutePreset: String {
  case defaultDrawing = "default-drawing"
  case lightRunner = "light-runner"
  case segmentLighting = "segment-lighting"
}

public class RouteRendererModule: Module {
  // export-and-share FRD §2-3 취소. 이 앱은 한 번에 하나의 renderClip만 돈다는 전제라
  // 인스턴스 플래그 하나로 충분하다 — 작업별 취소 토큰까지는 필요 없다.
  private var isCancelled = false

  public func definition() -> ModuleDefinition {
    Name("RouteRenderer")

    // export-and-share FRD §2-3: 인코딩 진행률.
    Events("onRenderProgress")

    Function("cancelRender") {
      self.isCancelled = true
    }

    AsyncFunction("renderClip") { (options: RenderClipOptionsInput) async throws -> RenderClipResultPayload in
      self.isCancelled = false
      guard options.points.count >= 2 else {
        throw RouteRendererError.notEnoughPoints
      }
      guard let background = self.loadImage(path: options.backgroundImagePath) else {
        throw RouteRendererError.backgroundImageNotFound
      }
      let preset = RoutePreset(rawValue: options.preset) ?? .defaultDrawing

      let baseProjected = self.projectPoints(options.points)
      // §5: 다듬기는 그룹 변형(scale/rotate) 이전, 캔버스 좌표계에서 적용한다 — 편집
      // 화면 미리보기(route-preview.tsx)의 순서(projectPoints → applySmoothing → transform)와 맞춘다.
      let smoothed = self.applySmoothing(baseProjected, smooth: options.smooth, corner: options.corner)
      let projected = self.applyTransform(smoothed, transform: options.transform)
      // 다듬기가 점 개수·위치를 바꾸므로 원본 위경도 기반 누적 거리와 대응이 깨진다.
      // §5-4 진행률은 항상 비율(targetDistance = total * fraction)로만 쓰이므로
      // 캔버스 유클리드 거리로 다시 계산해도 결과가 같다(route-projection.ts와 동일).
      let cumulativeDistances = self.cumulativeCanvasDistances(projected)
      let totalDistance = cumulativeDistances.last ?? 0

      let outputURL = self.outputURL(named: options.outputFileName)
      try self.writeClip(
        preset: preset,
        projectedPoints: projected,
        cumulativeDistances: cumulativeDistances,
        totalDistance: totalDistance,
        background: background,
        stamp: options,
        to: outputURL
      )

      self.sendEvent("onRenderProgress", ["progress": 1.0])

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

  /// 캔버스(픽셀) 좌표계 누적 거리. route-projection.ts의 cumulativeCanvasDistances와 동일.
  private func cumulativeCanvasDistances(_ points: [CGPoint]) -> [Double] {
    guard points.count > 1 else { return [0] }
    var result: [Double] = [0]
    for i in 1..<points.count {
      result.append(result[i - 1] + Double(hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y)))
    }
    return result
  }

  // MARK: - 다듬기 (result-editing FRD §5)
  //
  // route-smoothing.ts와 동일한 파이프라인: 중복 제거 → 이동평균 → RDP 단순화 → 모서리
  // 라운딩. 미리보기와 최종 결과물 모양이 어긋나지 않도록 두 언어에 각각 이식했다.

  private func applySmoothing(_ points: [CGPoint], smooth: Double, corner: Double) -> [CGPoint] {
    guard points.count >= 3 else { return points }
    let window = 3 + Int((smooth / 100 * 12).rounded()) * 2
    let smoothed = movingAverage(dedupe(points, minDist: 4), window: window)
    let dg = max(diagonal(smoothed), 1)
    let simplified = rdpSimplify(smoothed, epsilon: dg * (0.0008 + smooth / 100 * 0.011))
    return roundCorners(simplified, radius: corner * (dg / 620))
  }

  private func dedupe(_ points: [CGPoint], minDist: CGFloat) -> [CGPoint] {
    guard var last = points.first else { return points }
    var out = [last]
    for p in points.dropFirst() where hypot(p.x - last.x, p.y - last.y) >= minDist {
      out.append(p)
      last = p
    }
    if out.count < 2, let lastPoint = points.last { out.append(lastPoint) }
    return out
  }

  private func movingAverage(_ points: [CGPoint], window: Int) -> [CGPoint] {
    guard points.count >= 3 else { return points }
    let half = window / 2
    var out: [CGPoint] = []
    for i in 0..<points.count {
      var sx: CGFloat = 0
      var sy: CGFloat = 0
      var k: CGFloat = 0
      for j in (i - half)...(i + half) where j >= 0 && j < points.count {
        sx += points[j].x
        sy += points[j].y
        k += 1
      }
      out.append(CGPoint(x: sx / k, y: sy / k))
    }
    out[0] = points[0]
    out[out.count - 1] = points[points.count - 1]
    return out
  }

  private func segmentDistance(_ p: CGPoint, _ a: CGPoint, _ b: CGPoint) -> CGFloat {
    let dx = b.x - a.x
    let dy = b.y - a.y
    let lenSq = dx * dx + dy * dy
    guard lenSq > 0 else { return hypot(p.x - a.x, p.y - a.y) }
    var t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq
    t = max(0, min(1, t))
    return hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy))
  }

  private func rdpSimplify(_ points: [CGPoint], epsilon: CGFloat) -> [CGPoint] {
    guard points.count >= 3 else { return points }
    var maxDist: CGFloat = -1
    var idx = 0
    for i in 1..<(points.count - 1) {
      let d = segmentDistance(points[i], points[0], points[points.count - 1])
      if d > maxDist {
        maxDist = d
        idx = i
      }
    }
    if maxDist > epsilon {
      let left = rdpSimplify(Array(points[0...idx]), epsilon: epsilon)
      let right = rdpSimplify(Array(points[idx...]), epsilon: epsilon)
      return Array(left.dropLast()) + right
    }
    return [points[0], points[points.count - 1]]
  }

  private func roundCorners(_ points: [CGPoint], radius: CGFloat) -> [CGPoint] {
    guard radius > 0, points.count >= 3 else { return points }
    var out: [CGPoint] = [points[0]]
    for i in 1..<(points.count - 1) {
      let a = points[i - 1]
      let v = points[i]
      let b = points[i + 1]
      let d1 = hypot(v.x - a.x, v.y - a.y)
      let d2 = hypot(v.x - b.x, v.y - b.y)
      guard d1 > 1e-6, d2 > 1e-6 else { continue }
      let t = min(radius, d1 * 0.45, d2 * 0.45)
      let p1 = CGPoint(x: v.x + (a.x - v.x) / d1 * t, y: v.y + (a.y - v.y) / d1 * t)
      let p2 = CGPoint(x: v.x + (b.x - v.x) / d2 * t, y: v.y + (b.y - v.y) / d2 * t)
      out.append(p1)
      for k in 1..<10 {
        let u = CGFloat(k) / 10
        let w = 1 - u
        out.append(CGPoint(
          x: w * w * p1.x + 2 * w * u * v.x + u * u * p2.x,
          y: w * w * p1.y + 2 * w * u * v.y + u * u * p2.y
        ))
      }
      out.append(p2)
    }
    out.append(points[points.count - 1])
    return out
  }

  private func diagonal(_ points: [CGPoint]) -> CGFloat {
    guard !points.isEmpty else { return 0 }
    let xs = points.map { $0.x }
    let ys = points.map { $0.y }
    return hypot(xs.max()! - xs.min()!, ys.max()! - ys.min()!)
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

  /// 배경을 출력 크기(1080×1920)로 한 번만 크롭·스케일한다(짧은 축 기준 확대 후 중앙 크롭).
  /// writeClip 루프에서 프레임마다 원본을 다시 그리지 않도록.
  private func prepareBackground(_ background: UIImage) -> UIImage {
    let size = CGSize(width: ClipSpec.width, height: ClipSpec.height)
    let renderer = UIGraphicsImageRenderer(size: size)
    return renderer.image { _ in
      let bgSize = background.size
      let bgScale = max(size.width / bgSize.width, size.height / bgSize.height)
      let scaledSize = CGSize(width: bgSize.width * bgScale, height: bgSize.height * bgScale)
      let origin = CGPoint(x: (size.width - scaledSize.width) / 2, y: (size.height - scaledSize.height) / 2)
      background.draw(in: CGRect(origin: origin, size: scaledSize))
    }
  }

  /// §8 합성 순서(배경 → 경로 → 각인) + 프리셋별 진행 표현(§6).
  /// `background`는 prepareBackground로 이미 출력 크기에 맞춰진 이미지다.
  private func drawFrame(
    preset: RoutePreset,
    background: UIImage,
    projectedPoints: [CGPoint],
    cumulativeDistances: [Double],
    totalDistance: Double,
    progressFraction: Double,
    stamp: RenderClipOptionsInput
  ) -> UIImage {
    let size = CGSize(width: ClipSpec.width, height: ClipSpec.height)
    let renderer = UIGraphicsImageRenderer(size: size)
    let targetDistance = totalDistance * progressFraction

    return renderer.image { _ in
      // 배경은 이미 출력 크기 — 그대로 채운다.
      background.draw(in: CGRect(origin: .zero, size: size))

      switch preset {
      case .defaultDrawing:
        // §6-1: 빈 화면에서 시작해 선으로 그려져 나간다. 따뜻한 흰색 + 옅은 글로우.
        let visible = self.pointsUpTo(distance: targetDistance, projected: projectedPoints, cumulative: cumulativeDistances)
        self.strokePath(visible, color: self.lineWarm, width: 10, glowRadius: 6, glowColor: .white)

      case .lightRunner:
        // §6-2: 옅은 전체 경로 + 지나온 길(중간 밝기, 옅은 글로우) + 최근 6%(핫 트레일) +
        // 머리 발광 점. 끝점에 닿는 순간 경로 전체가 밝아진다.
        self.strokePath(projectedPoints, color: UIColor.white.withAlphaComponent(0.2), width: 5)
        let traveled = self.pointsUpTo(distance: targetDistance, projected: projectedPoints, cumulative: cumulativeDistances)
        // 목업의 "지나온 길" 레이어에도 옅은 글로우가 있다 — 처음 옮길 때 빠뜨렸던 부분.
        self.strokePath(traveled, color: self.lineWarm.withAlphaComponent(0.55), width: 8, glowRadius: 10, glowColor: .white)

        let isComplete = progressFraction >= 1
        if !isComplete {
          // 목업(2026-08-04)의 "최근 46점" 잔광을 거리 기준으로 옮긴 값(v0 근사,
          // route-preview.tsx와 동일한 6% 값 — TS 쪽 주석 참고).
          let hotStartDistance = max(0, targetDistance - totalDistance * 0.06)
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

      self.drawStamps(stamp, progressFraction: progressFraction, canvasSize: size)
    }
  }

  // MARK: - 각인 (result-editing FRD §7 · route-rendering FRD §7)
  //
  // route-preview.tsx의 StampLayer와 같은 규칙: 넷을 다 새기되 심박은 데이터 있을 때만,
  // 거리는 그려진 선 길이가 아니라 기록된 총 거리를 쓴다. 폰트는 미리보기(SVG, 로드된
  // JetBrains Mono)와 다르게 시스템 모노스페이스를 쓴다 — 번들에 폰트 파일을 넣는
  // 네이티브 자산 파이프라인이 아직 없어서, 미리보기와 최종 결과물의 폰트가 다를 수
  // 있다(v0 근사, 프리셋 글로우 반경 근사와 같은 종류의 타협).

  private func formatDistanceKm(_ meters: Double) -> String {
    String(format: "%.2fkm", meters / 1000)
  }

  private func formatDuration(_ seconds: Double) -> String {
    let total = max(0, Int(seconds.rounded()))
    let h = total / 3600
    let m = (total % 3600) / 60
    let s = total % 60
    return h > 0 ? String(format: "%d:%02d:%02d", h, m, s) : String(format: "%02d:%02d", m, s)
  }

  private func formatPace(_ secPerKm: Double) -> String {
    let total = max(0, Int(secPerKm.rounded()))
    return String(format: "%d'%02d\"/km", total / 60, total % 60)
  }

  private func formatHeartRate(_ bpm: Double) -> String {
    String(format: "%.0fbpm", bpm)
  }

  /// 러닝한 날 (ISO) → "MM.dd". route-preview.tsx formatStampDate와 같은 규칙.
  private func formatStampDate(_ iso: String) -> String {
    let f = ISO8601DateFormatter()
    f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    var date = f.date(from: iso)
    if date == nil {
      f.formatOptions = [.withInternetDateTime]
      date = f.date(from: iso)
    }
    guard let d = date else { return "" }
    let c = Calendar.current.dateComponents([.month, .day], from: d)
    guard let m = c.month, let day = c.day else { return "" }
    return String(format: "%02d.%02d", m, day)
  }

  private func drawStamps(_ stamp: RenderClipOptionsInput, progressFraction: Double, canvasSize: CGSize) {
    let isComplete = progressFraction >= 1
    if stamp.stampMode == "hidden" { return }
    if stamp.stampMode == "after" && !isComplete { return }

    // 활성 항목을 키 → 값 순서대로. route-preview.tsx StampLayerSvg와 같은 순서·규칙.
    var keyed: [(String, String)] = []
    if stamp.stampItems.distance { keyed.append(("distance", formatDistanceKm(stamp.distanceMeters * progressFraction))) }
    if stamp.stampItems.time { keyed.append(("time", formatDuration(stamp.durationSeconds * progressFraction))) }
    if stamp.stampItems.pace { keyed.append(("pace", formatPace(stamp.averagePaceSecPerKm))) }
    if stamp.stampItems.date {
      let s = formatStampDate(stamp.runDate)
      if !s.isEmpty { keyed.append(("date", s)) }
    }
    if stamp.stampItems.place && !stamp.placeName.isEmpty { keyed.append(("place", stamp.placeName)) }
    if stamp.stampItems.heartRate, let hr = stamp.averageHeartRate { keyed.append(("heartRate", formatHeartRate(hr))) }

    let caption = stamp.caption.trimmingCharacters(in: .whitespacesAndNewlines)
    if keyed.isEmpty && caption.isEmpty { return }

    // route-preview.tsx SAFE_AREA_TOP/BOTTOM_RATIO와 같은 값이어야 미리보기와 결과물의 각인 위치가 맞는다.
    let safeAreaTopRatio: CGFloat = 0.17
    let safeAreaBottomRatio: CGFloat = 0.17
    guard let ctx = UIGraphicsGetCurrentContext() else { return }

    // 어두운 아웃라인 사본 위에 밝은 글씨 — route-preview.tsx glowText와 같은 처리.
    // color 생략 시 기본 밝은 톤. 라벨류(muted)는 호출부에서 mutedColor를 넘긴다
    // (route-preview.tsx StampTextDescriptor.muted와 같은 개념, 2026-09-02).
    func draw(_ text: String, _ origin: CGPoint, _ font: UIFont, _ align: NSTextAlignment, color: UIColor? = nil) {
      let attrs: [NSAttributedString.Key: Any] = [.font: font, .foregroundColor: color ?? self.lineWarm]
      let w = (text as NSString).size(withAttributes: attrs).width
      let x = align == .center ? origin.x - w / 2 : align == .right ? origin.x - w : origin.x
      ctx.saveGState()
      ctx.setShadow(offset: .zero, blur: 6, color: UIColor.white.cgColor)
      (text as NSString).draw(at: CGPoint(x: x, y: origin.y), withAttributes: attrs)
      ctx.restoreGState()
    }
    let mutedColor = self.lineWarm.withAlphaComponent(0.5)

    // route-preview.tsx StampConfig.scale과 같은 배율 — 자리(stampX/Y)는 그대로 두고
    // 글자 크기·내부 간격에만 곱한다.
    let s = CGFloat(stamp.stampScale)

    // route-preview.tsx splitHeroValue와 같은 규칙 — "5.23km"처럼 끝의 단위 글자(있으면,
    // "/km"처럼 슬래시 포함)를 떼어 작게 그린다. "28:14"처럼 단위가 없으면 nil.
    func splitHeroValue(_ text: String) -> (main: String, unit: String)? {
      guard let range = text.range(of: "/?[a-zA-Z%]+$", options: .regularExpression) else { return nil }
      let main = String(text[..<range.lowerBound])
      if main.isEmpty { return nil }
      return (main, String(text[range]))
    }
    // 숫자(크게) + 단위(작게)를 한 줄로 이어 align 기준으로 그린다. UIKit의 NSString.draw(at:)는
    // 원점을 텍스트 위쪽 기준으로 잡아서(SVG의 baseline 기준과 다름) 두 크기의 baseline이
    // 완전히 일치하진 않는다 — 각인 폰트 불일치와 같은 종류의 근사치로 허용한다.
    func drawHeroValue(_ text: String, _ origin: CGPoint, _ size: CGFloat, align: NSTextAlignment = .center) {
      guard let split = splitHeroValue(text) else {
        draw(text, origin, UIFont.systemFont(ofSize: size, weight: .bold), align)
        return
      }
      let mainFont = UIFont.systemFont(ofSize: size, weight: .bold)
      let unitFont = UIFont.systemFont(ofSize: size * 0.42, weight: .bold)
      let mainAttrs: [NSAttributedString.Key: Any] = [.font: mainFont, .foregroundColor: self.lineWarm]
      let unitAttrs: [NSAttributedString.Key: Any] = [.font: unitFont, .foregroundColor: self.lineWarm]
      let mainW = (split.main as NSString).size(withAttributes: mainAttrs).width
      let unitText = " \(split.unit)"
      let unitW = (unitText as NSString).size(withAttributes: unitAttrs).width
      let totalW = mainW + unitW
      let startX: CGFloat
      switch align {
      case .center: startX = origin.x - totalW / 2
      case .right: startX = origin.x - totalW
      default: startX = origin.x
      }
      ctx.saveGState()
      ctx.setShadow(offset: .zero, blur: 6, color: UIColor.white.cgColor)
      (split.main as NSString).draw(at: CGPoint(x: startX, y: origin.y), withAttributes: mainAttrs)
      (unitText as NSString).draw(at: CGPoint(x: startX + mainW, y: origin.y + (size - size * 0.42)), withAttributes: unitAttrs)
      ctx.restoreGState()
    }
    // route-preview.tsx STAT_LABEL과 같음 — 통계 칸 라벨.
    let statLabel: [String: String] = [
      "distance": "DIST", "time": "TIME", "pace": "PACE", "heartRate": "BPM", "date": "DATE", "place": "PLACE",
    ]
    let heroKeys = ["distance", "time", "pace"]
    func hasKey(_ k: String) -> Bool { keyed.contains { $0.0 == k } }
    func valueFor(_ k: String) -> String { keyed.first { $0.0 == k }?.1 ?? "" }
    // 채운 사각형(카드 배경·구분선·레일 선) — route-preview.tsx StampRectDescriptor와 같은 개념.
    func fillRect(_ rect: CGRect, radius: CGFloat, color: UIColor, strokeColor: UIColor? = nil) {
      let path = UIBezierPath(roundedRect: rect, cornerRadius: radius)
      ctx.saveGState()
      color.setFill()
      path.fill()
      if let strokeColor {
        strokeColor.setStroke()
        path.lineWidth = 1
        path.stroke()
      }
      ctx.restoreGState()
    }

    // 아래 6개(stack~line)는 디자인 프로젝트 "런 기록 카드 프리셋"의 2a~2f를 그대로
    // 옮긴 것이다(2026-09-02, route-preview.tsx stampLayoutDescriptors와 같은 수식).
    // 목업은 300x533 캔버스라 M=3.6을 곱해 1080x1920으로 옮긴다.
    let M: CGFloat = 3.6

    if stamp.stampLayout == "stack" {
      // 2a "좌하단 스택" — 문구 → 큰 숫자(단위 작게) → 시간·페이스·BPM·날짜 한 줄.
      let u = M * s
      let leftX = 24 * M + CGFloat(stamp.stampX)
      // 실기기 피드백(2026-09-03), TS와 동일 — 디자인 bottom:26px, M 곱하는 걸
      // 빠뜨렸던 버그. 26*M로 맞춘다.
      let bottomAnchor = canvasSize.height * (1 - safeAreaBottomRatio) - 26 * M + CGFloat(stamp.stampY)
      let hero = keyed.first { heroKeys.contains($0.0) }
      let metaItems = keyed.filter { $0.0 != hero?.0 }

      let metaFont = 12 * u
      let heroSize = 58 * u
      let titleFont = 13 * u
      let rowGap = 10 * u

      // 실기기 피드백(2026-09-03), TS와 동일(route-preview.tsx stampLayoutDescriptors
      // 'stack' 참고): 가운데 줄(hero)·meta가 꺼져 있어도 문구가 항상 그 몫의
      // 간격까지 띄운 채였다 — 실제로 있는 줄끼리만 간격을 둔다.
      let hasMeta = !metaItems.isEmpty
      let hasHero = hero != nil
      let metaBaseline = bottomAnchor
      let heroBaseline = hasMeta ? bottomAnchor - rowGap - heroSize * 0.85 : bottomAnchor
      let captionBaseline: CGFloat
      if hasHero {
        captionBaseline = heroBaseline - heroSize * 0.3 - rowGap - titleFont * 0.85
      } else if hasMeta {
        captionBaseline = metaBaseline - rowGap - titleFont * 0.85
      } else {
        captionBaseline = bottomAnchor - rowGap - titleFont * 0.85
      }

      if !metaItems.isEmpty {
        let font = UIFont.monospacedSystemFont(ofSize: metaFont, weight: .medium)
        let attrs: [NSAttributedString.Key: Any] = [.font: font]
        var cursorX = leftX
        for (key, val) in metaItems {
          let text = key == "heartRate" ? "\(val)BPM" : val
          draw(text, CGPoint(x: cursorX, y: metaBaseline), font, .left)
          cursorX += (text as NSString).size(withAttributes: attrs).width + 14 * u
        }
      }
      if let hero { drawHeroValue(hero.1, CGPoint(x: leftX, y: heroBaseline), heroSize, align: .left) }
      if !caption.isEmpty {
        draw(caption, CGPoint(x: leftX, y: captionBaseline), UIFont.systemFont(ofSize: titleFont, weight: .medium), .left)
      }
      return
    }

    if stamp.stampLayout == "bar" {
      // 2b "하단 스탯 바" — 문구+날짜 머리글, 구분선, 그 아래 4칸 통계(거리 칸이 더 넓다).
      let u = M * s
      let leftX = 20 * M + CGFloat(stamp.stampX)
      let rightX = canvasSize.width - 20 * M + CGFloat(stamp.stampX)
      let bottomAnchor = canvasSize.height * (1 - safeAreaBottomRatio) - 24 * M + CGFloat(stamp.stampY)
      let dateText = valueFor("date")
      let statOrder = ["distance", "time", "pace", "heartRate"].filter(hasKey)
      let statWeight: [String: CGFloat] = ["distance": 1.3, "time": 1, "pace": 1, "heartRate": 0.9]

      let headerFont = 15 * u
      let labelFont = 9 * u
      let dividerGap = 16 * u
      let rowPadTop = 12 * u

      // 실기기 피드백(2026-09-03), TS와 동일 — 통계 4칸을 다 꺼도 머리글이 그 몫의
      // 간격까지 띄운 채였다.
      let hasStats = !statOrder.isEmpty
      let valueBaseline = bottomAnchor
      let labelBaseline = valueBaseline - 22 * u * 1.15
      let dividerY = hasStats ? labelBaseline - labelFont * 0.9 - rowPadTop : bottomAnchor
      let headerBaseline = dividerY - dividerGap - headerFont * 0.3

      if !caption.isEmpty { draw(caption, CGPoint(x: leftX, y: headerBaseline), UIFont.systemFont(ofSize: headerFont, weight: .bold), .left) }
      if !dateText.isEmpty { draw(dateText, CGPoint(x: rightX, y: headerBaseline), UIFont.monospacedSystemFont(ofSize: 11 * u, weight: .medium), .right, color: mutedColor) }
      if !caption.isEmpty || !dateText.isEmpty {
        fillRect(CGRect(x: leftX, y: dividerY, width: rightX - leftX, height: max(1, u)), radius: 0, color: UIColor(white: 1, alpha: 0.28))
      }
      if !statOrder.isEmpty {
        let totalWeight = statOrder.reduce(0) { $0 + (statWeight[$1] ?? 1) }
        let totalWidth = rightX - leftX
        var cursorX = leftX
        for key in statOrder {
          let colWidth = (statWeight[key] ?? 1) / totalWeight * totalWidth
          let isDist = key == "distance"
          draw(statLabel[key] ?? "", CGPoint(x: cursorX, y: labelBaseline), UIFont.monospacedSystemFont(ofSize: labelFont, weight: .medium), .left, color: mutedColor)
          draw(valueFor(key), CGPoint(x: cursorX, y: valueBaseline), UIFont.systemFont(ofSize: (isDist ? 22 : 18) * u, weight: .bold), .left)
          cursorX += colWidth
        }
      }
      return
    }

    if stamp.stampLayout == "corner" {
      // 2c "코너 분산" — 위쪽 문구·날짜, 오른쪽에 시간·페이스·평균심박 스택, 왼쪽 아래에 큰 숫자.
      let u = M * s
      let topLeftX = 24 * M + CGFloat(stamp.stampX)
      let topRightX = canvasSize.width - 24 * M + CGFloat(stamp.stampX)
      let headerFont = 13 * u
      let headerBaseline = canvasSize.height * safeAreaTopRatio + 24 * M + headerFont * 0.85 + CGFloat(stamp.stampY)

      if !caption.isEmpty { draw(caption, CGPoint(x: topLeftX, y: headerBaseline), UIFont.systemFont(ofSize: headerFont, weight: .bold), .left) }
      let dateText = valueFor("date")
      if !dateText.isEmpty { draw(dateText, CGPoint(x: topRightX, y: headerBaseline), UIFont.monospacedSystemFont(ofSize: 11 * u, weight: .medium), .right, color: mutedColor) }

      let statItems = ["time", "pace", "heartRate"].filter(hasKey)
      if !statItems.isEmpty {
        let labelFont = 9 * u
        let valueFont = 19 * u
        let rowGap = 14 * u
        var cursorY = headerBaseline + 72 * M
        for key in statItems {
          let labelY = cursorY + labelFont * 0.85
          let valueY = labelY + valueFont * 1.05
          let label = key == "heartRate" ? "AVG BPM" : (statLabel[key] ?? "")
          draw(label, CGPoint(x: topRightX, y: labelY), UIFont.monospacedSystemFont(ofSize: labelFont, weight: .medium), .right, color: mutedColor)
          draw(valueFor(key), CGPoint(x: topRightX, y: valueY), UIFont.systemFont(ofSize: valueFont, weight: .bold), .right)
          cursorY = valueY + rowGap
        }
      }

      if let hero = keyed.first(where: { heroKeys.contains($0.0) }) {
        let heroSize = 66 * u
        // 실기기 피드백(2026-09-03), TS와 동일 — 디자인 bottom:26px, M 곱하는 걸
        // 빠뜨렸던 버그. 26*M로 맞춘다.
        let heroBaseline = canvasSize.height * (1 - safeAreaBottomRatio) - 26 * M + CGFloat(stamp.stampY)
        drawHeroValue(hero.1, CGPoint(x: 22 * M + CGFloat(stamp.stampX), y: heroBaseline), heroSize, align: .left)
      }
      return
    }

    if stamp.stampLayout == "glass" {
      // 2d "글래스 플레이트" — 반투명 유리판 카드(블러는 CoreGraphics로 흉내 못 내
      // 반투명 채우기 + 옅은 테두리로 근사).
      let u = M * s
      let hero = keyed.first { heroKeys.contains($0.0) }
      let statItems = keyed.filter { $0.0 != hero?.0 && $0.0 != "date" }
      let dateText = valueFor("date")
      let hasHeader = !caption.isEmpty || !dateText.isEmpty

      let padX = 20 * u
      let padY = 20 * u
      let gap = 14 * u
      let headerFont = 13 * u
      let heroSize = 46 * u
      let labelFont = 9 * u
      let valueFont = 16 * u
      let colGap = 20 * u // 통계 칸 사이 최소 간격(겹침 방지)

      let headerLineH = hasHeader ? headerFont * 1.3 : 0
      let heroLineH = hero != nil ? heroSize * 1.05 : 0
      let statLineH = !statItems.isEmpty ? labelFont * 1.3 + valueFont * 1.15 : 0
      var inner = headerLineH
      if hero != nil { inner += (hasHeader ? gap : 0) + heroLineH }
      if !statItems.isEmpty { inner += (hero != nil ? gap : hasHeader ? gap : 0) + statLineH }
      let panelHeight = inner + padY * 2

      // route-preview.tsx와 같은 이유 — 고정 균등폭 칸이 "장소"처럼 긴 값과
      // "페이스"를 겹쳐 보이게 했다. 실제 글자 폭(추정)만큼만 차지하는 커서
      // 방식으로 바꿔 절대 안 겹치게 하고, 필요하면 패널을 넓힌다.
      let statWidths: [CGFloat] = statItems.map { (pair: (String, String)) -> CGFloat in
        let labelW = CGFloat((statLabel[pair.0] ?? "").count) * labelFont * 0.62
        let valueW = CGFloat(pair.1.count) * valueFont * 0.62
        return max(labelW, valueW)
      }
      let statRowWidth = statWidths.reduce(0, +) + colGap * CGFloat(max(0, statItems.count - 1))
      let nominalContentWidth = canvasSize.width - 32 * M - padX * 2
      let contentWidth = max(nominalContentWidth, statRowWidth)
      let panelWidth = contentWidth + padX * 2

      let panelLeft = 16 * M + CGFloat(stamp.stampX)
      let panelRight = panelLeft + panelWidth
      // 실기기 피드백(2026-09-03), TS와 동일 — 디자인 bottom:18px, M 곱하는 걸
      // 빠뜨렸던 버그. 18*M로 맞춘다.
      let panelBottom = canvasSize.height * (1 - safeAreaBottomRatio) - 18 * M + CGFloat(stamp.stampY)
      let panelTop = panelBottom - panelHeight

      fillRect(
        CGRect(x: panelLeft, y: panelTop, width: panelWidth, height: panelHeight),
        radius: 18 * u,
        color: UIColor(red: 12 / 255, green: 14 / 255, blue: 17 / 255, alpha: 0.42),
        strokeColor: UIColor(white: 1, alpha: 0.14)
      )

      var cursor = panelTop + padY
      if hasHeader {
        cursor += headerFont * 0.85
        if !caption.isEmpty { draw(caption, CGPoint(x: panelLeft + padX, y: cursor), UIFont.systemFont(ofSize: headerFont, weight: .bold), .left) }
        if !dateText.isEmpty { draw(dateText, CGPoint(x: panelRight - padX, y: cursor), UIFont.monospacedSystemFont(ofSize: 11 * u, weight: .medium), .right, color: mutedColor) }
      }
      if let hero {
        cursor += (hasHeader ? gap : 0) + heroSize * 0.92
        drawHeroValue(hero.1, CGPoint(x: panelLeft + padX, y: cursor), heroSize, align: .left)
      }
      if !statItems.isEmpty {
        cursor += (hero != nil ? gap : hasHeader ? gap : 0) + labelFont * 0.85
        let valueY = cursor + valueFont * 1.05
        var colX = panelLeft + padX
        for (i, item) in statItems.enumerated() {
          draw(statLabel[item.0] ?? "", CGPoint(x: colX, y: cursor), UIFont.monospacedSystemFont(ofSize: labelFont, weight: .medium), .left, color: mutedColor)
          draw(item.1, CGPoint(x: colX, y: valueY), UIFont.systemFont(ofSize: valueFont, weight: .bold), .left)
          colX += statWidths[i] + colGap
        }
      }
      return
    }

    if stamp.stampLayout == "rail" {
      // 2e "사이드 레일" — 왼쪽 끝 세로 네온 선 + 거리·시간·페이스·평균심박·날짜를
      // 위아래로 쌓는다(거리만 크게). 문구는 오른쪽 아래.
      let u = M * s
      let railPadLeft = 22 * M
      let labelFont = 9 * u
      let distValueFont = 34 * u
      let otherValueFont = 20 * u
      let rowGap = 18 * u

      var rows: [(label: String, text: String, big: Bool)] = []
      if hasKey("distance") { rows.append(("DISTANCE", valueFor("distance"), true)) }
      if hasKey("time") { rows.append(("TIME", valueFor("time"), false)) }
      if hasKey("pace") { rows.append(("PACE", valueFor("pace"), false)) }
      if hasKey("heartRate") { rows.append(("AVG BPM", valueFor("heartRate"), false)) }
      if hasKey("date") { rows.append(("DATE", valueFor("date"), false)) }

      if !rows.isEmpty {
        let rowHeights = rows.map { labelFont * 1.2 + ($0.big ? distValueFont : otherValueFont) * 1.05 }
        let totalHeight = rowHeights.reduce(0, +) + rowGap * CGFloat(rows.count - 1)
        let railTop = canvasSize.height / 2 - totalHeight / 2 + CGFloat(stamp.stampY)
        let railX = CGFloat(stamp.stampX)
        fillRect(CGRect(x: railX, y: railTop, width: 3 * u, height: totalHeight), radius: 0, color: self.glowColor)

        var cursorY = railTop
        for (i, row) in rows.enumerated() {
          let valueFont = row.big ? distValueFont : otherValueFont
          let labelY = cursorY + labelFont * 0.85
          let valueY = labelY + valueFont * 0.95
          draw(row.label, CGPoint(x: railX + railPadLeft, y: labelY), UIFont.monospacedSystemFont(ofSize: labelFont, weight: .medium), .left, color: mutedColor)
          draw(row.text, CGPoint(x: railX + railPadLeft, y: valueY), UIFont.systemFont(ofSize: valueFont, weight: .bold), .left)
          cursorY += rowHeights[i] + rowGap
        }
      }
      if !caption.isEmpty {
        // 실기기 피드백(2026-09-03), TS와 동일 — 디자인 bottom:24px, M 곱하는 걸
        // 빠뜨렸던 버그. 24*M로 맞춘다.
        let y = canvasSize.height * (1 - safeAreaBottomRatio) - 24 * M + CGFloat(stamp.stampY)
        draw(caption, CGPoint(x: canvasSize.width - 22 * M + CGFloat(stamp.stampX), y: y), UIFont.systemFont(ofSize: 13 * u, weight: .bold), .right)
      }
      return
    }

    if stamp.stampLayout == "line" {
      // 2f "원 라인" — 문구(크게) 아래 짧은 구분선, 그 아래 통계를 한 줄로 이어붙인다.
      let u = M * s
      let centerX = canvasSize.width / 2 + CGFloat(stamp.stampX)
      let bottomAnchor = canvasSize.height * (1 - safeAreaBottomRatio) - 30 * M + CGFloat(stamp.stampY)
      let gap = 12 * u
      let oneLineFont = 11 * u
      let titleFont = 26 * u
      let dividerW = 28 * u

      var parts: [String] = []
      if hasKey("distance") { parts.append(valueFor("distance").uppercased()) }
      if hasKey("time") { parts.append(valueFor("time")) }
      if hasKey("pace") { parts.append(valueFor("pace").uppercased()) }
      if hasKey("heartRate") { parts.append(valueFor("heartRate").uppercased()) }
      if hasKey("date") { parts.append(valueFor("date")) }
      let oneLine = parts.joined(separator: " · ")

      // 실기기 피드백(2026-09-03), TS와 동일 — 통계 한 줄이 비어도 문구가 그 몫의
      // 간격까지 띄운 채였다.
      let hasOneLine = !oneLine.isEmpty
      let oneLineBaseline = bottomAnchor
      let dividerY = oneLineBaseline - oneLineFont * 1.3 - gap
      let titleBaseline = hasOneLine ? dividerY - gap - titleFont * 0.85 : bottomAnchor - titleFont * 0.85

      if !oneLine.isEmpty {
        draw(oneLine, CGPoint(x: centerX, y: oneLineBaseline), UIFont.monospacedSystemFont(ofSize: oneLineFont, weight: .medium), .center)
        fillRect(CGRect(x: centerX - dividerW / 2, y: dividerY, width: dividerW, height: max(1, 2 * u)), radius: 0, color: UIColor(white: 1, alpha: 0.5))
      }
      if !caption.isEmpty {
        draw(caption, CGPoint(x: centerX, y: titleBaseline), UIFont.systemFont(ofSize: titleFont, weight: .bold), .center)
      }
      return
    }

    // "hero" 프리셋은 폐지됐다(2026-09-02, "크게" 삭제 요청) — 옛 저장분에 남아
    // 있어도 아래 'row' 처리로 자연히 떨어진다(TS stampLayoutDescriptors와 동일).

    // 'row' — 가운데 한 줄 + 문구는 그 위.
    let items = keyed.map { $0.1 }
    let centerX = canvasSize.width / 2 + CGFloat(stamp.stampX)
    let baseY = canvasSize.height * (1 - safeAreaBottomRatio) - 90 + CGFloat(stamp.stampY)

    if !caption.isEmpty {
      draw(caption, CGPoint(x: centerX, y: baseY - 58 * s), UIFont.systemFont(ofSize: 34 * s, weight: .medium), .center)
    }
    if !items.isEmpty {
      let fontSize: CGFloat = 28 * s
      let gap: CGFloat = 22 * s
      let font = UIFont.monospacedSystemFont(ofSize: fontSize, weight: .bold)
      let attrs: [NSAttributedString.Key: Any] = [.font: font, .foregroundColor: self.lineWarm]
      let widths = items.map { ($0 as NSString).size(withAttributes: attrs).width }
      let totalWidth = widths.reduce(0, +) + gap * CGFloat(items.count - 1)
      var cursorX = centerX - totalWidth / 2
      for (i, text) in items.enumerated() {
        draw(text, CGPoint(x: cursorX, y: baseY), font, .left)
        cursorX += widths[i] + gap
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
    stamp: RenderClipOptionsInput,
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

    // 배경은 프레임마다 안 바뀐다 — 화면 크기로 한 번만 크롭·스케일해 둔다.
    // (매 프레임 원본을 다시 그리면 디코딩·스케일 비용 + 임시 버퍼가 쌓인다.)
    let preparedBackground = self.prepareBackground(background)

    var thrown: Error?
    for frameIndex in 0..<ClipSpec.totalFrames {
      // 각 프레임의 임시 할당(UIImage·CGImage·CoreGraphics 그림자 버퍼)을 즉시 반환한다.
      // 이게 없으면 360프레임 × 수십 MB가 메서드가 끝날 때까지 쌓여 jetsam이 앱을 죽인다.
      autoreleasepool {
        // export-and-share FRD §2-3·F2: 취소하면 그 즉시 멈추고 미완성 파일을 지운다.
        if self.isCancelled {
          thrown = RouteRendererError.cancelled
          return
        }
        // 매 프레임 보내면 브리지에 과할 수 있어 6프레임(30fps 기준 5회/초)마다.
        if frameIndex % 6 == 0 {
          self.sendEvent("onRenderProgress", ["progress": Double(frameIndex) / Double(ClipSpec.totalFrames)])
        }

        let progressFraction: Double
        if frameIndex < ClipSpec.drawFrames {
          progressFraction = Double(frameIndex) / Double(ClipSpec.drawFrames)
        } else {
          progressFraction = 1.0 // 정지 구간: 완성된 경로 유지 (§5-3)
        }
        let frameImage = self.drawFrame(
          preset: preset,
          background: preparedBackground,
          projectedPoints: projectedPoints,
          cumulativeDistances: cumulativeDistances,
          totalDistance: totalDistance,
          progressFraction: progressFraction,
          stamp: stamp
        )

        guard let pixelBuffer = self.pixelBuffer(from: frameImage, pool: adaptor.pixelBufferPool) else {
          thrown = RouteRendererError.pixelBufferPoolMissing
          return
        }

        while !writerInput.isReadyForMoreMediaData && !self.isCancelled {
          Thread.sleep(forTimeInterval: 0.01)
        }
        let presentationTime = CMTime(value: Int64(frameIndex), timescale: ClipSpec.fps)
        adaptor.append(pixelBuffer, withPresentationTime: presentationTime)
      }

      if let error = thrown {
        writer.cancelWriting()
        try? FileManager.default.removeItem(at: outputURL)
        throw error
      }
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
