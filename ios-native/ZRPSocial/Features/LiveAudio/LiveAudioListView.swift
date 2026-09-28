import SwiftUI

@MainActor
final class LiveAudioListViewModel: ObservableObject {

    enum Phase: Equatable {
        case idle
        case loading
        case loaded
        case failed(ApiError)
    }

    @Published private(set) var rooms: [LiveAudioRoomSummary] = []
    @Published private(set) var phase: Phase = .idle
    @Published private(set) var isLoadingMore = false

    @Published private(set) var myCommunities: [Community] = []
    @Published private(set) var isCreating = false
    @Published var createError: String?

    private var cursor: String?
    private let repository: LiveAudioRepositoryProtocol
    private let communitiesRepository: CommunitiesRepositoryProtocol

    init(
        repository: LiveAudioRepositoryProtocol = LiveAudioRepository(),
        communitiesRepository: CommunitiesRepositoryProtocol = CommunitiesRepository()
    ) {
        self.repository = repository
        self.communitiesRepository = communitiesRepository
    }

    var hasMore: Bool { cursor != nil }

    func loadIfNeeded() async {
        guard phase == .idle else { return }
        await load(replacingExisting: true)
    }

    func reload() async {
        await load(replacingExisting: true)
    }

    func loadMoreIfNeeded(current: LiveAudioRoomSummary) async {
        guard
            phase == .loaded,
            hasMore,
            !isLoadingMore,
            let index = rooms.firstIndex(of: current),
            index >= rooms.count - 3
        else { return }
        await load(replacingExisting: false)
    }

    private func load(replacingExisting: Bool) async {
        if replacingExisting {
            if rooms.isEmpty { phase = .loading }
            cursor = nil
        } else {
            isLoadingMore = true
        }

        do {
            let page = try await repository.rooms(cursor: replacingExisting ? nil : cursor)
            if replacingExisting {
                rooms = page.rooms
            } else {
                let existing = Set(rooms.map(\.id))
                rooms.append(contentsOf: page.rooms.filter { !existing.contains($0.id) })
            }
            cursor = page.nextCursor
            phase = .loaded
            isLoadingMore = false
        } catch {
            isLoadingMore = false
            if rooms.isEmpty {
                phase = .failed(error as? ApiError ?? .transport(underlying: "\(error)"))
            } else {
                phase = .loaded
            }
        }
    }

    /// Loaded lazily, the first time the create-room sheet opens - reuses
    /// the same real `GET /communities` the Communities tab uses, filtered
    /// to membership client-side (there is no dedicated "my communities"
    /// route), matching the Android sibling's own `loadMyCommunities`.
    func loadMyCommunitiesIfNeeded() {
        guard myCommunities.isEmpty else { return }
        Task {
            if let all = try? await communitiesRepository.communities(category: nil, search: nil) {
                myCommunities = all.filter(\.isMember)
            }
        }
    }

    /// Creating a room is always paid-gated server-side
    /// (`requireLiveAudioAccess`) - never re-implemented client-side, so a
    /// free account simply sees the server's own rejection surface as
    /// `createError`, the same way every other plan-gated action in this
    /// app degrades.
    func createRoom(
        title: String,
        description: String?,
        category: String?,
        visibility: String,
        communityId: String?
    ) async -> LiveAudioRoom? {
        let trimmedTitle = title.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmedTitle.isEmpty else {
            createError = L10n.string(.liveAudioTitleRequired)
            return nil
        }
        isCreating = true
        defer { isCreating = false }

        do {
            return try await repository.createRoom(CreateLiveAudioRoomRequest(
                title: trimmedTitle,
                description: description?.trimmingCharacters(in: .whitespacesAndNewlines).nilIfEmpty,
                category: category?.trimmingCharacters(in: .whitespacesAndNewlines).nilIfEmpty,
                visibility: visibility,
                communityId: visibility == "COMMUNITY" ? communityId : nil,
                scheduledAt: nil
            ))
        } catch let error as ApiError {
            createError = error.userFacingMessage
            return nil
        } catch {
            createError = L10n.string(.liveAudioCreateError)
            return nil
        }
    }

