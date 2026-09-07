import SwiftUI

/// Choose the app's language.
///
/// Each language is written in its own script - "Français", "العربية",
/// "中文" - because someone looking for their language cannot read the
/// name of it in a language they do not speak. The list and the names
/// both come from the web app's `SUPPORTED_LANGUAGES`, generated rather
/// than retyped, so the picker can never offer a language the app has no
/// strings for.
struct LanguagePickerView: View {

    @EnvironmentObject private var language: LanguageController

    var body: some View {
        List {
            Section {
                row(
                    title: L10n.string(.iosLanguageSystemDefault),
                    subtitle: nil,
                    isSelected: language.selection == nil
                ) {
                    language.select(nil)
                }
            } footer: {
                Text(.iosLanguageSystemDefaultNote)
            }

            Section {
                ForEach(ZrpLanguage.all) { option in
                    row(
                        title: option.nativeName,
                        // The code, so a language you cannot read is
                        // still identifiable - and so "中文" is visibly
                        // "zh" if that is what you were told to pick.
                        subtitle: option.code.uppercased(),
                        isSelected: language.selection == option.code
                    ) {
                        language.select(option.code)
                    }
                }
            } header: {
                Text(.navLanguage)
            }
        }
        .scrollContentBackground(.hidden)
        .background(ZrpColor.background.ignoresSafeArea())
        .navigationTitle(Text(.navLanguage))
        .navigationBarTitleDisplayMode(.inline)
    }

    private func row(
        title: String,
        subtitle: String?,
        isSelected: Bool,
        action: @escaping () -> Void
    ) -> some View {
        Button(action: action) {
            HStack(spacing: ZrpSpacing.md) {
                Text(verbatim: title)
                    .foregroundStyle(ZrpColor.onSurface)
                if let subtitle {
                    Text(verbatim: subtitle)
                        .font(.caption)
                        .foregroundStyle(ZrpColor.onSurfaceMuted)
                }
                Spacer(minLength: 0)
                if isSelected {
                    Image(systemName: "checkmark")
                        .foregroundStyle(ZrpColor.red)
                }
            }
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        // Read as one control, and announced as chosen - a checkmark
        // alone tells VoiceOver nothing.
        .accessibilityElement(children: .combine)
        .accessibilityAddTraits(isSelected ? [.isButton, .isSelected] : .isButton)
    }
}
