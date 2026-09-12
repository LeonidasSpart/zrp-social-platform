import SwiftUI

@MainActor
final class GroupConversationViewModel: ObservableObject {

    enum Phase: Equatable {
        case loading
        case loaded
        case failed(ApiError)
    }

    @Published private(set) var messages: [GroupMessage] = []
    @Published private(set) var detail: GroupConversationDetail?
    @Published private(set) var phase: Phase = .loading
    @Published var draft: String = ""
    @Published private(set) var isSending = false
    @Published var errorMessage: String?

    @Published private(set) var isLoadingOlder = false
    @Published private(set) var olderCursor: String?

    /// See `ConversationViewModel` - the same rule, for the same reason:
    /// once paging back has begun, a refresh must not walk the cursor
    /// forward over history already on screen.
    private var hasPagedBack = false

    let conversationId: String
    let viewerId: String?

    private let repository: ConversationsRepositoryProtocol
    private let socket: ZrpSocket
    private var socketToken: UUID?
    private var pollTask: Task<Void, Never>?

    private let pageSize = 50

    /// Same intervals as the 1:1 thread. The socket is the delivery
    /// mechanism; polling is the fallback for a dropped connection, not
    /// the primary path.
    private let connectedPollInterval: Duration = .seconds(30)
    private let disconnectedPollInterval: Duration = .seconds(6)

    var canLoadOlder: Bool { olderCursor != nil }

    var title: String {
        detail?.name ?? L10n.string(.iosGroupUntitled)
    }

    /// Only an OWNER may remove somebody else; anyone may remove
    /// themselves. The route decides this from who is asking, and the UI
    /// offers each control only where the route would honour it.
    var viewerRole: GroupRole { detail?.role(of: viewerId) ?? .unknown }

    init(
        conversationId: String,
        viewerId: String?,
        repository: ConversationsRepositoryProtocol = ConversationsRepository(),
        socket: ZrpSocket? = nil
    ) {
        self.conversationId = conversationId
        self.viewerId = viewerId
        self.repository = repository
        // Not a default argument: a default is evaluated outside the
        // actor, and `ZrpSocket.shared` is main-actor isolated.
        self.socket = socket ?? .shared
    }

    func isOwn(_ message: GroupMessage) -> Bool {
        message.senderId == viewerId
    }

    // MARK: - Lifecycle

    func start() async {
        socket.connect()
        subscribeToSocket()
        // Group relays go to a ROOM (`group:<id>`), not to a user's own
        // room, and a socket is not in that room until it asks. Without
        // this the thread would fall back to polling and appear to work
        // - just seconds late, and only for the person who scrolled.
        //
        // Asking is not the same as being let in: the server re-checks
        // membership against the database before joining, and ignores
        // the request otherwise.
        socket.emit("join-conversation", conversationId)
        await load(showLoading: messages.isEmpty)
        await loadDetail()
        startPolling()
    }

    func stop() {
        pollTask?.cancel()
        pollTask = nil
        if let socketToken { socket.unsubscribe(socketToken) }
        socketToken = nil
        // Leaving the room stops this device being woken for a thread
        // nobody is reading. Membership is unchanged - this is a socket
        // subscription, not leaving the group.
        socket.emit("leave-conversation", conversationId)
    }

    private func startPolling() {
        pollTask?.cancel()
        pollTask = Task { [weak self] in
            while !Task.isCancelled {
                guard let self else { return }
                let interval = self.socket.isConnected
                    ? self.connectedPollInterval
                    : self.disconnectedPollInterval
                try? await Task.sleep(for: interval)
                guard !Task.isCancelled else { return }
                await self.load(showLoading: false)
            }
        }
    }

    /// The socket relays; it never persists. Every event triggers a
    /// refetch rather than being applied to the array directly, so there
    /// is one source of truth for what a thread contains.
    private func subscribeToSocket() {
        guard socketToken == nil else { return }
        socketToken = socket.subscribe { [weak self] event in
            guard let self else { return }
            switch event.name {
            case "receive-group-message", "message-deleted", "message-edited":
                // The relay carries a conversationId; a message for a
                // different group must not refetch this one.
                guard self.concernsThisConversation(event.data) else { return }
                Task { await self.load(showLoading: false) }
            default:
                break
            }
        }
    }

