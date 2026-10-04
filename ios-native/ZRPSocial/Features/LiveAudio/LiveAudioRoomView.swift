import SwiftUI

/// ZRP Live Audio's room screen - ported from `src/app/live-audio/[id]/
/// page.tsx`. See `LiveAudioRoomViewModel`'s own doc comment for why
/// participant state comes entirely from `live-audio:*` Socket.IO events
/// rather than the LiveKit `Room` itself, and why `leave()` (called here
/// from `.onDisappear`, which fires for every exit path - swipe-back,
/// the toolbar button, and programmatic `navigator.pop()` alike) rather
/// than a `deinit` hook makes the real `POST /leave` call.
///
/// The speaker/listener grid is the room; chat is drawn over its lower
/// part (not a full-screen takeover) and can be hidden, gifts and
/// reactions animate over it, and a host/moderator gets chat slow mode
/// and recording from the toolbar menu.
struct LiveAudioRoomView: View {

    let roomId: String

    @EnvironmentObject private var session: SessionController
    @EnvironmentObject private var navigator: Navigator
    @StateObject private var viewModel: LiveAudioRoomViewModel
    @State private var confirmEnd = false
    @State private var confirmRemoveUserId: String?
    @State private var showGifts = false
    @State private var showChat = true

    init(roomId: String) {
        self.roomId = roomId
        _viewModel = StateObject(wrappedValue: LiveAudioRoomViewModel(roomId: roomId))
    }

    var body: some View {
        Group {
            switch viewModel.phase {
            case .loading, .connecting:
                connectingState
            case .error:
                errorState
            case .scheduled:
                if let room = viewModel.room {
                    LiveScheduledRoomView(
                        kind: .audio,
                        room: room,
                        host: viewModel.host,
                        isHost: viewModel.amHost,
                        engagement: viewModel.engagement,
                        isBusy: viewModel.isLifecycleBusy,
                        actionError: viewModel.actionError,
                        onStart: { viewModel.startScheduledRoom() },
                        onCancel: { viewModel.cancelScheduledRoom() },
                        onRefresh: { await viewModel.refreshScheduled() }
                    )
                }
            case .ended:
                LiveEndedRoomView(kind: .audio, reason: .ended, engagement: viewModel.engagement) { navigator.pop() }
            case .cancelled:
                LiveEndedRoomView(kind: .audio, reason: .cancelled, engagement: viewModel.engagement) { navigator.pop() }
            case .removed:
                LiveEndedRoomView(kind: .audio, reason: .removed, engagement: viewModel.engagement) { navigator.pop() }
            case .connected:
                connectedContent
            }
        }
        .background(ZrpColor.background.ignoresSafeArea())
        .navigationBarTitleDisplayMode(.inline)
        .navigationBarBackButtonHidden(viewModel.phase == .connected)
        .toolbar {
            if viewModel.phase == .connected {
                ToolbarItem(placement: .navigationBarLeading) {
                    Button {
                        navigator.pop()
                    } label: {
                        Image(systemName: "chevron.left")
                    }
                    .accessibilityLabel(Text(.liveAudioLeaveRoom))
                }
                ToolbarItem(placement: .principal) {
                    Text(verbatim: viewModel.room?.title ?? "")
                        .font(.headline)
                        .lineLimit(1)
                }
                ToolbarItemGroup(placement: .topBarTrailing) {
                    if isLiveAudioAuthority(viewModel.myRole) {
                        Menu {
                            LiveAuthorityMenuItems(engagement: viewModel.engagement)
                        } label: {
                            Image(systemName: "ellipsis.circle")
                        }
                        .accessibilityLabel(Text(.chatContactMore))
                    }
                    if viewModel.myRole == "HOST" {
                        Button(role: .destructive) {
                            confirmEnd = true
                        } label: {
                            Text(.liveAudioEndRoom)
                        }
                    } else {
                        Button {
                            navigator.pop()
                        } label: {
                            Text(.liveAudioLeaveRoom)
                        }
                    }
                }
            }
        }
        .task { await viewModel.start(currentUserId: session.currentUser?.id) }
        .onDisappear { Task { await viewModel.leave() } }
        .confirmationDialog(
            Text(.liveAudioEndRoomConfirmTitle),
            isPresented: $confirmEnd,
            titleVisibility: .visible
        ) {
            Button(role: .destructive) {
                viewModel.endRoom()
            } label: {
                Text(.liveAudioEndRoom)
            }
        }
        .confirmationDialog(
            Text(.liveAudioRemoveConfirmTitle),
            isPresented: Binding(get: { confirmRemoveUserId != nil }, set: { if !$0 { confirmRemoveUserId = nil } }),
            titleVisibility: .visible
        ) {
            Button(role: .destructive) {
                if let userId = confirmRemoveUserId { viewModel.remove(userId: userId) }
                confirmRemoveUserId = nil
            } label: {
                Text(.liveAudioRemoveAction)
            }
        }
        .sheet(isPresented: $showGifts) {
            LiveGiftPanel(
                engagement: viewModel.engagement,
                hostName: viewModel.host?.displayName ?? "",
                onSent: {}
            )
        }
    }

