import LiveKit
import SwiftUI

/// The Live Video room - a vertical, full-bleed camera stage with the
/// host's tile prominent, chat drawn over the lower stage, an action rail
/// (reactions, gift, chat, people) on the trailing edge and the media
/// controls along the bottom. Ported from `src/app/live-video/[id]/
/// page.tsx` for its functional surface (join/leave, mic + camera,
/// join-on-camera requests, promote/demote, mute, camera off, remove,
/// end), re-shaped for a phone held upright.
///
/// `leave()` runs from `.onDisappear`, which fires for every exit path
/// (the back button, swipe-back, and a programmatic pop alike); sheets
/// presented from here do not trigger it.
struct LiveVideoRoomView: View {

    let roomId: String

    @EnvironmentObject private var session: SessionController
    @EnvironmentObject private var navigator: Navigator
    @StateObject private var viewModel: LiveVideoRoomViewModel
    @State private var confirmEnd = false
    @State private var showGifts = false
    @State private var showPeople = false
    @State private var showChat = true

    init(roomId: String) {
        self.roomId = roomId
        _viewModel = StateObject(wrappedValue: LiveVideoRoomViewModel(roomId: roomId))
    }

    private var isStage: Bool {
        viewModel.phase == .connected || viewModel.phase == .connecting
    }

    var body: some View {
        content
            .background((isStage ? Color.black : ZrpColor.background).ignoresSafeArea())
            .navigationBarTitleDisplayMode(.inline)
            .navigationBarBackButtonHidden(viewModel.phase == .connected)
            .toolbarBackground(isStage ? Color.black : ZrpColor.background, for: .navigationBar)
            .toolbarColorScheme(isStage ? .dark : nil, for: .navigationBar)
            .toolbar(.hidden, for: .tabBar)
            .toolbar { toolbarContent }
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
            .sheet(isPresented: $showGifts) {
                LiveGiftPanel(
                    engagement: viewModel.engagement,
                    hostName: viewModel.host?.displayName ?? "",
                    onSent: {}
                )
            }
            .sheet(isPresented: $showPeople) {
                LiveVideoPeopleSheet(viewModel: viewModel, engagement: viewModel.engagement)
            }
    }

    // MARK: - Phases

