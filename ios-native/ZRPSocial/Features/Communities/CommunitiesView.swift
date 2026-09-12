import SwiftUI

@MainActor
final class CommunitiesViewModel: ObservableObject {

    enum Phase: Equatable {
        case idle
        case loading
        case loaded
        case failed(ApiError)
    }

    @Published private(set) var communities: [Community] = []
    @Published private(set) var phase: Phase = .idle
    @Published var category: CommunityCategory?
    @Published var search: String = ""

    private let repository: CommunitiesRepositoryProtocol

    init(repository: CommunitiesRepositoryProtocol = CommunitiesRepository()) {
        self.repository = repository
    }

    func loadIfNeeded() async {
        guard phase == .idle else { return }
        await load()
    }

    func load() async {
        if communities.isEmpty { phase = .loading }
        do {
            communities = try await repository.communities(category: category, search: search)
            phase = .loaded
        } catch {
            if communities.isEmpty {
                phase = .failed(error as? ApiError ?? .transport(underlying: "\(error)"))
            } else {
                phase = .loaded
            }
        }
    }

    func toggleMembership(_ community: Community) {
        guard let index = communities.firstIndex(where: { $0.id == community.id }) else { return }
        let wasMember = community.isMember
        communities[index].isMember.toggle()
        communities[index] = Community(
            id: community.id, slug: community.slug, name: community.name,
            description: community.description, category: community.category,
            hashtag: community.hashtag, iconUrl: community.iconUrl,
            memberCount: community.memberCount + (wasMember ? -1 : 1),
            isMember: !wasMember, myRole: community.myRole
        )
        Task {
            do {
                _ = wasMember ? try await repository.leave(id: community.id) : try await repository.join(id: community.id)
            } catch {
                await load()
            }
        }
    }
}

/// Real, database-backed communities (browse/search/category filter,
/// create, join/leave) - the first Communities feature on iOS, backed
/// by prisma/schema.prisma's Community/CommunityMember models.
struct CommunitiesView: View {

    @StateObject private var viewModel = CommunitiesViewModel()
    @State private var showCreate = false
    @EnvironmentObject private var navigator: Navigator

    var body: some View {
        Group {
            switch viewModel.phase {
            case .idle, .loading:
                TimelineStateView.loading()
            case .failed(let error):
                TimelineStateView.error(error) { Task { await viewModel.load() } }
            case .loaded:
                content
            }
        }
        .background(ZrpColor.background.ignoresSafeArea())
        .navigationTitle(Text(.communitiesTitle))
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button(action: { showCreate = true }) {
                    Image(systemName: "plus")
                }
                .accessibilityLabel(Text(.communitiesCreateButton))
            }
        }
        .sheet(isPresented: $showCreate) {
            CreateCommunityView { community in
                showCreate = false
                navigator.push(.communityDetail(id: community.id))
            }
        }
        .task {
            await viewModel.loadIfNeeded()
        }
    }

    private var content: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: ZrpSpacing.md) {
                searchField
                categoryFilter

                if viewModel.communities.isEmpty {
                    TimelineStateView.empty(
                        systemImage: "person.3",
                        title: .communitiesEmptyTitle,
                        subtitle: .communitiesEmptyBody
                    )
                    .frame(maxWidth: .infinity)
                    .padding(.top, ZrpSpacing.xxl)
                } else {
                    ForEach(viewModel.communities) { community in
                        CommunityRow(
                            community: community,
                            onOpen: { navigator.push(.communityDetail(id: community.id)) },
                            onToggleMembership: { viewModel.toggleMembership(community) }
                        )
                    }
                }
            }
            .padding(ZrpSpacing.lg)
        }
        .refreshable { await viewModel.load() }
    }

    private var searchField: some View {
        HStack(spacing: ZrpSpacing.sm) {
            Image(systemName: "magnifyingglass").foregroundStyle(ZrpColor.onSurfaceMuted)
            TextField(L10n.string(.communitiesSearchPlaceholder), text: $viewModel.search)
                .onSubmit { Task { await viewModel.load() } }
                .submitLabel(.search)
        }
        .padding(ZrpSpacing.md)
        .background(ZrpColor.surfaceElevated)
        .clipShape(Capsule())
    }

    private var categoryFilter: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: ZrpSpacing.sm) {
                CategoryChip(title: L10n.string(.communitiesCategoryFilterAll), isSelected: viewModel.category == nil) {
                    viewModel.category = nil
                    Task { await viewModel.load() }
                }
                ForEach(CommunityCategory.allCases, id: \.self) { category in
                    CategoryChip(title: L10n.string(category.titleKey), isSelected: viewModel.category == category) {
                        viewModel.category = category
                        Task { await viewModel.load() }
                    }
                }
            }
        }
    }
}

private struct CategoryChip: View {
    let title: String
    let isSelected: Bool
    let onTap: () -> Void

    var body: some View {
        Button(action: onTap) {
            Text(verbatim: title)
                .font(.subheadline.weight(.semibold))
                .padding(.horizontal, ZrpSpacing.md)
                .padding(.vertical, ZrpSpacing.sm)
                .background(isSelected ? ZrpColor.red : ZrpColor.surfaceElevated)
                .foregroundStyle(isSelected ? .white : ZrpColor.onSurface)
                .clipShape(Capsule())
        }
    }
}

private struct CommunityRow: View {
    let community: Community
    let onOpen: () -> Void
    let onToggleMembership: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: ZrpSpacing.xs) {
            Button(action: onOpen) {
                VStack(alignment: .leading, spacing: ZrpSpacing.xs) {
                    Text(verbatim: community.name)
                        .font(.headline)
                        .foregroundStyle(ZrpColor.onSurface)
                    Text(L10n.string(community.category.titleKey))
                        .font(.caption)
                        .foregroundStyle(ZrpColor.onSurfaceMuted)
                    Text(verbatim: community.description)
                        .font(.subheadline)
                        .foregroundStyle(ZrpColor.onSurface)
                        .lineLimit(2)
                        .frame(maxWidth: .infinity, alignment: .leading)
                }
            }
            .buttonStyle(.plain)

            HStack {
                Image(systemName: "person.2")
                    .font(.caption)
                    .foregroundStyle(ZrpColor.onSurfaceMuted)
                Text(.communitiesMemberCount, ["n": "\(community.memberCount)"])
                    .font(.caption)
                    .foregroundStyle(ZrpColor.onSurfaceMuted)

                Spacer()

                Button(action: onToggleMembership) {
                    Text(community.isMember ? Text(.communitiesJoined) : Text(.communitiesJoin))
                        .font(.footnote.weight(.semibold))
                        .padding(.horizontal, ZrpSpacing.lg)
                        .frame(minHeight: ZrpMetrics.minTouchTarget)
                        .background(community.isMember ? ZrpColor.surfaceElevated : ZrpColor.red)
                        .foregroundStyle(community.isMember ? ZrpColor.onSurface : .white)
                        .clipShape(Capsule())
                }
            }
        }
        .padding(ZrpSpacing.lg)
        .background(ZrpColor.surfaceElevated)
        .clipShape(RoundedRectangle(cornerRadius: 16))
    }
}
