import SwiftUI

/// The live chat panel - drawn *over* the room (the camera stage on Live
/// Video, the speaker grid on Live Audio), never as a full-screen
/// takeover, so the room stays visible while people talk.
///
/// Moderation is shown only to people the server will actually let use
/// it: Delete for the message's own author or a host/moderator
/// (`deleteMessage`'s own rule), chat-mute for a host/moderator acting on
/// someone else. Everyone else sees no control at all - not a disabled
/// one.
struct LiveChatOverlay: View {

    enum Style {
        /// Light text on translucent dark chips, legible over video.
        case overVideo
        /// The app's ordinary surface colours, over the audio grid.
        case overSurface
    }

    @ObservedObject var engagement: LiveEngagementViewModel
    let style: Style

    @State private var pendingDelete: LiveChatMessage?
    @FocusState private var composerFocused: Bool

    var body: some View {
        VStack(alignment: .leading, spacing: ZrpSpacing.xs) {
            messageArea
            if let error = engagement.chatError {
                errorRow(error)
            }
            statusLine
            composer
        }
        .confirmationDialog(
            Text(.chatDeleteMessageConfirm),
            isPresented: Binding(get: { pendingDelete != nil }, set: { if !$0 { pendingDelete = nil } }),
            titleVisibility: .visible
        ) {
            Button(role: .destructive) {
                if let message = pendingDelete { engagement.deleteMessage(message) }
                pendingDelete = nil
            } label: {
                Text(.chatDeleteMessage)
            }
        }
    }

    // MARK: - Colours

    private var primaryText: Color { style == .overVideo ? .white : ZrpColor.onSurface }
    private var secondaryText: Color { style == .overVideo ? Color.white.opacity(0.8) : ZrpColor.onSurfaceMuted }
    private var chipBackground: Color { style == .overVideo ? Color.black.opacity(0.45) : ZrpColor.surfaceElevated }

    // MARK: - Messages

