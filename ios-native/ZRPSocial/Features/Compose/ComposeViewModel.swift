import Foundation
import SwiftUI

/// One attachment's journey from picked file to uploaded URL.
struct Attachment: Identifiable, Equatable {

    enum State: Equatable {
        case pending
        case uploading(progress: Double)
        case uploaded(UploadedMedia)
        case failed(String)

        var isTerminal: Bool {
            switch self {
            case .uploaded, .failed: return true
            case .pending, .uploading: return false
            }
        }
    }

    let id: UUID
    let media: PickedMedia?

    /// Set for a GIF chosen from the picker. A GIF needs no upload at
    /// all: the website's own composer attaches one by putting Giphy's
    /// URL straight into `imageUrls`, so it arrives already "uploaded".
    let remoteURL: String?

    var state: State

    init(media: PickedMedia) {
        id = media.id
        self.media = media
        remoteURL = nil
        state = .pending
    }

    init(gif: GifResult) {
        id = UUID()
        media = nil
        remoteURL = gif.url
        state = .uploaded(UploadedMedia(url: gif.url, type: "image", isGif: true))
    }

    var isVideo: Bool { media?.isVideo ?? false }

    var uploadedMedia: UploadedMedia? {
        if case .uploaded(let media) = state { return media }
        return nil
    }
}

@MainActor
final class ComposeViewModel: ObservableObject {

    @Published var text: String = ""
    @Published private(set) var attachments: [Attachment] = []
    @Published private(set) var isPosting = false
    @Published var errorMessage: String?

    /// Set once the post is created, so the view can dismiss and the feed
    /// can take the new post without a refetch.
    @Published private(set) var createdPost: Post?

    private let postsRepository: PostsRepositoryProtocol
    private let mediaRepository: MediaRepositoryProtocol
    private var uploadTasks: [UUID: Task<Void, Never>] = [:]

    /// The post being quoted, when the composer was opened from a
    /// post's Quote action. Sent as `quotePostId`, which is the only
    /// thing that makes the created post a quote server-side.
    var quotedPost: Post?

    /// The plan whose limits the composer pre-checks against. Advisory
    /// only - `POST /api/posts` and the upload router both enforce the
    /// real limits server-side.
    var plan: String?

    init(
        postsRepository: PostsRepositoryProtocol = PostsRepository(),
        mediaRepository: MediaRepositoryProtocol = MediaRepository()
    ) {
        self.postsRepository = postsRepository
        self.mediaRepository = mediaRepository
    }

    // MARK: - Limits

    private var limits: PlanLimits.Limits { PlanLimits.limits(for: plan) }

    var characterLimit: Int { limits.postLength }
    var remainingCharacters: Int { characterLimit - text.count }
    var isOverCharacterLimit: Bool { remainingCharacters < 0 }

    /// A post carries either one video or up to the plan's image count -
    /// the same shape the backend's own router enforces (`video` has
    /// `maxFileCount: 1`).
    var canAddMoreMedia: Bool { remainingMediaSlots > 0 }

    /// How many more attachments this post can take.
    ///
    /// Capped at 4 regardless of plan because that is the upload router's
    /// own `image: { maxFileCount: 4 }` - a business or enterprise plan
    /// allows more images per *post* than one upload batch may carry, and
    /// the smaller of the two is what actually applies.
    var remainingMediaSlots: Int {
        if attachments.contains(where: \.isVideo) { return 0 }
        return max(0, min(limits.imagesPerPost, 4) - attachments.count)
    }

    /// Whether every attachment has finished uploading. Posting before
    /// that would drop media the user is watching upload.
    private var allUploadsSettled: Bool {
        attachments.allSatisfy { $0.uploadedMedia != nil }
    }

    var canPost: Bool {
        guard !isPosting, !isOverCharacterLimit, allUploadsSettled else { return false }
        let hasText = !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
        // A quote is publishable with no text of its own - the quoted
        // post is the content, exactly as on web.
        return hasText || !attachments.isEmpty || quotedPost != nil
    }

    // MARK: - Attachments

    func add(_ media: [PickedMedia]) {
        for item in media {
            guard canAddMoreMedia else {
                // Over the plan's allowance: discard the copy rather than
                // leaving it in temporary storage, and say why once.
                item.discard()
                errorMessage = L10n.string(
                    .iosComposeImageLimit,
                    ["n": "\(limits.imagesPerPost)"]
                )
                continue
            }

            // A video cannot share a post with anything else, matching
            // the router's own `video: { maxFileCount: 1 }`.
            if item.isVideo && !attachments.isEmpty {
                item.discard()
                errorMessage = L10n.string(.iosComposeVideoAlone)
                continue
            }

            // Pre-check the plan's video allowance so a user is told now
            // rather than after minutes of uploading. The upload router's
            // middleware enforces the same limit server-side.
            if item.isVideo {
                let megabytes = Double(item.byteCount) / (1024 * 1024)
                if megabytes > Double(limits.videoUploadMB) {
                    item.discard()
                    errorMessage = L10n.string(
                        .iosComposeVideoTooLarge,
                        ["size": "\(limits.videoUploadMB)"]
                    )
                    continue
                }
            }

            let attachment = Attachment(media: item)
            attachments.append(attachment)
            startUpload(attachment)
        }
    }

