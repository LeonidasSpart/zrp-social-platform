import SwiftUI

@MainActor
final class AdminMusicArtistsViewModel: ObservableObject {

    enum Phase: Equatable {
        case loading
        case loaded
        case failed(ApiError)
    }

    @Published private(set) var artists: [AdminMusicArtist] = []
    @Published private(set) var phase: Phase = .loading
    @Published private(set) var isLoadingMore = false
    @Published private(set) var isWorking = false
    @Published var errorMessage: String?

    @Published var searchText = "" {
        didSet {
            guard searchText != oldValue else { return }
            scheduleSearch()
        }
    }
    @Published var statusFilter: AdminMusicArtistStatusFilter = .all {
        didSet {
            guard statusFilter != oldValue else { return }
            Task { await reload() }
        }
    }

    private let repository: AdminRepositoryProtocol
    private var page = 1
    private var totalPages = 1
    private var searchTask: Task<Void, Never>?
    private var hasLoadedOnce = false

    init(repository: AdminRepositoryProtocol = AdminRepository()) {
        self.repository = repository
    }

    var hasMore: Bool { page < totalPages }

    func loadIfNeeded() async {
        guard !hasLoadedOnce else { return }
        hasLoadedOnce = true
        await reload()
    }

    func reload() async {
        if artists.isEmpty { phase = .loading }
        await load(page: 1, replacing: true)
    }

    func loadMoreIfNeeded(currentArtist: AdminMusicArtist) async {
        guard
            phase == .loaded,
            hasMore,
            !isLoadingMore,
            let index = artists.firstIndex(where: { $0.id == currentArtist.id }),
            index >= artists.count - 5
        else { return }
        isLoadingMore = true
        await load(page: page + 1, replacing: false)
        isLoadingMore = false
    }

    private func scheduleSearch() {
        searchTask?.cancel()
        searchTask = Task { [weak self] in
            try? await Task.sleep(nanoseconds: 350_000_000)
            guard !Task.isCancelled, let self else { return }
            await self.reload()
        }
    }

    private func load(page requestedPage: Int, replacing: Bool) async {
        do {
            let result = try await repository.musicArtists(
                status: statusFilter,
                search: searchText.trimmingCharacters(in: .whitespacesAndNewlines),
                page: requestedPage
            )
            if replacing {
                artists = result.artists
            } else {
                let existing = Set(artists.map(\.id))
                artists.append(contentsOf: result.artists.filter { !existing.contains($0.id) })
            }
            page = result.page
            totalPages = result.totalPages
            phase = .loaded
        } catch ApiError.cancelled {
            return
        } catch {
            if artists.isEmpty {
                phase = .failed(error as? ApiError ?? .transport(underlying: "\(error)"))
            } else {
                phase = .loaded
            }
        }
    }

    @discardableResult
    func setVerified(_ artist: AdminMusicArtist, verified: Bool) async -> Bool {
        guard !isWorking else { return false }
        isWorking = true
        defer { isWorking = false }
        do {
            try await repository.setMusicArtistVerified(id: artist.id, verified: verified)
            await load(page: page, replacing: true)
            return true
        } catch let error as ApiError {
            errorMessage = error.userFacingMessage
            return false
        } catch {
            errorMessage = "Something went wrong. Please try again."
            return false
        }
    }

    @discardableResult
    func delete(_ artist: AdminMusicArtist) async -> Bool {
        guard !isWorking else { return false }
        isWorking = true
        defer { isWorking = false }
        do {
            try await repository.deleteMusicArtist(id: artist.id)
            artists.removeAll { $0.id == artist.id }
            return true
        } catch let error as ApiError {
            errorMessage = error.userFacingMessage
            return false
        } catch {
            errorMessage = "Something went wrong. Please try again."
            return false
        }
    }
}

/// Music artist verification - the native answer to `/admin/music`.
struct AdminMusicArtistsView: View {

    @StateObject private var viewModel = AdminMusicArtistsViewModel()
    @State private var selectedArtist: AdminMusicArtist?

