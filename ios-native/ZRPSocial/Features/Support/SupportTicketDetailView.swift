import SwiftUI

@MainActor
final class SupportTicketDetailViewModel: ObservableObject {

    enum Phase: Equatable {
        case loading
        case loaded(SupportTicket)
        case failed(ApiError)
    }

    @Published private(set) var phase: Phase = .loading
    @Published var draft = ""
    @Published private(set) var isSending = false
    @Published var errorMessage: String?

    private let ticketId: String
    private let repository: SupportRepositoryProtocol

    init(ticketId: String, repository: SupportRepositoryProtocol = SupportRepository()) {
        self.ticketId = ticketId
        self.repository = repository
    }

    var canSend: Bool {
        !isSending && !draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }

    func load() async {
        do {
            phase = .loaded(try await repository.ticket(id: ticketId))
        } catch {
            if case .loaded = phase { return }
            phase = .failed(error as? ApiError ?? .transport(underlying: "\(error)"))
        }
    }

    /// The reply route returns the created reply, but a reply also moves
    /// the ticket's status server-side - so the thread is refetched rather
    /// than appended to, and the status shown stays the real one.
    func send() async {
        guard canSend else { return }
        isSending = true
        defer { isSending = false }

        do {
            try await repository.reply(ticketId: ticketId, message: draft)
            draft = ""
            await load()
        } catch let error as ApiError {
            errorMessage = error.userFacingMessage
        } catch {
            errorMessage = L10n.string(.supportTicketDetailErrReplyFailed)
        }
    }
}

/// One support ticket and its thread.
struct SupportTicketDetailView: View {

    @StateObject private var viewModel: SupportTicketDetailViewModel

    init(ticketId: String) {
        _viewModel = StateObject(
            wrappedValue: SupportTicketDetailViewModel(ticketId: ticketId)
        )
    }

