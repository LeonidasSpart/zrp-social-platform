import AVKit
import SwiftUI

// Screens and controls shared by the Live Audio and Live Video rooms:
// the scheduled-room state (start/cancel for the host, "Remind me" for
// everyone else), the ended state with the room's real replays, the
// replay player, and the host/moderator menu.

// MARK: - Scheduled

/// A SCHEDULED room - not joinable yet (`joinRoom` answers
/// `room_not_live`), so instead of a failed join this shows what the
/// room is and when, with the actions that are real for this person:
///
/// - the host can start it now (`POST .../start`) or cancel it
///   (`POST .../cancel`);
/// - anyone else can ask to be reminded (`POST/DELETE .../reminder`).
///   The server pushes a notification to every subscriber the moment
///   the host starts the room (`notifyReminderSubscribers`), so nothing
///   here polls; pull-to-refresh re-checks on demand.
///
/// Discovery lists only LIVE rooms, so a scheduled room is reached
/// through its link - which is why the share action sits right here.
struct LiveScheduledRoomView: View {

    let kind: LiveRoomKind
    let room: LiveAudioRoom
    let host: LiveAudioHost?
    let isHost: Bool
    @ObservedObject var engagement: LiveEngagementViewModel
    let isBusy: Bool
    let actionError: String?
    let onStart: () -> Void
    let onCancel: () -> Void
    let onRefresh: () async -> Void

    @State private var confirmCancel = false

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: ZrpSpacing.lg) {
                Label { Text(.settingsScheduled) } icon: { Image(systemName: "calendar") }
                    .font(.caption.weight(.bold))
                    .foregroundStyle(ZrpColor.red)

                Text(verbatim: room.title)
                    .font(.title2.weight(.bold))
                    .foregroundStyle(ZrpColor.onSurface)

                if let description = room.description, !description.isEmpty {
                    Text(verbatim: description)
                        .font(.subheadline)
                        .foregroundStyle(ZrpColor.onSurfaceMuted)
                }

                if let host {
                    HStack(spacing: ZrpSpacing.sm) {
                        AvatarView(url: host.avatarUrl, displayName: host.displayName, size: ZrpMetrics.avatarSmall)
                        Text(.liveAudioHostedBy, ["name": host.displayName])
                            .font(.subheadline)
                            .foregroundStyle(ZrpColor.onSurface)
                            .lineLimit(1)
                    }
                }

                if let scheduledAt = room.scheduledAt {
                    Label {
                        Text(.iosLiveScheduledFor, ["date": liveFormattedDate(scheduledAt)])
                    } icon: {
                        Image(systemName: "clock")
                    }
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(ZrpColor.onSurface)
                }

                if isHost {
                    hostActions
                } else {
                    reminderAction
                }

                if let error = actionError ?? engagement.reminderError {
                    Text(verbatim: error)
                        .font(.footnote)
                        .foregroundStyle(ZrpColor.red)
                }

                if let url = kind.webURL(roomId: room.id) {
                    ShareLink(item: url) {
                        Label { Text(.profileShare) } icon: { Image(systemName: "square.and.arrow.up") }
                            .font(.subheadline.weight(.semibold))
                            .frame(minHeight: ZrpMetrics.minTouchTarget)
                    }
                    .tint(ZrpColor.onSurface)
                }
            }
            .padding(ZrpSpacing.xl)
            .frame(maxWidth: ZrpMetrics.contentMaxWidth, alignment: .leading)
            .frame(maxWidth: .infinity)
        }
        .refreshable { await onRefresh() }
        .confirmationDialog(
            Text(.iosLiveCancelScheduledConfirm),
            isPresented: $confirmCancel,
            titleVisibility: .visible
        ) {
            Button(role: .destructive) {
                onCancel()
            } label: {
                Text(.iosLiveCancelScheduled)
            }
        }
    }

    private var hostActions: some View {
        VStack(spacing: ZrpSpacing.sm) {
            Button(action: onStart) {
                Group {
                    if isBusy {
                        ProgressView().tint(.white)
                    } else {
                        Text(.iosLiveStartNow)
                    }
                }
                .font(.subheadline.weight(.semibold))
                .frame(maxWidth: .infinity, minHeight: ZrpMetrics.minTouchTarget)
                .background(ZrpColor.red, in: Capsule())
                .foregroundStyle(.white)
            }
            .disabled(isBusy)

            Button(role: .destructive) {
                confirmCancel = true
            } label: {
                Text(.iosLiveCancelScheduled)
                    .font(.subheadline.weight(.semibold))
                    .frame(maxWidth: .infinity, minHeight: ZrpMetrics.minTouchTarget)
            }
            .buttonStyle(.bordered)
            .disabled(isBusy)
        }
    }

    private var reminderAction: some View {
        VStack(alignment: .leading, spacing: ZrpSpacing.sm) {
            Button {
                engagement.toggleReminder()
            } label: {
                HStack(spacing: ZrpSpacing.sm) {
                    if engagement.isReminderBusy {
                        ProgressView().tint(engagement.reminderSet ? ZrpColor.onSurface : .white)
                    } else {
                        Image(systemName: engagement.reminderSet ? "bell.fill" : "bell")
                    }
                    Text(engagement.reminderSet ? L10nKey.iosLiveReminderSet : L10nKey.iosLiveRemindMe)
                }
                .font(.subheadline.weight(.semibold))
                .frame(maxWidth: .infinity, minHeight: ZrpMetrics.minTouchTarget)
                .background(
                    engagement.reminderSet ? ZrpColor.surfaceElevated : ZrpColor.red,
                    in: Capsule()
                )
                .foregroundStyle(engagement.reminderSet ? ZrpColor.onSurface : Color.white)
            }
            .disabled(engagement.isReminderBusy)
            .accessibilityHint(engagement.reminderSet ? Text(.iosLiveRemoveReminder) : Text(.iosLiveReminderHint))

            Text(.iosLiveReminderHint)
                .font(.footnote)
                .foregroundStyle(ZrpColor.onSurfaceMuted)
        }
    }
}

