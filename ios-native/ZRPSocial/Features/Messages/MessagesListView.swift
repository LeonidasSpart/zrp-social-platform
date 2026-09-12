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
    @Published private(set) var groups: [GroupConversation] = []
    @Published private(set) var phase: Phase = .idle
    @Published var errorMessage: String?

    /// Both kinds of conversation in one list, newest activity first.
    ///
    /// The inbox has to ask two routes because the backend keeps them
    /// apart: `GET /api/messages` filters on `conversationId IS NULL` and
    /// returns direct threads only. Asking only that one is why this app
    /// showed an incomplete inbox - and a Messages badge that could never
    /// be cleared, because `/api/messages/unread` counts group messages
    /// too. Web merges the same two sources in
    /// `src/lib/unifiedConversations.ts`.
    var inbox: [InboxEntry] {
        let merged = conversations.map(InboxEntry.direct) + groups.map(InboxEntry.group)
        return merged.sorted { $0.sortDate > $1.sortDate }
    }

    private let repository: MessagesRepositoryProtocol
    private let conversationsRepository: ConversationsRepositoryProtocol

    init(
        repository: MessagesRepositoryProtocol = MessagesRepository(),
        conversationsRepository: ConversationsRepositoryProtocol = ConversationsRepository()
    ) {
        self.repository = repository
        self.conversationsRepository = conversationsRepository
    }

    func loadIfNeeded() async {
        guard phase == .idle else { return }
        await load()
    }

    func load() async {
        if conversations.isEmpty && groups.isEmpty { phase = .loading }

        // Concurrently, and independently. A group route that fails must
        // not empty an inbox of direct threads that loaded perfectly
        // well - and the reverse. Each half keeps whatever it last had.
        async let directTask = repository.conversations()
        async let groupTask = conversationsRepository.groups()

        var anySucceeded = false
        var firstError: Error?

        do {
            conversations = try await directTask
            anySucceeded = true
        } catch {
            firstError = error
        }
        do {
            groups = try await groupTask
            anySucceeded = true
        } catch {
            if firstError == nil { firstError = error }
        }

        let apiError = firstError as? ApiError

        // A cancelled request is this screen going away, not a failure
        // worth reporting to anyone.
        if apiError == .cancelled { return }

        if anySucceeded {
            phase = .loaded
            // One half failing is worth saying once, rather than showing
            // a silently short inbox with no explanation.
            if firstError != nil {
                errorMessage = apiError?.userFacingMessage ?? L10n.string(.authErrTryAgain)
            }
        } else if conversations.isEmpty && groups.isEmpty {
            phase = .failed(apiError ?? .transport(underlying: "\(firstError as Any)"))
        } else {
            phase = .loaded
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
    @EnvironmentObject private var unread: UnreadBadgeViewModel
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
        // Reading a thread advances lastReadAt server-side, but the tab
        // badge is only refetched when the Messages tab is SELECTED -
        // and popping back from a thread does not change tabs. So the
        // count someone just cleared stayed on the tab until they left
        // and came back. Refreshing whenever this list appears is the
        // one place that covers both thread kinds.
        .onAppear { Task { await unread.refresh() } }
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
                ForEach(viewModel.inbox) { entry in
                    switch entry {
                    case .direct(let summary):
                        row(summary)
                    case .group(let conversation):
                        groupRow(conversation)
                    }
                }
            }
            .frame(maxWidth: ZrpMetrics.contentMaxWidth)
            .frame(maxWidth: .infinity)
        }
        .refreshable { await viewModel.load() }
    }

    /// A group row.
    ///
    /// Deliberately close to the direct row rather than a different
    /// visual language: the inbox is one list of conversations, and a
    /// group is one of them. What distinguishes it is the group's own
    /// name and member count in place of a person, and the sender's name
    /// on the preview line - in a group "who said this" is information
    /// a one-to-one thread does not need.
    private func groupRow(_ conversation: GroupConversation) -> some View {
        Button {
            navigator.push(.groupConversation(id: conversation.id))
        } label: {
            HStack(alignment: .top, spacing: ZrpSpacing.md) {
                GroupAvatarView(
                    url: conversation.avatarUrl,
                    name: conversation.name,
                    size: ZrpMetrics.avatarMedium
                )

                VStack(alignment: .leading, spacing: 2) {
                    HStack(spacing: ZrpSpacing.xs) {
                        Text(verbatim: conversation.name ?? L10n.string(.iosGroupUntitled))
                            .font(.subheadline.weight(.semibold))
                            .foregroundStyle(ZrpColor.onSurface)
                            .lineLimit(1)

                        Image(systemName: "person.2.fill")
                            .font(.caption2)
                            .foregroundStyle(ZrpColor.onSurfaceMuted)
                        Text(verbatim: CountFormatting.exact(conversation.participantCount))
                            .font(.caption2)
                            .foregroundStyle(ZrpColor.onSurfaceMuted)

                        Spacer(minLength: 0)

                        if let last = conversation.lastMessage {
                            Text(verbatim: RelativeTime.compact(from: last.createdAt))
                                .font(.caption2)
                                .foregroundStyle(ZrpColor.onSurfaceMuted)
                        }
                    }

                    HStack(spacing: ZrpSpacing.sm) {
                        Text(verbatim: groupPreview(for: conversation))
                            .font(.footnote)
                            .foregroundStyle(ZrpColor.onSurfaceMuted)
                            .lineLimit(1)
                            .multilineTextAlignment(.leading)

                        Spacer(minLength: 0)

                        if conversation.unreadCount > 0 {
                            Text(verbatim: CountFormatting.exact(conversation.unreadCount))
                                .font(.caption2.weight(.bold))
                                .padding(.horizontal, ZrpSpacing.sm)
                                .padding(.vertical, 2)
                                .background(ZrpColor.red)
                                .foregroundStyle(.white)
                                .clipShape(Capsule())
                        }
                    }
                }
            }
            .padding(.horizontal, ZrpSpacing.lg)
            .padding(.vertical, ZrpSpacing.md)
            .frame(maxWidth: .infinity, alignment: .leading)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .overlay(alignment: .bottom) {
            Rectangle().fill(ZrpColor.outline).frame(height: 1)
        }
    }

    /// "Ada: see you then", or the empty-group line.
    ///
    /// The sender's name is prefixed because a group preview without it
    /// is ambiguous in a way a 1:1 preview never is.
    private func groupPreview(for conversation: GroupConversation) -> String {
        guard let last = conversation.lastMessage else {
            return L10n.string(.iosGroupNoMessages)
        }
        let body = last.content.isEmpty
            ? L10n.string(.storiesImage)
            : last.content
        guard let name = last.sender?.displayName, !name.isEmpty else { return body }
        return L10n.string(.iosGroupPreview, ["name": name, "message": body])
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
