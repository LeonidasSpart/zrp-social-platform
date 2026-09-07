import SwiftUI

/// Emoji reactions on a post.
///
/// `GET /api/posts/{id}/reaction` returns every reaction **row**, not a
/// tally, so the grouping happens here - which is what lets the app know
/// which pills are the viewer's own and highlight them.
///
/// The toggle keys on (post, user, emoji), so this is not "one reaction
/// per person": someone can hold several at once, and tapping a pill only
/// ever affects that emoji.
struct PostReactionsView: View {

    let postId: String
    let viewerId: String?

    @State private var reactions: [PostReaction] = []
    @State private var isLoaded = false
    @State private var busyEmoji: String?
    @State private var errorMessage: String?

    private let repository = PostsRepository()

    /// The palette offered for adding one. The route accepts **any**
    /// emoji, and the website offers a full picker; this is a quick set,
    /// matching the one the chat already uses. Recorded as a difference
    /// in PARITY.md rather than presented as equivalent.
    private let palette = ["👍", "❤️", "😂", "😮", "😢", "🙏", "🔥", "👏"]

    private var grouped: [(emoji: String, count: Int, mine: Bool)] {
        Dictionary(grouping: reactions, by: \.emoji)
            .map { emoji, rows in
                (
                    emoji: emoji,
                    count: rows.count,
                    mine: viewerId.map { id in rows.contains { $0.userId == id } } ?? false
                )
            }
            .sorted { $0.count > $1.count }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: ZrpSpacing.sm) {
            if !grouped.isEmpty {
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: ZrpSpacing.sm) {
                        ForEach(grouped, id: \.emoji) { group in
                            pill(group.emoji, count: group.count, isMine: group.mine)
                        }
                    }
                }
            }

            // The route answers 401 without a session, so a signed-out
            // reader sees the existing reactions but is not offered a
            // control that could only fail.
            if viewerId != nil {
                Menu {
                    ForEach(palette, id: \.self) { emoji in
                        Button { toggle(emoji) } label: { Text(verbatim: emoji) }
                    }
                } label: {
                    Label { Text(.iosPostAddReaction) } icon: { Image(systemName: "face.smiling") }
                        .font(.caption.weight(.medium))
                        .padding(.horizontal, ZrpSpacing.md)
                        .frame(minHeight: ZrpMetrics.minTouchTarget)
                        .background(ZrpColor.surfaceHighest)
                        .foregroundStyle(ZrpColor.onSurfaceMuted)
                        .clipShape(Capsule())
                }
                .accessibilityLabel(Text(.iosPostAddReaction))
            }
        }
        .task { await load() }
        .alert(
            Text(.iosErrorGenericTitle),
            isPresented: Binding(
                get: { errorMessage != nil },
                set: { if !$0 { errorMessage = nil } }
            )
        ) {
            Button { errorMessage = nil } label: { Text(.actionCancel) }
        } message: {
            Text(verbatim: errorMessage ?? "")
        }
    }

    private func pill(_ emoji: String, count: Int, isMine: Bool) -> some View {
        Button { toggle(emoji) } label: {
            HStack(spacing: ZrpSpacing.xs) {
                Text(verbatim: emoji)
                Text(verbatim: CountFormatting.exact(count))
                    .font(.caption.monospacedDigit())
            }
            .padding(.horizontal, ZrpSpacing.md)
            .frame(minHeight: ZrpMetrics.minTouchTarget)
            .background(isMine ? ZrpColor.red.opacity(0.15) : ZrpColor.surfaceHighest)
            .foregroundStyle(isMine ? ZrpColor.red : ZrpColor.onSurface)
            .clipShape(Capsule())
        }
        .buttonStyle(.plain)
        .disabled(busyEmoji == emoji)
        .accessibilityElement(children: .combine)
        .accessibilityAddTraits(isMine ? [.isButton, .isSelected] : .isButton)
    }

    /// A failed *read* stays quiet: reactions are a secondary detail on
    /// a screen whose own load already reports its errors, and an alert
    /// on arrival would be noise. A failed *write* does not - see below.
    private func load() async {
        guard !isLoaded else { return }
        reactions = (try? await repository.reactions(postId: postId)) ?? []
        isLoaded = true
    }

    /// Refetches rather than patching the local list: the rows carry ids
    /// the app does not mint, and another reader's reaction may have
    /// landed in the meantime.
    ///
    /// A rejected toggle is reported. Leaving it silent would make the
    /// pill a control that sometimes does nothing with no explanation.
    private func toggle(_ emoji: String) {
        guard busyEmoji == nil else { return }
        busyEmoji = emoji
        Task { @MainActor in
            defer { busyEmoji = nil }
            do {
                _ = try await repository.toggleReaction(postId: postId, emoji: emoji)
            } catch {
                if case ApiError.cancelled = error { return }
                errorMessage = (error as? ApiError)?.userFacingMessage
                    ?? L10n.string(.authErrTryAgain)
                return
            }
            reactions = (try? await repository.reactions(postId: postId)) ?? reactions
        }
    }
}
