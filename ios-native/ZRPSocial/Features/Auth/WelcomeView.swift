import SwiftUI

/// The first screen of the app.
///
/// A chooser, not a form. `LoginView` and `RegisterView` are unchanged
/// and still do all the real work of signing in and signing up - this
/// puts ZRP in front of them and offers the three ways in rather than
/// opening on a password field, which is what the design reference asks
/// for and what every social app a new person has used already does.
///
/// Sign in with Apple is offered here as well as inside the form,
/// because it is a one-tap path that needs no form at all; it is the
/// same `AppleSignInButton`, calling the same endpoint.
struct WelcomeView: View {

    @EnvironmentObject private var session: SessionController
    @State private var isSigningIn = false
    @State private var isRegistering = false
    @State private var appleError: String?

    var body: some View {
        ScrollView {
            VStack(spacing: ZrpSpacing.xl) {
                Spacer(minLength: ZrpSpacing.xxl)
                hero
                Spacer(minLength: ZrpSpacing.lg)
                actions
                Spacer(minLength: ZrpSpacing.lg)
            }
            .padding(.horizontal, ZrpSpacing.xl)
            .padding(.vertical, ZrpSpacing.xxl)
            // The same reading width the sign-in form uses, so the two
            // do not jump in size as one replaces the other.
            .frame(maxWidth: 420)
            .frame(maxWidth: .infinity)
            // Fills the screen so the hero sits in the upper half and the
            // buttons near the thumb, rather than both bunching at the
            // top of a tall display.
            .frame(minHeight: minimumContentHeight)
        }
        .background(ZrpColor.background.ignoresSafeArea())
        .scrollBounceBehavior(.basedOnSize)
        .sheet(isPresented: $isSigningIn) {
            NavigationStack {
                LoginView()
                    .navigationTitle(Text(.authSignIn))
                    .navigationBarTitleDisplayMode(.inline)
                    .toolbar {
                        ToolbarItem(placement: .topBarLeading) {
                            Button { isSigningIn = false } label: {
                                Text(.actionCancel)
                            }
                        }
                    }
            }
        }
        .sheet(isPresented: $isRegistering) {
            NavigationStack { RegisterView() }
        }
        .alert(
            Text(.iosErrorGenericTitle),
            isPresented: Binding(
                get: { appleError != nil },
                set: { if !$0 { appleError = nil } }
            )
        ) {
            Button { appleError = nil } label: { Text(.actionCancel) }
        } message: {
            Text(verbatim: appleError ?? "")
        }
        // A session that expired or was revoked lands back here. Being
        // told "your session expired" only after tapping Sign in would
        // bury the one piece of information that explains why the app
        // just signed you out, so the form is opened for it.
        .task {
            if session.expiryNotice != nil { isSigningIn = true }
        }
        .onChange(of: session.expiryNotice) { _, notice in
            guard notice != nil else { return }
            isSigningIn = true
        }
    }

    private var minimumContentHeight: CGFloat {
        // A conservative floor rather than a GeometryReader: this only
        // needs to beat the content's natural height on a tall phone,
        // and the ScrollView handles anything shorter.
        560
    }

    // MARK: - Hero

    private var hero: some View {
        VStack(spacing: ZrpSpacing.lg) {
            // The official ZRP mark, used exactly as the project ships
            // it - not recoloured, cropped or redrawn.
            Image("ZrpLogo")
                .resizable()
                .scaledToFit()
                .frame(width: 120, height: 120)
                .accessibilityHidden(true)

            VStack(spacing: ZrpSpacing.sm) {
                Text(.authWelcomeTitle)
                    .font(.largeTitle.weight(.bold))
                    .foregroundStyle(ZrpColor.onSurface)
                    .multilineTextAlignment(.center)

                Text(.aboutSubtitle)
                    .font(.subheadline)
                    .foregroundStyle(ZrpColor.onSurfaceMuted)
                    .multilineTextAlignment(.center)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .accessibilityElement(children: .combine)
    }

    // MARK: - Actions

    private var actions: some View {
        VStack(spacing: ZrpSpacing.md) {
            Button {
                isRegistering = true
            } label: {
                Text(.authCreateAccount)
                    .font(.headline)
                    .frame(maxWidth: .infinity)
                    .frame(minHeight: ZrpMetrics.minTouchTarget + 4)
                    .background(ZrpColor.red)
                    .foregroundStyle(.white)
                    .clipShape(RoundedRectangle(cornerRadius: ZrpRadius.md, style: .continuous))
            }
            .buttonStyle(.plain)

            Button {
                isSigningIn = true
            } label: {
                Text(.authSignIn)
                    .font(.headline)
                    .frame(maxWidth: .infinity)
                    .frame(minHeight: ZrpMetrics.minTouchTarget + 4)
                    .foregroundStyle(ZrpColor.onSurface)
                    .background(ZrpColor.surfaceElevated)
                    .clipShape(RoundedRectangle(cornerRadius: ZrpRadius.md, style: .continuous))
                    .overlay(
                        RoundedRectangle(cornerRadius: ZrpRadius.md, style: .continuous)
                            .strokeBorder(ZrpColor.outline, lineWidth: 1)
                    )
            }
            .buttonStyle(.plain)

            divider

            AppleSignInButton { message in appleError = message }
        }
    }

    /// The "or" rule the website's own login page draws between the form
    /// and the third-party buttons.
    private var divider: some View {
        HStack(spacing: ZrpSpacing.md) {
            line
            Text(.authOr)
                .font(.footnote)
                .foregroundStyle(ZrpColor.onSurfaceMuted)
            line
        }
        .padding(.vertical, ZrpSpacing.xs)
        .accessibilityHidden(true)
    }

    private var line: some View {
        Rectangle()
            .fill(ZrpColor.outline)
            .frame(height: 1)
            .frame(maxWidth: .infinity)
    }
}