    func add(gif: GifResult) {
        guard canAddMoreMedia else {
            errorMessage = L10n.string(
                .iosComposeImageLimit,
                ["n": "\(limits.imagesPerPost)"]
            )
            return
        }
        attachments.append(Attachment(gif: gif))
    }

    /// Removes an attachment, cancelling its upload if one is in flight
    /// and deleting the local copy.
    func remove(_ attachment: Attachment) {
        uploadTasks[attachment.id]?.cancel()
        uploadTasks.removeValue(forKey: attachment.id)
        attachment.media?.discard()
        attachments.removeAll { $0.id == attachment.id }
    }

    /// Retries one failed upload without re-picking the file - the local
    /// copy is still there, and the protocol's resume probe means an
    /// upload that got most of the way does not start over.
    func retry(_ attachment: Attachment) {
        guard case .failed = attachment.state else { return }
        update(attachment.id) { $0.state = .pending }
        if let refreshed = attachments.first(where: { $0.id == attachment.id }) {
            startUpload(refreshed)
        }
    }

    private func startUpload(_ attachment: Attachment) {
        guard let media = attachment.media else { return }
        let id = attachment.id

        // This Task inherits the view model's main-actor isolation, so
        // every state change below is already on the main actor. The one
        // genuine hop is the progress callback, which URLSession invokes
        // on its own queue.
        uploadTasks[id] = Task { [weak self] in
            guard let self else { return }
            self.update(id) { $0.state = .uploading(progress: 0) }

            do {
                let uploaded = try await self.mediaRepository.uploadPostMedia(
                    media.asUploadCandidate()
                ) { progress in
                    Task { @MainActor [weak self] in
                        // Only overwrite while still uploading, so a late
                        // progress callback cannot undo a finished or
                        // cancelled state.
                        self?.update(id) { attachment in
                            if case .uploading = attachment.state {
                                attachment.state = .uploading(progress: progress)
                            }
                        }
                    }
                }
                self.update(id) { $0.state = .uploaded(uploaded) }
            } catch is CancellationError {
                return
            } catch UploadThingClient.UploadError.cancelled {
                return
            } catch {
                self.update(id) { $0.state = .failed(Self.message(for: error)) }
            }
        }
    }

    private func update(_ id: UUID, _ change: (inout Attachment) -> Void) {
        guard let index = attachments.firstIndex(where: { $0.id == id }) else { return }
        change(&attachments[index])
    }

    private static func message(for error: Error) -> String {
        switch error {
        case UploadThingClient.UploadError.presignFailed(let message):
            // The upload router's middleware produces genuinely specific
            // messages here - a plan's video limit, an unauthorised
            // caller - so the server's own wording is preferred.
            return message ?? L10n.string(.composerErrUploadFailed)
        case let apiError as ApiError:
            return apiError.userFacingMessage
        default:
            return L10n.string(.composerErrUploadFailed)
        }
    }

    // MARK: - Posting

    func post() async {
        guard canPost else { return }
        isPosting = true
        errorMessage = nil
        defer { isPosting = false }

        let uploaded = attachments.compactMap(\.uploadedMedia)

        // The website's composer sends every attachment through
        // `imageUrls`, including a video and including a GIF - the
        // singular `imageUrl` is legacy, and the server derives it from
        // the array's first entry. Matching that exactly is what keeps a
        // post composed here rendering identically on web.
        let request = CreatePostRequest(
            content: text.trimmingCharacters(in: .whitespacesAndNewlines),
            imageUrls: uploaded.isEmpty ? nil : uploaded.map(\.url),
            mediaType: uploaded.first?.type,
            quotePostId: quotedPost?.id
        )

        do {
            createdPost = try await postsRepository.createPost(request)
            // The post is committed server-side; the local copies have
            // done their job.
            attachments.forEach { $0.media?.discard() }
        } catch let error as ApiError {
            errorMessage = error.userFacingMessage
        } catch {
            errorMessage = L10n.string(.composerErrSomethingWrong)
        }
    }

    /// Called when the composer is dismissed without posting.
    func discardDraft() {
        uploadTasks.values.forEach { $0.cancel() }
        uploadTasks.removeAll()
        attachments.forEach { $0.media?.discard() }
        attachments.removeAll()
    }
}
