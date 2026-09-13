import SwiftUI

@MainActor
final class CommunityDetailViewModel: ObservableObject {

    enum Phase: Equatable {
        case idle
        case loading
        case loaded
        case notFound
        case failed(ApiError)
    }

    @Published private(set) var community: Community?
    @Published private(set) var myRole: String?
    @Published private(set) var phase: Phase = .idle
    @Published private(set) var posts: [Post] = []
    @Published private(set) var isLoadingMore = false

    let communityId: String
    private var cursor: String?
    private let repository: CommunitiesRepositoryProtocol
    private weak var interactions: PostInteractionStore?

    init(communityId: String, repository: CommunitiesRepositoryProtocol = CommunitiesRepository()) {
        self.communityId = communityId
        self.repository = repository
    }

    func attach(interactions: PostInteractionStore) {
        self.interactions = interactions
    }

    var hasMore: Bool { cursor != nil }

    func loadIfNeeded() async {
        guard phase == .idle else { return }
        async let detail: Void = loadDetail()
        async let feed: Void = loadFeed(replacingExisting: true)
        _ = await (detail, feed)
    }

    func refresh() async {
        await loadDetail()
        await loadFeed(replacingExisting: true)
    }

    func loadMoreIfNeeded(current: Post) async {
        guard hasMore, !isLoadingMore, let index = posts.firstIndex(where: { $0.id == current.id }),
              index >= posts.count - 3
        else { return }
        await loadFeed(replacingExisting: false)
    }

    private func loadDetail() async {
        if community == nil { phase = .loading }
        do {
            let response = try await repository.community(id: communityId)
            community = response.community
            myRole = response.myRole
            phase = .loaded
        } catch let error as ApiError where error.isNotFound {
            phase = .notFound
        } catch {
            phase = .failed(error as? ApiError ?? .transport(underlying: "\(error)"))
        }
    }

    private func loadFeed(replacingExisting: Bool) async {
        if replacingExisting {
            // Loading state is driven by `phase`/`loadDetail`, not here.
        } else {
            isLoadingMore = true
        }
        do {
            let page = try await repository.feed(id: communityId, cursor: replacingExisting ? nil : cursor)
            if replacingExisting {
                posts = page.posts
            } else {
                let existing = Set(posts.map(\.id))
                posts.append(contentsOf: page.posts.filter { !existing.contains($0.id) })
            }
            cursor = page.nextCursor
            isLoadingMore = false
            interactions?.seed(page.posts, replacing: replacingExisting)
        } catch {
            isLoadingMore = false
        }
    }

    func toggleMembership() {
        guard let community else { return }
        let wasMember = community.isMember
        self.community = Community(
            id: community.id, slug: community.slug, name: community.name,
            description: community.description, category: community.category,
            hashtag: community.hashtag, iconUrl: community.iconUrl,
            memberCount: community.memberCount + (wasMember ? -1 : 1),
            isMember: !wasMember, myRole: community.myRole
        )
        Task {
            do {
                _ = wasMember ? try await repository.leave(id: communityId) : try await repository.join(id: communityId)
            } catch {
                await loadDetail()
            }
        }
    }
}

struct CommunityDetailView: View {

    @StateObject private var viewModel: CommunityDetailViewModel
    @EnvironmentObject private var interactions: PostInteractionStore

    init(communityId: String) {
        _viewModel = StateObject(wrappedValue: CommunityDetailViewModel(communityId: communityId))
    }

    var body: some View {
        Group {
            switch viewModel.phase {
            case .idle, .loading:
                TimelineStateView.loading()
            case .notFound:
                TimelineStateView.empty(
                    systemImage: "person.3",
                    title: .communitiesDetailNotFound,
                    subtitle: nil
                )
            case .failed(let error):
                TimelineStateView.error(error) { Task { await viewModel.refresh() } }
            case .loaded:
                ScrollView {
                    PostListView(
                        posts: viewModel.posts,
                        isLoadingMore: viewModel.isLoadingMore,
                        hasMore: viewModel.hasMore,
                        onAppear: { post in Task { await viewModel.loadMoreIfNeeded(current: post) } },
                        header: { header }
                    )
                }
                .refreshable { await viewModel.refresh() }
            }
        }
        .background(ZrpColor.background.ignoresSafeArea())
        .navigationTitle(Text(verbatim: viewModel.community?.name ?? L10n.string(.communitiesTitle)))
        .navigationBarTitleDisplayMode(.inline)
        .task {
            viewModel.attach(interactions: interactions)
            await viewModel.loadIfNeeded()
        }
    }

    @ViewBuilder
    private var header: some View {
        if let community = viewModel.community {
            VStack(alignment: .leading, spacing: ZrpSpacing.sm) {
                Text(verbatim: community.description)
                    .font(.subheadline)
                    .foregroundStyle(ZrpColor.onSurface)

                HStack(spacing: ZrpSpacing.md) {
                    Label(
                        L10n.string(
                            community.memberCount == 1 ? .communitiesMemberCountOne : .communitiesMemberCountOther,
                            ["n": "\(community.memberCount)"]
                        ),
                        systemImage: "person.2"
                    )
                    Label(community.hashtag, systemImage: "number")

                    if viewModel.myRole == "OWNER" {
                        Text(.communitiesDetailOwnerBadge)
                            .font(.caption.weight(.bold))
                            .padding(.horizontal, ZrpSpacing.sm)
                            .padding(.vertical, 2)
                            .background(ZrpColor.red.opacity(0.12))
                            .foregroundStyle(ZrpColor.red)
                            .clipShape(Capsule())
                    }

                    Spacer()

                    Button(action: { viewModel.toggleMembership() }) {
                        (community.isMember ? Text(.communitiesJoined) : Text(.communitiesJoin))
                            .font(.footnote.weight(.semibold))
                            .padding(.horizontal, ZrpSpacing.lg)
                            .frame(minHeight: ZrpMetrics.minTouchTarget)
                            .background(community.isMember ? ZrpColor.surfaceElevated : ZrpColor.red)
                            .foregroundStyle(community.isMember ? ZrpColor.onSurface : .white)
                            .clipShape(Capsule())
                    }
                }
                .font(.caption)
                .foregroundStyle(ZrpColor.onSurfaceMuted)
            }
            .padding(ZrpSpacing.lg)

            if viewModel.posts.isEmpty {
                VStack(spacing: ZrpSpacing.md) {
                    Image(systemName: "text.bubble")
                        .font(.largeTitle)
                        .foregroundStyle(ZrpColor.onSurfaceMuted)
                    Text(.communitiesDetailFeedEmptyTitle)
                        .font(.headline)
                        .foregroundStyle(ZrpColor.onSurface)
                    Text(.communitiesDetailFeedEmptyBody, ["hashtag": community.hashtag])
                        .font(.subheadline)
                        .foregroundStyle(ZrpColor.onSurfaceMuted)
                        .multilineTextAlignment(.center)
                }
                .frame(maxWidth: .infinity)
                .padding(.top, ZrpSpacing.xl)
                .padding(.horizontal, ZrpSpacing.xl)
            }

            Rectangle().fill(ZrpColor.outlineFaint).frame(height: 0.5)
        }
    }
}
