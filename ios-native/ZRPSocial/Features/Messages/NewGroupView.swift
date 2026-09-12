import SwiftUI

@MainActor
final class NewGroupViewModel: ObservableObject {

    @Published var name: String = ""
    @Published var query: String = ""
    @Published private(set) var results: [PostAuthor] = []
    @Published private(set) var suggested: [PostAuthor] = []
    @Published private(set) var selected: [PostAuthor] = []
    @Published private(set) var isSearching = false
    @Published private(set) var isCreating = false
    @Published var errorMessage: String?

    /// The route's own limits, mirrored so someone is stopped before a
    /// refusal rather than after it. `MIN_OTHER_PARTICIPANTS = 2` and
    /// `MAX_GROUP_NAME_LENGTH = 100` in `src/app/api/conversations`.
    static let minOtherMembers = 2
    static let maxNameLength = 100
    static let maxParticipants = 100

    private let conversations: ConversationsRepositoryProtocol
    private let search: SearchRepositoryProtocol
    private var searchTask: Task<Void, Never>?

    init(
        conversations: ConversationsRepositoryProtocol = ConversationsRepository(),
        search: SearchRepositoryProtocol = SearchRepository()
    ) {
        self.conversations = conversations
        self.search = search
    }

    var trimmedName: String {
        name.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    var canCreate: Bool {
        !trimmedName.isEmpty
            && trimmedName.count <= Self.maxNameLength
            && selected.count >= Self.minOtherMembers
            && selected.count + 1 <= Self.maxParticipants
            && !isCreating
    }

    /// People to offer before anyone has typed.
    ///
    /// Reuses `GET /api/users/suggested`, the same list onboarding shows,
    /// rather than presenting an empty search box with no way forward.
    func loadSuggested() async {
        suggested = (try? await search.suggestedUsers(limit: 15)) ?? []
    }

    /// Debounced, because the search route is rate-limited and a request
    /// per keystroke would spend that budget on queries nobody read.
    func searchDebounced() {
        searchTask?.cancel()
        let term = query.trimmingCharacters(in: .whitespacesAndNewlines)

        guard term.count >= 2 else {
            // The route itself requires two characters; below that there
            // is nothing to ask for.
            results = []
            isSearching = false
            return
        }

        searchTask = Task { [weak self] in
            try? await Task.sleep(for: .milliseconds(300))
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
            guard selected.count + 1 < Self.maxParticipants else { return }
            selected.append(user)
        }
    }

    func isSelected(_ user: PostAuthor) -> Bool {
        selected.contains { $0.id == user.id }
    }

    /// Creates the group and returns its id.
    ///
    /// Every rule is the route's and is enforced there: a name is
    /// required and capped, at least two other members, a member cap,
    /// users must exist, and a user who has blocked you - or whom you
    /// have blocked - cannot be added. Each has its own message, and
    /// they are shown as written rather than flattened into one generic
    /// failure; "Cannot add a user you've blocked or who has blocked
    /// you" tells someone what to do, and "Failed" does not.
    func create() async -> String? {
        guard canCreate else { return nil }
        isCreating = true
        defer { isCreating = false }

        do {
            return try await conversations.create(
                name: trimmedName,
                participantIds: selected.map(\.id),
                avatarUrl: nil
            )
        } catch let error as ApiError {
            errorMessage = error.userFacingMessage
            return nil
        } catch {
            errorMessage = L10n.string(.authErrTryAgain)
            return nil
        }
    }
}

/// Start a group.
///
/// iOS could take part in groups but never begin one, which made it a
/// second-class member of a feature it otherwise had in full.
struct NewGroupView: View {

