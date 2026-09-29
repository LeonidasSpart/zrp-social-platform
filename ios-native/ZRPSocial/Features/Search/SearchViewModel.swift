import SwiftUI

/// The part of a "#"-led query worth sending to `GET /api/hashtags/
/// search`, or `nil` when there's nothing there yet - just "#" typed so
/// far, or not a hashtag query at all. Pure and free of the view model
/// so it can be unit tested directly, mirroring `DiscoverWatchEvents`'s
/// own extraction of parsing logic out of its owning type.
func hashtagSearchTerm(from query: String) -> String? {
    let trimmed = query.trimmingCharacters(in: .whitespacesAndNewlines)
    guard trimmed.hasPrefix("#") else { return nil }
    let term = String(trimmed.dropFirst()).trimmingCharacters(in: .whitespaces)
    return term.isEmpty ? nil : term
}

/// Whether a single-category page can load another page - pure so it can
/// be unit tested directly (mirrors `canLoadMoreComments`/
/// `canLoadMoreSearch` on Android): never for `.all` (a fixed-size
/// teaser server-side, never paginated), never while a page is already
/// in flight, never once the server has said there's nothing left, and
/// never before a first page (`nextCursor`) has ever loaded.
func canLoadMoreSearchCategory(
    category: SearchCategory,
    query: String,
    isLoadingMore: Bool,
    nextCursor: String?
) -> Bool {
    category != .all &&
        !isLoadingMore &&
        nextCursor != nil &&
        query.trimmingCharacters(in: .whitespacesAndNewlines).count >= SearchRepository.minimumQueryLength
}

@MainActor
final class SearchViewModel: ObservableObject {

    @Published var query = ""

    // Advanced Search category/sort/filters - see docs/advanced-search-
    // architecture.md for the shared contract this mirrors exactly
    // (also mirrored one-for-one by Android's own SearchViewModel).
    @Published var category: SearchCategory = .all {
        didSet { guard oldValue != category else { return }; resetPaginationAndRerun() }
    }
    @Published var sort: SearchSortOption = .relevance {
        didSet { guard oldValue != sort else { return }; resetPaginationAndRerun() }
    }
    @Published var filters = SearchFilters() {
        didSet { guard oldValue != filters else { return }; resetPaginationAndRerun() }
    }
    @Published var showFilters = false

    /// Backs BOTH `type=all`'s per-category teaser AND the active single
    /// category's full paginated list - only the field(s) matching the
    /// current `category` are ever populated at once (see
    /// `SearchResults`'s own doc comment), so one value serves both
    /// display modes without duplicating state.
    @Published private(set) var results = SearchResults(users: [], posts: [])
    @Published private(set) var isSearching = false
    @Published private(set) var searchError: ApiError?

    /// Single-category pagination (`category != .all` only - `type=all`
    /// ignores `cursor`).
    @Published private(set) var nextCursor: String?
    @Published private(set) var isLoadingMore = false

    /// The pre-search state: who to follow and what is trending. Both are
    /// real endpoints the website's own sidebar uses, not filler.
    @Published private(set) var suggested: [PostAuthor] = []
    @Published private(set) var trending: [TrendingHashtag] = []

    /// `GET /api/hashtags/search` search-as-you-type results - a real
    /// prefix match against every hashtag in use, ranked by usage.
    /// Distinct from the Hashtags CATEGORY above, which hits
    /// `GET /api/search?type=hashtags` and only exact-matches a hashtag
    /// already typed out in full (see that route's own doc comment).
    /// Not built on any ZRP client before this.
    @Published private(set) var hashtagMatches: [TrendingHashtag] = []
    @Published private(set) var isSearchingHashtags = false
    @Published private(set) var isLoadingMoreHashtags = false
    @Published private(set) var hashtagSearchError: ApiError?
    private var hashtagNextCursor: String?
    private var hashtagSearchTask: Task<Void, Never>?

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

    /// A "#"-led query is hashtag search-as-you-type, not Advanced
    /// Search below - the same distinction the backend itself draws
    /// between `/api/hashtags/search` and `/api/search`.
    var isHashtagQuery: Bool { trimmedQuery.hasPrefix("#") }