    @ViewBuilder
    private var content: some View {
        switch viewModel.phase {
        case .loading, .connecting:
            VStack(spacing: ZrpSpacing.md) {
                ProgressView().tint(isStage ? .white : ZrpColor.red)
                Text(.liveAudioConnecting)
                    .font(.footnote)
                    .foregroundStyle(isStage ? Color.white.opacity(0.8) : ZrpColor.onSurfaceMuted)
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
        case .error:
            errorState
        case .scheduled:
            if let room = viewModel.room {
                LiveScheduledRoomView(
                    kind: .video,
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
            LiveEndedRoomView(kind: .video, reason: .ended, engagement: viewModel.engagement) { navigator.pop() }
        case .cancelled:
            LiveEndedRoomView(kind: .video, reason: .cancelled, engagement: viewModel.engagement) { navigator.pop() }
        case .removed:
            LiveEndedRoomView(kind: .video, reason: .removed, engagement: viewModel.engagement) { navigator.pop() }
        case .connected:
            stage
        }
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
                    .background(ZrpColor.red, in: Capsule())
                    .foregroundStyle(.white)
            }
            Button {
                navigator.pop()
            } label: {
                Text(.liveVideoBackToLiveVideo)
                    .font(.subheadline.weight(.semibold))
                    .frame(minHeight: ZrpMetrics.minTouchTarget)
            }
            .tint(ZrpColor.onSurface)
        }
        .padding(ZrpSpacing.xl)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    // MARK: - Toolbar

    @ToolbarContentBuilder
    private var toolbarContent: some ToolbarContent {
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
                    .foregroundStyle(.white)
                    .lineLimit(1)
            }
            ToolbarItemGroup(placement: .topBarTrailing) {
                if viewModel.amAuthority {
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
                    .tint(ZrpColor.red)
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

    // MARK: - Stage

    private var stage: some View {
        ZStack(alignment: .bottom) {
            LiveVideoStage(
                participants: viewModel.stage,
                tracks: viewModel.videoTracks,
                speakingUserIds: viewModel.speakingUserIds
            )

            // Legibility for the chat and controls over bright video.
            LinearGradient(
                colors: [.clear, Color.black.opacity(0.7)],
                startPoint: .center,
                endPoint: .bottom
            )
            .allowsHitTesting(false)
            .accessibilityHidden(true)

            VStack(alignment: .leading, spacing: ZrpSpacing.sm) {
                statusRow
                notices
                Spacer(minLength: 0)
                LiveGiftBannerLayer(engagement: viewModel.engagement)
                HStack(alignment: .bottom, spacing: ZrpSpacing.md) {
                    if showChat {
                        LiveChatOverlay(engagement: viewModel.engagement, style: .overVideo)
                            .frame(maxWidth: .infinity, maxHeight: 300, alignment: .bottom)
                    } else {
                        Spacer(minLength: 0)
                    }
                    actionRail
                }
                controlBar
            }
            .padding(.horizontal, ZrpSpacing.md)
            .padding(.bottom, ZrpSpacing.sm)

            LiveReactionLayerHost(engagement: viewModel.engagement)
                .frame(maxWidth: .infinity, alignment: .trailing)
                .padding(.bottom, 260)
        }
    }

    private var statusRow: some View {
        HStack(spacing: ZrpSpacing.sm) {
            HStack(spacing: ZrpSpacing.xs) {
                Circle().fill(Color.white).frame(width: 6, height: 6)
                Text(.liveAudioLiveNow)
                    .font(.caption2.weight(.bold))
            }
            .foregroundStyle(.white)
            .padding(.horizontal, ZrpSpacing.sm)
            .padding(.vertical, ZrpSpacing.xs)
            .background(ZrpColor.red, in: Capsule())

            Label {
                Text(.liveVideoViewerCount, ["n": "\(viewModel.participants.count)"])
            } icon: {
                Image(systemName: "eye")
            }
            .font(.caption2.weight(.semibold))
            .foregroundStyle(.white)
            .padding(.horizontal, ZrpSpacing.sm)
            .padding(.vertical, ZrpSpacing.xs)
            .background(Color.black.opacity(0.45), in: Capsule())

            LiveRecordingIndicator(engagement: viewModel.engagement)
            Spacer(minLength: 0)
        }
        .padding(.top, ZrpSpacing.sm)
    }

    @ViewBuilder
    private var notices: some View {
        if let actionError = viewModel.actionError {
            LiveNoticeBanner(text: actionError, onVideo: true) { viewModel.dismissActionError() }
        }
        LiveReplayNotice(engagement: viewModel.engagement, onVideo: true)
        if viewModel.amAuthority, !viewModel.pendingJoinRequestUserIds.isEmpty {
            Button {
                showPeople = true
            } label: {
                Label {
                    Text(.liveVideoPendingRequests, ["n": "\(viewModel.pendingJoinRequestUserIds.count)"])
                } icon: {
                    Image(systemName: "hand.raised.fill")
                }
                .font(.footnote.weight(.semibold))
                .foregroundStyle(.white)
                .padding(.horizontal, ZrpSpacing.md)
                .frame(minHeight: ZrpMetrics.minTouchTarget)
                .background(ZrpColor.red, in: Capsule())
            }
        }
    }

    private var actionRail: some View {
        VStack(spacing: ZrpSpacing.md) {
            LiveReactionButton(engagement: viewModel.engagement, onVideo: true)

            if !viewModel.amHost {
                railButton(systemImage: "gift.fill", label: .iosLiveGiftTitle) {
                    showGifts = true
                }
            }

            railButton(systemImage: showChat ? "bubble.left.fill" : "bubble.left", label: .iosLiveChatTitle) {
                showChat.toggle()
            }
            .accessibilityAddTraits(showChat ? .isSelected : [])

            ZStack(alignment: .topTrailing) {
                railButton(systemImage: "person.2.fill", label: .iosLivePeople) {
                    showPeople = true
                }
                if viewModel.amAuthority, viewModel.pendingRequestCount > 0 || !viewModel.pendingJoinRequestUserIds.isEmpty {
                    Circle()
                        .fill(ZrpColor.red)
                        .frame(width: 10, height: 10)
                        .accessibilityHidden(true)
                }
            }
        }
    }

    private func railButton(systemImage: String, label: L10nKey, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Image(systemName: systemImage)
                .font(.title3)
                .foregroundStyle(.white)
                .frame(width: ZrpMetrics.minTouchTarget, height: ZrpMetrics.minTouchTarget)
                .background(Color.black.opacity(0.45), in: Circle())
        }
        .accessibilityLabel(Text(label))
    }

    private var controlBar: some View {
        HStack(spacing: ZrpSpacing.lg) {
            Spacer(minLength: 0)
            if viewModel.canPublish {
                mediaButton(
                    systemImage: viewModel.isMicOn ? "mic.fill" : "mic.slash.fill",
                    isOn: viewModel.isMicOn,
                    isBusy: viewModel.isMicBusy,
                    label: viewModel.isMicOn ? L10nKey.liveAudioMuteSelf : L10nKey.liveAudioUnmuteSelf
                ) {
                    viewModel.toggleMic()
                }

                mediaButton(
                    systemImage: viewModel.isCameraOn ? "video.fill" : "video.slash.fill",
                    isOn: viewModel.isCameraOn,
                    isBusy: viewModel.isCameraBusy,
                    label: cameraButtonLabel
                ) {
                    viewModel.toggleCamera()
                }
                .disabled(viewModel.isCameraForcedOff && !viewModel.isCameraOn)

                if viewModel.isCameraOn {
                    Button {
                        viewModel.switchCamera()
                    } label: {
                        Image(systemName: "arrow.triangle.2.circlepath.camera")
                            .font(.title3)
                            .foregroundStyle(.white)
                            .frame(width: 52, height: 52)
                            .background(Color.white.opacity(0.18), in: Circle())
                    }
                    .accessibilityLabel(Text(.iosLiveSwitchCamera))
                }
            } else {
                Button {
                    viewModel.requestToJoin()
                } label: {
                    Label {
                        Text(viewModel.joinRequestSent ? L10nKey.liveAudioRequestSent : L10nKey.liveVideoRaiseHand)
                    } icon: {
                        Image(systemName: "hand.raised")
                    }
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(.white)
                    .padding(.horizontal, ZrpSpacing.lg)
                    .frame(minHeight: ZrpMetrics.minTouchTarget)
                    .background(Color.white.opacity(viewModel.joinRequestSent ? 0.12 : 0.22), in: Capsule())
                }
                .disabled(viewModel.joinRequestSent)
            }
            Spacer(minLength: 0)
        }
        .padding(.top, ZrpSpacing.xs)
    }

    private var cameraButtonLabel: L10nKey {
        if viewModel.isCameraForcedOff { return .liveVideoCameraOffLabel }
        return viewModel.isCameraOn ? .liveVideoCameraOffSelf : .liveVideoCameraOnSelf
    }

    private func mediaButton(
        systemImage: String,
        isOn: Bool,
        isBusy: Bool,
        label: L10nKey,
        action: @escaping () -> Void
    ) -> some View {
        Button(action: action) {
            Group {
                if isBusy {
                    ProgressView().tint(.white)
                } else {
                    Image(systemName: systemImage)
                        .font(.title3)
                        .foregroundStyle(.white)
                }
            }
            .frame(width: 52, height: 52)
            .background(isOn ? Color.white.opacity(0.22) : ZrpColor.red, in: Circle())
        }
        .disabled(isBusy)
        .accessibilityLabel(Text(label))
    }
}

// MARK: - Stage layout

/// The camera grid. The first participant (the host - see
/// `liveVideoStageOrder`) takes the whole stage when alone and the top
/// ~60% when not; everyone else on camera shares a strip beneath it,
/// side by side for two, scrolling for more.
private struct LiveVideoStage: View {

    let participants: [LiveVideoParticipant]
    let tracks: [String: VideoTrack]
    let speakingUserIds: Set<String>

    var body: some View {
        GeometryReader { geometry in
            let others = Array(participants.dropFirst())
            let stripHeight = others.isEmpty ? 0 : geometry.size.height * 0.36
            VStack(spacing: 2) {
                if let primary = participants.first {
                    tile(primary, prominent: true)
                        .frame(width: geometry.size.width, height: geometry.size.height - stripHeight - (others.isEmpty ? 0 : 2))
                } else {
                    Image(systemName: "video.slash")
                        .font(.largeTitle)
                        .foregroundStyle(Color.white.opacity(0.5))
                        .frame(width: geometry.size.width, height: geometry.size.height)
                        .accessibilityHidden(true)
                }

                if !others.isEmpty {
                    strip(others, width: geometry.size.width, height: stripHeight)
                }
            }
        }
    }

    @ViewBuilder
    private func strip(_ others: [LiveVideoParticipant], width: CGFloat, height: CGFloat) -> some View {
        if others.count <= 2 {
            let tileWidth = (width - CGFloat(others.count - 1) * 2) / CGFloat(others.count)
            HStack(spacing: 2) {
                ForEach(others, id: \.user.id) { participant in
                    tile(participant, prominent: false)
                        .frame(width: tileWidth, height: height)
                }
            }
        } else {
            ScrollView(.horizontal) {
                LazyHStack(spacing: 2) {
                    ForEach(others, id: \.user.id) { participant in
                        tile(participant, prominent: false)
                            .frame(width: height * 0.8, height: height)
                    }
                }
            }
            .scrollIndicators(.hidden)
            .frame(width: width, height: height)
        }
    }

    private func tile(_ participant: LiveVideoParticipant, prominent: Bool) -> some View {
        LiveVideoTile(
            participant: participant,
            track: tracks[participant.user.id],
            isSpeaking: speakingUserIds.contains(participant.user.id) && !participant.isMuted,
            prominent: prominent
        )
    }
}

private struct LiveVideoTile: View {

    let participant: LiveVideoParticipant
    let track: VideoTrack?
    let isSpeaking: Bool
    let prominent: Bool

    var body: some View {
        ZStack(alignment: .bottomLeading) {
            Color(hex: 0x0D0D0D)

            if let track, !participant.isCameraOff {
                SwiftUIVideoView(track, layoutMode: .fill, mirrorMode: .auto)
            } else {
                VStack(spacing: ZrpSpacing.sm) {
                    AvatarView(
                        url: participant.user.avatarUrl,
                        displayName: participant.user.displayName,
                        size: prominent ? 96 : 52
                    )
                    if participant.isCameraOff {
                        Label { Text(.liveVideoCameraOffLabel) } icon: { Image(systemName: "video.slash") }
                            .font(.caption2)
                            .foregroundStyle(Color.white.opacity(0.75))
                    }
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
            }

            nameChip
                .padding(prominent ? ZrpSpacing.md : ZrpSpacing.xs)
                .padding(.bottom, prominent ? 160 : 0)
        }
        .clipped()
        .overlay(
            Rectangle()
                .strokeBorder(isSpeaking ? ZrpColor.red : Color.clear, lineWidth: 3)
        )
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(Text(verbatim: accessibilityText))
    }

    private var nameChip: some View {
        HStack(spacing: ZrpSpacing.xs) {
            if participant.isMuted {
                Image(systemName: "mic.slash.fill")
                    .font(.caption2)
            }
            Text(verbatim: participant.user.displayName)
                .font(.caption.weight(.semibold))
                .lineLimit(1)
            if participant.role == "HOST" {
                Text(.liveAudioHostBadge)
                    .font(.caption2.weight(.bold))
                    .foregroundStyle(ZrpColor.red)
            } else if participant.role == "MODERATOR" {
                Text(.liveAudioModeratorBadge)
                    .font(.caption2.weight(.bold))
                    .foregroundStyle(ZrpColor.red)
            }
        }
        .foregroundStyle(.white)
        .padding(.horizontal, ZrpSpacing.sm)
        .padding(.vertical, ZrpSpacing.xs)
        .background(Color.black.opacity(0.5), in: Capsule())
    }

    private var accessibilityText: String {
        var parts = [participant.user.displayName]
        if participant.role == "HOST" { parts.append(L10n.string(.liveAudioHostBadge)) }
        if participant.role == "MODERATOR" { parts.append(L10n.string(.liveAudioModeratorBadge)) }
        if participant.isMuted { parts.append(L10n.string(.liveAudioMutedLabel)) }
        if participant.isCameraOff { parts.append(L10n.string(.liveVideoCameraOffLabel)) }
        return parts.joined(separator: ", ")
    }
}

// MARK: - People

/// Everyone in the room, with join-on-camera requests on top. Moderation
/// actions appear only for a host/moderator acting on someone else - the
/// same rule the server enforces (`canPromoteSpeaker`/`isRoomAuthority`).
private struct LiveVideoPeopleSheet: View {

    @ObservedObject var viewModel: LiveVideoRoomViewModel
    @ObservedObject var engagement: LiveEngagementViewModel
    @Environment(\.dismiss) private var dismiss
    @State private var confirmRemoveUserId: String?

    var body: some View {
        NavigationStack {
            List {
                if viewModel.amAuthority, !viewModel.pendingJoinRequestUserIds.isEmpty {
                    Section {
                        ForEach(viewModel.pendingJoinRequestUserIds, id: \.self) { userId in
                            requestRow(userId)
                        }
                    } header: {
                        Text(.liveVideoPendingRequests, ["n": "\(viewModel.pendingJoinRequestUserIds.count)"])
                    }
                }

                Section {
                    ForEach(viewModel.stage, id: \.user.id) { participant in
                        personRow(participant)
                    }
                } header: {
                    Text(.liveVideoParticipantsHeading)
                }

                if !viewModel.viewers.isEmpty {
                    Section {
                        ForEach(viewModel.viewers, id: \.user.id) { participant in
                            personRow(participant)
                        }
                    } header: {
                        Text(.liveVideoViewersHeading)
                    }
                }
            }
            .navigationTitle(Text(.iosLivePeople))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button {
                        dismiss()
                    } label: {
                        Text(.onboardingStepDone)
                    }
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
        .presentationDetents([.medium, .large])
    }

    private func requestRow(_ userId: String) -> some View {
        let user = viewModel.participants.first { $0.user.id == userId }?.user
        return HStack(spacing: ZrpSpacing.sm) {
            AvatarView(url: user?.avatarUrl, displayName: user?.displayName ?? userId, size: ZrpMetrics.avatarSmall)
            Text(verbatim: user?.displayName ?? userId)
                .font(.subheadline)
                .lineLimit(1)
                .frame(maxWidth: .infinity, alignment: .leading)
            if viewModel.actionBusyUserId == userId {
                ProgressView()
            } else {
                Button {
                    viewModel.resolveJoinRequest(userId: userId, approve: true)
                } label: {
                    Image(systemName: "checkmark")
                        .frame(width: ZrpMetrics.minTouchTarget, height: ZrpMetrics.minTouchTarget)
                }
                .buttonStyle(.borderless)
                .tint(ZrpColor.green)
                .accessibilityLabel(Text(.liveAudioApprove))
                Button {
                    viewModel.resolveJoinRequest(userId: userId, approve: false)
                } label: {
                    Image(systemName: "xmark")
                        .frame(width: ZrpMetrics.minTouchTarget, height: ZrpMetrics.minTouchTarget)
                }
                .buttonStyle(.borderless)
                .tint(ZrpColor.onSurfaceMuted)
                .accessibilityLabel(Text(.liveAudioDecline))
            }
        }
    }

    private func personRow(_ participant: LiveVideoParticipant) -> some View {
        let userId = participant.user.id
        let canModerate = viewModel.amAuthority && userId != viewModel.myUserId
        return HStack(spacing: ZrpSpacing.sm) {
            AvatarView(url: participant.user.avatarUrl, displayName: participant.user.displayName, size: ZrpMetrics.avatarSmall)
            VStack(alignment: .leading, spacing: 2) {
                Text(verbatim: participant.user.displayName)
                    .font(.subheadline.weight(.semibold))
                    .lineLimit(1)
                if participant.role == "HOST" {
                    Text(.liveAudioHostBadge).font(.caption2.weight(.semibold)).foregroundStyle(ZrpColor.red)
                } else if participant.role == "MODERATOR" {
                    Text(.liveAudioModeratorBadge).font(.caption2.weight(.semibold)).foregroundStyle(ZrpColor.red)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)

            if participant.isMuted {
                Image(systemName: "mic.slash.fill")
                    .foregroundStyle(ZrpColor.onSurfaceMuted)
                    .accessibilityLabel(Text(.liveAudioMutedLabel))
            }
            if participant.isCameraOff {
                Image(systemName: "video.slash.fill")
                    .foregroundStyle(ZrpColor.onSurfaceMuted)
                    .accessibilityLabel(Text(.liveVideoCameraOffLabel))
            }

            if viewModel.actionBusyUserId == userId {
                ProgressView()
            } else if canModerate {
                Menu {
                    moderationActions(participant)
                } label: {
                    Image(systemName: "ellipsis")
                        .frame(width: ZrpMetrics.minTouchTarget, height: ZrpMetrics.minTouchTarget)
                }
                .accessibilityLabel(Text(.chatContactMore))
            }
        }
    }

    @ViewBuilder
    private func moderationActions(_ participant: LiveVideoParticipant) -> some View {
        let userId = participant.user.id
        if participant.role == "LISTENER" {
            Button { viewModel.promote(userId: userId) } label: { Text(.liveVideoInviteToSpeak) }
        } else if participant.role == "SPEAKER" {
            Button { viewModel.demote(userId: userId) } label: { Text(.liveVideoMoveToViewer) }
        }
        if canPublishLiveAudio(participant.role) {
            Button {
                if participant.isMuted { viewModel.unmute(userId: userId) } else { viewModel.mute(userId: userId) }
            } label: {
                Text(participant.isMuted ? L10nKey.liveAudioUnmuteAction : L10nKey.liveAudioMuteAction)
            }
            Button {
                if participant.isCameraOff { viewModel.restoreCamera(userId: userId) } else { viewModel.forceCameraOff(userId: userId) }
            } label: {
                Text(participant.isCameraOff ? L10nKey.liveVideoCameraOnAction : L10nKey.liveVideoCameraOffAction)
            }
        }
        LiveChatMuteMenuItems(engagement: engagement, userId: userId)
        if participant.role != "HOST" {
            Button(role: .destructive) {
                confirmRemoveUserId = userId
            } label: {
                Text(.liveAudioRemoveAction)
            }
        }
    }
}
