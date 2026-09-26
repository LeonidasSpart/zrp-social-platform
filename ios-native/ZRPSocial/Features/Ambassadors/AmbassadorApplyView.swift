import SwiftUI

@MainActor
final class AmbassadorApplyViewModel: ObservableObject {

    @Published var countryCode: String = ""
    @Published var cityRegion: String = ""
    @Published var languages: [String] = []
    @Published var communityLinks: [String] = []
    @Published var motivation: String = ""
    @Published var communityDescription: String = ""
    @Published var audienceSize: String = ""
    @Published var codeAccepted = false

    @Published private(set) var countries: [AmbassadorCountry] = []
    @Published private(set) var isSubmitting = false
    @Published private(set) var didSubmit = false
    @Published var errorMessage: String?

    /// The viewer's REAL current status (`GET /api/ambassadors/me`),
    /// read before the form is ever shown. Someone already PENDING,
    /// APPROVED or SUSPENDED is never offered the form again - the
    /// route would refuse it with 409 - and sees their status with a
    /// way to the dashboard instead. Same rule as the web apply page.
    @Published private(set) var existingStatus: AmbassadorStatus?
    @Published private(set) var isCheckingExisting = true

    var hasBlockingProfile: Bool {
        switch existingStatus {
        case .pending, .approved, .suspended: return true
        case .rejected, .unknown, .none: return false
        }
    }

    private let repository: AmbassadorsRepositoryProtocol

    init(repository: AmbassadorsRepositoryProtocol = AmbassadorsRepository()) {
        self.repository = repository
    }

    /// The three things the server refuses outright. Mirrored so the
    /// button explains itself rather than the request coming back 400 -
    /// but the server checks all three again, the Code of Conduct one
    /// included, because a form's own checkbox must never be the only
    /// thing enforcing it.
    var canSubmit: Bool {
        !countryCode.isEmpty
            && !motivation.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
            && codeAccepted
            && !isSubmitting
    }

    func loadCountries() async {
        countries = (try? await repository.countries()) ?? []
    }

    func checkExistingProfile() async {
        // A failed read shows the form: the server still enforces the
        // rule, so nothing can be double-submitted.
        existingStatus = (try? await repository.me())?.status
        isCheckingExisting = false
    }

    func addLanguage(_ value: String) {
        let trimmed = value.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty,
              languages.count < AmbassadorLimits.maxLanguages,
              !languages.contains(trimmed)
        else { return }
        languages.append(String(trimmed.prefix(AmbassadorLimits.languageLength)))
    }

    func addLink(_ value: String) {
        let trimmed = value.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty, communityLinks.count < AmbassadorLimits.maxCommunityLinks
        else { return }
        communityLinks.append(String(trimmed.prefix(AmbassadorLimits.linkLength)))
    }

    /// The server accepts https only, and says so per-link. Checking the
    /// same rule here means somebody is told which link is wrong while
    /// they can still see it, rather than after a round trip.
    func isValidLink(_ value: String) -> Bool {
        guard let url = URL(string: value.trimmingCharacters(in: .whitespacesAndNewlines)) else {
            return false
        }
        return url.scheme?.lowercased() == "https"
    }

    func submit() async {
        guard canSubmit else { return }
        isSubmitting = true
        defer { isSubmitting = false }

        let size = Int(audienceSize.trimmingCharacters(in: .whitespacesAndNewlines))
        let application = AmbassadorApplication(
            countryCode: countryCode,
            cityRegion: cityRegion.isEmpty ? nil : cityRegion,
            languages: languages,
            communityLinks: communityLinks,
            motivation: motivation.trimmingCharacters(in: .whitespacesAndNewlines),
            communityDescription: communityDescription.isEmpty ? nil : communityDescription,
            audienceSize: size,
            codeOfConductAccepted: codeAccepted
        )

        do {
            _ = try await repository.apply(application)
            didSubmit = true
        } catch let error as ApiError {
            // The route distinguishes "already pending", "already an
            // ambassador" and "suspended" with its own wording for each.
            // Flattening them into one message would lose the only
            // information that tells somebody what to do next.
            errorMessage = error.userFacingMessage
        } catch {
            errorMessage = L10n.string(.ambassadorsApplyErrGeneric)
        }
    }
}

/// Applying to become a ZRP Global Ambassador.
///
/// Submitting creates a **PENDING** application and nothing more. No
/// badge, no level, no privilege - an admin approves on a separate
/// route, so this screen is careful never to congratulate anybody on
/// becoming something they have not become yet.
struct AmbassadorApplyView: View {

    @StateObject private var viewModel = AmbassadorApplyViewModel()
    @EnvironmentObject private var navigator: Navigator
    @State private var languageDraft = ""
    @State private var linkDraft = ""