    /// Whether anything at all came back across every category in
    /// `type=all` mode - the AllModeSections empty state's own check,
    /// distinct from `SearchResults.isEmpty` (users/posts only).
    var hasAnyAllModeResults: Bool {
        !results.users.isEmpty || !results.posts.isEmpty || !results.hashtags.isEmpty ||
            !results.communities.isEmpty || !results.news.isEmpty || !results.music.isEmpty ||
            !results.opportunities.isEmpty || !results.marketplace.isEmpty
    }

    var canLoadMore: Bool {
        canLoadMoreSearchCategory(category: category, query: query, isLoadingMore: isLoadingMore, nextCursor: nextCursor)
    }

    func loadDiscover() async {
        // Failures here are silent: the discover state is a convenience,
        // and an error banner over it would be louder than it deserves.
        async let people = try? repository.suggestedUsers(limit: 10)
        async let tags = try? repository.trendingHashtags(limit: 10)
        let (peopleResult, tagsResult) = await (people, tags)
        if let peopleResult { suggested = peopleResult }
        if let tagsResult { trending = tagsResult }
    }

    /// Routes a query change to whichever search it actually means - a
    /// "#"-led query never runs Advanced Search below (and vice versa),
    /// so switching between the two clears the other's stale results
    /// rather than leaving them to flash back on screen when the query
    /// flips back.
    func handleQueryChange() {
        if isHashtagQuery {
            searchTask?.cancel()
            results = SearchResults(users: [], posts: [])
            isSearching = false
            searchError = nil
            nextCursor = nil
            scheduleHashtagSearch()
        } else {
            hashtagSearchTask?.cancel()
            hashtagMatches = []
            isSearchingHashtags = false
            hashtagSearchError = nil
            hashtagNextCursor = nil
            scheduleSearch()
        }
    }

    func clearFilters() {
        filters = SearchFilters()
    }

    /// Debounced, and cancels the superseded request rather than letting
    /// it race the one the user is actually waiting on.
    func scheduleSearch() {
        searchTask?.cancel()

        guard isQueryLongEnough else {
            results = SearchResults(users: [], posts: [])
            isSearching = false
            searchError = nil
            nextCursor = nil
            return
        }

        let term = trimmedQuery
        searchTask = Task { [weak self] in
            try? await Task.sleep(for: .milliseconds(300))
            guard let self, !Task.isCancelled else { return }
            await self.performSearch(term)
        }
    }

    /// Re-runs immediately (no debounce) - used for category/sort/filter
    /// changes, which are discrete user actions rather than keystrokes.
    private func resetPaginationAndRerun() {
        searchTask?.cancel()
        nextCursor = nil
        guard isQueryLongEnough, !isHashtagQuery else { return }
        let term = trimmedQuery
        searchTask = Task { [weak self] in
            await self?.performSearch(term)
        }
    }

    private func performSearch(_ term: String) async {
        guard !Task.isCancelled else { return }
        isSearching = true
        searchError = nil
        defer { isSearching = false }

        do {
            if category == .all {
                let found = try await repository.searchAll(query: term, sort: sort, filters: filters)
                guard !Task.isCancelled else { return }
                results = found
                nextCursor = nil
                interactions?.seed(found.posts, replacing: true)
            } else {
                try await fetchCategoryPage(term, cursor: nil, append: false)
            }
        } catch is CancellationError {
        } catch ApiError.cancelled {
        } catch {
            guard !Task.isCancelled else { return }
            searchError = error as? ApiError ?? .transport(underlying: "\(error)")
        }
    }

    /// Not debounced - triggered by scroll position the same way the
    /// hashtag search-as-you-type's own `loadMoreHashtagsIfNeeded` is, so
    /// a duplicate in-flight request is guarded by `isLoadingMore`
    /// instead of a timer.
    func loadMoreIfNeeded() async {
        guard canLoadMore else { return }
        isLoadingMore = true
        defer { isLoadingMore = false }
        try? await fetchCategoryPage(trimmedQuery, cursor: nextCursor, append: true)
    }

