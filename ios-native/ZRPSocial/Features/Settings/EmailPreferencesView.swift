import SwiftUI

/// Which notifications ZRP may email about.
///
/// `GET`/`PUT /api/user/email-preferences` is a real, enforced setting -
/// `src/lib/notifications.ts` reads it before sending any notification
/// email - but no client exposes it today. This is the first surface for
/// it; see the note in PARITY.md.
///
/// Saved explicitly rather than on every flick of a switch: the route
/// merges what it is given, so six rapid toggles would be six requests
/// racing to merge over one another.
struct EmailPreferencesView: View {

    @State private var preferences: EmailPreferences?
    @State private var loadError: ApiError?
    @State private var isSaving = false
    @State private var saveError: String?
    @State private var didSave = false

    private let repository = SettingsRepository()

    var body: some View {
        Group {
            if let preferences {
                form(preferences)
            } else if let loadError {
                TimelineStateView.error(loadError) { Task { await load() } }
            } else {
                TimelineStateView.loading()
            }
        }
        .background(ZrpColor.background.ignoresSafeArea())
        .navigationTitle(Text(.iosEmailPrefsTitle))
        .navigationBarTitleDisplayMode(.inline)
        .task { await load() }
        .alert(
            Text(.iosErrorGenericTitle),
            isPresented: Binding(
                get: { saveError != nil },
                set: { if !$0 { saveError = nil } }
            )
        ) {
            Button { saveError = nil } label: { Text(.actionCancel) }
        } message: {
            Text(verbatim: saveError ?? "")
        }
    }

    private func form(_ preferences: EmailPreferences) -> some View {
        Form {
            Section {
                toggle(.iosEmailPrefsLikes, keyPath: \.likes)
                toggle(.iosEmailPrefsComments, keyPath: \.comments)
                toggle(.iosEmailPrefsFollows, keyPath: \.follows)
                toggle(.iosEmailPrefsReposts, keyPath: \.reposts)
                toggle(.iosEmailPrefsMentions, keyPath: \.mentions)
                toggle(.iosEmailPrefsMessages, keyPath: \.messages)
            } footer: {
                Text(.iosEmailPrefsNote)
            }

            Section {
                Button {
                    Task { await save() }
                } label: {
                    HStack {
                        Text(.actionSave)
                        if isSaving {
                            Spacer()
                            ProgressView().tint(ZrpColor.onSurfaceMuted)
                        } else if didSave {
                            Spacer()
                            Image(systemName: "checkmark")
                                .foregroundStyle(ZrpColor.green)
                        }
                    }
                }
                .disabled(isSaving)
            }
        }
    }

    /// Each switch writes into the loaded copy. `Binding` rather than a
    /// per-field `@State` so adding a preference means adding one row,
    /// not a row and a variable that could drift from it.
    private func toggle(
        _ title: L10nKey,
        keyPath: WritableKeyPath<EmailPreferences, Bool>
    ) -> some View {
        Toggle(isOn: Binding(
            get: { preferences?[keyPath: keyPath] ?? true },
            set: { newValue in
                preferences?[keyPath: keyPath] = newValue
                didSave = false
            }
        )) {
            Text(title)
        }
        .tint(ZrpColor.red)
    }

    private func load() async {
        do {
            preferences = try await repository.emailPreferences()
            loadError = nil
        } catch {
            loadError = error as? ApiError ?? .transport(underlying: "\(error)")
        }
    }

    private func save() async {
        guard let preferences, !isSaving else { return }
        isSaving = true
        defer { isSaving = false }
        do {
            // The route answers with the MERGED set, which is what is
            // shown afterwards rather than assuming the local copy won.
            self.preferences = try await repository.updateEmailPreferences(preferences)
            didSave = true
        } catch let error as ApiError {
            saveError = error.userFacingMessage
        } catch {
            saveError = L10n.string(.authErrTryAgain)
        }
    }
}
