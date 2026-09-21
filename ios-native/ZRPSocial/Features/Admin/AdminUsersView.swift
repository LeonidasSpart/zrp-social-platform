import SwiftUI

@MainActor
final class AdminUsersViewModel: ObservableObject {

    enum Phase: Equatable {
        case loading
        case loaded
        case failed(ApiError)
    }

    @Published private(set) var users: [AdminUserSummary] = []
    @Published private(set) var stats: AdminUserStats?
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
    @Published var roleFilter: AdminRoleFilter = .all { didSet { Task { await reload() } } }
    @Published var badgeFilter: AdminBadgeFilter = .all { didSet { Task { await reload() } } }
    @Published var statusFilter: AdminStatusFilter = .all { didSet { Task { await reload() } } }

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
        if users.isEmpty { phase = .loading }
        await load(page: 1, replacing: true)
    }

    func loadMoreIfNeeded(currentUser: AdminUserSummary) async {
        guard
            phase == .loaded,
            hasMore,
            !isLoadingMore,
            let index = users.firstIndex(where: { $0.id == currentUser.id }),
            index >= users.count - 5
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
            let result = try await repository.users(
                search: searchText.trimmingCharacters(in: .whitespacesAndNewlines),
                page: requestedPage,
                role: roleFilter,
                badge: badgeFilter,
                status: statusFilter
            )
            if replacing {
                users = result.users
            } else {
                let existing = Set(users.map(\.id))
                users.append(contentsOf: result.users.filter { !existing.contains($0.id) })
            }
            page = result.page
            totalPages = result.totalPages
            stats = result.stats
            phase = .loaded
        } catch ApiError.cancelled {
            return
        } catch {
            if users.isEmpty {
                phase = .failed(error as? ApiError ?? .transport(underlying: "\(error)"))
            } else {
                phase = .loaded
            }
        }
    }

    // MARK: - Mutations

    /// Every mutation reloads the current page from the server rather
    /// than patching the row in place - same reasoning as
    /// `TeamViewModel.perform`: the server is the only thing that knows
    /// what the row now looks like, including a change someone else made.
    private func mutate(_ work: @escaping () async throws -> Void) async -> Bool {
        guard !isWorking else { return false }
        isWorking = true
        defer { isWorking = false }
        do {
            try await work()
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
    func setRole(_ user: AdminUserSummary, to role: AdminAssignableRole) async -> Bool {
        await mutate { [repository] in
            try await repository.setUserRole(id: user.id, role: role)
        }
    }

    @discardableResult
    func setBadge(_ user: AdminUserSummary, to badge: AdminBadgeType?) async -> Bool {
        await mutate { [repository] in
            try await repository.setUserBadge(id: user.id, badge: badge)
        }
    }

    @discardableResult
    func toggleBan(_ user: AdminUserSummary) async -> Bool {
        await mutate { [repository] in
            try await repository.toggleBan(userId: user.id)
        }
    }

    @discardableResult
    func delete(_ user: AdminUserSummary) async -> Bool {
        await mutate { [repository] in
            try await repository.deleteUser(id: user.id)
        }
    }
}

/// Staff user management - the native answer to `/admin/users`
/// (`src/app/api/admin/users/**`).
///
/// Role and badge edits, and the delete button, only ever reach the
/// server as `requireAdmin` calls; the ban toggle is `requireStaff`
/// (ADMIN or MODERATOR). A MODERATOR signed in here will see every
/// control (this screen does not try to predict the 403), and simply get
/// the server's own "Forbidden" message if they tap one that is
/// admin-only - see `AdminUserDetailSheet`.
struct AdminUsersView: View {

    @StateObject private var viewModel = AdminUsersViewModel()
    @State private var editingUserId: String?

    var body: some View {
        content
            .background(ZrpColor.background.ignoresSafeArea())
            .navigationTitle(Text(verbatim: "Users"))
            .navigationBarTitleDisplayMode(.inline)
            .searchable(text: $viewModel.searchText, prompt: Text(verbatim: "Search username, name, email"))
            .task { await viewModel.loadIfNeeded() }
            .sheet(
                isPresented: Binding(
                    get: { editingUserId != nil },
                    set: { if !$0 { editingUserId = nil } }
                )
            ) {
                if let editingUserId, let user = viewModel.users.first(where: { $0.id == editingUserId }) {
                    AdminUserDetailSheet(
                        user: user,
                        viewModel: viewModel,
                        onDismiss: { self.editingUserId = nil }
                    )
                }
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
        VStack(spacing: 0) {
            filterBar
            switch viewModel.phase {
            case .loading:
                TimelineStateView.loading()
            case .failed(let error):
                TimelineStateView.error(error) { Task { await viewModel.reload() } }
            case .loaded:
                if viewModel.users.isEmpty {
                    AdminEmptyState(systemImage: "person.2.slash", title: "No users", subtitle: "Nothing matches this search or filter.")
                } else {
                    list
                }
            }
        }
    }

    private var filterBar: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: ZrpSpacing.sm) {
                Picker(selection: $viewModel.roleFilter) {
                    ForEach(AdminRoleFilter.allCases) { role in
                        Text(verbatim: role.displayName).tag(role)
                    }
                } label: {
                    filterChip(title: "Role: \(viewModel.roleFilter.displayName)")
                }
                .pickerStyle(.menu)

                Picker(selection: $viewModel.badgeFilter) {
                    ForEach(AdminBadgeFilter.allCases) { badge in
                        Text(verbatim: badge.displayName).tag(badge)
                    }
                } label: {
                    filterChip(title: "Badge: \(viewModel.badgeFilter.displayName)")
                }
                .pickerStyle(.menu)

                Picker(selection: $viewModel.statusFilter) {
                    ForEach(AdminStatusFilter.allCases) { status in
                        Text(verbatim: status.displayName).tag(status)
                    }
                } label: {
                    filterChip(title: "Status: \(viewModel.statusFilter.displayName)")
                }
                .pickerStyle(.menu)

                if let stats = viewModel.stats {
                    Text(verbatim: "\(CountFormatting.exact(stats.total)) total \u{00B7} \(CountFormatting.exact(stats.banned)) banned")
                        .font(.caption)
                        .foregroundStyle(ZrpColor.onSurfaceMuted)
                        .padding(.leading, ZrpSpacing.sm)
                }
            }
            .padding(.horizontal, ZrpSpacing.lg)
            .padding(.vertical, ZrpSpacing.sm)
        }
    }

    private func filterChip(title: String) -> some View {
        Text(verbatim: title)
            .font(.caption.weight(.semibold))
            .padding(.horizontal, ZrpSpacing.md)
            .padding(.vertical, ZrpSpacing.sm)
            .background(ZrpColor.surfaceHighest, in: Capsule())
            .foregroundStyle(ZrpColor.onSurface)
    }

    private var list: some View {
        ScrollView {
            LazyVStack(spacing: 0) {
                ForEach(viewModel.users) { user in
                    row(user)
                        .task { await viewModel.loadMoreIfNeeded(currentUser: user) }
                }
                if viewModel.isLoadingMore {
                    ProgressView().tint(ZrpColor.onSurfaceMuted).padding(ZrpSpacing.lg)
                }
            }
        }
        .refreshable { await viewModel.reload() }
    }

    private func row(_ user: AdminUserSummary) -> some View {
        Button {
            editingUserId = user.id
        } label: {
            HStack(alignment: .top, spacing: ZrpSpacing.md) {
                VStack(alignment: .leading, spacing: 2) {
                    HStack(spacing: ZrpSpacing.xs) {
                        Text(verbatim: user.displayName)
                            .font(.subheadline.weight(.semibold))
                            .foregroundStyle(ZrpColor.onSurface)
                        if user.banned {
                            Text(verbatim: "BANNED")
                                .font(.caption2.weight(.bold))
                                .foregroundStyle(.white)
                                .padding(.horizontal, 6)
                                .padding(.vertical, 1)
                                .background(Capsule().fill(ZrpColor.red))
                        }
                    }
                    Text(verbatim: "@\(user.username)")
                        .font(.footnote)
                        .foregroundStyle(ZrpColor.onSurfaceMuted)
                    if let email = user.email {
                        Text(verbatim: email)
                            .font(.caption)
                            .foregroundStyle(ZrpColor.onSurfaceMuted)
                    }
                    HStack(spacing: ZrpSpacing.sm) {
                        roleChip(user.role)
                        if let badgeType = user.badgeType {
                            Text(verbatim: badgeType)
                                .font(.caption2.weight(.medium))
                                .foregroundStyle(ZrpColor.onSurfaceMuted)
                        }
                    }
                    .padding(.top, 2)
                }
                Spacer(minLength: 0)
                Image(systemName: "chevron.right")
                    .font(.caption.weight(.semibold))
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

    private func roleChip(_ role: String) -> some View {
        let tint: Color = {
            switch role {
            case "ADMIN": return ZrpColor.red
            case "MODERATOR": return ZrpColor.amber
            case "JOURNALIST": return ZrpColor.blue
            default: return ZrpColor.onSurfaceMuted
            }
        }()
        return Text(verbatim: role)
            .font(.caption2.weight(.semibold))
            .foregroundStyle(tint)
            .padding(.horizontal, ZrpSpacing.sm)
            .padding(.vertical, 2)
            .background(tint.opacity(0.12), in: Capsule())
    }
}

/// Editing one user: role, badge, ban and delete.
///
/// Always shows every control regardless of whether the signed-in staff
/// account is ADMIN or MODERATOR - role/badge/delete are `requireAdmin`
/// server-side, so a MODERATOR tapping one gets the route's own
/// "Forbidden" message via `viewModel.errorMessage` rather than a control
/// this screen tried (and could get wrong) to predict and hide.
struct AdminUserDetailSheet: View {

    let user: AdminUserSummary
    @ObservedObject var viewModel: AdminUsersViewModel
    let onDismiss: () -> Void

    @State private var confirmingBan = false
    @State private var confirmingDelete = false

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    LabeledContent {
                        Text(verbatim: user.displayName)
                    } label: {
                        Text(verbatim: "Name")
                    }
                    LabeledContent {
                        Text(verbatim: "@\(user.username)")
                    } label: {
                        Text(verbatim: "Username")
                    }
                    if let email = user.email {
                        LabeledContent {
                            Text(verbatim: email)
                        } label: {
                            Text(verbatim: "Email")
                        }
                    }
                    LabeledContent {
                        Text(verbatim: RelativeTime.compact(from: user.createdAt))
                    } label: {
                        Text(verbatim: "Joined")
                    }
                    if let plan = user.plan {
                        LabeledContent {
                            Text(verbatim: plan.capitalized)
                        } label: {
                            Text(verbatim: "Plan")
                        }
                    }
                    LabeledContent {
                        Text(verbatim: "\(CountFormatting.exact(user.counts.posts)) posts \u{00B7} \(CountFormatting.exact(user.counts.comments)) comments \u{00B7} \(CountFormatting.exact(user.counts.reports)) reports filed")
                            .font(.caption)
                    } label: {
                        Text(verbatim: "Activity")
                    }
                }

                Section {
                    if user.role == "JOURNALIST" {
                        HStack {
                            Text(verbatim: "Role")
                            Spacer()
                            Text(verbatim: "Journalist")
                                .foregroundStyle(ZrpColor.onSurfaceMuted)
                        }
                        Text(verbatim: "Journalist status is managed from the Journalists admin page (web only), not this role picker.")
                            .font(.caption)
                            .foregroundStyle(ZrpColor.onSurfaceMuted)
                    } else {
                        Picker(
                            selection: Binding(
                                get: { AdminAssignableRole(rawValue: user.role) ?? .user },
                                set: { newRole in Task { await viewModel.setRole(user, to: newRole) } }
                            )
                        ) {
                            ForEach(AdminAssignableRole.allCases) { role in
                                Text(verbatim: role.displayName).tag(role)
                            }
                        } label: {
                            Text(verbatim: "Role")
                        }
                    }

                    Picker(
                        selection: Binding<AdminBadgeType?>(
                            get: { user.badgeType.flatMap(AdminBadgeType.init(rawValue:)) },
                            set: { newBadge in Task { await viewModel.setBadge(user, to: newBadge) } }
                        )
                    ) {
                        Text(verbatim: "No badge").tag(AdminBadgeType?.none)
                        ForEach(AdminBadgeType.allCases) { badge in
                            Text(verbatim: badge.displayName).tag(AdminBadgeType?.some(badge))
                        }
                    } label: {
                        Text(verbatim: "Badge")
                    }
                } header: {
                    Text(verbatim: "Role & badge")
                } footer: {
                    Text(verbatim: "Changing role or badge requires an ADMIN account.")
                }

                Section {
                    Button {
                        confirmingBan = true
                    } label: {
                        Text(verbatim: user.banned ? "Unban this account" : "Ban this account")
                            .foregroundStyle(user.banned ? ZrpColor.onSurface : ZrpColor.red)
                    }
                    .disabled(viewModel.isWorking)
                } footer: {
                    Text(verbatim: "A ban blocks sign-in immediately and takes effect on every device.")
                }

                Section {
                    Button(role: .destructive) {
                        confirmingDelete = true
                    } label: {
                        Text(verbatim: "Delete account")
                    }
                    .disabled(viewModel.isWorking)
                } footer: {
                    Text(verbatim: "Permanently deletes the account and cascades to everything it owns - posts, comments, messages, media. This cannot be undone.")
                }
            }
            .navigationTitle(Text(verbatim: "Edit user"))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button { onDismiss() } label: { Text(.actionCancel) }
                }
            }
            .confirmationDialog(
                Text(verbatim: user.banned ? "Unban @\(user.username)?" : "Ban @\(user.username)?"),
                isPresented: $confirmingBan,
                titleVisibility: .visible
            ) {
                Button(role: user.banned ? nil : .destructive) {
                    Task { await viewModel.toggleBan(user) }
                } label: {
                    Text(verbatim: user.banned ? "Unban" : "Ban")
                }
                Button(role: .cancel) {} label: { Text(.actionCancel) }
            } message: {
                Text(verbatim: user.banned
                    ? "They will be able to sign in again immediately."
                    : "They will be signed out and unable to sign in until unbanned.")
            }
            .confirmationDialog(
                Text(verbatim: "Delete @\(user.username)?"),
                isPresented: $confirmingDelete,
                titleVisibility: .visible
            ) {
                Button(role: .destructive) {
                    Task {
                        if await viewModel.delete(user) { onDismiss() }
                    }
                } label: {
                    Text(verbatim: "Delete permanently")
                }
                Button(role: .cancel) {} label: { Text(.actionCancel) }
            } message: {
                Text(verbatim: "This permanently deletes @\(user.username)'s account and everything they posted. This cannot be undone.")
            }
        }
    }
}