    private func fetchCategoryPage(_ query: String, cursor: String?, append: Bool) async throws {
        switch category {
        case .all:
            return
        case .people:
            let page = try await repository.searchUsersCategory(query: query, sort: sort, filters: filters, cursor: cursor)
            results = SearchResults(users: append ? results.users + page.results : page.results, posts: [])
            nextCursor = page.nextCursor
        case .posts:
            let page = try await repository.searchPostsCategory(query: query, sort: sort, filters: filters, cursor: cursor)
            let merged = append ? results.posts + page.results : page.results
            results = SearchResults(users: [], posts: merged)
            nextCursor = page.nextCursor
            interactions?.seed(merged, replacing: true)
        case .hashtags:
            let page = try await repository.searchHashtagsCategory(query: query, sort: sort, filters: filters, cursor: cursor)
            results = SearchResults(users: [], posts: [], hashtags: append ? results.hashtags + page.results : page.results)
            nextCursor = page.nextCursor
        case .communities:
            let page = try await repository.searchCommunitiesCategory(query: query, sort: sort, filters: filters, cursor: cursor)
            results = SearchResults(users: [], posts: [], communities: append ? results.communities + page.results : page.results)
            nextCursor = page.nextCursor
        case .news:
            let page = try await repository.searchNewsCategory(query: query, sort: sort, filters: filters, cursor: cursor)
            results = SearchResults(users: [], posts: [], news: append ? results.news + page.results : page.results)
            nextCursor = page.nextCursor
        case .music:
            let page = try await repository.searchMusicCategory(query: query, sort: sort, filters: filters, cursor: cursor)
            results = SearchResults(users: [], posts: [], music: append ? results.music + page.results : page.results)
            nextCursor = page.nextCursor
        case .opportunities:
            let page = try await repository.searchOpportunitiesCategory(query: query, sort: sort, filters: filters, cursor: cursor)
            results = SearchResults(users: [], posts: [], opportunities: append ? results.opportunities + page.results : page.results)
            nextCursor = page.nextCursor
        case .marketplace:
            let page = try await repository.searchMarketplaceCategory(query: query, sort: sort, filters: filters, cursor: cursor)
            results = SearchResults(users: [], posts: [], marketplace: append ? results.marketplace + page.results : page.results)
            nextCursor = page.nextCursor
        }
    }

    func onHashtagClick(tag: String) {
        query = tag
        handleQueryChange()
    }

    /// Debounced the same way `scheduleSearch()` is, and re-callable
    /// directly (the error state's own retry button) since it reads the
    /// current query itself rather than taking one as an argument.
    func scheduleHashtagSearch() {
        hashtagSearchTask?.cancel()

        guard let text = hashtagSearchTerm(from: query) else {
            hashtagMatches = []
            isSearchingHashtags = false
            hashtagSearchError = nil
            hashtagNextCursor = nil
            return
        }

        hashtagSearchTask = Task { [weak self] in
            try? await Task.sleep(for: .milliseconds(300))
            guard let self, !Task.isCancelled else { return }

            self.isSearchingHashtags = true
            defer { self.isSearchingHashtags = false }

            do {
                let page = try await self.repository.searchHashtags(query: text, cursor: nil)
                guard !Task.isCancelled else { return }
                self.hashtagMatches = page.items
                self.hashtagNextCursor = page.nextCursor
                self.hashtagSearchError = nil
            } catch is CancellationError {
                return
            } catch ApiError.cancelled {
                return
            } catch {
                guard !Task.isCancelled else { return }
                self.hashtagSearchError = error as? ApiError ?? .transport(underlying: "\(error)")
            }
        }
    }

    /// Not debounced - triggered by scroll position the same way
    /// `NewsViewModel.loadMoreIfNeeded` is, so a duplicate in-flight
    /// request is guarded by `isLoadingMoreHashtags` instead of a timer.
    func loadMoreHashtagsIfNeeded(current: TrendingHashtag) async {
        guard
            !isSearchingHashtags,
            !isLoadingMoreHashtags,
            let cursor = hashtagNextCursor,
            let index = hashtagMatches.firstIndex(of: current),
            index >= hashtagMatches.count - 3,
            let text = hashtagSearchTerm(from: query)
        else { return }

        isLoadingMoreHashtags = true
        defer { isLoadingMoreHashtags = false }

        if let page = try? await repository.searchHashtags(query: text, cursor: cursor) {
            let existing = Set(hashtagMatches.map(\.tag))
            hashtagMatches.append(contentsOf: page.items.filter { !existing.contains($0.tag) })
            hashtagNextCursor = page.nextCursor
        }
    }
}
