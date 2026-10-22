import AVFoundation
import CoreGraphics
import ExpoModulesCore
import UIKit
import VideoToolbox

// FRD: docs/specs/frd/background-selection.md §5 영상 처리, docs/specs/frd/route-rendering.md §8 배경 합성
// 구현 노트: docs/product/features/video-backgrounds.md
//
// 갤러리에서 고른 영상을 배경으로 쓴다. 두 부분으로 나뉜다.
// 1. 고를 때(prepare): 앞부분만 잘라 보관하고, 첫 장면 이미지와 방향을 반영한 크기·길이를 돌려준다.
// 2. 구울 때(VideoBackgroundSource): 클립 시각마다 깔 장면을 1080×1920으로 꺼낸다.

struct VideoCropInput: Record {
  /// 영상 방향을 반영한 화면 기준 픽셀 좌표. JS의 photoCropRect와 같은 값이다.
  @Field var originX: Double = 0
  @Field var originY: Double = 0
  @Field var width: Double = 0
  @Field var height: Double = 0
}

struct PreparedVideoPayload: Record {
  @Field var videoPath: String = ""
  @Field var posterPath: String = ""
  @Field var width: Double = 0
  @Field var height: Double = 0
  @Field var durationSec: Double = 0
}

enum VideoBackgroundError: Error, LocalizedError {
  case unsupported
  case exportFailed
  case posterFailed
  case unreadable

  var errorDescription: String? {
    switch self {
    case .unsupported: return "영상 트랙이 없는 파일입니다"
    case .exportFailed: return "영상을 준비하지 못했습니다"
    case .posterFailed: return "영상의 첫 장면을 만들지 못했습니다"
    case .unreadable: return "배경 영상을 읽을 수 없습니다"
    }
  }
}

/// 영상 트랙의 저장 방향(preferredTransform)을 반영한 화면 기준 크기와,
/// 원래 좌표를 그 화면 좌표(원점 0,0)로 옮기는 변환.
struct OrientedVideoTrack {
  let size: CGSize
  let transform: CGAffineTransform

  init(naturalSize: CGSize, preferredTransform: CGAffineTransform) {
    let rect = CGRect(origin: .zero, size: naturalSize).applying(preferredTransform)
    size = CGSize(width: abs(rect.width), height: abs(rect.height))
    transform = preferredTransform.concatenating(CGAffineTransform(translationX: -rect.minX, y: -rect.minY))
  }
}

