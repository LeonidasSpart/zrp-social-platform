import SwiftUI

@MainActor
final class ApiKeysViewModel: ObservableObject {

    enum Phase: Equatable {
        case loading
        case loaded([ApiKeyRecord])
        /// The plan gate, which is a statement rather than a failure.
        case notEntitled(String)
        case failed(ApiError)
    }

    @Published private(set) var phase: Phase = .loading
    @Published private(set) var isWorking = false
    @Published var errorMessage: String?

    /// The plaintext key, held **only** while the confirmation sheet is
    /// open. Never written to the Keychain, `UserDefaults`, a file or a
    /// log: the server keeps a SHA-256 hash and this is the one moment
    /// the token exists in readable form. It belongs to the person who
    /// asked for it, not to this app.
    @Published var justCreated: CreatedApiKey?

    private let repository: ApiKeysRepositoryProtocol

    init(repository: ApiKeysRepositoryProtocol = ApiKeysRepository()) {
        self.repository = repository
    }

    var keys: [ApiKeyRecord] {
        if case .loaded(let keys) = phase { return keys }
        return []
    }

    func load() async {
        if case .loaded = phase {} else { phase = .loading }
        do {
            phase = .loaded(try await repository.keys())
        } catch ApiError.cancelled {
            return
        } catch let error as ApiError {
            if case .forbidden = error {
                phase = .notEntitled(error.userFacingMessage)
            } else {
                phase = .failed(error)
            }
        } catch {
            phase = .failed(.transport(underlying: "\(error)"))
        }
    }

    func create(name: String, expiresInDays: Int) async -> Bool {
        guard !isWorking else { return false }
        isWorking = true
        defer { isWorking = false }
        do {
            justCreated = try await repository.create(name: name, expiresInDays: expiresInDays)
            await load()
            return true
        } catch let error as ApiError {
            // The ten-key cap, a missing name, and a concurrency
            // conflict each have their own wording.
            errorMessage = error.userFacingMessage
            return false
        } catch {
            errorMessage = L10n.string(.apiKeysErrLoadFailed)
            return false
        }
    }

    func revoke(_ key: ApiKeyRecord) async {
        guard !isWorking else { return }
        isWorking = true
        defer { isWorking = false }
        do {
            try await repository.revoke(id: key.id)
            await load()
        } catch let error as ApiError {
            errorMessage = error.userFacingMessage
        } catch {
            errorMessage = L10n.string(.apiKeysErrLoadFailed)
        }
    }
}

/// API keys.
///
/// Business and Enterprise only, enforced independently by each of the
/// three routes with a 403 - this screen shows the route's own sentence
/// rather than pretending the feature does not exist.
struct ApiKeysView: View {

    @StateObject private var viewModel = ApiKeysViewModel()
    @State private var isGenerating = false
    @State private var confirmingRevoke: ApiKeyRecord?

    var body: some View {
        Group {
            switch viewModel.phase {
            case .loading:
                TimelineStateView.loading()
            case .notEntitled(let message):
                upgradeNotice(message)
            case .failed(let error):
                TimelineStateView.error(error) { Task { await viewModel.load() } }
            case .loaded:
                list
            }
        }
        .background(ZrpColor.background.ignoresSafeArea())
        .navigationTitle(Text(.apiKeysTitle))
        .navigationBarTitleDisplayMode(.inline)
        .task { await viewModel.load() }
        .alert(
            Text(.apiKeysErrTitle),
            isPresented: Binding(
                get: { viewModel.errorMessage != nil },
                set: { if !$0 { viewModel.errorMessage = nil } }
            )
        ) {
            Button { viewModel.errorMessage = nil } label: { Text(.apiKeysCancel) }
        } message: {
            Text(verbatim: viewModel.errorMessage ?? "")
        }
        .sheet(isPresented: $isGenerating) {
            GenerateApiKeySheet { name, days in
                await viewModel.create(name: name, expiresInDays: days)
            }
        }
        // Its own sheet, presented by the value, so it appears only when
        // a key genuinely exists to show.
        .sheet(item: $viewModel.justCreated) { created in
            NewApiKeySheet(created: created)
        }
        .confirmationDialog(
            Text(.apiKeysErrRevokeConfirm),
            isPresented: Binding(
                get: { confirmingRevoke != nil },
                set: { if !$0 { confirmingRevoke = nil } }
            ),
            titleVisibility: .visible,
            presenting: confirmingRevoke
        ) { key in
            Button(role: .destructive) {
                let target = key
                confirmingRevoke = nil
                Task { await viewModel.revoke(target) }
            } label: {
                Text(.apiKeysRevokedTitle)
            }
            Button(role: .cancel) { confirmingRevoke = nil } label: { Text(.apiKeysCancel) }
        }
    }

