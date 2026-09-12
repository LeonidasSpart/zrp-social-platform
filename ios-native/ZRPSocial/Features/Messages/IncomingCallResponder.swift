import SwiftUI

/// Answers incoming calls the only honest way this app currently can:
/// by declining them, immediately, and telling you who called.
///
/// **Why this exists.** ZRP's calling is WebRTC. This app carries no
/// third-party dependencies and Apple ships no WebRTC framework, so it
/// cannot place or take a call today - that is a dependency decision
/// recorded in PARITY.md, not something this type works around.
///
/// What it fixes is a different, worse problem. The server relays
/// `incoming-call` into the recipient's socket room. This app was
/// connected to that room and simply ignored the event, so from the
/// CALLER's side - on web or Android - the call rang forever: their UI
/// sets state "calling" and has no timeout of any kind. A caller could
/// not tell "they're ignoring me" from "that device can't ring". They
/// just waited.
///
/// So: reply. `reject-call` is the event the protocol already has for
/// "this call is not happening", and the server only relays it for a
/// call that was genuinely placed to this user, by one of its two
/// parties. Emitting it releases the caller's UI at once.
///
/// And tell the person. Declining silently would fix the caller and
/// leave the recipient never knowing anyone called - trading one
/// invisible failure for another. The alert names the caller and says
/// where the call can actually be answered.
///
/// The backend half of this is `call-user`'s presence check in
/// `server.js`: a recipient with no connected socket at all is refused
/// before anything rings. This handles the other case - connected, and
/// unable to answer.
@MainActor
final class IncomingCallResponder: ObservableObject {

    /// The caller's display name, set when a call has just been
    /// declined on the person's behalf. `nil` dismisses the alert.
    @Published var missedCallerName: String?

    private let socket: ZrpSocket
    private var token: UUID?

    init(socket: ZrpSocket? = nil) {
        // Not a default argument: a default is evaluated outside the
        // actor, and `ZrpSocket.shared` is main-actor isolated.
        self.socket = socket ?? .shared
    }

    /// One payload shape, three events.
    ///
    /// `incoming-call` carries `callerId` and `callerName`; the three
    /// terminal events carry nothing this app needs. Decoding leniently
    /// means an event whose shape changes server-side degrades to "no
    /// name" rather than to a crash.
    private struct IncomingCall: Decodable {
        let callerId: String?
        let callerName: String?
    }

    func start() {
        guard token == nil else { return }
        socket.connect()
        token = socket.subscribe { [weak self] event in
            guard let self else { return }
            switch event.name {
            case "incoming-call":
                self.decline(event.data)

            // A call this app never accepted can still end or be
            // cancelled from the other side. Nothing to tear down - no
            // call was ever established - but the alert should not
            // outlive the call that caused it.
            case "call-ended", "call-rejected":
                self.missedCallerName = nil

            default:
                break
            }
        }
    }

    func stop() {
        if let token { socket.unsubscribe(token) }
        token = nil
        missedCallerName = nil
    }

    private func decline(_ data: Data) {
        let call = try? JSONDecoder().decode(IncomingCall.self, from: data)

        // The refusal goes first. Whatever happens to the alert - the
        // app backgrounds, the view is not on screen yet - the caller is
        // released either way, which is the part that affects somebody
        // else.
        if let callerId = call?.callerId, !callerId.isEmpty {
            socket.emit("reject-call", ["callerId": callerId])
        }

        let name = call?.callerName?.trimmingCharacters(in: .whitespacesAndNewlines)
        // "Someone", not the Messages tab title - a fallback used in
        // place of a person's name has to read like a person.
        missedCallerName = (name?.isEmpty == false ? name : nil)
            ?? L10n.string(.iosCallUnknownCaller)
    }
}

extension View {
    /// Presents the missed-call notice wherever it is attached.
    ///
    /// Applied once, at the tab shell, rather than per screen: a call
    /// arrives while you are anywhere in the app, and a notice bound to
    /// the conversation view would only appear if you happened to be
    /// reading that thread.
    func incomingCallNotice(_ responder: IncomingCallResponder) -> some View {
        alert(
            Text(.iosCallMissedTitle),
            isPresented: Binding(
                get: { responder.missedCallerName != nil },
                set: { if !$0 { responder.missedCallerName = nil } }
            ),
            presenting: responder.missedCallerName
        ) { _ in
            Button { responder.missedCallerName = nil } label: {
                Text(.iosCallDismiss)
            }
        } message: { name in
            Text(.iosCallMissedBody, ["name": name])
        }
    }
}
