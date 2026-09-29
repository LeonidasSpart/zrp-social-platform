import SwiftUI

/// Search across people, posts and (Task #2) six more Advanced Search
/// categories, with a real discover state before a query is typed, and
/// hashtag search-as-you-type for a "#"-led query.
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
            .onChange(of: viewModel.query) { _, _ in viewModel.handleQueryChange() }
            .task {
                viewModel.attach(interactions: interactions)
                await viewModel.loadDiscover()
            }
    }

    @ViewBuilder
    private var content: some View {
        if viewModel.isHashtagQuery {
            hashtagResultsBody
        } else if !viewModel.isSearchActive {
            discover
        } else if !viewModel.isQueryLongEnough {
            // The route returns empty below two characters, so saying why
            // beats an inaccurate "no results found".
            TimelineStateView.empty(
                systemImage: "character.cursor.ibeam",
                title: .iosSearchMinLength,
                subtitle: nil
            )
        } else {
            advancedSearchBody
        }
    }

    // MARK: - Advanced Search (Task #2)

    private var advancedSearchBody: some View {
        VStack(spacing: 0) {
            categoryTabs
            sortAndFiltersRow
            if viewModel.showFilters {
                filtersPanel
            }
            resultsArea
        }
    }

    private var categoryTabs: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: ZrpSpacing.sm) {
                ForEach(SearchCategory.allCases) { category in
                    categoryChip(category)
                }
            }
            .padding(.horizontal, ZrpSpacing.lg)
            .padding(.vertical, ZrpSpacing.sm)
        }
    }

    private func categoryChip(_ category: SearchCategory) -> some View {
        let selected = viewModel.category == category
        return Button {
            viewModel.category = category
        } label: {
            Text(category.titleKey)
                .font(.subheadline.weight(selected ? .semibold : .regular))
                .padding(.horizontal, ZrpSpacing.md)
                .padding(.vertical, ZrpSpacing.sm)
                .background(selected ? ZrpColor.red : ZrpColor.surfaceHighest)
                .foregroundStyle(selected ? Color.white : ZrpColor.onSurface)
                .clipShape(Capsule())
        }
        .buttonStyle(.plain)
    }

    private var sortAndFiltersRow: some View {
        HStack {
            Menu {
                ForEach(SearchSortOption.allCases) { option in
                    Button {
                        viewModel.sort = option
                    } label: {
                        if viewModel.sort == option {
                            Label { Text(option.titleKey) } icon: { Image(systemName: "checkmark") }
                        } else {
                            Text(option.titleKey)
                        }
                    }
                }
            } label: {
                HStack(spacing: 4) {
                    Text(.searchSort)
                    Text(viewModel.sort.titleKey)
                        .fontWeight(.semibold)
                    Image(systemName: "chevron.down")
                        .font(.caption2)
                }
                .font(.subheadline)
                .foregroundStyle(ZrpColor.onSurface)
            }

            Spacer(minLength: 0)

            Button {
                viewModel.showFilters.toggle()
            } label: {
                HStack(spacing: 4) {
                    Image(systemName: "line.3.horizontal.decrease.circle" + (viewModel.showFilters || viewModel.filters.isActive ? ".fill" : ""))
                    Text(.searchFilters)
                }
                .font(.subheadline.weight(viewModel.filters.isActive ? .semibold : .regular))
                .foregroundStyle(viewModel.filters.isActive ? ZrpColor.red : ZrpColor.onSurface)
            }
        }
        .padding(.horizontal, ZrpSpacing.lg)
        .padding(.vertical, ZrpSpacing.xs)
    }

    private var showsMediaFilter: Bool { viewModel.category == .all || viewModel.category == .posts }
    private var showsPersonFilters: Bool {
        [.all, .people, .posts, .opportunities, .marketplace].contains(viewModel.category)
    }

    private var filtersPanel: some View {
        VStack(alignment: .leading, spacing: ZrpSpacing.sm) {
            Text(.searchDateRange)
                .font(.caption.weight(.semibold))
                .foregroundStyle(ZrpColor.onSurfaceMuted)

            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: ZrpSpacing.sm) {
                    ForEach(SearchDateRangeOption.allCases) { option in
                        filterChoiceChip(
                            title: option.titleKey,
                            selected: viewModel.filters.dateRange == option
                        ) {
                            viewModel.filters.dateRange = option
                        }
                    }
                }
            }

            if viewModel.filters.dateRange == .custom {
                HStack(spacing: ZrpSpacing.sm) {
                    TextField(L10n.string(.searchDateFrom), text: Binding(
                        get: { viewModel.filters.dateFrom ?? "" },
                        set: { viewModel.filters.dateFrom = $0.isEmpty ? nil : $0 }
                    ))
                    .textFieldStyle(.roundedBorder)
                    TextField(L10n.string(.searchDateTo), text: Binding(
                        get: { viewModel.filters.dateTo ?? "" },
                        set: { viewModel.filters.dateTo = $0.isEmpty ? nil : $0 }
                    ))
                    .textFieldStyle(.roundedBorder)
                }
            }

            if showsMediaFilter {
                Text(.searchMedia)
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(ZrpColor.onSurfaceMuted)
                    .padding(.top, ZrpSpacing.xs)

                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: ZrpSpacing.sm) {
                        filterChoiceChip(title: .searchMediaAll, selected: viewModel.filters.media == nil) {
                            viewModel.filters.media = nil
                        }
                        ForEach(SearchMediaFilterOption.allCases) { option in
                            filterChoiceChip(title: option.titleKey, selected: viewModel.filters.media == option) {
                                viewModel.filters.media = option
                            }
                        }
                    }
                }
            }

            if showsPersonFilters {
                HStack(spacing: ZrpSpacing.sm) {
                    TextField(L10n.string(.navLanguage), text: Binding(
                        get: { viewModel.filters.language ?? "" },
                        set: { viewModel.filters.language = $0.isEmpty ? nil : $0 }
                    ))
                    .textFieldStyle(.roundedBorder)
                    TextField(L10n.string(.settingsCountry), text: Binding(
                        get: { viewModel.filters.country ?? "" },
                        set: { viewModel.filters.country = $0.isEmpty ? nil : $0 }
                    ))
                    .textFieldStyle(.roundedBorder)
                }
                .padding(.top, ZrpSpacing.xs)

                Toggle(isOn: $viewModel.filters.verified) { Text(.searchVerified) }
                Toggle(isOn: $viewModel.filters.professional) { Text(.searchProfessional) }
                Toggle(isOn: $viewModel.filters.creator) { Text(.searchCreator) }
            }

            if viewModel.filters.isActive {
                Button {
                    viewModel.clearFilters()
                } label: {
                    Text(.searchClearFilters)
                        .font(.footnote.weight(.semibold))
                }
                .padding(.top, ZrpSpacing.xs)
            }
        }
        .padding(.horizontal, ZrpSpacing.lg)
        .padding(.vertical, ZrpSpacing.sm)
    }

    private func filterChoiceChip(title: L10nKey, selected: Bool, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Text(title)
                .font(.caption.weight(selected ? .semibold : .regular))
                .padding(.horizontal, ZrpSpacing.sm)
                .padding(.vertical, 6)
                .background(selected ? ZrpColor.red.opacity(0.15) : ZrpColor.surfaceHighest)
                .foregroundStyle(selected ? ZrpColor.red : ZrpColor.onSurface)
                .clipShape(Capsule())
        }
        .buttonStyle(.plain)
    }

    @ViewBuilder
    private var resultsArea: some View {
        if viewModel.isSearching && isCurrentBucketEmpty {
            TimelineStateView.loading()
        } else if let error = viewModel.searchError {
            TimelineStateView.error(error) { viewModel.scheduleSearch() }
        } else if viewModel.category == .all {
            allModeSections
        } else {
            singleCategoryResults
        }
    }

    private var isCurrentBucketEmpty: Bool {
        switch viewModel.category {
        case .all: return !viewModel.hasAnyAllModeResults
        case .people: return viewModel.results.users.isEmpty
        case .posts: return viewModel.results.posts.isEmpty
        case .hashtags: return viewModel.results.hashtags.isEmpty
        case .communities: return viewModel.results.communities.isEmpty
        case .news: return viewModel.results.news.isEmpty
        case .music: return viewModel.results.music.isEmpty
        case .opportunities: return viewModel.results.opportunities.isEmpty
        case .marketplace: return viewModel.results.marketplace.isEmpty
        }
    }

    // MARK: - type=all teaser sections

    private var allModeSections: some View {
        Group {
            if !viewModel.hasAnyAllModeResults {
                TimelineStateView.empty(systemImage: "magnifyingglass", title: .iosSearchNoResults, subtitle: nil)
            } else {
                ScrollView {
                    LazyVStack(alignment: .leading, spacing: ZrpSpacing.lg) {
                        if !viewModel.results.users.isEmpty {
                            sectionHeader(.searchPeopleTab) { viewModel.category = .people }
                            ForEach(viewModel.results.users) { userRow($0) }
                        }
                        if !viewModel.results.posts.isEmpty {
                            sectionHeader(.searchPostsTab) { viewModel.category = .posts }
                            PostListView(posts: viewModel.results.posts, isLoadingMore: false, hasMore: false, header: { EmptyView() })
                        }
                        if !viewModel.results.hashtags.isEmpty {
                            sectionHeader(.searchHashtagsTab) { viewModel.category = .hashtags }
                            ForEach(viewModel.results.hashtags) { hashtagRow($0) }
                        }
                        if !viewModel.results.communities.isEmpty {
                            sectionHeader(.navCommunities) { viewModel.category = .communities }
                            ForEach(viewModel.results.communities) { communityRow($0) }
                        }
                        if !viewModel.results.news.isEmpty {
                            sectionHeader(.navNews) { viewModel.category = .news }
                            ForEach(viewModel.results.news) { newsRow($0) }
                        }
                        if !viewModel.results.music.isEmpty {
                            sectionHeader(.navMusic) { viewModel.category = .music }
                            ForEach(viewModel.results.music) { musicRow($0) }
                        }
                        if !viewModel.results.opportunities.isEmpty {
                            sectionHeader(.navOpportunity) { viewModel.category = .opportunities }
                            ForEach(viewModel.results.opportunities) { listing in
                                Button {
                                    navigator.push(.opportunityDetail(id: listing.id))
                                } label: {
                                    OpportunityRow(listing: listing)
                                }
                                .buttonStyle(.plain)
                                .padding(.horizontal, ZrpSpacing.lg)
                            }
                        }
                        if !viewModel.results.marketplace.isEmpty {
                            sectionHeader(.navMarketplace) { viewModel.category = .marketplace }
                            ForEach(viewModel.results.marketplace) { listing in
                                Button {
                                    navigator.push(.listingDetail(id: listing.id))
                                } label: {
                                    ListingCardView(listing: listing)
                                }
                                .buttonStyle(.plain)
                                .padding(.horizontal, ZrpSpacing.lg)
                            }
                        }
                    }
                    .padding(.vertical, ZrpSpacing.lg)
                    .frame(maxWidth: ZrpMetrics.contentMaxWidth)
                    .frame(maxWidth: .infinity)
                }
            }
        }
    }

    private func sectionHeader(_ titleKey: L10nKey, onSeeAll: @escaping () -> Void) -> some View {
        HStack {
            Text(titleKey)
                .font(.headline)
                .foregroundStyle(ZrpColor.onSurface)
            Spacer(minLength: 0)
            Button(action: onSeeAll) {
                Text(.searchSeeAll)
                    .font(.subheadline)
            }
        }
        .padding(.horizontal, ZrpSpacing.lg)
    }

    // MARK: - Single-category paginated results

    private var singleCategoryResults: some View {
        ScrollView {
            LazyVStack(spacing: 0) {
                switch viewModel.category {
                case .all:
                    EmptyView()
                case .people:
                    if viewModel.results.users.isEmpty {
                        TimelineStateView.empty(systemImage: "person.slash", title: .searchNoUsers, subtitle: nil)
                    } else {
                        ForEach(viewModel.results.users) { user in
                            userRow(user)
                                .onAppear { loadMoreIfLast(user.id, viewModel.results.users) }
                        }
                    }
                case .posts:
                    if viewModel.results.posts.isEmpty {
                        TimelineStateView.empty(systemImage: "doc.text.magnifyingglass", title: .searchNoPosts, subtitle: nil)
                    } else {
                        PostListView(
                            posts: viewModel.results.posts,
                            isLoadingMore: viewModel.isLoadingMore,
                            hasMore: viewModel.canLoadMore,
                            onAppear: { post in loadMoreIfLast(post.id, viewModel.results.posts) },
                            header: { EmptyView() }
                        )
                    }
                case .hashtags:
                    if viewModel.results.hashtags.isEmpty {
                        TimelineStateView.empty(systemImage: "number", title: .searchNoHashtags, subtitle: nil)
                    } else {
                        ForEach(viewModel.results.hashtags) { hashtag in
                            hashtagRow(hashtag)
                                .onAppear { loadMoreIfLast(hashtag.id, viewModel.results.hashtags) }
                        }
                    }
                case .communities:
                    if viewModel.results.communities.isEmpty {
                        TimelineStateView.empty(systemImage: "person.3", title: .searchNoCommunities, subtitle: nil)
                    } else {
                        ForEach(viewModel.results.communities) { community in
                            communityRow(community)
                                .onAppear { loadMoreIfLast(community.id, viewModel.results.communities) }
                        }
                    }
                case .news:
                    if viewModel.results.news.isEmpty {
                        TimelineStateView.empty(systemImage: "newspaper", title: .searchNoNews, subtitle: nil)
                    } else {
                        ForEach(viewModel.results.news) { article in
                            newsRow(article)
                                .onAppear { loadMoreIfLast(article.id, viewModel.results.news) }
                        }
                    }
                case .music:
                    if viewModel.results.music.isEmpty {
                        TimelineStateView.empty(systemImage: "music.note", title: .searchNoMusic, subtitle: nil)
                    } else {
                        ForEach(viewModel.results.music) { item in
                            musicRow(item)
                                .onAppear { loadMoreIfLast(item.id, viewModel.results.music) }
                        }
                    }
                case .opportunities:
                    if viewModel.results.opportunities.isEmpty {
                        TimelineStateView.empty(systemImage: "briefcase", title: .searchNoOpportunities, subtitle: nil)
                    } else {
                        ForEach(viewModel.results.opportunities) { listing in
                            Button {
                                navigator.push(.opportunityDetail(id: listing.id))
                            } label: {
                                OpportunityRow(listing: listing)
                            }
                            .buttonStyle(.plain)
                            .padding(.horizontal, ZrpSpacing.lg)
                            .padding(.vertical, ZrpSpacing.sm)
                            .onAppear { loadMoreIfLast(listing.id, viewModel.results.opportunities) }
                        }
                    }
                case .marketplace:
                    if viewModel.results.marketplace.isEmpty {
                        TimelineStateView.empty(systemImage: "cart", title: .searchNoMarketplace, subtitle: nil)
                    } else {
                        ForEach(viewModel.results.marketplace) { listing in
                            Button {
                                navigator.push(.listingDetail(id: listing.id))
                            } label: {
                                ListingCardView(listing: listing)
                            }
                            .buttonStyle(.plain)
                            .padding(.horizontal, ZrpSpacing.lg)
                            .padding(.vertical, ZrpSpacing.sm)
                            .onAppear { loadMoreIfLast(listing.id, viewModel.results.marketplace) }
                        }
                    }
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
    }

    /// Triggers `loadMoreIfNeeded()` once the second-to-last row appears,
    /// the same threshold `OpportunityView`'s own infinite scroll uses.
    private func loadMoreIfLast<Item: Identifiable>(_ id: Item.ID, _ items: [Item]) {
        guard id == items.last?.id else { return }
        Task { await viewModel.loadMoreIfNeeded() }
    }

    // MARK: - Hashtag search-as-you-type

    @ViewBuilder
    private var hashtagResultsBody: some View {
        if let error = viewModel.hashtagSearchError, viewModel.hashtagMatches.isEmpty {
            TimelineStateView.error(error) { viewModel.scheduleHashtagSearch() }
        } else if viewModel.isSearchingHashtags && viewModel.hashtagMatches.isEmpty {
            TimelineStateView.loading()
        } else if viewModel.hashtagMatches.isEmpty {
            TimelineStateView.empty(
                systemImage: "number",
                title: .iosSearchNoHashtags,
                subtitle: nil
            )
        } else {
            ScrollView {
                LazyVStack(spacing: 0) {
                    ForEach(viewModel.hashtagMatches) { hashtag in
                        Button {
                            navigator.push(.hashtag(tag: hashtag.tag))
                        } label: {
                            hashtagRow(hashtag)
                        }
                        .buttonStyle(.plain)
                        .onAppear {
                            Task { await viewModel.loadMoreHashtagsIfNeeded(current: hashtag) }
                        }
                    }

                    if viewModel.isLoadingMoreHashtags {
                        ProgressView()
                            .tint(ZrpColor.onSurfaceMuted)
                            .padding(ZrpSpacing.lg)
                    }
                }
                .frame(maxWidth: ZrpMetrics.contentMaxWidth)
                .frame(maxWidth: .infinity)
            }
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

    // MARK: - Shared rows

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

    private func hashtagRow(_ hashtag: TrendingHashtag) -> some View {
        HStack {
            VStack(alignment: .leading, spacing: 2) {
                Text(verbatim: "#\(hashtag.tag)")
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(ZrpColor.onSurface)
                Text(.explorePostCount, ["n": CountFormatting.exact(hashtag.count)])
                    .font(.caption)
                    .foregroundStyle(ZrpColor.onSurfaceMuted)
            }
            Spacer(minLength: 0)
        }
        .padding(.horizontal, ZrpSpacing.lg)
        .frame(minHeight: ZrpMetrics.minTouchTarget)
        .contentShape(Rectangle())
        .onTapGesture { navigator.push(.hashtag(tag: hashtag.tag)) }
    }

    private func communityRow(_ community: Community) -> some View {
        Button {
            navigator.push(.communityDetail(id: community.id))
        } label: {
            HStack(spacing: ZrpSpacing.md) {
                AvatarView(url: community.iconUrl, displayName: community.name, size: ZrpMetrics.avatarMedium)
                VStack(alignment: .leading, spacing: 2) {
                    Text(verbatim: community.name)
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(ZrpColor.onSurface)
                        .lineLimit(1)
                    Text(verbatim: community.description)
                        .font(.footnote)
                        .foregroundStyle(ZrpColor.onSurfaceMuted)
                        .lineLimit(1)
                }
                Spacer(minLength: 0)
            }
            .padding(.horizontal, ZrpSpacing.lg)
            .padding(.vertical, ZrpSpacing.md)
            .frame(maxWidth: .infinity, alignment: .leading)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }

    private func newsRow(_ article: NewsArticle) -> some View {
        Button {
            navigator.push(.newsArticle(slug: article.slug))
        } label: {
            HStack(spacing: ZrpSpacing.md) {
                Image(systemName: "newspaper")
                    .foregroundStyle(ZrpColor.onSurfaceMuted)
                VStack(alignment: .leading, spacing: 2) {
                    Text(verbatim: article.title)
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(ZrpColor.onSurface)
                        .lineLimit(2)
                    if let sourceName = article.sourceName, !sourceName.isEmpty {
                        Text(verbatim: sourceName)
                            .font(.footnote)
                            .foregroundStyle(ZrpColor.onSurfaceMuted)
                    }
                }
                Spacer(minLength: 0)
            }
            .padding(.horizontal, ZrpSpacing.lg)
            .padding(.vertical, ZrpSpacing.md)
            .frame(maxWidth: .infinity, alignment: .leading)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }

    /// Tapping a track surfaces its artist page (where it can be played
    /// from) rather than wiring a dedicated track detail/playback route
    /// into Search - there is no such route today (tracks play from a
    /// queue, not a detail screen).
    private func musicRow(_ item: SearchMusicResult) -> some View {
        let subtitle: String? = (item.kind == "album" || item.kind == "track") ? item.artist?.displayName : nil
        return Button {
            switch item.kind {
            case "artist": navigator.push(.musicArtist(id: item.id))
            case "album": navigator.push(.musicAlbum(id: item.id))
            case "track":
                if let artistId = item.artist?.id { navigator.push(.musicArtist(id: artistId)) }
            case "playlist": navigator.push(.musicPlaylist(id: item.id))
            default: break
            }
        } label: {
            HStack(spacing: ZrpSpacing.md) {
                AvatarView(url: item.avatarUrl ?? item.coverUrl ?? item.artist?.avatarUrl, displayName: item.displayTitle, size: ZrpMetrics.avatarMedium)
                VStack(alignment: .leading, spacing: 2) {
                    HStack(spacing: ZrpSpacing.xs) {
                        Text(verbatim: item.displayTitle)
                            .font(.subheadline.weight(.semibold))
                            .foregroundStyle(ZrpColor.onSurface)
                            .lineLimit(1)
                        if item.verified {
                            VerifiedBadge(badgeType: "verified", size: 12)
                        }
                    }
                    if let subtitle, !subtitle.isEmpty {
                        Text(verbatim: subtitle)
                            .font(.footnote)
                            .foregroundStyle(ZrpColor.onSurfaceMuted)
                            .lineLimit(1)
                    }
                }
                Spacer(minLength: 0)
            }
            .padding(.horizontal, ZrpSpacing.lg)
            .padding(.vertical, ZrpSpacing.md)
            .frame(maxWidth: .infinity, alignment: .leading)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }
}
