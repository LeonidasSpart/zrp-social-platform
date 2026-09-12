import Foundation

/// One event delivered by the ZRP realtime server.
///
/// The name is the server's own event name (`receive-message`,
/// `user-typing`, …) and `data` is that event's single JSON argument,
/// left as raw bytes so each subscriber decodes it into the type it
/// actually needs. Nothing here interprets a payload it does not own.
struct SocketEvent: Equatable {
    let name: String
    let data: Data
}

/// Live delivery for messages, typing, presence and read receipts.
///
/// ZRP's realtime server is Socket.IO (`server.js`, path `/api/socket.io`,
/// websocket transport only). The web app uses socket.io-client and
/// Android uses the Socket.IO Java client. This app speaks the same two
/// protocols directly over `URLSessionWebSocketTask` rather than adding a
/// dependency: Engine.IO v4 framing is a single leading digit, and the
/// Socket.IO layer this server uses is one more digit plus a JSON array.
/// The whole wire format the app needs is about forty lines of it.
///
/// **The socket relays; it never persists.** Sending, editing, deleting
/// and reacting all still go through the REST API, which is what writes
/// to the database - `server.js`'s handlers only forward to the other
/// party's room. So an event emitted here is a courtesy to the other
/// side, and a screen that emitted nothing would still be correct, just
/// slower for the person on the other end.
///
/// Authentication is the same NextAuth session cookie every request
/// carries: `server.js` verifies it in the handshake and derives the
/// user id from it, so a client cannot join anyone else's room.
@MainActor
final class ZrpSocket: ObservableObject {

    static let shared = ZrpSocket()

    @Published private(set) var isConnected = false

    private var task: URLSessionWebSocketTask?
    private var session: URLSession?
    private var handlers: [UUID: (SocketEvent) -> Void] = [:]

    /// Backoff for reconnection, doubled on each consecutive failure and
    /// reset on a successful handshake. Capped so a long outage does not
    /// turn into a client that has effectively given up.
    private var reconnectDelay: Duration = .seconds(1)
    private static let maxReconnectDelay: Duration = .seconds(30)
    private var reconnectTask: Task<Void, Never>?
    private var isStopped = true

    private static let url = URL(
        string: "wss://zrp.one/api/socket.io/?EIO=4&transport=websocket"
    )!

    private init() {}

    // MARK: - Subscription

    /// Registers a handler and returns the token that removes it.
    ///
    /// Every event goes to every subscriber; screens filter by name.
    /// There are only ever a handful of subscribers - the inbox, an open
    /// conversation - so a name-indexed registry would be machinery for
    /// nothing.
    func subscribe(_ handler: @escaping (SocketEvent) -> Void) -> UUID {
        let token = UUID()
        handlers[token] = handler
        return token
    }

    func unsubscribe(_ token: UUID) {
        handlers[token] = nil
    }

    // MARK: - Connection

    /// Opens the socket, if it is not already open.
    ///
    /// Safe to call from every screen that wants live updates: the second
    /// call is a no-op, and the connection outlives any one of them.
    func connect() {
        guard isStopped, SessionStore.shared.isSignedIn else { return }
        isStopped = false
        openConnection()
    }

    /// Closes the socket and stops reconnecting. Called on sign-out - a
    /// socket authenticated as the previous viewer must not outlive them.
    func disconnect() {
        isStopped = true
        reconnectTask?.cancel()
        reconnectTask = nil
        task?.cancel(with: .goingAway, reason: nil)
        task = nil
        session?.invalidateAndCancel()
        session = nil
        isConnected = false
    }

    private func openConnection() {
        guard let credentials = SessionStore.shared.current else { return }

        var request = URLRequest(url: Self.url)
        // The same cookie every REST request sends. server.js reads it in
        // the handshake and refuses the connection without it.
        request.setValue(
            "\(credentials.cookieName)=\(credentials.token)",
            forHTTPHeaderField: "Cookie"
        )
        request.setValue("1", forHTTPHeaderField: "x-zrp-native-app")

        let configuration = URLSessionConfiguration.ephemeral
        configuration.httpCookieAcceptPolicy = .never
        configuration.httpShouldSetCookies = false
        let session = URLSession(configuration: configuration)
        self.session = session

        let task = session.webSocketTask(with: request)
        self.task = task
        task.resume()
        receiveNext()
    }

    private func scheduleReconnect() {
        guard !isStopped, reconnectTask == nil else { return }
        isConnected = false
        task = nil
        session?.invalidateAndCancel()
        session = nil

        let delay = reconnectDelay
        reconnectDelay = min(delay * 2, Self.maxReconnectDelay)
        reconnectTask = Task { [weak self] in
            try? await Task.sleep(for: delay)
            guard let self, !Task.isCancelled else { return }
            self.reconnectTask = nil
            guard !self.isStopped else { return }
            self.openConnection()
        }
    }

    // MARK: - Receiving

