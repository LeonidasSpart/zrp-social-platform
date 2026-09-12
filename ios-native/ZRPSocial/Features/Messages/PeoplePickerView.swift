import SwiftUI

/// Choosing people, for every screen that needs to.
///
/// Extracted from the new-group screen rather than copied into the
/// add-members one. The debounce interval, the two-character minimum,
/// the suggested-users fallback and the selection cap are all rules that
/// must not drift apart between "start a group" and "add to a group" -
/// keeping one implementation is what guarantees they cannot.
@MainActor
final class PeoplePickerViewModel: ObservableObject {

    @Published var query: String = ""
    @Published private(set) var results: [PostAuthor] = []
    @Published private(set) var suggested: [PostAuthor] = []
    @Published private(set) var selected: [PostAuthor] = []
    @Published private(set) var isSearching = false

    /// People who cannot be chosen because they are already in the
    /// group. Excluded before the route has to refuse them - "Those
    /// users are already in this group" is a worse way to learn it than
    /// simply not being offered them.
    let excluded: Set<String>

    /// How many may be selected at once. The caller computes it from the
    /// route's own cap minus whoever is already there.
    let maxSelection: Int

    private let search: SearchRepositoryProtocol
    private var searchTask: Task<Void, Never>?

    /// The route itself requires two characters; below that there is
    /// nothing to ask for.
    static let minimumQueryLength = 2

    /// The search route is rate-limited, and a request per keystroke
    /// would spend that budget on queries nobody reads.
    static let debounce: Duration = .milliseconds(300)

    init(
        excluded: Set<String> = [],
        maxSelection: Int = 100,
        search: SearchRepositoryProtocol = SearchRepository()
    ) {
        self.excluded = excluded
        self.maxSelection = maxSelection
        self.search = search
    }

    var trimmedQuery: String {
        query.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    var isShowingSuggestions: Bool {
        trimmedQuery.count < Self.minimumQueryLength
    }

    /// What the list should render right now.
    var visible: [PostAuthor] {
        (isShowingSuggestions ? suggested : results)
            .filter { !excluded.contains($0.id) }
    }

    var canSelectMore: Bool { selected.count < maxSelection }

    /// Reuses `GET /api/users/suggested`, the same list onboarding
    /// shows, so the screen is never an empty box with no way forward.
    func loadSuggested() async {
        suggested = (try? await search.suggestedUsers(limit: 15)) ?? []
    }

    func searchDebounced() {
        searchTask?.cancel()
        guard trimmedQuery.count >= Self.minimumQueryLength else {
            results = []
            isSearching = false
            return
        }
        let term = trimmedQuery

        searchTask = Task { [weak self] in
            try? await Task.sleep(for: Self.debounce)
            guard !Task.isCancelled, let self else { return }
            self.isSearching = true
            defer { self.isSearching = false }
            let found = try? await self.search.search(query: term)
            guard !Task.isCancelled else { return }
            self.results = found?.users ?? []
        }
    }

    func toggle(_ user: PostAuthor) {
        if let index = selected.firstIndex(where: { $0.id == user.id }) {
            selected.remove(at: index)
        } else {
            guard !excluded.contains(user.id), canSelectMore else { return }
            selected.append(user)
        }
    }

    func isSelected(_ user: PostAuthor) -> Bool {
        selected.contains { $0.id == user.id }
    }
}

/// The selected-people chips, a search field, and the list of matches.
///
/// Deliberately not a whole screen: the new-group flow puts a name field
/// above it and the add-members flow does not, so the surrounding
/// chrome belongs to each caller.
struct PeoplePickerView: View {

    @ObservedObject var viewModel: PeoplePickerViewModel

