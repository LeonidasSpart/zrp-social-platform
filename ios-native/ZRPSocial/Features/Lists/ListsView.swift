import SwiftUI

@MainActor
final class ListsViewModel: ObservableObject {

    enum Phase: Equatable {
        case idle
        case loading
        case loaded
        case failed(ApiError)
    }

    @Published private(set) var lists: [UserListSummary] = []
    @Published private(set) var phase: Phase = .idle

    private let repository: ListsRepositoryProtocol

    init(repository: ListsRepositoryProtocol = ListsRepository()) {
        self.repository = repository
    }

    func loadIfNeeded() async {
        guard phase == .idle else { return }
        await load()
    }

    func load() async {
        if lists.isEmpty { phase = .loading }
        do {
            lists = try await repository.myLists()
            phase = .loaded
        } catch {
            if lists.isEmpty {
                phase = .failed(error as? ApiError ?? .transport(underlying: "\(error)"))
            } else {
                phase = .loaded
            }
        }
    }
}

/// Twitter/X-style curated lists - entirely new on iOS, backed by
/// prisma/schema.prisma's List/ListMember models.
struct ListsView: View {

    @StateObject private var viewModel = ListsViewModel()
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
                if viewModel.lists.isEmpty {
                    TimelineStateView.empty(
                        systemImage: "list.bullet",
                        title: .listsEmptyTitle,
                        subtitle: .listsEmptyBody
                    )
                } else {
                    ScrollView {
                        LazyVStack(spacing: ZrpSpacing.md) {
                            ForEach(viewModel.lists) { list in
                                Button(action: { navigator.push(.listDetail(id: list.id)) }) {
                                    ListRow(list: list)
                                }
                                .buttonStyle(.plain)
                            }
                        }
                        .padding(ZrpSpacing.lg)
                    }
                    .refreshable { await viewModel.load() }
                }
            }
        }
        .background(ZrpColor.background.ignoresSafeArea())
        .navigationTitle(Text(.listsTitle))
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button(action: { showCreate = true }) {
                    Image(systemName: "plus")
                }
                .accessibilityLabel(Text(.listsCreateButton))
            }
        }
        .sheet(isPresented: $showCreate) {
            CreateListView { list in
                showCreate = false
                navigator.push(.listDetail(id: list.id))
            }
        }
        .task { await viewModel.loadIfNeeded() }
    }
}

private struct ListRow: View {
    let list: UserListSummary

    var body: some View {
        VStack(alignment: .leading, spacing: ZrpSpacing.xs) {
            HStack(spacing: ZrpSpacing.xs) {
                Text(verbatim: list.name)
                    .font(.headline)
                    .foregroundStyle(ZrpColor.onSurface)
                if list.isPrivate {
                    Image(systemName: "lock.fill")
                        .font(.caption)
                        .foregroundStyle(ZrpColor.onSurfaceMuted)
                }
            }
            if let description = list.description, !description.isEmpty {
                Text(verbatim: description)
                    .font(.subheadline)
                    .foregroundStyle(ZrpColor.onSurfaceMuted)
                    .lineLimit(2)
            }
            Text(
                list.memberCount == 1 ? .communitiesMemberCountOne : .communitiesMemberCountOther,
                ["n": "\(list.memberCount)"]
            )
                .font(.caption)
                .foregroundStyle(ZrpColor.onSurfaceMuted)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(ZrpSpacing.lg)
        .background(ZrpColor.surfaceElevated)
        .clipShape(RoundedRectangle(cornerRadius: 16))
    }
}