    @ViewBuilder
    private var messageArea: some View {
        switch engagement.chatPhase {
        case .idle, .loading:
            HStack {
                ProgressView().tint(style == .overVideo ? .white : ZrpColor.red)
                Spacer()
            }
            .frame(maxHeight: .infinity, alignment: .bottom)
        case .failed(let message):
            VStack(alignment: .leading, spacing: ZrpSpacing.xs) {
                Text(verbatim: message)
                    .font(.footnote)
                    .foregroundStyle(secondaryText)
                Button {
                    Task { await engagement.loadChat() }
                } label: {
                    Text(.actionRetry)
                        .font(.footnote.weight(.semibold))
                        .frame(minHeight: ZrpMetrics.minTouchTarget)
                }
                .tint(style == .overVideo ? .white : ZrpColor.red)
            }
            .frame(maxHeight: .infinity, alignment: .bottom)
        case .loaded:
            if engagement.messages.isEmpty {
                Text(.chatNoMessagesYet)
                    .font(.footnote)
                    .foregroundStyle(secondaryText)
                    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .bottomLeading)
            } else {
                messageList
            }
        }
    }

    private var messageList: some View {
        ScrollViewReader { proxy in
            ScrollView {
                LazyVStack(alignment: .leading, spacing: ZrpSpacing.xs) {
                    if engagement.hasOlderMessages {
                        Button {
                            engagement.loadOlderMessages()
                        } label: {
                            HStack(spacing: ZrpSpacing.xs) {
                                if engagement.isLoadingOlder {
                                    ProgressView().controlSize(.small)
                                }
                                Text(.feedLoadMore)
                                    .font(.caption.weight(.semibold))
                            }
                            .foregroundStyle(secondaryText)
                            .frame(minHeight: ZrpMetrics.minTouchTarget)
                        }
                        .disabled(engagement.isLoadingOlder)
                    }

                    ForEach(engagement.messages) { message in
                        row(message)
                            .id(message.id)
                    }
                }
                .padding(.vertical, ZrpSpacing.xs)
            }
            .scrollIndicators(.hidden)
            .defaultScrollAnchor(.bottom)
            .onChange(of: engagement.messages.last?.id) { _, lastId in
                guard let lastId else { return }
                withAnimation(.easeOut(duration: 0.2)) {
                    proxy.scrollTo(lastId, anchor: .bottom)
                }
            }
        }
    }

    private func row(_ message: LiveChatMessage) -> some View {
        let author = engagement.author(of: message)
        let canDelete = engagement.canDelete(message)
        let canMute = engagement.canChatMute(userId: message.authorId)
        let knownMuted = engagement.knownChatMutes[message.authorId]

        return HStack(alignment: .top, spacing: ZrpSpacing.sm) {
            AvatarView(url: author?.avatarUrl, displayName: author?.displayName ?? "", size: 24)
            VStack(alignment: .leading, spacing: 2) {
                if let author {
                    Text(verbatim: author.displayName)
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(secondaryText)
                        .lineLimit(1)
                }
                Text(verbatim: message.body)
                    .font(.subheadline)
                    .foregroundStyle(primaryText)
                    .fixedSize(horizontal: false, vertical: true)
            }
            Spacer(minLength: 0)
        }
        .padding(.horizontal, ZrpSpacing.sm)
        .padding(.vertical, ZrpSpacing.xs)
        .background(chipBackground, in: RoundedRectangle(cornerRadius: ZrpRadius.md, style: .continuous))
        .contentShape(RoundedRectangle(cornerRadius: ZrpRadius.md, style: .continuous))
        .accessibilityElement(children: .combine)
        .contextMenu {
            if canDelete {
                Button(role: .destructive) {
                    pendingDelete = message
                } label: {
                    Label { Text(.chatDeleteMessage) } icon: { Image(systemName: "trash") }
                }
            }
            if canMute {
                // The detail route does not report chat mutes, so a mute
                // that predates this screen is unknown: offer whichever
                // action is known to apply, or both when it is not.
                if knownMuted != true {
                    Button {
                        engagement.setChatMute(userId: message.authorId, muted: true)
                    } label: {
                        Label { Text(.iosLiveChatMuteUser) } icon: { Image(systemName: "bubble.left.and.exclamationmark.bubble.right") }
                    }
                }
                if knownMuted != false {
                    Button {
                        engagement.setChatMute(userId: message.authorId, muted: false)
                    } label: {
                        Label { Text(.iosLiveChatUnmuteUser) } icon: { Image(systemName: "bubble.left.and.bubble.right") }
                    }
                }
            }
        }
        .accessibilityActions {
            if canDelete {
                Button {
                    pendingDelete = message
                } label: {
                    Text(.chatDeleteMessage)
                }
            }
            if canMute, knownMuted != true {
                Button {
                    engagement.setChatMute(userId: message.authorId, muted: true)
                } label: {
                    Text(.iosLiveChatMuteUser)
                }
            }
            if canMute, knownMuted != false {
                Button {
                    engagement.setChatMute(userId: message.authorId, muted: false)
                } label: {
                    Text(.iosLiveChatUnmuteUser)
                }
            }
        }
    }

    // MARK: - Status

    private func errorRow(_ error: String) -> some View {
        HStack(alignment: .top, spacing: ZrpSpacing.sm) {
            Text(verbatim: error)
                .font(.footnote)
                .foregroundStyle(style == .overVideo ? .white : ZrpColor.red)
                .frame(maxWidth: .infinity, alignment: .leading)
            Button {
                engagement.dismissChatError()
            } label: {
                Image(systemName: "xmark")
                    .font(.caption)
                    .frame(width: ZrpMetrics.minTouchTarget, height: ZrpMetrics.minTouchTarget)
            }
            .foregroundStyle(secondaryText)
            .accessibilityLabel(Text(.chatDismiss))
        }
        .padding(.horizontal, ZrpSpacing.sm)
        .background(
            style == .overVideo ? ZrpColor.darkRed.opacity(0.8) : ZrpColor.surfaceElevated,
            in: RoundedRectangle(cornerRadius: ZrpRadius.md, style: .continuous)
        )
        .accessibilityElement(children: .contain)
        .accessibilityAddTraits(.isStaticText)
    }

    @ViewBuilder
    private var statusLine: some View {
        switch engagement.composerState {
        case .muted:
            Label { Text(.iosLiveErrChatMuted) } icon: { Image(systemName: "speaker.slash") }
                .font(.caption)
                .foregroundStyle(secondaryText)
        case .coolingDown(let seconds):
            Label { Text(.iosLiveChatCooldown, ["n": "\(seconds)"]) } icon: { Image(systemName: "timer") }
                .font(.caption)
                .foregroundStyle(secondaryText)
                .accessibilityAddTraits(.updatesFrequently)
        default:
            if engagement.slowModeSeconds > 0 {
                Label { Text(.iosLiveChatSlowModeOn, ["n": "\(engagement.slowModeSeconds)"]) } icon: { Image(systemName: "tortoise") }
                    .font(.caption)
                    .foregroundStyle(secondaryText)
            }
        }
    }

    // MARK: - Composer

    private var composer: some View {
        let state = engagement.composerState
        let length = engagement.draft.trimmingCharacters(in: .whitespacesAndNewlines).utf16.count

        return HStack(alignment: .bottom, spacing: ZrpSpacing.sm) {
            TextField(L10n.string(.iosLiveChatPlaceholder), text: $engagement.draft, axis: .vertical)
                .lineLimit(1...3)
                .font(.subheadline)
                .focused($composerFocused)
                .submitLabel(.send)
                .onSubmit { engagement.sendMessage() }
                .disabled(state == .muted)
                .padding(.horizontal, ZrpSpacing.md)
                .padding(.vertical, ZrpSpacing.sm)
                .frame(minHeight: ZrpMetrics.minTouchTarget)
                .background(chipBackground, in: RoundedRectangle(cornerRadius: ZrpRadius.lg, style: .continuous))
                .foregroundStyle(primaryText)

            if length > liveChatMaxLength - 50 {
                Text(verbatim: "\(length)/\(liveChatMaxLength)")
                    .font(.caption2.monospacedDigit())
                    .foregroundStyle(state == .tooLong ? ZrpColor.red : secondaryText)
                    .frame(minHeight: ZrpMetrics.minTouchTarget)
            }

            Button {
                engagement.sendMessage()
            } label: {
                Group {
                    if engagement.isSendingMessage {
                        ProgressView().tint(.white)
                    } else {
                        Image(systemName: "paperplane.fill")
                            .foregroundStyle(.white)
                    }
                }
                .frame(width: ZrpMetrics.minTouchTarget, height: ZrpMetrics.minTouchTarget)
                .background(state == .ready ? ZrpColor.red : ZrpColor.red.opacity(0.35), in: Circle())
            }
            .disabled(state != .ready || engagement.isSendingMessage)
            .accessibilityLabel(Text(.chatSendMessageAria))
        }
    }
}