    private struct GroupRelay: Decodable {
        let conversationId: String?
    }

    /// `true` when the event names this conversation, or names none at
    /// all - an event with no conversationId is from the 1:1 relay and
    /// is not ours.
    private func concernsThisConversation(_ data: Data) -> Bool {
        guard let relay = try? JSONDecoder().decode(GroupRelay.self, from: data),
              let id = relay.conversationId
        else { return false }
        return id == conversationId
    }

    // MARK: - Loading

    private func loadDetail() async {
        do {
            detail = try await repository.detail(id: conversationId)
        } catch ApiError.cancelled {
            return
        } catch {
            // The thread is readable without the member list; a failed
            // detail fetch should not empty a loaded conversation.
            if detail == nil, messages.isEmpty {
                errorMessage = (error as? ApiError)?.userFacingMessage
            }
        }
    }

    /// Fetching also advances this member's `lastReadAt` server-side, so
    /// opening the thread IS what clears its unread count - and with it
    /// the share of the Messages badge this group contributes.
    private func load(showLoading: Bool) async {
        if showLoading { phase = .loading }
        do {
            let coverage = max(pageSize, min(messages.count, 100))
            let page = try await repository.messages(
                id: conversationId,
                before: nil,
                limit: coverage
            )
            guard !Task.isCancelled else { return }
            merge(newestPage: page)
            phase = .loaded
        } catch ApiError.cancelled {
            return
        } catch {
            if messages.isEmpty {
                phase = .failed(error as? ApiError ?? .transport(underlying: "\(error)"))
            }
        }
    }

    /// Folds a freshly fetched newest page into what is already held.
    ///
    /// Identical reasoning to the 1:1 thread: a refresh cannot simply
    /// assign, because once someone has paged back the array reaches
    /// further than any newest-page request returns, and assigning would
    /// throw that history away under them mid-scroll.
    private func merge(newestPage page: GroupMessagesPage) {
        guard let oldestInPage = page.items.first else {
            messages = []
            olderCursor = nil
            hasPagedBack = false
            return
        }

        let boundary = (oldestInPage.createdAt, oldestInPage.id)
        let pageIds = Set(page.items.map(\.id))
        let older = messages.filter { message in
            !pageIds.contains(message.id) && (message.createdAt, message.id) < boundary
        }

        let merged = older + page.items
        if merged != messages { messages = merged }

        if !hasPagedBack { olderCursor = page.nextCursor }
    }

    func loadOlder() async {
        guard let cursor = olderCursor, !isLoadingOlder else { return }
        isLoadingOlder = true
        hasPagedBack = true
        defer { isLoadingOlder = false }

        do {
            let page = try await repository.messages(
                id: conversationId,
                before: cursor,
                limit: pageSize
            )
            guard !Task.isCancelled else { return }
            // A message sent between the two requests can appear in both
            // pages; a duplicate row in a chat is both visible and wrong.
            let known = Set(messages.map(\.id))
            messages = page.items.filter { !known.contains($0.id) } + messages
            olderCursor = page.nextCursor
        } catch ApiError.cancelled {
            return
        } catch let error as ApiError {
            errorMessage = error.userFacingMessage
        } catch {
            errorMessage = L10n.string(.authErrTryAgain)
        }
    }

    // MARK: - Sending

    var canSend: Bool {
        !draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }

