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
        .aspectRatio(16.0 / 9.0, contentMode: .fit)
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
                        videos.report(id: id, visibleFraction: Self.fraction(of: frame))
                    }
                    .onAppear {
                        videos.register(id: id, url: url)
                        videos.report(id: id, visibleFraction: Self.fraction(
                            of: proxy.frame(in: .global)
                        ))
                    }
                    .onDisappear { videos.unregister(id: id) }
            }
        }
    }

    /// How much of `frame` lies inside the window, 0…1 by height.
    ///
    /// Height alone: a timeline scrolls vertically, and a card is always
    /// full width, so the horizontal extent carries no information.
    private static func fraction(of frame: CGRect) -> CGFloat {
        guard frame.height > 0 else { return 0 }
        guard let window = UIApplication.shared.connectedScenes
            .compactMap({ $0 as? UIWindowScene })
            .flatMap(\.windows)
            .first(where: \.isKeyWindow)
        else {
            return 0
        }
        let visible = frame.intersection(window.bounds).height
        return max(0, min(1, visible / frame.height))
    }
}
