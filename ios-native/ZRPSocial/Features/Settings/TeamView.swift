import SwiftUI

@MainActor
final class TeamViewModel: ObservableObject {

    enum Phase: Equatable {
        case loading
        case loaded(TeamRoster)
        /// The plan gate. Kept separate from a transport failure
        /// because it is not something to retry - it is something to
        /// read.
        case notEntitled(String)
        case failed(ApiError)
    }

    @Published private(set) var phase: Phase = .loading
    @Published private(set) var isWorking = false
    @Published var errorMessage: String?

    private let repository: TeamRepositoryProtocol

    init(repository: TeamRepositoryProtocol = TeamRepository()) {
        self.repository = repository
    }

    var roster: TeamRoster? {
        if case .loaded(let roster) = phase { return roster }
        return nil
    }

    func load() async {
        if case .loaded = phase {} else { phase = .loading }
        do {
            phase = .loaded(try await repository.roster())
        } catch ApiError.cancelled {
            return
        } catch let error as ApiError {
            // A 403 here is the plan gate and nothing else: the route
            // refuses non-Business/Enterprise accounts with its own
            // wording. Showing that wording beats "something went
            // wrong", which would send someone looking for a bug.
            if case .forbidden = error {
                phase = .notEntitled(error.userFacingMessage)
            } else {
                phase = .failed(error)
            }
        } catch {
            phase = .failed(.transport(underlying: "\(error)"))
        }
    }

    func add(email: String, role: TeamRole) async -> Bool {
        await perform { try await self.repository.add(email: email, role: role) }
    }

    func setRole(_ member: TeamMember, to role: TeamRole) async {
        _ = await perform { try await self.repository.setRole(memberId: member.id, role: role) }
    }

    func remove(_ member: TeamMember) async {
        _ = await perform { try await self.repository.remove(memberId: member.id) }
    }

    /// Runs a mutation and reloads from the server afterwards.
    ///
    /// Reloading rather than patching the array locally: the route
    /// returns the whole roster and it is the only thing that knows what
    /// the team now looks like - including a change somebody else made.
    private func perform(_ work: @escaping () async throws -> Void) async -> Bool {
        guard !isWorking else { return false }
        isWorking = true
        defer { isWorking = false }
        do {
            try await work()
            await load()
            return true
        } catch let error as ApiError {
            errorMessage = error.userFacingMessage
            return false
        } catch {
            errorMessage = L10n.string(.teamErrLoadFailed)
            return false
        }
    }
}

/// Team management.
///
/// Business and Enterprise only, and that is the **server's** rule: every
/// one of the four routes independently checks `canManageTeam` and
/// answers 403 with its own wording. This screen shows that wording
/// rather than hiding itself, because someone on a Pro plan looking for
/// a feature they read about deserves to be told why it is not there.
struct TeamView: View {

    @StateObject private var viewModel = TeamViewModel()
    @State private var isAdding = false
    @State private var confirmingRemoval: TeamMember?

    var body: some View {
        Group {
            switch viewModel.phase {
            case .loading:
                TimelineStateView.loading()
            case .notEntitled(let message):
                upgradeNotice(message)
            case .failed(let error):
                TimelineStateView.error(error) { Task { await viewModel.load() } }
            case .loaded(let roster):
                list(roster)
            }
        }
        .background(ZrpColor.background.ignoresSafeArea())
        .navigationTitle(Text(.teamTitle))
        .navigationBarTitleDisplayMode(.inline)
        .task { await viewModel.load() }
        .alert(
            Text(.iosErrorGenericTitle),
            isPresented: Binding(
                get: { viewModel.errorMessage != nil },
                set: { if !$0 { viewModel.errorMessage = nil } }
            )
        ) {
            Button { viewModel.errorMessage = nil } label: { Text(.teamCancel) }
        } message: {
            Text(verbatim: viewModel.errorMessage ?? "")
        }
        .sheet(isPresented: $isAdding) {
            AddTeamMemberSheet { email, role in
                await viewModel.add(email: email, role: role)
            }
        }
        .confirmationDialog(
            Text(.teamRemoveDialogTitle),
            isPresented: Binding(
                get: { confirmingRemoval != nil },
                set: { if !$0 { confirmingRemoval = nil } }
            ),
            titleVisibility: .visible,
            presenting: confirmingRemoval
        ) { member in
            Button(role: .destructive) {
                let target = member
                confirmingRemoval = nil
                Task { await viewModel.remove(target) }
            } label: {
                Text(.teamRemove)
            }
            Button(role: .cancel) { confirmingRemoval = nil } label: { Text(.teamCancel) }
        } message: { member in
            Text(.teamRemoveConfirm, ["email": member.user?.email ?? member.user?.displayName ?? ""])
        }
    }

