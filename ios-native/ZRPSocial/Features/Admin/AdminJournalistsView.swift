import SwiftUI

@MainActor
final class AdminJournalistsViewModel: ObservableObject {

    enum Phase: Equatable {
        case loading
        case loaded
        case failed(ApiError)
    }

    @Published private(set) var profiles: [AdminJournalistProfile] = []
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
    @Published var statusFilter: AdminJournalistStatusFilter = .pending {
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

    func loadMoreIfNeeded(currentProfile: AdminJournalistProfile) async {
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
            let result = try await repository.journalists(
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
    func grant(username: String) async -> Bool {
        guard !isWorking else { return false }
        isWorking = true
        defer { isWorking = false }
        do {
            try await repository.grantJournalist(username: username)
            await load(page: 1, replacing: true)
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
    func perform(_ profile: AdminJournalistProfile, action: AdminJournalistAction, reason: String?) async -> Bool {
        guard !isWorking else { return false }
        isWorking = true
        defer { isWorking = false }
        do {
            try await repository.reviewJournalist(userId: profile.userId, action: action, reason: reason)
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

/// Journalist application review - the native answer to `/admin/journalists`.
struct AdminJournalistsView: View {

    @StateObject private var viewModel = AdminJournalistsViewModel()
    @State private var selectedProfile: AdminJournalistProfile?
    @State private var isGranting = false

    var body: some View {
        content
            .background(ZrpColor.background.ignoresSafeArea())
            .navigationTitle(Text(verbatim: "Journalists"))
            .navigationBarTitleDisplayMode(.inline)
            .searchable(text: $viewModel.searchText, prompt: Text(verbatim: "Search username, name, email"))
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button { isGranting = true } label: { Image(systemName: "person.badge.plus") }
                        .accessibilityLabel(Text(verbatim: "Grant journalist status"))
                }
                ToolbarItem(placement: .topBarTrailing) {
                    Picker(selection: $viewModel.statusFilter) {
                        ForEach(AdminJournalistStatusFilter.allCases) { status in
                            Text(verbatim: status.displayName).tag(status)
                        }
                    } label: {
                        Text(verbatim: viewModel.statusFilter.displayName)
                    }
                    .pickerStyle(.menu)
                }
            }
            .task { await viewModel.loadIfNeeded() }
            .sheet(isPresented: $isGranting) {
                AdminGrantJournalistSheet { username in await viewModel.grant(username: username) }
            }
            .sheet(item: $selectedProfile) { profile in
                AdminJournalistActionSheet(profile: profile, viewModel: viewModel) { selectedProfile = nil }
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
                AdminEmptyState(systemImage: "newspaper", title: "No applications", subtitle: "Nothing matches this search or filter.")
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

    private func row(_ profile: AdminJournalistProfile) -> some View {
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
                if let outlet = profile.outlet, !outlet.isEmpty {
                    Text(verbatim: outlet)
                        .font(.caption)
                        .foregroundStyle(ZrpColor.onSurfaceMuted)
                }
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

struct AdminJournalistActionSheet: View {

    let profile: AdminJournalistProfile
    @ObservedObject var viewModel: AdminJournalistsViewModel
    let onDismiss: () -> Void

    @State private var reason = ""
    @State private var pendingAction: AdminJournalistAction?

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    LabeledContent { Text(verbatim: profile.user.displayName) } label: { Text(verbatim: "Name") }
                    LabeledContent { Text(verbatim: "@\(profile.user.username)") } label: { Text(verbatim: "Username") }
                    if let outlet = profile.outlet, !outlet.isEmpty {
                        LabeledContent { Text(verbatim: outlet) } label: { Text(verbatim: "Outlet") }
                    }
                    if let url = profile.portfolioUrl, !url.isEmpty {
                        LabeledContent { Text(verbatim: url).lineLimit(1) } label: { Text(verbatim: "Portfolio") }
                    }
                    if let pitch = profile.pitch, !pitch.isEmpty {
                        Text(verbatim: pitch)
                            .font(.footnote)
                            .foregroundStyle(ZrpColor.onSurfaceMuted)
                    }
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
                        if actions.contains(.reject) || actions.contains(.suspend) || actions.contains(.remove) {
                            TextField("Reason (optional)", text: $reason, axis: .vertical)
                                .lineLimit(2...5)
                        }
                        ForEach(actions) { action in
                            Button(role: action == .reject || action == .remove ? .destructive : nil) {
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
            .navigationTitle(Text(verbatim: "Journalist"))
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
                Text(verbatim: "This changes the journalist's status and role immediately.")
            }
        }
    }
}

struct AdminGrantJournalistSheet: View {

    let onGrant: (String) async -> Bool

    @Environment(\.dismiss) private var dismiss
    @State private var username = ""
    @State private var isGranting = false

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextField(
                        text: $username,
                        prompt: Text(verbatim: "username"),
                        label: { Text(verbatim: "Username") }
                    )
                    .keyboardType(.asciiCapable)
                    .autocorrectionDisabled()
                    .textInputAutocapitalization(.never)
                } footer: {
                    Text(verbatim: "Grants VERIFIED journalist status directly, without an application. The account must already exist on ZRP.")
                }
            }
            .navigationTitle(Text(verbatim: "Grant journalist status"))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button { dismiss() } label: { Text(.actionCancel) }
                }
                ToolbarItem(placement: .topBarTrailing) {
                    Button {
                        commit()
                    } label: {
                        Text(verbatim: isGranting ? "Granting..." : "Grant")
                    }
                    .disabled(username.trimmingCharacters(in: .whitespaces).isEmpty || isGranting)
                }
            }
        }
    }

    private func commit() {
        guard !isGranting else { return }
        isGranting = true
        Task {
            defer { isGranting = false }
            if await onGrant(username) { dismiss() }
        }
    }
}
