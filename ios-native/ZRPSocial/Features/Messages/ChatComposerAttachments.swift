import PhotosUI
import SwiftUI
import UniformTypeIdentifiers

/// The "+" attachment menu and the microphone, shared by both composers.
///
/// One menu for everything that can be attached - camera, photo library,
/// GIF, video, document - rather than a row of five separate icons. On a
/// 375pt phone five 44pt icons plus the microphone and the send button
/// left the text field itself around 8pt wide: the message box was the
/// one control in the composer that had no room. Collapsing the
/// attachment entry points into a single 44pt target is what the
/// website's own composer does with its paperclip, and gives the field
/// back the width it needs.
///
/// Video, documents and voice notes send **immediately** rather than
/// waiting in the composer next to a caption. That is web's behaviour
/// and it is not a shortcut: each of the three must be sent with its own
/// marker as the message body (see `ChatAttachment.swift`), so there is
/// no room for a caption in the same message without breaking how every
/// other client identifies the attachment. Photos are unaffected and
/// still take a caption, because an image needs no marker.
struct ChatAttachmentMenu: View {

    /// Called once the file is picked. The caller uploads and sends.
    let onPick: (PendingChatAttachment) -> Void
    let isBusy: Bool

    /// The host's own photo-library selection, so a picked picture
    /// lands in the host's pending-image row (where it takes a caption)
    /// exactly as before. `nil` leaves the photo entry out.
    var photoSelection: Binding<[PhotosPickerItem]>? = nil

    /// Opens the device camera. `nil` leaves the entry out.
    var onCamera: (() -> Void)? = nil

    /// Opens the GIF picker. `nil` leaves the entry out.
    var onGif: (() -> Void)? = nil

    @State private var pickedVideo: PhotosPickerItem?
    @State private var isImportingDocument = false
    @State private var importFailed = false

    var body: some View {
        Menu {
            if let onCamera {
                Button(action: onCamera) {
                    Label { Text(.chatOpenCamera) } icon: {
                        Image(systemName: "camera")
                    }
                }
            }
            if let photoSelection {
                // One picture per message: the route stores a single
                // `imageUrl`, so offering a multi-select would promise
                // something it cannot keep.
                PhotosPicker(
                    selection: photoSelection,
                    maxSelectionCount: 1,
                    matching: .images
                ) {
                    Label { Text(.iosA11yAddPhoto) } icon: {
                        Image(systemName: "photo")
                    }
                }
            }
            if let onGif {
                Button(action: onGif) {
                    Label { Text(.composerAddGif) } icon: {
                        Image(systemName: "text.below.photo")
                    }
                }
            }
            PhotosPicker(selection: $pickedVideo, matching: .videos, photoLibrary: .shared()) {
                Label { Text(.shortsUploadChooseVideo) } icon: {
                    Image(systemName: "film")
                }
            }
            Button { isImportingDocument = true } label: {
                Label { Text(.chatUploadDocument) } icon: {
                    Image(systemName: "doc")
                }
            }
        } label: {
            Image(systemName: "plus.circle.fill")
                .font(.title2)
                .foregroundStyle(ZrpColor.onSurfaceMuted)
                .frame(width: ZrpMetrics.minTouchTarget, height: ZrpMetrics.minTouchTarget)
                .contentShape(Rectangle())
        }
        .disabled(isBusy)
        .accessibilityLabel(Text(.iosChatAddAttachment))
        .onChange(of: pickedVideo) { _, item in
            guard let item else { return }
            pickedVideo = nil
            Task {
                // `try?` already flattens `loadTransferable`'s optional.
                guard let media = try? await item.loadTransferable(type: PickedMedia.self)
                else {
                    importFailed = true
                    return
                }
                onPick(.video(media))
            }
        }
        .fileImporter(
            isPresented: $isImportingDocument,
            // `.item` rather than a list of types: the router's `blob`
            // category accepts arbitrary files under 8MB, so narrowing
            // the picker here would hide files the server would accept.
            allowedContentTypes: [.item],
            allowsMultipleSelection: false
        ) { result in
            guard case .success(let urls) = result, let url = urls.first else { return }
            guard let document = try? PickedDocument(copying: url) else {
                importFailed = true
                return
            }
            onPick(.document(document))
        }
        .alert(Text(.iosErrorGenericTitle), isPresented: $importFailed) {
            Button { importFailed = false } label: { Text(.actionCancel) }
        } message: {
            Text(.composerErrUploadFailed)
        }
    }
}

