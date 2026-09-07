import PhotosUI
import SwiftUI

/// Edit the viewer's own profile.
///
/// Loads the real profile first rather than starting from blanks: the
/// route writes every field it is given, so a form that rendered empty
/// boxes it never read would erase a bio and a website on save. Same
/// reasoning as the Music Studio's artist editor.
struct EditProfileView: View {

    @EnvironmentObject private var session: SessionController

    private enum LoadState: Equatable {
        case loading
        case loaded
        case failed(ApiError)
    }

    @State private var loadState: LoadState = .loading
    @State private var name = ""
    @State private var bio = ""
    @State private var location = ""
    @State private var website = ""
    @State private var avatarUrl: String?
    @State private var coverUrl: String?

    @State private var avatarSelection: PhotosPickerItem?
    @State private var coverSelection: PhotosPickerItem?
    @State private var uploading: Set<String> = []
    @State private var isSaving = false
    @State private var message: SettingsMessage?

    private let users = UsersRepository()
    private let uploader = UploadThingClient()

    var body: some View {
        Group {
            switch loadState {
            case .loading:
                TimelineStateView.loading()
            case .failed(let error):
                TimelineStateView.error(error) { Task { await load() } }
            case .loaded:
                form
            }
        }
        .background(ZrpColor.background.ignoresSafeArea())
        .navigationTitle(Text(.settingsProfile))
        .navigationBarTitleDisplayMode(.inline)
        .task { await load() }
        .onChange(of: avatarSelection) { _, item in
            guard let item else { return }
            Task { await upload(item, kind: "avatar") }
        }
        .onChange(of: coverSelection) { _, item in
            guard let item else { return }
            Task { await upload(item, kind: "cover") }
        }
    }

    private func load() async {
        guard let username = session.currentUser?.username else { return }
        loadState = .loading
        do {
            let profile = try await users.profile(username: username)
            name = profile.name ?? ""
            bio = profile.bio ?? ""
            location = profile.location ?? ""
            website = profile.website ?? ""
            avatarUrl = profile.avatarUrl
            coverUrl = profile.coverUrl
            loadState = .loaded
        } catch {
            loadState = .failed(error as? ApiError ?? .transport(underlying: "\(error)"))
        }
    }

