import Foundation
import OSLog

/// The app's logging front door.
///
/// Two rules, enforced by every call site going through here rather than
/// through `print` or a bare `Logger`:
///
/// 1. **Nothing sensitive is ever logged.** No passwords, no session
///    tokens, no cookie values, no message bodies, no request or response
///    payloads. `os.Logger` treats interpolated values as private by
///    default, but the reliable protection is simply never passing them in.
/// 2. **Release builds stay quiet.** `debug` compiles to nothing outside
///    `DEBUG`, so a shipping build cannot leak URLs or timings.
enum ZrpLog {

    private static let subsystem = Bundle.main.bundleIdentifier ?? "one.zrp.social"

    private static let network = Logger(subsystem: subsystem, category: "network")
    private static let app = Logger(subsystem: subsystem, category: "app")

    /// Development-only diagnostics. Never present in a release build.
    static func debug(_ message: String) {
        #if DEBUG
        app.debug("\(message, privacy: .public)")
        #endif
    }

    /// A recoverable problem worth keeping in the device log.
    static func error(_ message: String) {
        app.error("\(message, privacy: .public)")
    }

    /// A network event. Records the method, the path, and the status -
    /// never headers (which carry the session cookie), query strings, or
    /// bodies.
    static func request(method: String, path: String, status: Int?) {
        #if DEBUG
        if let status {
            network.debug("\(method, privacy: .public) \(path, privacy: .public) -> \(status)")
        } else {
            network.debug("\(method, privacy: .public) \(path, privacy: .public) -> (no response)")
        }
        #endif
    }
}
