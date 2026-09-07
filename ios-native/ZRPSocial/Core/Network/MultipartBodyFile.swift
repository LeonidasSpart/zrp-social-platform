import Foundation

/// A `multipart/form-data` body assembled on disk.
///
/// UploadThing's ingest endpoint expects the file wrapped in a multipart
/// body with a single `file` field - not a raw request body. Building
/// that in memory would mean holding the whole file as `Data`, and a
/// plan's video allowance reaches 2GB, so the envelope is streamed into
/// a temporary file and uploaded with `uploadTask(with:fromFile:)`.
/// Peak memory stays at one 256KB chunk regardless of file size.
struct MultipartBodyFile {

    let url: URL
    let boundary: String

    /// - Parameter skippingFirstBytes: Bytes already held by the ingest
    ///   server, from the protocol's `x-ut-range-start` resume probe.
    ///   Zero for a fresh upload.
    init(
        fieldName: String,
        fileURL: URL,
        fileName: String,
        mimeType: String,
        skippingFirstBytes: Int64 = 0
    ) throws {
        boundary = "Boundary-\(UUID().uuidString)"
        url = FileManager.default.temporaryDirectory
            .appendingPathComponent("zrp-upload-\(UUID().uuidString).tmp")

        FileManager.default.createFile(atPath: url.path, contents: nil)
        let output = try FileHandle(forWritingTo: url)
        defer { try? output.close() }

        // Quote-escaping the filename matters: a name containing a double
        // quote would otherwise terminate the header early and corrupt
        // the request, and filenames come from the user's library.
        let safeName = fileName
            .replacingOccurrences(of: "\\", with: "")
            .replacingOccurrences(of: "\"", with: "")

        let header = """
        --\(boundary)\r
        Content-Disposition: form-data; name="\(fieldName)"; filename="\(safeName)"\r
        Content-Type: \(mimeType)\r
        \r

        """
        try output.write(contentsOf: Data(header.utf8))

        let input = try FileHandle(forReadingFrom: fileURL)
        defer { try? input.close() }

        if skippingFirstBytes > 0 {
            try input.seek(toOffset: UInt64(skippingFirstBytes))
        }

        // 256KB chunks: large enough that syscall overhead is negligible,
        // small enough that peak memory stays flat for any file size.
        let chunkSize = 256 * 1024
        while true {
            let chunk = try input.read(upToCount: chunkSize) ?? Data()
            if chunk.isEmpty { break }
            try output.write(contentsOf: chunk)
        }

        try output.write(contentsOf: Data("\r\n--\(boundary)--\r\n".utf8))
    }

    /// Removes the temporary envelope. Callers should `defer` this - the
    /// file is in the system temp directory and would otherwise linger
    /// until iOS decides to purge it, which for a 2GB video is a real
    /// amount of the user's storage.
    func cleanUp() {
        try? FileManager.default.removeItem(at: url)
    }
}
