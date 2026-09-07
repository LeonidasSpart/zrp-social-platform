import SwiftUI

/// Who you are talking to, and what you can do about it.
///
/// The native form of the website's `ChatContactDrawer`: the real avatar,
/// display name, verification badge and handle, a way to their profile,
/// blocking, and the pictures already exchanged in this thread.
///
/// **Call and video are deliberately absent, not forgotten.** ZRP's
/// calling is WebRTC - `server.js` relays simple-peer SDP offers over the
/// same socket - and iOS has no WebRTC without adding the app's first
/// third-party dependency, a large one. The website disables those two
/// buttons when it has no handler for them; showing two permanently dead
/// controls here would be worse than not showing them, and pretending
/// otherwise is exactly what a fake feature looks like. Recorded as an
/// open gap in PARITY.md rather than hidden.
struct ChatContactSheet: View {

    let partner: PostAuthor

    /// The thread already on screen. Shared media comes from it rather
    /// than from a second request: the client is holding every message.
    let messages: [Message]

    @EnvironmentObject private var navigator: Navigator
    @Environment(\.dismiss) private var dismiss

    @State private var notice: String?
    @State private var isWorking = false

    private var sharedImages: [Message] {
        Array(messages.filter { $0.imageUrl?.isEmpty == false }.reversed())
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: ZrpSpacing.lg) {
                    identity
                    actions
                    sharedMedia
                }
                .padding(ZrpSpacing.lg)
                .frame(maxWidth: ZrpMetrics.contentMaxWidth)
                .frame(maxWidth: .infinity)
            }
            .background(ZrpColor.background.ignoresSafeArea())
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button { dismiss() } label: { Text(.iosMediaClose) }
                }
            }
            .alert(
                Text(.iosErrorGenericTitle),
                isPresented: Binding(
                    get: { notice != nil },
                    set: { if !$0 { notice = nil } }
                )
            ) {
                Button { notice = nil } label: { Text(.actionCancel) }
            } message: {
                Text(verbatim: notice ?? "")
            }
        }
    }

    private var identity: some View {
        VStack(spacing: ZrpSpacing.sm) {
            AvatarView(
                url: partner.avatarUrl,
                displayName: partner.displayName,
                size: ZrpMetrics.avatarLarge
            )
            HStack(spacing: ZrpSpacing.xs) {
                Text(verbatim: partner.displayName)
                    .font(.headline)
                    .foregroundStyle(ZrpColor.onSurface)
                VerifiedBadge(badgeType: partner.badgeType)
            }
            Text(verbatim: partner.handle)
                .font(.subheadline)
                .foregroundStyle(ZrpColor.onSurfaceMuted)
        }
        .accessibilityElement(children: .combine)
    }

    private var actions: some View {
        HStack(spacing: ZrpSpacing.md) {
            Button {
                dismiss()
                navigator.push(.profile(username: partner.username))
            } label: {
                tile("person", .chatContactProfile)
            }

            Menu {
                Button(role: .destructive) {
                    moderate(block: true)
                } label: {
                    Label { Text(.chatBlock) } icon: { Image(systemName: "nosign") }
                }
                Button {
                    moderate(block: false)
                } label: {
                    Label { Text(.mutedTitle) } icon: { Image(systemName: "speaker.slash") }
                }
            } label: {
                tile("ellipsis", .chatContactMore)
            }
            .disabled(isWorking)
        }
        .buttonStyle(.plain)
    }

    private func tile(_ systemImage: String, _ label: L10nKey) -> some View {
        VStack(spacing: ZrpSpacing.xs) {
            Image(systemName: systemImage)
                .font(.title3)
            Text(label)
                .font(.caption)
        }
        .foregroundStyle(ZrpColor.onSurface)
        .frame(maxWidth: .infinity)
        .frame(minHeight: ZrpMetrics.minTouchTarget + 16)
        .background(ZrpColor.surfaceElevated)
        .clipShape(RoundedRectangle(cornerRadius: ZrpRadius.md, style: .continuous))
        .contentShape(Rectangle())
    }

    @ViewBuilder
    private var sharedMedia: some View {
        VStack(alignment: .leading, spacing: ZrpSpacing.sm) {
            Text(.chatSharedMedia)
                .font(.footnote.weight(.semibold))
                .foregroundStyle(ZrpColor.onSurfaceMuted)

            if sharedImages.isEmpty {
                Text(.chatNoSharedMedia)
                    .font(.footnote)
                    .foregroundStyle(ZrpColor.onSurfaceMuted)
            } else {
                LazyVGrid(
                    columns: Array(repeating: GridItem(.flexible(), spacing: 4), count: 3),
                    spacing: 4
                ) {
                    ForEach(sharedImages) { message in
                        if let url = message.imageUrl {
                            RemoteImage(url: url, targetSize: 160) {
                                Rectangle().fill(ZrpColor.surfaceElevated)
                            }
                            .scaledToFill()
                            .frame(minWidth: 0, maxWidth: .infinity)
                            .aspectRatio(1, contentMode: .fill)
                            .clipped()
                            .clipShape(RoundedRectangle(cornerRadius: ZrpRadius.sm, style: .continuous))
                        }
                    }
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    /// Both routes are toggles that answer with the state the server
    /// settled on, so the message reports what actually happened rather
    /// than assuming the action applied.
    private func moderate(block: Bool) {
        guard !isWorking else { return }
        isWorking = true
        Task {
            defer { isWorking = false }
            let repository = SettingsRepository()
            do {
                if block {
                    let blocked = try await repository.toggleBlock(username: partner.username)
                    notice = L10n.string(blocked ? .blockedTitle : .blockedUnblock)
                } else {
                    let muted = try await repository.toggleMute(userId: partner.id)
                    notice = L10n.string(muted ? .mutedTitle : .mutedUnmute)
                }
            } catch {
                notice = (error as? ApiError)?.serverMessage
                    ?? L10n.string(.settingsErrSomethingWrong)
            }
        }
    }
}