    private func upgradeNotice(_ message: String) -> some View {
        VStack(spacing: ZrpSpacing.md) {
            Image(systemName: "person.3")
                .font(.largeTitle)
                .foregroundStyle(ZrpColor.onSurfaceMuted)
            Text(.teamUpgradeRequired)
                .font(.headline)
                .foregroundStyle(ZrpColor.onSurface)
            // The route's own sentence, not a paraphrase.
            Text(verbatim: message)
                .font(.subheadline)
                .foregroundStyle(ZrpColor.onSurfaceMuted)
                .multilineTextAlignment(.center)
                .fixedSize(horizontal: false, vertical: true)

            // No upgrade button. Buying a plan inside the app is a
            // payment surface Apple's rules keep out of it - the same
            // reason tips and premium posts are absent. Web has the
            // button; this says what is needed and stops there.
            Text(.teamUpgradeBusinessDesc)
                .font(.caption)
                .foregroundStyle(ZrpColor.onSurfaceMuted)
                .multilineTextAlignment(.center)
                .fixedSize(horizontal: false, vertical: true)
        }
        .padding(ZrpSpacing.xl)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    private func list(_ roster: TeamRoster) -> some View {
        List {
            if let owner = roster.owner {
                Section {
                    ownerRow(owner)
                } header: {
                    Text(.teamAccountOwner)
                }
            }

            Section {
                if roster.members.isEmpty {
                    Text(.teamNoMembers)
                        .font(.subheadline)
                        .foregroundStyle(ZrpColor.onSurfaceMuted)
                } else {
                    ForEach(roster.members) { member in
                        memberRow(member)
                    }
                }
            } header: {
                HStack {
                    Text(.teamTeamMembers)
                    Spacer(minLength: ZrpSpacing.sm)
                    Text(verbatim: CountFormatting.exact(roster.members.count))
                }
            }

            Section {
                ForEach(TeamRole.assignable) { role in
                    if let description = role.descriptionKey {
                        Text(description)
                            .font(.caption)
                            .foregroundStyle(ZrpColor.onSurfaceMuted)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                }
            } header: {
                Text(.teamRole)
            }
        }
        .listStyle(.insetGrouped)
        .scrollContentBackground(.hidden)
        .refreshable { await viewModel.load() }
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button { isAdding = true } label: {
                    Image(systemName: "person.badge.plus")
                }
                .disabled(viewModel.isWorking)
                .accessibilityLabel(Text(.teamAddMember))
            }
        }
    }

    private func ownerRow(_ owner: TeamOwner) -> some View {
        HStack(spacing: ZrpSpacing.md) {
            AvatarView(
                url: owner.avatarUrl,
                displayName: owner.displayName,
                size: ZrpMetrics.avatarSmall
            )
            VStack(alignment: .leading, spacing: 0) {
                Text(verbatim: owner.displayName)
                    .font(.subheadline)
                    .foregroundStyle(ZrpColor.onSurface)
                if let email = owner.email {
                    Text(verbatim: email)
                        .font(.caption)
                        .foregroundStyle(ZrpColor.onSurfaceMuted)
                }
            }
            Spacer(minLength: 0)
            Text(.teamRoleOwner)
                .font(.caption2.weight(.semibold))
                .foregroundStyle(ZrpColor.onSurfaceMuted)
        }
        .accessibilityElement(children: .combine)
    }