    @StateObject private var viewModel = NewGroupViewModel()
    @EnvironmentObject private var navigator: Navigator
    @Environment(\.dismiss) private var dismiss
    @FocusState private var nameFocused: Bool

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                header
                Divider().overlay(ZrpColor.outline)
                people
            }
            .background(ZrpColor.background.ignoresSafeArea())
            .navigationTitle(Text(.iosGroupNew))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button { dismiss() } label: { Text(.actionCancel) }
                }
                ToolbarItem(placement: .topBarTrailing) {
                    Button { create() } label: {
                        Text(viewModel.isCreating ? L10nKey.iosGroupCreating : .iosGroupCreate)
                            .font(.subheadline.weight(.semibold))
                    }
                    .disabled(!viewModel.canCreate)
                }
            }
            .alert(
                Text(.iosErrorGenericTitle),
                isPresented: Binding(
                    get: { viewModel.errorMessage != nil },
                    set: { if !$0 { viewModel.errorMessage = nil } }
                )
            ) {
                Button { viewModel.errorMessage = nil } label: { Text(.actionCancel) }
            } message: {
                Text(verbatim: viewModel.errorMessage ?? "")
            }
            .task {
                nameFocused = true
                await viewModel.loadSuggested()
            }
        }
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: ZrpSpacing.md) {
            VStack(alignment: .leading, spacing: ZrpSpacing.xs) {
                Text(.iosGroupNameLabel)
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(ZrpColor.onSurfaceMuted)

                TextField(
                    text: $viewModel.name,
                    prompt: Text(.iosGroupNamePlaceholder),
                    label: { Text(.iosGroupNameLabel) }
                )
                .labelsHidden()
                .focused($nameFocused)
                .submitLabel(.done)
                .padding(ZrpSpacing.md)
                .background(ZrpColor.surfaceElevated)
                .clipShape(RoundedRectangle(cornerRadius: ZrpRadius.md))
            }

            // Says what is still needed, rather than leaving a disabled
            // button with no explanation of why.
            if viewModel.selected.count < NewGroupViewModel.minOtherMembers {
                Text(.iosGroupMinMembers)
                    .font(.caption)
                    .foregroundStyle(ZrpColor.onSurfaceMuted)
            } else {
                Text(.iosGroupSelectedCount, ["count": CountFormatting.exact(viewModel.selected.count)])
                    .font(.caption)
                    .foregroundStyle(ZrpColor.onSurfaceMuted)
            }

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
                        }
                    }
                }
                .scrollIndicators(.hidden)
            }

            TextField(
                text: $viewModel.query,
                prompt: Text(.iosGroupSearchPeople),
                label: { Text(.iosGroupSearchPeople) }
            )
            .labelsHidden()
            .autocorrectionDisabled()
            .textInputAutocapitalization(.never)
            .padding(ZrpSpacing.md)
            .background(ZrpColor.surfaceElevated)
            .clipShape(RoundedRectangle(cornerRadius: ZrpRadius.md))
            .onChange(of: viewModel.query) { _, _ in viewModel.searchDebounced() }
        }
        .padding(ZrpSpacing.lg)
    }

    @ViewBuilder
    private var people: some View {
        let showingSuggestions = viewModel.query
            .trimmingCharacters(in: .whitespacesAndNewlines).count < 2
        let list = showingSuggestions ? viewModel.suggested : viewModel.results

        ScrollView {
            LazyVStack(spacing: 0) {
                if viewModel.isSearching {
                    ProgressView()
                        .tint(ZrpColor.red)
                        .padding(ZrpSpacing.lg)
                } else if list.isEmpty {
                    Text(.searchNoUsers)
                        .font(.subheadline)
                        .foregroundStyle(ZrpColor.onSurfaceMuted)
                        .padding(.vertical, ZrpSpacing.xxl)
                } else {
                    if showingSuggestions {
                        Text(.iosGroupSuggested)
                            .font(.caption.weight(.semibold))
                            .foregroundStyle(ZrpColor.onSurfaceMuted)
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .padding(.horizontal, ZrpSpacing.lg)
                            .padding(.top, ZrpSpacing.sm)
                    }

                    ForEach(list) { user in
                        row(user)
                    }
                }
            }
            .frame(maxWidth: ZrpMetrics.contentMaxWidth)
            .frame(maxWidth: .infinity)
        }
    }

    private func row(_ user: PostAuthor) -> some View {
        Button { viewModel.toggle(user) } label: {
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
                Image(systemName: viewModel.isSelected(user) ? "checkmark.circle.fill" : "circle")
                    .foregroundStyle(
                        viewModel.isSelected(user) ? ZrpColor.red : ZrpColor.onSurfaceMuted
                    )
            }
            .padding(.horizontal, ZrpSpacing.lg)
            .padding(.vertical, ZrpSpacing.md)
            .frame(maxWidth: .infinity, alignment: .leading)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        // One stop per person for VoiceOver, with the selected state as
        // a trait rather than a separate element.
        .accessibilityElement(children: .combine)
        .accessibilityAddTraits(viewModel.isSelected(user) ? [.isButton, .isSelected] : .isButton)
    }

    private func create() {
        Task {
            guard let id = await viewModel.create() else { return }
            dismiss()
            // Straight into the group that was just made - the reason
            // anyone opened this screen.
            navigator.push(.groupConversation(id: id))
        }
    }
}
