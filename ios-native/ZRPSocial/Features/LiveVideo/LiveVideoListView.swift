import SwiftUI

@MainActor
final class LiveVideoListViewModel: ObservableObject {

    enum Phase: Equatable {
        case idle
        case loading
        case loaded
        case failed(ApiError)
    }

    @Published private(set) var rooms: [LiveVideoRoomSummary] = []
    @Published private(set) var phase: Phase = .idle
    @Published private(set) var isLoadingMore = false

    @Published private(set) var myCommunities: [Community] = []
    @Published private(set) var isCreating = false
    @Published var createError: String?

    private var cursor: String?
    private let repository: LiveVideoRepositoryProtocol
    private let communitiesRepository: CommunitiesRepositoryProtocol

    init(
        repository: LiveVideoRepositoryProtocol = LiveVideoRepository(),
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

    func loadMoreIfNeeded(current: LiveVideoRoomSummary) async {
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

    /// Same real `GET /communities` filtered to membership that Live
    /// Audio's create sheet uses - there is no "my communities" route.
    func loadMyCommunitiesIfNeeded() {
        guard myCommunities.isEmpty else { return }
        Task {
            if let all = try? await communitiesRepository.communities(category: nil, search: nil) {
                myCommunities = all.filter(\.isMember)
            }
        }
    }

    /// Paid-gated server-side (`requireLiveVideoAccess`); a free account
    /// sees the server's own refusal, translated where it is a known code.
    func createRoom(_ draft: LiveRoomDraft) async -> LiveAudioRoom? {
        guard !draft.title.isEmpty else {
            createError = L10n.string(.liveAudioTitleRequired)
            return nil
        }
        isCreating = true
        defer { isCreating = false }
        do {
            return try await repository.createRoom(draft.request)
        } catch let error as ApiError {
            createError = error.serverCode == "not_configured"
                ? L10n.string(.liveVideoNotConfigured)
                : error.userFacingMessage
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

/// ZRP Live Video's discovery / "Go live" screen - ported from
/// `src/app/live-video/page.tsx`. The list is server-ranked
/// (`rankAndPaginate`) and works signed-out for PUBLIC rooms; creating a
/// room is paid-gated server-side and never re-implemented here.
struct LiveVideoListView: View {

    @EnvironmentObject private var navigator: Navigator
    @EnvironmentObject private var session: SessionController
    @StateObject private var viewModel = LiveVideoListViewModel()
    @State private var showCreate = false

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            Text(.liveVideoSubtitle)
                .font(.subheadline)
                .foregroundStyle(ZrpColor.onSurfaceMuted)
                .padding(.horizontal, ZrpSpacing.lg)
                .padding(.vertical, ZrpSpacing.sm)

            content
        }
        .background(ZrpColor.background.ignoresSafeArea())
        .navigationTitle(Text(.liveVideoPageTitle))
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItemGroup(placement: .topBarTrailing) {
                if session.currentUser != nil {
                    Button {
                        navigator.push(.liveGiftsReceived)
                    } label: {
                        Label { Text(.iosLiveGiftReceivedTitle) } icon: { Image(systemName: "gift") }
                    }
                }
                Button {
                    viewModel.loadMyCommunitiesIfNeeded()
                    showCreate = true
                } label: {
                    Label { Text(.liveAudioGoLive) } icon: { Image(systemName: "plus") }
                }
            }
        }
        .sheet(isPresented: $showCreate) {
            LiveCreateRoomSheet(
                myCommunities: viewModel.myCommunities,
                isCreating: viewModel.isCreating,
                createError: viewModel.createError,
                onCancel: {
                    viewModel.dismissCreateError()
                    showCreate = false
                },
                onSubmit: { draft in
                    Task {
                        if let room = await viewModel.createRoom(draft) {
                            showCreate = false
                            navigator.push(.liveVideoRoom(id: room.id))
                        }
                    }
                }
            )
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
                    systemImage: "video",
                    title: .liveAudioNoRoomsTitle,
                    subtitle: .liveVideoNoRoomsDesc
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
                        navigator.push(.liveVideoRoom(id: room.id))
                    } label: {
                        LiveVideoRoomRow(room: room)
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

private struct LiveVideoRoomRow: View {

    let room: LiveVideoRoomSummary

    var body: some View {
        HStack(spacing: ZrpSpacing.md) {
            ZStack(alignment: .bottomTrailing) {
                AvatarView(url: room.host.avatarUrl, displayName: room.host.displayName, size: ZrpMetrics.avatarMedium)
                Image(systemName: "video.fill")
                    .font(.system(size: 9, weight: .bold))
                    .foregroundStyle(.white)
                    .padding(4)
                    .background(ZrpColor.red, in: Circle())
                    .accessibilityHidden(true)
            }

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
                Image(systemName: "eye")
                    .font(.caption)
                Text(.liveVideoViewerCount, ["n": "\(room.viewerCount)"])
                    .font(.caption)
                    .lineLimit(1)
            }
            .foregroundStyle(ZrpColor.onSurfaceMuted)
            .layoutPriority(1)
        }
        .padding(ZrpSpacing.md)
        .background(ZrpColor.surfaceElevated)
        .clipShape(RoundedRectangle(cornerRadius: ZrpRadius.md, style: .continuous))
        .accessibilityElement(children: .combine)
    }
}
