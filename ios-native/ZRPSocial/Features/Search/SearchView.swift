import SwiftUI

@MainActor
final class SearchViewModel: ObservableObject {

    enum Mode: String, CaseIterable, Identifiable {
        case users
        case posts

        var id: String { rawValue }
    }

    @Published var query = ""
    @Published var mode: Mode = .users
    @Published private(set) var results = SearchResults(users: [], posts: [])
    @Published private(set) var isSearching = false
    @Published private(set) var searchError: ApiError?

    /// The pre-search state: who to follow and what is trending. Both are
    /// real endpoints the website's own sidebar uses, not filler.
    @Published private(set) var suggested: [PostAuthor] = []
    @Published private(set) var trending: [TrendingHashtag] = []

    private let repository: SearchRepositoryProtocol
    private weak var interactions: PostInteractionStore?
    private var searchTask: Task<Void, Never>?

    init(repository: SearchRepositoryProtocol = SearchRepository()) {
        self.repository = repository
    }

    func attach(interactions: PostInteractionStore) {
        self.interactions = interactions
    }

    var trimmedQuery: String {
        query.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    /// True once the query is long enough for the route to return
    /// anything - below this it always answers empty, so the UI says so
    /// instead of showing "no results".
    var isQueryLongEnough: Bool {
        trimmedQuery.count >= SearchRepository.minimumQueryLength
    }

    var isSearchActive: Bool { !trimmedQuery.isEmpty }

    func loadDiscover() async {
        // Failures here are silent: the discover state is a convenience,
        // and an error banner over it would be louder than it deserves.
        async let people = try? repository.suggestedUsers(limit: 10)
        async let tags = try? repository.trendingHashtags(limit: 10)
        let (peopleResult, tagsResult) = await (people, tags)
        if let peopleResult { suggested = peopleResult }
        if let tagsResult { trending = tagsResult }
    }

    /// Debounced, and cancels the superseded request rather than letting
    /// it race the one the user is actually waiting on.
    func scheduleSearch() {
        searchTask?.cancel()

        guard isQueryLongEnough else {
            results = SearchResults(users: [], posts: [])
            isSearching = false
            searchError = nil
            return
        }

        let term = trimmedQuery
        searchTask = Task { [weak self] in
            try? await Task.sleep(for: .milliseconds(300))
            guard let self, !Task.isCancelled else { return }

            self.isSearching = true
            defer { self.isSearching = false }

            do {
                let found = try await self.repository.search(query: term)
                guard !Task.isCancelled else { return }
                self.results = found
                self.searchError = nil
                self.interactions?.seed(found.posts, replacing: true)
            } catch is CancellationError {
                return
            } catch ApiError.cancelled {
                return
            } catch {
                guard !Task.isCancelled else { return }
                self.searchError = error as? ApiError ?? .transport(underlying: "\(error)")
            }
        }
    }
}

/// Search across people and posts, with a real discover state before a
/// query is typed.
struct SearchView: View {

    @EnvironmentObject private var navigator: Navigator
    @EnvironmentObject private var interactions: PostInteractionStore
    @StateObject private var viewModel = SearchViewModel()

