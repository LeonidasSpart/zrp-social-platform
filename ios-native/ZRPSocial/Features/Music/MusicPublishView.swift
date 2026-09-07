import PhotosUI
import SwiftUI

/// Upload and publish a track.
///
/// Two server calls, in the website's own order: one UploadThing
/// transfer carrying the audio and the cover together, then
/// `POST /api/music/tracks`. If the second fails, the first is not
/// thrown away - Retry finishes publishing from the upload that already
/// landed.
struct MusicPublishView: View {

    @ObservedObject var viewModel: MusicStudioViewModel

    @State private var title = ""
    @State private var genre = ""
    @State private var artistName = ""
    @State private var explicit = false
    @State private var audio: PickedAudioFile?
    @State private var cover: PickedMedia?
    @State private var coverSelection: PhotosPickerItem?
    @State private var isImportingAudio = false
    @State private var isPreparingAudio = false

    private var isBusy: Bool {
        viewModel.publishStage != .idle || isPreparingAudio
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: ZrpSpacing.lg) {
                if viewModel.pendingUpload != nil {
                    pendingUploadNotice
                }

                field(.musicShellSongTitlePlaceholder, text: $title)
                field(.musicShellGenrePlaceholder, text: $genre)
                field(.musicShellArtistNamePlaceholder, text: $artistName)

                Toggle(isOn: $explicit) {
                    Text(.musicStudioExplicitLabel)
                        .font(.subheadline)
                        .foregroundStyle(ZrpColor.onSurface)
                }
                .tint(ZrpColor.red)

                audioPicker
                coverPicker

                if let error = viewModel.publishError {
                    Text(verbatim: error)
                        .font(.footnote)
                        .foregroundStyle(ZrpColor.red)
                        .fixedSize(horizontal: false, vertical: true)
                }

                if case .uploading(let progress) = viewModel.publishStage {
                    ProgressView(value: progress)
                        .tint(ZrpColor.red)
                }

                publishButton

                // Only offered while something is actually in flight -
                // a track can be hundreds of megabytes, and there must
                // be a way out that is not "force-quit the app".
                if viewModel.publishStage != .idle {
                    Button {
                        viewModel.cancelPublish()
                    } label: {
                        Text(.musicStudioCancel)
                            .font(.subheadline.weight(.semibold))
                            .frame(maxWidth: .infinity)
                            .frame(minHeight: ZrpMetrics.minTouchTarget)
                            .foregroundStyle(ZrpColor.onSurfaceMuted)
                    }
                    .buttonStyle(.plain)
                }

                Text(.musicShellUploadHint)
                    .font(.caption)
                    .foregroundStyle(ZrpColor.onSurfaceMuted)
            }
            .padding(ZrpSpacing.lg)
            .frame(maxWidth: ZrpMetrics.contentMaxWidth, alignment: .leading)
            .frame(maxWidth: .infinity)
        }
        .fileImporter(
            isPresented: $isImportingAudio,
            allowedContentTypes: PickedAudioFile.allowedContentTypes,
            allowsMultipleSelection: false
        ) { result in
            handleAudioPick(result)
        }
        // Cleared on the real signal - a created track - rather than
        // on the publish call merely returning, which also happens when
        // it was cancelled or failed and the draft must survive.
        .onChange(of: viewModel.lastPublishedTrackId) { _, newValue in
            guard newValue != nil else { return }
            audio?.discard()
            cover?.discard()
            audio = nil
            cover = nil
            coverSelection = nil
            title = ""
            genre = ""
            explicit = false
        }
        .onChange(of: coverSelection) { _, item in
            guard let item else { return }
            Task {
                cover?.discard()
                cover = try? await item.loadTransferable(type: PickedMedia.self)
            }
        }
    }

    // MARK: - Pieces

    private func field(_ key: L10nKey, text: Binding<String>) -> some View {
        TextField(text: text, prompt: Text(key), label: { Text(key) })
            .labelsHidden()
            .textFieldStyle(.plain)
            .padding(ZrpSpacing.md)
            .background(ZrpColor.surfaceElevated)
            .clipShape(RoundedRectangle(cornerRadius: ZrpRadius.md))
            .disabled(isBusy)
    }

    private var pendingUploadNotice: some View {
        VStack(alignment: .leading, spacing: ZrpSpacing.sm) {
            Text(.musicStudioUploadDoneRetryPublish)
                .font(.footnote)
                .foregroundStyle(ZrpColor.onSurface)
                .fixedSize(horizontal: false, vertical: true)
            Button {
                audio?.discard()
                audio = nil
                cover?.discard()
                cover = nil
                viewModel.discardPendingUpload()
            } label: {
                Text(.musicStudioDiscardUpload)
                    .font(.footnote.weight(.semibold))
                    .foregroundStyle(ZrpColor.red)
            }
            .buttonStyle(.plain)
        }
        .padding(ZrpSpacing.md)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(ZrpColor.surfaceHighest)
        .clipShape(RoundedRectangle(cornerRadius: ZrpRadius.md))
    }

    private var audioPicker: some View {
        VStack(alignment: .leading, spacing: ZrpSpacing.xs) {
            Text(.musicShellAudioFileLabel)
                .font(.footnote.weight(.semibold))
                .foregroundStyle(ZrpColor.onSurfaceMuted)

            Button {
                isImportingAudio = true
            } label: {
                HStack(spacing: ZrpSpacing.sm) {
                    Image(systemName: "waveform")
                    Text(verbatim: audio?.fileName ?? L10n.string(.musicShellAudioFileLabel))
                        .lineLimit(1)
                    Spacer(minLength: 0)
                    if let seconds = audio?.durationSec {
                        Text(verbatim: NowPlayingView.timeLabel(Double(seconds)))
                            .font(.caption.monospacedDigit())
                            .foregroundStyle(ZrpColor.onSurfaceMuted)
                    }
                }
                .font(.subheadline)
                .foregroundStyle(ZrpColor.onSurface)
                .padding(ZrpSpacing.md)
                .frame(maxWidth: .infinity, minHeight: ZrpMetrics.minTouchTarget)
                .background(ZrpColor.surfaceElevated)
                .clipShape(RoundedRectangle(cornerRadius: ZrpRadius.md))
            }
            .buttonStyle(.plain)
            .disabled(isBusy)

            if isPreparingAudio {
                Text(.musicStudioCheckingFileHint)
                    .font(.caption)
                    .foregroundStyle(ZrpColor.onSurfaceMuted)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
    }

    private var coverPicker: some View {
        VStack(alignment: .leading, spacing: ZrpSpacing.xs) {
            Text(.musicShellCoverArtworkLabel)
                .font(.footnote.weight(.semibold))
                .foregroundStyle(ZrpColor.onSurfaceMuted)

            PhotosPicker(selection: $coverSelection, matching: .images) {
                HStack(spacing: ZrpSpacing.sm) {
                    Image(systemName: "photo")
                    Text(verbatim: cover?.fileName ?? L10n.string(.musicStudioAddCover))
                        .lineLimit(1)
                    Spacer(minLength: 0)
                }
                .font(.subheadline)
                .foregroundStyle(ZrpColor.onSurface)
                .padding(ZrpSpacing.md)
                .frame(maxWidth: .infinity, minHeight: ZrpMetrics.minTouchTarget)
                .background(ZrpColor.surfaceElevated)
                .clipShape(RoundedRectangle(cornerRadius: ZrpRadius.md))
            }
            .disabled(isBusy)
        }
    }

    private var publishButton: some View {
        Button {
            guard let audio else { return }
            viewModel.beginPublish(
                title: title,
                genre: genre,
                explicit: explicit,
                audio: audio,
                cover: cover,
                artistName: artistName
            )
        } label: {
            Text(buttonLabel)
                .font(.subheadline.weight(.bold))
                .frame(maxWidth: .infinity)
                .frame(minHeight: ZrpMetrics.minTouchTarget)
                .background(ZrpColor.red)
                .foregroundStyle(.white)
                .clipShape(RoundedRectangle(cornerRadius: ZrpRadius.md))
        }
        .buttonStyle(.plain)
        .disabled(isBusy || audio == nil || title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
    }

    private var buttonLabel: L10nKey {
        if isPreparingAudio { return .musicStudioCheckingFile }
        switch viewModel.publishStage {
        case .uploading:
            return .musicStudioUploading
        case .publishing:
            return .musicShellPublishing
        case .idle:
            return viewModel.pendingUpload == nil ? .musicShellPublishTrack : .musicStudioRetryPublish
        }
    }

    private func handleAudioPick(_ result: Result<[URL], Error>) {
        guard case .success(let urls) = result, let url = urls.first else { return }
        Task {
            isPreparingAudio = true
            defer { isPreparingAudio = false }
            do {
                let picked = try await PickedAudioFile(pickedAt: url)
                audio?.discard()
                audio = picked
                viewModel.publishError = nil
            } catch let error as PickedAudioFile.PickError {
                viewModel.reportPickFailure(error, fileName: url.lastPathComponent)
            } catch {
                viewModel.reportPickFailure(.unreadable, fileName: url.lastPathComponent)
            }
        }
    }
}