    private func upgradeNotice(_ message: String) -> some View {
        VStack(spacing: ZrpSpacing.md) {
            Image(systemName: "key")
                .font(.largeTitle)
                .foregroundStyle(ZrpColor.onSurfaceMuted)
            Text(.apiKeysUpgradeRequired)
                .font(.headline)
                .foregroundStyle(ZrpColor.onSurface)
            Text(verbatim: message)
                .font(.subheadline)
                .foregroundStyle(ZrpColor.onSurfaceMuted)
                .multilineTextAlignment(.center)
                .fixedSize(horizontal: false, vertical: true)
            // No upgrade button, for the same store-policy reason as
            // the team screen: a plan purchase is not an in-app surface.
            Text(.apiKeysUpgradeDesc)
                .font(.caption)
                .foregroundStyle(ZrpColor.onSurfaceMuted)
                .multilineTextAlignment(.center)
                .fixedSize(horizontal: false, vertical: true)
        }
        .padding(ZrpSpacing.xl)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    private var list: some View {
        List {
            Section {
                if viewModel.keys.isEmpty {
                    Text(.apiKeysNoKeysYet)
                        .font(.subheadline)
                        .foregroundStyle(ZrpColor.onSurfaceMuted)
                        .fixedSize(horizontal: false, vertical: true)
                } else {
                    ForEach(viewModel.keys) { key in
                        row(key)
                    }
                }
            } header: {
                HStack {
                    Text(.apiKeysYourKeys)
                    Spacer(minLength: ZrpSpacing.sm)
                    Text(verbatim: CountFormatting.exact(viewModel.keys.count))
                }
            }

            Section {
                Text(.apiKeysSecurityDesc)
                    .font(.caption)
                    .foregroundStyle(ZrpColor.onSurfaceMuted)
                    .fixedSize(horizontal: false, vertical: true)
                Text(.apiKeysRateLimitingDesc)
                    .font(.caption)
                    .foregroundStyle(ZrpColor.onSurfaceMuted)
                    .fixedSize(horizontal: false, vertical: true)
            } header: {
                Text(.apiKeysSecurity)
            }
        }
        .listStyle(.insetGrouped)
        .scrollContentBackground(.hidden)
        .refreshable { await viewModel.load() }
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button { isGenerating = true } label: {
                    Image(systemName: "plus")
                }
                // Deliberately NOT disabled at the ten-key cap. The
                // route's refusal says "You can have at most 10 active
                // API keys. Revoke one before creating another.", which
                // tells somebody what to do; a greyed-out button with no
                // explanation does not.
                .disabled(viewModel.isWorking)
                .accessibilityLabel(Text(.apiKeysGenerateKey))
            }
        }
    }

    private func row(_ key: ApiKeyRecord) -> some View {
        VStack(alignment: .leading, spacing: ZrpSpacing.xs) {
            Text(verbatim: key.name)
                .font(.subheadline.weight(.medium))
                .foregroundStyle(ZrpColor.onSurface)

            HStack(spacing: ZrpSpacing.md) {
                if let created = key.createdAt {
                    label(.apiKeysColCreated, created.formatted(date: .abbreviated, time: .omitted))
                }
                if let expires = key.expiresAt {
                    label(.apiKeysColExpires, expires.formatted(date: .abbreviated, time: .omitted))
                }
            }

            // "Never" means never used, which is different from unknown
            // and worth stating - a key nobody has ever called is a
            // candidate for revoking.
            label(
                .apiKeysColLastUsed,
                key.lastUsed.map { $0.formatted(date: .abbreviated, time: .shortened) }
                    ?? L10n.string(.apiKeysNever)
            )
        }
        .padding(.vertical, ZrpSpacing.xs)
        .swipeActions(edge: .trailing) {
            Button(role: .destructive) { confirmingRevoke = key } label: {
                Text(.apiKeysRevokedTitle)
            }
        }
        .accessibilityElement(children: .combine)
        .accessibilityActions {
            Button { confirmingRevoke = key } label: { Text(.apiKeysRevokedTitle) }
        }
    }

    private func label(_ key: L10nKey, _ value: String) -> some View {
        HStack(spacing: ZrpSpacing.xs) {
            Text(key)
            Text(verbatim: value)
        }
        .font(.caption2)
        .foregroundStyle(ZrpColor.onSurfaceMuted)
    }
}

