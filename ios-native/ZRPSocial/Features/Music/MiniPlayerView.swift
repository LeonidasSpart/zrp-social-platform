import SwiftUI

/// The persistent mini-player.
///
/// Present in every tab of the signed-in app once something is playing,
/// and absent entirely before that - a permanently visible empty bar
/// would just be a strip of wasted screen.
struct MiniPlayerView: View {

    @EnvironmentObject private var player: MusicPlayer

    var body: some View {
        if let track = player.current {
            Button {
                player.isExpanded = true
            } label: {
                VStack(spacing: 0) {
                    // A hairline progress line rather than a full slider:
                    // the mini-player shows position, the expanded player
                    // is where it is changed.
                    GeometryReader { geometry in
                        Rectangle()
                            .fill(ZrpColor.red)
                            .frame(width: geometry.size.width * progressFraction)
                    }
                    .frame(height: 2)
                    .background(ZrpColor.outline)

                    HStack(spacing: ZrpSpacing.md) {
                        TrackArtworkView(url: track.artworkURL, side: 40)

                        VStack(alignment: .leading, spacing: 1) {
                            Text(verbatim: track.title)
                                .font(.footnote.weight(.semibold))
                                .foregroundStyle(ZrpColor.onSurface)
                                .lineLimit(1)
                            Text(verbatim: track.artistName)
                                .font(.caption2)
                                .foregroundStyle(ZrpColor.onSurfaceMuted)
                                .lineLimit(1)
                        }

                        Spacer(minLength: 0)

                        Button {
                            player.togglePlayPause()
                        } label: {
                            Image(systemName: player.isPlaying ? "pause.fill" : "play.fill")
                                .font(.title3)
                                .foregroundStyle(ZrpColor.onSurface)
                                .frame(
                                    width: ZrpMetrics.minTouchTarget,
                                    height: ZrpMetrics.minTouchTarget
                                )
                                .contentShape(Rectangle())
                        }
                        .buttonStyle(.plain)
                        .accessibilityLabel(
                            Text(player.isPlaying ? L10nKey.musicCommonPause : L10nKey.musicCommonPlay)
                        )

                        Button {
                            player.next()
                        } label: {
                            Image(systemName: "forward.fill")
                                .font(.subheadline)
                                .foregroundStyle(ZrpColor.onSurface)
                                .frame(
                                    width: ZrpMetrics.minTouchTarget,
                                    height: ZrpMetrics.minTouchTarget
                                )
                                .contentShape(Rectangle())
                        }
                        .buttonStyle(.plain)
                        .accessibilityLabel(Text(.musicCommonNext))
                    }
                    .padding(.horizontal, ZrpSpacing.md)
                    .padding(.vertical, ZrpSpacing.sm)
                }
                .background(.bar)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel(Text(.musicPlayerOpenNowPlayingAria))
        }
    }

    private var progressFraction: Double {
        guard player.duration > 0 else { return 0 }
        return min(max(player.elapsed / player.duration, 0), 1)
    }
}

/// Square track artwork with a consistent fallback.
struct TrackArtworkView: View {

    let url: String?
    var side: CGFloat = 56
    var cornerRadius: CGFloat = ZrpRadius.sm

    var body: some View {
        Group {
            RemoteImage(url: url, targetSize: side) { placeholder }
                .scaledToFill()
        }
        .frame(width: side, height: side)
        .clipped()
        .clipShape(RoundedRectangle(cornerRadius: cornerRadius, style: .continuous))
        .accessibilityHidden(true)
    }

    private var placeholder: some View {
        ZStack {
            ZrpColor.surfaceHighest
            Image(systemName: "music.note")
                .font(.system(size: side * 0.35))
                .foregroundStyle(ZrpColor.onSurfaceMuted)
        }
    }
}
