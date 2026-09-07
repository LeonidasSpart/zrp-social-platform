import SwiftUI

/// A user's profile and their posts.
struct ProfileView: View {

    @EnvironmentObject private var session: SessionController
    @EnvironmentObject private var interactions: PostInteractionStore
    @StateObject private var viewModel: ProfileViewModel

    init(username: String) {
        _viewModel = StateObject(wrappedValue: ProfileViewModel(username: username))
    }

    var body: some View {
        content
            .background(ZrpColor.background.ignoresSafeArea())
            .navigationTitle(Text(verbatim: viewModel.profile?.displayName ?? viewModel.username))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                if let profile = viewModel.profile,
                   let url = URL(string: "https://zrp.one/profile/\(profile.username)") {
                    ToolbarItem(placement: .topBarTrailing) {
                        ShareLink(item: url) {
                            Image(systemName: "square.and.arrow.up")
                        }
                        .accessibilityLabel(Text(.profileShare))
                    }
                }
            }
            .task {
                viewModel.attach(interactions: interactions)
                viewModel.viewerId = session.currentUser?.id
                await viewModel.loadIfNeeded()
            }
            .alert(
                Text(.iosErrorGenericTitle),
                isPresented: Binding(
                    get: { viewModel.followNotice != nil },
                    set: { if !$0 { viewModel.followNotice = nil } }
                )
            ) {
                Button { viewModel.followNotice = nil } label: { Text(.actionCancel) }
            } message: {
                Text(verbatim: viewModel.followNotice ?? "")
            }
    }

    @ViewBuilder
    private var content: some View {
        switch viewModel.phase {
        case .loading:
            TimelineStateView.loading()

        case .failed(let error):
            // A 404 here means the account genuinely does not exist, which
            // is not a retryable condition - so it gets the profile's own
            // "user not found" copy rather than a retry button.
            if case .notFound = error {
                TimelineStateView.empty(
                    systemImage: "person.slash",
                    title: .profileUserNotFound,
                    subtitle: nil
                )
            } else {
                TimelineStateView.error(error) {
                    Task { await viewModel.load() }
                }
            }

        case .loaded(let profile):
            loadedBody(profile)
        }
    }

    private func loadedBody(_ profile: UserProfile) -> some View {
        ScrollView {
            if profile.isContentVisible(toViewerId: session.currentUser?.id) {
                PostListView(
                    posts: viewModel.posts.posts,
                    isLoadingMore: viewModel.posts.isLoadingMore,
                    hasMore: viewModel.posts.hasMore,
                    onAppear: { viewModel.loadMoreIfNeeded(currentPost: $0) },
                    header: { header(profile) }
                )
                if viewModel.posts.posts.isEmpty, viewModel.posts.phase == .loaded {
                    TimelineStateView.empty(
                        systemImage: "square.stack",
                        title: .profileNoPosts,
                        subtitle: nil
                    )
                    .padding(.top, ZrpSpacing.xxl)
                }
            } else {
                VStack(spacing: 0) {
                    header(profile)
                    // A private account the viewer does not follow gets an
                    // empty list from every content route rather than a
                    // 403. Saying so explicitly is the difference between
                    // "this account is private" and a misleading "no posts
                    // yet".
                    TimelineStateView.empty(
                        systemImage: "lock",
                        title: .profileProtectedAccount,
                        subtitle: .profileProtectedMessage
                    )
                    .padding(.top, ZrpSpacing.xxl)
                }
            }
        }
        .refreshable { await viewModel.refresh() }
    }

    private func header(_ profile: UserProfile) -> some View {
        ProfileHeaderView(
            profile: profile,
            isOwnProfile: profile.id == session.currentUser?.id,
            isTogglingFollow: viewModel.isTogglingFollow,
            onToggleFollow: { Task { await viewModel.toggleFollow() } }
        )
    }
}
