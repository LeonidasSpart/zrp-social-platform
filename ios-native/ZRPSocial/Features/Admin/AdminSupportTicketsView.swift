import SwiftUI

@MainActor
final class AdminSupportTicketsViewModel: ObservableObject {

    enum Phase: Equatable {
        case loading
        case loaded
        case failed(ApiError)
    }

    @Published private(set) var tickets: [AdminSupportTicket] = []
    @Published private(set) var stats: AdminSupportTicketStats?
    @Published private(set) var phase: Phase = .loading
    @Published private(set) var isLoadingMore = false
    @Published var errorMessage: String?

    @Published var searchText = "" {
        didSet {
            guard searchText != oldValue else { return }
            scheduleSearch()
        }
    }
    @Published var statusFilter: AdminTicketStatusFilter = .all {
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
        stats = try? await repository.supportTicketStats()
    }

    func reload() async {
        if tickets.isEmpty { phase = .loading }
        await load(page: 1, replacing: true)
        stats = try? await repository.supportTicketStats()
    }

    func loadMoreIfNeeded(currentTicket: AdminSupportTicket) async {
        guard
            phase == .loaded,
            hasMore,
            !isLoadingMore,
            let index = tickets.firstIndex(where: { $0.id == currentTicket.id }),
            index >= tickets.count - 5
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
            let result = try await repository.supportTickets(
                status: statusFilter,
                search: searchText.trimmingCharacters(in: .whitespacesAndNewlines),
                page: requestedPage
            )
            if replacing {
                tickets = result.tickets
            } else {
                let existing = Set(tickets.map(\.id))
                tickets.append(contentsOf: result.tickets.filter { !existing.contains($0.id) })
            }
            page = result.pagination.page
            totalPages = result.pagination.pages
            phase = .loaded
        } catch ApiError.cancelled {
            return
        } catch {
            if tickets.isEmpty {
                phase = .failed(error as? ApiError ?? .transport(underlying: "\(error)"))
            } else {
                phase = .loaded
            }
        }
    }

    func delete(_ ticket: AdminSupportTicket) async {
        do {
            try await repository.deleteSupportTicket(id: ticket.id)
            tickets.removeAll { $0.id == ticket.id }
        } catch let error as ApiError {
            errorMessage = error.userFacingMessage
        } catch {
            errorMessage = "Something went wrong. Please try again."
        }
    }
}

/// Support ticket queue - the native answer to `/admin/support`. Admin-
/// only (`requireAdmin`, not `requireStaff`).
struct AdminSupportTicketsView: View {

    @EnvironmentObject private var navigator: Navigator
    @StateObject private var viewModel = AdminSupportTicketsViewModel()
    @State private var confirmingDeleteId: String?

