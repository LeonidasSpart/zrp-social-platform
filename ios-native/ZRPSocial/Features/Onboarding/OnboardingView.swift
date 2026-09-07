import PhotosUI
import SwiftUI

/// The first-run flow, shown once between signing in and the timeline.
///
/// Gated on `onboardingCompleted`, which lives on the user row - so it
/// survives reinstalls and follows the account across devices, and the
/// app re-reads the session after finishing rather than trusting a local
/// flag.
///
/// Every step is skippable, matching the website. Onboarding that cannot
/// be escaped is a wall in front of the product, and the route offers a
/// skip for exactly that reason.
@MainActor
final class OnboardingViewModel: ObservableObject {

    enum Step: Int, CaseIterable {
        case profile
        case follow
        case done

        var titleKey: L10nKey {
            switch self {
            case .profile: return .onboardingStepProfile
            case .follow: return .onboardingStepFollow
            case .done: return .onboardingStepDone
            }
        }
    }

    @Published private(set) var step: Step = .profile

    @Published var name = ""
    @Published var bio = ""
    @Published var location = ""
    @Published var website = ""
    @Published private(set) var avatarUrl: String?
    @Published private(set) var isUploadingAvatar = false

    @Published private(set) var suggestions: [PostAuthor] = []
    @Published private(set) var selected: Set<String> = []
    @Published private(set) var isLoadingSuggestions = false

    @Published private(set) var isWorking = false
    @Published var errorText: String?

    private let users: UsersRepositoryProtocol
    private let search: SearchRepositoryProtocol
    private let uploader = UploadThingClient()

    init(
        users: UsersRepositoryProtocol = UsersRepository(),
        search: SearchRepositoryProtocol = SearchRepository()
    ) {
        self.users = users
        self.search = search
    }

    var selectedCount: Int { selected.count }

    func toggle(_ user: PostAuthor) {
        if selected.contains(user.username) {
            selected.remove(user.username)
        } else {
            selected.insert(user.username)
        }
    }

    func loadSuggestions() async {
        guard suggestions.isEmpty, !isLoadingSuggestions else { return }
        isLoadingSuggestions = true
        defer { isLoadingSuggestions = false }
        suggestions = (try? await search.suggestedUsers(limit: 20)) ?? []
    }

    func uploadAvatar(_ item: PhotosPickerItem) async {
        isUploadingAvatar = true
        defer { isUploadingAvatar = false }
        guard let picked = try? await item.loadTransferable(type: PickedMedia.self) else {
            errorText = L10n.string(.settingsErrAvatarUploadFailedGeneric)
            return
        }
        defer { picked.discard() }
        do {
            let uploaded = try await uploader.upload(picked.asUploadCandidate(), to: .avatar) { _ in }
            avatarUrl = uploaded.url
            errorText = nil
        } catch {
            errorText = L10n.string(.settingsErrAvatarUploadFailedGeneric)
        }
    }

    /// Saves the profile, then moves on. A failure keeps the person on
    /// this step with the reason, rather than advancing over lost input.
    func saveProfileAndContinue() async {
        isWorking = true
        defer { isWorking = false }
        do {
            try await users.updateProfile(
                ProfileUpdateRequest(
                    name: name.trimmingCharacters(in: .whitespacesAndNewlines).nilIfEmpty,
                    bio: bio.trimmingCharacters(in: .whitespacesAndNewlines).nilIfEmpty,
                    location: location.trimmingCharacters(in: .whitespacesAndNewlines).nilIfEmpty,
                    website: website.trimmingCharacters(in: .whitespacesAndNewlines).nilIfEmpty
                )
            )
            if let avatarUrl {
                try await users.setAvatar(url: avatarUrl)
            }
            errorText = nil
            step = .follow
        } catch {
            errorText = (error as? ApiError)?.serverMessage
                ?? L10n.string(.onboardingErrSaveProfile)
        }
    }

    /// Follows each chosen account, then moves on.
    ///
    /// The follow route is a toggle, so these run one at a time rather
    /// than concurrently: two requests racing on the same account could
    /// toggle it on and straight back off.
    func followSelectedAndContinue() async {
        isWorking = true
        defer { isWorking = false }
        for username in selected {
            _ = try? await users.toggleFollow(username: username)
        }
        errorText = nil
        step = .done
    }

    func skipToFollow() { step = .follow }
    func skipToDone() { step = .done }

    /// Marks onboarding complete server-side and reports whether it took.
    func finish() async -> Bool {
        isWorking = true
        defer { isWorking = false }
        do {
            try await users.completeOnboarding()
            return true
        } catch {
            errorText = (error as? ApiError)?.serverMessage
                ?? L10n.string(.onboardingErrSkip)
            return false
        }
    }
}

