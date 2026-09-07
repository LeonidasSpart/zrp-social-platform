import SwiftUI

/// ZRP Music Studio.
///
/// Publishing is gated server-side on an approved Creator status or a
/// verified Music Artist profile (`getMusicPublishAccess`). This screen
/// reads `GET /api/music/access` to decide what to show, but the gate
/// itself is enforced twice on the server - by the UploadThing
/// middleware and again by `POST /api/music/tracks` - so nothing here is
/// the thing granting permission.
struct MusicStudioView: View {

    @StateObject private var viewModel = MusicStudioViewModel()
    @State private var tab: Tab = .upload

    enum Tab: Hashable {
        case upload
        case tracks
        case albums
        case artist
    }

    var body: some View {
        content
            .background(ZrpColor.background.ignoresSafeArea())
            .navigationTitle(Text(.musicShellStudioLabel))
            .navigationBarTitleDisplayMode(.inline)
            .task {
                if case .loading = viewModel.phase { await viewModel.load() }
            }
    }

    @ViewBuilder
    private var content: some View {
        switch viewModel.phase {
        case .loading:
            TimelineStateView.loading()
        case .failed(let error):
            TimelineStateView.error(error) { Task { await viewModel.load() } }
        case .ready:
            if viewModel.canPublish {
                studio
            } else {
                MusicStudioGateView(viewModel: viewModel)
            }
        }
    }

    private var studio: some View {
        VStack(spacing: 0) {
            if let banner = viewModel.banner {
                bannerView(banner)
            }

            Picker(selection: $tab) {
                Text(.musicShellUploadMusic).tag(Tab.upload)
                Text(.musicStudioTabTracks).tag(Tab.tracks)
                Text(.musicStudioTabAlbums).tag(Tab.albums)
                Text(.musicStudioTabArtist).tag(Tab.artist)
            } label: {
                Text(.musicShellStudioLabel)
            }
            .labelsHidden()
            .pickerStyle(.segmented)
            .padding(.horizontal, ZrpSpacing.lg)
            .padding(.vertical, ZrpSpacing.sm)
            .accessibilityLabel(Text(.musicShellStudioLabel))

            Divider().overlay(ZrpColor.outline)

            switch tab {
            case .upload:
                MusicPublishView(viewModel: viewModel)
                    // A published track is the one action whose result
                    // lives on another tab. Moving there is the
                    // confirmation - otherwise the only sign of success
                    // is a form that emptied itself, which reads
                    // identically to a form that was cleared.
                    .onChange(of: viewModel.lastPublishedTrackId) { _, newValue in
                        if newValue != nil { tab = .tracks }
                    }
            case .tracks:
                MusicStudioTracksView(viewModel: viewModel)
            case .albums:
                MusicStudioAlbumsView(viewModel: viewModel)
            case .artist:
                MusicStudioArtistView(viewModel: viewModel)
            }
        }
    }

    private func bannerView(_ banner: MusicStudioViewModel.Banner) -> some View {
        Text(verbatim: banner.text)
            .font(.footnote.weight(.medium))
            .foregroundStyle(banner.kind == .success ? ZrpColor.green : ZrpColor.red)
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.horizontal, ZrpSpacing.lg)
            .padding(.vertical, ZrpSpacing.sm)
            .accessibilityAddTraits(.isStaticText)
            .onTapGesture { viewModel.banner = nil }
    }
}

/// Shown when the account may not publish yet.
///
/// Three genuinely different states, because they need different things
/// from the person: not signed in, awaiting verification, or eligible to
/// create an artist profile and apply.
struct MusicStudioGateView: View {

    @ObservedObject var viewModel: MusicStudioViewModel
    @State private var artistName = ""
    @State private var isApplying = false

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: ZrpSpacing.lg) {
                Image(systemName: "music.mic")
                    .font(.largeTitle)
                    .foregroundStyle(ZrpColor.onSurfaceMuted)

                if viewModel.access?.reason == "unauthenticated" {
                    Text(.musicShellSignInTitle)
                        .font(.title3.weight(.bold))
                        .foregroundStyle(ZrpColor.onSurface)
                    Text(.musicShellSignInBody)
                        .font(.subheadline)
                        .foregroundStyle(ZrpColor.onSurfaceMuted)
                } else if viewModel.isAwaitingVerification {
                    Text(.musicShellGateTitle)
                        .font(.title3.weight(.bold))
                        .foregroundStyle(ZrpColor.onSurface)
                    Text(.musicShellPendingVerification)
                        .font(.subheadline)
                        .foregroundStyle(ZrpColor.onSurfaceMuted)
                } else {
                    Text(.musicShellGateTitle)
                        .font(.title3.weight(.bold))
                        .foregroundStyle(ZrpColor.onSurface)
                    Text(.musicShellGateBody)
                        .font(.subheadline)
                        .foregroundStyle(ZrpColor.onSurfaceMuted)
                    Text(.musicShellApplyIntroPrefix)
                        .font(.footnote)
                        .foregroundStyle(ZrpColor.onSurfaceMuted)
                    applyForm
                }
            }
            .padding(ZrpSpacing.lg)
            .frame(maxWidth: ZrpMetrics.contentMaxWidth, alignment: .leading)
            .frame(maxWidth: .infinity)
        }
    }

    private var applyForm: some View {
        VStack(alignment: .leading, spacing: ZrpSpacing.md) {
            TextField(
                text: $artistName,
                prompt: Text(.musicShellArtistNamePlaceholder),
                label: { Text(.musicShellArtistNamePlaceholder) }
            )
            .labelsHidden()
            .textFieldStyle(.plain)
            .textInputAutocapitalization(.words)
            .autocorrectionDisabled()
            .padding(ZrpSpacing.md)
            .background(ZrpColor.surfaceElevated)
            .clipShape(RoundedRectangle(cornerRadius: ZrpRadius.md))

            Button {
                Task {
                    isApplying = true
                    await viewModel.applyAsArtist(displayName: artistName)
                    isApplying = false
                }
            } label: {
                Text(isApplying ? L10nKey.musicShellApplySubmitting : L10nKey.musicShellApplySubmit)
                    .font(.subheadline.weight(.bold))
                    .frame(maxWidth: .infinity)
                    .frame(minHeight: ZrpMetrics.minTouchTarget)
                    .background(ZrpColor.red)
                    .foregroundStyle(.white)
                    .clipShape(RoundedRectangle(cornerRadius: ZrpRadius.md))
            }
            .buttonStyle(.plain)
            .disabled(isApplying || artistName.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
        }
    }
}
