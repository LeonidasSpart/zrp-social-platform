import SwiftUI

@MainActor
final class SupportTicketsViewModel: ObservableObject {

    enum Phase: Equatable {
        case idle
        case loading
        case loaded
        case failed(ApiError)
    }

    @Published private(set) var tickets: [SupportTicket] = []
    @Published private(set) var phase: Phase = .idle
    @Published var errorMessage: String?

    private let repository: SupportRepositoryProtocol

    init(repository: SupportRepositoryProtocol = SupportRepository()) {
        self.repository = repository
    }

    func loadIfNeeded() async {
        guard phase == .idle else { return }
        await load()
    }

    func load() async {
        if tickets.isEmpty { phase = .loading }
        do {
            tickets = try await repository.tickets()
            phase = .loaded
        } catch {
            if tickets.isEmpty {
                phase = .failed(error as? ApiError ?? .transport(underlying: "\(error)"))
            } else {
                phase = .loaded
            }
        }
    }

    /// Only resolved and closed tickets can be deleted, and the route
    /// enforces that - this hides the control for the rest rather than
    /// offering an action that would come back 403.
    func delete(_ ticket: SupportTicket) async {
        do {
            try await repository.deleteTicket(id: ticket.id)
            tickets.removeAll { $0.id == ticket.id }
        } catch let error as ApiError {
            errorMessage = error.userFacingMessage
        } catch {
            errorMessage = L10n.string(.supportTicketsErrDeleteFailed)
        }
    }

    func insert(_ ticket: SupportTicket) {
        tickets.insert(ticket, at: 0)
        phase = .loaded
    }
}

/// The viewer's support tickets.
///
/// `GET /api/support/tickets` returns every ticket they have opened -
/// unpaginated, newest first - so there is no paging control here,
/// because there is nothing to page.
struct SupportTicketsView: View {

    @EnvironmentObject private var navigator: Navigator
    @StateObject private var viewModel = SupportTicketsViewModel()
    @State private var isComposing = false
    @State private var pendingDelete: SupportTicket?

    var body: some View {
        content
            .background(ZrpColor.background.ignoresSafeArea())
            .navigationTitle(Text(.supportTicketsPageTitle))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button { isComposing = true } label: {
                        Image(systemName: "square.and.pencil")
                    }
                    .accessibilityLabel(Text(.supportSubmitTicket))
                }
            }
            .sheet(isPresented: $isComposing) {
                NewTicketView { created in viewModel.insert(created) }
            }
            .task { await viewModel.loadIfNeeded() }
            .confirmationDialog(
                Text(.supportTicketsConfirmDelete),
                isPresented: Binding(
                    get: { pendingDelete != nil },
                    set: { if !$0 { pendingDelete = nil } }
                ),
                titleVisibility: .visible
            ) {
                Button(role: .destructive) {
                    if let target = pendingDelete {
                        pendingDelete = nil
                        Task { await viewModel.delete(target) }
                    }
                } label: {
                    Text(.supportTicketsDeleteButton)
                }
                Button(role: .cancel) { pendingDelete = nil } label: { Text(.actionCancel) }
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
        case .idle, .loading:
            TimelineStateView.loading()
        case .failed(let error):
            TimelineStateView.error(error) {
                Task { await viewModel.load() }
            }
        case .loaded:
            if viewModel.tickets.isEmpty {
                empty
            } else {
                list
            }
        }
    }

    private var empty: some View {
        VStack(spacing: ZrpSpacing.lg) {
            TimelineStateView.empty(
                systemImage: "lifepreserver",
                title: .supportTicketsNoTickets,
                subtitle: nil
            )
            Button { isComposing = true } label: {
                Text(.supportTicketsCreateFirst)
                    .font(.subheadline.weight(.semibold))
                    .padding(.horizontal, ZrpSpacing.xl)
                    .frame(minHeight: ZrpMetrics.minTouchTarget)
                    .background(ZrpColor.red)
                    .foregroundStyle(.white)
                    .clipShape(Capsule())
            }
            .padding(.bottom, ZrpSpacing.xxl)
        }
    }

    private var list: some View {
        ScrollView {
            LazyVStack(spacing: 0) {
                ForEach(viewModel.tickets) { ticket in
                    row(ticket)
                }
            }
            .frame(maxWidth: ZrpMetrics.contentMaxWidth)
            .frame(maxWidth: .infinity)
        }
        .refreshable { await viewModel.load() }
    }

    private func row(_ ticket: SupportTicket) -> some View {
        Button {
            navigator.push(.supportTicket(id: ticket.id))
        } label: {
            VStack(alignment: .leading, spacing: ZrpSpacing.sm) {
                HStack(spacing: ZrpSpacing.sm) {
                    Text(verbatim: ticket.subject)
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(ZrpColor.onSurface)
                        .multilineTextAlignment(.leading)
                        .lineLimit(2)
                    Spacer(minLength: 0)
                    StatusChip(status: ticket.status)
                }

                // Separated by spacing rather than punctuation, so
                // nothing here is a user-facing string this app invented.
                HStack(spacing: ZrpSpacing.md) {
                    if let key = ticket.category.titleKey {
                        HStack(spacing: ZrpSpacing.xs) {
                            Text(.supportTicketsCategoryPrefix)
                            Text(key)
                        }
                    }
                    Text(verbatim: RelativeTime.compact(from: ticket.createdAt))
                    if ticket.replyCount > 0 {
                        HStack(spacing: ZrpSpacing.xs) {
                            Text(verbatim: CountFormatting.exact(ticket.replyCount))
                            Text(.supportTicketsRepliesSuffix)
                        }
                    }
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
        // A context menu rather than a swipe action: swipe actions only
        // exist inside a `List`, and this is a `LazyVStack`, so one here
        // would be a control that silently never appears.
        //
        // Offered only where the route would allow it - deletion is
        // refused on a ticket that is still open, server-side.
        .contextMenu {
            if !ticket.status.acceptsReplies {
                Button(role: .destructive) {
                    pendingDelete = ticket
                } label: {
                    Label {
                        Text(.supportTicketsDeleteButton)
                    } icon: {
                        Image(systemName: "trash")
                    }
                }
            }
        }
    }
}

/// A ticket's status, in the same five colours the website uses.
struct StatusChip: View {

    let status: TicketStatus

    private var tint: Color {
        switch status {
        case .open: return ZrpColor.red
        case .inProgress: return ZrpColor.blue
        case .awaitingReply: return ZrpColor.amber
        case .resolved: return ZrpColor.green
        case .closed, .unknown: return ZrpColor.onSurfaceMuted
        }
    }

    var body: some View {
        if let key = status.titleKey {
            Text(key)
                .font(.caption2.weight(.semibold))
                .foregroundStyle(tint)
                .padding(.horizontal, ZrpSpacing.sm)
                .padding(.vertical, 2)
                .background(tint.opacity(0.12), in: Capsule())
                .overlay(Capsule().strokeBorder(tint.opacity(0.25), lineWidth: 1))
        }
    }
}
