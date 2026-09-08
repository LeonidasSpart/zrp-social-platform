import SwiftUI

/// The quote composer and edit sheet's state, hoisted out of the row.
///
/// A sheet presented from inside a `LazyVStack` row is torn down when
/// that row recycles mid-scroll, so both live on the list instead. This
/// carries what they need between the row that asks and the list that
/// presents.
@MainActor
final class PostSheetState: ObservableObject {
    @Published var quoting: Post?
    @Published var editing: Post?
    @Published var editDraft = ""
}

/// One post in a timeline, wired to the app-wide interaction store.
///
/// Every list that shows posts renders this: the plain timelines through
/// `PostListView`, and Bookmarks directly, because it interleaves posts
/// with saved comments and so cannot hand a flat `[Post]` to the list.
struct PostRowView: View {

    let post: Post

    /// Pinning is offered only where a pin is meaningful and its result
    /// is visible - a profile.
    var onPin: ((Post) -> Void)?

    /// The author's currently pinned post, so the menu offers Unpin on it
    /// and Pin on the rest.
    var pinnedPostId: String?

    /// Called as the row appears, so the host can decide whether to page.
    var onAppear: (Post) -> Void = { _ in }

    @ObservedObject var sheets: PostSheetState

    @EnvironmentObject private var session: SessionController
    @EnvironmentObject private var interactions: PostInteractionStore
    @EnvironmentObject private var language: LanguageController

    var body: some View {
        PostCardView(
            post: post,
            interaction: interactions.interaction(for: post),
            isOwnPost: post.author.id == session.currentUser?.id,
            onLike: { Task { await interactions.toggleLike(post) } },
            onRepost: { Task { await interactions.toggleRepost(post) } },
            onBookmark: { Task { await interactions.toggleBookmark(post) } },
            onDelete: { Task { await interactions.deletePost(post) } },
            onQuote: { sheets.quoting = post },
            onEdit: {
                sheets.editDraft = interactions.displayContent(for: post)
                sheets.editing = post
            },
            onPin: onPin.map { pin in { pin(post) } },
            isPinned: post.id == pinnedPostId,
            onTranslate: translateAction
        )
        .onAppear {
            onAppear(post)
            // Counted here rather than inside the card so the card stays
            // free of the store.
            interactions.countView(post)
        }
    }

    /// Translating requires a session - the route answers 401 without one
    /// - so the item is not offered to a signed-out reader. The target
    /// language is whatever the app is currently displayed in, which is
    /// what the website sends too.
    private var translateAction: (() -> Void)? {
        guard session.currentUser != nil else { return nil }
        return { interactions.toggleTranslation(post, to: language.effectiveCode) }
    }
}

extension View {
    /// Attaches the quote composer and the edit sheet to a list of posts.
    ///
    /// Applied by the list, never by a row: see `PostSheetState`.
    func postSheets(
        _ sheets: PostSheetState,
        onCreated: @escaping (Post) -> Void = { _ in }
    ) -> some View {
        modifier(PostSheetsModifier(sheets: sheets, onCreated: onCreated))
    }
}

private struct PostSheetsModifier: ViewModifier {

    @ObservedObject var sheets: PostSheetState
    let onCreated: (Post) -> Void

    @EnvironmentObject private var interactions: PostInteractionStore

    func body(content: Content) -> some View {
        content
            .sheet(item: $sheets.quoting) { post in
                ComposeView(quoting: post) { created in onCreated(created) }
            }
            .sheet(item: $sheets.editing) { post in
                EditPostSheet(
                    draft: $sheets.editDraft,
                    onCancel: { sheets.editing = nil },
                    onSave: {
                        let target = post
                        let content = sheets.editDraft
                        sheets.editing = nil
                        Task { await interactions.editPost(target, content: content) }
                    }
                )
            }
    }
}

/// The text-only edit modal, matching what the website's own edit
/// modal offers - media is never touched by an edit on either client.
struct EditPostSheet: View {

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