    func send() async {
        let content = draft.trimmingCharacters(in: .whitespacesAndNewlines)
        guard canSend, !isSending else { return }
        isSending = true
        defer { isSending = false }

        do {
            let sent = try await repository.send(
                id: conversationId,
                content: content,
                imageUrl: nil
            )
            if !messages.contains(where: { $0.id == sent.id }) {
                messages.append(sent)
            }
            draft = ""

            // A courtesy to everyone else in the group: the REST route
            // above already stored the message, and this only makes it
            // appear in their open threads now rather than at their next
            // poll. Nothing here is authoritative - the server relays
            // the row it wrote, never this payload's contents, and
            // re-checks that this sender really owns that message in
            // that conversation.
            socket.emit(
                "send-group-message",
                ["conversationId": conversationId, "messageId": sent.id]
            )
        } catch let error as ApiError {
            // The route refuses an over-long message and a blocked
            // participant with its own wording; it says it better than
            // this client could.
            errorMessage = error.userFacingMessage
        } catch {
            errorMessage = L10n.string(.authErrTryAgain)
        }
    }

    /// Removing yourself. The same route removes another member, but
    /// only for an OWNER - see
    /// `ConversationsRepository.removeParticipant`.
    func leave() async -> Bool {
        guard let viewerId else { return false }
        do {
            try await repository.removeParticipant(id: conversationId, userId: viewerId)
            return true
        } catch let error as ApiError {
            errorMessage = error.userFacingMessage
            return false
        } catch {
            errorMessage = L10n.string(.authErrTryAgain)
            return false
        }
    }

    // MARK: - Managing the group

    /// Replaces the held detail with what the route answered.
    ///
    /// Every management call returns the whole conversation with its
    /// participants, so the screen re-renders from the server's copy
    /// rather than from a guess about what the edit did. That is what
    /// keeps the member list, the title and the avatar from drifting
    /// apart after a partial failure.
    private func apply(_ updated: GroupConversationDetail) {
        detail = updated
    }

    /// Rename - OWNER only, refused with a 403 otherwise.
    ///
    /// The empty and over-long checks exist on the route too; mirroring
    /// them here stops someone being told "no" after a round trip for a
    /// rule the screen already knew.
    func rename(to newName: String) async -> Bool {
        let trimmed = newName.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty, trimmed.count <= Self.maxNameLength else { return false }
        guard viewerRole == .owner else { return false }

        do {
            apply(try await repository.update(id: conversationId, name: trimmed, avatarUrl: nil))
            return true
        } catch let error as ApiError {
            errorMessage = error.userFacingMessage
            return false
        } catch {
            errorMessage = L10n.string(.authErrTryAgain)
            return false
        }
    }

    /// Sets or clears the group picture - OWNER only.
    ///
    /// `.some(url)` sets it and `.some(nil)` clears it; the repository's
    /// double optional is what keeps those two distinguishable from
    /// "don't touch the avatar". Passing a URL that did not come from
    /// ZRP's own upload storage is refused server-side, which is why the
    /// caller uploads first and sends back what the uploader returned.
    func setAvatar(_ url: String?) async -> Bool {
        guard viewerRole == .owner else { return false }
        do {
            apply(try await repository.update(id: conversationId, name: nil, avatarUrl: .some(url)))
            return true
        } catch let error as ApiError {
            errorMessage = error.userFacingMessage
            return false
        } catch {
            errorMessage = L10n.string(.authErrTryAgain)
            return false
        }
    }

    /// Adds members. Available to **any** member, not just the owner -
    /// that is the route's rule, not a relaxation of it.
    func addMembers(_ userIds: [String]) async -> Bool {
        guard !userIds.isEmpty else { return false }
        do {
            apply(try await repository.addParticipants(id: conversationId, participantIds: userIds))
            return true
        } catch let error as ApiError {
            errorMessage = error.userFacingMessage
            return false
        } catch {
            errorMessage = L10n.string(.authErrTryAgain)
            return false
        }
    }

    /// Removes somebody else - OWNER only.
    ///
    /// Deliberately refuses to remove the viewer: leaving is its own
    /// action with its own confirmation, and routing it through here
    /// would drop someone out of a thread they are still looking at
    /// without the navigation that leaving performs.
    func removeMember(_ userId: String) async -> Bool {
        guard viewerRole == .owner, userId != viewerId else { return false }
        do {
            try await repository.removeParticipant(id: conversationId, userId: userId)
            await loadDetail()
            return true
        } catch let error as ApiError {
            errorMessage = error.userFacingMessage
            return false
        } catch {
            errorMessage = L10n.string(.authErrTryAgain)
            return false
        }
    }