enum VideoBackground {
  private static var workDirectory: URL {
    FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask)[0]
      .appendingPathComponent("video-backgrounds", isDirectory: true)
  }

  static func fileURL(_ path: String) -> URL {
    if let url = URL(string: path), url.isFileURL { return url }
    return URL(fileURLWithPath: path)
  }

  /// 클립은 영상 앞에서부터 쓰므로(FRD §5-1) 앞 `maxSeconds`만 남긴다. 소리는 넣지 않는다(§5-4).
  /// 다시 인코딩하지 않고 잘라서 옮긴다.
  static func prepare(inputUri: String, maxSeconds: Double) async throws -> PreparedVideoPayload {
    let source = AVURLAsset(url: fileURL(inputUri), options: [AVURLAssetPreferPreciseDurationAndTimingKey: true])
    guard let sourceTrack = try await source.loadTracks(withMediaType: .video).first else {
      throw VideoBackgroundError.unsupported
    }
    let sourceDuration = try await source.load(.duration)
    let seconds = CMTimeGetSeconds(sourceDuration)
    guard seconds.isFinite, seconds > 0 else { throw VideoBackgroundError.unsupported }

    let keep = CMTime(seconds: min(seconds, maxSeconds), preferredTimescale: 600)
    let composition = AVMutableComposition()
    guard let videoTrack = composition.addMutableTrack(withMediaType: .video, preferredTrackID: kCMPersistentTrackID_Invalid) else {
      throw VideoBackgroundError.exportFailed
    }
    try videoTrack.insertTimeRange(CMTimeRange(start: .zero, duration: keep), of: sourceTrack, at: .zero)
    videoTrack.preferredTransform = try await sourceTrack.load(.preferredTransform)

    try FileManager.default.createDirectory(at: workDirectory, withIntermediateDirectories: true)
    let id = UUID().uuidString
    let videoURL = workDirectory.appendingPathComponent("\(id).mov")
    let posterURL = workDirectory.appendingPathComponent("\(id)-poster.jpg")

    guard let export = AVAssetExportSession(asset: composition, presetName: AVAssetExportPresetPassthrough) else {
      throw VideoBackgroundError.exportFailed
    }
    export.outputURL = videoURL
    export.outputFileType = .mov
    await withCheckedContinuation { (continuation: CheckedContinuation<Void, Never>) in
      export.exportAsynchronously { continuation.resume() }
    }
    guard export.status == .completed else {
      try? FileManager.default.removeItem(at: videoURL)
      throw export.error ?? VideoBackgroundError.exportFailed
    }

    do {
      let prepared = AVURLAsset(url: videoURL, options: [AVURLAssetPreferPreciseDurationAndTimingKey: true])
      guard let track = try await prepared.loadTracks(withMediaType: .video).first else {
        throw VideoBackgroundError.unsupported
      }
      let oriented = OrientedVideoTrack(
        naturalSize: try await track.load(.naturalSize),
        preferredTransform: try await track.load(.preferredTransform)
      )
      let duration = CMTimeGetSeconds(try await prepared.load(.duration))

      let generator = AVAssetImageGenerator(asset: prepared)
      generator.appliesPreferredTrackTransform = true
      generator.requestedTimeToleranceBefore = .zero
      generator.requestedTimeToleranceAfter = CMTime(value: 1, timescale: 30)
      let poster: CGImage
      if #available(iOS 16.0, *) {
        poster = try await generator.image(at: .zero).image
      } else {
        poster = try generator.copyCGImage(at: .zero, actualTime: nil)
      }
      guard let data = UIImage(cgImage: poster).jpegData(compressionQuality: 0.95) else {
        throw VideoBackgroundError.posterFailed
      }
      try data.write(to: posterURL)

      let payload = PreparedVideoPayload()
      payload.videoPath = videoURL.absoluteString
      payload.posterPath = posterURL.absoluteString
      payload.width = Double(oriented.size.width)
      payload.height = Double(oriented.size.height)
      payload.durationSec = duration
      return payload
    } catch {
      try? FileManager.default.removeItem(at: videoURL)
      try? FileManager.default.removeItem(at: posterURL)
      throw error
    }
  }
}

/// 클립 시각마다 깔 배경 장면을 꺼낸다. 앞에서부터 차례로만 읽으므로 되감을 때는 처음부터 다시 연다.
///
/// FRD §5-1: 영상이 클립보다 짧으면 반복, 길면 앞부분만.
/// FRD §5-2: 3초 미만이면 반복하지 않고 마지막 장면에서 멈춘다.
/// 방향·자르기·1080×1920 축소·색 공간(일반 SDR)은 video composition이 한 번에 처리한다.
final class VideoBackgroundSource {
  private let asset: AVURLAsset
  private let track: AVAssetTrack
  private let composition: AVVideoComposition
  private let duration: Double
  private let freezesAtEnd: Bool
  private let halfFrame: Double

  private var reader: AVAssetReader?
  private var output: AVAssetReaderVideoCompositionOutput?
  private var pending: (time: Double, buffer: CVPixelBuffer)?
  private var exhausted = false
  private var lastLocalTime = -1.0
  private var currentImage: CGImage?

  /// 계측용. 영상 장면을 꺼내는 데 쓴 누적 시간(초).
  private(set) var readSeconds = 0.0