    var body: some View {
        VStack(spacing: 0) {
            header
            Divider().overlay(ZrpColor.outline)
            list
        }
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: ZrpSpacing.md) {
            if !viewModel.selected.isEmpty {
                ScrollView(.horizontal) {
                    HStack(spacing: ZrpSpacing.sm) {
                        ForEach(viewModel.selected) { user in
                            Button { viewModel.toggle(user) } label: {
                                HStack(spacing: ZrpSpacing.xs) {
                                    Text(verbatim: user.displayName)
                                        .font(.caption)
                                        .lineLimit(1)
                                    Image(systemName: "xmark")
                                        .font(.caption2)
                                }
                                .padding(.horizontal, ZrpSpacing.sm)
                                .padding(.vertical, ZrpSpacing.xs)
                                .background(ZrpColor.surfaceElevated)
                                .clipShape(Capsule())
                            }
                            .buttonStyle(.plain)
                            .foregroundStyle(ZrpColor.onSurface)
                            .accessibilityLabel(Text(.groupInfoRemove))
                            .accessibilityValue(Text(verbatim: user.displayName))
                        }
                    }
                }
                .scrollIndicators(.hidden)
            }

            TextField(
                text: $viewModel.query,
                prompt: Text(.groupCreateSearchPlaceholder),
                label: { Text(.groupCreateSearchPlaceholder) }
            )
            .labelsHidden()
            .autocorrectionDisabled()
            .textInputAutocapitalization(.never)
            .padding(ZrpSpacing.md)
            .background(ZrpColor.surfaceElevated)
            .clipShape(RoundedRectangle(cornerRadius: ZrpRadius.md))
            .onChange(of: viewModel.query) { _, _ in viewModel.searchDebounced() }
        }
        .padding(.horizontal, ZrpSpacing.lg)
        .padding(.bottom, ZrpSpacing.md)
    }

    @ViewBuilder
    private var list: some View {
        ScrollView {
            LazyVStack(spacing: 0) {
                if viewModel.isSearching {
                    ProgressView()
                        .tint(ZrpColor.red)
                        .padding(ZrpSpacing.lg)
                } else if viewModel.visible.isEmpty {
                    Text(.searchNoUsers)
                        .font(.subheadline)
                        .foregroundStyle(ZrpColor.onSurfaceMuted)
                        .padding(.vertical, ZrpSpacing.xxl)
                } else {
                    if viewModel.isShowingSuggestions {
                        Text(.iosGroupSuggested)
                            .font(.caption.weight(.semibold))
                            .foregroundStyle(ZrpColor.onSurfaceMuted)
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .padding(.horizontal, ZrpSpacing.lg)
                            .padding(.top, ZrpSpacing.sm)
                    }

                    ForEach(viewModel.visible) { user in
                        row(user)
                    }
                }
            }
            .frame(maxWidth: ZrpMetrics.contentMaxWidth)
            .frame(maxWidth: .infinity)
        }
    }

    private func row(_ user: PostAuthor) -> some View {
        let isSelected = viewModel.isSelected(user)
        // A row that cannot be chosen because the cap is reached is
        // shown dimmed rather than hidden: disappearing rows while
        // someone is reading a list is worse than an inert one that
        // explains itself by being greyed out.
        let isReachable = isSelected || viewModel.canSelectMore

        return Button { viewModel.toggle(user) } label: {
            HStack(spacing: ZrpSpacing.md) {
                AvatarView(
                    url: user.avatarUrl,
                    displayName: user.displayName,
                    size: ZrpMetrics.avatarSmall
                )
                VStack(alignment: .leading, spacing: 0) {
                    Text(verbatim: user.displayName)
                        .font(.subheadline)
                        .foregroundStyle(ZrpColor.onSurface)
                    Text(verbatim: "@" + user.username)
                        .font(.caption)
                        .foregroundStyle(ZrpColor.onSurfaceMuted)
                }
                Spacer(minLength: 0)
                Image(systemName: isSelected ? "checkmark.circle.fill" : "circle")
                    .foregroundStyle(isSelected ? ZrpColor.red : ZrpColor.onSurfaceMuted)
            }
            .padding(.horizontal, ZrpSpacing.lg)
            .padding(.vertical, ZrpSpacing.md)
            .frame(maxWidth: .infinity, alignment: .leading)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .disabled(!isReachable)
        .opacity(isReachable ? 1 : 0.4)
        // One stop per person for VoiceOver, with the selected state as
        // a trait rather than a separate element.
        .accessibilityElement(children: .combine)
        .accessibilityAddTraits(isSelected ? [.isButton, .isSelected] : .isButton)
    }
}
