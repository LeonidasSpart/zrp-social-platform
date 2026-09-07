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
                if let postsTab = viewModel.selectedTab.postsTab {
                    postsTabBody(profile, tab: postsTab)
                } else {
                    repliesTabBody(profile)
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

    @ViewBuilder
    private func postsTabBody(_ profile: UserProfile, tab: ProfilePostsTab) -> some View {
        let state = viewModel.feed(tab)
        let isOwnProfile = profile.id == session.currentUser?.id
        // The pinned post is rendered above the list and removed from it,
        // so it appears once rather than twice - the same thing the
        // website does. Only on Posts: a pinned post is a property of the
        // profile's own timeline, not of its likes or reposts.
        let pinned = tab == .posts ? viewModel.pinnedPost : nil
        PostListView(
            posts: state.posts.filter { $0.id != pinned?.id },
            isLoadingMore: state.isLoadingMore,
            hasMore: state.hasMore,
            onAppear: { viewModel.loadMoreIfNeeded(currentPost: $0) },
            onPin: pinAction(isOwnProfile: isOwnProfile),
            pinnedPostId: viewModel.pinnedPost?.id,
            header: {
                VStack(spacing: 0) {
                    header(profile)
                    if let pinned {
                        pinnedSection(pinned, isOwnProfile: isOwnProfile)
                    }
                }
            }
        )
        switch state.phase {
        case .idle, .loading:
            ProgressView()
                .tint(ZrpColor.onSurfaceMuted)
                .padding(.top, ZrpSpacing.xxl)
        case .failed(let error):
            TimelineStateView.error(error) {
                Task { await viewModel.refresh() }
            }
        case .loaded:
            // The pinned post counts as content: an account whose only
            // post is pinned is not an empty profile.
            if state.posts.isEmpty, tab != .posts || viewModel.pinnedPost == nil {
                TimelineStateView.empty(
                    systemImage: viewModel.selectedTab.systemImage,
                    title: viewModel.selectedTab.emptyKey,
                    subtitle: nil
                )
                .padding(.top, ZrpSpacing.xxl)
            }
        }
    }

    /// Pinning is author-only and enforced server-side with a 403, so
    /// the item is offered only on your own profile. Written as a typed
    /// factory rather than a ternary on a closure literal, which Swift
    /// cannot always infer against an optional function type.
    private func pinAction(isOwnProfile: Bool) -> ((Post) -> Void)? {
        guard isOwnProfile else { return nil }
        return { post in Task { await viewModel.togglePin(post) } }
    }

    /// The pinned post, labelled, above the timeline.
    private func pinnedSection(_ post: Post, isOwnProfile: Bool) -> some View {
        VStack(alignment: .leading, spacing: ZrpSpacing.xs) {
            HStack(spacing: ZrpSpacing.xs) {
                Image(systemName: "pin.fill")
                    .font(.caption2)
                Text(.profilePinned)
                    .font(.caption.weight(.medium))
            }
            .foregroundStyle(ZrpColor.blue)
            .padding(.horizontal, ZrpSpacing.lg)
            .padding(.top, ZrpSpacing.md)

            // Rendered through the shared list rather than a bare card:
            // quoting and editing are presented from sheets the list
            // owns, so a card built by hand here would offer both as
            // menu items that do nothing.
            PostListView(
                posts: [post],
                isLoadingMore: false,
                hasMore: false,
                onPin: pinAction(isOwnProfile: isOwnProfile),
                pinnedPostId: post.id,
                header: { EmptyView() }
            )
        }
    }

    @ViewBuilder
    private func repliesTabBody(_ profile: UserProfile) -> some View {
        let state = viewModel.repliesState
        LazyVStack(spacing: 0) {
            header(profile)
            ForEach(state.replies) { reply in
                ProfileReplyRow(reply: reply)
                    .task { viewModel.loadMoreIfNeeded(currentReply: reply) }
            }
            if state.isLoadingMore {
                ProgressView()
                    .tint(ZrpColor.onSurfaceMuted)
                    .padding(ZrpSpacing.lg)
            }
        }
        switch state.phase {
        case .idle, .loading:
            ProgressView()
                .tint(ZrpColor.onSurfaceMuted)
                .padding(.top, ZrpSpacing.xxl)
        case .failed(let error):
            TimelineStateView.error(error) {
                Task { await viewModel.refresh() }
            }
        case .loaded:
            if state.replies.isEmpty {
                TimelineStateView.empty(
                    systemImage: "bubble.left",
                    title: .profileNoReplies,
                    subtitle: nil
                )
                .padding(.top, ZrpSpacing.xxl)
            }
        }
    }

    private func header(_ profile: UserProfile) -> some View {
        VStack(spacing: 0) {
            ProfileHeaderView(
                profile: profile,
                isOwnProfile: profile.id == session.currentUser?.id,
                isTogglingFollow: viewModel.isTogglingFollow,
                onToggleFollow: { Task { await viewModel.toggleFollow() } }
            )
            tabBar(profile)
        }
    }

    /// The tab strip.
    ///
    /// `likes` is offered only on your own profile or when the account
    /// has left its likes public - matching the website, and matching the
    /// route, which answers an empty page rather than a 403 when they are
    /// not. Analytics is deliberately absent: it is a whole own-profile
    /// dashboard rather than a list, and is recorded as MISSING in
    /// PARITY.md rather than stubbed here.
    private func tabBar(_ profile: UserProfile) -> some View {
        let isOwnProfile = profile.id == session.currentUser?.id
        let tabs = ProfileTab.allCases.filter { tab in
            tab != .likes || isOwnProfile || profile.publicLikes
        }
        return ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: ZrpSpacing.lg) {
                ForEach(tabs, id: \.self) { tab in
                    let isSelected = viewModel.selectedTab == tab
                    Button {
                        Task { await viewModel.selectTab(tab) }
                    } label: {
                        VStack(spacing: ZrpSpacing.xs) {
                            Text(tab.titleKey)
                                .font(.subheadline.weight(isSelected ? .semibold : .regular))
                                .foregroundStyle(
                                    isSelected ? ZrpColor.onSurface : ZrpColor.onSurfaceMuted
                                )
                            Rectangle()
                                .fill(isSelected ? ZrpColor.red : Color.clear)
                                .frame(height: 2)
                        }
                        .frame(minHeight: ZrpMetrics.minTouchTarget)
                        .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    .accessibilityAddTraits(isSelected ? [.isButton, .isSelected] : .isButton)
                }
            }
            .padding(.horizontal, ZrpSpacing.lg)
        }
        .overlay(alignment: .bottom) {
            Rectangle().fill(ZrpColor.outlineFaint).frame(height: 0.5)
        }
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
