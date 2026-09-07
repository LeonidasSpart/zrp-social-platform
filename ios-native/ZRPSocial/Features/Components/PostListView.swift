import SwiftUI

/// The one timeline rendering used by every screen that shows posts.
///
/// Home, profiles, and hashtag pages differ in where their posts come
/// from, not in how a post looks or behaves - so they share this rather
/// than each growing their own copy of the card list, the paging
/// footer, and the delete plumbing.
struct PostListView<Header: View>: View {

    let posts: [Post]
    let isLoadingMore: Bool
    let hasMore: Bool

    /// Called as each row appears, so the host can decide whether to page.
    var onAppear: (Post) -> Void = { _ in }

    /// Called when a quote composed from this list is published, so the
    /// host can show it without a refetch.
    var onCreated: (Post) -> Void = { _ in }

    /// Called to pin or unpin one of the viewer's own posts. `nil` on
    /// every list except a profile's own, where a pin is meaningful and
    /// its result is visible.
    var onPin: ((Post) -> Void)?

    /// The author's currently pinned post, so the menu can offer Unpin
    /// on it and Pin on the rest.
    var pinnedPostId: String?

    /// Rendered above the first post - a profile header, a hashtag
    /// summary, or nothing. Generic rather than type-erased so a header
    /// costs nothing when a screen does not have one.
    @ViewBuilder let header: () -> Header

    @EnvironmentObject private var session: SessionController
    @EnvironmentObject private var interactions: PostInteractionStore

    // The quote composer and the edit sheet live here rather than on
    // each card: a sheet presented from inside a `LazyVStack` row is
    // torn down when that row recycles mid-scroll.
    @State private var quoting: Post?
    @State private var editing: Post?
    @State private var editDraft = ""

    /// Posts deleted this session are filtered here rather than removed
    /// from each screen's own array, so one delete is reflected
    /// everywhere the post appears.
    private var visiblePosts: [Post] {
        posts.filter { !interactions.deletedPostIDs.contains($0.id) }
    }

    var body: some View {
        LazyVStack(spacing: 0) {
            header()

            ForEach(visiblePosts) { post in
                PostCardView(
                    post: post,
                    interaction: interactions.interaction(for: post),
                    isOwnPost: post.author.id == session.currentUser?.id,
                    onLike: { Task { await interactions.toggleLike(post) } },
                    onRepost: { Task { await interactions.toggleRepost(post) } },
                    onBookmark: { Task { await interactions.toggleBookmark(post) } },
                    onDelete: { Task { await interactions.deletePost(post) } },
                    onQuote: { quoting = post },
                    onEdit: {
                        editDraft = interactions.displayContent(for: post)
                        editing = post
                    },
                    onPin: onPin.map { pin in { pin(post) } },
                    isPinned: post.id == pinnedPostId
                )
                .onAppear {
                    onAppear(post)
                    // Counted here rather than inside the card so the
                    // card stays free of the store; the two screens that
                    // build a card both already hold it.
                    interactions.countView(post)
                }
            }

            footer
        }
        // Caps the reading width on iPad and in landscape rather than
        // stretching a post across a 12.9" display.
        .frame(maxWidth: ZrpMetrics.contentMaxWidth)
        .frame(maxWidth: .infinity)
        .sheet(item: $quoting) { post in
            ComposeView(quoting: post) { created in onCreated(created) }
        }
        .sheet(item: $editing) { post in
            EditPostSheet(
                draft: $editDraft,
                onCancel: { editing = nil },
                onSave: {
                    let target = post
                    let content = editDraft
                    editing = nil
                    Task { await interactions.editPost(target, content: content) }
                }
            )
        }
    }

    @ViewBuilder
    private var footer: some View {
        if isLoadingMore {
            HStack(spacing: ZrpSpacing.sm) {
                ProgressView().tint(ZrpColor.onSurfaceMuted)
                Text(.feedLoadingMore)
                    .font(.footnote)
                    .foregroundStyle(ZrpColor.onSurfaceMuted)
            }
            .frame(maxWidth: .infinity)
            .padding(ZrpSpacing.lg)
        } else if !hasMore && !visiblePosts.isEmpty {
            Text(.feedEndOfFeed)
                .font(.footnote)
                .foregroundStyle(ZrpColor.onSurfaceMuted)
                .frame(maxWidth: .infinity)
                .padding(ZrpSpacing.xl)
        }
    }
}

/// Loading, error, and empty presentations shared by every timeline.
enum TimelineStateView {

    static func loading() -> some View {
        VStack(spacing: ZrpSpacing.md) {
            ProgressView().tint(ZrpColor.red)
            Text(.actionLoading)
                .font(.footnote)
                .foregroundStyle(ZrpColor.onSurfaceMuted)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    static func error(_ error: ApiError, retry: (() -> Void)?) -> some View {
        VStack(spacing: ZrpSpacing.lg) {
            Image(systemName: error == .offline ? "wifi.slash" : "exclamationmark.triangle")
                .font(.largeTitle)
                .foregroundStyle(ZrpColor.onSurfaceMuted)

            Text(verbatim: error.userFacingMessage)
                .font(.subheadline)
                .foregroundStyle(ZrpColor.onSurfaceMuted)
                .multilineTextAlignment(.center)

            if error.isRetryable, let retry {
                Button(action: retry) {
                    Text(.feedTryAgain)
                        .font(.subheadline.weight(.semibold))
                        .padding(.horizontal, ZrpSpacing.xl)
                        .frame(minHeight: ZrpMetrics.minTouchTarget)
                        .background(ZrpColor.red)
                        .foregroundStyle(.white)
                        .clipShape(Capsule())
                }
            }
        }
        .padding(ZrpSpacing.xl)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    static func empty(
        systemImage: String,
        title: L10nKey,
        subtitle: L10nKey?
    ) -> some View {
        VStack(spacing: ZrpSpacing.md) {
            Image(systemName: systemImage)
                .font(.largeTitle)
                .foregroundStyle(ZrpColor.onSurfaceMuted)

            Text(title)
                .font(.headline)
                .foregroundStyle(ZrpColor.onSurface)

            if let subtitle {
                Text(subtitle)
                    .font(.subheadline)
                    .foregroundStyle(ZrpColor.onSurfaceMuted)
                    .multilineTextAlignment(.center)
            }
        }
        .padding(ZrpSpacing.xl)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
}

/// The text-only edit modal, matching what the website's own edit
/// modal offers - media is never touched by an edit on either client.
private struct EditPostSheet: View {

    @Binding var draft: String
    let onCancel: () -> Void
    let onSave: () -> Void

    var body: some View {
        NavigationStack {
            VStack(alignment: .leading, spacing: ZrpSpacing.lg) {
                TextField(
                    L10n.string(.composerPlaceholderDefault),
                    text: $draft,
                    axis: .vertical
                )
                .font(.body)
                .lineLimit(4...12)
                .padding(ZrpSpacing.md)
                .background(ZrpColor.surfaceElevated)
                .clipShape(RoundedRectangle(cornerRadius: ZrpRadius.md, style: .continuous))
                Spacer()
            }
            .padding(ZrpSpacing.lg)
            .background(ZrpColor.background.ignoresSafeArea())
            .navigationTitle(Text(.iosPostEditTitle))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button(action: onCancel) { Text(.actionCancel) }
                }
                ToolbarItem(placement: .topBarTrailing) {
                    Button(action: onSave) {
                        Text(.actionSave).font(.subheadline.weight(.semibold))
                    }
                    .disabled(draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                }
            }
        }
        .presentationDetents([.medium])
    }
}
