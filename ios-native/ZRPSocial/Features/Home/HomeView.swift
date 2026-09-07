import SwiftUI

/// The Home timeline: For You and Following.
///
/// Both tabs are real backend feeds - `GET /api/posts/explore` and
/// `GET /api/posts?tab=following`. Nothing on this screen is seeded,
/// sampled, or stubbed; an empty feed renders the empty state rather than
/// filler.
struct HomeView: View {

    @EnvironmentObject private var session: SessionController
    @StateObject private var viewModel = HomeViewModel()

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                tabPicker
                Divider().overlay(ZrpColor.outline)
                feed
            }
            .background(ZrpColor.background.ignoresSafeArea())
            .navigationTitle(Text(.navHome))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Image("ZrpLogo")
                        .resizable()
                        .scaledToFit()
                        .frame(width: 26, height: 26)
                        .accessibilityHidden(true)
                }
                ToolbarItem(placement: .topBarTrailing) {
                    Button {
                        Task { await session.signOut() }
                    } label: {
                        Image(systemName: "rectangle.portrait.and.arrow.right")
                            .foregroundStyle(ZrpColor.onSurfaceMuted)
                    }
                    .accessibilityLabel(Text(.navSignOut))
                }
            }
        }
        .task { viewModel.loadIfNeeded(viewModel.selectedTab) }
        .onChange(of: viewModel.selectedTab) { _, tab in
            viewModel.loadIfNeeded(tab)
        }
        .alert(
            Text(.iosErrorGenericTitle),
            isPresented: Binding(
                get: { viewModel.actionError != nil },
                set: { if !$0 { viewModel.actionError = nil } }
            )
        ) {
            Button { viewModel.actionError = nil } label: { Text(.actionCancel) }
        } message: {
            Text(verbatim: viewModel.actionError ?? "")
        }
    }

    // MARK: - Tabs

    private var tabPicker: some View {
        HStack(spacing: 0) {
            ForEach(FeedTab.allCases) { tab in
                Button {
                    withAnimation(.easeInOut(duration: 0.15)) {
                        viewModel.selectedTab = tab
                    }
                } label: {
                    VStack(spacing: ZrpSpacing.sm) {
                        Text(tab.titleKey)
                            .font(.subheadline.weight(viewModel.selectedTab == tab ? .semibold : .regular))
                            .foregroundStyle(
                                viewModel.selectedTab == tab
                                    ? ZrpColor.onSurface
                                    : ZrpColor.onSurfaceMuted
                            )
                        Capsule()
                            .fill(viewModel.selectedTab == tab ? ZrpColor.red : .clear)
                            .frame(height: 3)
                    }
                    .frame(maxWidth: .infinity)
                    .frame(minHeight: ZrpMetrics.minTouchTarget)
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityAddTraits(viewModel.selectedTab == tab ? [.isSelected, .isButton] : .isButton)
            }
        }
        .background(ZrpColor.background)
    }

    // MARK: - Feed

    @ViewBuilder
    private var feed: some View {
        let state = viewModel.currentState

        switch state.phase {
        case .idle, .loading:
            loadingState
        case .failed(let error):
            errorState(error)
        case .loaded:
            if state.isEmpty {
                emptyState
            } else {
                timeline(state)
            }
        }
    }

    private func timeline(_ state: FeedState) -> some View {
        ScrollView {
            LazyVStack(spacing: 0) {
                ForEach(state.posts) { post in
                    PostCardView(
                        post: post,
                        interaction: viewModel.interaction(for: post),
                        isOwnPost: post.author.id == session.currentUser?.id,
                        onLike: { Task { await viewModel.toggleLike(post) } },
                        onRepost: { Task { await viewModel.toggleRepost(post) } },
                        onBookmark: { Task { await viewModel.toggleBookmark(post) } },
                        onDelete: { Task { await viewModel.deletePost(post) } }
                    )
                    .onAppear {
                        viewModel.loadMoreIfNeeded(viewModel.selectedTab, currentPost: post)
                    }
                }

                if state.isLoadingMore {
                    HStack(spacing: ZrpSpacing.sm) {
                        ProgressView().tint(ZrpColor.onSurfaceMuted)
                        Text(.feedLoadingMore)
                            .font(.footnote)
                            .foregroundStyle(ZrpColor.onSurfaceMuted)
                    }
                    .frame(maxWidth: .infinity)
                    .padding(ZrpSpacing.lg)
                } else if !state.hasMore {
                    Text(.feedEndOfFeed)
                        .font(.footnote)
                        .foregroundStyle(ZrpColor.onSurfaceMuted)
                        .frame(maxWidth: .infinity)
                        .padding(ZrpSpacing.xl)
                }
            }
            // Caps the reading width on iPad and in landscape instead of
            // stretching a post across a 12.9" display.
            .frame(maxWidth: ZrpMetrics.contentMaxWidth)
            .frame(maxWidth: .infinity)
        }
        .refreshable { await viewModel.refresh(viewModel.selectedTab) }
        .scrollDismissesKeyboard(.immediately)
    }

    private var loadingState: some View {
        VStack(spacing: ZrpSpacing.md) {
            ProgressView().tint(ZrpColor.red)
            Text(.actionLoading)
                .font(.footnote)
                .foregroundStyle(ZrpColor.onSurfaceMuted)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    private func errorState(_ error: ApiError) -> some View {
        VStack(spacing: ZrpSpacing.lg) {
            Image(systemName: error == .offline ? "wifi.slash" : "exclamationmark.triangle")
                .font(.largeTitle)
                .foregroundStyle(ZrpColor.onSurfaceMuted)

            Text(verbatim: error.userFacingMessage)
                .font(.subheadline)
                .foregroundStyle(ZrpColor.onSurfaceMuted)
                .multilineTextAlignment(.center)

            if error.isRetryable {
                Button {
                    viewModel.retry(viewModel.selectedTab)
                } label: {
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

    private var emptyState: some View {
        VStack(spacing: ZrpSpacing.md) {
            Image(systemName: "sparkles")
                .font(.largeTitle)
                .foregroundStyle(ZrpColor.onSurfaceMuted)

            Text(.feedNoPosts)
                .font(.headline)
                .foregroundStyle(ZrpColor.onSurface)

            Text(viewModel.selectedTab == .following ? L10nKey.feedFollowSomeone : L10nKey.feedCheckBackLater)
                .font(.subheadline)
                .foregroundStyle(ZrpColor.onSurfaceMuted)
                .multilineTextAlignment(.center)
        }
        .padding(ZrpSpacing.xl)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
}
