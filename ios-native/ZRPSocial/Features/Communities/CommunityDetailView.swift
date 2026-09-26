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
    @Published private(set) var isDeleting = false
    @Published var deleteErrorMessage: String?
    @Published private(set) var isLeaving = false
    @Published var leaveErrorMessage: String?

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

    func join() {
        guard let community, !community.isMember else { return }
        self.community = Community(
            id: community.id, slug: community.slug, name: community.name,
            description: community.description, category: community.category,
            hashtag: community.hashtag, iconUrl: community.iconUrl,
            memberCount: community.memberCount + 1,
            isMember: true, myRole: community.myRole
        )
        Task {
            do {
                _ = try await repository.join(id: communityId)
            } catch {
                await loadDetail()
            }
        }
    }

    /// Leaving is explicit and confirmed, never a silent toggle - and
    /// never offered to the OWNER: `POST .../leave` answers 409 for the
    /// owner (delete the community instead). Returns whether it
    /// succeeded so the view can pop back to the list.
    func leave() async -> Bool {
        isLeaving = true
        defer { isLeaving = false }
        do {
            _ = try await repository.leave(id: communityId)
            return true
        } catch {
            leaveErrorMessage = (error as? ApiError)?.serverMessage ?? L10n.string(.communitiesErrorLeave)
            await loadDetail()
            return false
        }
    }

    /// Server-authorized to the creator/an admin regardless of what the
    /// UI shows - see CommunitiesRepository's own doc comment. Returns
    /// whether deletion succeeded, so the view knows when to pop back.
    func delete() async -> Bool {
        isDeleting = true
        defer { isDeleting = false }
        do {
            try await repository.delete(id: communityId)
            return true
        } catch {
            deleteErrorMessage = (error as? ApiError)?.serverMessage ?? L10n.string(.communitiesDetailDeleteError)
            return false
        }
    }
}

struct CommunityDetailView: View {

    @StateObject private var viewModel: CommunityDetailViewModel
    @EnvironmentObject private var interactions: PostInteractionStore
    @Environment(\.dismiss) private var dismiss
    @State private var showDeleteConfirm = false
    @State private var showLeaveConfirm = false

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
        .confirmationDialog(
            Text(.communitiesDetailDeleteConfirmTitle),
            isPresented: $showDeleteConfirm,
            titleVisibility: .visible
        ) {
            Button(role: .destructive) {
                Task {
                    if await viewModel.delete() { dismiss() }
                }
            } label: {
                Text(.communitiesDetailDeleteConfirmAction)
            }
        } message: {
            if let community = viewModel.community {
                Text(
                    .communitiesDetailDeleteConfirmBody,
                    ["name": community.name, "hashtag": community.hashtag]
                )
            }
        }
        .confirmationDialog(
            Text(.communitiesDetailLeaveConfirmTitle),
            isPresented: $showLeaveConfirm,
            titleVisibility: .visible
        ) {
            Button {
                Task {
                    if await viewModel.leave() { dismiss() }
                }
            } label: {
                Text(.communitiesLeave)
            }
        } message: {
            if let community = viewModel.community {
                Text(.communitiesDetailLeaveConfirmBody, ["name": community.name])
            }
        }
        .alert(
            Text(.iosErrorGenericTitle),
            isPresented: Binding(
                get: { viewModel.leaveErrorMessage != nil },
                set: { if !$0 { viewModel.leaveErrorMessage = nil } }
            )
        ) {
            Button { viewModel.leaveErrorMessage = nil } label: { Text(.actionCancel) }
        } message: {
            Text(verbatim: viewModel.leaveErrorMessage ?? "")
        }
        .alert(
            Text(.iosErrorGenericTitle),
            isPresented: Binding(
                get: { viewModel.deleteErrorMessage != nil },
                set: { if !$0 { viewModel.deleteErrorMessage = nil } }
            )
        ) {
            Button { viewModel.deleteErrorMessage = nil } label: { Text(.actionCancel) }
        } message: {
            Text(verbatim: viewModel.deleteErrorMessage ?? "")
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

                    if viewModel.myRole == "OWNER" {
                        Button {
                            showDeleteConfirm = true
                        } label: {
                            Image(systemName: "trash")
                                .foregroundStyle(ZrpColor.onSurfaceMuted)
                                .frame(width: ZrpMetrics.minTouchTarget, height: ZrpMetrics.minTouchTarget)
                                .contentShape(Rectangle())
                        }
                        .accessibilityLabel(Text(.communitiesDetailDeleteButton))
                    }

                    if !community.isMember {
                        Button(action: { viewModel.join() }) {
                            Text(.communitiesJoin)
                                .font(.footnote.weight(.semibold))
                                .padding(.horizontal, ZrpSpacing.lg)
                                .frame(minHeight: ZrpMetrics.minTouchTarget)
                                .background(ZrpColor.red)
                                .foregroundStyle(.white)
                                .clipShape(Capsule())
                        }
                    } else if viewModel.myRole == "OWNER" {
                        // The owner can't leave (server rule, 409) - a
                        // non-interactive "Joined" and the hint below.
                        Text(.communitiesJoined)
                            .font(.footnote.weight(.semibold))
                            .padding(.horizontal, ZrpSpacing.lg)
                            .frame(minHeight: ZrpMetrics.minTouchTarget)
                            .background(ZrpColor.surfaceElevated)
                            .foregroundStyle(ZrpColor.onSurfaceMuted)
                            .clipShape(Capsule())
                    } else {
                        Button(action: { showLeaveConfirm = true }) {
                            Text(.communitiesLeave)
                                .font(.footnote.weight(.semibold))
                                .padding(.horizontal, ZrpSpacing.lg)
                                .frame(minHeight: ZrpMetrics.minTouchTarget)
                                .background(ZrpColor.surfaceElevated)
                                .foregroundStyle(ZrpColor.onSurface)
                                .clipShape(Capsule())
                        }
                    }
                }
                .font(.caption)
                .foregroundStyle(ZrpColor.onSurfaceMuted)

                if viewModel.myRole == "OWNER" {
                    Text(.communitiesDetailOwnerCannotLeave)
                        .font(.caption)
                        .foregroundStyle(ZrpColor.onSurfaceMuted)
                        .fixedSize(horizontal: false, vertical: true)
                }
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
