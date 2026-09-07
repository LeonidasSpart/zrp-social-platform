import SwiftUI

struct LoginView: View {

    @EnvironmentObject private var session: SessionController
    @StateObject private var viewModel = LoginViewModel()
    @FocusState private var focusedField: Field?
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize

    private enum Field: Hashable {
        case identifier
        case password
    }

    var body: some View {
        ScrollView {
            VStack(spacing: ZrpSpacing.xl) {
                header
                if let notice = session.expiryNotice {
                    banner(notice, isError: false)
                }
                if let error = viewModel.errorMessage {
                    banner(error, isError: true)
                }
                form
                footer
            }
            .padding(.horizontal, ZrpSpacing.lg)
            .padding(.vertical, ZrpSpacing.xxl)
            // Keeps the form a comfortable reading width on iPad and in
            // landscape instead of stretching controls edge to edge.
            .frame(maxWidth: 420)
            .frame(maxWidth: .infinity)
        }
        .background(ZrpColor.background.ignoresSafeArea())
        .scrollDismissesKeyboard(.interactively)
        .onChange(of: viewModel.identifier) { _, _ in viewModel.clearError() }
        .onChange(of: viewModel.password) { _, _ in viewModel.clearError() }
    }

    // MARK: - Sections

    private var header: some View {
        VStack(spacing: ZrpSpacing.md) {
            // The official ZRP mark, used exactly as the project ships it.
            Image("ZrpLogo")
                .resizable()
                .scaledToFit()
                .frame(width: 96, height: 96)
                .accessibilityHidden(true)

            Text(.authWelcomeTitle)
                .font(.largeTitle.weight(.bold))
                .foregroundStyle(ZrpColor.onSurface)

            Text(.authSignInSubtitle)
                .font(.subheadline)
                .foregroundStyle(ZrpColor.onSurfaceMuted)
                .multilineTextAlignment(.center)
        }
        .padding(.top, ZrpSpacing.xl)
        .accessibilityElement(children: .combine)
    }

    private var form: some View {
        VStack(spacing: ZrpSpacing.lg) {
            field(
                label: L10n.string(.authEmailOrUsername),
                placeholder: L10n.string(.authEmailOrUsernamePlaceholder),
                text: $viewModel.identifier,
                field: .identifier,
                isSecure: false
            )

            field(
                label: L10n.string(.authPassword),
                placeholder: L10n.string(.authPassword),
                text: $viewModel.password,
                field: .password,
                isSecure: true
            )

            submitButton
        }
    }

    @ViewBuilder
    private func field(
        label: String,
        placeholder: String,
        text: Binding<String>,
        field: Field,
        isSecure: Bool
    ) -> some View {
        VStack(alignment: .leading, spacing: ZrpSpacing.sm) {
            Text(verbatim: label)
                .font(.footnote.weight(.medium))
                .foregroundStyle(ZrpColor.onSurfaceMuted)

            Group {
                if isSecure {
                    SecureField(placeholder, text: text)
                        .textContentType(.password)
                        .submitLabel(.go)
                        .onSubmit { Task { await signIn() } }
                } else {
                    TextField(placeholder, text: text)
                        // `.username` rather than `.emailAddress`: this
                        // field genuinely accepts either, and declaring
                        // email-only makes the keyboard and AutoFill fight
                        // a username entry.
                        .textContentType(.username)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                        .keyboardType(.emailAddress)
                        .submitLabel(.next)
                        .onSubmit { focusedField = .password }
                }
            }
            .focused($focusedField, equals: field)
            .padding(ZrpSpacing.md)
            .frame(minHeight: ZrpMetrics.minTouchTarget)
            .background(ZrpColor.surfaceElevated)
            .clipShape(RoundedRectangle(cornerRadius: ZrpRadius.md, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: ZrpRadius.md, style: .continuous)
                    .strokeBorder(
                        focusedField == field ? ZrpColor.red : ZrpColor.outline,
                        lineWidth: focusedField == field ? 2 : 1
                    )
            )
            .foregroundStyle(ZrpColor.onSurface)
        }
        .accessibilityElement(children: .contain)
        .accessibilityLabel(label)
    }

    private var submitButton: some View {
        Button {
            Task { await signIn() }
        } label: {
            ZStack {
                // The spinner replaces the label in place rather than
                // resizing the button, so the layout does not jump.
                Text(viewModel.isSubmitting ? L10nKey.authSigningIn : L10nKey.authSignIn)
                    .opacity(viewModel.isSubmitting ? 0 : 1)
                if viewModel.isSubmitting {
                    ProgressView().tint(.white)
                }
            }
            .font(.headline)
            .frame(maxWidth: .infinity)
            .frame(minHeight: ZrpMetrics.minTouchTarget + 4)
            .background(viewModel.canSubmit ? ZrpColor.red : ZrpColor.red.opacity(0.4))
            .foregroundStyle(.white)
            .clipShape(RoundedRectangle(cornerRadius: ZrpRadius.md, style: .continuous))
        }
        .disabled(!viewModel.canSubmit)
        .accessibilityLabel(Text(.authSignIn))
        .accessibilityAddTraits(viewModel.isSubmitting ? [] : .isButton)
    }

    private var footer: some View {
        // Stacks vertically at large Dynamic Type sizes, where the
        // side-by-side line would otherwise truncate or clip.
        let layout = dynamicTypeSize >= .accessibility1
            ? AnyLayout(VStackLayout(spacing: ZrpSpacing.xs))
            : AnyLayout(HStackLayout(spacing: ZrpSpacing.xs))

        return VStack(spacing: ZrpSpacing.lg) {
            layout {
                Text(.authNoAccount)
                    .font(.footnote)
                    .foregroundStyle(ZrpColor.onSurfaceMuted)
                // Sign-up, forgot-password, and Sign in with Apple are
                // deliberately absent rather than present-and-inert.
                // Registration and password reset land in Phase 3b;
                // Sign in with Apple is blocked on a backend route that
                // does not exist yet (see PARITY.md, B2). A button that
                // cannot complete its flow is worse than no button.
                Text(.authSignUp)
                    .font(.footnote.weight(.semibold))
                    .foregroundStyle(ZrpColor.onSurfaceMuted.opacity(0.5))
            }
            .accessibilityElement(children: .combine)
        }
    }

    private func banner(_ message: String, isError: Bool) -> some View {
        HStack(alignment: .top, spacing: ZrpSpacing.sm) {
            Image(systemName: isError ? "exclamationmark.circle.fill" : "info.circle.fill")
                .foregroundStyle(isError ? ZrpColor.red : ZrpColor.blue)
            Text(verbatim: message)
                .font(.footnote)
                .foregroundStyle(ZrpColor.onSurface)
                .frame(maxWidth: .infinity, alignment: .leading)
        }
        .padding(ZrpSpacing.md)
        .background((isError ? ZrpColor.red : ZrpColor.blue).opacity(0.12))
        .clipShape(RoundedRectangle(cornerRadius: ZrpRadius.md, style: .continuous))
        .accessibilityElement(children: .combine)
        .accessibilityAddTraits(.isStaticText)
    }

    // MARK: -

    private func signIn() async {
        focusedField = nil
        if let user = await viewModel.submit() {
            session.signedIn(user)
        }
    }
}
