import Foundation

@MainActor
final class CreatorStudioViewModel: ObservableObject {

    enum Tab: Hashable, CaseIterable {
        case content
        case audience

        var titleKey: L10nKey {
            switch self {
            case .content: return .creatorDashTabContent
            case .audience: return .creatorDashTabAudience
            }
        }
    }

    enum Phase: Equatable {
        case loading
        case loaded(CreatorStudio)
        case failed(ApiError)

        static func == (lhs: Phase, rhs: Phase) -> Bool {
            switch (lhs, rhs) {
            case (.loading, .loading): return true
            case (.failed(let a), .failed(let b)): return a == b
            // `CreatorStudio` is not Equatable and there is nothing to
            // gain from making it so: this comparison exists only so the
            // phase can be diffed, and two loaded phases are never
            // meaningfully "unchanged" - a reload always replaces one.
            case (.loaded, .loaded): return false
            default: return false
            }
        }
    }

    @Published private(set) var phase: Phase = .loading
    @Published var tab: Tab = .content

    private let repository: CreatorStudioRepositoryProtocol

    init(repository: CreatorStudioRepositoryProtocol = CreatorStudioRepository()) {
        self.repository = repository
    }

    /// One request serves both tabs, so switching between them costs
    /// nothing and never refetches.
    func load() async {
        if case .loaded = phase {} else { phase = .loading }
        do {
            phase = .loaded(try await repository.studio())
        } catch ApiError.cancelled {
            return
        } catch {
            phase = .failed(error as? ApiError ?? .transport(underlying: "\(error)"))
        }
    }
}