/// The microphone button, and the strip that replaces the composer while
/// a note is being recorded.
struct VoiceNoteComposer: View {

    @ObservedObject var recorder: VoiceRecorder
    let onRecorded: (PendingChatAttachment) -> Void
    let isBusy: Bool

    @State private var permissionDenied = false

    var body: some View {
        Group {
            if recorder.isRecording {
                recordingStrip
            } else {
                micButton
            }
        }
        .alert(Text(.iosErrorGenericTitle), isPresented: $permissionDenied) {
            Button { permissionDenied = false } label: { Text(.actionCancel) }
        } message: {
            Text(.iosChatMicDenied)
        }
    }

    private var micButton: some View {
        Button {
            Task {
                do {
                    try await recorder.start()
                } catch VoiceRecorder.Failure.permissionDenied {
                    permissionDenied = true
                } catch {
                    permissionDenied = true
                }
            }
        } label: {
            Image(systemName: "mic")
                .font(.title3)
                .foregroundStyle(ZrpColor.onSurfaceMuted)
                .frame(width: ZrpMetrics.minTouchTarget, height: ZrpMetrics.minTouchTarget)
                .contentShape(Rectangle())
        }
        .disabled(isBusy)
        .accessibilityLabel(Text(.chatRecordVoiceMessage))
    }

    /// Tap to start, tap to send, trash to discard.
    ///
    /// Deliberately not hold-to-record: a press-and-hold gesture is
    /// unusable with VoiceOver and awkward for anyone with a motor
    /// impairment, and a voice note that can only be sent by holding
    /// still for a minute is not a feature everybody has.
    private var recordingStrip: some View {
        HStack(spacing: ZrpSpacing.md) {
            Button { recorder.cancel() } label: {
                Image(systemName: "trash")
                    .font(.title3)
                    .foregroundStyle(ZrpColor.onSurfaceMuted)
                    .frame(width: ZrpMetrics.minTouchTarget, height: ZrpMetrics.minTouchTarget)
                    .contentShape(Rectangle())
            }
            .accessibilityLabel(Text(.actionCancel))

            Circle()
                .fill(ZrpColor.red)
                .frame(width: 8, height: 8)
                // The dot pulses with the input level, so someone can
                // see the microphone is actually hearing them rather
                // than trusting a static red dot.
                .scaleEffect(1 + recorder.level)
                .animation(.easeOut(duration: 0.1), value: recorder.level)

            Text(verbatim: Self.elapsed(recorder.elapsedSeconds))
                .font(.subheadline.monospacedDigit())
                .foregroundStyle(ZrpColor.onSurface)

            Spacer(minLength: 0)

            Button {
                guard let finished = recorder.finish() else { return }
                onRecorded(
                    .voice(
                        url: finished.url,
                        fileName: finished.url.lastPathComponent,
                        seconds: finished.seconds
                    )
                )
            } label: {
                Image(systemName: "arrow.up.circle.fill")
                    .font(.title2)
                    .foregroundStyle(ZrpColor.red)
                    .frame(width: ZrpMetrics.minTouchTarget, height: ZrpMetrics.minTouchTarget)
                    .contentShape(Rectangle())
            }
            .accessibilityLabel(Text(.iosA11ySendMessage))
        }
        .padding(.horizontal, ZrpSpacing.md)
        .padding(.vertical, ZrpSpacing.sm)
        .background(ZrpColor.surfaceElevated)
        .clipShape(Capsule())
    }

    /// `m:ss`, matching the marker the note will be sent with.
    static func elapsed(_ seconds: Int) -> String {
        "\(seconds / 60):\(String(format: "%02d", seconds % 60))"
    }
}