    /// What one received frame amounts to, reduced to something safe to
    /// hand across to the main actor.
    private enum Incoming: Sendable {
        case frame(String)
        case ignored
        case failed
    }

    private func receiveNext() {
        task?.receive { result in
            // This completion runs off the main actor and its payload is
            // not `Sendable`, so the frame is reduced to a value here and
            // only that value crosses over.
            let incoming: Incoming
            switch result {
            case .success(let message):
                switch message {
                case .string(let text):
                    incoming = .frame(text)
                case .data(let data):
                    // The server sends text frames; a binary one would be
                    // a Socket.IO binary attachment, which no ZRP event
                    // uses.
                    incoming = String(data: data, encoding: .utf8)
                        .map(Incoming.frame) ?? .ignored
                @unknown default:
                    incoming = .ignored
                }
            case .failure:
                incoming = .failed
            }

            Task { @MainActor [weak self] in
                self?.receive(incoming)
            }
        }
    }

    private func receive(_ incoming: Incoming) {
        switch incoming {
        case .frame(let text):
            handle(frame: text)
            receiveNext()
        case .ignored:
            receiveNext()
        case .failed:
            // Every disconnection looks the same from here - a dropped
            // network, a server restart, a token the server stopped
            // accepting. Backing off and retrying is right for all of
            // them; a signed-out client stops because `connect()` refuses
            // without a session.
            scheduleReconnect()
        }
    }

    /// Engine.IO v4 frames. The first character is the Engine.IO packet
    /// type; for a message (`4`) the next is the Socket.IO packet type.
    private func handle(frame: String) {
        guard let first = frame.first else { return }
        let rest = String(frame.dropFirst())

        switch first {
        case "0":
            // OPEN: the handshake succeeded. Connecting to the default
            // namespace is the next step, and until it is acknowledged
            // no event will arrive.
            send(raw: "40")
            reconnectDelay = .seconds(1)

        case "2":
            // PING from the server; Engine.IO v4 expects the client to
            // answer. Missing these is what makes a socket die silently
            // after the ping timeout.
            send(raw: "3")

        case "4":
            handleSocketIO(rest)

        default:
            // CLOSE (1), UPGRADE (5), NOOP (6) - nothing this client
            // needs to act on; a close arrives as a receive failure too.
            break
        }
    }

    private func handleSocketIO(_ packet: String) {
        guard let type = packet.first else { return }
        let body = String(packet.dropFirst())

        switch type {
        case "0":
            // CONNECT acknowledged - the namespace is joined and the
            // server has already put this socket in its own user's room.
            isConnected = true

        case "2":
            // EVENT: ["name", payload]
            guard
                let data = body.data(using: .utf8),
                let array = try? JSONSerialization.jsonObject(with: data) as? [Any],
                let name = array.first as? String
            else { return }

            let argument = array.count > 1 ? array[1] : [:] as Any
            guard
                JSONSerialization.isValidJSONObject(argument),
                let payload = try? JSONSerialization.data(withJSONObject: argument)
            else { return }

            let event = SocketEvent(name: name, data: payload)
            for handler in handlers.values { handler(event) }

        case "4":
            // CONNECT_ERROR - the handshake was accepted but the
            // namespace refused us, which here means the session was not
            // valid. Retrying immediately would loop; the backoff applies.
            scheduleReconnect()

        default:
            // DISCONNECT (1), ACK (3), and the binary types (5, 6) - no
            // ZRP event uses an ack or a binary attachment.
            break
        }
    }

    // MARK: - Sending

    /// Emits a Socket.IO event.
    ///
    /// Silently does nothing when the socket is not connected. That is
    /// deliberate and safe: every one of these events is a relay to the
    /// other party, and the REST call that actually persists the change
    /// has already happened.
    func emit(_ name: String, _ payload: [String: Any]) {
        guard isConnected else { return }
        guard
            JSONSerialization.isValidJSONObject(payload),
            let data = try? JSONSerialization.data(
                withJSONObject: [name, payload] as [Any]
            ),
            let json = String(data: data, encoding: .utf8)
        else { return }
        send(raw: "42\(json)")
    }

    /// Emits an event whose argument is a bare value rather than an
    /// object.
    ///
    /// Socket.IO's wire format is `42["name", ...args]` - the argument
    /// is positional and need not be a dictionary. `join-conversation`
    /// and `leave-conversation` both take a plain conversation id
    /// string, so wrapping them in an object would send
    /// `{"conversationId": "..."}` to a handler reading a string, and
    /// the join would be silently ignored.
    func emit(_ name: String, _ argument: String) {
        guard isConnected else { return }
        guard
            let data = try? JSONSerialization.data(
                withJSONObject: [name, argument] as [Any]
            ),
            let json = String(data: data, encoding: .utf8)
        else { return }
        send(raw: "42\(json)")
    }

    private func send(raw frame: String) {
        task?.send(.string(frame)) { _ in
            // A send failure surfaces on the receive side as a
            // disconnection, which is where reconnection is handled.
        }
    }
}
