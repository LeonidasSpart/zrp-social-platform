import SwiftUI

@MainActor
final class ExploreViewModel: ObservableObject {

    enum Phase: Equatable {
        case idle
        case loading
        case loaded
        case failed(ApiError)
    }

    @Published private(set) var people: [PostAuthor] = []
    @Published private(set) var hashtags: [TrendingHashtag] = []
    @Published private(set) var phase: Phase = .idle

    /// Who the viewer has followed from this screen. The suggested-users
    /// route says nothing about the viewer's own relationship to the
    /// people it returns, so this is the only thing that knows - and it
    /// is only ever set from the follow route's own answer.
    @Published private(set) var followed: Set<String> = []
    @Published private(set) var busy: Set<String> = []
    @Published var errorMessage: String?

    private let search: SearchRepositoryProtocol
    private let users: UsersRepositoryProtocol

    /// The route's own ceiling, and what the website's own Explore pages
    /// ask for.
    private static let pageSize = 50

    init(
        search: SearchRepositoryProtocol = SearchRepository(),
        users: UsersRepositoryProtocol = UsersRepository()
    ) {
        self.search = search
        self.users = users
    }

    func loadIfNeeded() async {
        guard phase == .idle else { return }
        await load()
    }

    func load() async {
        if people.isEmpty && hashtags.isEmpty { phase = .loading }

        // Fetched together, and one failing does not hide the other -
        // trending tags are still worth showing when the suggestion
        // query fails, and the reverse. Only when BOTH fail, and there is
        // nothing already on screen, does this become an error state -
        // and it is the real error from the route, not a stand-in.
        async let suggested = fetchPeople()
        async let trending = fetchHashtags()
        let (peopleResult, tagsResult) = await (suggested, trending)

        if case .success(let value) = peopleResult { people = value }
        if case .success(let value) = tagsResult { hashtags = value }

        if case .failure(let error) = peopleResult,
           case .failure = tagsResult,
           people.isEmpty, hashtags.isEmpty {
            phase = .failed(error as? ApiError ?? .transport(underlying: "\(error)"))
        } else {
            phase = .loaded
        }
    }

    private func fetchPeople() async -> Result<[PostAuthor], Error> {
        do { return .success(try await search.suggestedUsers(limit: Self.pageSize)) }
        catch { return .failure(error) }
    }

    private func fetchHashtags() async -> Result<[TrendingHashtag], Error> {
        do { return .success(try await search.trendingHashtags(limit: Self.pageSize)) }
        catch { return .failure(error) }
    }

    func isFollowing(_ user: PostAuthor) -> Bool { followed.contains(user.id) }
    func isBusy(_ user: PostAuthor) -> Bool { busy.contains(user.id) }

    /// The route is a toggle that answers with the state the server
    /// settled on, so that answer is what is recorded - never an
    /// assumption about what the tap did.
    func toggleFollow(_ user: PostAuthor) async {
        guard !busy.contains(user.id) else { return }
        busy.insert(user.id)
        defer { busy.remove(user.id) }

        do {
            let response = try await users.toggleFollow(username: user.username)
            if response.following {
                followed.insert(user.id)
            } else {
                followed.remove(user.id)
            }
        } catch let error as ApiError {
            errorMessage = error.userFacingMessage
        } catch {
            errorMessage = L10n.string(.authErrTryAgain)
        }
    }
}

/// Explore: people to follow, and what is trending.
///
/// The website has three Explore pages - posts, people, tags. The posts
/// one reads `GET /api/posts/explore`, which is **the same feed as this
/// app's Home "For You" tab**, so reproducing it here would be a second
/// copy of a screen the reader already has one tap away. Explore on iOS
/// is therefore the two lists Home does not already show, at the full
/// fifty the website's own pages ask for rather than the ten Search
/// previews.
struct ExploreView: View {

    @EnvironmentObject private var navigator: Navigator
    @StateObject private var viewModel = ExploreViewModel()
    @State private var section: Section = .people

    private enum Section: Hashable, CaseIterable {
        case people
        case tags

        var titleKey: L10nKey {
            switch self {
            case .people: return .rightPanelWhoToFollow
            case .tags: return .rightPanelTrending
            }
        }
    }

