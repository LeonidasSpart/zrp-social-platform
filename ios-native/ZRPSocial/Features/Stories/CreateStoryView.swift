import PhotosUI
import SwiftUI

@MainActor
final class CreateStoryViewModel: ObservableObject {

    @Published var text: String = ""
    @Published private(set) var media: PickedMedia?
    @Published private(set) var uploadProgress: Double?
    @Published private(set) var uploaded: UploadedMedia?
    @Published private(set) var isPosting = false
    @Published var errorMessage: String?
    @Published private(set) var didPost = false

    private let repository: StoriesRepositoryProtocol
    private var uploadTask: Task<Void, Never>?

    /// The `storyMedia` router caps story video at a flat 16MB for every
    /// plan - unlike post video, which scales with the author's plan.
    /// Checked here so a user is told before the upload rather than after.
    private let maxVideoBytes: Int64 = 16 * 1024 * 1024
    private let maxImageBytes: Int64 = 4 * 1024 * 1024

    init(repository: StoriesRepositoryProtocol = StoriesRepository()) {
        self.repository = repository
    }

    /// The route rejects a story with neither content nor media (400), so
    /// the button follows the same rule.
    var canPost: Bool {
        guard !isPosting else { return false }
        if media != nil { return uploaded != nil }
        return !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }

    func attach(_ picked: PickedMedia) {
        let limit = picked.isVideo ? maxVideoBytes : maxImageBytes
        guard picked.byteCount <= limit else {
            picked.discard()
            errorMessage = L10n.string(.storiesErrFileTooLarge)
            return
        }

        media?.discard()
        uploadTask?.cancel()
        media = picked
        uploaded = nil
        startUpload(picked)
    }

    func removeMedia() {
        uploadTask?.cancel()
        media?.discard()
        media = nil
        uploaded = nil
        uploadProgress = nil
    }

    private func startUpload(_ picked: PickedMedia) {
        uploadProgress = 0
        uploadTask = Task { [weak self] in
            guard let self else { return }
            do {
                let result = try await self.repository.uploadStoryMedia(
                    picked.asUploadCandidate()
                ) { progress in
                    Task { @MainActor [weak self] in
                        self?.uploadProgress = progress
                    }
                }
                self.uploaded = result
                self.uploadProgress = nil
            } catch is CancellationError {
                return
            } catch UploadThingClient.UploadError.cancelled {
                return
            } catch {
                self.uploadProgress = nil
                self.errorMessage = (error as? ApiError)?.userFacingMessage
                    ?? L10n.string(.storiesErrCreateFailed)
            }
        }
    }

    func post() async {
        guard canPost else { return }
        isPosting = true
        defer { isPosting = false }

        let content = text.trimmingCharacters(in: .whitespacesAndNewlines)
        do {
            try await repository.create(
                content: content.isEmpty ? nil : content,
                mediaUrl: uploaded?.url,
                // The route validates this is exactly "image" or "video",
                // and the upload handler already classified it - including
                // treating a GIF as an image.
                mediaType: uploaded?.type
            )
            media?.discard()
            didPost = true
        } catch let error as ApiError {
            errorMessage = error.userFacingMessage
        } catch {
            errorMessage = L10n.string(.storiesErrCreateFailed)
        }
    }

    func discard() {
        uploadTask?.cancel()
        media?.discard()
        media = nil
    }
}

/// Compose a story: text, or an image or video with an optional caption.
struct CreateStoryView: View {

    let onPosted: () -> Void

