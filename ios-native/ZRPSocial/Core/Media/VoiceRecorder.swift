import AVFoundation
import Foundation

/// Records a voice note to a file the uploader can stream.
///
/// AAC in an MP4 container (`.m4a`). Chosen because it is what every
/// other ZRP client can play back: the web chat renders voice notes in a
/// plain `<audio>` element, and Safari, Chrome and Firefox all decode
/// AAC/M4A. Recording Apple Lossless or a raw PCM `.caf` would produce
/// notes that play on iPhone and nowhere else - a message nobody can
/// hear is worse than no message.
@MainActor
final class VoiceRecorder: NSObject, ObservableObject {

    enum Failure: Error {
        case permissionDenied
        case couldNotStart
    }

    @Published private(set) var isRecording = false

    /// Whole seconds, which is the resolution the marker records.
    @Published private(set) var elapsedSeconds = 0

    /// 0...1, for a level meter. Smoothed from the recorder's dBFS power
    /// reading, which runs roughly -160 (silence) to 0 (clipping).
    @Published private(set) var level: Double = 0

    /// The route's own ceiling is 8MB; at this bitrate that is far more
    /// than four minutes, so the real reason for a cap is that nobody
    /// wants a forty-minute voice note - and a recording that stops on
    /// its own is better than one that fails at upload.
    static let maximumSeconds = 300

    private var recorder: AVAudioRecorder?
    private var ticker: Timer?
    private var fileURL: URL?

    /// Asks for the microphone.
    ///
    /// `NSMicrophoneUsageDescription` must exist in Info.plist or iOS
    /// terminates the process the moment this is called - not a
    /// permission denial, a crash. See Supporting/Info.plist.
    static func requestPermission() async -> Bool {
        await withCheckedContinuation { continuation in
            AVAudioApplication.requestRecordPermission { granted in
                continuation.resume(returning: granted)
            }
        }
    }

    func start() async throws {
        guard !isRecording else { return }
        guard await Self.requestPermission() else { throw Failure.permissionDenied }

        // `.playAndRecord` rather than `.record`: the thread can play a
        // received voice note, and switching categories mid-screen makes
        // playback stutter. `.defaultToSpeaker` because a chat recording
        // routed to the earpiece sounds broken to someone holding the
        // phone in front of them.
        let session = AVAudioSession.sharedInstance()
        do {
            try session.setCategory(.playAndRecord, mode: .default, options: [.defaultToSpeaker])
            try session.setActive(true)
        } catch {
            throw Failure.couldNotStart
        }

        let url = FileManager.default.temporaryDirectory
            .appendingPathComponent("zrp-voice-\(UUID().uuidString)")
            .appendingPathExtension("m4a")

        let settings: [String: Any] = [
            AVFormatIDKey: Int(kAudioFormatMPEG4AAC),
            // Speech, not music. 44.1kHz stereo would quadruple the file
            // for no audible gain on a voice note.
            AVSampleRateKey: 44_100,
            AVNumberOfChannelsKey: 1,
            AVEncoderBitRateKey: 64_000,
            AVEncoderAudioQualityKey: AVAudioQuality.medium.rawValue,
        ]

        do {
            let recorder = try AVAudioRecorder(url: url, settings: settings)
            recorder.isMeteringEnabled = true
            guard recorder.record() else { throw Failure.couldNotStart }
            self.recorder = recorder
            self.fileURL = url
        } catch {
            throw Failure.couldNotStart
        }

        isRecording = true
        elapsedSeconds = 0
        level = 0
        startTicking()
    }

    private func startTicking() {
        ticker?.invalidate()
        ticker = Timer.scheduledTimer(withTimeInterval: 0.1, repeats: true) { [weak self] _ in
            MainActor.assumeIsolated {
                guard let self, let recorder = self.recorder, recorder.isRecording else { return }
                recorder.updateMeters()
                // dBFS is logarithmic and mostly negative; anything under
                // -50 is effectively silence for a level meter.
                let power = Double(recorder.averagePower(forChannel: 0))
                self.level = max(0, min(1, (power + 50) / 50))
                self.elapsedSeconds = Int(recorder.currentTime)

                if self.elapsedSeconds >= Self.maximumSeconds {
                    // Stopping on its own beats failing at upload.
                    _ = self.finish()
                }
            }
        }
    }

    /// Stops and hands back the finished file, or nil if nothing usable
    /// was recorded.
    ///
    /// A note shorter than a second is treated as a mis-tap and
    /// discarded: it is almost always somebody who pressed the button by
    /// accident, and sending it would put an unplayable blip in a thread.
    func finish() -> (url: URL, seconds: Int)? {
        guard let recorder, let fileURL else { return nil }
        let seconds = Int(recorder.currentTime.rounded())
        recorder.stop()
        teardown()

        guard seconds >= 1 else {
            try? FileManager.default.removeItem(at: fileURL)
            self.fileURL = nil
            return nil
        }
        self.fileURL = nil
        return (fileURL, seconds)
    }

    /// Abandons the recording and deletes the file.
    func cancel() {
        recorder?.stop()
        if let fileURL { try? FileManager.default.removeItem(at: fileURL) }
        fileURL = nil
        teardown()
    }

    private func teardown() {
        ticker?.invalidate()
        ticker = nil
        recorder = nil
        isRecording = false
        level = 0
        // Handing the session back matters: leaving it active and in
        // `.playAndRecord` keeps the orange recording indicator lit and
        // leaves other apps' audio ducked.
        try? AVAudioSession.sharedInstance().setActive(
            false,
            options: [.notifyOthersOnDeactivation]
        )
    }

    /// A recording left running when the thread closes is deleted, not
    /// leaked. Called from the view's disappear.
    func discardIfRecording() {
        if isRecording { cancel() }
    }
}
