import SwiftUI

@MainActor
final class MessagesListViewModel: ObservableObject {

    enum Phase: Equatable {
        case idle
        case loading
        case loaded
        case failed(ApiError)
    }

    @Published private(set) var conversations: [ConversationSummary] = []
    @Published private(set) var phase: Phase = .idle
    @Published var errorMessage: String?

    private let repository: MessagesRepositoryProtocol

    init(repository: MessagesRepositoryProtocol = MessagesRepository()) {
        self.repository = repository
    }

    func loadIfNeeded() async {
        guard phase == .idle else { return }
        await load()
    }

    func load() async {
        if conversations.isEmpty { phase = .loading }
        do {
            conversations = try await repository.conversations()
            phase = .loaded
        } catch {
            if conversations.isEmpty {
                phase = .failed(error as? ApiError ?? .transport(underlying: "\(error)"))
            } else {
                phase = .loaded
            }
        }
    }

    /// Removes the whole thread with that partner, in both directions.
    func deleteConversation(_ summary: ConversationSummary) async {
        do {
            try await repository.deleteConversation(with: summary.partner.id)
            conversations.removeAll { $0.id == summary.id }
        } catch let error as ApiError {
            errorMessage = error.userFacingMessage
        } catch {
            errorMessage = L10n.string(.messagesErrDeleteFailed)
        }
    }
}

/// The conversation list.
struct MessagesListView: View {

    @EnvironmentObject private var session: SessionController
    @EnvironmentObject private var navigator: Navigator
    @StateObject private var viewModel = MessagesListViewModel()
    @State private var pendingDelete: ConversationSummary?

    var body: some View {
        Group {
            switch viewModel.phase {
            case .idle, .loading:
                TimelineStateView.loading()
            case .failed(let error):
                TimelineStateView.error(error) {
                    Task { await viewModel.load() }
                }
            case .loaded:
                if viewModel.conversations.isEmpty {
                    TimelineStateView.empty(
                        systemImage: "bubble.left.and.bubble.right",
                        title: .messagesNoMessagesYet,
                        subtitle: .messagesStartConversation
                    )
                } else {
                    list
                }
            }
        }
        .background(ZrpColor.background.ignoresSafeArea())
        .navigationTitle(Text(.messagesTitle))
        .navigationBarTitleDisplayMode(.inline)
        .task { await viewModel.loadIfNeeded() }
        .confirmationDialog(
            Text(.messagesDeleteConversation),
            isPresented: Binding(
                get: { pendingDelete != nil },
                set: { if !$0 { pendingDelete = nil } }
            ),
            titleVisibility: .visible
        ) {
            Button(role: .destructive) {
                if let target = pendingDelete {
                    pendingDelete = nil
                    Task { await viewModel.deleteConversation(target) }
                }
            } label: {
                Text(.actionDelete)
            }
            Button(role: .cancel) { pendingDelete = nil } label: { Text(.actionCancel) }
        } message: {
            Text(.messagesDeleteConfirm)
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

    private var list: some View {
        ScrollView {
            LazyVStack(spacing: 0) {
                ForEach(viewModel.conversations) { summary in
                    row(summary)
                }
            }
            .frame(maxWidth: ZrpMetrics.contentMaxWidth)
            .frame(maxWidth: .infinity)
        }
        .refreshable { await viewModel.load() }
    }

    private func row(_ summary: ConversationSummary) -> some View {
        Button {
            navigator.push(.conversation(partner: summary.partner))
        } label: {
            HStack(alignment: .top, spacing: ZrpSpacing.md) {
                AvatarView(
                    url: summary.partner.avatarUrl,
                    displayName: summary.partner.displayName,
                    size: ZrpMetrics.avatarMedium
                )

                VStack(alignment: .leading, spacing: 2) {
                    HStack(spacing: ZrpSpacing.xs) {
                        Text(verbatim: summary.partner.displayName)
                            .font(.subheadline.weight(.semibold))
                            .foregroundStyle(ZrpColor.onSurface)
                            .lineLimit(1)
                        VerifiedBadge(badgeType: summary.partner.badgeType, size: 12)
                        Spacer(minLength: 0)
                        Text(verbatim: RelativeTime.compact(from: summary.lastMessage.createdAt))
                            .font(.caption2)
                            .foregroundStyle(ZrpColor.onSurfaceMuted)
                    }

                    // The website prefixes the preview with "You:" when
                    // the last message was the viewer's own.
                    Text(verbatim: preview(for: summary))
                        .font(.footnote)
                        .foregroundStyle(
                            summary.unreadCount > 0 ? ZrpColor.onSurface : ZrpColor.onSurfaceMuted
                        )
                        .lineLimit(2)
                }

                if summary.unreadCount > 0 {
                    Text(verbatim: CountFormatting.compact(summary.unreadCount) ?? "")
                        .font(.caption2.weight(.bold))
                        .monospacedDigit()
                        .foregroundStyle(.white)
                        .padding(.horizontal, 7)
                        .padding(.vertical, 3)
                        .background(ZrpColor.red, in: Capsule())
                }
            }
            .padding(ZrpSpacing.lg)
            .frame(maxWidth: .infinity, alignment: .leading)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .overlay(alignment: .bottom) {
            Rectangle().fill(ZrpColor.outlineFaint).frame(height: 0.5)
        }
        // A context menu rather than `.swipeActions`: swipe actions only
        // function inside a `List`, and this is a LazyVStack in a
        // ScrollView - the swipe would have been a control that silently
        // did nothing.
        .contextMenu {
            Button(role: .destructive) {
                pendingDelete = summary
            } label: {
                Label { Text(.messagesDeleteConversation) } icon: { Image(systemName: "trash") }
            }
        }
        .accessibilityElement(children: .combine)
    }

    private func preview(for summary: ConversationSummary) -> String {
        let body = summary.lastMessage.content.isEmpty
            ? L10n.string(.storiesImage)
            : summary.lastMessage.content
        guard summary.lastMessage.senderId == session.currentUser?.id else { return body }
        return L10n.string(.messagesYou, ["msg": body])
    }
}