    /// Ids already in the group, so the member picker can exclude them
    /// before the route has to.
    var participantIds: Set<String> {
        Set(detail?.participants.map(\.userId) ?? [])
    }

    static let maxNameLength = 100
    static let maxParticipants = 100
}

/// A group thread.
///
/// Structurally the 1:1 conversation screen, minus what the group route
/// does not support: no reactions, no replies, no edit, no per-message
/// read receipts. `GROUP_MESSAGE_INCLUDE` attaches only `sender`, and
/// there is no route to act on a group message beyond deleting your own
/// - so none of those controls appear rather than appearing inert.
struct GroupConversationView: View {

    @StateObject private var viewModel: GroupConversationViewModel
    @EnvironmentObject private var navigator: Navigator
    @FocusState private var isComposerFocused: Bool
    @State private var showingInfo = false
    @State private var confirmingLeave = false

    init(conversationId: String, viewerId: String?) {
        _viewModel = StateObject(
            wrappedValue: GroupConversationViewModel(
                conversationId: conversationId,
                viewerId: viewerId
            )
        )
    }

    var body: some View {
        VStack(spacing: 0) {
            switch viewModel.phase {
            case .loading:
                TimelineStateView.loading()
            case .failed(let error):
                TimelineStateView.error(error) { Task { await viewModel.start() } }
            case .loaded:
                thread
            }
            composer
        }
        .background(ZrpColor.background.ignoresSafeArea())
        .navigationTitle(Text(verbatim: viewModel.title))
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button { showingInfo = true } label: {
                    Image(systemName: "info.circle")
                }
                .accessibilityLabel(Text(.groupThreadInfo))
            }
        }
        .sheet(isPresented: $showingInfo) {
            GroupManageSheet(
                viewModel: viewModel,
                onLeave: { confirmingLeave = true }
            )
        }
        .confirmationDialog(
            Text(.groupInfoLeave),
            isPresented: $confirmingLeave,
            titleVisibility: .visible
        ) {
            Button(role: .destructive) {
                Task {
                    showingInfo = false
                    if await viewModel.leave() { navigator.pop() }
                }
            } label: {
                Text(.groupInfoLeave)
            }
            Button(role: .cancel) {} label: { Text(.actionCancel) }
        } message: {
            Text(.groupInfoLeaveConfirm)
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
        .task { await viewModel.start() }
        .onDisappear { viewModel.stop() }
    }

    private var thread: some View {
        ScrollViewReader { proxy in
            ScrollView {
                LazyVStack(spacing: ZrpSpacing.sm) {
                    loadOlderControl(proxy)

                    ForEach(viewModel.messages) { message in
                        GroupMessageBubble(
                            message: message,
                            isOwn: viewModel.isOwn(message)
                        )
                        .id(message.id)
                    }
                }
                .padding(.horizontal, ZrpSpacing.md)
                .padding(.vertical, ZrpSpacing.md)
                .frame(maxWidth: ZrpMetrics.contentMaxWidth)
                .frame(maxWidth: .infinity)
            }
            .scrollDismissesKeyboard(.interactively)
            // Keyed on the newest message's identity, not the count:
            // prepending history changes the count, and scrolling to the
            // bottom for it would throw the reader straight back out of
            // the history they just asked for.
            .onChange(of: viewModel.messages.last?.id) { _, _ in
                guard let last = viewModel.messages.last else { return }
                withAnimation(.easeOut(duration: 0.2)) {
                    proxy.scrollTo(last.id, anchor: .bottom)
                }
            }
            .onAppear {
                guard let last = viewModel.messages.last else { return }
                proxy.scrollTo(last.id, anchor: .bottom)
            }
        }
    }

    @ViewBuilder
    private func loadOlderControl(_ proxy: ScrollViewProxy) -> some View {
        if viewModel.isLoadingOlder {
            HStack(spacing: ZrpSpacing.sm) {
                ProgressView()
                Text(.feedLoadingMore)
                    .font(.footnote)
                    .foregroundStyle(ZrpColor.onSurfaceMuted)
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, ZrpSpacing.sm)
        } else if viewModel.canLoadOlder {
            Button {
                let anchor = viewModel.messages.first?.id
                Task {
                    await viewModel.loadOlder()
                    guard let anchor else { return }
                    proxy.scrollTo(anchor, anchor: .top)
                }
            } label: {
                Text(.feedLoadMore)
                    .font(.footnote.weight(.medium))
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, ZrpSpacing.sm)
            }
            .buttonStyle(.plain)
            .foregroundStyle(ZrpColor.red)
        }
    }

    private var composer: some View {
        HStack(alignment: .bottom, spacing: ZrpSpacing.sm) {
            TextField(
                text: $viewModel.draft,
                prompt: Text(.iosChatMessagePlaceholder),
                axis: .vertical,
                label: { Text(.iosChatMessagePlaceholder) }
            )
            .labelsHidden()
            .lineLimit(1...5)
            .focused($isComposerFocused)
            .padding(.horizontal, ZrpSpacing.md)
            .padding(.vertical, ZrpSpacing.sm)
            .background(ZrpColor.surfaceElevated)
            .clipShape(RoundedRectangle(cornerRadius: ZrpRadius.lg))

            Button {
                Task { await viewModel.send() }
            } label: {
                Image(systemName: "arrow.up.circle.fill")
                    .font(.title2)
                    .frame(
                        width: ZrpMetrics.minTouchTarget,
                        height: ZrpMetrics.minTouchTarget
                    )
            }
            .buttonStyle(.plain)
            .foregroundStyle(viewModel.canSend ? ZrpColor.red : ZrpColor.onSurfaceMuted)
            .disabled(!viewModel.canSend || viewModel.isSending)
            .accessibilityLabel(Text(.iosA11ySendMessage))
        }
        .padding(.horizontal, ZrpSpacing.md)
        .padding(.vertical, ZrpSpacing.sm)
        .background(ZrpColor.surface)
        .overlay(alignment: .top) {
            Rectangle().fill(ZrpColor.outline).frame(height: 1)
        }
    }
}