struct OnboardingView: View {

    @EnvironmentObject private var session: SessionController
    @StateObject private var viewModel = OnboardingViewModel()
    @State private var avatarSelection: PhotosPickerItem?

    var body: some View {
        VStack(spacing: 0) {
            steps
            Divider().overlay(ZrpColor.outline)

            ScrollView {
                VStack(alignment: .leading, spacing: ZrpSpacing.lg) {
                    switch viewModel.step {
                    case .profile: profileStep
                    case .follow: followStep
                    case .done: doneStep
                    }

                    if let errorText = viewModel.errorText {
                        Text(verbatim: errorText)
                            .font(.footnote)
                            .foregroundStyle(ZrpColor.red)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                }
                .padding(ZrpSpacing.lg)
                .frame(maxWidth: ZrpMetrics.contentMaxWidth, alignment: .leading)
                .frame(maxWidth: .infinity)
            }
        }
        .background(ZrpColor.background.ignoresSafeArea())
        .onChange(of: avatarSelection) { _, item in
            guard let item else { return }
            Task { await viewModel.uploadAvatar(item) }
        }
    }

    private var steps: some View {
        HStack(spacing: ZrpSpacing.sm) {
            ForEach(OnboardingViewModel.Step.allCases, id: \.rawValue) { step in
                Text(step.titleKey)
                    .font(.caption.weight(step == viewModel.step ? .bold : .regular))
                    .foregroundStyle(step == viewModel.step ? ZrpColor.red : ZrpColor.onSurfaceMuted)
                    .frame(maxWidth: .infinity)
            }
        }
        .padding(.horizontal, ZrpSpacing.lg)
        .padding(.vertical, ZrpSpacing.md)
        .accessibilityElement(children: .combine)
    }

    // MARK: - Step 1

    private var profileStep: some View {
        VStack(alignment: .leading, spacing: ZrpSpacing.lg) {
            Text(.onboardingWelcomeTitle)
                .font(.title3.weight(.bold))
                .foregroundStyle(ZrpColor.onSurface)
            Text(.onboardingSetupSubtitle)
                .font(.subheadline)
                .foregroundStyle(ZrpColor.onSurfaceMuted)

            HStack(spacing: ZrpSpacing.md) {
                AvatarView(
                    url: viewModel.avatarUrl,
                    displayName: viewModel.name.isEmpty
                        ? (session.currentUser?.displayName ?? "")
                        : viewModel.name,
                    size: ZrpMetrics.avatarLarge
                )
                PhotosPicker(selection: $avatarSelection, matching: .images) {
                    Text(viewModel.isUploadingAvatar ? L10nKey.settingsUploading : L10nKey.onboardingUpload)
                        .font(.subheadline.weight(.medium))
                        .padding(.horizontal, ZrpSpacing.lg)
                        .frame(minHeight: ZrpMetrics.minTouchTarget)
                        .background(ZrpColor.surfaceElevated)
                        .foregroundStyle(ZrpColor.onSurface)
                        .clipShape(Capsule())
                }
                .disabled(viewModel.isUploadingAvatar)
            }

            field(.onboardingDisplayNamePlaceholder, text: $viewModel.name)
            multilineField(.onboardingBioPlaceholder, text: $viewModel.bio)
            field(.settingsCityPlaceholder, text: $viewModel.location)
            field(.onboardingWebsitePlaceholder, text: $viewModel.website)
                .keyboardType(.URL)
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()

            actions(
                primary: .onboardingContinue,
                primaryAction: { await viewModel.saveProfileAndContinue() },
                skip: { viewModel.skipToFollow() }
            )
        }
    }

    // MARK: - Step 2

    private var followStep: some View {
        VStack(alignment: .leading, spacing: ZrpSpacing.lg) {
            Text(.onboardingFollowTitle)
                .font(.title3.weight(.bold))
                .foregroundStyle(ZrpColor.onSurface)
            Text(.onboardingFollowSubtitle)
                .font(.subheadline)
                .foregroundStyle(ZrpColor.onSurfaceMuted)

            if viewModel.isLoadingSuggestions {
                ProgressView().tint(ZrpColor.red).frame(maxWidth: .infinity)
            } else if viewModel.suggestions.isEmpty {
                Text(.onboardingNoSuggestions)
                    .font(.footnote)
                    .foregroundStyle(ZrpColor.onSurfaceMuted)
            } else {
                ForEach(viewModel.suggestions) { user in
                    suggestionRow(user)
                }
                Text(.onboardingUsersSelected, ["n": CountFormatting.exact(viewModel.selectedCount)])
                    .font(.caption)
                    .foregroundStyle(ZrpColor.onSurfaceMuted)
            }

            actions(
                primary: .onboardingContinue,
                primaryAction: { await viewModel.followSelectedAndContinue() },
                skip: { viewModel.skipToDone() }
            )
        }
        .task { await viewModel.loadSuggestions() }
    }

    private func suggestionRow(_ user: PostAuthor) -> some View {
        let isSelected = viewModel.selected.contains(user.username)
        return Button {
            viewModel.toggle(user)
        } label: {
            HStack(spacing: ZrpSpacing.md) {
                AvatarView(url: user.avatarUrl, displayName: user.displayName, size: ZrpMetrics.avatarMedium)
                VStack(alignment: .leading, spacing: 2) {
                    Text(verbatim: user.displayName)
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(ZrpColor.onSurface)
                        .lineLimit(1)
                    Text(verbatim: user.handle)
                        .font(.caption)
                        .foregroundStyle(ZrpColor.onSurfaceMuted)
                        .lineLimit(1)
                }
                Spacer(minLength: 0)
                Image(systemName: isSelected ? "checkmark.circle.fill" : "circle")
                    .foregroundStyle(isSelected ? ZrpColor.red : ZrpColor.onSurfaceMuted)
                    .accessibilityHidden(true)
            }
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityElement(children: .combine)
        .accessibilityAddTraits(isSelected ? [.isButton, .isSelected] : .isButton)
    }

    // MARK: - Step 3

    private var doneStep: some View {
        VStack(alignment: .leading, spacing: ZrpSpacing.lg) {
            Text(.onboardingDoneTitle)
                .font(.title3.weight(.bold))
                .foregroundStyle(ZrpColor.onSurface)
            Text(.onboardingDoneSubtitle)
                .font(.subheadline)
                .foregroundStyle(ZrpColor.onSurfaceMuted)

            Button {
                Task {
                    if await viewModel.finish() {
                        // Re-read the session rather than flipping a
                        // local flag: `onboardingCompleted` lives on the
                        // user row, and the app should believe the row.
                        await session.restore()
                    }
                }
            } label: {
                Text(viewModel.isWorking ? L10nKey.settingsSaving : L10nKey.onboardingGoToHome)
                    .font(.subheadline.weight(.bold))
                    .frame(maxWidth: .infinity)
                    .frame(minHeight: ZrpMetrics.minTouchTarget)
                    .background(ZrpColor.red)
                    .foregroundStyle(.white)
                    .clipShape(RoundedRectangle(cornerRadius: ZrpRadius.md))
            }
            .buttonStyle(.plain)
            .disabled(viewModel.isWorking)
        }
    }

    // MARK: - Shared

    private func actions(
        primary: L10nKey,
        primaryAction: @escaping () async -> Void,
        skip: @escaping () -> Void
    ) -> some View {
        VStack(spacing: ZrpSpacing.sm) {
            Button {
                Task { await primaryAction() }
            } label: {
                Text(viewModel.isWorking ? L10nKey.settingsSaving : primary)
                    .font(.subheadline.weight(.bold))
                    .frame(maxWidth: .infinity)
                    .frame(minHeight: ZrpMetrics.minTouchTarget)
                    .background(ZrpColor.red)
                    .foregroundStyle(.white)
                    .clipShape(RoundedRectangle(cornerRadius: ZrpRadius.md))
            }
            .buttonStyle(.plain)
            .disabled(viewModel.isWorking)

            Button(action: skip) {
                Text(.onboardingSkip)
                    .font(.footnote)
                    .foregroundStyle(ZrpColor.onSurfaceMuted)
            }
            .buttonStyle(.plain)
        }
    }

    private func field(_ key: L10nKey, text: Binding<String>) -> some View {
        TextField(text: text, prompt: Text(key), label: { Text(key) })
            .labelsHidden()
            .padding(ZrpSpacing.md)
            .background(ZrpColor.surfaceElevated)
            .clipShape(RoundedRectangle(cornerRadius: ZrpRadius.md))
    }

    private func multilineField(_ key: L10nKey, text: Binding<String>) -> some View {
        TextField(text: text, prompt: Text(key), axis: .vertical, label: { Text(key) })
            .labelsHidden()
            .lineLimit(3...6)
            .padding(ZrpSpacing.md)
            .background(ZrpColor.surfaceElevated)
            .clipShape(RoundedRectangle(cornerRadius: ZrpRadius.md))
    }
}
