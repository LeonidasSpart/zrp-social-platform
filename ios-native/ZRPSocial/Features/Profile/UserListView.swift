import SwiftUI

@MainActor
final class UserListViewModel: ObservableObject {

    enum Phase: Equatable {
        case idle
        case loading
        case loaded
        case failed(ApiError)
    }

    @Published private(set) var users: [FollowListUser] = []
    @Published private(set) var phase: Phase = .idle
    @Published private(set) var isLoadingMore = false

    private var cursor: String?
    private let source: UserListSource
    private let repository: UsersRepositoryProtocol

    init(
        source: UserListSource,
        repository: UsersRepositoryProtocol = UsersRepository()
    ) {
        self.source = source
        self.repository = repository
    }

    var hasMore: Bool { cursor != nil }

    func loadIfNeeded() async {
        guard phase == .idle else { return }
        await load(replacingExisting: true)
    }

    func refresh() async {
        await load(replacingExisting: true)
    }

    func loadMoreIfNeeded(currentUser: FollowListUser) async {
        guard
            phase == .loaded,
            hasMore,
            !isLoadingMore,
            let index = users.firstIndex(where: { $0.id == currentUser.id }),
            index >= users.count - 3
        else { return }
        await load(replacingExisting: false)
    }

    private func load(replacingExisting: Bool) async {
        if replacingExisting {
            if users.isEmpty { phase = .loading }
        } else {
            isLoadingMore = true
        }

        do {
            let page = try await repository.userList(
                source,
                cursor: replacingExisting ? nil : cursor
            )
            if replacingExisting {
                users = page.items
            } else {
                let existing = Set(users.map(\.id))
                users.append(contentsOf: page.items.filter { !existing.contains($0.id) })
            }
            cursor = page.nextCursor
            phase = .loaded
            isLoadingMore = false
        } catch {
            isLoadingMore = false
            if users.isEmpty {
                phase = .failed(error as? ApiError ?? .transport(underlying: "\(error)"))
            } else {
                phase = .loaded
            }
        }
    }
}

/// A list of people: followers, following, or whoever reposted a post.
///
/// A private account the viewer cannot see answers `{items: [], …}` from
/// every one of those routes rather than a 403, so an empty list here is
/// a legitimate result and is presented as the list's own empty state.
struct UserListView: View {

    let source: UserListSource

    @EnvironmentObject private var navigator: Navigator
    @StateObject private var viewModel: UserListViewModel

    init(source: UserListSource) {
        self.source = source
        _viewModel = StateObject(wrappedValue: UserListViewModel(source: source))
    }

    var body: some View {
        Group {
            switch viewModel.phase {
            case .idle, .loading:
                TimelineStateView.loading()
            case .failed(let error):
                TimelineStateView.error(error) {
                    Task { await viewModel.refresh() }
                }
            case .loaded:
                if viewModel.users.isEmpty {
                    TimelineStateView.empty(
                        systemImage: source.emptySystemImage,
                        title: source.emptyKey,
                        subtitle: nil
                    )
                } else {
                    list
                }
            }
        }
        .background(ZrpColor.background.ignoresSafeArea())
        .navigationTitle(Text(source.titleKey))
        .navigationBarTitleDisplayMode(.inline)
        .task { await viewModel.loadIfNeeded() }
    }

    private var list: some View {
        ScrollView {
            LazyVStack(spacing: 0) {
                ForEach(viewModel.users) { user in
                    row(user)
                        .task { await viewModel.loadMoreIfNeeded(currentUser: user) }
                }
                if viewModel.isLoadingMore {
                    ProgressView()
                        .tint(ZrpColor.onSurfaceMuted)
                        .padding(ZrpSpacing.lg)
                }
            }
            .frame(maxWidth: ZrpMetrics.contentMaxWidth)
            .frame(maxWidth: .infinity)
        }
        .refreshable { await viewModel.refresh() }
    }

    private func row(_ user: FollowListUser) -> some View {
        Button {
            navigator.push(.profile(username: user.username))
        } label: {
            HStack(alignment: .top, spacing: ZrpSpacing.md) {
                AvatarView(
                    url: user.avatarUrl,
                    displayName: user.displayName,
                    size: ZrpMetrics.avatarMedium
                )
                VStack(alignment: .leading, spacing: 2) {
                    HStack(spacing: ZrpSpacing.xs) {
                        Text(verbatim: user.displayName)
                            .font(.subheadline.weight(.semibold))
                            .foregroundStyle(ZrpColor.onSurface)
                            .lineLimit(1)
                        VerifiedBadge(badgeType: user.badgeType, size: 12)
                    }
                    Text(verbatim: user.handle)
                        .font(.footnote)
                        .foregroundStyle(ZrpColor.onSurfaceMuted)
                    if let bio = user.bio, !bio.isEmpty {
                        Text(verbatim: bio)
                            .font(.footnote)
                            .foregroundStyle(ZrpColor.onSurface)
                            .lineLimit(2)
                            .padding(.top, 2)
                    }
                }
                Spacer(minLength: 0)

                // The list route reports whether the viewer already
                // follows each row. It is shown as a state, not a control:
                // toggling follow from here would need a per-row mutation
                // path that the single follow route (keyed by username)
                // supports, but the row has no way to reflect a pending
                // request for a private account - so the honest thing is
                // to open the profile, where that outcome is handled.
                if user.isFollowing {
                    Text(.iosA11yFollowingState)
                        .font(.caption.weight(.medium))
                        .padding(.horizontal, ZrpSpacing.sm)
                        .padding(.vertical, ZrpSpacing.xs)
                        .background(ZrpColor.surfaceHighest)
                        .foregroundStyle(ZrpColor.onSurfaceMuted)
                        .clipShape(Capsule())
                }
            }
            .padding(ZrpSpacing.lg)
            .frame(maxWidth: .infinity, alignment: .leading)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .overlay(alignment: .bottom) {
            Rectangle().fill(ZrpColor.outlineFaint).frame(height: 0.5)
        }
        .accessibilityElement(children: .combine)
        .accessibilityLabel(Text(.iosA11yOpenProfile, ["name": user.displayName]))
    }
}
