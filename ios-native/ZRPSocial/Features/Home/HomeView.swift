import SwiftUI

/// The Home timeline: For You and Following.
///
/// Both tabs are real backend feeds - `GET /api/posts/explore` and
/// `GET /api/posts?tab=following`. Nothing on this screen is seeded,
/// sampled, or stubbed; an empty feed renders the empty state rather than
/// filler.
struct HomeView: View {

    @EnvironmentObject private var session: SessionController
    @EnvironmentObject private var interactions: PostInteractionStore
    @EnvironmentObject private var router: AppRouter
    @StateObject private var viewModel = HomeViewModel()
    @StateObject private var stories = StoriesViewModel()
    @State private var isCreatingStory = false
    @State private var openStory: StoryPresentation?

    var body: some View {
        VStack(spacing: 0) {
            tabPicker
            Divider().overlay(ZrpColor.outline)
            storiesHeader
            feed
        }
        .background(ZrpColor.background.ignoresSafeArea())
        .navigationTitle(Text(.navHome))
        .navigationBarTitleDisplayMode(.inline)
        .sheet(isPresented: $router.isComposing) {
            ComposeView { post in
                viewModel.insertCreated(post, interactions: interactions)
            }
        }
        .sheet(isPresented: $isCreatingStory) {
            CreateStoryView {
                // The create route returns the raw row, not the grouped
                // rail shape, so the rail is refetched rather than
                // reconstructed from a different response shape.
                Task { await stories.load() }
            }
        }
        .fullScreenCover(item: $openStory) { presentation in
            StoryViewerView(
                group: presentation.group,
                startIndex: presentation.startIndex,
                viewerId: session.currentUser?.id,
                viewModel: stories
            )
        }
        .task {
            viewModel.attach(interactions: interactions)
            viewModel.loadIfNeeded(viewModel.selectedTab)
            await viewModel.loadSponsoredAdIfNeeded()
            await stories.load()
        }
        .onChange(of: viewModel.selectedTab) { _, tab in
            viewModel.loadIfNeeded(tab)
        }
        .alert(
            Text(.iosErrorGenericTitle),
            isPresented: Binding(
                get: { interactions.actionError != nil },
                set: { if !$0 { interactions.actionError = nil } }
            )
        ) {
            Button { interactions.actionError = nil } label: { Text(.actionCancel) }
        } message: {
            Text(verbatim: interactions.actionError ?? "")
        }
    }

    /// The stories rail.
    ///
    /// Sits above the timeline rather than inside it as a scrolling
    /// header: a header would vanish whenever the feed is empty, loading
    /// or errored, which is exactly the state a brand-new account is in
    /// while the people it follows are already posting stories. The
    /// trade-off is that it does not scroll away with the content the way
    /// the web rail does.
    ///
    /// Absent entirely when there are no unexpired stories - the route
    /// returns only the viewer's own and those of accounts they follow,
    /// so an empty rail is the normal state and an empty strip would be
    /// noise.
    @ViewBuilder
    private var storiesHeader: some View {
        if stories.hasStories {
            StoriesRailView(
                groups: stories.groups,
                onOpen: { group in
                    openStory = StoryPresentation(
                        group: group,
                        startIndex: group.firstUnviewedIndex
                    )
                },
                onCreate: { isCreatingStory = true }
            )
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
                .accessibilityAddTraits(
                    viewModel.selectedTab == tab ? [.isSelected, .isButton] : .isButton
                )
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
            TimelineStateView.loading()
        case .failed(let error):
            TimelineStateView.error(error) {
                viewModel.retry(viewModel.selectedTab)
            }
        case .loaded:
            if state.isEmpty {
                TimelineStateView.empty(
                    systemImage: "sparkles",
                    title: .feedNoPosts,
                    subtitle: viewModel.selectedTab == .following
                        ? L10nKey.feedFollowSomeone
                        : L10nKey.feedCheckBackLater
                )
            } else {
                ScrollView {
                    PostListView(
                        posts: state.posts,
                        isLoadingMore: state.isLoadingMore,
                        hasMore: state.hasMore,
                        onAppear: {
                            viewModel.loadMoreIfNeeded(viewModel.selectedTab, currentPost: $0)
                        },
                        onCreated: { viewModel.insertCreated($0, interactions: interactions) },
                        // Both tabs, matching the website. Its ad slot
                        // carries no `feedType === "for-you"` guard,
                        // unlike the discovery modules right beneath it
                        // in the same map, which do - so the difference
                        // is deliberate there and copied here.
                        sponsoredAd: viewModel.sponsoredAd,
                        header: { EmptyView() }
                    )
                }
                .refreshable { await viewModel.refresh(viewModel.selectedTab) }
                .scrollDismissesKeyboard(.immediately)
            }
        }
    }
}

/// Identifies which story group the full-screen viewer was opened on.
struct StoryPresentation: Identifiable, Equatable {
    let id = UUID()
    let group: StoryGroup
    let startIndex: Int
}
