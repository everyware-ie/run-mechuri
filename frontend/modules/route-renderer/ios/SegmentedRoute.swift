import Foundation
import CoreGraphics

struct RouteVertex {
  var point: CGPoint
  var segment: Int
  var x: CGFloat { point.x }
  var y: CGFloat { point.y }
}

enum SegmentedRoute {
  static func cumulative(_ points: [RouteVertex]) -> [Double] {
    guard !points.isEmpty else { return [] }
    var result = [0.0]
    for i in 1..<points.count {
      let distance = points[i].segment == points[i - 1].segment
        ? Double(hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y)) : 0
      result.append(result[i - 1] + distance)
    }
    return result
  }
  static func prefix(distance: Double, points: [RouteVertex], cumulative: [Double]) -> [RouteVertex] {
    guard let first = points.first else { return [] }
    if distance <= 0 { return [first] }
    var result = [first]
    for i in 1..<points.count {
      if cumulative[i] <= distance { result.append(points[i]) }
      else {
        let length = cumulative[i] - cumulative[i - 1]
        let t = CGFloat(length > 0 ? (distance - cumulative[i - 1]) / length : 0)
        result.append(RouteVertex(point: CGPoint(x: points[i - 1].x + (points[i].x - points[i - 1].x) * t,
          y: points[i - 1].y + (points[i].y - points[i - 1].y) * t), segment: points[i].segment))
        break
      }
    }
    return result
  }
}
