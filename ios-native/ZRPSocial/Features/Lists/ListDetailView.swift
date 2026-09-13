import SwiftUI

@MainActor
final class ListDetailViewModel: ObservableObject {

    enum Phase: Equatable {
        case idle
        case loading
        case loaded
        case notFound
        case forbidden
        case failed(ApiError)
    }

    @Published private(set) var list: UserListDetail?
    @Published private(set) var isOwner = false
    @Published private(set) var phase: Phase = .idle
    @Published private(set) var posts: [Post] = []
    @Published private(set) var isLoadingMore = false
    @Published var addMemberError: String?
    @Published private(set) var isAddingMember = false
    @Published private(set) var didDelete = false

    let listId: String
    private var cursor: String?
    private let repository: ListsRepositoryProtocol
    private weak var interactions: PostInteractionStore?

    init(listId: String, repository: ListsRepositoryProtocol = ListsRepository()) {
        self.listId = listId
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
        if list == nil { phase = .loading }
        do {
            let response = try await repository.list(id: listId)
            list = response.list
            isOwner = response.isOwner
            phase = .loaded
        } catch let error as ApiError {
            if error.isNotFound {
                phase = .notFound
            } else if case .forbidden = error {
                phase = .forbidden
            } else {
                phase = .failed(error)
            }
        } catch {
            phase = .failed(.transport(underlying: "\(error)"))
        }
    }

    private func loadFeed(replacingExisting: Bool) async {
        if !replacingExisting { isLoadingMore = true }
        do {
            let page = try await repository.feed(id: listId, cursor: replacingExisting ? nil : cursor)
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

    func addMember(username: String) async -> Bool {
        let trimmed = username.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return false }
        isAddingMember = true
        addMemberError = nil
        defer { isAddingMember = false }

        do {
            _ = try await repository.addMember(id: listId, username: trimmed)
            await loadDetail()
            await loadFeed(replacingExisting: true)
            return true
        } catch let error as ApiError {
            addMemberError = error.userFacingMessage
            return false
        } catch {
            addMemberError = L10n.string(.listsErrorAddMember)
            return false
        }
    }

    func removeMember(userId: String) {
        Task {
            do {
                try await repository.removeMember(id: listId, userId: userId)
                await loadDetail()
                await loadFeed(replacingExisting: true)
            } catch {
                // The row simply stays; nothing to roll back locally
                // since the list is re-fetched rather than mutated in
                // place.
            }
        }
    }

    func delete() async -> Bool {
        do {
            try await repository.deleteList(id: listId)
            didDelete = true
            return true
        } catch {
            return false
        }
    }
}

struct ListDetailView: View {

    @StateObject private var viewModel: ListDetailViewModel
    @EnvironmentObject private var interactions: PostInteractionStore
    @EnvironmentObject private var navigator: Navigator
    @State private var addUsername = ""
    @State private var confirmingDelete = false

    init(listId: String) {
        _viewModel = StateObject(wrappedValue: ListDetailViewModel(listId: listId))
    }

