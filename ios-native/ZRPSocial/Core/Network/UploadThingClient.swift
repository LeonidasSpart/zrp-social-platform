import Foundation

/// A file the app is about to upload.
struct UploadCandidate: Equatable {
    /// A local file URL. Uploads stream from disk rather than from
    /// memory - a plan's video allowance reaches 2GB, which must never
    /// be held as `Data`.
    let fileURL: URL
    let fileName: String
    let mimeType: String
    let byteCount: Int64

    /// Milliseconds since the epoch, matching what a browser's `File`
    /// reports. The presign request carries it because the protocol asks
    /// for it, not because ZRP uses it.
    let lastModifiedMilliseconds: Int64
}

/// What the ZRP backend's `onUploadComplete` handler hands back once the
/// bytes have landed.
struct UploadedMedia: Equatable {
    let url: String

    /// `"image"` or `"video"` - the same value the composer sends on as
    /// the post's `mediaType`.
    let type: String

    /// The server classifies GIFs explicitly (`isGifFile()` in
    /// `src/lib/uploadthing.ts`) and returns them as `type: "image"` with
    /// this set, because an animated GIF is an image for ZRP's media
    /// system and must never become a video.
    let isGif: Bool
}

/// A native client for UploadThing's wire protocol.
///
/// UploadThing ships no iOS SDK, so this implements the same three-step
/// exchange the website's own `@uploadthing/react` client performs. It
/// was written against the real protocol as implemented in the
/// `uploadthing` package's client source (`client/index.js`, v7.4.4 -
/// the version this repository depends on), not guessed:
///
/// 1. **Presign.** `POST /api/uploadthing?actionType=upload&slug=<router key>`
///    with `{input, files: [{name, size, type, lastModified}]}`. This
///    hits *ZRP's own* route (`src/app/api/uploadthing/route.ts`), which
///    authenticates the caller, applies the router's middleware (plan
///    checks), and talks to UploadThing with a server-only secret. The
///    client never holds an UploadThing credential.
/// 2. **Resume probe.** `HEAD` the presigned URL and read
///    `x-ut-range-start`, the byte offset already stored. Fresh uploads
///    get 0; a retried one resumes rather than re-sending what landed.
/// 3. **Upload.** `PUT` the presigned URL with `Range: bytes=<start>-`
///    and a `multipart/form-data` body containing exactly one field
///    named `file`. The easy detail to miss is that it really is
///    multipart, not a raw body. UploadThing's ingest server invokes
///    ZRP's `onUploadComplete` internally and returns its result inline
///    as `serverData` in this same response - there is no webhook or
///    polling to wait on.
///
/// The presigned URL points at UploadThing's storage host, not
/// `zrp.one`, so this deliberately uses its own `URLSession` rather than
/// `ApiClient`: ZRP's session cookie must never be sent to a third-party
/// host.
final class UploadThingClient: NSObject, @unchecked Sendable {

    /// Which entry in `ourFileRouter` to upload through. Each has its own
    /// server-side auth, size caps, and completion handler, so the slug
    /// is never a free-form string at a call site.
    enum Slug: String {
        case postMedia
        case avatar
        case banner
        case listingMedia
        case chatImage
    }

    enum UploadError: Error {
        case presignFailed(String?)
        case uploadFailed(status: Int, message: String?)
        case missingServerData
        case cancelled
    }

    /// Sent as `x-uploadthing-version`. The ingest server uses it to
    /// pick protocol behaviour, so it tracks the `uploadthing` version in
    /// this repository's `package.json` (^7.4.4) and must be updated
    /// alongside it.
    private static let protocolVersion = "7.4.4"

    /// Identifies the client in `x-uploadthing-package`. Deliberately not
    /// impersonating `@uploadthing/react` - this is a different client,
    /// and the header is diagnostic only.
    private static let packageIdentifier = "zrp-ios-native"

    private let apiBaseURL = URL(string: "https://zrp.one/api/")!
    private let sessionStore: SessionStore

    private let session: URLSession = {
        let configuration = URLSessionConfiguration.default
        configuration.timeoutIntervalForRequest = 60
        // A large video on a slow connection legitimately takes a long
        // time; the per-request timeout above still catches a stall.
        configuration.timeoutIntervalForResource = 3_600
        configuration.httpCookieAcceptPolicy = .never
        configuration.httpShouldSetCookies = false
        return URLSession(configuration: configuration)
    }()

    init(sessionStore: SessionStore = .shared) {
        self.sessionStore = sessionStore
        super.init()
    }

    // MARK: - Public

    /// Uploads one file and returns what ZRP's own completion handler
    /// said about it.
    ///
    /// `onProgress` receives 0...1 on an arbitrary queue. Cancelling the
    /// surrounding `Task` cancels the transfer.
    func upload(
        _ candidate: UploadCandidate,
        to slug: Slug,
        onProgress: @escaping (Double) -> Void
    ) async throws -> UploadedMedia {
        let presigned = try await requestPresign(for: [candidate], slug: slug)
        guard let first = presigned.first else {
            throw UploadError.presignFailed(nil)
        }
        return try await send(candidate, to: first, onProgress: onProgress)
    }