/// A scheduled start time, in the app's chosen language.
func liveFormattedDate(_ date: Date) -> String {
    date.formatted(Date.FormatStyle(date: .abbreviated, time: .shortened).locale(L10n.activeLocale))
}

// MARK: - Ended

/// The end of a room for this person: it ended, it was cancelled, or
/// they were removed. An ended room shows its real replays
/// (`GET .../replay`) - an empty list is the honest answer today, since
/// recording storage is not configured on this deployment yet.
struct LiveEndedRoomView: View {

    enum Reason {
        case ended
        case cancelled
        case removed
    }

    let kind: LiveRoomKind
    let reason: Reason
    @ObservedObject var engagement: LiveEngagementViewModel
    let onBack: () -> Void

    var body: some View {
        ScrollView {
            VStack(spacing: ZrpSpacing.lg) {
                Image(systemName: kind == .video ? "video.slash" : "mic.slash")
                    .font(.largeTitle)
                    .foregroundStyle(ZrpColor.onSurfaceMuted)
                    .accessibilityHidden(true)

                Text(titleKey)
                    .font(.headline)
                    .multilineTextAlignment(.center)

                Button(action: onBack) {
                    Text(kind == .video ? L10nKey.liveVideoBackToLiveVideo : L10nKey.liveAudioBackToLiveAudio)
                        .font(.subheadline.weight(.semibold))
                        .padding(.horizontal, ZrpSpacing.xl)
                        .frame(minHeight: ZrpMetrics.minTouchTarget)
                        .background(ZrpColor.red, in: Capsule())
                        .foregroundStyle(.white)
                }

                if reason == .ended {
                    LiveReplayList(engagement: engagement, canDelete: false)
                        .padding(.top, ZrpSpacing.lg)
                }
            }
            .padding(ZrpSpacing.xl)
            .frame(maxWidth: ZrpMetrics.contentMaxWidth)
            .frame(maxWidth: .infinity)
        }
        .task {
            if reason == .ended { await engagement.loadRecordings() }
        }
    }

    private var titleKey: L10nKey {
        switch reason {
        case .ended: return .liveAudioRoomEndedTitle
        case .cancelled: return .iosLiveCancelledTitle
        case .removed: return .liveAudioRemovedTitle
        }
    }
}

// MARK: - Replay

/// A room's completed recordings. Deleting one is offered only where the
/// server would allow it: to an active host/moderator of a live room
/// (`deleteRecording` re-checks the caller is still an active
/// authority participant).
struct LiveReplayList: View {

    @ObservedObject var engagement: LiveEngagementViewModel
    let canDelete: Bool

    @State private var playing: LiveRecording?
    @State private var pendingDelete: LiveRecording?

