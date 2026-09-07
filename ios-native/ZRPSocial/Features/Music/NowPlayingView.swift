import SwiftUI

/// The expanded player.
struct NowPlayingView: View {

    @EnvironmentObject private var player: MusicPlayer
    @Environment(\.dismiss) private var dismiss

    /// While the listener is dragging, the slider shows their position
    /// rather than the player's - otherwise the periodic time observer
    /// fights the drag and the thumb jitters.
    @State private var scrubTarget: Double?
    @State private var isScrubbing = false

    /// The track being added to a playlist. Presented from here rather
    /// than from a track row: this screen is a single view that is never
    /// recycled, so a sheet raised from it cannot be torn down
    /// mid-presentation the way one raised from inside a lazy list is.
    @State private var addingToPlaylist: MusicTrack?

    @EnvironmentObject private var session: SessionController

    var body: some View {
        NavigationStack {
            VStack(spacing: ZrpSpacing.xl) {
                artwork
                titles
                scrubber
                transport
                secondaryControls
                Spacer(minLength: 0)
            }
            .padding(ZrpSpacing.xl)
            .frame(maxWidth: ZrpMetrics.contentMaxWidth)
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .background(ZrpColor.background.ignoresSafeArea())
            .navigationTitle(Text(.musicPlayerNowPlayingLabel))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button { dismiss() } label: {
                        Image(systemName: "chevron.down")
                    }
                    .accessibilityLabel(Text(.musicPlayerCloseAria))
                }

                // Playlists are the viewer's own, so the route needs a
                // session and this is not offered without one.
                if let current = player.current, session.currentUser != nil {
                    ToolbarItem(placement: .topBarTrailing) {
                        Button { addingToPlaylist = current } label: {
                            Image(systemName: "text.badge.plus")
                        }
                        .accessibilityLabel(Text(.iosPlaylistAddTo))
                    }
                }
            }
            .sheet(item: $addingToPlaylist) { track in
                MusicAddToPlaylistView(track: track)
            }
        }
    }

    private var artwork: some View {
        TrackArtworkView(
            url: player.current?.artworkURL,
            side: 280,
            cornerRadius: ZrpRadius.lg
        )
        .shadow(color: .black.opacity(0.25), radius: 20, y: 10)
    }

    private var titles: some View {
        VStack(spacing: ZrpSpacing.xs) {
            Text(verbatim: player.current?.title ?? "")
                .font(.title3.weight(.bold))
                .foregroundStyle(ZrpColor.onSurface)
                .multilineTextAlignment(.center)
                .lineLimit(2)

            Text(verbatim: player.current?.artistName ?? "")
                .font(.subheadline)
                .foregroundStyle(ZrpColor.onSurfaceMuted)
                .lineLimit(1)

            if player.current?.explicit == true {
                Text(.iosMusicExplicit)
                    .font(.caption2.weight(.semibold))
                    .padding(.horizontal, ZrpSpacing.sm)
                    .padding(.vertical, 2)
                    .background(ZrpColor.surfaceHighest)
                    .foregroundStyle(ZrpColor.onSurfaceMuted)
                    .clipShape(Capsule())
            }
        }
        .accessibilityElement(children: .combine)
    }

    private var scrubber: some View {
        VStack(spacing: ZrpSpacing.xs) {
            Slider(
                value: Binding(
                    get: { scrubTarget ?? player.elapsed },
                    set: { scrubTarget = $0 }
                ),
                in: 0...max(player.duration, 1),
                onEditingChanged: { editing in
                    isScrubbing = editing
                    if !editing, let target = scrubTarget {
                        player.seek(to: target)
                        scrubTarget = nil
                    }
                }
            )
            .tint(ZrpColor.red)
            // A track with no known duration cannot be scrubbed
            // meaningfully - the slider would span an invented range.
            .disabled(player.duration <= 0)

            HStack {
                Text(verbatim: Self.timeLabel(scrubTarget ?? player.elapsed))
                Spacer()
                Text(verbatim: Self.timeLabel(player.duration))
            }
            .font(.caption2.monospacedDigit())
            .foregroundStyle(ZrpColor.onSurfaceMuted)
        }
    }

    private var transport: some View {
        HStack(spacing: ZrpSpacing.xxl) {
            Button { player.previous() } label: {
                Image(systemName: "backward.fill").font(.title2)
            }
            .accessibilityLabel(Text(.musicCommonPrevious))

            Button { player.togglePlayPause() } label: {
                Image(systemName: player.isPlaying ? "pause.circle.fill" : "play.circle.fill")
                    .font(.system(size: 64))
                    .foregroundStyle(ZrpColor.red)
            }
            .accessibilityLabel(
                Text(player.isPlaying ? L10nKey.musicCommonPause : L10nKey.musicCommonPlay)
            )

            Button { player.next() } label: {
                Image(systemName: "forward.fill").font(.title2)
            }
            .accessibilityLabel(Text(.musicCommonNext))
        }
        .foregroundStyle(ZrpColor.onSurface)
        .frame(minHeight: ZrpMetrics.minTouchTarget)
    }

    private var secondaryControls: some View {
        HStack(spacing: ZrpSpacing.xxl) {
            Button { player.toggleShuffle() } label: {
                Image(systemName: "shuffle")
                    .foregroundStyle(player.isShuffled ? ZrpColor.red : ZrpColor.onSurfaceMuted)
            }
            .accessibilityLabel(Text(.musicCommonShuffle))
            .accessibilityAddTraits(player.isShuffled ? [.isSelected, .isButton] : .isButton)

            Button { player.cycleRepeatMode() } label: {
                Image(systemName: player.repeatMode == .one ? "repeat.1" : "repeat")
                    .foregroundStyle(
                        player.repeatMode == .off ? ZrpColor.onSurfaceMuted : ZrpColor.red
                    )
            }
            .accessibilityLabel(Text(.musicCommonRepeat))
            .accessibilityAddTraits(player.repeatMode == .off ? .isButton : [.isSelected, .isButton])
        }
        .font(.title3)
        .frame(minHeight: ZrpMetrics.minTouchTarget)
    }

    /// `m:ss`, or `--:--` when the duration is genuinely unknown - which
    /// happens for tracks published before duration was captured. Playing
    /// one reports its real length back and repairs it; see
    /// `MusicRepository.reportPlay`.
    static func timeLabel(_ seconds: Double) -> String {
        guard seconds.isFinite, seconds > 0 else { return "--:--" }
        let total = Int(seconds)
        return String(format: "%d:%02d", total / 60, total % 60)
    }
}
