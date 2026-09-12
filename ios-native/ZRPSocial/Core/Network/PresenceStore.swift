import Foundation
import SwiftUI

/// Who is online, shared by every screen that shows a presence dot.
///
/// The server broadcasts `user-status` to everyone on any transition, and
/// answers a `get-status` request for one user. Both are needed: the
/// broadcast covers changes while you are watching, and the request
/// covers the state a screen arrives into - without it, someone who came
/// online before you opened the thread would read as offline until they
/// happened to reconnect.
///
/// One store rather than per-screen state, for the same reason the unread
/// badge is shared: two screens showing the same person must not disagree
/// about whether they are online.
@MainActor
final class PresenceStore: ObservableObject {

    /// Only ids the server has actually reported on. A user who is
    /// absent here is **unknown**, not offline - which is why the dot is
    /// hidden rather than grey for someone never asked about.
    @Published private(set) var online: [String: Bool] = [:]

    private let socket: ZrpSocket
    private var token: UUID?

    /// Ids this store has asked about, so a reconnect can re-ask for all
    /// of them. Presence is per-connection server-side; after a drop,
    /// every previous answer is stale.
    private var watched: Set<String> = []

    init(socket: ZrpSocket? = nil) {
        // Not a default argument: a default is evaluated outside the
        // actor, and `ZrpSocket.shared` is main-actor isolated.
        self.socket = socket ?? .shared
    }

    private struct StatusEvent: Decodable {
        let userId: String
        let status: String
    }

    func start() {
        guard token == nil else { return }
        socket.connect()
        token = socket.subscribe { [weak self] event in
            guard let self, event.name == "user-status" else { return }
            guard let status = try? JSONDecoder().decode(StatusEvent.self, from: event.data)
            else { return }
            self.online[status.userId] = status.status == "online"
        }
    }

    func stop() {
        if let token { socket.unsubscribe(token) }
        token = nil
        watched.removeAll()
        online.removeAll()
    }

    /// Starts tracking a user and asks for their current status.
    ///
    /// Safe to call repeatedly - the server's own rate limit for this
    /// event is deliberately generous (200 per 10s) because clients
    /// re-request every watched user on reconnect, but there is no
    /// reason to ask twice for a user already answered.
    func watch(_ userId: String) {
        guard !userId.isEmpty else { return }
        watched.insert(userId)
        socket.emit("get-status", userId)
    }

    func watch(_ userIds: [String]) {
        for id in userIds { watch(id) }
    }

    /// `true` only when the server said so. Unknown reads as offline for
    /// display purposes, but `isKnown` is what decides whether to show a
    /// dot at all.
    func isOnline(_ userId: String?) -> Bool {
        guard let userId else { return false }
        return online[userId] == true
    }

    func isKnown(_ userId: String?) -> Bool {
        guard let userId else { return false }
        return online[userId] != nil
    }

    /// Re-asks for every watched user.
    ///
    /// Called after a reconnect: the server tracks presence per
    /// connection, so everything this store learned before the drop is
    /// stale, and nothing will arrive unprompted until one of those
    /// users next transitions.
    func resync() {
        for id in watched { socket.emit("get-status", id) }
    }
}

/// A small online dot.
///
/// Renders nothing when the server has not reported on this user, which
/// is deliberate: an absent answer means "not known", and a grey dot
/// would state "offline" on no evidence.
struct PresenceDot: View {

    let userId: String?
    @EnvironmentObject private var presence: PresenceStore

    var body: some View {
        if presence.isKnown(userId) {
            Circle()
                .fill(presence.isOnline(userId) ? ZrpColor.green : ZrpColor.onSurfaceMuted)
                .frame(width: 8, height: 8)
                // The status is announced by the row's own label rather
                // than as a separate stop for VoiceOver.
                .accessibilityHidden(true)
        }
    }
}
