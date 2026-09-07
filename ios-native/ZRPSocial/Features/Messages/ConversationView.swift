import SwiftUI
import UIKit

/// One direct-message thread.
struct ConversationView: View {

    @EnvironmentObject private var session: SessionController
    @StateObject private var viewModel: ConversationViewModel

    @FocusState private var isComposerFocused: Bool
    @State private var editing: Message?
    @State private var editDraft = ""

    /// The reaction set the message route accepts. Any emoji is valid
    /// server-side; this is the quick palette, matching what the web
    /// chat offers.
    private let quickReactions = ["👍", "❤️", "😂", "😮", "😢", "🙏"]

    init(partner: PostAuthor, viewerId: String?) {
        _viewModel = StateObject(
            wrappedValue: ConversationViewModel(partner: partner, viewerId: viewerId)
        )
    }

    var body: some View {
        content
            .background(ZrpColor.background.ignoresSafeArea())
            .navigationTitle(Text(verbatim: viewModel.partner.displayName))
            .navigationBarTitleDisplayMode(.inline)
            .safeAreaInset(edge: .bottom) { composer }
            .task { await viewModel.start() }
            .onDisappear { viewModel.stop() }
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
            .onChange(of: viewModel.messages.count) { _, _ in
                // The thread arrives oldest-first, so the newest message
                // is the one worth showing on arrival and after sending.
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

            HStack(alignment: .bottom, spacing: ZrpSpacing.md) {
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
                .disabled(
                    viewModel.isSending
                        || viewModel.draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
                )
                .accessibilityLabel(Text(.iosA11ySendMessage))
            }
            .padding(.horizontal, ZrpSpacing.lg)
            .padding(.vertical, ZrpSpacing.sm)
        }
        .background(.bar)
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
        Text(verbatim: message.content)
            .font(.subheadline)
            .foregroundStyle(isOwn ? .white : ZrpColor.onSurface)
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
            .accessibilityLabel(Text(verbatim: message.content))
            .accessibilityHint(Text(.iosA11yMessageOptions))
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
