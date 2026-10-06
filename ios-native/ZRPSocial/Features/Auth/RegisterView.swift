import SwiftUI

/// Create an account.
///
/// Two things about this flow are decided by the backend and stated here
/// rather than smoothed over:
///
/// 1. **Registering does not sign you in.** The route creates the
///    account, emails a verification link, and returns a message - no
///    session. So this ends on a "check your email" screen, not on the
///    timeline.
/// 2. **Logging in is refused until that link is opened** (403 from
///    `verifyCredentials`). Pretending otherwise would send someone to a
///    sign-in that cannot succeed yet.

/// ZRP platform policy: minimum age 16, enforced server-side in
/// `POST /api/auth/register` for any request that supplies a birthdate -
/// required outright for this app. A free function (not a
/// `RegisterViewModel` method) so it is testable without constructing
/// the view model.
let zrpMinimumRegistrationAge = 16

/// Age in whole years, using `Calendar`'s own largest-whole-unit date
/// component diff - the standard, leap-year-correct way to compute this,
/// and the same "hasn't had this year's birthday yet" semantics the
/// server's own `ageInYearsAsOf` (`src/app/api/auth/register/route.ts`)
/// implements by hand. This is a courtesy pre-check only - the server
/// re-derives age from the wire value it actually receives and is the
/// only check that matters - so the two are not required to agree down
/// to the exact timezone, only to reject the same under-16 birthdates a
/// real person would ever pick.
func ageInYears(birthdate: Date, asOf: Date, calendar: Calendar = .current) -> Int {
    calendar.dateComponents([.year], from: birthdate, to: asOf).year ?? 0
}

@MainActor
final class RegisterViewModel: ObservableObject {

    @Published var name = ""
    @Published var username = ""
    @Published var email = ""
    @Published var password = ""
    // Defaults to a clearly-adult date (30 years ago) rather than today -
    // a `DatePicker` defaulting to "today" would silently start someone
    // off failing the age gate before they have touched it at all.
    @Published var birthdate = Calendar.current.date(byAdding: .year, value: -30, to: Date()) ?? Date()
    @Published var termsAccepted = false

    @Published private(set) var availability: UsernameAvailability?
    @Published private(set) var isCheckingUsername = false
    @Published private(set) var isSubmitting = false
    @Published var errorText: String?
    @Published private(set) var registeredEmail: String?

    private var usernameTask: Task<Void, Never>?
    private let repository: AuthRepositoryProtocol

    init(repository: AuthRepositoryProtocol = AuthRepository()) {
        self.repository = repository
    }

    /// `yyyy-MM-dd` for the calendar day the `DatePicker` binding
    /// actually represents - explicitly Gregorian (the wire format is
    /// always Gregorian regardless of the device's own preferred
    /// calendar, e.g. Buddhist or Japanese, which `Calendar.current`
    /// would otherwise read year/month/day in) and explicitly the
    /// device's own current timezone (not UTC - reformatting through a
    /// fixed UTC timezone would risk reading back the *previous* or
    /// *next* calendar day for someone whose local timezone sits far
    /// enough from UTC, since `DatePicker` itself works in local time). A
    /// birth date has no meaningful time-of-day component, so this
    /// exists purely to avoid that off-by-one, not to normalize a real
    /// timestamp.
    static func birthdateWireValue(for date: Date, timeZone: TimeZone = .current) -> String {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = timeZone
        let components = calendar.dateComponents([.year, .month, .day], from: date)
        return String(format: "%04d-%02d-%02d", components.year ?? 0, components.month ?? 0, components.day ?? 0)
    }

    /// The latest birthdate a person can pick and still be old enough -
    /// bounds the `DatePicker` itself so the control can never produce an
    /// under-16 selection in the first place, rather than only catching
    /// one after the fact.
    var latestAllowedBirthdate: Date {
        Calendar.current.date(byAdding: .year, value: -zrpMinimumRegistrationAge, to: Date()) ?? Date()
    }

    var isOldEnough: Bool {
        ageInYears(birthdate: birthdate, asOf: Date()) >= zrpMinimumRegistrationAge
    }