    var body: some View {
        Group {
            switch viewModel.phase {
            case .idle, .loading:
                TimelineStateView.loading()
            case .notFound:
                TimelineStateView.empty(systemImage: "list.bullet", title: .listsDetailNotFound, subtitle: nil)
            case .forbidden:
                TimelineStateView.empty(systemImage: "lock", title: .listsDetailPrivateNotice, subtitle: nil)
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
        .navigationTitle(Text(verbatim: viewModel.list?.name ?? L10n.string(.listsTitle)))
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            if viewModel.isOwner {
                ToolbarItem(placement: .topBarTrailing) {
                    Button(role: .destructive, action: { confirmingDelete = true }) {
                        Image(systemName: "trash")
                    }
                    .accessibilityLabel(Text(.listsDetailDeleteButton))
                }
            }
        }
        .confirmationDialog(
            L10n.string(.listsDetailDeleteConfirm),
            isPresented: $confirmingDelete,
            titleVisibility: .visible
        ) {
            Button(L10n.string(.listsDetailDeleteButton), role: .destructive) {
                Task {
                    if await viewModel.delete() { navigator.pop() }
                }
            }
        }
        .task {
            viewModel.attach(interactions: interactions)
            await viewModel.loadIfNeeded()
        }
    }

    @ViewBuilder
    private var header: some View {
        if let list = viewModel.list {
            VStack(alignment: .leading, spacing: ZrpSpacing.md) {
                if let description = list.description, !description.isEmpty {
                    Text(verbatim: description)
                        .font(.subheadline)
                        .foregroundStyle(ZrpColor.onSurface)
                }

                if viewModel.isOwner {
                    HStack(spacing: ZrpSpacing.sm) {
                        TextField(L10n.string(.listsDetailAddMemberPlaceholder), text: $addUsername)
                            .textInputAutocapitalization(.never)
                            .autocorrectionDisabled()
                            .padding(ZrpSpacing.md)
                            .background(ZrpColor.surfaceElevated)
                            .clipShape(Capsule())

                        if viewModel.isAddingMember {
                            ProgressView()
                        } else {
                            Button(action: {
                                Task {
                                    if await viewModel.addMember(username: addUsername) {
                                        addUsername = ""
                                    }
                                }
                            }) {
                                Text(.listsDetailAddMemberButton)
                                    .font(.footnote.weight(.semibold))
                                    .padding(.horizontal, ZrpSpacing.lg)
                                    .frame(minHeight: ZrpMetrics.minTouchTarget)
                                    .background(ZrpColor.red)
                                    .foregroundStyle(.white)
                                    .clipShape(Capsule())
                            }
                            .disabled(addUsername.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                        }
                    }
                    if let addMemberError = viewModel.addMemberError {
                        Text(verbatim: addMemberError)
                            .font(.caption)
                            .foregroundStyle(.red)
                    }
                }

                Text(L10n.string(.listsDetailMembersHeading) + " (\(list.memberCount))")
                    .font(.subheadline.weight(.bold))
                    .foregroundStyle(ZrpColor.onSurface)

                if list.members.isEmpty {
                    Text(.listsDetailEmptyMembers)
                        .font(.caption)
                        .foregroundStyle(ZrpColor.onSurfaceMuted)
                } else {
                    ForEach(list.members) { entry in
                        HStack(spacing: ZrpSpacing.sm) {
                            AvatarView(
                                url: entry.user.avatarUrl,
                                displayName: entry.user.name ?? entry.user.username,
                                size: ZrpMetrics.avatarSmall
                            )
                            Text(verbatim: entry.user.name ?? entry.user.username)
                                .font(.subheadline.weight(.semibold))
                                .foregroundStyle(ZrpColor.onSurface)
                                .lineLimit(1)
                            Spacer()
                            if viewModel.isOwner {
                                Button(action: { viewModel.removeMember(userId: entry.user.id) }) {
                                    Image(systemName: "person.badge.minus")
                                        .foregroundStyle(ZrpColor.onSurfaceMuted)
                                        .frame(minWidth: ZrpMetrics.minTouchTarget, minHeight: ZrpMetrics.minTouchTarget)
                                }
                                .accessibilityLabel(
                                    Text(.listsDetailRemoveMemberAria, ["name": entry.user.name ?? entry.user.username])
                                )
                            }
                        }
                    }
                }

                if viewModel.posts.isEmpty {
                    VStack(spacing: ZrpSpacing.md) {
                        Image(systemName: "text.bubble")
                            .font(.largeTitle)
                            .foregroundStyle(ZrpColor.onSurfaceMuted)
                        Text(.listsDetailFeedEmptyTitle)
                            .font(.headline)
                            .foregroundStyle(ZrpColor.onSurface)
                        Text(.listsDetailFeedEmptyBody)
                            .font(.subheadline)
                            .foregroundStyle(ZrpColor.onSurfaceMuted)
                            .multilineTextAlignment(.center)
                    }
                    .frame(maxWidth: .infinity)
                    .padding(.top, ZrpSpacing.xl)
                }
            }
            .padding(ZrpSpacing.lg)

            Rectangle().fill(ZrpColor.outlineFaint).frame(height: 0.5)
        }
    }
}