    // MARK: - Step 1: presign

    private struct PresignFileMeta: Encodable {
        let name: String
        let size: Int64
        let type: String
        let lastModified: Int64
    }

    private struct PresignRequest: Encodable {
        /// Always null for ZRP's routers - none of them declares an
        /// `.input()` schema. Present because the protocol expects the
        /// key.
        let input: String?
        let files: [PresignFileMeta]
    }

    private struct PresignedUpload: Decodable {
        let url: String
        let key: String
        let customId: String?
    }

    private func requestPresign(
        for candidates: [UploadCandidate],
        slug: Slug
    ) async throws -> [PresignedUpload] {
        var components = URLComponents(
            url: URL(string: "uploadthing", relativeTo: apiBaseURL)!,
            resolvingAgainstBaseURL: true
        )!
        components.queryItems = [
            URLQueryItem(name: "actionType", value: "upload"),
            URLQueryItem(name: "slug", value: slug.rawValue),
        ]

        var request = URLRequest(url: components.url!)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue(Self.packageIdentifier, forHTTPHeaderField: "x-uploadthing-package")
        request.setValue(Self.protocolVersion, forHTTPHeaderField: "x-uploadthing-version")

        // This request goes to zrp.one, so it carries the session - the
        // router's middleware needs it to authorise the upload and apply
        // the caller's plan limits.
        if let session = sessionStore.current {
            request.setValue(
                "\(session.cookieName)=\(session.token)",
                forHTTPHeaderField: "Cookie"
            )
        }

        request.httpBody = try JSONEncoder().encode(
            PresignRequest(
                input: nil,
                files: candidates.map {
                    PresignFileMeta(
                        name: $0.fileName,
                        size: $0.byteCount,
                        type: $0.mimeType,
                        lastModified: $0.lastModifiedMilliseconds
                    )
                }
            )
        )

        let (data, response) = try await session.data(for: request)
        guard let http = response as? HTTPURLResponse else {
            throw UploadError.presignFailed(nil)
        }
        guard (200..<300).contains(http.statusCode) else {
            // The router's middleware surfaces real, specific messages
            // here - a plan's video size limit, an unauthorised caller -
            // which are far more useful than "upload failed".
            let message = (try? JSONDecoder().decode(ApiErrorBody.self, from: data))?.error
                ?? String(data: data, encoding: .utf8)
            ZrpLog.error("UploadThing presign rejected with \(http.statusCode)")
            throw UploadError.presignFailed(message)
        }
        return try JSONDecoder().decode([PresignedUpload].self, from: data)
    }

    // MARK: - Steps 2 and 3: resume probe, then upload

    private struct UploadServerData: Decodable {
        let url: String?
        let type: String?
        let isGif: Bool?
    }

    private struct UploadResponse: Decodable {
        let url: String?
        let serverData: UploadServerData?
    }

    private func send(
        _ candidate: UploadCandidate,
        to presigned: PresignedUpload,
        onProgress: @escaping (Double) -> Void
    ) async throws -> UploadedMedia {
        guard let url = URL(string: presigned.url) else {
            throw UploadError.presignFailed(nil)
        }

        let rangeStart = await resumeOffset(for: url)

        // The multipart envelope is assembled on disk, not in memory, so
        // a 2GB video never becomes a 2GB Data.
        let bodyFile = try MultipartBodyFile(
            fieldName: "file",
            fileURL: candidate.fileURL,
            fileName: candidate.fileName,
            mimeType: candidate.mimeType,
            skippingFirstBytes: rangeStart
        )
        defer { bodyFile.cleanUp() }

        var request = URLRequest(url: url)
        request.httpMethod = "PUT"
        request.setValue("bytes=\(rangeStart)-", forHTTPHeaderField: "Range")
        request.setValue(Self.protocolVersion, forHTTPHeaderField: "x-uploadthing-version")
        request.setValue(
            "multipart/form-data; boundary=\(bodyFile.boundary)",
            forHTTPHeaderField: "Content-Type"
        )
        // Deliberately no Cookie header: this host is UploadThing's, not
        // ZRP's, and the session must not leave zrp.one.

        let (data, response) = try await upload(
            request: request,
            fromFile: bodyFile.url,
            onProgress: onProgress
        )

        guard let http = response as? HTTPURLResponse else {
            throw UploadError.uploadFailed(status: -1, message: nil)
        }
        guard (200..<300).contains(http.statusCode) else {
            ZrpLog.error("UploadThing PUT failed with \(http.statusCode)")
            throw UploadError.uploadFailed(
                status: http.statusCode,
                message: String(data: data, encoding: .utf8)
            )
        }

        let decoded = try? JSONDecoder().decode(UploadResponse.self, from: data)

        // `serverData` is ZRP's own onUploadComplete result. Falling back
        // to the transport-level `url` would lose the server's GIF and
        // image/video classification, so a missing serverData is treated
        // as a failure rather than papered over with a guess.
        guard
            let serverData = decoded?.serverData,
            let mediaURL = serverData.url ?? decoded?.url,
            let type = serverData.type
        else {
            throw UploadError.missingServerData
        }

        return UploadedMedia(
            url: mediaURL,
            type: type,
            isGif: serverData.isGif ?? false
        )
    }