    var body: some View {
        VStack(alignment: .leading, spacing: ZrpSpacing.sm) {
            Text(.iosLiveReplayTitle)
                .font(.headline)
                .frame(maxWidth: .infinity, alignment: .leading)

            switch engagement.recordingsPhase {
            case .idle, .loading:
                ProgressView().tint(ZrpColor.red)
            case .failed(let message):
                HStack {
                    Text(verbatim: message)
                        .font(.footnote)
                        .foregroundStyle(ZrpColor.onSurfaceMuted)
                    Spacer()
                    Button {
                        Task { await engagement.loadRecordings() }
                    } label: {
                        Text(.actionRetry)
                            .frame(minHeight: ZrpMetrics.minTouchTarget)
                    }
                    .tint(ZrpColor.red)
                }
            case .loaded:
                if engagement.recordings.isEmpty {
                    Text(.iosLiveReplayEmpty)
                        .font(.footnote)
                        .foregroundStyle(ZrpColor.onSurfaceMuted)
                        .frame(maxWidth: .infinity, alignment: .leading)
                } else {
                    ForEach(engagement.recordings) { recording in
                        row(recording)
                    }
                }
            }
        }
        .sheet(item: $playing) { recording in
            if let url = playableURL(recording) {
                LiveReplayPlayer(url: url)
            }
        }
        .confirmationDialog(
            Text(.iosLiveReplayDeleteConfirm),
            isPresented: Binding(get: { pendingDelete != nil }, set: { if !$0 { pendingDelete = nil } }),
            titleVisibility: .visible
        ) {
            Button(role: .destructive) {
                if let recording = pendingDelete { engagement.deleteRecording(recording) }
                pendingDelete = nil
            } label: {
                Text(.actionDelete)
            }
        }
    }

    private func row(_ recording: LiveRecording) -> some View {
        HStack(spacing: ZrpSpacing.md) {
            Button {
                playing = recording
            } label: {
                HStack(spacing: ZrpSpacing.md) {
                    Image(systemName: "play.circle.fill")
                        .font(.title2)
                        .foregroundStyle(ZrpColor.red)
                    VStack(alignment: .leading, spacing: 2) {
                        if let startedAt = recording.startedAt {
                            Text(verbatim: liveFormattedDate(startedAt))
                                .font(.subheadline.weight(.semibold))
                                .foregroundStyle(ZrpColor.onSurface)
                        }
                        if let seconds = recording.durationSeconds, let duration = liveFormattedDuration(seconds) {
                            Text(verbatim: duration)
                                .font(.caption.monospacedDigit())
                                .foregroundStyle(ZrpColor.onSurfaceMuted)
                        }
                    }
                    Spacer(minLength: 0)
                }
                .frame(minHeight: ZrpMetrics.minTouchTarget)
            }
            .buttonStyle(.plain)
            .disabled(playableURL(recording) == nil)
            .accessibilityLabel(Text(.iosLiveReplayPlay))

            if canDelete {
                if engagement.deletingRecordingId == recording.id {
                    ProgressView()
                } else {
                    Button(role: .destructive) {
                        pendingDelete = recording
                    } label: {
                        Image(systemName: "trash")
                            .frame(width: ZrpMetrics.minTouchTarget, height: ZrpMetrics.minTouchTarget)
                    }
                    .accessibilityLabel(Text(.actionDelete))
                }
            }
        }
        .padding(.horizontal, ZrpSpacing.md)
        .background(ZrpColor.surfaceElevated, in: RoundedRectangle(cornerRadius: ZrpRadius.md, style: .continuous))
    }

    /// Egress writes whatever location the storage provider reports;
    /// only an http(s) one is something AVPlayer can stream.
    private func playableURL(_ recording: LiveRecording) -> URL? {
        guard
            let raw = recording.mediaUrl,
            let url = URL(string: raw),
            let scheme = url.scheme?.lowercased(),
            scheme == "https" || scheme == "http"
        else { return nil }
        return url
    }
}

/// `1:02:03` / `4:05`, for a replay's length.
func liveFormattedDuration(_ seconds: Int) -> String? {
    guard seconds > 0 else { return nil }
    let formatter = DateComponentsFormatter()
    formatter.allowedUnits = seconds >= 3600 ? [.hour, .minute, .second] : [.minute, .second]
    formatter.unitsStyle = .positional
    formatter.zeroFormattingBehavior = .pad
    return formatter.string(from: TimeInterval(seconds))
}

private struct LiveReplayPlayer: View {

    let url: URL
    @State private var player: AVPlayer?

    var body: some View {
        ZStack {
            Color.black.ignoresSafeArea()
            if let player {
                VideoPlayer(player: player)
                    .ignoresSafeArea()
            } else {
                ProgressView().tint(.white)
            }
        }
        .onAppear {
            let player = AVPlayer(url: url)
            self.player = player
            player.play()
        }
        .onDisappear { player?.pause() }
    }
}

// MARK: - Host/moderator menu

/// Menu items only a HOST/MODERATOR is given: chat slow mode and
/// recording. Both routes re-check that authority server-side
/// (`requireHostOrModerator`); this is where they are offered, never
/// whether they are allowed.
///
/// "Start recording" stays visible even though this deployment answers
/// `503 replay_not_configured` today - the control is real and wired, and
/// the person is told exactly why it did nothing rather than the control
/// silently disappearing.
struct LiveAuthorityMenuItems: View {

    @ObservedObject var engagement: LiveEngagementViewModel

