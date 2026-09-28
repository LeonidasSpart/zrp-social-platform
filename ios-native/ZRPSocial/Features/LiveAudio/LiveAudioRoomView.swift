import SwiftUI

/// ZRP Live Audio's room screen - ported from `src/app/live-audio/[id]/
/// page.tsx`. See `LiveAudioRoomViewModel`'s own doc comment for why
/// participant state comes entirely from `live-audio:*` Socket.IO events
/// rather than the LiveKit `Room` itself, and why `leave()` (called here
/// from `.onDisappear`, which fires for every exit path - swipe-back,
/// the toolbar button, and programmatic `navigator.pop()` alike) rather
/// than a `deinit` hook makes the real `POST /leave` call.
struct LiveAudioRoomView: View {

    let roomId: String

    @EnvironmentObject private var session: SessionController
    @EnvironmentObject private var navigator: Navigator
    @StateObject private var viewModel: LiveAudioRoomViewModel
    @State private var confirmEnd = false
    @State private var confirmRemoveUserId: String?

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
            case .ended, .removed:
                endedState
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
                }
                ToolbarItem(placement: .principal) {
                    Text(verbatim: viewModel.room?.title ?? "")
                        .font(.headline)
                        .lineLimit(1)
                }
                ToolbarItem(placement: .topBarTrailing) {
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
        .task { await viewModel.connect(currentUserId: session.currentUser?.id) }
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
            backButton
        }
        .padding(ZrpSpacing.xl)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    private var endedState: some View {
        VStack(spacing: ZrpSpacing.lg) {
            Text(viewModel.phase == .ended ? L10nKey.liveAudioRoomEndedTitle : L10nKey.liveAudioRemovedTitle)
                .font(.headline)
                .multilineTextAlignment(.center)
            backButton
        }
        .padding(ZrpSpacing.xl)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    private var backButton: some View {
        Button {
            navigator.pop()
        } label: {
            Text(.liveAudioBackToLiveAudio)
                .font(.subheadline.weight(.semibold))
                .padding(.horizontal, ZrpSpacing.xl)
                .frame(minHeight: ZrpMetrics.minTouchTarget)
                .background(ZrpColor.red)
                .foregroundStyle(.white)
                .clipShape(Capsule())
        }
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
                HStack(spacing: ZrpSpacing.sm) {
                    Text(verbatim: actionError)
                        .font(.footnote)
                        .foregroundStyle(.red)
                        .frame(maxWidth: .infinity, alignment: .leading)
                    Button {
                        viewModel.dismissActionError()
                    } label: {
                        Image(systemName: "xmark")
                            .font(.caption)
                    }
                }
                .padding(.horizontal, ZrpSpacing.lg)
                .padding(.vertical, ZrpSpacing.xs)
            }

            if amAuthority, !viewModel.pendingSpeakerRequestUserIds.isEmpty {
                PendingSpeakerRequestsPanel(
                    userIds: viewModel.pendingSpeakerRequestUserIds,
                    participants: viewModel.participants,
                    busyUserId: viewModel.actionBusyUserId,
                    onApprove: { viewModel.resolveSpeakRequest(userId: $0, approve: true) },
                    onReject: { viewModel.resolveSpeakRequest(userId: $0, approve: false) }
                )
            }

            ScrollView {
                VStack(alignment: .leading, spacing: ZrpSpacing.lg) {
                    VStack(alignment: .leading, spacing: ZrpSpacing.sm) {
                        Text(.liveAudioSpeakersHeading)
                            .font(.subheadline.weight(.bold))
                        ParticipantGrid(
                            participants: speakers,
                            myUserId: viewModel.myUserId,
                            speakingUserIds: viewModel.speakingUserIds,
                            amAuthority: amAuthority,
                            onPromote: { viewModel.promote(userId: $0) },
                            onDemote: { viewModel.demote(userId: $0) },
                            onMute: { viewModel.mute(userId: $0) },
                            onUnmute: { viewModel.unmute(userId: $0) },
                            onRequestRemove: { confirmRemoveUserId = $0 }
                        )
                    }

                    if !listeners.isEmpty {
                        VStack(alignment: .leading, spacing: ZrpSpacing.sm) {
                            Text(.liveAudioListenersHeading)
                                .font(.subheadline.weight(.bold))
                            ParticipantGrid(
                                participants: listeners,
                                myUserId: viewModel.myUserId,
                                speakingUserIds: viewModel.speakingUserIds,
                                amAuthority: amAuthority,
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
            }

            LiveAudioControlBar(
                canPublish: canPublishLiveAudio(viewModel.myRole),
                isMicOn: viewModel.isMicOn,
                isMicBusy: viewModel.isMicBusy,
                speakRequestSent: viewModel.speakRequestSent,
                onToggleMic: { viewModel.toggleMic() },
                onRequestToSpeak: { viewModel.requestToSpeak() }
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
                        }
                        .accessibilityLabel(Text(.liveAudioApprove))
                        Button { onReject(userId) } label: {
                            Image(systemName: "xmark")
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
                    Button(action: participant.isMuted ? onUnmute : onMute) {
                        Text(participant.isMuted ? L10nKey.liveAudioUnmuteAction : L10nKey.liveAudioMuteAction)
                    }
                    Button(role: .destructive, action: onRequestRemove) {
                        Text(.liveAudioRemoveAction)
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
    let onToggleMic: () -> Void
    let onRequestToSpeak: () -> Void

    var body: some View {
        HStack {
            Spacer()
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
                    } icon: {
                        Image(systemName: "hand.raised")
                    }
                    .padding(.horizontal, ZrpSpacing.lg)
                    .frame(minHeight: ZrpMetrics.minTouchTarget)
                }
                .buttonStyle(.bordered)
                .disabled(speakRequestSent)
            }
            Spacer()
        }
        .padding(ZrpSpacing.lg)
    }
}