    /// Asks how many bytes the ingest server already holds.
    ///
    /// Always 0 for a fresh upload. On a retry after a dropped
    /// connection it is the resume point, which is why the protocol does
    /// this probe at all. A failed probe is not an error - it just means
    /// starting from zero.
    private func resumeOffset(for url: URL) async -> Int64 {
        var request = URLRequest(url: url)
        request.httpMethod = "HEAD"
        guard
            let (_, response) = try? await session.data(for: request),
            let http = response as? HTTPURLResponse,
            let raw = http.value(forHTTPHeaderField: "x-ut-range-start"),
            let offset = Int64(raw)
        else {
            return 0
        }
        return max(0, offset)
    }

    /// Bridges `URLSession`'s delegate-based progress and completion into
    /// async/await.
    ///
    /// Both travel on one per-task delegate rather than a session-wide
    /// one, so there is no shared table of in-flight uploads to keep
    /// consistent and two concurrent uploads cannot cross their progress.
    private func upload(
        request: URLRequest,
        fromFile file: URL,
        onProgress: @escaping (Double) -> Void
    ) async throws -> (Data, URLResponse) {
        let task = session.uploadTask(with: request, fromFile: file)
        let observer = UploadCompletion(onProgress: onProgress)
        task.delegate = observer

        return try await withTaskCancellationHandler {
            try await withCheckedThrowingContinuation { continuation in
                observer.attach(continuation)
                task.resume()
            }
        } onCancel: {
            // Referencing `observer` here also keeps it alive for the
            // whole await, independently of how long URLSession chooses
            // to retain a task delegate.
            observer.noteCancelled()
            task.cancel()
        }
    }
}

/// Per-task delegate: reports progress and resolves the continuation for
/// exactly one upload.
///
/// `URLSession` calls these on its own queue while the continuation is
/// attached from the caller's, so every mutation is behind a lock. The
/// continuation is resumed exactly once - resuming twice would trap.
private final class UploadCompletion: NSObject, URLSessionDataDelegate {

    private let lock = NSLock()
    private let onProgress: (Double) -> Void

    private var continuation: CheckedContinuation<(Data, URLResponse), Error>?
    private var finished: Result<(Data, URLResponse), Error>?
    private var buffer = Data()
    private var response: URLResponse?

    init(onProgress: @escaping (Double) -> Void) {
        self.onProgress = onProgress
    }

    /// Hands over the continuation. If the task somehow already finished,
    /// it resumes immediately with the stored result rather than hanging.
    func attach(_ continuation: CheckedContinuation<(Data, URLResponse), Error>) {
        lock.lock()
        if let finished {
            lock.unlock()
            continuation.resume(with: finished)
            return
        }
        self.continuation = continuation
        lock.unlock()
    }

    /// Called from the cancellation handler purely so the closure
    /// captures a strong reference to this object.
    func noteCancelled() {}

    func urlSession(
        _ session: URLSession,
        task: URLSessionTask,
        didSendBodyData bytesSent: Int64,
        totalBytesSent: Int64,
        totalBytesExpectedToSend: Int64
    ) {
        guard totalBytesExpectedToSend > 0 else { return }
        onProgress(Double(totalBytesSent) / Double(totalBytesExpectedToSend))
    }

    func urlSession(
        _ session: URLSession,
        dataTask: URLSessionDataTask,
        didReceive response: URLResponse
    ) async -> URLSession.ResponseDisposition {
        lock.lock()
        self.response = response
        lock.unlock()
        return .allow
    }

    func urlSession(
        _ session: URLSession,
        dataTask: URLSessionDataTask,
        didReceive data: Data
    ) {
        lock.lock()
        buffer.append(data)
        lock.unlock()
    }

    func urlSession(
        _ session: URLSession,
        task: URLSessionTask,
        didCompleteWithError error: Error?
    ) {
        let result: Result<(Data, URLResponse), Error>
        if let error {
            let isCancellation = (error as? URLError)?.code == .cancelled
            result = .failure(
                isCancellation ? UploadThingClient.UploadError.cancelled : error
            )
        } else if let response = response ?? task.response {
            result = .success((buffer, response))
        } else {
            result = .failure(
                UploadThingClient.UploadError.uploadFailed(status: -1, message: nil)
            )
        }

        lock.lock()
        guard finished == nil else {
            lock.unlock()
            return
        }
        finished = result
        let pending = continuation
        continuation = nil
        lock.unlock()

        pending?.resume(with: result)
    }
}