    var body: some View {
        Menu {
            ForEach(liveSlowModeOptions, id: \.self) { seconds in
                Button {
                    engagement.setSlowMode(seconds: seconds)
                } label: {
                    if seconds == engagement.slowModeSeconds {
                        Label { slowModeTitle(seconds) } icon: { Image(systemName: "checkmark") }
                    } else {
                        slowModeTitle(seconds)
                    }
                }
            }
        } label: {
            Label { Text(.iosLiveChatSlowMode) } icon: { Image(systemName: "tortoise") }
        }

        if engagement.isRecording {
            Button {
                engagement.stopRecording()
            } label: {
                Label { Text(.iosLiveReplayStop) } icon: { Image(systemName: "stop.circle") }
            }
            .disabled(engagement.isRecordingBusy)
        } else {
            Button {
                engagement.startRecording()
            } label: {
                Label { Text(.iosLiveReplayStart) } icon: { Image(systemName: "record.circle") }
            }
            .disabled(engagement.isRecordingBusy)
        }
    }

    private func slowModeTitle(_ seconds: Int) -> Text {
        seconds == 0 ? Text(.iosLiveChatSlowModeOff) : Text(.iosLiveChatSeconds, ["n": "\(seconds)"])
    }
}

/// The red "Recording" chip - shown while this room is known to be
/// recording, so nobody is recorded without seeing it.
struct LiveRecordingChip: View {
    var body: some View {
        Label { Text(.iosLiveReplayRecording) } icon: { Image(systemName: "record.circle.fill") }
            .font(.caption2.weight(.bold))
            .foregroundStyle(.white)
            .padding(.horizontal, ZrpSpacing.sm)
            .padding(.vertical, ZrpSpacing.xs)
            .background(ZrpColor.red, in: Capsule())
    }
}

// MARK: - Engagement-observing wrappers
//
// A room screen observes its room view model; the engagement model it
// owns is a separate `ObservableObject`, so anything a room screen draws
// from engagement state lives in one of these small views that observe
// it directly. Forwarding every engagement change through the room model
// instead would re-render the whole camera stage on every chat message.

/// The recording chip, while this room is known to be recording.
struct LiveRecordingIndicator: View {
    @ObservedObject var engagement: LiveEngagementViewModel

    var body: some View {
        if engagement.isRecording {
            LiveRecordingChip()
        }
    }
}

/// Why recording did not start/stop (today, most often
/// `replay_not_configured`).
struct LiveReplayNotice: View {
    @ObservedObject var engagement: LiveEngagementViewModel
    var onVideo = false

    var body: some View {
        if let notice = engagement.replayNotice {
            LiveNoticeBanner(text: notice, onVideo: onVideo) { engagement.replayNotice = nil }
        }
    }
}

/// "Mute in chat" / "Allow in chat" for one participant, for a menu.
/// Renders nothing unless this person may chat-mute that one
/// (`LiveEngagementViewModel.canChatMute`). When the current mute state
/// is unknown (the detail route does not report it) both are offered.
struct LiveChatMuteMenuItems: View {
    @ObservedObject var engagement: LiveEngagementViewModel
    let userId: String

    var body: some View {
        if engagement.canChatMute(userId: userId) {
            let known = engagement.knownChatMutes[userId]
            if known != true {
                Button {
                    engagement.setChatMute(userId: userId, muted: true)
                } label: {
                    Text(.iosLiveChatMuteUser)
                }
            }
            if known != false {
                Button {
                    engagement.setChatMute(userId: userId, muted: false)
                } label: {
                    Text(.iosLiveChatUnmuteUser)
                }
            }
        }
    }
}

/// The reaction particles for a room.
struct LiveReactionLayerHost: View {
    @ObservedObject var engagement: LiveEngagementViewModel

    var body: some View {
        LiveReactionLayer(bursts: engagement.reactionBursts)
    }
}

/// A dismissible one-line notice inside a room (a replay that could not
/// start, a moderation action that failed).
struct LiveNoticeBanner: View {

    let text: String
    var onVideo = false
    let onDismiss: () -> Void

    var body: some View {
        HStack(alignment: .top, spacing: ZrpSpacing.sm) {
            Image(systemName: "info.circle")
                .accessibilityHidden(true)
            Text(verbatim: text)
                .font(.footnote)
                .frame(maxWidth: .infinity, alignment: .leading)
            Button(action: onDismiss) {
                Image(systemName: "xmark")
                    .font(.caption)
                    .frame(width: ZrpMetrics.minTouchTarget, height: ZrpMetrics.minTouchTarget)
            }
            .accessibilityLabel(Text(.chatDismiss))
        }
        .foregroundStyle(onVideo ? Color.white : ZrpColor.onSurface)
        .padding(.leading, ZrpSpacing.md)
        .background(
            onVideo ? Color.black.opacity(0.6) : ZrpColor.surfaceElevated,
            in: RoundedRectangle(cornerRadius: ZrpRadius.md, style: .continuous)
        )
        .accessibilityElement(children: .contain)
    }
}