    var body: some View {
        Form {
            if viewModel.didSubmit {
                Section {
                    Text(.ambassadorsApplySuccessTitle)
                        .font(.headline)
                        .foregroundStyle(ZrpColor.green)
                    Text(.ambassadorsApplySuccessBody)
                        .font(.subheadline)
                        .foregroundStyle(ZrpColor.onSurfaceMuted)
                        .fixedSize(horizontal: false, vertical: true)
                }
            } else if viewModel.isCheckingExisting {
                Section {
                    HStack {
                        Spacer()
                        ProgressView().tint(ZrpColor.red)
                        Spacer()
                    }
                }
            } else if viewModel.hasBlockingProfile {
                existingProfileSection
            } else {
                countrySection
                languagesSection
                linksSection
                motivationSection
                codeSection
                submitSection
            }
        }
        .scrollContentBackground(.hidden)
        .background(ZrpColor.background.ignoresSafeArea())
        .navigationTitle(Text(.ambassadorsApplyTitle))
        .navigationBarTitleDisplayMode(.inline)
        .task {
            await viewModel.checkExistingProfile()
            await viewModel.loadCountries()
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
    }

    /// Shown instead of the form to someone who already holds a
    /// PENDING, APPROVED or SUSPENDED profile - the same status wording
    /// the dashboard uses, so both screens agree on what the viewer is.
    private var existingProfileSection: some View {
        Section {
            switch viewModel.existingStatus {
            case .pending:
                Text(.ambassadorsDashboardPendingTitle).font(.headline).foregroundStyle(ZrpColor.onSurface)
                Text(.ambassadorsDashboardPendingBody)
                    .font(.subheadline)
                    .foregroundStyle(ZrpColor.onSurfaceMuted)
                    .fixedSize(horizontal: false, vertical: true)
            case .suspended:
                Text(.ambassadorsDashboardSuspendedTitle).font(.headline).foregroundStyle(ZrpColor.onSurface)
                Text(.ambassadorsDashboardSuspendedBody)
                    .font(.subheadline)
                    .foregroundStyle(ZrpColor.onSurfaceMuted)
                    .fixedSize(horizontal: false, vertical: true)
            default:
                Text(.ambassadorsLevelsAmbassador).font(.headline).foregroundStyle(ZrpColor.onSurface)
                Text(.ambassadorsApplyAlreadyAmbassador)
                    .font(.subheadline)
                    .foregroundStyle(ZrpColor.onSurfaceMuted)
                    .fixedSize(horizontal: false, vertical: true)
            }

            Button { navigator.push(.ambassadorDashboard) } label: {
                Text(.ambassadorsDashboardTitle)
                    .font(.subheadline.weight(.semibold))
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, ZrpSpacing.md)
                    .background(ZrpColor.red)
                    .foregroundStyle(.white)
                    .clipShape(RoundedRectangle(cornerRadius: ZrpRadius.md, style: .continuous))
            }
            .buttonStyle(.plain)
        }
    }

    private var countrySection: some View {
        Section {
            Picker(selection: $viewModel.countryCode) {
                Text(.ambassadorsApplySelectCountry).tag("")
                ForEach(viewModel.countries) { country in
                    Text(verbatim: country.name).tag(country.code)
                }
            } label: {
                Text(.ambassadorsApplyFieldCountry)
            }

            TextField(
                text: $viewModel.cityRegion,
                prompt: Text(.ambassadorsApplyFieldCityRegion),
                label: { Text(.ambassadorsApplyFieldCityRegion) }
            )
            .onChange(of: viewModel.cityRegion) { _, value in
                if value.count > AmbassadorLimits.cityRegion {
                    viewModel.cityRegion = String(value.prefix(AmbassadorLimits.cityRegion))
                }
            }
        } header: {
            Text(.ambassadorsApplySubtitle)
                .textCase(nil)
        }
    }

    private var languagesSection: some View {
        Section {
            ForEach(viewModel.languages, id: \.self) { language in
                Text(verbatim: language)
            }
            .onDelete { viewModel.languages.remove(atOffsets: $0) }

            if viewModel.languages.count < AmbassadorLimits.maxLanguages {
                HStack {
                    TextField(
                        text: $languageDraft,
                        prompt: Text(.ambassadorsApplyAddLanguage),
                        label: { Text(.ambassadorsApplyAddLanguage) }
                    )
                    .labelsHidden()
                    .onSubmit(commitLanguage)

                    Button(action: commitLanguage) {
                        Image(systemName: "plus.circle.fill")
                    }
                    .disabled(languageDraft.trimmingCharacters(in: .whitespaces).isEmpty)
                    .accessibilityLabel(Text(.ambassadorsApplyAddLanguage))
                }
            }
        } header: {
            Text(.ambassadorsApplyFieldLanguages)
        }
    }

