import SwiftUI

@MainActor
final class NewGroupViewModel: ObservableObject {

    @Published var name: String = ""
    @Published private(set) var isCreating = false
    @Published var errorMessage: String?

    /// The route's own limits, mirrored so someone is stopped before a
    /// refusal rather than after it. `MIN_OTHER_PARTICIPANTS = 2` and
    /// `MAX_GROUP_NAME_LENGTH = 100` in `src/app/api/conversations`.
    static let minOtherMembers = 2
    static let maxNameLength = 100
    static let maxParticipants = 100

    /// The creator occupies one of the hundred places.
    static let maxOtherMembers = maxParticipants - 1

    private let conversations: ConversationsRepositoryProtocol

    init(conversations: ConversationsRepositoryProtocol = ConversationsRepository()) {
        self.conversations = conversations
    }

    var trimmedName: String {
        name.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    func canCreate(selectedCount: Int) -> Bool {
        !trimmedName.isEmpty
            && trimmedName.count <= Self.maxNameLength
            && selectedCount >= Self.minOtherMembers
            && selectedCount + 1 <= Self.maxParticipants
            && !isCreating
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
    func create(participantIds: [String]) async -> String? {
        guard canCreate(selectedCount: participantIds.count) else { return nil }
        isCreating = true
        defer { isCreating = false }

        do {
            return try await conversations.create(
                name: trimmedName,
                participantIds: participantIds,
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
    @StateObject private var picker = PeoplePickerViewModel(
        maxSelection: NewGroupViewModel.maxOtherMembers
    )
    @EnvironmentObject private var navigator: Navigator
    @Environment(\.dismiss) private var dismiss
    @FocusState private var nameFocused: Bool

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                nameField
                PeoplePickerView(viewModel: picker)
            }
            .background(ZrpColor.background.ignoresSafeArea())
            .navigationTitle(Text(.groupNew))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button { dismiss() } label: { Text(.actionCancel) }
                }
                ToolbarItem(placement: .topBarTrailing) {
                    Button { create() } label: {
                        Text(viewModel.isCreating ? L10nKey.groupCreateCreating : .groupCreateSubmit)
                            .font(.subheadline.weight(.semibold))
                    }
                    .disabled(!viewModel.canCreate(selectedCount: picker.selected.count))
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
                await picker.loadSuggested()
            }
        }
    }

    private var nameField: some View {
        VStack(alignment: .leading, spacing: ZrpSpacing.md) {
            VStack(alignment: .leading, spacing: ZrpSpacing.xs) {
                Text(.groupCreateNameLabel)
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(ZrpColor.onSurfaceMuted)

                TextField(
                    text: $viewModel.name,
                    prompt: Text(.groupCreateNamePlaceholder),
                    label: { Text(.groupCreateNameLabel) }
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
            if picker.selected.count < NewGroupViewModel.minOtherMembers {
                // The web string is "Add at least {count} more people",
                // so the count is how many are still MISSING, not the
                // minimum itself.
                Text(
                    .groupCreateMinMembers,
                    ["count": CountFormatting.exact(
                        NewGroupViewModel.minOtherMembers - picker.selected.count
                    )]
                )
                    .font(.caption)
                    .foregroundStyle(ZrpColor.onSurfaceMuted)
            } else {
                Text(.groupCreateSelectedCount, ["count": CountFormatting.exact(picker.selected.count)])
                    .font(.caption)
                    .foregroundStyle(ZrpColor.onSurfaceMuted)
            }
        }
        .padding(.horizontal, ZrpSpacing.lg)
        .padding(.top, ZrpSpacing.lg)
        .padding(.bottom, ZrpSpacing.md)
    }

    private func create() {
        Task {
            guard let id = await viewModel.create(participantIds: picker.selected.map(\.id))
            else { return }
            dismiss()
            // Straight into the group that was just made - the reason
            // anyone opened this screen.
            navigator.push(.groupConversation(id: id))
        }
    }
}
