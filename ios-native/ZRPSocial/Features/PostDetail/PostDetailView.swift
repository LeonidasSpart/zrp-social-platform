import SwiftUI

/// A post and its threaded comments.
struct PostDetailView: View {

    let postId: String

    /// The post as the timeline already had it, so opening a post shows
    /// content immediately and refreshes underneath rather than putting a
    /// spinner over data the app is holding.
    let preloaded: Post?

    @EnvironmentObject private var session: SessionController
    @EnvironmentObject private var interactions: PostInteractionStore
    @EnvironmentObject private var navigator: Navigator
    @StateObject private var viewModel: PostDetailViewModel

    @FocusState private var isComposerFocused: Bool
    @State private var editingComment: Comment?
    @State private var editDraft: String = ""

    init(postId: String, preloaded: Post? = nil) {
        self.postId = postId
        self.preloaded = preloaded
        _viewModel = StateObject(wrappedValue: PostDetailViewModel(postId: postId))
    }

    var body: some View {
        content
            .background(ZrpColor.background.ignoresSafeArea())
            .navigationTitle(Text(.iosPostDetailTitle))
            .navigationBarTitleDisplayMode(.inline)
            .safeAreaInset(edge: .bottom) { composer }
            .task { await viewModel.loadIfNeeded(preloaded: preloaded) }
            .sheet(item: $editingComment) { comment in
                editSheet(for: comment)
            }
            .alert(
                Text(.iosErrorGenericTitle),
                isPresented: Binding(
                    get: { viewModel.errorMessage != nil },
                    set: { if !$0 { viewModel.errorMessage = nil } }
                )
            ) {
                Button { viewModel.errorMessage = nil } label: { Text(.actionCancel) }
            } message: {
                Text(verbatim: viewModel.errorMessage ?? "")
            }
    }

    @ViewBuilder
    private var content: some View {
        switch viewModel.phase {
        case .loading:
            TimelineStateView.loading()

        case .failed(let error):
            if case .notFound = error {
                TimelineStateView.empty(
                    systemImage: "doc.questionmark",
                    title: .postDetailPostNotFound,
                    subtitle: nil
                )
            } else {
                TimelineStateView.error(error) {
                    Task { await viewModel.refresh() }
                }
            }

        case .loaded(let post):
            thread(post)
        }
    }

    private func thread(_ post: Post) -> some View {
        ScrollView {
            LazyVStack(spacing: 0) {
                PostCardView(
                    post: post,
                    interaction: interactions.interaction(for: post),
                    isOwnPost: post.author.id == session.currentUser?.id,
                    onLike: { Task { await interactions.toggleLike(post) } },
                    onRepost: { Task { await interactions.toggleRepost(post) } },
                    onBookmark: { Task { await interactions.toggleBookmark(post) } },
                    onDelete: { Task { await interactions.deletePost(post) } }
                )
                .onAppear { interactions.countView(post) }

                // Reactions live on the detail screen rather than every
                // feed card: each post costs its own request for the
                // rows, which a timeline should not pay per card.
                PostReactionsView(postId: post.id, viewerId: session.currentUser?.id)
                    .padding(.horizontal, ZrpSpacing.lg)
                    .padding(.bottom, ZrpSpacing.md)

                engagementLinks(for: post)

                commentsSection
            }
            .frame(maxWidth: ZrpMetrics.contentMaxWidth)
            .frame(maxWidth: .infinity)
        }
        .refreshable { await viewModel.refresh() }
        .scrollDismissesKeyboard(.interactively)
    }

