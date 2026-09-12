import PhotosUI
import SwiftUI

/// Group info, and everything the routes let this member change.
///
/// The controls are not the security boundary - the routes are. PATCH
/// and "remove someone else" are OWNER-only with a 403, and adding is
/// open to any member. This sheet offers each control exactly where the
/// route would honour it, so a refusal is never how somebody learns the
/// rule; it does not decide the rule.
struct GroupManageSheet: View {

    @ObservedObject var viewModel: GroupConversationViewModel
    let onLeave: () -> Void

    @Environment(\.dismiss) private var dismiss

    @State private var isEditingName = false
    @State private var draftName = ""
    @State private var isAddingMembers = false
    @State private var confirmingRemoval: GroupParticipant?
    @State private var pickedAvatar: PhotosPickerItem?
    @State private var isUploadingAvatar = false

    private var isOwner: Bool { viewModel.viewerRole == .owner }

    var body: some View {
        NavigationStack {
            List {
                identity
                members
                leaveSection
            }
            .listStyle(.insetGrouped)
            .scrollContentBackground(.hidden)
            .background(ZrpColor.background.ignoresSafeArea())
            .navigationTitle(Text(.groupThreadInfo))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button { dismiss() } label: { Text(.iosActionDone) }
                }
            }
            .sheet(isPresented: $isAddingMembers) {
                AddGroupMembersSheet(
                    excluded: viewModel.participantIds,
                    remainingCapacity: max(
                        0,
                        GroupConversationViewModel.maxParticipants - viewModel.participantIds.count
                    ),
                    add: { ids in await viewModel.addMembers(ids) }
                )
            }
            .alert(Text(.groupInfoRename), isPresented: $isEditingName) {
                TextField(
                    text: $draftName,
                    prompt: Text(.groupCreateNamePlaceholder),
                    label: { Text(.groupCreateNameLabel) }
                )
                Button { Task { _ = await viewModel.rename(to: draftName) } } label: {
                    Text(.actionSave)
                }
                Button(role: .cancel) {} label: { Text(.actionCancel) }
            }
            .confirmationDialog(
                Text(.groupInfoRemove),
                isPresented: Binding(
                    get: { confirmingRemoval != nil },
                    set: { if !$0 { confirmingRemoval = nil } }
                ),
                titleVisibility: .visible,
                presenting: confirmingRemoval
            ) { participant in
                Button(role: .destructive) {
                    let id = participant.userId
                    confirmingRemoval = nil
                    Task { _ = await viewModel.removeMember(id) }
                } label: {
                    Text(.groupInfoRemove)
                }
                Button(role: .cancel) { confirmingRemoval = nil } label: { Text(.actionCancel) }
            } message: { participant in
                Text(
                    .groupInfoRemoveConfirm,
                    ["name": participant.user?.displayName ?? ""]
                )
            }
            // The picker hands back an item, not bytes. Reading it is
            // async and can fail, so the upload lives in its own task
            // rather than in the picker's completion.
            .onChange(of: pickedAvatar) { _, item in
                guard let item else { return }
                Task { await uploadAvatar(item) }
            }
        }
    }

    // MARK: - Identity

    @ViewBuilder
    private var identity: some View {
        Section {
            VStack(spacing: ZrpSpacing.md) {
                ZStack(alignment: .bottomTrailing) {
                    GroupAvatarView(
                        url: viewModel.detail?.avatarUrl,
                        name: viewModel.detail?.name,
                        size: ZrpMetrics.avatarLarge
                    )
                    if isUploadingAvatar {
                        ProgressView()
                            .tint(ZrpColor.red)
                    } else if isOwner {
                        // Only an owner may PATCH, so only an owner is
                        // offered the camera badge.
                        PhotosPicker(
                            selection: $pickedAvatar,
                            matching: .images,
                            photoLibrary: .shared()
                        ) {
                            Image(systemName: "camera.fill")
                                .font(.caption)
                                .foregroundStyle(ZrpColor.onSurface)
                                .padding(ZrpSpacing.sm)
                                .background(ZrpColor.surfaceElevated, in: Circle())
                        }
                        .accessibilityLabel(Text(.groupInfoChangePhoto))
                    }
                }

                Text(verbatim: viewModel.detail?.name ?? L10n.string(.iosGroupUntitled))
                    .font(.headline)
                    .foregroundStyle(ZrpColor.onSurface)
                    .multilineTextAlignment(.center)

                Text(
                    .groupMemberCount,
                    ["count": CountFormatting.exact(viewModel.participantIds.count)]
                )
                .font(.caption)
                .foregroundStyle(ZrpColor.onSurfaceMuted)
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, ZrpSpacing.md)
            .listRowBackground(Color.clear)
        }

        if isOwner {
            Section {
                Button {
                    draftName = viewModel.detail?.name ?? ""
                    isEditingName = true
                } label: {
                    Label { Text(.groupInfoRename) } icon: {
                        Image(systemName: "pencil")
                    }
                }

                if viewModel.detail?.avatarUrl?.isEmpty == false {
                    Button(role: .destructive) {
                        Task { _ = await viewModel.setAvatar(nil) }
                    } label: {
                        Label { Text(.iosGroupRemovePhoto) } icon: {
                            Image(systemName: "trash")
                        }
                    }
                }
            }
        }
    }

    // MARK: - Members

    private var members: some View {
        Section {
            ForEach(viewModel.detail?.participants ?? []) { participant in
                memberRow(participant)
            }

            // Any member may add - that asymmetry with removal is the
            // route's, and matching it keeps iOS behaving like web and
            // Android rather than stricter for no reason.
            Button { isAddingMembers = true } label: {
                Label { Text(.groupInfoAddMembers) } icon: {
                    Image(systemName: "person.badge.plus")
                }
            }
            .disabled(viewModel.participantIds.count >= GroupConversationViewModel.maxParticipants)
        } header: {
            Text(.groupInfoMembers)
        }
    }

    private func memberRow(_ participant: GroupParticipant) -> some View {
        let isSelf = participant.userId == viewModel.viewerId
        // Owners cannot be removed by this route's own rules, and
        // removing yourself is "leave", which has its own confirmation
        // and its own navigation.
        let isRemovable = isOwner && !isSelf && participant.role != .owner

        return HStack(spacing: ZrpSpacing.md) {
            AvatarView(
                url: participant.user?.avatarUrl,
                displayName: participant.user?.displayName ?? "",
                size: ZrpMetrics.avatarSmall
            )
            VStack(alignment: .leading, spacing: 0) {
                Text(verbatim: participant.user?.displayName ?? "")
                    .font(.subheadline)
                    .foregroundStyle(ZrpColor.onSurface)
                if let username = participant.user?.username {
                    Text(verbatim: "@" + username)
                        .font(.caption)
                        .foregroundStyle(ZrpColor.onSurfaceMuted)
                }
            }
            Spacer(minLength: 0)
            if participant.role == .owner {
                Text(.groupInfoOwner)
                    .font(.caption2.weight(.semibold))
                    .foregroundStyle(ZrpColor.onSurfaceMuted)
            }
        }
        .swipeActions(edge: .trailing) {
            if isRemovable {
                Button(role: .destructive) {
                    confirmingRemoval = participant
                } label: {
                    Text(.groupInfoRemove)
                }
            }
        }
        // A swipe is invisible to VoiceOver, so the same action is
        // published as a rotor action rather than being unreachable.
        .accessibilityActions {
            if isRemovable {
                Button { confirmingRemoval = participant } label: {
                    Text(.groupInfoRemove)
                }
            }
        }
    }

    private var leaveSection: some View {
        Section {
            Button(role: .destructive) {
                dismiss()
                onLeave()
            } label: {
                Text(.groupInfoLeave)
            }
        }
    }

    // MARK: - Avatar upload

    /// Uploads through `chatImage`, the same router entry the website's
    /// own group panel uses. That matters beyond consistency: the PATCH
    /// route runs `isAllowedMediaUrl` on whatever it is given, so a
    /// group picture has to come from ZRP's own upload storage or be
    /// refused.
    private func uploadAvatar(_ item: PhotosPickerItem) async {
        pickedAvatar = nil
        isUploadingAvatar = true
        defer { isUploadingAvatar = false }

        // `try?` already flattens `loadTransferable`'s own optional, so
        // this is one unwrap, not two.
        guard let picked = try? await item.loadTransferable(type: PickedMedia.self)
        else {
            viewModel.errorMessage = L10n.string(.composerErrUploadFailed)
            return
        }
        defer { picked.discard() }

        do {
            let uploaded = try await UploadThingClient()
                .upload(picked.asUploadCandidate(), to: .chatImage) { _ in }
            _ = await viewModel.setAvatar(uploaded.url)
        } catch {
            viewModel.errorMessage = L10n.string(.composerErrUploadFailed)
        }
    }
}

