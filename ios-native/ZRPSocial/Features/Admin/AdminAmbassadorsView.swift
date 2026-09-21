import SwiftUI

@MainActor
final class AdminAmbassadorsViewModel: ObservableObject {

    enum Phase: Equatable {
        case loading
        case loaded
        case failed(ApiError)
    }

    @Published private(set) var profiles: [AdminAmbassadorProfile] = []
    @Published private(set) var counts: [String: Int] = [:]
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
    @Published var statusFilter: AdminAmbassadorStatusFilter = .pending {
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
        if profiles.isEmpty { phase = .loading }
        await load(page: 1, replacing: true)
    }

    func loadMoreIfNeeded(currentProfile: AdminAmbassadorProfile) async {
        guard
            phase == .loaded,
            hasMore,
            !isLoadingMore,
            let index = profiles.firstIndex(where: { $0.id == currentProfile.id }),
            index >= profiles.count - 5
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
            let result = try await repository.ambassadors(
                status: statusFilter,
                search: searchText.trimmingCharacters(in: .whitespacesAndNewlines),
                page: requestedPage
            )
            if replacing {
                profiles = result.profiles
            } else {
                let existing = Set(profiles.map(\.id))
                profiles.append(contentsOf: result.profiles.filter { !existing.contains($0.id) })
            }
            page = result.pagination.page
            totalPages = result.pagination.totalPages
            counts = result.counts
            phase = .loaded
        } catch ApiError.cancelled {
            return
        } catch {
            if profiles.isEmpty {
                phase = .failed(error as? ApiError ?? .transport(underlying: "\(error)"))
            } else {
                phase = .loaded
            }
        }
    }

    @discardableResult
    func perform(_ profile: AdminAmbassadorProfile, action: AdminAmbassadorAction, reason: String?) async -> Bool {
        guard !isWorking else { return false }
        isWorking = true
        defer { isWorking = false }
        do {
            try await repository.reviewAmbassador(userId: profile.userId, action: action, reason: reason)
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
}

/// Ambassador application review - the native answer to `/admin/ambassadors`.
struct AdminAmbassadorsView: View {

    @StateObject private var viewModel = AdminAmbassadorsViewModel()
    @State private var selectedProfile: AdminAmbassadorProfile?

    var body: some View {
        content
            .background(ZrpColor.background.ignoresSafeArea())
            .navigationTitle(Text(verbatim: "Ambassadors"))
            .navigationBarTitleDisplayMode(.inline)
            .searchable(text: $viewModel.searchText, prompt: Text(verbatim: "Search username, name, email"))
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Picker(selection: $viewModel.statusFilter) {
                        ForEach(AdminAmbassadorStatusFilter.allCases) { status in
                            Text(verbatim: status.displayName).tag(status)
                        }
                    } label: {
                        Text(verbatim: viewModel.statusFilter.displayName)
                    }
                    .pickerStyle(.menu)
                }
            }
            .task { await viewModel.loadIfNeeded() }
            .sheet(item: $selectedProfile) { profile in
                AdminAmbassadorActionSheet(profile: profile, viewModel: viewModel) { selectedProfile = nil }
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
            if viewModel.profiles.isEmpty {
                AdminEmptyState(systemImage: "globe", title: "No applications", subtitle: "Nothing matches this search or filter.")
            } else {
                list
            }
        }
    }

    private var list: some View {
        ScrollView {
            LazyVStack(spacing: 0) {
                ForEach(viewModel.profiles) { profile in
                    row(profile)
                        .task { await viewModel.loadMoreIfNeeded(currentProfile: profile) }
                }
                if viewModel.isLoadingMore {
                    ProgressView().tint(ZrpColor.onSurfaceMuted).padding(ZrpSpacing.lg)
                }
            }
        }
        .refreshable { await viewModel.reload() }
    }

    private func row(_ profile: AdminAmbassadorProfile) -> some View {
        Button {
            selectedProfile = profile
        } label: {
            VStack(alignment: .leading, spacing: ZrpSpacing.xs) {
                HStack(spacing: ZrpSpacing.sm) {
                    Text(verbatim: profile.user.displayName)
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(ZrpColor.onSurface)
                    Spacer(minLength: 0)
                    AdminStatusChip(status: profile.status)
                }
                Text(verbatim: "@\(profile.user.username)")
                    .font(.footnote)
                    .foregroundStyle(ZrpColor.onSurfaceMuted)
                Text(verbatim: "\(profile.countryName)\(profile.cityRegion.map { ", \($0)" } ?? "")")
                    .font(.caption)
                    .foregroundStyle(ZrpColor.onSurfaceMuted)
                Text(verbatim: RelativeTime.compact(from: profile.appliedAt))
                    .font(.caption2)
                    .foregroundStyle(ZrpColor.onSurfaceMuted)
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

struct AdminAmbassadorActionSheet: View {

    let profile: AdminAmbassadorProfile
    @ObservedObject var viewModel: AdminAmbassadorsViewModel
    let onDismiss: () -> Void

    @State private var reason = ""
    @State private var pendingAction: AdminAmbassadorAction?

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    LabeledContent { Text(verbatim: profile.user.displayName) } label: { Text(verbatim: "Name") }
                    LabeledContent { Text(verbatim: "@\(profile.user.username)") } label: { Text(verbatim: "Username") }
                    LabeledContent { Text(verbatim: profile.countryName) } label: { Text(verbatim: "Country") }
                    if let city = profile.cityRegion, !city.isEmpty {
                        LabeledContent { Text(verbatim: city) } label: { Text(verbatim: "City / region") }
                    }
                    if !profile.languages.isEmpty {
                        LabeledContent { Text(verbatim: profile.languages.joined(separator: ", ")) } label: { Text(verbatim: "Languages") }
                    }
                    if let audience = profile.audienceSize {
                        LabeledContent { Text(verbatim: CountFormatting.exact(audience)) } label: { Text(verbatim: "Audience size") }
                    }
                    Text(verbatim: profile.motivation)
                        .font(.footnote)
                        .foregroundStyle(ZrpColor.onSurfaceMuted)
                } header: {
                    Text(verbatim: "Application")
                }

                if let reason = profile.rejectionReason ?? profile.suspensionReason, !reason.isEmpty {
                    Section {
                        Text(verbatim: reason)
                    } header: {
                        Text(verbatim: "Reason on file")
                    }
                }

                let actions = profile.availableActions
                if !actions.isEmpty {
                    Section {
                        if actions.contains(.reject) || actions.contains(.suspend) {
                            TextField("Reason (optional)", text: $reason, axis: .vertical)
                                .lineLimit(2...5)
                        }
                        ForEach(actions) { action in
                            Button(role: action == .reject || action == .suspend ? .destructive : nil) {
                                pendingAction = action
                            } label: {
                                Text(verbatim: action.displayName)
                            }
                        }
                    } header: {
                        Text(verbatim: "Actions")
                    }
                } else {
                    Section {
                        Text(verbatim: "No status action is available for this application.")
                            .foregroundStyle(ZrpColor.onSurfaceMuted)
                    }
                }
            }
            .navigationTitle(Text(verbatim: "Ambassador"))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button { onDismiss() } label: { Text(.actionCancel) }
                }
            }
            .confirmationDialog(
                Text(verbatim: "\(pendingAction?.displayName ?? "") this application?"),
                isPresented: Binding(get: { pendingAction != nil }, set: { if !$0 { pendingAction = nil } }),
                titleVisibility: .visible
            ) {
                Button(role: .destructive) {
                    if let action = pendingAction {
                        pendingAction = nil
                        Task {
                            if await viewModel.perform(profile, action: action, reason: reason) { onDismiss() }
                        }
                    }
                } label: {
                    Text(verbatim: pendingAction?.displayName ?? "Confirm")
                }
                Button(role: .cancel) { pendingAction = nil } label: { Text(.actionCancel) }
            } message: {
                Text(verbatim: "This changes the ambassador's status immediately.")
            }
        }
    }
}
