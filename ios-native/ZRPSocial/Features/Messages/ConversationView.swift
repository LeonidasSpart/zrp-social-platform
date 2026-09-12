import PhotosUI
import SwiftUI
import UIKit

/// One direct-message thread.
struct ConversationView: View {

    @EnvironmentObject private var session: SessionController
    @StateObject private var viewModel: ConversationViewModel

    @FocusState private var isComposerFocused: Bool
    @State private var pickerSelection: [PhotosPickerItem] = []
    @StateObject private var voiceRecorder = VoiceRecorder()
    @State private var editing: Message?
    @State private var editDraft = ""

    /// The reaction set the message route accepts. Any emoji is valid
    /// server-side; this is the quick palette, matching what the web
    /// chat offers.
    private let quickReactions = ["👍", "❤️", "😂", "😮", "😢", "🙏"]

    @State private var isShowingContact = false

    init(partner: PostAuthor, viewerId: String?, initialDraft: String = "") {
        _viewModel = StateObject(
            wrappedValue: ConversationViewModel(
                partner: partner,
                viewerId: viewerId,
                initialDraft: initialDraft
            )
        )
    }

    var body: some View {
        content
            .background(ZrpColor.background.ignoresSafeArea())
            .navigationTitle(Text(verbatim: viewModel.partner.displayName))
            .navigationBarTitleDisplayMode(.inline)
            .safeAreaInset(edge: .bottom) { composer }
            // The server's own `user-typing` relay, not a local guess.
            .overlay(alignment: .top) { typingIndicator }
            .onChange(of: viewModel.draft) { _, text in
                guard !text.isEmpty else { return }
                viewModel.reportTyping()
            }
            .onChange(of: pickerSelection) { _, items in
                guard !items.isEmpty else { return }
                Task { await loadPickedImage(items) }
            }
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button { isShowingContact = true } label: {
                        AvatarView(
                            url: viewModel.partner.avatarUrl,
                            displayName: viewModel.partner.displayName,
                            size: 28
                        )
                    }
                    .accessibilityLabel(
                        Text(.iosA11yOpenProfile, ["name": viewModel.partner.displayName])
                    )
                }
            }
            .sheet(isPresented: $isShowingContact) {
                ChatContactSheet(partner: viewModel.partner, messages: viewModel.messages)
            }
            .task { await viewModel.start() }
            .onDisappear {
                viewModel.stop()
                // A half-finished recording is deleted rather than
                // left in temporary storage with the microphone
                // indicator still lit, and a note playing in a thread
                // nobody is looking at is stopped.
                voiceRecorder.discardIfRecording()
                VoiceNotePlayer.shared.stop()
            }
            .sheet(item: $editing) { message in
                editSheet(for: message)
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
            TimelineStateView.error(error) {
                Task { await viewModel.start() }
            }
        case .loaded:
            thread
        }
    }

    private var thread: some View {
        ScrollViewReader { proxy in
            ScrollView {
                LazyVStack(spacing: ZrpSpacing.sm) {
                    loadOlderControl(proxy)

                    ForEach(viewModel.messages) { message in
                        MessageBubble(
                            message: message,
                            isOwn: viewModel.isOwn(message),
                            quickReactions: quickReactions,
                            onReply: {
                                viewModel.replyTarget = message
                                isComposerFocused = true
                            },
                            onEdit: {
                                editDraft = message.content
                                editing = message
                            },
                            onDelete: { Task { await viewModel.delete(message) } },
                            onReact: { emoji in
                                Task { await viewModel.react(to: message, emoji: emoji) }
                            }
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
            .onChange(of: viewModel.messages.last?.id) { _, _ in
                // The thread arrives oldest-first, so the newest message
                // is the one worth showing on arrival and after sending.
                //
                // Keyed on the last message's identity rather than on
                // the count, which is what makes "load older" usable at
                // all: prepending history changes the count but not the
                // newest message, and scrolling to the bottom for it
                // would throw the reader straight back out of the
                // history they just asked for.
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

    /// "Load more" at the top of the thread, shown only when the route
    /// says there is older history to fetch.
    ///
    /// Reuses the feed's own `feed.loadMore` / `feed.loadingMore`
    /// wording, which is already translated into all eleven languages -
    /// a chat-specific key would mean the same sentence in English only.
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
                // The message currently at the top, captured before the
                // fetch. Older messages are prepended above it, which
                // in a bottom-anchored scroll view would otherwise
                // shove the reader's position down by the height of
                // everything just inserted. Scrolling back to it puts
                // the row they were looking at exactly where it was.
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

    @ViewBuilder
    private var typingIndicator: some View {
        if viewModel.partnerIsTyping {
            Text(.chatTyping)
                .font(.caption)
                .foregroundStyle(ZrpColor.onSurfaceMuted)
                .padding(.horizontal, ZrpSpacing.md)
                .padding(.vertical, ZrpSpacing.xs)
                .background(ZrpColor.surfaceElevated, in: Capsule())
                .padding(.top, ZrpSpacing.sm)
                .transition(.opacity)
                .animation(.easeInOut(duration: 0.15), value: viewModel.partnerIsTyping)
        }
    }

    private var composer: some View {
        VStack(spacing: 0) {
            if let target = viewModel.replyTarget {
                HStack(spacing: ZrpSpacing.sm) {
                    Text(.iosChatReplyingTo, [
                        "name": target.sender?.displayName ?? viewModel.partner.displayName,
                    ])
                    .font(.caption)
                    .foregroundStyle(ZrpColor.onSurfaceMuted)
                    .lineLimit(1)
                    Spacer(minLength: 0)
                    Button { viewModel.replyTarget = nil } label: {
                        Image(systemName: "xmark.circle.fill")
                            .foregroundStyle(ZrpColor.onSurfaceMuted)
                    }
                    .accessibilityLabel(Text(.iosCommentCancelReply))
                }
                .padding(.horizontal, ZrpSpacing.lg)
                .padding(.top, ZrpSpacing.sm)
            }

            if let pending = viewModel.pendingImage {
                pendingImageRow(pending)
            }

            // The pending-image row shows its own progress; this is for
            // the attachments that send immediately and so never get one.
            if let progress = viewModel.uploadProgress, viewModel.pendingImage == nil {
                ProgressView(value: progress)
                    .tint(ZrpColor.red)
                    .padding(.horizontal, ZrpSpacing.lg)
                    .accessibilityLabel(Text(.composerUploading))
            }

            if voiceRecorder.isRecording {
                VoiceNoteComposer(
                    recorder: voiceRecorder,
                    onRecorded: { attachment in
                        Task { await viewModel.send(attachment: attachment) }
                    },
                    isBusy: viewModel.isSending
                )
                .padding(.horizontal, ZrpSpacing.lg)
                .padding(.vertical, ZrpSpacing.sm)
            } else {
                HStack(alignment: .bottom, spacing: ZrpSpacing.md) {
                    // One picture per message: the route stores a single
                    // `imageUrl`, so offering a multi-select would promise
                    // something it cannot keep.
                    PhotosPicker(
                        selection: $pickerSelection,
                        maxSelectionCount: 1,
                        matching: .images
                    ) {
                        Image(systemName: "photo")
                            .font(.title3)
                            .foregroundStyle(ZrpColor.onSurfaceMuted)
                            .frame(width: ZrpMetrics.minTouchTarget, height: ZrpMetrics.minTouchTarget)
                            .contentShape(Rectangle())
                    }
                    .disabled(viewModel.isSending)
                    .accessibilityLabel(Text(.iosA11yAddPhoto))

                    ChatAttachmentMenu(
                        onPick: { attachment in
                            Task { await viewModel.send(attachment: attachment) }
                        },
                        isBusy: viewModel.isSending
                    )

                    VoiceNoteComposer(
                        recorder: voiceRecorder,
                        onRecorded: { attachment in
                            Task { await viewModel.send(attachment: attachment) }
                        },
                        isBusy: viewModel.isSending
                    )

                    TextField(
                        L10n.string(.iosChatMessagePlaceholder),
                        text: $viewModel.draft,
                        axis: .vertical
                    )
                    .focused($isComposerFocused)
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
                            Image(systemName: "arrow.up.circle.fill")
                                .font(.title2)
                                .frame(width: ZrpMetrics.minTouchTarget, height: ZrpMetrics.minTouchTarget)
                        }
                    }
                    .disabled(viewModel.isSending || !viewModel.canSend)
                    .accessibilityLabel(Text(.iosA11ySendMessage))
                }
                .padding(.horizontal, ZrpSpacing.lg)
                .padding(.vertical, ZrpSpacing.sm)
            }
        }
        .background(.bar)
    }

    /// The chosen picture, before it is sent.
    ///
    /// Shown from the local file rather than uploaded on selection, so
    /// changing your mind costs nothing and puts nothing on UploadThing.
    /// Progress appears here once sending starts.
    private func pendingImageRow(_ media: PickedMedia) -> some View {
        HStack(spacing: ZrpSpacing.md) {
            AttachmentThumbnail(fileURL: media.url, remoteURL: nil, isVideo: false, side: 44)

            if let progress = viewModel.uploadProgress {
                ProgressView(value: progress)
                    .tint(ZrpColor.red)
            } else {
                Text(verbatim: media.fileName)
                    .font(.caption)
                    .foregroundStyle(ZrpColor.onSurfaceMuted)
                    .lineLimit(1)
            }

            Spacer(minLength: 0)

            Button {
                viewModel.pendingImage?.discard()
                viewModel.pendingImage = nil
            } label: {
                Image(systemName: "xmark.circle.fill")
                    .foregroundStyle(ZrpColor.onSurfaceMuted)
                    .frame(width: ZrpMetrics.minTouchTarget, height: ZrpMetrics.minTouchTarget)
                    .contentShape(Rectangle())
            }
            .disabled(viewModel.isSending)
            .accessibilityLabel(Text(.iosA11yRemoveAttachment))
        }
        .padding(.horizontal, ZrpSpacing.lg)
        .padding(.top, ZrpSpacing.sm)
    }

    /// Copies the chosen file out of the picker's short-lived sandbox,
    /// which `PickedMedia` does as part of loading, so the upload can
    /// still read it when send is pressed.
    private func loadPickedImage(_ items: [PhotosPickerItem]) async {
        defer { pickerSelection = [] }
        guard let item = items.first else { return }
        guard let media = try? await item.loadTransferable(type: PickedMedia.self) else { return }
        viewModel.pendingImage?.discard()
        viewModel.pendingImage = media
    }

    private func editSheet(for message: Message) -> some View {
        NavigationStack {
            VStack(alignment: .leading, spacing: ZrpSpacing.lg) {
                TextField(
                    L10n.string(.iosChatMessagePlaceholder),
                    text: $editDraft,
                    axis: .vertical
                )
                .font(.body)
                .lineLimit(3...10)
                .padding(ZrpSpacing.md)
                .background(ZrpColor.surfaceElevated)
                .clipShape(RoundedRectangle(cornerRadius: ZrpRadius.md, style: .continuous))
                Spacer()
            }
            .padding(ZrpSpacing.lg)
            .background(ZrpColor.background.ignoresSafeArea())
            .navigationTitle(Text(.iosChatEditMessage))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button { editing = nil } label: { Text(.actionCancel) }
                }
                ToolbarItem(placement: .topBarTrailing) {
                    Button {
                        let target = message
                        let content = editDraft
                        editing = nil
                        Task { await viewModel.edit(target, to: content) }
                    } label: {
                        Text(.actionSave).font(.subheadline.weight(.semibold))
                    }
                    .disabled(editDraft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                }
            }
        }
        .presentationDetents([.medium])
    }
}

/// One message bubble, with its reply context and reactions.
private struct MessageBubble: View {

    let message: Message
    let isOwn: Bool
    let quickReactions: [String]

    var onReply: () -> Void
    var onEdit: () -> Void
    var onDelete: () -> Void
    var onReact: (String) -> Void

    @State private var isConfirmingDelete = false

    var body: some View {
        HStack {
            if isOwn { Spacer(minLength: 40) }

            VStack(alignment: isOwn ? .trailing : .leading, spacing: ZrpSpacing.xs) {
                if let replyTo = message.replyTo {
                    replyContext(replyTo)
                }

                bubble

                if let reactions = message.reactions, !reactions.isEmpty {
                    reactionRow(reactions)
                }

                footer
            }

            if !isOwn { Spacer(minLength: 40) }
        }
        .confirmationDialog(
            Text(.chatDeleteMessage),
            isPresented: $isConfirmingDelete,
            titleVisibility: .visible
        ) {
            Button(role: .destructive) { onDelete() } label: { Text(.actionDelete) }
            Button(role: .cancel) {} label: { Text(.actionCancel) }
        } message: {
            Text(.chatDeleteMessageConfirm)
        }
    }

    private var bubble: some View {
        VStack(alignment: .leading, spacing: ZrpSpacing.sm) {
            // The route accepts a picture with no text at all, so the
            // text line is drawn only when there is text - otherwise a
            // picture-only message would carry an empty caption strip.
            if let imageUrl = message.imageUrl, !imageUrl.isEmpty {
                ChatAttachmentView(url: imageUrl, content: message.content, isOwn: isOwn)
            }
            // A marker IS the attachment's own label, so echoing it as a
            // caption underneath would print "📎 report.pdf" below the
            // file card that already says so.
            if !message.content.isEmpty,
               ChatAttachmentKind.of(message.content) == .image
                   || message.imageUrl?.isEmpty != false {
                Text(verbatim: message.content)
                    .font(.subheadline)
                    .foregroundStyle(isOwn ? .white : ZrpColor.onSurface)
            }
        }
            .padding(.horizontal, ZrpSpacing.md)
            .padding(.vertical, ZrpSpacing.sm)
            .background(isOwn ? ZrpColor.red : ZrpColor.surfaceElevated)
            .clipShape(RoundedRectangle(cornerRadius: ZrpRadius.lg, style: .continuous))
            .contextMenu {
                Button(action: onReply) {
                    Label { Text(.iosChatReply) } icon: { Image(systemName: "arrowshape.turn.up.left") }
                }
                ForEach(quickReactions, id: \.self) { emoji in
                    Button { onReact(emoji) } label: { Text(verbatim: emoji) }
                }
                if isOwn {
                    // Editing and deleting are sender-only, enforced
                    // server-side with a 403; this only hides what the
                    // backend would refuse anyway.
                    Button(action: onEdit) {
                        Label { Text(.actionEdit) } icon: { Image(systemName: "pencil") }
                    }
                    Button(role: .destructive) {
                        isConfirmingDelete = true
                    } label: {
                        Label { Text(.actionDelete) } icon: { Image(systemName: "trash") }
                    }
                }
            }
            .accessibilityElement(children: .ignore)
            .accessibilityLabel(Text(verbatim: accessibleBody))
            .accessibilityHint(Text(.iosA11yMessageOptions))
    }

    /// What VoiceOver reads for the bubble.
    ///
    /// A message may legitimately have no text at all - the route
    /// accepts a picture alone - and reading an empty string would leave
    /// the bubble silent.
    private var accessibleBody: String {
        guard message.imageUrl?.isEmpty == false else { return message.content }

        // Each attachment kind announces itself. Reading "Photo" for a
        // voice note or a PDF is worse than saying nothing, because it
        // describes something that is not there.
        switch ChatAttachmentKind.of(message.content) {
        case .voice:
            let duration = ChatAttachmentMarker.voiceDuration(from: message.content)
            return [L10n.string(.chatRecordVoiceMessage), duration]
                .compactMap { $0 }
                .joined(separator: ", ")
        case .document:
            let name = ChatAttachmentMarker.documentName(from: message.content)
            return [L10n.string(.chatAttachment), name]
                .compactMap { $0 }
                .joined(separator: ", ")
        case .video:
            return L10n.string(.iosA11yPlayVideo)
        case .image:
            let photo = L10n.string(.iosA11yMessagePhoto)
            return message.content.isEmpty ? photo : "\(photo). \(message.content)"
        }
    }

    private func replyContext(_ replyTo: RepliedMessage) -> some View {
        HStack(spacing: ZrpSpacing.xs) {
            Rectangle()
                .fill(ZrpColor.outline)
                .frame(width: 2)
            VStack(alignment: .leading, spacing: 0) {
                if let name = replyTo.sender?.displayName {
                    Text(verbatim: name)
                        .font(.caption2.weight(.semibold))
                        .foregroundStyle(ZrpColor.onSurfaceMuted)
                }
                Text(verbatim: replyTo.content)
                    .font(.caption2)
                    .foregroundStyle(ZrpColor.onSurfaceMuted)
                    .lineLimit(2)
            }
        }
        .padding(.horizontal, ZrpSpacing.sm)
        .frame(maxWidth: 260, alignment: .leading)
    }

    private func reactionRow(_ reactions: [MessageReaction]) -> some View {
        HStack(spacing: ZrpSpacing.xs) {
            // Grouped by emoji with a count - the route allows one
            // reaction per person, so the count is the number of people.
            ForEach(grouped(reactions), id: \.emoji) { entry in
                HStack(spacing: 2) {
                    Text(verbatim: entry.emoji).font(.caption2)
                    if entry.count > 1 {
                        Text(verbatim: "\(entry.count)")
                            .font(.caption2)
                            .monospacedDigit()
                            .foregroundStyle(ZrpColor.onSurfaceMuted)
                    }
                }
                .padding(.horizontal, ZrpSpacing.sm)
                .padding(.vertical, 2)
                .background(ZrpColor.surfaceHighest)
                .clipShape(Capsule())
            }
        }
    }

    private struct ReactionGroup {
        let emoji: String
        let count: Int
    }

    private func grouped(_ reactions: [MessageReaction]) -> [ReactionGroup] {
        var order: [String] = []
        var counts: [String: Int] = [:]
        for reaction in reactions {
            if counts[reaction.emoji] == nil { order.append(reaction.emoji) }
            counts[reaction.emoji, default: 0] += 1
        }
        return order.map { ReactionGroup(emoji: $0, count: counts[$0] ?? 0) }
    }

    private var footer: some View {
        HStack(spacing: ZrpSpacing.xs) {
            Text(verbatim: RelativeTime.compact(from: message.createdAt))
                .font(.caption2)
                .foregroundStyle(ZrpColor.onSurfaceMuted)
            if message.edited {
                Text(.iosChatEdited)
                    .font(.caption2)
                    .foregroundStyle(ZrpColor.onSurfaceMuted)
            }
            if isOwn && message.read {
                // A read receipt, from the row's own `read` flag - set by
                // the recipient opening the thread, which is what that
                // route does as a side effect.
                Image(systemName: "checkmark.circle.fill")
                    .font(.caption2)
                    .foregroundStyle(ZrpColor.blue)
            }
        }
        .accessibilityElement(children: .combine)
    }
}
