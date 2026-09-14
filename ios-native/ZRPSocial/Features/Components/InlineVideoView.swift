import AVFoundation
import SwiftUI
import UIKit

/// A post's video, playing in the timeline.
///
/// Shows the shared player only while this card owns it; every other
/// card shows a still poster. Tapping opens the full-screen viewer,
/// which is where scrubbing, volume and AirPlay live - a card is too
/// small for a control bar, and the website's inline video has none
/// either.
struct InlineVideoView: View {

    /// Identifies this card to the coordinator. The post's id, so two
    /// cards for the same post in different lists do not fight.
    let id: String
    let url: String

    var onOpenFullScreen: () -> Void

    @EnvironmentObject private var videos: FeedVideoCoordinator
    @EnvironmentObject private var music: MusicPlayer

    /// The video's own real shape, read once from its asset. Defaults to
    /// 16:9 until that load completes - the same "assume, then correct"
    /// order the web (`captureVideoAspect`/`videoAspectRatio`) and Android
    /// (`PostVideoPlayer`'s `onVideoSizeChanged`) fixes use. Kept separate
    /// from the shared `FeedVideoCoordinator` player on purpose: only one
    /// post's video is ever loaded into that player at a time, but every
    /// card in the feed still needs its own correct box shape - including
    /// the ones currently showing a poster, not playing.
    @State private var videoAspectRatio: CGFloat = 16.0 / 9.0

    private var isActive: Bool { videos.activeId == id }

    var body: some View {
        ZStack {
            Color.black

            if isActive {
                PlayerSurface(player: videos.player)
            } else {
                // Not the still frame of the video: extracting one costs
                // a download and a decode per card, which is exactly the
                // work this design avoids. A card that is not playing
                // shows the same affordance it did before.
                Image(systemName: "play.circle.fill")
                    .font(.system(size: 56))
                    .foregroundStyle(.white.opacity(0.9))
                    .shadow(radius: 8)
            }
        }
        .frame(maxWidth: .infinity)
        .aspectRatio(videoAspectRatio, contentMode: .fit)
        .clipShape(RoundedRectangle(cornerRadius: ZrpRadius.md, style: .continuous))
        .overlay(alignment: .bottomTrailing) {
            if isActive {
                Button {
                    // Unmuting a feed video while ZRP's own music is
                    // playing would put two things through the speaker
                    // at once. The video is the thing being looked at,
                    // so the music yields - and only on a deliberate
                    // unmute, never on autoplay.
                    if videos.isMuted, music.isPlaying { music.pause() }
                    videos.toggleMute()
                } label: {
                    Image(systemName: videos.isMuted ? "speaker.slash.fill" : "speaker.wave.2.fill")
                        .font(.footnote)
                        .foregroundStyle(.white)
                        .padding(ZrpSpacing.sm)
                        .background(.black.opacity(0.55), in: Circle())
                }
                .buttonStyle(.plain)
                .padding(ZrpSpacing.md)
                .accessibilityLabel(
                    Text(videos.isMuted ? L10nKey.iosA11yUnmute : L10nKey.iosA11yMute)
                )
            }
        }
        .contentShape(Rectangle())
        .onTapGesture { onOpenFullScreen() }
        .accessibilityElement(children: .contain)
        .accessibilityAddTraits(.isButton)
        .accessibilityLabel(Text(.iosA11yPlayVideo))
        .background {
            // Reports how much of this card is on screen, so the
            // coordinator can pick the one video that plays. `.global`
            // is the window's space; the window's own bounds are the
            // viewport to measure against.
            GeometryReader { proxy in
                Color.clear
                    .onChange(of: proxy.frame(in: .global)) { _, frame in
                        videos.report(id: id, visibleFraction: ScreenVisibility.fraction(of: frame))
                    }
                    .onAppear {
                        videos.register(id: id, url: url)
                        videos.report(
                            id: id,
                            visibleFraction: ScreenVisibility.fraction(
                                of: proxy.frame(in: .global)
                            )
                        )
                    }
                    .onDisappear { videos.unregister(id: id) }
            }
        }
        .task(id: url) { await loadVideoAspectRatio() }
    }

    /// Reads this video's real, rotation-corrected display size and
    /// updates `videoAspectRatio` once it is known, so SwiftUI re-lays out
    /// the card at its actual shape instead of the assumed 16:9 default.
    ///
    /// `naturalSize` alone is the CODED frame, not the displayed one - a
    /// clip shot in portrait is very often stored as a landscape frame
    /// plus a 90/270 `preferredTransform` meant to rotate it at playback
    /// time (AVFoundation's equivalent of ExoPlayer's
    /// `unappliedRotationDegrees`, handled the same way in the Android
    /// fix). Applying the transform to the natural size before taking its
    /// width/height is what corrects for that; skipping it reproduces the
    /// exact same "wrong box" bug this method exists to fix.
    ///
    /// Uses its own `AVURLAsset` rather than the coordinator's shared
    /// `AVPlayer` - that player only ever holds the one post currently
    /// playing, but every card, playing or not, needs its own box shape.
    private func loadVideoAspectRatio() async {
        guard let assetURL = URL(string: url) else { return }
        let asset = AVURLAsset(url: assetURL)
        guard let track = try? await asset.loadTracks(withMediaType: .video).first else { return }
        guard let (naturalSize, transform) = try? await track.load(.naturalSize, .preferredTransform) else {
            return
        }
        guard !Task.isCancelled else { return }

        let displaySize = naturalSize.applying(transform)
        let width = abs(displaySize.width)
        let height = abs(displaySize.height)
        guard width > 0, height > 0 else { return }

        videoAspectRatio = width / height
    }
}