    @ViewBuilder
    private var commentsSection: some View {
        if !viewModel.areCommentsEnabled {
            // The author turned comments off. The route answers an empty
            // page rather than an error, so saying this explicitly is
            // what separates "closed" from "none yet".
            Text(.postDetailCommentsDisabled)
                .font(.footnote)
                .foregroundStyle(ZrpColor.onSurfaceMuted)
                .frame(maxWidth: .infinity)
                .padding(ZrpSpacing.xl)
        } else {
            switch viewModel.commentsPhase {
            case .idle, .loading:
                ProgressView()
                    .tint(ZrpColor.onSurfaceMuted)
                    .frame(maxWidth: .infinity)
                    .padding(ZrpSpacing.xl)

            case .failed(let error):
                TimelineStateView.error(error) {
                    Task { await viewModel.refresh() }
                }
                .frame(minHeight: 200)

            case .loaded:
                if viewModel.comments.isEmpty {
                    TimelineStateView.empty(
                        systemImage: "bubble.left",
                        title: .iosCommentNoComments,
                        subtitle: .iosCommentBeFirst
                    )
                    .frame(minHeight: 200)
                } else {
                    commentRows
                }
            }
        }
    }

    /// Ways into the two lists behind a post's counts.
    ///
    /// Each row is offered only when its count is above zero: a route
    /// that can only answer an empty page is not a place worth sending
    /// someone. `quotedBy` is optional on `Post` because the feed routes
    /// omit it, but this screen's own route always selects it.
    ///
    /// The count sits beside a plain title rather than inside a phrase.
    /// The shared dictionary carries only `{n} reposts` and `{n} quotes`,
    /// with no singular form in any of the 11 languages, so composing a
    /// sentence from them would print "1 reposts".
    @ViewBuilder
    private func engagementLinks(for post: Post) -> some View {
        VStack(spacing: 0) {
            if post.counts.reposts > 0 {
                engagementRow(
                    title: .repostsTitle,
                    systemImage: "arrow.2.squarepath",
                    count: post.counts.reposts,
                    route: .userList(.reposts(postId: post.id))
                )
            }
            if let quoted = post.counts.quotedBy, quoted > 0 {
                engagementRow(
                    title: .quotesTitle,
                    systemImage: "quote.bubble",
                    count: quoted,
                    route: .postQuotes(postId: post.id)
                )
            }
        }
    }