    /// The route's own rules, checked here so the button is only enabled
    /// for input the server can actually accept. It re-validates all of
    /// it regardless - this is a courtesy, not the gate.
    var canSubmit: Bool {
        !isSubmitting
            && username.count >= 3
            && email.contains("@")
            && password.count >= 6
            && availability?.available != false
            && isOldEnough
            && termsAccepted
    }

    /// Debounced, and cancelled when superseded, so an earlier answer
    /// cannot land after a later one and mislabel a name as taken.
    func usernameChanged() {
        availability = nil
        usernameTask?.cancel()
        let candidate = username.trimmingCharacters(in: .whitespacesAndNewlines)
        guard candidate.count >= 3 else { return }

        usernameTask = Task { [weak self] in
            try? await Task.sleep(for: .milliseconds(400))
            guard !Task.isCancelled, let self else { return }
            isCheckingUsername = true
            defer { isCheckingUsername = false }
            let result = try? await repository.checkUsername(candidate)
            guard !Task.isCancelled else { return }
            availability = result
        }
    }

    func submit() async {
        errorText = nil
        isSubmitting = true
        defer { isSubmitting = false }

        let trimmedEmail = email.trimmingCharacters(in: .whitespacesAndNewlines)
        do {
            try await repository.register(
                RegistrationRequest(
                    name: name.trimmingCharacters(in: .whitespacesAndNewlines).nilIfEmpty,
                    username: username.trimmingCharacters(in: .whitespacesAndNewlines),
                    email: trimmedEmail,
                    password: password,
                    birthdate: Self.birthdateWireValue(for: birthdate),
                    termsAccepted: termsAccepted
                )
            )
            registeredEmail = trimmedEmail
        } catch {
            // The route's 400 also names the offending `field`, which is
            // not surfaced separately: its message already says which one
            // ("Email already registered", "Username already taken"), and
            // a taken username is caught live as it is typed. Threading a
            // field name through ApiError for one screen would have been
            // more machinery than the extra clarity is worth.
            errorText = (error as? ApiError)?.serverMessage ?? L10n.string(.authErrTryAgain)
        }
    }
}

struct RegisterView: View {

    @Environment(\.dismiss) private var dismiss
    @StateObject private var viewModel = RegisterViewModel()
    @State private var showTerms = false