/// Naming a new key and choosing how long it lives.
struct GenerateApiKeySheet: View {

    let create: (String, Int) async -> Bool

    @Environment(\.dismiss) private var dismiss
    @State private var name = ""
    @State private var days = ApiKeyLimits.defaultLifetimeDays
    @State private var isCreating = false

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextField(
                        text: $name,
                        prompt: Text(.apiKeysKeyNamePlaceholder),
                        label: { Text(.apiKeysKeyName) }
                    )

                    Picker(selection: $days) {
                        ForEach(ApiKeyLimits.lifetimeChoices, id: \.self) { choice in
                            lifetimeLabel(choice).tag(choice)
                        }
                    } label: {
                        Text(.apiKeysExpiresIn)
                    }
                } footer: {
                    // Web offers a fourth option, "Never expires", and it
                    // no longer does anything: the route was fixed so
                    // EVERY key gets an expiry, and an omitted value
                    // means 365 days rather than forever. Offering
                    // "never" would promise something the server would
                    // quietly override, so it is absent.
                    Text(.apiKeysCopyNowWarning)
                }
            }
            .scrollContentBackground(.hidden)
            .background(ZrpColor.background.ignoresSafeArea())
            .navigationTitle(Text(.apiKeysGenerateDialogTitle))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button { dismiss() } label: { Text(.apiKeysCancel) }
                }
                ToolbarItem(placement: .topBarTrailing) {
                    Button { commit() } label: {
                        Text(isCreating ? L10nKey.apiKeysGenerating : .apiKeysGenerate)
                            .font(.subheadline.weight(.semibold))
                    }
                    .disabled(name.trimmingCharacters(in: .whitespaces).isEmpty || isCreating)
                }
            }
        }
    }

    private func lifetimeLabel(_ choice: Int) -> Text {
        switch choice {
        case 30: return Text(.apiKeysDays30)
        case 90: return Text(.apiKeysDays90)
        default: return Text(.apiKeysDays365)
        }
    }

    private func commit() {
        guard !isCreating else { return }
        isCreating = true
        Task {
            defer { isCreating = false }
            if await create(name, days) { dismiss() }
        }
    }
}

/// The one and only time the key is readable.
///
/// There is no way back to this screen: the server stores a SHA-256
/// hash, so a key not copied here is gone and a new one has to be
/// generated. The sheet says so, and copying is one tap.
struct NewApiKeySheet: View {

    let created: CreatedApiKey

    @Environment(\.dismiss) private var dismiss
    @State private var copied = false

    var body: some View {
        NavigationStack {
            VStack(alignment: .leading, spacing: ZrpSpacing.lg) {
                Text(.apiKeysCopyNowWarning)
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(ZrpColor.amber)
                    .fixedSize(horizontal: false, vertical: true)

                Text(verbatim: created.plainKey)
                    .font(.caption.monospaced())
                    .foregroundStyle(ZrpColor.onSurface)
                    .textSelection(.enabled)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(ZrpSpacing.md)
                    .background(ZrpColor.surfaceElevated)
                    .clipShape(RoundedRectangle(cornerRadius: ZrpRadius.md))

                Button {
                    UIPasteboard.general.string = created.plainKey
                    copied = true
                } label: {
                    Label {
                        Text(copied ? L10nKey.apiKeysCopied : .apiKeysCopy)
                    } icon: {
                        Image(systemName: copied ? "checkmark" : "doc.on.doc")
                    }
                    .font(.subheadline.weight(.semibold))
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, ZrpSpacing.md)
                    .background(ZrpColor.red)
                    .foregroundStyle(.white)
                    .clipShape(RoundedRectangle(cornerRadius: ZrpRadius.md, style: .continuous))
                }
                .buttonStyle(.plain)

                Text(.apiKeysSecurityDesc)
                    .font(.caption)
                    .foregroundStyle(ZrpColor.onSurfaceMuted)
                    .fixedSize(horizontal: false, vertical: true)

                Spacer(minLength: 0)
            }
            .padding(ZrpSpacing.lg)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(ZrpColor.background.ignoresSafeArea())
            .navigationTitle(Text(.apiKeysKeyGenerated))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button { dismiss() } label: { Text(.apiKeysDone) }
                }
            }
        }
    }
}