    var body: some View {
        content
            .background(ZrpColor.background.ignoresSafeArea())
            .navigationTitle(Text(.navSearch))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button {
                        navigator.push(.explore)
                    } label: {
                        Image(systemName: "safari")
                    }
                    .accessibilityLabel(Text(.exploreTitle))
                }
            }
            .searchable(
                text: $viewModel.query,
                placement: .navigationBarDrawer(displayMode: .always),
                prompt: Text(.searchPlaceholder)
            )
            .onChange(of: viewModel.query) { _, _ in viewModel.scheduleSearch() }
            .task {
                viewModel.attach(interactions: interactions)
                await viewModel.loadDiscover()
            }
    }

    @ViewBuilder
    private var content: some View {
        if !viewModel.isSearchActive {
            discover
        } else if !viewModel.isQueryLongEnough {
            // The route returns empty below two characters, so saying why
            // beats an inaccurate "no results found".
            TimelineStateView.empty(
                systemImage: "character.cursor.ibeam",
                title: .iosSearchMinLength,
                subtitle: nil
            )
        } else if let error = viewModel.searchError {
            TimelineStateView.error(error) { viewModel.scheduleSearch() }
        } else if viewModel.isSearching && viewModel.results.isEmpty {
            TimelineStateView.loading()
        } else {
            resultsBody
        }
    }

    // MARK: - Discover

    private var discover: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: ZrpSpacing.lg) {
                if !viewModel.trending.isEmpty {
                    section(title: .homeTrendingOnZrp) {
                        ForEach(viewModel.trending) { hashtag in
                            Button {
                                navigator.push(.hashtag(tag: hashtag.tag))
                            } label: {
                                HStack {
                                    VStack(alignment: .leading, spacing: 2) {
                                        Text(verbatim: "#\(hashtag.tag)")
                                            .font(.subheadline.weight(.semibold))
                                            .foregroundStyle(ZrpColor.onSurface)
                                        Text(.explorePostCount, [
                                            "n": CountFormatting.exact(hashtag.count),
                                        ])
                                        .font(.caption)
                                        .foregroundStyle(ZrpColor.onSurfaceMuted)
                                    }
                                    Spacer(minLength: 0)
                                }
                                .padding(.horizontal, ZrpSpacing.lg)
                                .frame(minHeight: ZrpMetrics.minTouchTarget)
                                .contentShape(Rectangle())
                            }
                            .buttonStyle(.plain)
                        }
                    }
                }

                if !viewModel.suggested.isEmpty {
                    section(title: .iosSearchSuggestedTitle) {
                        ForEach(viewModel.suggested) { user in
                            userRow(user)
                        }
                    }
                }
            }
            .padding(.vertical, ZrpSpacing.lg)
            .frame(maxWidth: ZrpMetrics.contentMaxWidth)
            .frame(maxWidth: .infinity)
        }
        .refreshable { await viewModel.loadDiscover() }
    }

    @ViewBuilder
    private func section<Content: View>(
        title: L10nKey,
        @ViewBuilder content: () -> Content
    ) -> some View {
        VStack(alignment: .leading, spacing: ZrpSpacing.sm) {
            Text(title)
                .font(.headline)
                .foregroundStyle(ZrpColor.onSurface)
                .padding(.horizontal, ZrpSpacing.lg)
            content()
        }
    }

    // MARK: - Results

    private var resultsBody: some View {
        VStack(spacing: 0) {
            Picker("", selection: $viewModel.mode) {
                Text(.searchUsersTab, ["n": "\(viewModel.results.users.count)"])
                    .tag(SearchViewModel.Mode.users)
                Text(.searchPostsTab, ["n": "\(viewModel.results.posts.count)"])
                    .tag(SearchViewModel.Mode.posts)
            }
            .pickerStyle(.segmented)
            .padding(ZrpSpacing.md)

            switch viewModel.mode {
            case .users:
                if viewModel.results.users.isEmpty {
                    TimelineStateView.empty(
                        systemImage: "person.slash",
                        title: .searchNoUsers,
                        subtitle: nil
                    )
                } else {
                    ScrollView {
                        LazyVStack(spacing: 0) {
                            ForEach(viewModel.results.users) { user in
                                userRow(user)
                            }
                        }
                        .frame(maxWidth: ZrpMetrics.contentMaxWidth)
                        .frame(maxWidth: .infinity)
                    }
                }

            case .posts:
                if viewModel.results.posts.isEmpty {
                    TimelineStateView.empty(
                        systemImage: "doc.text.magnifyingglass",
                        title: .searchNoPosts,
                        subtitle: nil
                    )
                } else {
                    ScrollView {
                        PostListView(
                            posts: viewModel.results.posts,
                            isLoadingMore: false,
                            // The route caps posts at 20 with no cursor,
                            // so there is nothing further to page.
                            hasMore: false,
                            header: { EmptyView() }
                        )
                    }
                }
            }
        }
    }

    private func userRow(_ user: PostAuthor) -> some View {
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
                        VerifiedBadge(badgeType: user.badgeType, size: 12)
                    }
                    Text(verbatim: user.handle)
                        .font(.footnote)
                        .foregroundStyle(ZrpColor.onSurfaceMuted)
                }
                Spacer(minLength: 0)
            }
            .padding(.horizontal, ZrpSpacing.lg)
            .padding(.vertical, ZrpSpacing.md)
            .frame(maxWidth: .infinity, alignment: .leading)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityElement(children: .combine)
        .accessibilityLabel(Text(.iosA11yOpenProfile, ["name": user.displayName]))
    }
}
