import Foundation
import CoreGraphics
@main struct SegmentedRouteChecks {
  static func main() {
    let points = [RouteVertex(point: CGPoint(x: 0, y: 0), segment: 0), RouteVertex(point: CGPoint(x: 10, y: 0), segment: 0),
      RouteVertex(point: CGPoint(x: 1000, y: 0), segment: 2), RouteVertex(point: CGPoint(x: 1010, y: 0), segment: 2)]
    let distances = SegmentedRoute.cumulative(points)
    precondition(distances == [0, 10, 10, 20], "Missing route must not add distance")
    let mid = SegmentedRoute.prefix(distance: 15, points: points, cumulative: distances)
    precondition(mid.last!.x == 1005 && mid.last!.segment == 2, "Interpolation starts within the next segment")
    let boundary = SegmentedRoute.prefix(distance: 10, points: points, cumulative: distances)
    precondition(boundary.last!.segment == 2 && boundary.last!.x == 1000, "Boundary crosses with a move, never a line")
    precondition(SegmentedRoute.prefix(distance: 0, points: points, cumulative: distances).count == 1)
    precondition(SegmentedRoute.prefix(distance: 20, points: points, cumulative: distances).count == 4)
    precondition(SegmentedRoute.cumulative([]).isEmpty)
    print("Segmented route: 6 checks passed")
  }
}