    var body: some View {
        VStack(spacing: 0) {
            Picker("", selection: $section) {
                ForEach(Section.allCases, id: \.self) { value in
                    Text(value.titleKey).tag(value)
                }
            }
            .pickerStyle(.segmented)
            .labelsHidden()
            .padding(.horizontal, ZrpSpacing.lg)
            .padding(.vertical, ZrpSpacing.sm)

            Divider().overlay(ZrpColor.outline)

            content
        }
        .background(ZrpColor.background.ignoresSafeArea())
        .navigationTitle(Text(.exploreTitle))
        .navigationBarTitleDisplayMode(.inline)
        .task { await viewModel.loadIfNeeded() }
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
        case .idle, .loading:
            TimelineStateView.loading()
        case .failed(let error):
            TimelineStateView.error(error) {
                Task { await viewModel.load() }
            }
        case .loaded:
            ScrollView {
                LazyVStack(spacing: 0) {
                    switch section {
                    case .people:
                        peopleList
                    case .tags:
                        tagList
                    }
                }
                .frame(maxWidth: ZrpMetrics.contentMaxWidth)
                .frame(maxWidth: .infinity)
            }
            .refreshable { await viewModel.load() }
        }
    }

    @ViewBuilder
    private var peopleList: some View {
        if viewModel.people.isEmpty {
            TimelineStateView.empty(
                systemImage: "person.2",
                title: .onboardingNoSuggestions,
                subtitle: nil
            )
            .padding(.top, ZrpSpacing.xxl)
        } else {
            ForEach(viewModel.people) { user in
                personRow(user)
            }
        }
    }

    private func personRow(_ user: PostAuthor) -> some View {
        HStack(spacing: ZrpSpacing.md) {
            Button {
                navigator.push(.profile(username: user.username))
            } label: {
                HStack(spacing: ZrpSpacing.md) {
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
                            VerifiedBadge(badgeType: user.badgeType)
                        }
                        Text(verbatim: user.handle)
                            .font(.caption)
                            .foregroundStyle(ZrpColor.onSurfaceMuted)
                            .lineLimit(1)
                    }
                    Spacer(minLength: 0)
                }
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)

            followButton(user)
        }
        .padding(ZrpSpacing.lg)
        .overlay(alignment: .bottom) {
            Rectangle().fill(ZrpColor.outlineFaint).frame(height: 0.5)
        }
    }

    private func followButton(_ user: PostAuthor) -> some View {
        let isFollowing = viewModel.isFollowing(user)
        return Button {
            Task { await viewModel.toggleFollow(user) }
        } label: {
            Text(isFollowing ? L10nKey.actionFollowing : L10nKey.actionFollow)
                .font(.footnote.weight(.semibold))
                .foregroundStyle(isFollowing ? ZrpColor.onSurface : .white)
                .padding(.horizontal, ZrpSpacing.md)
                .frame(minHeight: ZrpMetrics.minTouchTarget - 8)
                .background(isFollowing ? ZrpColor.surfaceElevated : ZrpColor.red, in: Capsule())
                .overlay(
                    Capsule().strokeBorder(
                        isFollowing ? ZrpColor.outline : .clear,
                        lineWidth: 1
                    )
                )
        }
        .buttonStyle(.plain)
        .disabled(viewModel.isBusy(user))
        .opacity(viewModel.isBusy(user) ? 0.5 : 1)
    }

    @ViewBuilder
    private var tagList: some View {
        if viewModel.hashtags.isEmpty {
            TimelineStateView.empty(
                systemImage: "number",
                title: .rightPanelNoTrending,
                subtitle: nil
            )
            .padding(.top, ZrpSpacing.xxl)
        } else {
            ForEach(viewModel.hashtags) { hashtag in
                Button {
                    navigator.push(.hashtag(tag: hashtag.tag))
                } label: {
                    HStack(spacing: ZrpSpacing.md) {
                        Image(systemName: "number")
                            .font(.headline)
                            .foregroundStyle(ZrpColor.red)
                            .frame(width: ZrpMetrics.avatarSmall)
                        VStack(alignment: .leading, spacing: 2) {
                            Text(verbatim: "#\(hashtag.tag)")
                                .font(.subheadline.weight(.semibold))
                                .foregroundStyle(ZrpColor.onSurface)
                                .lineLimit(1)
                            Text(.explorePostCount, ["n": CountFormatting.exact(hashtag.count)])
                                .font(.caption)
                                .foregroundStyle(ZrpColor.onSurfaceMuted)
                        }
                        Spacer(minLength: 0)
                    }
                    .padding(ZrpSpacing.lg)
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .overlay(alignment: .bottom) {
                    Rectangle().fill(ZrpColor.outlineFaint).frame(height: 0.5)
                }
            }
        }
    }
}