    private var connectingState: some View {
        VStack(spacing: ZrpSpacing.md) {
            ProgressView().tint(ZrpColor.red)
            Text(.liveAudioConnecting)
                .font(.footnote)
                .foregroundStyle(ZrpColor.onSurfaceMuted)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    private var errorState: some View {
        VStack(spacing: ZrpSpacing.lg) {
            Image(systemName: "exclamationmark.triangle")
                .font(.largeTitle)
                .foregroundStyle(ZrpColor.onSurfaceMuted)
            Text(verbatim: viewModel.error ?? L10n.string(.liveAudioJoinError))
                .font(.subheadline)
                .foregroundStyle(ZrpColor.onSurfaceMuted)
                .multilineTextAlignment(.center)
            Button {
                Task { await viewModel.start(currentUserId: session.currentUser?.id) }
            } label: {
                Text(.feedTryAgain)
                    .font(.subheadline.weight(.semibold))
                    .padding(.horizontal, ZrpSpacing.xl)
                    .frame(minHeight: ZrpMetrics.minTouchTarget)
                    .background(ZrpColor.red)
                    .foregroundStyle(.white)
                    .clipShape(Capsule())
            }
            Button {
                navigator.pop()
            } label: {
                Text(.liveAudioBackToLiveAudio)
                    .font(.subheadline.weight(.semibold))
                    .frame(minHeight: ZrpMetrics.minTouchTarget)
            }
            .tint(ZrpColor.onSurface)
        }
        .padding(ZrpSpacing.xl)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    // MARK: - Connected

    private var amAuthority: Bool { isLiveAudioAuthority(viewModel.myRole) }

    private var speakers: [LiveAudioParticipant] {
        viewModel.participants.filter { canPublishLiveAudio($0.role) }
    }

    private var listeners: [LiveAudioParticipant] {
        viewModel.participants.filter { !canPublishLiveAudio($0.role) }
    }

    private var connectedContent: some View {
        VStack(spacing: 0) {
            if let actionError = viewModel.actionError {
                LiveNoticeBanner(text: actionError) { viewModel.dismissActionError() }
                    .padding(.horizontal, ZrpSpacing.lg)
                    .padding(.vertical, ZrpSpacing.xs)
            }
            LiveReplayNotice(engagement: viewModel.engagement)
                .padding(.horizontal, ZrpSpacing.lg)

            if amAuthority, !viewModel.pendingSpeakerRequestUserIds.isEmpty {
                PendingSpeakerRequestsPanel(
                    userIds: viewModel.pendingSpeakerRequestUserIds,
                    participants: viewModel.participants,
                    busyUserId: viewModel.actionBusyUserId,
                    onApprove: { viewModel.resolveSpeakRequest(userId: $0, approve: true) },
                    onReject: { viewModel.resolveSpeakRequest(userId: $0, approve: false) }
                )
            }

            ZStack(alignment: .bottom) {
                ScrollView {
                    VStack(alignment: .leading, spacing: ZrpSpacing.lg) {
                        HStack(spacing: ZrpSpacing.sm) {
                            Text(.liveAudioSpeakersHeading)
                                .font(.subheadline.weight(.bold))
                            Spacer()
                            LiveRecordingIndicator(engagement: viewModel.engagement)
                        }
                        ParticipantGrid(
                            participants: speakers,
                            myUserId: viewModel.myUserId,
                            speakingUserIds: viewModel.speakingUserIds,
                            amAuthority: amAuthority,
                            engagement: viewModel.engagement,
                            onPromote: { viewModel.promote(userId: $0) },
                            onDemote: { viewModel.demote(userId: $0) },
                            onMute: { viewModel.mute(userId: $0) },
                            onUnmute: { viewModel.unmute(userId: $0) },
                            onRequestRemove: { confirmRemoveUserId = $0 }
                        )

                        if !listeners.isEmpty {
                            VStack(alignment: .leading, spacing: ZrpSpacing.sm) {
                                Text(.liveAudioListenersHeading)
                                    .font(.subheadline.weight(.bold))
                                ParticipantGrid(
                                    participants: listeners,
                                    myUserId: viewModel.myUserId,
                                    speakingUserIds: viewModel.speakingUserIds,
                                    amAuthority: amAuthority,
                                    engagement: viewModel.engagement,
                                    onPromote: { viewModel.promote(userId: $0) },
                                    onDemote: { viewModel.demote(userId: $0) },
                                    onMute: { viewModel.mute(userId: $0) },
                                    onUnmute: { viewModel.unmute(userId: $0) },
                                    onRequestRemove: { confirmRemoveUserId = $0 }
                                )
                            }
                        }
                    }
                    .padding(ZrpSpacing.lg)
                    // Room to scroll the last row of the grid out from
                    // under the chat panel.
                    .padding(.bottom, showChat ? 300 : ZrpSpacing.xl)
                }

                VStack(alignment: .leading, spacing: ZrpSpacing.sm) {
                    LiveGiftBannerLayer(engagement: viewModel.engagement)
                        .padding(.horizontal, ZrpSpacing.lg)
                    if showChat {
                        LiveChatOverlay(engagement: viewModel.engagement, style: .overSurface)
                            .frame(maxHeight: 280, alignment: .bottom)
                            .padding(ZrpSpacing.md)
                            .background(
                                ZrpColor.surface.opacity(0.96),
                                in: UnevenRoundedRectangle(topLeadingRadius: ZrpRadius.lg, topTrailingRadius: ZrpRadius.lg, style: .continuous)
                            )
                            .overlay(alignment: .top) {
                                Rectangle().fill(ZrpColor.outline).frame(height: 0.5)
                            }
                    }
                }

                LiveReactionLayerHost(engagement: viewModel.engagement)
                    .frame(maxWidth: .infinity, alignment: .trailing)
                    .padding(.trailing, ZrpSpacing.md)
            }

            LiveAudioControlBar(
                canPublish: canPublishLiveAudio(viewModel.myRole),
                isMicOn: viewModel.isMicOn,
                isMicBusy: viewModel.isMicBusy,
                speakRequestSent: viewModel.speakRequestSent,
                isChatShown: showChat,
                canGift: !viewModel.amHost,
                engagement: viewModel.engagement,
                onToggleMic: { viewModel.toggleMic() },
                onRequestToSpeak: { viewModel.requestToSpeak() },
                onToggleChat: { showChat.toggle() },
                onGift: { showGifts = true }
            )
        }
    }
}

private struct PendingSpeakerRequestsPanel: View {

    let userIds: [String]
    let participants: [LiveAudioParticipant]
    let busyUserId: String?
    let onApprove: (String) -> Void
    let onReject: (String) -> Void

    private func participant(for userId: String) -> LiveAudioParticipant? {
        participants.first { $0.user.id == userId }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: ZrpSpacing.sm) {
            Text(.liveAudioPendingRequests, ["n": "\(userIds.count)"])
                .font(.subheadline.weight(.bold))

            ForEach(userIds, id: \.self) { userId in
                let user = participant(for: userId)?.user
                HStack(spacing: ZrpSpacing.sm) {
                    AvatarView(url: user?.avatarUrl, displayName: user?.displayName ?? userId, size: ZrpMetrics.avatarSmall)
                    Text(verbatim: user?.displayName ?? userId)
                        .font(.subheadline)
                        .lineLimit(1)
                        .frame(maxWidth: .infinity, alignment: .leading)

                    if busyUserId == userId {
                        ProgressView()
                    } else {
                        Button { onApprove(userId) } label: {
                            Image(systemName: "checkmark")
                                .frame(width: ZrpMetrics.minTouchTarget, height: ZrpMetrics.minTouchTarget)
                        }
                        .accessibilityLabel(Text(.liveAudioApprove))
                        Button { onReject(userId) } label: {
                            Image(systemName: "xmark")
                                .frame(width: ZrpMetrics.minTouchTarget, height: ZrpMetrics.minTouchTarget)
                        }
                        .accessibilityLabel(Text(.liveAudioDecline))
                    }
                }
            }
        }
        .padding(ZrpSpacing.lg)
        .background(ZrpColor.surfaceElevated)
    }
}

private struct ParticipantGrid: View {

    let participants: [LiveAudioParticipant]
    let myUserId: String?
    let speakingUserIds: Set<String>
    let amAuthority: Bool
    let engagement: LiveEngagementViewModel
    let onPromote: (String) -> Void
    let onDemote: (String) -> Void
    let onMute: (String) -> Void
    let onUnmute: (String) -> Void
    let onRequestRemove: (String) -> Void

    private let columns = [GridItem(.adaptive(minimum: 72), spacing: ZrpSpacing.md)]

    var body: some View {
        LazyVGrid(columns: columns, spacing: ZrpSpacing.md) {
            ForEach(participants, id: \.user.id) { participant in
                ParticipantTile(
                    participant: participant,
                    isMe: participant.user.id == myUserId,
                    isSpeaking: speakingUserIds.contains(participant.user.id) && !participant.isMuted,
                    amAuthority: amAuthority,
                    engagement: engagement,
                    onPromote: { onPromote(participant.user.id) },
                    onDemote: { onDemote(participant.user.id) },
                    onMute: { onMute(participant.user.id) },
                    onUnmute: { onUnmute(participant.user.id) },
                    onRequestRemove: { onRequestRemove(participant.user.id) }
                )
            }
        }
    }
}

private struct ParticipantTile: View {

    let participant: LiveAudioParticipant
    let isMe: Bool
    let isSpeaking: Bool
    let amAuthority: Bool
    let engagement: LiveEngagementViewModel
    let onPromote: () -> Void
    let onDemote: () -> Void
    let onMute: () -> Void
    let onUnmute: () -> Void
    let onRequestRemove: () -> Void

    /// Only a real HOST/MODERATOR can moderate someone else - never
    /// themselves (an authority always uses the dedicated end/mute-self
    /// controls, not this per-tile menu), matching the Android sibling's
    /// own `canModerateThisTile`.
    private var canModerate: Bool { amAuthority && !isMe }

    var body: some View {
        Group {
            // A plain (non-interactive) tile for anyone who isn't
            // allowed to moderate this participant, rather than a
            // `Menu` disabled via `.disabled(!canModerate)` - a disabled
            // control renders dimmed, which would gray out every
            // listener's own avatar for every other listener despite
            // nothing actually being wrong with it.
            if canModerate {
                Menu {
                    if participant.role == "LISTENER" {
                        Button(action: onPromote) { Text(.liveAudioInviteToSpeak) }
                    } else if participant.role == "SPEAKER" {
                        Button(action: onDemote) { Text(.liveAudioMoveToListener) }
                    }
                    if canPublishLiveAudio(participant.role) {
                        Button(action: participant.isMuted ? onUnmute : onMute) {
                            Text(participant.isMuted ? L10nKey.liveAudioUnmuteAction : L10nKey.liveAudioMuteAction)
                        }
                    }
                    LiveChatMuteMenuItems(engagement: engagement, userId: participant.user.id)
                    if participant.role != "HOST" {
                        Button(role: .destructive, action: onRequestRemove) {
                            Text(.liveAudioRemoveAction)
                        }
                    }
                } label: {
                    tileContent
                }
            } else {
                tileContent
            }
        }
        .accessibilityLabel(Text(verbatim: participant.user.displayName))
    }

    private var tileContent: some View {
        VStack(spacing: 2) {
            ZStack(alignment: .bottomTrailing) {
                AvatarView(url: participant.user.avatarUrl, displayName: participant.user.displayName, size: 56)
                    .overlay(
                        Circle().strokeBorder(isSpeaking ? ZrpColor.red : .clear, lineWidth: 2)
                    )
                if participant.isMuted {
                    Image(systemName: "mic.slash.fill")
                        .font(.system(size: 10))
                        .foregroundStyle(ZrpColor.onSurfaceMuted)
                        .padding(4)
                        .background(ZrpColor.surface, in: Circle())
                }
            }
            Text(verbatim: participant.user.displayName)
                .font(.caption2)
                .foregroundStyle(ZrpColor.onSurface)
                .lineLimit(1)
            if participant.role == "HOST" {
                Text(.liveAudioHostBadge)
                    .font(.caption2.weight(.semibold))
                    .foregroundStyle(ZrpColor.red)
            } else if participant.role == "MODERATOR" {
                Text(.liveAudioModeratorBadge)
                    .font(.caption2.weight(.semibold))
                    .foregroundStyle(ZrpColor.red)
            }
        }
        .frame(width: 72)
    }
}

private struct LiveAudioControlBar: View {

    let canPublish: Bool
    let isMicOn: Bool
    let isMicBusy: Bool
    let speakRequestSent: Bool
    let isChatShown: Bool
    let canGift: Bool
    let engagement: LiveEngagementViewModel
    let onToggleMic: () -> Void
    let onRequestToSpeak: () -> Void
    let onToggleChat: () -> Void
    let onGift: () -> Void

    var body: some View {
        HStack(alignment: .center, spacing: ZrpSpacing.md) {
            Button(action: onToggleChat) {
                Image(systemName: isChatShown ? "bubble.left.fill" : "bubble.left")
                    .font(.title3)
                    .foregroundStyle(ZrpColor.onSurface)
                    .frame(width: ZrpMetrics.minTouchTarget, height: ZrpMetrics.minTouchTarget)
                    .background(ZrpColor.surfaceElevated, in: Circle())
            }
            .accessibilityLabel(Text(.iosLiveChatTitle))
            .accessibilityAddTraits(isChatShown ? .isSelected : [])

            Spacer(minLength: 0)

            if canPublish {
                Button(action: onToggleMic) {
                    Group {
                        if isMicBusy {
                            ProgressView().tint(.white)
                        } else {
                            Image(systemName: isMicOn ? "mic.fill" : "mic.slash.fill")
                                .foregroundStyle(isMicOn ? ZrpColor.onSurface : .white)
                        }
                    }
                    .frame(width: 56, height: 56)
                    .background(isMicOn ? ZrpColor.surfaceElevated : ZrpColor.red, in: Circle())
                }
                .disabled(isMicBusy)
                .accessibilityLabel(Text(isMicOn ? L10nKey.liveAudioMuteSelf : L10nKey.liveAudioUnmuteSelf))
            } else {
                Button(action: onRequestToSpeak) {
                    Label {
                        Text(speakRequestSent ? L10nKey.liveAudioRequestSent : L10nKey.liveAudioRaiseHand)
                            .lineLimit(1)
                            .minimumScaleFactor(0.8)
                    } icon: {
                        Image(systemName: "hand.raised")
                    }
                    .padding(.horizontal, ZrpSpacing.md)
                    .frame(minHeight: ZrpMetrics.minTouchTarget)
                }
                .buttonStyle(.bordered)
                .disabled(speakRequestSent)
            }

            Spacer(minLength: 0)

            LiveReactionButton(engagement: engagement)

            if canGift {
                Button(action: onGift) {
                    Image(systemName: "gift.fill")
                        .font(.title3)
                        .foregroundStyle(ZrpColor.red)
                        .frame(width: ZrpMetrics.minTouchTarget, height: ZrpMetrics.minTouchTarget)
                        .background(ZrpColor.surfaceElevated, in: Circle())
                }
                .accessibilityLabel(Text(.iosLiveGiftTitle))
            }
        }
        .padding(.horizontal, ZrpSpacing.lg)
        .padding(.vertical, ZrpSpacing.md)
        .background(ZrpColor.background)
    }
}