    private func memberRow(_ member: TeamMember) -> some View {
        HStack(spacing: ZrpSpacing.md) {
            AvatarView(
                url: member.user?.avatarUrl,
                displayName: member.user?.displayName ?? "",
                size: ZrpMetrics.avatarSmall
            )
            VStack(alignment: .leading, spacing: 0) {
                Text(verbatim: member.user?.displayName ?? "")
                    .font(.subheadline)
                    .foregroundStyle(ZrpColor.onSurface)
                if let email = member.user?.email {
                    Text(verbatim: email)
                        .font(.caption)
                        .foregroundStyle(ZrpColor.onSurfaceMuted)
                }
            }
            Spacer(minLength: 0)

            // Changing a role in place rather than in a separate sheet:
            // it is the one thing PATCH does, and the three values are
            // the only ones the route accepts.
            Picker(
                selection: Binding(
                    get: { member.role },
                    set: { newRole in Task { await viewModel.setRole(member, to: newRole) } }
                )
            ) {
                ForEach(TeamRole.assignable) { role in
                    if let key = role.titleKey {
                        Text(key).tag(role)
                    }
                }
            } label: {
                Text(.teamColRole)
            }
            .labelsHidden()
            .pickerStyle(.menu)
            .disabled(viewModel.isWorking)
        }
        .swipeActions(edge: .trailing) {
            Button(role: .destructive) { confirmingRemoval = member } label: {
                Text(.teamRemove)
            }
        }
        // A swipe is invisible to VoiceOver.
        .accessibilityActions {
            Button { confirmingRemoval = member } label: { Text(.teamRemove) }
        }
    }
}

/// Adding somebody by email.
///
/// The route looks the address up and refuses one that belongs to
/// nobody - it cannot invite a stranger, only add an existing ZRP
/// account - so its wording ("They need to sign up first") is what gets
/// shown rather than a generic failure.
struct AddTeamMemberSheet: View {

    let add: (String, TeamRole) async -> Bool

    @Environment(\.dismiss) private var dismiss
    @State private var email = ""
    @State private var role: TeamRole = .viewer
    @State private var isAdding = false

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextField(
                        text: $email,
                        prompt: Text(.teamEmailPlaceholder),
                        label: { Text(.teamEmailAddress) }
                    )
                    .keyboardType(.emailAddress)
                    .autocorrectionDisabled()
                    .textInputAutocapitalization(.never)

                    Picker(selection: $role) {
                        ForEach(TeamRole.assignable) { role in
                            if let key = role.titleKey {
                                Text(key).tag(role)
                            }
                        }
                    } label: {
                        Text(.teamRole)
                    }
                } footer: {
                    if let description = role.descriptionKey {
                        Text(description)
                    }
                }
            }
            .scrollContentBackground(.hidden)
            .background(ZrpColor.background.ignoresSafeArea())
            .navigationTitle(Text(.teamAddDialogTitle))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button { dismiss() } label: { Text(.teamCancel) }
                }
                ToolbarItem(placement: .topBarTrailing) {
                    Button { commit() } label: {
                        Text(isAdding ? L10nKey.teamAdding : .teamAddMember)
                            .font(.subheadline.weight(.semibold))
                    }
                    .disabled(email.trimmingCharacters(in: .whitespaces).isEmpty || isAdding)
                }
            }
        }
    }

    private func commit() {
        guard !isAdding else { return }
        isAdding = true
        Task {
            defer { isAdding = false }
            // Closes only on success, so a refusal - already a member,
            // no such account, adding yourself - leaves the address on
            // screen with the route's explanation behind it.
            if await add(email, role) { dismiss() }
        }
    }
}