    var body: some View {
        Group {
            switch viewModel.phase {
            case .loading:
                TimelineStateView.loading()
            case .failed(let error):
                TimelineStateView.error(error) {
                    Task { await viewModel.load() }
                }
            case .loaded(let ticket):
                thread(ticket)
            }
        }
        .background(ZrpColor.background.ignoresSafeArea())
        .navigationTitle(Text(.supportTicketsPageTitle))
        .navigationBarTitleDisplayMode(.inline)
        .task { await viewModel.load() }
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
    private func thread(_ ticket: SupportTicket) -> some View {
        ScrollView {
            VStack(alignment: .leading, spacing: ZrpSpacing.lg) {
                header(ticket)

                if let message = ticket.message, !message.isEmpty {
                    bubble(
                        message: message,
                        at: ticket.createdAt,
                        fromSupport: false,
                        isInternal: false
                    )
                }

                ForEach(ticket.replies ?? []) { reply in
                    bubble(
                        message: reply.message,
                        at: reply.createdAt,
                        fromSupport: reply.isFromSupport,
                        isInternal: reply.isInternal == true
                    )
                }

                closedNotice(ticket)
            }
            .padding(ZrpSpacing.lg)
            .frame(maxWidth: ZrpMetrics.contentMaxWidth)
            .frame(maxWidth: .infinity)
        }
        .safeAreaInset(edge: .bottom) {
            if ticket.status.acceptsReplies {
                composer
            }
        }
    }

    private func header(_ ticket: SupportTicket) -> some View {
        VStack(alignment: .leading, spacing: ZrpSpacing.sm) {
            Text(verbatim: ticket.subject)
                .font(.title3.weight(.bold))
                .foregroundStyle(ZrpColor.onSurface)
                .fixedSize(horizontal: false, vertical: true)

            HStack(spacing: ZrpSpacing.sm) {
                Text(.supportTicketDetailStatusLabel)
                StatusChip(status: ticket.status)
            }
            .font(.caption)
            .foregroundStyle(ZrpColor.onSurfaceMuted)

            if let key = ticket.category.titleKey {
                HStack(spacing: ZrpSpacing.xs) {
                    Text(.supportTicketDetailCategoryLabel)
                    Text(key)
                }
                .font(.caption)
                .foregroundStyle(ZrpColor.onSurfaceMuted)
            }

            // Set by the server from the opener's plan, never chosen here.
            if let key = ticket.priority.titleKey {
                HStack(spacing: ZrpSpacing.xs) {
                    Text(.supportTicketDetailPriorityLabel)
                    Text(key)
                }
                .font(.caption)
                .foregroundStyle(ZrpColor.onSurfaceMuted)
            }

            HStack(spacing: ZrpSpacing.xs) {
                Text(.supportTicketDetailCreatedLabel)
                Text(verbatim: RelativeTime.compact(from: ticket.createdAt))
            }
            .font(.caption)
            .foregroundStyle(ZrpColor.onSurfaceMuted)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private func bubble(
        message: String,
        at date: Date,
        fromSupport: Bool,
        isInternal: Bool
    ) -> some View {
        VStack(alignment: .leading, spacing: ZrpSpacing.xs) {
            HStack(spacing: ZrpSpacing.sm) {
                if fromSupport {
                    Text(.supportTicketDetailSupportBadge)
                        .font(.caption2.weight(.semibold))
                        .foregroundStyle(ZrpColor.red)
                }
                if isInternal {
                    // Only ever returned to staff by the route; shown as
                    // what it is if it ever appears.
                    Text(.supportTicketDetailInternalNote)
                        .font(.caption2.weight(.semibold))
                        .foregroundStyle(ZrpColor.amber)
                }
                Spacer(minLength: 0)
                Text(verbatim: RelativeTime.compact(from: date))
                    .font(.caption2)
                    .foregroundStyle(ZrpColor.onSurfaceMuted)
            }

            Text(verbatim: message)
                .font(.subheadline)
                .foregroundStyle(ZrpColor.onSurface)
                .fixedSize(horizontal: false, vertical: true)
                .textSelection(.enabled)
        }
        .padding(ZrpSpacing.md)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(fromSupport ? ZrpColor.surfaceElevated : ZrpColor.surface)
        .clipShape(RoundedRectangle(cornerRadius: ZrpRadius.md, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: ZrpRadius.md, style: .continuous)
                .strokeBorder(ZrpColor.outlineFaint, lineWidth: 1)
        )
    }

    @ViewBuilder
    private func closedNotice(_ ticket: SupportTicket) -> some View {
        switch ticket.status {
        case .resolved:
            notice(.supportTicketDetailResolvedNotice)
        case .closed:
            notice(.supportTicketDetailClosedNotice)
        default:
            EmptyView()
        }
    }

    private func notice(_ key: L10nKey) -> some View {
        Text(key)
            .font(.footnote)
            .foregroundStyle(ZrpColor.onSurfaceMuted)
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(ZrpSpacing.md)
            .background(ZrpColor.surfaceElevated)
            .clipShape(RoundedRectangle(cornerRadius: ZrpRadius.md, style: .continuous))
    }

    private var composer: some View {
        HStack(alignment: .bottom, spacing: ZrpSpacing.sm) {
            TextField(
                L10n.string(.supportTicketDetailReplyPlaceholder),
                text: $viewModel.draft,
                axis: .vertical
            )
            .font(.subheadline)
            .lineLimit(1...5)
            .padding(ZrpSpacing.md)
            .background(ZrpColor.surfaceElevated)
            .clipShape(RoundedRectangle(cornerRadius: ZrpRadius.lg, style: .continuous))

            Button {
                Task { await viewModel.send() }
            } label: {
                if viewModel.isSending {
                    ProgressView()
                        .tint(ZrpColor.red)
                        .frame(width: ZrpMetrics.minTouchTarget, height: ZrpMetrics.minTouchTarget)
                } else {
                    Image(systemName: "paperplane.fill")
                        .foregroundStyle(viewModel.canSend ? ZrpColor.red : ZrpColor.onSurfaceMuted)
                        .frame(width: ZrpMetrics.minTouchTarget, height: ZrpMetrics.minTouchTarget)
                }
            }
            .disabled(!viewModel.canSend)
            .accessibilityLabel(Text(.supportTicketDetailSendReply))
        }
        .padding(.horizontal, ZrpSpacing.lg)
        .padding(.vertical, ZrpSpacing.sm)
        .background(.bar)
    }
}