    var body: some View {
        content
            .background(ZrpColor.background.ignoresSafeArea())
            .navigationTitle(Text(verbatim: "Music artists"))
            .navigationBarTitleDisplayMode(.inline)
            .searchable(text: $viewModel.searchText, prompt: Text(verbatim: "Search artist name"))
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Picker(selection: $viewModel.statusFilter) {
                        ForEach(AdminMusicArtistStatusFilter.allCases) { status in
                            Text(verbatim: status.displayName).tag(status)
                        }
                    } label: {
                        Text(verbatim: viewModel.statusFilter.displayName)
                    }
                    .pickerStyle(.menu)
                }
            }
            .task { await viewModel.loadIfNeeded() }
            .sheet(item: $selectedArtist) { artist in
                AdminMusicArtistActionSheet(artist: artist, viewModel: viewModel) { selectedArtist = nil }
            }
            .alert(
                Text(.iosErrorGenericTitle),
                isPresented: Binding(
                    get: { viewModel.errorMessage != nil },
                    set: { if !$0 { viewModel.errorMessage = nil } }
                )
            ) {
                Button { viewModel.errorMessage = nil } label: { Text(.actionCancel) }
            } message: {
                Text(verbatim: viewModel.errorMessage ?? "")
            }
    }

    @ViewBuilder
    private var content: some View {
        switch viewModel.phase {
        case .loading:
            TimelineStateView.loading()
        case .failed(let error):
            TimelineStateView.error(error) { Task { await viewModel.reload() } }
        case .loaded:
            if viewModel.artists.isEmpty {
                AdminEmptyState(systemImage: "music.mic", title: "No artists", subtitle: "Nothing matches this search or filter.")
            } else {
                list
            }
        }
    }

    private var list: some View {
        ScrollView {
            LazyVStack(spacing: 0) {
                ForEach(viewModel.artists) { artist in
                    row(artist)
                        .task { await viewModel.loadMoreIfNeeded(currentArtist: artist) }
                }
                if viewModel.isLoadingMore {
                    ProgressView().tint(ZrpColor.onSurfaceMuted).padding(ZrpSpacing.lg)
                }
            }
        }
        .refreshable { await viewModel.reload() }
    }

    private func row(_ artist: AdminMusicArtist) -> some View {
        Button {
            selectedArtist = artist
        } label: {
            HStack(alignment: .top, spacing: ZrpSpacing.md) {
                AvatarView(url: artist.avatarUrl, displayName: artist.displayName, size: ZrpMetrics.avatarMedium)
                VStack(alignment: .leading, spacing: 2) {
                    HStack(spacing: ZrpSpacing.xs) {
                        Text(verbatim: artist.displayName)
                            .font(.subheadline.weight(.semibold))
                            .foregroundStyle(ZrpColor.onSurface)
                        if artist.verified {
                            Image(systemName: "checkmark.seal.fill")
                                .font(.caption)
                                .foregroundStyle(ZrpColor.blue)
                        }
                    }
                    Text(verbatim: "@\(artist.user.username)")
                        .font(.footnote)
                        .foregroundStyle(ZrpColor.onSurfaceMuted)
                    Text(verbatim: "\(CountFormatting.exact(artist.counts.tracks)) tracks \u{00B7} \(CountFormatting.exact(artist.counts.followers)) followers")
                        .font(.caption)
                        .foregroundStyle(ZrpColor.onSurfaceMuted)
                }
                Spacer(minLength: 0)
            }
            .padding(ZrpSpacing.lg)
            .frame(maxWidth: .infinity, alignment: .leading)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .overlay(alignment: .bottom) {
            Rectangle().fill(ZrpColor.outlineFaint).frame(height: 0.5)
        }
    }
}

struct AdminMusicArtistActionSheet: View {

    let artist: AdminMusicArtist
    @ObservedObject var viewModel: AdminMusicArtistsViewModel
    let onDismiss: () -> Void

    @State private var confirmingDelete = false

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    LabeledContent { Text(verbatim: artist.displayName) } label: { Text(verbatim: "Artist") }
                    LabeledContent { Text(verbatim: "@\(artist.user.username)") } label: { Text(verbatim: "Account") }
                    LabeledContent { Text(verbatim: "\(CountFormatting.exact(artist.counts.tracks)) tracks, \(CountFormatting.exact(artist.counts.followers)) followers") } label: { Text(verbatim: "Catalogue") }
                    if let bio = artist.bio, !bio.isEmpty {
                        Text(verbatim: bio)
                            .font(.footnote)
                            .foregroundStyle(ZrpColor.onSurfaceMuted)
                    }
                }

                Section {
                    Button {
                        Task { await viewModel.setVerified(artist, verified: !artist.verified) }
                    } label: {
                        Text(verbatim: artist.verified ? "Remove verification" : "Verify this artist")
                    }
                    .disabled(viewModel.isWorking)
                }

                Section {
                    Button(role: .destructive) {
                        confirmingDelete = true
                    } label: {
                        Text(verbatim: "Delete artist profile")
                    }
                    .disabled(viewModel.isWorking)
                } footer: {
                    Text(verbatim: "Permanently deletes this artist profile and their entire catalogue - every track, album and follow. This cannot be undone.")
                }
            }
            .navigationTitle(Text(verbatim: "Artist"))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button { onDismiss() } label: { Text(.actionCancel) }
                }
            }
            .confirmationDialog(
                Text(verbatim: "Delete \(artist.displayName)?"),
                isPresented: $confirmingDelete,
                titleVisibility: .visible
            ) {
                Button(role: .destructive) {
                    Task {
                        if await viewModel.delete(artist) { onDismiss() }
                    }
                } label: {
                    Text(verbatim: "Delete permanently")
                }
                Button(role: .cancel) {} label: { Text(.actionCancel) }
            } message: {
                Text(verbatim: "This deletes \(artist.displayName)'s entire catalogue - \(CountFormatting.exact(artist.counts.tracks)) tracks and every album. This cannot be undone.")
            }
        }
    }
}
