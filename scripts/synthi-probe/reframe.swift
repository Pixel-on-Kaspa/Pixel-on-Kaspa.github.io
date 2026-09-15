// Reframe a square clip to 9:16 using AVFoundation, and remux it properly on the
// way out: the source is a fragmented MP4 with a zero-duration header (browser
// MediaRecorder output), which upload APIs can choke on.
import AVFoundation
import Foundation

let a = CommandLine.arguments
guard a.count >= 3 else { print("usage: reframe <in> <out> [W H]"); exit(1) }
let src = URL(fileURLWithPath: a[1]), dst = URL(fileURLWithPath: a[2])
let W = CGFloat(a.count > 3 ? Double(a[3])! : 1080), H = CGFloat(a.count > 4 ? Double(a[4])! : 1920)
try? FileManager.default.removeItem(at: dst)

let asset = AVURLAsset(url: src, options: [AVURLAssetPreferPreciseDurationAndTimingKey: true])
let s1 = DispatchSemaphore(value: 0)
asset.loadValuesAsynchronously(forKeys: ["tracks", "duration"]) { s1.signal() }
s1.wait()

guard let vt = asset.tracks(withMediaType: .video).first else { print("no video track"); exit(1) }
let dur = asset.duration
let sz = vt.naturalSize
let fps = vt.nominalFrameRate > 0 ? vt.nominalFrameRate : 30
print(String(format: "source  %.0fx%.0f  %.2fs  %.1f fps  %.1f Mb/s  audio:%@",
             sz.width, sz.height, CMTimeGetSeconds(dur), fps, vt.estimatedDataRate/1e6,
             asset.tracks(withMediaType: .audio).isEmpty ? "no" : "yes"))

let comp = AVMutableComposition()
let cv = comp.addMutableTrack(withMediaType: .video, preferredTrackID: kCMPersistentTrackID_Invalid)!
try cv.insertTimeRange(CMTimeRange(start: .zero, duration: dur), of: vt, at: .zero)
if let at = asset.tracks(withMediaType: .audio).first {
  let ca = comp.addMutableTrack(withMediaType: .audio, preferredTrackID: kCMPersistentTrackID_Invalid)!
  try ca.insertTimeRange(CMTimeRange(start: .zero, duration: dur), of: at, at: .zero)
}

// fit the square to the full width, centre it vertically — a Lissajous sits on
// black, so the bars above and below are invisible rather than letterboxing
let scale = W / sz.width
let tx = (W - sz.width * scale) / 2, ty = (H - sz.height * scale) / 2
let li = AVMutableVideoCompositionLayerInstruction(assetTrack: cv)
li.setTransform(CGAffineTransform(scaleX: scale, y: scale)
                  .concatenating(CGAffineTransform(translationX: tx, y: ty)), at: .zero)
let inst = AVMutableVideoCompositionInstruction()
inst.timeRange = CMTimeRange(start: .zero, duration: dur)
inst.layerInstructions = [li]
inst.backgroundColor = CGColor(red: 0, green: 0, blue: 0, alpha: 1)

let vc = AVMutableVideoComposition()
vc.renderSize = CGSize(width: W, height: H)
vc.frameDuration = CMTime(value: 1, timescale: CMTimeScale(round(fps)))
vc.instructions = [inst]

guard let ex = AVAssetExportSession(asset: comp, presetName: AVAssetExportPresetHighestQuality) else {
  print("no export session"); exit(1) }
ex.outputURL = dst; ex.outputFileType = .mp4
ex.videoComposition = vc
ex.shouldOptimizeForNetworkUse = true      // faststart: moov up front
let s2 = DispatchSemaphore(value: 0)
ex.exportAsynchronously { s2.signal() }
s2.wait()
guard ex.status == .completed else { print("export failed: \(ex.error?.localizedDescription ?? "?")"); exit(1) }
print("done")
