import SwiftUI

/// A user's profile and their posts.
struct ProfileView: View {

    @EnvironmentObject private var session: SessionController
    @EnvironmentObject private var interactions: PostInteractionStore
    @State private var moderationNotice: String?
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

                // Blocking and muting yourself is refused server-side
                // (400), so the menu is not offered on your own profile.
                if let profile = viewModel.profile,
                   profile.id != session.currentUser?.id {
                    ToolbarItem(placement: .topBarTrailing) {
                        Menu {
                            Button { moderate(.block(profile.username)) } label: {
                                Label { Text(.blockedTitle) } icon: { Image(systemName: "nosign") }
                            }
                            Button { moderate(.mute(profile.id)) } label: {
                                Label { Text(.mutedTitle) } icon: { Image(systemName: "speaker.slash") }
                            }
                        } label: {
                            Image(systemName: "ellipsis.circle")
                        }
                        .accessibilityLabel(Text(.iosA11yPostOptions))
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
            .alert(
                Text(.reportModalTitle),
                isPresented: Binding(
                    get: { moderationNotice != nil },
                    set: { if !$0 { moderationNotice = nil } }
                )
            ) {
                Button { moderationNotice = nil } label: { Text(.actionCancel) }
            } message: {
                Text(verbatim: moderationNotice ?? "")
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

    private enum ModerationAction {
        case block(String)
        case mute(String)
    }

    /// Both routes are toggles that return the state the server settled
    /// on, so this reports what actually happened rather than assuming
    /// the action applied.
    private func moderate(_ action: ModerationAction) {
        Task {
            let repository = SettingsRepository()
            do {
                switch action {
                case .block(let username):
                    let blocked = try await repository.toggleBlock(username: username)
                    moderationNotice = L10n.string(blocked ? .blockedTitle : .blockedUnblock)
                case .mute(let userId):
                    let muted = try await repository.toggleMute(userId: userId)
                    moderationNotice = L10n.string(muted ? .mutedTitle : .mutedUnmute)
                }
                // Blocking severs the follow graph in both directions
                // server-side, so the profile is refetched rather than
                // left showing a stale follow state.
                await viewModel.refresh()
            } catch {
                moderationNotice = (error as? ApiError)?.serverMessage
                    ?? L10n.string(.settingsErrSomethingWrong)
            }
        }
    }


}