    var body: some View {
        Group {
            if let email = viewModel.registeredEmail {
                VerificationSentView(email: email)
            } else {
                form
            }
        }
        .background(ZrpColor.background.ignoresSafeArea())
        .navigationTitle(Text(.authCreateAccount))
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .cancellationAction) {
                Button { dismiss() } label: { Text(.musicStudioCancel) }
            }
        }
        .sheet(isPresented: $showTerms) {
            if let url = WebPage.terms.url {
                WebPageView(url: url).ignoresSafeArea()
            }
        }
    }

    private var form: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: ZrpSpacing.lg) {
                Text(.authJoinCommunity)
                    .font(.title3.weight(.bold))
                    .foregroundStyle(ZrpColor.onSurface)

                field(.authFullName, text: $viewModel.name)
                    .textContentType(.name)

                usernameField

                field(.authEmail, text: $viewModel.email)
                    .textContentType(.emailAddress)
                    .keyboardType(.emailAddress)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()

                VStack(alignment: .leading, spacing: ZrpSpacing.xs) {
                    ZrpSecureField(
                        prompt: L10n.string(.authCreatePassword),
                        text: $viewModel.password,
                        contentType: .newPassword
                    )
                    .padding(.leading, ZrpSpacing.md)
                    .padding(.trailing, ZrpSpacing.xs)
                    .padding(.vertical, ZrpSpacing.xs)
                    .frame(minHeight: ZrpMetrics.minTouchTarget)
                    .background(ZrpColor.surfaceElevated)
                    .clipShape(RoundedRectangle(cornerRadius: ZrpRadius.md))

                    Text(.authPasswordMinLength)
                        .font(.caption)
                        .foregroundStyle(ZrpColor.onSurfaceMuted)
                }

                birthdateField

                termsToggle

                if let errorText = viewModel.errorText {
                    Text(verbatim: errorText)
                        .font(.footnote)
                        .foregroundStyle(ZrpColor.red)
                        .fixedSize(horizontal: false, vertical: true)
                }

                Button {
                    Task { await viewModel.submit() }
                } label: {
                    Text(viewModel.isSubmitting ? L10nKey.authCreatingAccount : L10nKey.authCreateAccount)
                        .font(.subheadline.weight(.bold))
                        .frame(maxWidth: .infinity)
                        .frame(minHeight: ZrpMetrics.minTouchTarget)
                        .background(viewModel.canSubmit ? ZrpColor.red : ZrpColor.surfaceHighest)
                        .foregroundStyle(viewModel.canSubmit ? .white : ZrpColor.onSurfaceMuted)
                        .clipShape(RoundedRectangle(cornerRadius: ZrpRadius.md))
                }
                .buttonStyle(.plain)
                .disabled(!viewModel.canSubmit)

                Button { dismiss() } label: {
                    Text(.authAlreadyHaveAccount)
                        .font(.footnote)
                        .foregroundStyle(ZrpColor.onSurfaceMuted)
                }
                .buttonStyle(.plain)
                .frame(maxWidth: .infinity)
            }
            .padding(ZrpSpacing.lg)
            .frame(maxWidth: ZrpMetrics.contentMaxWidth, alignment: .leading)
            .frame(maxWidth: .infinity)
        }
    }

    private var usernameField: some View {
        VStack(alignment: .leading, spacing: ZrpSpacing.xs) {
            HStack {
                field(.authUsername, text: $viewModel.username)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
                    .onChange(of: viewModel.username) { _, _ in viewModel.usernameChanged() }
                if viewModel.isCheckingUsername {
                    ProgressView().tint(ZrpColor.red)
                }
            }

            if let availability = viewModel.availability {
                if availability.invalid {
                    status(.iosAuthUsernameInvalid, color: ZrpColor.onSurfaceMuted)
                } else if availability.available {
                    status(.iosAuthUsernameAvailable, color: ZrpColor.green)
                } else {
                    status(.iosAuthUsernameTaken, color: ZrpColor.red)
                    // The route has already checked these are free, so
                    // tapping one cannot land on another collision.
                    if !availability.suggestions.isEmpty {
                        Text(.iosAuthUsernameSuggestions)
                            .font(.caption)
                            .foregroundStyle(ZrpColor.onSurfaceMuted)
                        HStack(spacing: ZrpSpacing.sm) {
                            ForEach(availability.suggestions, id: \.self) { suggestion in
                                Button {
                                    viewModel.username = suggestion
                                    viewModel.usernameChanged()
                                } label: {
                                    Text(verbatim: suggestion)
                                        .font(.caption.weight(.medium))
                                        .padding(.horizontal, ZrpSpacing.md)
                                        .frame(minHeight: ZrpMetrics.minTouchTarget)
                                        .background(ZrpColor.surfaceHighest)
                                        .foregroundStyle(ZrpColor.onSurface)
                                        .clipShape(Capsule())
                                }
                                .buttonStyle(.plain)
                            }
                        }
                    }
                }
            }
        }
    }

    /// `DatePicker`'s own `in:` range keeps the control from ever
    /// producing an under-16 selection in the first place - the inline
    /// warning below is for the one case that bound doesn't cover: a
    /// person who opened this screen with the picker already defaulted
    /// to an old-enough date and then actually used the wheel, which
    /// `DatePicker` always permits down to its range's edge.
    private var birthdateField: some View {
        VStack(alignment: .leading, spacing: ZrpSpacing.xs) {
            DatePicker(
                selection: $viewModel.birthdate,
                in: ...viewModel.latestAllowedBirthdate,
                displayedComponents: .date
            ) {
                Text(.iosAuthDateOfBirth)
            }
            .padding(.horizontal, ZrpSpacing.md)
            .frame(minHeight: ZrpMetrics.minTouchTarget)
            .background(ZrpColor.surfaceElevated)
            .clipShape(RoundedRectangle(cornerRadius: ZrpRadius.md))

            if !viewModel.isOldEnough {
                status(.iosAuthAgeTooYoung, color: ZrpColor.red)
            }
        }
    }

    private var termsToggle: some View {
        VStack(alignment: .leading, spacing: ZrpSpacing.xs) {
            Toggle(isOn: $viewModel.termsAccepted) {
                Text(.iosAuthAgeTermsAgree)
                    .font(.footnote)
                    .fixedSize(horizontal: false, vertical: true)
            }
            .toggleStyle(.switch)
            .tint(ZrpColor.red)

            Button { showTerms = true } label: {
                Text(.footerTermsOfService)
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(ZrpColor.red)
                    .frame(minHeight: ZrpMetrics.minTouchTarget, alignment: .leading)
            }
            .buttonStyle(.plain)
        }
    }

    private func status(_ key: L10nKey, color: Color) -> some View {
        Text(key)
            .font(.caption)
            .foregroundStyle(color)
            .fixedSize(horizontal: false, vertical: true)
    }

    private func field(_ key: L10nKey, text: Binding<String>) -> some View {
        TextField(text: text, prompt: Text(key), label: { Text(key) })
            .labelsHidden()
            .padding(ZrpSpacing.md)
            .background(ZrpColor.surfaceElevated)
            .clipShape(RoundedRectangle(cornerRadius: ZrpRadius.md))
    }
}

