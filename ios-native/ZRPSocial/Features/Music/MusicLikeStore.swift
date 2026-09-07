import SwiftUI

/// One app-wide record of which tracks the viewer has liked.
///
/// The same track appears on the music home, in an artist page, inside an
/// album, in a playlist and in the queue. Each of those screens loads its
/// own response, and only some of those responses carry a `liked` flag at
/// all - so without a shared record, liking a track in one place would
/// leave every other place showing an empty heart until it was refetched.
///
/// This is the music counterpart of `PostInteractionStore`, and works the
/// same way: optimistic locally, corrected by whatever the server returns,
/// reverted if the call fails.
@MainActor
final class MusicLikeStore: ObservableObject {

    @Published private(set) var liked: [String: Bool] = [:]

    private let repository: MusicRepositoryProtocol

    init(repository: MusicRepositoryProtocol = MusicRepository()) {
        self.repository = repository
    }

    func isLiked(_ track: MusicTrack) -> Bool {
        liked[track.id] ?? track.liked ?? false
    }

    /// Records what a freshly decoded response said, without overwriting a
    /// value the viewer has since changed by hand... which is why only
    /// tracks whose route actually reports `liked` are taken: a route that
    /// omits the flag says nothing about it, and must not be read as
    /// "not liked".
    func seed(_ tracks: [MusicTrack]) {
        for track in tracks {
            guard let value = track.liked else { continue }
            liked[track.id] = value
        }
    }

    /// For rows that are liked by construction - the liked preview on the
    /// music home, and the Liked page - where the payload is the viewer's
    /// own like rows and the wrapped track carries no flag of its own.
    func markLiked(_ tracks: [MusicTrack]) {
        for track in tracks {
            liked[track.id] = true
        }
    }

    func toggle(_ track: MusicTrack) async {
        let previous = isLiked(track)
        liked[track.id] = !previous
        do {
            liked[track.id] = try await repository.toggleLike(trackId: track.id)
        } catch {
            liked[track.id] = previous
        }
    }

    /// Called when the session ends, so the next person to sign in on this
    /// device does not inherit the previous viewer's hearts.
    func clear() {
        liked.removeAll()
    }
}