/// One message in a group thread.
///
/// Shows the sender's name above anyone else's message - in a group,
/// "who said this" is information the bubble has to carry. Own messages
/// do not repeat it, matching how every group chat behaves.
private struct GroupMessageBubble: View {

    let message: GroupMessage
    let isOwn: Bool

    var body: some View {
        HStack {
            if isOwn { Spacer(minLength: ZrpSpacing.xxl) }

            VStack(alignment: isOwn ? .trailing : .leading, spacing: 2) {
                if !isOwn, let name = message.sender?.displayName, !name.isEmpty {
                    Text(verbatim: name)
                        .font(.caption2.weight(.semibold))
                        .foregroundStyle(ZrpColor.onSurfaceMuted)
                }

                if let imageUrl = message.imageUrl, !imageUrl.isEmpty {
                    MediaGalleryView(imageURLs: [imageUrl], isVideo: false)
                        .frame(maxWidth: 240)
                }

                if !message.content.isEmpty {
                    Text(verbatim: message.content)
                        .font(.subheadline)
                        .foregroundStyle(isOwn ? .white : ZrpColor.onSurface)
                        .padding(.horizontal, ZrpSpacing.md)
                        .padding(.vertical, ZrpSpacing.sm)
                        .background(isOwn ? ZrpColor.red : ZrpColor.surfaceElevated)
                        .clipShape(RoundedRectangle(cornerRadius: ZrpRadius.lg))
                        .fixedSize(horizontal: false, vertical: true)
                }

                Text(verbatim: RelativeTime.compact(from: message.createdAt))
                    .font(.caption2)
                    .foregroundStyle(ZrpColor.onSurfaceMuted)
            }
            // Read as one unit: sender, message, time - rather than
            // three separate stops for VoiceOver on every bubble.
            .accessibilityElement(children: .combine)

            if !isOwn { Spacer(minLength: ZrpSpacing.xxl) }
        }
    }
}