    @Environment(\.dismiss) private var dismiss
    @StateObject private var viewModel = CreateStoryViewModel()
    @State private var pickerItem: PhotosPickerItem?

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: ZrpSpacing.lg) {
                    TextField(
                        L10n.string(.storiesWhatsOnYourMind),
                        text: $viewModel.text,
                        axis: .vertical
                    )
                    .font(.body)
                    .lineLimit(3...8)
                    .padding(ZrpSpacing.md)
                    .background(ZrpColor.surfaceElevated)
                    .clipShape(RoundedRectangle(cornerRadius: ZrpRadius.md, style: .continuous))

                    mediaSection

                    Text(.storiesExpiryNote)
                        .font(.caption)
                        .foregroundStyle(ZrpColor.onSurfaceMuted)
                }
                .padding(ZrpSpacing.lg)
                .frame(maxWidth: ZrpMetrics.contentMaxWidth)
                .frame(maxWidth: .infinity)
            }
            .background(ZrpColor.background.ignoresSafeArea())
            .scrollDismissesKeyboard(.interactively)
            .navigationTitle(Text(.storiesAddStory))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { toolbarContent }
            .onChange(of: pickerItem) { _, item in
                guard let item else { return }
                Task { await load(item) }
            }
            .onChange(of: viewModel.didPost) { _, posted in
                guard posted else { return }
                onPosted()
                dismiss()
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
    }

    @ViewBuilder
    private var mediaSection: some View {
        if let media = viewModel.media {
            HStack(spacing: ZrpSpacing.md) {
                AttachmentThumbnail(
                    fileURL: media.url,
                    remoteURL: nil,
                    isVideo: media.isVideo,
                    side: 72
                )

                VStack(alignment: .leading, spacing: ZrpSpacing.xs) {
                    if let progress = viewModel.uploadProgress {
                        ProgressView(value: progress).tint(ZrpColor.red)
                        Text(.storiesUploading)
                            .font(.caption)
                            .foregroundStyle(ZrpColor.onSurfaceMuted)
                    } else if viewModel.uploaded != nil {
                        Label {
                            Text(.iosComposeUploaded)
                        } icon: {
                            Image(systemName: "checkmark.circle.fill")
                        }
                        .font(.footnote)
                        .foregroundStyle(ZrpColor.green)
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)

                Button {
                    viewModel.removeMedia()
                    pickerItem = nil
                } label: {
                    Image(systemName: "xmark.circle.fill")
                        .font(.title3)
                        .foregroundStyle(ZrpColor.onSurfaceMuted)
                        .frame(width: ZrpMetrics.minTouchTarget, height: ZrpMetrics.minTouchTarget)
                        .contentShape(Rectangle())
                }
                .accessibilityLabel(Text(.iosComposeRemoveAttachment))
            }
            .padding(ZrpSpacing.md)
            .background(ZrpColor.surfaceElevated)
            .clipShape(RoundedRectangle(cornerRadius: ZrpRadius.md, style: .continuous))
        } else {
            PhotosPicker(
                selection: $pickerItem,
                matching: .any(of: [.images, .videos])
            ) {
                Label {
                    Text(.iosComposeAddPhoto)
                } icon: {
                    Image(systemName: "photo.on.rectangle")
                }
                .font(.subheadline.weight(.medium))
                .frame(maxWidth: .infinity)
                .frame(minHeight: ZrpMetrics.minTouchTarget + 8)
                .background(ZrpColor.surfaceElevated)
                .foregroundStyle(ZrpColor.red)
                .clipShape(RoundedRectangle(cornerRadius: ZrpRadius.md, style: .continuous))
            }
        }
    }

    @ToolbarContentBuilder
    private var toolbarContent: some ToolbarContent {
        ToolbarItem(placement: .topBarLeading) {
            Button {
                viewModel.discard()
                dismiss()
            } label: {
                Text(.actionCancel)
            }
        }
        ToolbarItem(placement: .topBarTrailing) {
            Button {
                Task { await viewModel.post() }
            } label: {
                if viewModel.isPosting {
                    ProgressView().tint(.white)
                } else {
                    Text(.storiesShareStory).font(.subheadline.weight(.semibold))
                }
            }
            .buttonStyle(.borderedProminent)
            .tint(ZrpColor.red)
            .disabled(!viewModel.canPost)
        }
    }

    private func load(_ item: PhotosPickerItem) async {
        guard let picked = try? await item.loadTransferable(type: PickedMedia.self) else {
            viewModel.errorMessage = L10n.string(.storiesErrUnsupportedType)
            return
        }
        viewModel.attach(picked)
    }
}
