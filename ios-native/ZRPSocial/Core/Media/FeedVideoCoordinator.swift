import AVFoundation
import Combine
import SwiftUI
import UIKit

/// Decides which video in a timeline is playing, and owns the one player
/// that plays it.
///
/// **One** player, not one per card. A feed can hold many videos, and an
/// `AVPlayer` per card would keep several decoders and their buffers
/// alive at once - the thing that makes a video feed run a phone hot.
/// Cards report how much of themselves is on screen; the most visible
/// one above the threshold gets the player, and the rest show a poster.
///
/// The behaviour matches the website's: muted, looping, and playing only
/// while the video is genuinely in view (it uses a 0.6 intersection
/// threshold; so does this). Muted autoplay is also the only kind iOS
/// allows without a user gesture, so the mute toggle is the control that
/// actually starts sound.
@MainActor
final class FeedVideoCoordinator: ObservableObject {

    /// The post whose video currently owns the player.
    @Published private(set) var activeId: String?

    /// Sound is off until someone asks for it, and the choice then holds
    /// for the session - the same as the website, where unmuting one
    /// video unmutes the next. It is deliberately not persisted: a
    /// timeline that starts making noise on launch is not what anyone
    /// asked for.
    @Published private(set) var isMuted = true

    /// The shared player. `AVQueuePlayer` because looping is done with
    /// `AVPlayerLooper`, which needs one.
    let player = AVQueuePlayer()

    /// Fraction of each registered card that is on screen.
    private var visibility: [String: CGFloat] = [:]
    private var urls: [String: URL] = [:]
    private var looper: AVPlayerLooper?

    /// The website's own threshold: a video starts when 60% of it is
    /// showing, which keeps a half-scrolled card from stealing playback
    /// from the one being read.
    private static let playThreshold: CGFloat = 0.6

    init() {
        player.isMuted = true
        // Nothing here should interrupt music the person is already
        // playing, in this app or another one, so the feed's video never
        // takes the audio session while muted. Unmuting is what makes it
        // audible, and that is a deliberate act.
        player.actionAtItemEnd = .none
        player.preventsDisplaySleepDuringVideoPlayback = false
    }

    func register(id: String, url: String) {
        urls[id] = URL(string: url)
    }

    func unregister(id: String) {
        visibility[id] = nil
        urls[id] = nil
        if activeId == id { stop() }
    }

    /// Called as a card scrolls. Cheap enough to call on every geometry
    /// change: it only reassigns when the winner actually changes.
    func report(id: String, visibleFraction: CGFloat) {
        visibility[id] = visibleFraction
        reevaluate()
    }

    func toggleMute() {
        isMuted.toggle()
        player.isMuted = isMuted
        // Unmuting is a deliberate act, and the point at which this app
        // should own the audio session - otherwise the sound plays over
        // whatever else is going.
        if !isMuted {
            try? AVAudioSession.sharedInstance().setCategory(.playback)
            try? AVAudioSession.sharedInstance().setActive(true)
        }
    }

    /// Stops everything - for leaving a screen, or for the music player
    /// taking over.
    func stop() {
        player.pause()
        player.removeAllItems()
        looper = nil
        activeId = nil
    }

    private func reevaluate() {
        let winner = visibility
            .filter { $0.value >= Self.playThreshold }
            .max { $0.value < $1.value }?
            .key

        guard winner != activeId else { return }

        guard let winner, let url = urls[winner] else {
            stop()
            return
        }

        player.pause()
        player.removeAllItems()
        let item = AVPlayerItem(url: url)
        // `AVPlayerLooper` replaces the manual "seek to zero on end"
        // dance and loops without a visible gap.
        looper = AVPlayerLooper(player: player, templateItem: item)
        player.isMuted = isMuted
        player.play()
        activeId = winner
    }
}

/// The layer-backed view the shared player draws into.
///
/// A `UIView` whose backing layer IS an `AVPlayerLayer`, so there is no
/// second layer to keep in sync with the view's bounds - the usual
/// source of a video that lags a frame behind its own card during a
/// scroll.
final class PlayerLayerView: UIView {
    override static var layerClass: AnyClass { AVPlayerLayer.self }

    var playerLayer: AVPlayerLayer { layer as! AVPlayerLayer }

    var player: AVPlayer? {
        get { playerLayer.player }
        set { playerLayer.player = newValue }
    }
}

struct PlayerSurface: UIViewRepresentable {

    let player: AVPlayer?

    func makeUIView(context: Context) -> PlayerLayerView {
        let view = PlayerLayerView()
        // `resizeAspect` rather than fill: a video is framed by its own
        // aspect ratio here, and cropping one to a card's shape would
        // cut the subject out of a portrait clip.
        view.playerLayer.videoGravity = .resizeAspect
        view.backgroundColor = .black
        return view
    }

    func updateUIView(_ view: PlayerLayerView, context: Context) {
        guard view.player !== player else { return }
        view.player = player
    }
}