/// Shown after a successful registration.
///
/// The account exists but cannot sign in yet, so this says so and offers
/// the one action that helps: send the email again.
struct VerificationSentView: View {

    let email: String

    @State private var isResending = false
    @State private var message: SettingsMessage?

    private let repository = AuthRepository()

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: ZrpSpacing.lg) {
                Image(systemName: "envelope.badge")
                    .font(.largeTitle)
                    .foregroundStyle(ZrpColor.red)
                    .accessibilityHidden(true)

                Text(.authSignupSuccessTitle)
                    .font(.title3.weight(.bold))
                    .foregroundStyle(ZrpColor.onSurface)

                Text(.authSignupSuccessBody, ["email": email])
                    .font(.subheadline)
                    .foregroundStyle(ZrpColor.onSurface)
                    .fixedSize(horizontal: false, vertical: true)

                Text(.iosAuthVerifyOnWebNote)
                    .font(.footnote)
                    .foregroundStyle(ZrpColor.onSurfaceMuted)
                    .fixedSize(horizontal: false, vertical: true)

                Text(.authCheckSpam)
                    .font(.footnote)
                    .foregroundStyle(ZrpColor.onSurfaceMuted)
                    .fixedSize(horizontal: false, vertical: true)

                if let message {
                    Text(verbatim: message.text)
                        .font(.footnote)
                        .foregroundStyle(message.isError ? ZrpColor.red : ZrpColor.green)
                        .fixedSize(horizontal: false, vertical: true)
                }

                Button { resend() } label: {
                    Text(isResending ? L10nKey.authResendVerificationSending : L10nKey.authResendVerification)
                        .font(.subheadline.weight(.semibold))
                        .frame(maxWidth: .infinity)
                        .frame(minHeight: ZrpMetrics.minTouchTarget)
                        .background(ZrpColor.surfaceHighest)
                        .foregroundStyle(ZrpColor.onSurface)
                        .clipShape(RoundedRectangle(cornerRadius: ZrpRadius.md))
                }
                .buttonStyle(.plain)
                .disabled(isResending)
            }
            .padding(ZrpSpacing.lg)
            .frame(maxWidth: ZrpMetrics.contentMaxWidth, alignment: .leading)
            .frame(maxWidth: .infinity)
        }
    }

    private func resend() {
        Task {
            isResending = true
            defer { isResending = false }
            do {
                try await repository.resendVerification(identifier: email)
                message = SettingsMessage(
                    text: L10n.string(.authResendVerificationSuccess),
                    isError: false
                )
            } catch {
                // The route distinguishes "already verified" and "no such
                // account" with its own wording, which is worth showing.
                message = SettingsMessage(
                    text: (error as? ApiError)?.serverMessage
                        ?? L10n.string(.authResendVerificationError),
                    isError: true
                )
            }
        }
    }
}
