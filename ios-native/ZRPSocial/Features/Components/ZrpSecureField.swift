import SwiftUI
import UIKit

/// A password field with its own show/hide toggle.
///
/// Every password entry in the app goes through this rather than a bare
/// `SecureField`, so a mistyped password can be checked before it is
/// sent - the same affordance the website's `PasswordInput.tsx` gives
/// every password box. Each instance owns its own `isRevealed`, so on a
/// screen with two fields (new password / confirm) revealing one never
/// reveals the other.
///
/// The toggle is a real 44pt target, announced to VoiceOver as "Show
/// password" / "Hide password" (the web app's own `auth.showPassword` /
/// `auth.hidePassword` copy, in all 29 languages). Revealing swaps the
/// `SecureField` for a `TextField` bound to the same text, with
/// autocorrection and capitalisation off so the keyboard does not
/// "fix" a password while it is visible.
struct ZrpSecureField: View {

    let prompt: String
    @Binding var text: String

    /// `.password` for a sign-in box, `.newPassword` for one that sets
    /// a password, so iCloud Keychain offers the right thing.
    var contentType: UITextContentType = .password

    /// What VoiceOver calls the field when the prompt alone would not
    /// say ("New password" vs "Confirm new password" on one screen).
    var label: L10nKey? = nil

    @State private var isRevealed = false

    var body: some View {
        HStack(spacing: ZrpSpacing.sm) {
            Group {
                if isRevealed {
                    TextField(prompt, text: $text)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                } else {
                    SecureField(prompt, text: $text)
                }
            }
            .textContentType(contentType)
            .accessibilityLabel(Text(verbatim: label.map { L10n.string($0) } ?? prompt))
            .frame(maxWidth: .infinity)

            Button {
                isRevealed.toggle()
            } label: {
                Image(systemName: isRevealed ? "eye.slash" : "eye")
                    .font(.subheadline)
                    .foregroundStyle(ZrpColor.onSurfaceMuted)
                    .frame(width: ZrpMetrics.minTouchTarget, height: ZrpMetrics.minTouchTarget)
                    .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel(
                Text(isRevealed ? L10nKey.authHidePassword : L10nKey.authShowPassword)
            )
        }
    }
}