/// Adding people to a group that already exists.
///
/// Reuses the same picker the new-group screen uses, with the current
/// members excluded and the remaining capacity as its cap - so the two
/// screens cannot drift apart on debounce, minimum query length, or how
/// a full group behaves.
struct AddGroupMembersSheet: View {

    let add: ([String]) async -> Bool

    @StateObject private var picker: PeoplePickerViewModel
    @Environment(\.dismiss) private var dismiss
    @State private var isAdding = false

    init(
        excluded: Set<String>,
        remainingCapacity: Int,
        add: @escaping ([String]) async -> Bool
    ) {
        self.add = add
        _picker = StateObject(
            wrappedValue: PeoplePickerViewModel(
                excluded: excluded,
                maxSelection: remainingCapacity
            )
        )
    }

    var body: some View {
        NavigationStack {
            PeoplePickerView(viewModel: picker)
                .background(ZrpColor.background.ignoresSafeArea())
                .navigationTitle(Text(.groupInfoAddMembers))
                .navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    ToolbarItem(placement: .topBarLeading) {
                        Button { dismiss() } label: { Text(.actionCancel) }
                    }
                    ToolbarItem(placement: .topBarTrailing) {
                        Button { commit() } label: {
                            Text(.groupInfoAddMembers)
                                .font(.subheadline.weight(.semibold))
                        }
                        .disabled(picker.selected.isEmpty || isAdding)
                    }
                }
                .task { await picker.loadSuggested() }
        }
    }

    private func commit() {
        guard !picker.selected.isEmpty, !isAdding else { return }
        isAdding = true
        Task {
            defer { isAdding = false }
            // Dismiss only on success. A failure - a blocked user, a
            // full group - leaves the sheet open with the selection
            // intact and the route's own wording on screen behind it,
            // rather than closing and losing what was chosen.
            if await add(picker.selected.map(\.id)) { dismiss() }
        }
    }
}
