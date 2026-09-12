import AVFoundation
import Combine
import Foundation

/// Plays voice notes, one at a time, across every chat bubble.
///
/// A shared player rather than one per bubble, for a reason anyone who
/// has used a chat app will recognise: tapping a second note must stop
/// the first. Per-bubble players would talk over each other, and each
/// would separately claim the audio session.
@MainActor
final class VoiceNotePlayer: NSObject, ObservableObject {

    static let shared = VoiceNotePlayer()

    /// The URL currently loaded, playing or paused. Bubbles compare
    /// against their own to decide which one shows a pause button.
    @Published private(set) var currentURL: String?
    @Published private(set) var isPlaying = false
    @Published private(set) var progress: Double = 0
    @Published private(set) var duration: Double = 0
    @Published private(set) var isLoading = false

    private var player: AVPlayer?
    private var timeObserver: Any?
    private var endObserver: NSObjectProtocol?

    private override init() {
        super.init()
    }

    func isCurrent(_ url: String?) -> Bool {
        guard let url, let currentURL else { return false }
        return url == currentURL
    }

    /// Toggles this note: starts it, pauses it, or resumes it.
    func toggle(_ urlString: String) {
        if isCurrent(urlString) {
            isPlaying ? pause() : resume()
        } else {
            play(urlString)
        }
    }

    private func play(_ urlString: String) {
        guard let url = URL(string: urlString) else { return }
        stop()

        // `.playback` so a voice note is audible with the ringer switch
        // set to silent - the same expectation every chat app sets, and
        // the opposite of a notification sound.
        let session = AVAudioSession.sharedInstance()
        try? session.setCategory(.playback, mode: .spokenAudio)
        try? session.setActive(true)

        let item = AVPlayerItem(url: url)
        let player = AVPlayer(playerItem: item)
        self.player = player
        currentURL = urlString
        isLoading = true
        progress = 0
        duration = 0

        timeObserver = player.addPeriodicTimeObserver(
            forInterval: CMTime(seconds: 0.1, preferredTimescale: 600),
            queue: .main
        ) { [weak self] time in
            MainActor.assumeIsolated {
                guard let self else { return }
                let total = item.duration.seconds
                if total.isFinite, total > 0 {
                    self.duration = total
                    self.progress = min(1, time.seconds / total)
                    self.isLoading = false
                }
            }
        }

        endObserver = NotificationCenter.default.addObserver(
            forName: .AVPlayerItemDidPlayToEndTime,
            object: item,
            queue: .main
        ) { [weak self] _ in
            MainActor.assumeIsolated {
                // Rewound rather than cleared, so the bubble keeps its
                // player and can be replayed with one tap.
                self?.isPlaying = false
                self?.progress = 0
                self?.player?.seek(to: .zero)
            }
        }

        player.play()
        isPlaying = true
    }

    func pause() {
        player?.pause()
        isPlaying = false
    }

    func resume() {
        player?.play()
        isPlaying = true
    }

    /// Tears the current note down completely. Called when another note
    /// starts and when a thread closes.
    func stop() {
        if let timeObserver, let player {
            player.removeTimeObserver(timeObserver)
        }
        timeObserver = nil
        if let endObserver { NotificationCenter.default.removeObserver(endObserver) }
        endObserver = nil
        player?.pause()
        player = nil
        currentURL = nil
        isPlaying = false
        isLoading = false
        progress = 0
        duration = 0
    }
}