    var body: some View {
        content
            .background(ZrpColor.background.ignoresSafeArea())
            .navigationTitle(Text(verbatim: "Support tickets"))
            .navigationBarTitleDisplayMode(.inline)
            .searchable(text: $viewModel.searchText, prompt: Text(verbatim: "Search subject, message, user"))
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Picker(selection: $viewModel.statusFilter) {
                        ForEach(AdminTicketStatusFilter.allCases) { status in
                            Text(verbatim: status.displayName).tag(status)
                        }
                    } label: {
                        Text(verbatim: viewModel.statusFilter.displayName)
                    }
                    .pickerStyle(.menu)
                }
            }
            .task { await viewModel.loadIfNeeded() }
            .confirmationDialog(
                Text(verbatim: "Delete this ticket?"),
                isPresented: Binding(get: { confirmingDeleteId != nil }, set: { if !$0 { confirmingDeleteId = nil } }),
                titleVisibility: .visible
            ) {
                Button(role: .destructive) {
                    if let id = confirmingDeleteId, let ticket = viewModel.tickets.first(where: { $0.id == id }) {
                        confirmingDeleteId = nil
                        Task { await viewModel.delete(ticket) }
                    }
                } label: {
                    Text(verbatim: "Delete")
                }
                Button(role: .cancel) { confirmingDeleteId = nil } label: { Text(.actionCancel) }
            } message: {
                Text(verbatim: "This permanently deletes the ticket and every reply on it. This cannot be undone.")
            }
            .alert(
                Text(.iosErrorGenericTitle),
                isPresented: Binding(get: { viewModel.errorMessage != nil }, set: { if !$0 { viewModel.errorMessage = nil } })
            ) {
                Button { viewModel.errorMessage = nil } label: { Text(.actionCancel) }
            } message: {
                Text(verbatim: viewModel.errorMessage ?? "")
            }
    }

    @ViewBuilder
    private var content: some View {
        VStack(spacing: 0) {
            if let stats = viewModel.stats {
                statBar(stats)
            }
            switch viewModel.phase {
            case .loading:
                TimelineStateView.loading()
            case .failed(let error):
                TimelineStateView.error(error) { Task { await viewModel.reload() } }
            case .loaded:
                if viewModel.tickets.isEmpty {
                    AdminEmptyState(systemImage: "lifepreserver", title: "No tickets", subtitle: "Nothing matches this search or filter.")
                } else {
                    list
                }
            }
        }
    }

    private func statBar(_ stats: AdminSupportTicketStats) -> some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: ZrpSpacing.md) {
                statPill("Open", stats.open, ZrpColor.amber)
                statPill("In progress", stats.inProgress, ZrpColor.blue)
                statPill("Awaiting reply", stats.awaitingReply, ZrpColor.onSurfaceMuted)
                statPill("Resolved", stats.resolved, ZrpColor.green)
                statPill("Total", stats.total, ZrpColor.onSurface)
            }
            .padding(.horizontal, ZrpSpacing.lg)
            .padding(.vertical, ZrpSpacing.sm)
        }
    }

    private func statPill(_ label: String, _ value: Int, _ tint: Color) -> some View {
        VStack(spacing: 0) {
            Text(verbatim: CountFormatting.exact(value))
                .font(.subheadline.weight(.bold))
                .foregroundStyle(tint)
            Text(verbatim: label)
                .font(.caption2)
                .foregroundStyle(ZrpColor.onSurfaceMuted)
        }
        .padding(.horizontal, ZrpSpacing.md)
        .padding(.vertical, ZrpSpacing.xs)
        .background(ZrpColor.surfaceHighest, in: Capsule())
    }

    private var list: some View {
        ScrollView {
            LazyVStack(spacing: 0) {
                ForEach(viewModel.tickets) { ticket in
                    row(ticket)
                        .task { await viewModel.loadMoreIfNeeded(currentTicket: ticket) }
                }
                if viewModel.isLoadingMore {
                    ProgressView().tint(ZrpColor.onSurfaceMuted).padding(ZrpSpacing.lg)
                }
            }
        }
        .refreshable { await viewModel.reload() }
    }

    private func row(_ ticket: AdminSupportTicket) -> some View {
        Button {
            navigator.push(.adminSupportTicket(id: ticket.id))
        } label: {
            VStack(alignment: .leading, spacing: ZrpSpacing.xs) {
                HStack(spacing: ZrpSpacing.sm) {
                    Text(verbatim: ticket.subject)
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(ZrpColor.onSurface)
                        .lineLimit(1)
                    Spacer(minLength: 0)
                    AdminStatusChip(status: ticket.status)
                }
                Text(verbatim: ticket.message)
                    .font(.footnote)
                    .foregroundStyle(ZrpColor.onSurfaceMuted)
                    .lineLimit(2)
                HStack(spacing: ZrpSpacing.xs) {
                    Text(verbatim: "@\(ticket.user.username)")
                    Text(verbatim: "\u{00B7}")
                    Text(verbatim: ticket.category.capitalized)
                    Text(verbatim: "\u{00B7}")
                    Text(verbatim: ticket.priority.capitalized)
                    Text(verbatim: "\u{00B7}")
                    Text(verbatim: RelativeTime.compact(from: ticket.createdAt))
                }
                .font(.caption)
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
        .contextMenu {
            Button(role: .destructive) {
                confirmingDeleteId = ticket.id
            } label: {
                Label { Text(verbatim: "Delete ticket") } icon: { Image(systemName: "trash") }
            }
        }
    }
}
