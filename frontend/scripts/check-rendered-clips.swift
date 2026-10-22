// 기존/개선 mp4의 규격·시각·디코딩 픽셀을 비교하는 macOS 검증 도구.
// 실행 방법은 docs/product/features/encoding-performance.md 참고.
import Foundation
import AVFoundation
import CoreVideo

func openClip(_ path: String) throws -> (AVAssetReader, AVAssetReaderTrackOutput, AVAssetTrack, Double) {
  let asset = AVURLAsset(url: URL(fileURLWithPath:path))
  guard let track = asset.tracks(withMediaType:.video).first else { fatalError("Missing video track") }
  let reader = try AVAssetReader(asset:asset)
  let output = AVAssetReaderTrackOutput(track:track, outputSettings:[kCVPixelBufferPixelFormatTypeKey as String:kCVPixelFormatType_32BGRA])
  output.alwaysCopiesSampleData = false
  reader.add(output)
  guard reader.startReading() else { throw reader.error! }
  return (reader,output,track,CMTimeGetSeconds(asset.duration))
}
let a = try openClip(CommandLine.arguments[1])
let b = CommandLine.arguments.count > 2 ? try openClip(CommandLine.arguments[2]) : nil
for clip in [a,b].compactMap({ $0 }) {
  guard clip.2.naturalSize == CGSize(width:1080,height:1920),
        abs(clip.2.nominalFrameRate-30) < 0.001,
        abs(clip.3-12) < 0.001 else { fatalError("Unexpected export specification") }
}
var frames=0, differingFrames=0, maxDelta=0
var absoluteError:UInt64=0, channels:UInt64=0
while let sample = a.1.copyNextSampleBuffer() {
  frames += 1
  if let b {
    guard let other = b.1.copyNextSampleBuffer(), let p=CMSampleBufferGetImageBuffer(sample),let q=CMSampleBufferGetImageBuffer(other) else { fatalError("Mismatched frame count") }
    guard CMSampleBufferGetPresentationTimeStamp(sample)==CMSampleBufferGetPresentationTimeStamp(other) else {fatalError("Mismatched frame time")}
    CVPixelBufferLockBaseAddress(p,.readOnly); CVPixelBufferLockBaseAddress(q,.readOnly)
    let width=CVPixelBufferGetWidth(p),height=CVPixelBufferGetHeight(p)
    guard width==CVPixelBufferGetWidth(q),height==CVPixelBufferGetHeight(q) else {fatalError("Mismatched dimensions")}
    let pa=CVPixelBufferGetBaseAddress(p)!.assumingMemoryBound(to:UInt8.self)
    let pb=CVPixelBufferGetBaseAddress(q)!.assumingMemoryBound(to:UInt8.self)
    var different=false
    for y in 0..<height {
      for x in 0..<width*4 where x%4 != 3 {
        let delta=abs(Int(pa[y*CVPixelBufferGetBytesPerRow(p)+x])-Int(pb[y*CVPixelBufferGetBytesPerRow(q)+x]))
        absoluteError += UInt64(delta); maxDelta=max(maxDelta,delta); different = different || delta != 0
      }
    }
    channels += UInt64(width*height*3)
    if different { differingFrames += 1 }
    CVPixelBufferUnlockBaseAddress(p,.readOnly); CVPixelBufferUnlockBaseAddress(q,.readOnly)
  }
}
guard a.0.status == .completed else { throw a.0.error! }
if let b { guard b.1.copyNextSampleBuffer()==nil,b.0.status == .completed else {fatalError("Second clip not fully read")} }
print("frames=\(frames) size=\(a.2.naturalSize) fps=\(a.2.nominalFrameRate) duration=\(a.3)")
if b != nil { print("differingFrames=\(differingFrames) maxChannelDelta=\(maxDelta) meanAbsoluteChannelError=\(Double(absoluteError)/Double(max(1,channels)))") }

guard frames == 360 else { fatalError("Expected 360 frames") }
if differingFrames > 0 { exit(1) }