    private var linksSection: some View {
        Section {
            ForEach(viewModel.communityLinks, id: \.self) { link in
                Text(verbatim: link)
                    .font(.caption)
                    .lineLimit(1)
                    .truncationMode(.middle)
            }
            .onDelete { viewModel.communityLinks.remove(atOffsets: $0) }

            if viewModel.communityLinks.count < AmbassadorLimits.maxCommunityLinks {
                HStack {
                    TextField(
                        text: $linkDraft,
                        prompt: Text(verbatim: "https://"),
                        label: { Text(.ambassadorsApplyAddLink) }
                    )
                    .labelsHidden()
                    .autocorrectionDisabled()
                    .textInputAutocapitalization(.never)
                    .keyboardType(.URL)
                    .onSubmit(commitLink)

                    Button(action: commitLink) {
                        Image(systemName: "plus.circle.fill")
                    }
                    .disabled(!viewModel.isValidLink(linkDraft))
                    .accessibilityLabel(Text(.ambassadorsApplyAddLink))
                }
            }
        } header: {
            Text(.ambassadorsApplyFieldCommunityLinks)
        }
    }

    private var motivationSection: some View {
        Section {
            TextField(
                text: $viewModel.motivation,
                prompt: Text(.ambassadorsApplyFieldMotivation),
                axis: .vertical,
                label: { Text(.ambassadorsApplyFieldMotivation) }
            )
            .labelsHidden()
            .lineLimit(4...10)
            .onChange(of: viewModel.motivation) { _, value in
                if value.count > AmbassadorLimits.motivation {
                    viewModel.motivation = String(value.prefix(AmbassadorLimits.motivation))
                }
            }

            TextField(
                text: $viewModel.communityDescription,
                prompt: Text(.ambassadorsApplyFieldCommunityDescription),
                axis: .vertical,
                label: { Text(.ambassadorsApplyFieldCommunityDescription) }
            )
            .labelsHidden()
            .lineLimit(3...8)
            .onChange(of: viewModel.communityDescription) { _, value in
                if value.count > AmbassadorLimits.communityDescription {
                    viewModel.communityDescription =
                        String(value.prefix(AmbassadorLimits.communityDescription))
                }
            }

            TextField(
                text: $viewModel.audienceSize,
                prompt: Text(.ambassadorsApplyFieldAudienceSize),
                label: { Text(.ambassadorsApplyFieldAudienceSize) }
            )
            .labelsHidden()
            .keyboardType(.numberPad)
            .onChange(of: viewModel.audienceSize) { _, value in
                // Digits only. The server rejects anything non-numeric
                // or out of range; refusing to type it is kinder.
                let digits = value.filter(\.isNumber)
                if digits != value { viewModel.audienceSize = digits }
            }
        } header: {
            Text(.ambassadorsApplyFieldMotivation)
        }
    }

    private var codeSection: some View {
        Section {
            Toggle(isOn: $viewModel.codeAccepted) {
                Text(.ambassadorsApplyCodeOfConductCheckbox)
                    .font(.caption)
                    .fixedSize(horizontal: false, vertical: true)
            }

            // The Code itself lives on the web, at /community-code. The
            // link opens it rather than this app paraphrasing a document
            // people are being asked to agree to. No force-unwrap: a
            // missing link is better than a crash on a constant.
            if let url = URL(string: "https://zrp.one/community-code") {
                Link(destination: url) {
                    HStack(spacing: ZrpSpacing.xs) {
                        Text(.ambassadorsApplyCodeOfConductLinkPrefix)
                        Text(.ambassadorsApplyCodeOfConductLinkLabel)
                            .underline()
                    }
                    .font(.caption)
                    .foregroundStyle(ZrpColor.red)
                    .fixedSize(horizontal: false, vertical: true)
                }
            }
        }
    }

    private var submitSection: some View {
        Section {
            Button {
                Task { await viewModel.submit() }
            } label: {
                Text(
                    viewModel.isSubmitting
                        ? L10nKey.ambassadorsApplySubmitting
                        : .ambassadorsApplySubmit
                )
                .font(.subheadline.weight(.semibold))
                .frame(maxWidth: .infinity)
            }
            .disabled(!viewModel.canSubmit)

            // Says which requirement is still missing instead of leaving
            // a disabled button with no explanation.
            if viewModel.countryCode.isEmpty {
                Text(.ambassadorsApplyErrCountryRequired)
                    .font(.caption2)
                    .foregroundStyle(ZrpColor.onSurfaceMuted)
            } else if viewModel.motivation.trimmingCharacters(in: .whitespaces).isEmpty {
                Text(.ambassadorsApplyErrMotivationRequired)
                    .font(.caption2)
                    .foregroundStyle(ZrpColor.onSurfaceMuted)
            } else if !viewModel.codeAccepted {
                Text(.ambassadorsApplyErrCodeRequired)
                    .font(.caption2)
                    .foregroundStyle(ZrpColor.onSurfaceMuted)
            }
        }
    }

    private func commitLanguage() {
        viewModel.addLanguage(languageDraft)
        languageDraft = ""
    }

    private func commitLink() {
        guard viewModel.isValidLink(linkDraft) else { return }
        viewModel.addLink(linkDraft)
        linkDraft = ""
    }
}