  init(path: String, crop: CGRect, outputSize: CGSize, fps: Int32) throws {
    asset = AVURLAsset(url: VideoBackground.fileURL(path), options: [AVURLAssetPreferPreciseDurationAndTimingKey: true])
    guard let track = asset.tracks(withMediaType: .video).first else { throw VideoBackgroundError.unreadable }
    self.track = track
    duration = CMTimeGetSeconds(asset.duration)
    guard duration.isFinite, duration > 0 else { throw VideoBackgroundError.unreadable }
    freezesAtEnd = duration < 3
    halfFrame = 0.5 / Double(fps)

    let oriented = OrientedVideoTrack(naturalSize: track.naturalSize, preferredTransform: track.preferredTransform)
    let area = crop.width > 0 && crop.height > 0 ? crop : Self.centerCrop(of: oriented.size, aspect: outputSize)
    let transform = oriented.transform
      .concatenating(CGAffineTransform(translationX: -area.minX, y: -area.minY))
      .concatenating(CGAffineTransform(scaleX: outputSize.width / area.width, y: outputSize.height / area.height))

    let video = AVMutableVideoComposition()
    video.renderSize = outputSize
    video.frameDuration = CMTime(value: 1, timescale: fps)
    video.colorPrimaries = AVVideoColorPrimaries_ITU_R_709_2
    video.colorTransferFunction = AVVideoTransferFunction_ITU_R_709_2
    video.colorYCbCrMatrix = AVVideoYCbCrMatrix_ITU_R_709_2
    let instruction = AVMutableVideoCompositionInstruction()
    instruction.timeRange = CMTimeRange(start: .zero, duration: asset.duration)
    let layer = AVMutableVideoCompositionLayerInstruction(assetTrack: track)
    layer.setTransform(transform, at: .zero)
    instruction.layerInstructions = [layer]
    video.instructions = [instruction]
    composition = video

    try startReading()
  }

  deinit { reader?.cancelReading() }

  /// 자르기 값이 없을 때(이전 저장분 등) 화면을 꽉 채우는 가운데 영역.
  private static func centerCrop(of size: CGSize, aspect: CGSize) -> CGRect {
    let target = aspect.width / aspect.height
    if size.width / size.height > target {
      let width = size.height * target
      return CGRect(x: (size.width - width) / 2, y: 0, width: width, height: size.height)
    }
    let height = size.width / target
    return CGRect(x: 0, y: (size.height - height) / 2, width: size.width, height: height)
  }

  private func startReading() throws {
    reader?.cancelReading()
    let reader = try AVAssetReader(asset: asset)
    let output = AVAssetReaderVideoCompositionOutput(
      videoTracks: [track],
      videoSettings: [kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA]
    )
    output.videoComposition = composition
    output.alwaysCopiesSampleData = false
    guard reader.canAdd(output) else { throw VideoBackgroundError.unreadable }
    reader.add(output)
    guard reader.startReading() else { throw reader.error ?? VideoBackgroundError.unreadable }
    self.reader = reader
    self.output = output
    pending = nil
    exhausted = false
  }

  private func readNext() throws -> (time: Double, buffer: CVPixelBuffer)? {
    guard !exhausted, let output, let reader else { return nil }
    if let sample = output.copyNextSampleBuffer(), let buffer = CMSampleBufferGetImageBuffer(sample) {
      return (CMTimeGetSeconds(CMSampleBufferGetPresentationTimeStamp(sample)), buffer)
    }
    exhausted = true
    // 끝까지 읽은 것과 읽다 실패한 것을 구분한다. 실패를 마지막 장면 정지로 덮으면 결과물이 조용히 틀린다.
    if reader.status == .failed { throw reader.error ?? VideoBackgroundError.unreadable }
    return nil
  }

  /// 클립 시각 `clipTime`(초)에 깔 장면. 꺼내지 못하면 nil이고, 그때는 첫 장면 이미지를 대신 쓴다.
  func image(atClipTime clipTime: Double) throws -> CGImage? {
    let start = CFAbsoluteTimeGetCurrent()
    defer { readSeconds += CFAbsoluteTimeGetCurrent() - start }

    let localTime: Double
    if freezesAtEnd { localTime = min(clipTime, duration) }
    else if clipTime < duration { localTime = clipTime }
    else { localTime = clipTime.truncatingRemainder(dividingBy: duration) }

    if localTime + 1e-6 < lastLocalTime {
      try startReading()
      currentImage = nil
    }
    lastLocalTime = localTime

    var latest: CVPixelBuffer?
    while true {
      if pending == nil { pending = try readNext() }
      guard let next = pending else { break }
      if next.time <= localTime + halfFrame || (currentImage == nil && latest == nil) {
        latest = next.buffer
        pending = nil
      } else {
        break
      }
    }
    if let latest {
      var image: CGImage?
      _ = VTCreateCGImageFromCVPixelBuffer(latest, options: nil, imageOut: &image)
      if let image { currentImage = image }
    }
    return currentImage
  }
}
