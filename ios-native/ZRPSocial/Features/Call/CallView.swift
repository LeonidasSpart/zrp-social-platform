import AVFoundation
import SwiftUI

/// The native equivalent of `CallComponent.tsx` - a full-screen overlay
/// driven entirely by `CallViewModel`'s real WebRTC state, not a mock
/// call UI. Rendered above the whole app, regardless of which screen is
/// on the navigation stack, matching the website's own fix (`CallContext.
/// tsx` renders `CallComponent` as a sibling of `{children}` at the app
/// root) and the Android sibling's identical app-root overlay.
struct CallView: View {

    @ObservedObject var viewModel: CallViewModel

    @State private var durationSeconds = 0
    @State private var durationTask: Task<Void, Never>?

    /// True once a call has already ended (`phase == .idle`) but the
    /// reason is still up to be shown - see `MainTabView`'s own doc
    /// comment on why the overlay now stays presented for this case
    /// instead of unmounting before `viewModel.error` could ever be
    /// read.
    private var isShowingError: Bool {
        viewModel.phase == .idle && viewModel.error != nil
    }

    var body: some View {
        ZStack {
            Color.black.ignoresSafeArea()

            if isShowingError {
                errorOverlay
            } else {
                liveCallContent
            }
        }
        .onChange(of: viewModel.phase) { _, phase in
            restartDurationTimer(active: phase == .active && viewModel.hasRemoteStream)
        }
        .onChange(of: viewModel.hasRemoteStream) { _, hasStream in
            restartDurationTimer(active: viewModel.phase == .active && hasStream)
        }
        .onDisappear { durationTask?.cancel() }
    }

    @ViewBuilder
    private var liveCallContent: some View {
        if viewModel.isVideo, let remoteTrack = viewModel.remoteVideoTrack {
            CallVideoView(track: remoteTrack)
                .ignoresSafeArea()
        } else {
            centerPlaceholder
        }

        if viewModel.isVideo, viewModel.isVideoEnabled, let localTrack = viewModel.localVideoTrack {
            CallVideoView(track: localTrack, mirror: true)
                .frame(width: 120, height: 160)
                .clipShape(RoundedRectangle(cornerRadius: ZrpRadius.md, style: .continuous))
                .padding(ZrpSpacing.lg)
                .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .bottomTrailing)
        }

        VStack(spacing: ZrpSpacing.xs) {
            Text(viewModel.callerName.isEmpty ? L10n.string(.iosCallFallbackName) : viewModel.callerName)
                .font(.title2.weight(.semibold))
                .foregroundStyle(.white)

            if let statusText {
                Text(verbatim: statusText)
                    .font(.subheadline)
                    .foregroundStyle(.white.opacity(0.75))
            }
        }
        .padding(.top, 56)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
        .padding(.horizontal, ZrpSpacing.xl)