    func dismissCreateError() {
        createError = nil
    }
}

/// ZRP Live Audio's discovery/"Go Live" screen - ported from
/// `src/app/live-audio/page.tsx`. The list works signed-out for PUBLIC
/// rooms; creating a room is paid-gated server-side, never re-implemented
/// here.
struct LiveAudioListView: View {

    @EnvironmentObject private var navigator: Navigator
    @StateObject private var viewModel = LiveAudioListViewModel()
    @State private var showCreate = false

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            Text(.liveAudioSubtitle)
                .font(.subheadline)
                .foregroundStyle(ZrpColor.onSurfaceMuted)
                .padding(.horizontal, ZrpSpacing.lg)
                .padding(.vertical, ZrpSpacing.sm)

            content
        }
        .background(ZrpColor.background.ignoresSafeArea())
        .navigationTitle(Text(.liveAudioPageTitle))
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button {
                    viewModel.loadMyCommunitiesIfNeeded()
                    showCreate = true
                } label: {
                    Label { Text(.liveAudioGoLive) } icon: { Image(systemName: "plus") }
                }
            }
        }
        .sheet(isPresented: $showCreate) {
            CreateLiveAudioRoomView(viewModel: viewModel) { room in
                showCreate = false
                navigator.push(.liveAudioRoom(id: room.id))
            }
        }
        .task { await viewModel.loadIfNeeded() }
    }

    @ViewBuilder
    private var content: some View {
        switch viewModel.phase {
        case .idle, .loading:
            TimelineStateView.loading()
        case .failed(let error):
            TimelineStateView.error(error) {
                Task { await viewModel.reload() }
            }
        case .loaded:
            if viewModel.rooms.isEmpty {
                TimelineStateView.empty(
                    systemImage: "dot.radiowaves.left.and.right",
                    title: .liveAudioNoRoomsTitle,
                    subtitle: .liveAudioNoRoomsDesc
                )
            } else {
                list
            }
        }
    }

    private var list: some View {
        ScrollView {
            LazyVStack(spacing: ZrpSpacing.sm) {
                ForEach(viewModel.rooms) { room in
                    Button {
                        navigator.push(.liveAudioRoom(id: room.id))
                    } label: {
                        LiveAudioRoomRow(room: room)
                    }
                    .buttonStyle(.plain)
                    .onAppear {
                        Task { await viewModel.loadMoreIfNeeded(current: room) }
                    }
                }

                if viewModel.isLoadingMore {
                    ProgressView()
                        .tint(ZrpColor.onSurfaceMuted)
                        .padding(ZrpSpacing.lg)
                }
            }
            .padding(ZrpSpacing.lg)
        }
        .refreshable { await viewModel.reload() }
    }
}

private struct LiveAudioRoomRow: View {

    let room: LiveAudioRoomSummary

    var body: some View {
        HStack(spacing: ZrpSpacing.md) {
            AvatarView(url: room.host.avatarUrl, displayName: room.host.displayName, size: ZrpMetrics.avatarMedium)

            VStack(alignment: .leading, spacing: 2) {
                HStack(spacing: ZrpSpacing.xs) {
                    Circle().fill(ZrpColor.red).frame(width: 6, height: 6)
                    Text(.liveAudioLiveNow)
                        .font(.caption2.weight(.bold))
                        .foregroundStyle(ZrpColor.red)
                    if let community = room.community {
                        Text(verbatim: community.name)
                            .font(.caption2)
                            .foregroundStyle(ZrpColor.onSurfaceMuted)
                            .lineLimit(1)
                    }
                }
                Text(verbatim: room.title)
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(ZrpColor.onSurface)
                    .lineLimit(1)
                Text(.liveAudioHostedBy, ["name": room.host.displayName])
                    .font(.caption)
                    .foregroundStyle(ZrpColor.onSurfaceMuted)
                    .lineLimit(1)
            }

            Spacer(minLength: ZrpSpacing.sm)

            HStack(spacing: 4) {
                Image(systemName: "person.2")
                    .font(.caption)
                Text(.liveAudioListenerCount, ["n": "\(room.listenerCount)"])
                    .font(.caption)
            }
            .foregroundStyle(ZrpColor.onSurfaceMuted)
        }
        .padding(ZrpSpacing.md)
        .background(ZrpColor.surfaceElevated)
        .clipShape(RoundedRectangle(cornerRadius: ZrpRadius.md, style: .continuous))
    }
}