    private var form: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: ZrpSpacing.lg) {
                imagePickers

                labelled(.settingsDisplayName) { field(.settingsDisplayName, text: $name) }
                labelled(.settingsBio) { multiline(.settingsBioPlaceholder, text: $bio) }
                labelled(.settingsCity) { field(.settingsCityPlaceholder, text: $location) }
                labelled(.settingsWebsite) {
                    field(.settingsWebsitePlaceholder, text: $website)
                        .keyboardType(.URL)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                }

                if let message {
                    Text(verbatim: message.text)
                        .font(.footnote)
                        .foregroundStyle(message.isError ? ZrpColor.red : ZrpColor.green)
                        .fixedSize(horizontal: false, vertical: true)
                }

                Button { save() } label: {
                    Text(isSaving ? L10nKey.settingsSaving : L10nKey.settingsUpdateProfile)
                        .font(.subheadline.weight(.bold))
                        .frame(maxWidth: .infinity)
                        .frame(minHeight: ZrpMetrics.minTouchTarget)
                        .background(ZrpColor.red)
                        .foregroundStyle(.white)
                        .clipShape(RoundedRectangle(cornerRadius: ZrpRadius.md))
                }
                .buttonStyle(.plain)
                .disabled(isSaving || !uploading.isEmpty)
            }
            .padding(ZrpSpacing.lg)
            .frame(maxWidth: ZrpMetrics.contentMaxWidth, alignment: .leading)
            .frame(maxWidth: .infinity)
        }
    }

    private var imagePickers: some View {
        VStack(alignment: .leading, spacing: ZrpSpacing.md) {
            ZStack(alignment: .bottomLeading) {
                RemoteImage(url: coverUrl, targetSize: 160) { ZrpColor.surfaceHighest }
                    .scaledToFill()
                    .frame(height: 120)
                    .frame(maxWidth: .infinity)
                    .clipped()
                    .clipShape(RoundedRectangle(cornerRadius: ZrpRadius.md))

                AvatarView(
                    url: avatarUrl,
                    displayName: name.isEmpty ? (session.currentUser?.displayName ?? "") : name,
                    size: ZrpMetrics.avatarLarge
                )
                .overlay(Circle().strokeBorder(ZrpColor.background, lineWidth: 3))
                .padding(.leading, ZrpSpacing.md)
                .offset(y: ZrpMetrics.avatarLarge / 2)
            }
            .padding(.bottom, ZrpMetrics.avatarLarge / 2)

            HStack(spacing: ZrpSpacing.sm) {
                PhotosPicker(selection: $avatarSelection, matching: .images) {
                    pickerLabel(.settingsProfilePicture, isBusy: uploading.contains("avatar"))
                }
                .disabled(!uploading.isEmpty)

                PhotosPicker(selection: $coverSelection, matching: .images) {
                    pickerLabel(.marketplacePhotos, isBusy: uploading.contains("cover"))
                }
                .disabled(!uploading.isEmpty)
            }

            Text(.settingsUploadProfilePicNote)
                .font(.caption)
                .foregroundStyle(ZrpColor.onSurfaceMuted)
        }
    }

    private func pickerLabel(_ key: L10nKey, isBusy: Bool) -> some View {
        Text(isBusy ? L10nKey.settingsUploading : key)
            .font(.footnote.weight(.medium))
            .frame(maxWidth: .infinity)
            .frame(minHeight: ZrpMetrics.minTouchTarget)
            .background(ZrpColor.surfaceElevated)
            .foregroundStyle(ZrpColor.onSurface)
            .clipShape(RoundedRectangle(cornerRadius: ZrpRadius.md))
    }

    /// Uploads through UploadThing, then tells the account about the
    /// resulting URL. Both routes reject anything not on UploadThing's
    /// hosts, so this order is the only one that works.
    private func upload(_ item: PhotosPickerItem, kind: String) async {
        uploading.insert(kind)
        defer { uploading.remove(kind) }

        guard let picked = try? await item.loadTransferable(type: PickedMedia.self) else {
            message = SettingsMessage(text: L10n.string(.settingsErrAvatarUploadFailedGeneric), isError: true)
            return
        }
        defer { picked.discard() }

        do {
            let slug: UploadThingClient.Slug = kind == "avatar" ? .avatar : .banner
            let uploaded = try await uploader.upload(picked.asUploadCandidate(), to: slug) { _ in }
            if kind == "avatar" {
                try await users.setAvatar(url: uploaded.url)
                avatarUrl = uploaded.url
            } else {
                try await users.setCover(url: uploaded.url)
                coverUrl = uploaded.url
            }
            message = SettingsMessage(text: L10n.string(.settingsSuccessAvatarUpdated), isError: false)
        } catch {
            message = SettingsMessage(
                text: (error as? ApiError)?.serverMessage
                    ?? L10n.string(.settingsErrAvatarSaveFailed),
                isError: true
            )
        }
    }

    private func save() {
        Task {
            isSaving = true
            defer { isSaving = false }
            do {
                try await users.updateProfile(
                    ProfileUpdateRequest(
                        name: name.trimmingCharacters(in: .whitespacesAndNewlines).nilIfEmpty,
                        bio: bio.trimmingCharacters(in: .whitespacesAndNewlines).nilIfEmpty,
                        location: location.trimmingCharacters(in: .whitespacesAndNewlines).nilIfEmpty,
                        website: website.trimmingCharacters(in: .whitespacesAndNewlines).nilIfEmpty
                    )
                )
                message = SettingsMessage(text: L10n.string(.settingsSuccessProfileUpdated), isError: false)
            } catch {
                message = SettingsMessage(
                    text: (error as? ApiError)?.serverMessage
                        ?? L10n.string(.settingsErrProfileUpdateFailed),
                    isError: true
                )
            }
        }
    }

    private func labelled<Content: View>(
        _ key: L10nKey,
        @ViewBuilder content: () -> Content
    ) -> some View {
        VStack(alignment: .leading, spacing: ZrpSpacing.xs) {
            Text(key)
                .font(.footnote.weight(.semibold))
                .foregroundStyle(ZrpColor.onSurfaceMuted)
            content()
        }
    }

    private func field(_ key: L10nKey, text: Binding<String>) -> some View {
        TextField(text: text, prompt: Text(key), label: { Text(key) })
            .labelsHidden()
            .padding(ZrpSpacing.md)
            .background(ZrpColor.surfaceElevated)
            .clipShape(RoundedRectangle(cornerRadius: ZrpRadius.md))
    }

    private func multiline(_ key: L10nKey, text: Binding<String>) -> some View {
        TextField(text: text, prompt: Text(key), axis: .vertical, label: { Text(key) })
            .labelsHidden()
            .lineLimit(3...8)
            .padding(ZrpSpacing.md)
            .background(ZrpColor.surfaceElevated)
            .clipShape(RoundedRectangle(cornerRadius: ZrpRadius.md))
    }
}
