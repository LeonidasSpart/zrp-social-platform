import SwiftUI

@MainActor
final class AdminSupportTicketDetailViewModel: ObservableObject {

    enum Phase: Equatable {
        case loading
        case loaded
        case failed(ApiError)
    }

    @Published private(set) var ticket: AdminSupportTicketDetail?
    @Published private(set) var phase: Phase = .loading
    @Published private(set) var isWorking = false
    @Published var errorMessage: String?

    private let ticketId: String
    private let repository: AdminRepositoryProtocol

    init(ticketId: String, repository: AdminRepositoryProtocol = AdminRepository()) {
        self.ticketId = ticketId
        self.repository = repository
    }

    func load() async {
        if ticket == nil { phase = .loading }
        do {
            ticket = try await repository.supportTicket(id: ticketId)
            phase = .loaded
        } catch {
            phase = .failed(error as? ApiError ?? .transport(underlying: "\(error)"))
        }
    }

    @discardableResult
    private func mutate(_ work: @escaping () async throws -> Void) async -> Bool {
        guard !isWorking else { return false }
        isWorking = true
        defer { isWorking = false }
        do {
            try await work()
            await load()
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
    func setStatus(_ status: String) async -> Bool {
        await mutate { [repository, ticketId] in try await repository.setSupportTicketStatus(id: ticketId, status: status) }
    }

    @discardableResult
    func reply(message: String, isInternal: Bool) async -> Bool {
        await mutate { [repository, ticketId] in try await repository.replySupportTicket(id: ticketId, message: message, isInternal: isInternal) }
    }

    @discardableResult
    func resolve(resolution: String?) async -> Bool {
        await mutate { [repository, ticketId] in try await repository.resolveSupportTicket(id: ticketId, resolution: resolution) }
    }
}

/// One support ticket's thread - the native answer to `/admin/support/{id}`.
struct AdminSupportTicketDetailView: View {

    let ticketId: String
    @StateObject private var viewModel: AdminSupportTicketDetailViewModel
    @State private var replyText = ""
    @State private var replyIsInternal = false
    @State private var isResolving = false
    @State private var resolutionNote = ""

    init(ticketId: String) {
        self.ticketId = ticketId
        _viewModel = StateObject(wrappedValue: AdminSupportTicketDetailViewModel(ticketId: ticketId))
    }

    var body: some View {
        content
            .background(ZrpColor.background.ignoresSafeArea())
            .navigationTitle(Text(verbatim: "Ticket"))
            .navigationBarTitleDisplayMode(.inline)
            .task { await viewModel.load() }
            .sheet(isPresented: $isResolving) {
                resolveSheet
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
        switch viewModel.phase {
        case .loading:
            TimelineStateView.loading()
        case .failed(let error):
            TimelineStateView.error(error) { Task { await viewModel.load() } }
        case .loaded:
            if let ticket = viewModel.ticket {
                thread(ticket)
            }
        }
    }

    private func thread(_ ticket: AdminSupportTicketDetail) -> some View {
        VStack(spacing: 0) {
            ScrollView {
                LazyVStack(alignment: .leading, spacing: ZrpSpacing.lg) {
                    header(ticket)

                    ForEach(ticket.replies) { reply in
                        replyBubble(reply)
                    }
                }
                .padding(ZrpSpacing.lg)
            }

            Divider().overlay(ZrpColor.outline)

            composer
        }
    }

    private func header(_ ticket: AdminSupportTicketDetail) -> some View {
        VStack(alignment: .leading, spacing: ZrpSpacing.sm) {
            HStack {
                Text(verbatim: ticket.subject)
                    .font(.headline)
                    .foregroundStyle(ZrpColor.onSurface)
                Spacer(minLength: 0)
                Picker(selection: Binding(
                    get: { ticket.status },
                    set: { newStatus in Task { await viewModel.setStatus(newStatus) } }
                )) {
                    ForEach(["OPEN", "IN_PROGRESS", "AWAITING_REPLY", "RESOLVED", "CLOSED"], id: \.self) { status in
                        Text(verbatim: status.replacingOccurrences(of: "_", with: " ").capitalized).tag(status)
                    }
                } label: {
                    AdminStatusChip(status: ticket.status)
                }
                .pickerStyle(.menu)
            }
            Text(verbatim: "@\(ticket.user.username) \u{00B7} \(ticket.category.capitalized) \u{00B7} \(ticket.priority.capitalized)")
                .font(.caption)
                .foregroundStyle(ZrpColor.onSurfaceMuted)
            Text(verbatim: ticket.message)
                .font(.subheadline)
                .foregroundStyle(ZrpColor.onSurface)
                .padding(ZrpSpacing.md)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(ZrpColor.surfaceElevated, in: RoundedRectangle(cornerRadius: 12))

            if let resolution = ticket.resolution, !resolution.isEmpty {
                VStack(alignment: .leading, spacing: 2) {
                    Text(verbatim: "Resolution")
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(ZrpColor.onSurfaceMuted)
                    Text(verbatim: resolution)
                        .font(.footnote)
                        .foregroundStyle(ZrpColor.onSurface)
                }
            }

            Button {
                isResolving = true
            } label: {
                Text(verbatim: "Mark resolved")
                    .font(.caption.weight(.semibold))
            }
            .disabled(viewModel.isWorking || ticket.status == "RESOLVED")
        }
    }

    private func replyBubble(_ reply: AdminSupportTicketDetail.Reply) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            HStack(spacing: ZrpSpacing.xs) {
                Text(verbatim: "@\(reply.user.username)")
                    .font(.caption.weight(.semibold))
                if reply.isInternal {
                    Text(verbatim: "INTERNAL")
                        .font(.caption2.weight(.bold))
                        .foregroundStyle(.white)
                        .padding(.horizontal, 6)
                        .padding(.vertical, 1)
                        .background(Capsule().fill(ZrpColor.amber))
                }
                Spacer(minLength: 0)
                Text(verbatim: RelativeTime.compact(from: reply.createdAt))
                    .font(.caption2)
                    .foregroundStyle(ZrpColor.onSurfaceMuted)
            }
            Text(verbatim: reply.message)
                .font(.subheadline)
                .foregroundStyle(ZrpColor.onSurface)
        }
        .padding(ZrpSpacing.md)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(
            reply.isInternal ? ZrpColor.amber.opacity(0.08) : ZrpColor.surfaceHighest,
            in: RoundedRectangle(cornerRadius: 12)
        )
    }

    private var composer: some View {
        VStack(alignment: .leading, spacing: ZrpSpacing.sm) {
            Toggle(isOn: $replyIsInternal) {
                Text(verbatim: "Internal note (not visible to the user)")
                    .font(.caption)
            }
            HStack(alignment: .bottom, spacing: ZrpSpacing.sm) {
                TextField("Reply", text: $replyText, axis: .vertical)
                    .lineLimit(1...4)
                    .textFieldStyle(.roundedBorder)
                Button {
                    let message = replyText
                    replyText = ""
                    Task { await viewModel.reply(message: message, isInternal: replyIsInternal) }
                } label: {
                    Image(systemName: "arrow.up.circle.fill")
                        .font(.title2)
                }
                .disabled(replyText.trimmingCharacters(in: .whitespaces).isEmpty || viewModel.isWorking)
            }
        }
        .padding(ZrpSpacing.lg)
        .background(ZrpColor.surface)
    }

    private var resolveSheet: some View {
        NavigationStack {
            Form {
                Section {
                    TextField("Resolution note (optional, shown to the user)", text: $resolutionNote, axis: .vertical)
                        .lineLimit(3...6)
                }
            }
            .navigationTitle(Text(verbatim: "Resolve ticket"))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button { isResolving = false } label: { Text(.actionCancel) }
                }
                ToolbarItem(placement: .topBarTrailing) {
                    Button {
                        Task {
                            if await viewModel.resolve(resolution: resolutionNote) {
                                resolutionNote = ""
                                isResolving = false
                            }
                        }
                    } label: {
                        Text(verbatim: "Resolve")
                    }
                    .disabled(viewModel.isWorking)
                }
            }
        }
    }
}