/// The "Go Live" sheet - ported from `CreateLiveAudioModal.tsx`. Visibility
/// defaults to PUBLIC; COMMUNITY requires picking one of the caller's own
/// communities (server-enforced membership, not re-checked here).
private struct CreateLiveAudioRoomView: View {

    private enum Visibility: String, CaseIterable {
        case pub = "PUBLIC"
        case community = "COMMUNITY"
        case priv = "PRIVATE"

        var titleKey: L10nKey {
            switch self {
            case .pub: return .liveAudioVisibilityPublic
            case .community: return .liveAudioVisibilityCommunity
            case .priv: return .liveAudioVisibilityPrivate
            }
        }
    }

    @ObservedObject var viewModel: LiveAudioListViewModel
    let onCreated: (LiveAudioRoom) -> Void

    @Environment(\.dismiss) private var dismiss
    @State private var title = ""
    @State private var description = ""
    @State private var category = ""
    @State private var visibility: Visibility = .pub
    @State private var communityId: String?

    private var canSubmit: Bool {
        let trimmed = title.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty, trimmed.count <= 200, !viewModel.isCreating else { return false }
        if visibility == .community, communityId == nil { return false }
        return true
    }

    var body: some View {
        NavigationStack {
            Form {
                if let createError = viewModel.createError {
                    Section {
                        Text(verbatim: createError)
                            .foregroundStyle(.red)
                    }
                }

                Section {
                    TextField(L10n.string(.liveAudioTitlePlaceholder), text: $title)
                } header: {
                    Text(.liveAudioTitleLabel)
                }

                Section {
                    TextField(L10n.string(.liveAudioDescriptionLabel), text: $description, axis: .vertical)
                        .lineLimit(2...5)
                } header: {
                    Text(.liveAudioDescriptionLabel)
                }

                Section {
                    TextField(L10n.string(.liveAudioCategoryLabel), text: $category)
                } header: {
                    Text(.liveAudioCategoryLabel)
                }

                Section {
                    Picker(L10n.string(.liveAudioVisibilityLabel), selection: $visibility) {
                        ForEach(Visibility.allCases, id: \.self) { option in
                            Text(option.titleKey).tag(option)
                        }
                    }
                    .pickerStyle(.segmented)

                    if visibility == .community {
                        if viewModel.myCommunities.isEmpty {
                            Text(.liveAudioNoCommunitiesHint)
                                .font(.footnote)
                                .foregroundStyle(ZrpColor.onSurfaceMuted)
                        } else {
                            Picker(L10n.string(.liveAudioCommunityLabel), selection: $communityId) {
                                Text(.liveAudioSelectCommunityPlaceholder).tag(String?.none)
                                ForEach(viewModel.myCommunities) { community in
                                    Text(verbatim: community.name).tag(String?.some(community.id))
                                }
                            }
                        }
                    }
                } header: {
                    Text(.liveAudioVisibilityLabel)
                }
            }
            .navigationTitle(Text(.liveAudioCreateTitle))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button {
                        viewModel.dismissCreateError()
                        dismiss()
                    } label: {
                        Text(.actionCancel)
                    }
                }
                ToolbarItem(placement: .confirmationAction) {
                    if viewModel.isCreating {
                        ProgressView()
                    } else {
                        Button {
                            Task {
                                if let room = await viewModel.createRoom(
                                    title: title,
                                    description: description,
                                    category: category,
                                    visibility: visibility.rawValue,
                                    communityId: communityId
                                ) {
                                    onCreated(room)
                                }
                            }
                        } label: {
                            Text(.liveAudioCreateSubmit)
                        }
                        .disabled(!canSubmit)
                    }
                }
            }
        }
    }
}
