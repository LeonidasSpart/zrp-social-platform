import Foundation
import SwiftUI

/// Owns the story rail and the state the viewer mutates.
///
/// One object for both, because opening the viewer changes what the rail
/// shows: a story marked seen has to dim its ring when the viewer closes,
/// and a like has to survive that dismissal. Keeping them apart would
/// mean refetching the whole rail just to reflect something the app
/// already knows.
@MainActor
final class StoriesViewModel: ObservableObject {

    @Published private(set) var groups: [StoryGroup] = []
    @Published private(set) var isLoading = false
    @Published private(set) var loadError: ApiError?

    private let repository: StoriesRepositoryProtocol

    /// Stories already reported as viewed this session, so advancing back
    /// and forth through a group does not re-send the same call. The route
    /// is idempotent, but there is no reason to spend the requests.
    private var reportedViews: Set<String> = []

    init(repository: StoriesRepositoryProtocol = StoriesRepository()) {
        self.repository = repository
    }

    var hasStories: Bool { !groups.isEmpty }

    func load() async {
        guard !isLoading else { return }
        isLoading = true
        defer { isLoading = false }

        do {
            groups = try await repository.stories()
            loadError = nil
        } catch let error as ApiError {
            // The rail sits above the feed; a failure here must not take
            // the timeline with it, so this is recorded and the rail
            // simply does not render.
            loadError = error
            ZrpLog.debug("Stories rail failed to load")
        } catch {
            loadError = .transport(underlying: "\(error)")
        }
    }

    /// Marks a story seen, both locally and server-side.
    ///
    /// The local update is what dims the ring the moment the viewer moves
    /// on, rather than only after the next rail refresh.
    func markViewed(_ story: Story) {
        guard !reportedViews.contains(story.id) else { return }
        reportedViews.insert(story.id)

        mutate(storyId: story.id) { stored in
            guard !stored.viewed else { return }
            stored.viewed = true
            stored.viewCount += 1
        }

        Task { [repository] in
            // A failed view report is not worth surfacing - it costs the
            // author one view count, and the story still displayed.
            try? await repository.markViewed(storyId: story.id)
        }
    }

    func toggleLike(_ story: Story) async {
        let previous = story

        mutate(storyId: story.id) { stored in
            stored.liked.toggle()
            stored.likeCount = max(0, stored.likeCount + (stored.liked ? 1 : -1))
        }

        do {
            let liked = try await repository.toggleLike(storyId: story.id)
            // Reconcile against what the server actually settled on.
            mutate(storyId: story.id) { stored in
                guard stored.liked != liked else { return }
                stored.liked = liked
                stored.likeCount = max(0, previous.likeCount + (liked ? 1 : 0))
            }
        } catch {
            mutate(storyId: story.id) { stored in
                stored.liked = previous.liked
                stored.likeCount = previous.likeCount
            }
        }
    }

    /// Applies a change to one story wherever it sits in the grouped rail.
    private func mutate(storyId: String, _ change: (inout Story) -> Void) {
        for groupIndex in groups.indices {
            guard
                let storyIndex = groups[groupIndex].stories.firstIndex(where: { $0.id == storyId })
            else { continue }
            change(&groups[groupIndex].stories[storyIndex])
            return
        }
    }

    /// The current state of a story the viewer is displaying, so it keeps
    /// showing live like and view counts as they change.
    func current(_ story: Story) -> Story {
        for group in groups {
            if let match = group.stories.first(where: { $0.id == story.id }) {
                return match
            }
        }
        return story
    }
}
