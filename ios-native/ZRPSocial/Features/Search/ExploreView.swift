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

    /// "People near you" (`GET /api/discover/people`) - a real, tested
    /// backend capability that had no frontend consumer on any platform
    /// before this (Task #3 parity audit finding). Country-based only
    /// (see `NearbyUser`'s doc comment), loaded independently of
    /// `people` since the two lists come from different ranking rules
    /// (follower-count leaderboard vs. same-country) and conflating them
    /// would misrepresent why a given row is being suggested.
    @Published private(set) var nearbyPeople: [NearbyUser] = []
    @Published private(set) var nearbyPhase: Phase = .idle
    /// Set only when the server reports "unknown_viewer_country" - the
    /// section is hidden rather than shown empty in that case, since
    /// there is a real, actionable reason (no country on file) rather
    /// than "nobody nearby right now."
    @Published private(set) var nearbyUnknownCountry = false

    /// Who the viewer has followed from this screen. The suggested-users
    /// route says nothing about the viewer's own relationship to the
    /// people it returns, so this is the only thing that knows - and it
    /// is only ever set from the follow route's own answer. Shared
    /// across `people` and `nearbyPeople` since a row is keyed by user
    /// id either way.
    @Published private(set) var followed: Set<String> = []
    @Published private(set) var busy: Set<String> = []
    @Published var errorMessage: String?

    private let search: SearchRepositoryProtocol
    private let users: UsersRepositoryProtocol
    private let discover: DiscoverRepositoryProtocol

    /// The route's own ceiling, and what the website's own Explore pages
    /// ask for.
    private static let pageSize = 50
    /// "People near you" has no "see all" destination of its own (it is
    /// itself the see-all view Explore already provides) - a modest
    /// fixed page matching this screen's own one-shot, non-paginated
    /// design is enough.
    private static let nearbyPageSize = 20

    init(
        search: SearchRepositoryProtocol = SearchRepository(),
        users: UsersRepositoryProtocol = UsersRepository(),
        discover: DiscoverRepositoryProtocol = DiscoverRepository()
    ) {
        self.search = search
        self.users = users
        self.discover = discover
    }

    func loadIfNeeded() async {
        guard phase == .idle else { return }
        await load()
    }

    func load() async {
        if people.isEmpty && hashtags.isEmpty { phase = .loading }
        if nearbyPeople.isEmpty { nearbyPhase = .loading }

        // Fetched together, and one failing does not hide the other -
        // trending tags are still worth showing when the suggestion
        // query fails, and the reverse. Only when BOTH fail, and there is
        // nothing already on screen, does this become an error state -
        // and it is the real error from the route, not a stand-in.
        async let suggested = fetchPeople()
        async let trending = fetchHashtags()
        async let nearby = fetchNearbyPeople()
        let (peopleResult, tagsResult, nearbyResult) = await (suggested, trending, nearby)

        if case .success(let value) = peopleResult { people = value }
        if case .success(let value) = tagsResult { hashtags = value }

        if case .failure(let error) = peopleResult,
           case .failure = tagsResult,
           people.isEmpty, hashtags.isEmpty {
            phase = .failed(error as? ApiError ?? .transport(underlying: "\(error)"))
        } else {
            phase = .loaded
        }

        switch nearbyResult {
        case .success(let page):
            nearbyPeople = page.users
            nearbyUnknownCountry = page.reason == "unknown_viewer_country"
            nearbyPhase = .loaded
        case .failure:
            // Independent of the section above - a failure here never
            // blocks or blanks people/hashtags.
            nearbyPhase = nearbyPeople.isEmpty ? .failed(.transport(underlying: "nearby")) : .loaded
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

    private func fetchNearbyPeople() async -> Result<NearbyPeoplePage, Error> {
        do { return .success(try await discover.nearbyPeople(limit: Self.nearbyPageSize)) }
        catch { return .failure(error) }
    }

    func isFollowing(_ userId: String) -> Bool { followed.contains(userId) }
    func isBusy(_ userId: String) -> Bool { busy.contains(userId) }

    /// The route is a toggle that answers with the state the server
    /// settled on, so that answer is what is recorded - never an
    /// assumption about what the tap did.
    func toggleFollow(userId: String, username: String) async {
        guard !busy.contains(userId) else { return }
        busy.insert(userId)
        defer { busy.remove(userId) }

        do {
            let response = try await users.toggleFollow(username: username)
            if response.following {
                followed.insert(userId)
            } else {
                followed.remove(userId)
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
                personRow(
                    id: user.id,
                    username: user.username,
                    displayName: user.displayName,
                    subtitle: user.handle,
                    avatarUrl: user.avatarUrl,
                    badgeType: user.badgeType
                )
            }
        }

        // A second, independent section - see ExploreViewModel's own doc
        // comment on `nearbyPeople`. Hidden entirely when the viewer has
        // no known country, a real, actionable reason distinct from
        // "nobody nearby."
        if !viewModel.nearbyUnknownCountry {
            nearbyPeopleSection
        }
    }

    @ViewBuilder
    private var nearbyPeopleSection: some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(.iosExplorePeopleNearYouTitle)
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(ZrpColor.onSurface)
            Text(.iosExplorePeopleNearYouSubtitle)
                .font(.caption)
                .foregroundStyle(ZrpColor.onSurfaceMuted)
        }
        .padding(.horizontal, ZrpSpacing.lg)
        .padding(.top, ZrpSpacing.lg)
        .padding(.bottom, ZrpSpacing.sm)
        .frame(maxWidth: .infinity, alignment: .leading)

        if viewModel.nearbyPhase == .idle || viewModel.nearbyPhase == .loading {
            ProgressView()
                .frame(maxWidth: .infinity)
                .padding(.vertical, ZrpSpacing.lg)
        } else if viewModel.nearbyPeople.isEmpty {
            Text(.iosExplorePeopleNearYouEmpty)
                .font(.footnote)
                .foregroundStyle(ZrpColor.onSurfaceMuted)
                .padding(.horizontal, ZrpSpacing.lg)
                .padding(.bottom, ZrpSpacing.lg)
        } else {
            ForEach(viewModel.nearbyPeople) { user in
                personRow(
                    id: user.id,
                    username: user.username,
                    displayName: user.displayName,
                    subtitle: (user.headline?.isEmpty == false ? user.headline : user.company) ?? user.handle,
                    avatarUrl: user.avatarUrl,
                    badgeType: user.badgeType
                )
            }
        }
    }

    private func personRow(
        id: String,
        username: String,
        displayName: String,
        subtitle: String?,
        avatarUrl: String?,
        badgeType: String?
    ) -> some View {
        HStack(spacing: ZrpSpacing.md) {
            Button {
                navigator.push(.profile(username: username))
            } label: {
                HStack(spacing: ZrpSpacing.md) {
                    AvatarView(
                        url: avatarUrl,
                        displayName: displayName,
                        size: ZrpMetrics.avatarMedium
                    )
                    VStack(alignment: .leading, spacing: 2) {
                        HStack(spacing: ZrpSpacing.xs) {
                            Text(verbatim: displayName)
                                .font(.subheadline.weight(.semibold))
                                .foregroundStyle(ZrpColor.onSurface)
                                .lineLimit(1)
                            VerifiedBadge(badgeType: badgeType)
                        }
                        Text(verbatim: subtitle ?? "@\(username)")
                            .font(.caption)
                            .foregroundStyle(ZrpColor.onSurfaceMuted)
                            .lineLimit(1)
                    }
                    Spacer(minLength: 0)
                }
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)

            followButton(id: id, username: username)
        }
        .padding(ZrpSpacing.lg)
        .overlay(alignment: .bottom) {
            Rectangle().fill(ZrpColor.outlineFaint).frame(height: 0.5)
        }
    }

    private func followButton(id: String, username: String) -> some View {
        let isFollowing = viewModel.isFollowing(id)
        return Button {
            Task { await viewModel.toggleFollow(userId: id, username: username) }
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
        .disabled(viewModel.isBusy(id))
        .opacity(viewModel.isBusy(id) ? 0.5 : 1)
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