    private func engagementRow(
        title: L10nKey,
        systemImage: String,
        count: Int,
        route: Route
    ) -> some View {
        Button {
            navigator.push(route)
        } label: {
            HStack(spacing: ZrpSpacing.md) {
                Image(systemName: systemImage)
                    .font(.footnote)
                    .foregroundStyle(ZrpColor.onSurfaceMuted)
                Text(title)
                    .font(.subheadline)
                    .foregroundStyle(ZrpColor.onSurface)
                Spacer(minLength: 0)
                Text(verbatim: CountFormatting.exact(count))
                    .font(.subheadline.monospacedDigit())
                    .foregroundStyle(ZrpColor.onSurfaceMuted)
                Image(systemName: "chevron.right")
                    .font(.caption)
                    .foregroundStyle(ZrpColor.onSurfaceMuted)
            }
            .padding(.horizontal, ZrpSpacing.lg)
            .frame(minHeight: ZrpMetrics.minTouchTarget)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .overlay(alignment: .bottom) {
            Rectangle().fill(ZrpColor.outlineFaint).frame(height: 0.5)
        }
        .accessibilityElement(children: .combine)
    }

    private var commentRows: some View {
        Group {
            ForEach(viewModel.flattenedComments, id: \.comment.id) { entry in
                CommentRowView(
                    comment: entry.comment,
                    depth: entry.depth,
                    interaction: viewModel.interaction(for: entry.comment),
                    isOwnComment: entry.comment.author.id == session.currentUser?.id,
                    onLike: { Task { await viewModel.toggleLike(entry.comment) } },
                    onReply: {
                        viewModel.beginReply(to: entry.comment)
                        isComposerFocused = true
                    },
                    onEdit: {
                        editDraft = entry.comment.content
                        editingComment = entry.comment
                    },
                    onDelete: { Task { await viewModel.delete(entry.comment) } },
                    onRepost: { Task { await viewModel.toggleRepost(entry.comment) } },
                    onBookmark: { Task { await viewModel.toggleBookmark(entry.comment) } }
                )
                .task {
                    // Paging is by top-level thread, so only a root
                    // comment nearing the end asks for more.
                    guard entry.depth == 0 else { return }
                    await viewModel.loadMoreCommentsIfNeeded(current: entry.comment)
                }
            }

            if viewModel.isLoadingMoreComments {
                ProgressView()
                    .tint(ZrpColor.onSurfaceMuted)
                    .padding(ZrpSpacing.lg)
            }
        }
    }

    // MARK: - Composer

    @ViewBuilder
    private var composer: some View {
        if viewModel.areCommentsEnabled {
            VStack(spacing: 0) {
                if let target = viewModel.replyTarget {
                    HStack(spacing: ZrpSpacing.sm) {
                        Text(.iosCommentReplyingTo, ["name": target.author.displayName])
                            .font(.caption)
                            .foregroundStyle(ZrpColor.onSurfaceMuted)
                            .lineLimit(1)
                        Spacer(minLength: 0)
                        Button {
                            viewModel.cancelReply()
                        } label: {
                            Image(systemName: "xmark.circle.fill")
                                .foregroundStyle(ZrpColor.onSurfaceMuted)
                        }
                        .accessibilityLabel(Text(.iosCommentCancelReply))
                    }
                    .padding(.horizontal, ZrpSpacing.lg)
                    .padding(.top, ZrpSpacing.sm)
                }

                HStack(alignment: .bottom, spacing: ZrpSpacing.md) {
                    TextField(
                        L10n.string(
                            viewModel.replyTarget == nil
                                ? .postDetailCommentPlaceholder
                                : .postDetailReplyPlaceholder
                        ),
                        text: $viewModel.draft,
                        axis: .vertical
                    )
                    .focused($isComposerFocused)
                    .font(.subheadline)
                    .lineLimit(1...5)
                    .padding(ZrpSpacing.md)
                    .background(ZrpColor.surfaceElevated)
                    .clipShape(RoundedRectangle(cornerRadius: ZrpRadius.lg, style: .continuous))

                    Button {
                        Task { await viewModel.submit() }
                    } label: {
                        if viewModel.isSubmitting {
                            ProgressView().tint(ZrpColor.red)
                                .frame(width: ZrpMetrics.minTouchTarget, height: ZrpMetrics.minTouchTarget)
                        } else {
                            Image(systemName: "arrow.up.circle.fill")
                                .font(.title2)
                                .frame(width: ZrpMetrics.minTouchTarget, height: ZrpMetrics.minTouchTarget)
                        }
                    }
                    .disabled(
                        viewModel.isSubmitting
                            || viewModel.draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
                    )
                    .accessibilityLabel(Text(.postDetailReply))
                }
                .padding(.horizontal, ZrpSpacing.lg)
                .padding(.vertical, ZrpSpacing.sm)
            }
            .background(.bar)
        }
    }

    private func editSheet(for comment: Comment) -> some View {
        NavigationStack {
            VStack(alignment: .leading, spacing: ZrpSpacing.lg) {
                TextField(
                    L10n.string(.postDetailCommentPlaceholder),
                    text: $editDraft,
                    axis: .vertical
                )
                .font(.body)
                .lineLimit(3...10)
                .padding(ZrpSpacing.md)
                .background(ZrpColor.surfaceElevated)
                .clipShape(RoundedRectangle(cornerRadius: ZrpRadius.md, style: .continuous))
                Spacer()
            }
            .padding(ZrpSpacing.lg)
            .background(ZrpColor.background.ignoresSafeArea())
            .navigationTitle(Text(.iosCommentEditTitle))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button { editingComment = nil } label: { Text(.actionCancel) }
                }
                ToolbarItem(placement: .topBarTrailing) {
                    Button {
                        let target = comment
                        let content = editDraft
                        editingComment = nil
                        Task { await viewModel.edit(target, to: content) }
                    } label: {
                        Text(.actionSave).font(.subheadline.weight(.semibold))
                    }
                    .disabled(editDraft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                }
            }
        }
        .presentationDetents([.medium])
    }
}
