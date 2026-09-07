import SwiftUI

/// A user's profile and their posts.
struct ProfileView: View {

    @EnvironmentObject private var session: SessionController
    @EnvironmentObject private var interactions: PostInteractionStore
    @EnvironmentObject private var navigator: Navigator
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

                // The menu is offered on every profile now that it
                // carries the Trust Passport, which reads the same for
                // any account. Its moderation items are still gated
                // below.
                if let profile = viewModel.profile {
                    ToolbarItem(placement: .topBarTrailing) {
                        Menu {
                            // The Trust Passport is public and reads the
                            // same for any account, including your own.
                            Button {
                                navigator.push(.trustPassport(username: profile.username))
                            } label: {
                                Label {
                                    Text(.trustHeaderTitle)
                                } icon: {
                                    Image(systemName: "checkmark.seal")
                                }
                            }

                            // Blocking and muting yourself is refused
                            // server-side (400), so neither is offered on
                            // your own profile.
                            if profile.id != session.currentUser?.id {
                                Button { moderate(.block(profile.username)) } label: {
                                    Label {
                                        Text(.blockedTitle)
                                    } icon: {
                                        Image(systemName: "nosign")
                                    }
                                }
                                Button { moderate(.mute(profile.id)) } label: {
                                    Label {
                                        Text(.mutedTitle)
                                    } icon: {
                                        Image(systemName: "speaker.slash")
                                    }
                                }
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
                switch viewModel.selectedTab {
                case .analytics:
                    analyticsTabBody(profile)
                case .replies:
                    repliesTabBody(profile)
                default:
                    postsTabBody(profile, tab: viewModel.selectedTab.postsTab ?? .posts)
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

    @ViewBuilder
    private func analyticsTabBody(_ profile: UserProfile) -> some View {
        VStack(spacing: 0) {
            header(profile)

            switch viewModel.postStatsPhase {
            case .idle, .loading:
                ProgressView()
                    .tint(ZrpColor.onSurfaceMuted)
                    .padding(.top, ZrpSpacing.xxl)
            case .failed(let error):
                TimelineStateView.error(error) {
                    Task { await viewModel.selectTab(.analytics) }
                }
            case .loaded:
                if let stats = viewModel.postStats, !stats.posts.isEmpty {
                    analytics(stats)
                } else {
                    TimelineStateView.empty(
                        systemImage: "chart.bar",
                        title: .iosProfileAnalyticsEmpty,
                        subtitle: nil
                    )
                    .padding(.top, ZrpSpacing.xxl)
                }
            }
        }
    }

    private func analytics(_ stats: PostStats) -> some View {
        VStack(alignment: .leading, spacing: ZrpSpacing.lg) {
            // The route sums over the 20 newest posts, not the account's
            // whole history, so the scope is stated rather than letting
            // these read as lifetime figures.
            Text(.iosProfileAnalyticsScope)
                .font(.caption)
                .foregroundStyle(ZrpColor.onSurfaceMuted)

            LazyVGrid(
                columns: [GridItem(.flexible()), GridItem(.flexible())],
                spacing: ZrpSpacing.md
            ) {
                statCard(.iosProfileAnalyticsViews, value: stats.totals.views, systemImage: "eye")
                statCard(.iosProfileAnalyticsLikes, value: stats.totals.likes, systemImage: "heart")
                statCard(
                    .iosProfileAnalyticsComments,
                    value: stats.totals.comments,
                    systemImage: "bubble.left"
                )
                statCard(
                    .iosProfileAnalyticsReposts,
                    value: stats.totals.reposts,
                    systemImage: "arrow.2.squarepath"
                )
            }

            Text(.iosProfileAnalyticsRecent)
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(ZrpColor.onSurface)

            ForEach(stats.posts) { row in
                Button {
                    navigator.push(.postDetail(postId: row.id, preloaded: nil))
                } label: {
                    VStack(alignment: .leading, spacing: ZrpSpacing.xs) {
                        Text(verbatim: row.content)
                            .font(.subheadline)
                            .foregroundStyle(ZrpColor.onSurface)
                            .lineLimit(2)
                            .multilineTextAlignment(.leading)
                        HStack(spacing: ZrpSpacing.md) {
                            metric("eye", row.views)
                            metric("heart", row.counts.likes)
                            metric("bubble.left", row.counts.comments)
                            metric("arrow.2.squarepath", row.counts.reposts)
                            Spacer(minLength: 0)
                            Text(verbatim: RelativeTime.compact(from: row.createdAt))
                                .font(.caption2)
                                .foregroundStyle(ZrpColor.onSurfaceMuted)
                        }
                    }
                    .padding(ZrpSpacing.md)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .overlay(
                        RoundedRectangle(cornerRadius: ZrpRadius.md, style: .continuous)
                            .strokeBorder(ZrpColor.outline, lineWidth: 1)
                    )
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityElement(children: .combine)
            }
        }
        .padding(ZrpSpacing.lg)
    }

    private func statCard(_ title: L10nKey, value: Int, systemImage: String) -> some View {
        VStack(alignment: .leading, spacing: ZrpSpacing.xs) {
            Label { Text(title) } icon: { Image(systemName: systemImage) }
                .font(.caption)
                .foregroundStyle(ZrpColor.onSurfaceMuted)
            Text(verbatim: CountFormatting.exact(value))
                .font(.title3.weight(.bold).monospacedDigit())
                .foregroundStyle(ZrpColor.onSurface)
        }
        .padding(ZrpSpacing.md)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(ZrpColor.surfaceHighest)
        .clipShape(RoundedRectangle(cornerRadius: ZrpRadius.md, style: .continuous))
        .accessibilityElement(children: .combine)
    }

    private func metric(_ systemImage: String, _ value: Int) -> some View {
        HStack(spacing: 2) {
            Image(systemName: systemImage)
            Text(verbatim: CountFormatting.compact(value) ?? "0")
                .monospacedDigit()
        }
        .font(.caption2)
        .foregroundStyle(ZrpColor.onSurfaceMuted)
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
    /// not. `analytics` is own-profile only, because its route is keyed
    /// by the session and no route exists for anyone else's numbers.
    private func tabBar(_ profile: UserProfile) -> some View {
        let isOwnProfile = profile.id == session.currentUser?.id
        let tabs = ProfileTab.allCases.filter { tab in
            // Analytics is keyed by the session server-side, so it can
            // only ever show your own numbers.
            if tab == .analytics { return isOwnProfile }
            return tab != .likes || isOwnProfile || profile.publicLikes
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