        controls
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .bottom)
    }

    /// Shown once a call has ended with something to say about why -
    /// rejected, unavailable, no answer, a connection failure - long
    /// enough for a person to actually read it, dismissed only by their
    /// own tap (`viewModel.dismissError()`), never by a timer racing
    /// their reading speed.
    private var errorOverlay: some View {
        VStack(spacing: ZrpSpacing.lg) {
            Image(systemName: "phone.down.fill")
                .font(.system(size: 40))
                .foregroundStyle(ZrpColor.red)

            if let error = viewModel.error {
                Text(verbatim: callErrorMessage(error))
                    .font(.body)
                    .foregroundStyle(.white)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal, ZrpSpacing.xl)
            }

            callButton(
                systemImage: "xmark",
                background: Color(white: 0.22),
                accessibilityLabel: .iosA11yDismiss,
                action: viewModel.dismissError
            )
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    // MARK: - Center content

    private var centerPlaceholder: some View {
        Group {
            switch viewModel.phase {
            case .incoming:
                ZStack {
                    Circle().fill(ZrpColor.red.opacity(0.3)).frame(width: 96, height: 96)
                    Image(systemName: "phone.fill")
                        .font(.system(size: 40))
                        .foregroundStyle(.white)
                }
            case .calling where !viewModel.hasRemoteStream:
                ProgressView().tint(ZrpColor.red).scaleEffect(1.4)
            default:
                VStack(spacing: 4) {
                    Text(.iosCallNoVideo)
                        .foregroundStyle(.white.opacity(0.6))
                }
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    private var statusText: String? {
        switch viewModel.phase {
        case .incoming:
            return L10n.string(viewModel.isVideo ? .iosCallIncomingVideo : .iosCallIncomingVoice)
        case .calling where !viewModel.hasRemoteStream:
            return L10n.string(.iosCallRinging)
        default:
            return viewModel.hasRemoteStream ? formatCallDuration(durationSeconds) : nil
        }
    }

    // MARK: - Controls

    @ViewBuilder
    private var controls: some View {
        VStack(spacing: ZrpSpacing.lg) {
            if viewModel.phase == .active, viewModel.hasRemoteStream {
                HStack(spacing: ZrpSpacing.xl) {
                    callButton(
                        systemImage: viewModel.isSpeakerOn ? "speaker.wave.2.fill" : "speaker.fill",
                        background: viewModel.isSpeakerOn ? ZrpColor.red : Color(white: 0.22),
                        accessibilityLabel: viewModel.isSpeakerOn ? .iosA11yTurnOffSpeaker : .iosA11yTurnOnSpeaker,
                        action: viewModel.toggleSpeaker
                    )
                    if viewModel.isVideo, viewModel.isVideoEnabled {
                        callButton(
                            systemImage: "arrow.triangle.2.circlepath.camera.fill",
                            background: Color(white: 0.22),
                            accessibilityLabel: .iosLiveSwitchCamera,
                            action: viewModel.switchCamera
                        )
                    }
                }
            }

            HStack(spacing: ZrpSpacing.xl) {
                if viewModel.phase == .active, viewModel.hasRemoteStream {
                    callButton(
                        systemImage: viewModel.isMuted ? "mic.slash.fill" : "mic.fill",
                        background: viewModel.isMuted ? ZrpColor.red : Color(white: 0.22),
                        accessibilityLabel: viewModel.isMuted ? .iosA11yUnmute : .iosA11yMute,
                        action: viewModel.toggleMute
                    )
                    if viewModel.isVideo {
                        callButton(
                            systemImage: viewModel.isVideoEnabled ? "video.fill" : "video.slash.fill",
                            background: viewModel.isVideoEnabled ? Color(white: 0.22) : ZrpColor.red,
                            accessibilityLabel: viewModel.isVideoEnabled ? .iosA11yTurnOffCamera : .iosA11yTurnOnCamera,
                            action: viewModel.toggleVideo
                        )
                    }
                }

                callButton(
                    systemImage: viewModel.phase == .incoming ? "phone.fill" : "phone.down.fill",
                    background: viewModel.phase == .incoming ? Color(red: 0.13, green: 0.77, blue: 0.37) : ZrpColor.red,
                    accessibilityLabel: viewModel.phase == .incoming ? .iosA11yAcceptCall : .iosA11yEndCall,
                    large: true,
                    action: {
                        if viewModel.phase == .incoming {
                            acceptIncomingCall()
                        } else {
                            viewModel.endCall()
                        }
                    }
                )

                if viewModel.phase == .incoming {
                    callButton(
                        systemImage: "xmark",
                        background: ZrpColor.red,
                        accessibilityLabel: .iosA11yDeclineCall,
                        action: { viewModel.rejectCall() }
                    )
                }
            }
        }
        .padding(.bottom, 48)
    }

    /// `accessibilityLabel` is required, never defaulted, so every call
    /// site states the real action (Accept/Decline/End/Mute/Unmute/
    /// Speaker/Camera/Switch camera/Dismiss) instead of a button that
    /// VoiceOver would otherwise announce only as "Button" - these are
    /// icon-only controls with no visible text, so the accessibility
    /// label is the ONLY way a VoiceOver user learns what each one does.
    /// A toggle button (mute, video, speaker) communicates its on/off
    /// state the same way `InlineVideoView`'s own mute button already
    /// does: the label text itself switches ("Mute" vs "Unmute", "Turn
    /// off camera" vs "Turn on camera") rather than a separate trait/
    /// value, so VoiceOver always announces the action the next tap
    /// performs. No button here is ever shown in a disabled state - each
    /// one is conditionally rendered instead (e.g. the speaker/camera row
    /// only appears once a call is actually active), so there is no
    /// disabled-state case to add on top of this.
    private func callButton(
        systemImage: String,
        background: Color,
        accessibilityLabel: L10nKey,
        large: Bool = false,
        action: @escaping () -> Void
    ) -> some View {
        Button(action: action) {
            Image(systemName: systemImage)
                .font(.system(size: large ? 28 : 22))
                .foregroundStyle(.white)
                .frame(width: large ? 72 : 56, height: large ? 72 : 56)
                .background(background, in: Circle())
        }
        .accessibilityLabel(Text(accessibilityLabel))
        .accessibilityAddTraits(.isButton)
    }

    /// Matches `getUserMedia`'s own browser permission prompt, asked
    /// right when the callee actually accepts rather than as soon as the
    /// incoming-call screen appears - the Android sibling's own
    /// `acceptPermissionLauncher` does the same. A declined microphone
    /// releases the caller via `rejectCall()` rather than leaving the
    /// call silently stuck; a declined camera on a video call is not
    /// separately gated here either (matching the Android sibling
    /// exactly) - `acceptCall()` still proceeds and any real capture
    /// failure surfaces as `.micCameraError` from inside it.
    private func acceptIncomingCall() {
        Task {
            let micGranted = await AVCaptureDevice.requestAccess(for: .audio)
            if micGranted {
                viewModel.acceptCall()
            } else {
                viewModel.rejectCall()
            }
        }
    }

    // MARK: - Duration

    private func restartDurationTimer(active: Bool) {
        durationTask?.cancel()
        durationTask = nil
        durationSeconds = 0
        guard active else { return }
        durationTask = Task {
            while !Task.isCancelled {
                try? await Task.sleep(for: .seconds(1))
                guard !Task.isCancelled else { return }
                durationSeconds += 1
            }
        }
    }

    /// Maps `CallViewModel.CallError` (which cannot resolve `L10nKey`
    /// strings for itself) to real translated text, mirroring the
    /// Android sibling's own `callErrorMessage()`. The detail suffix on
    /// `.connectionError`/`.micCameraError` matches the website's own
    /// `t("chat.connectionError") + " " + err.message` concatenation.
    private func callErrorMessage(_ error: CallError) -> String {
        switch error {
        case .rejected: return L10n.string(.chatCallRejected)
        case .unavailable: return L10n.string(.chatCallUnavailable)
        case .connectionFailed: return L10n.string(.chatConnectionFailed)
        case .noAnswer: return L10n.string(.chatCallNoAnswer)
        case .connectionError(let detail): return L10n.string(.chatConnectionError) + " " + detail
        case .micCameraError(let detail): return L10n.string(.chatMicCameraError) + " " + detail
        case .missingCallerId: return L10n.string(.chatMissingCallerId)
        }
    }
}
