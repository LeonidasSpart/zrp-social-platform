import SwiftUI

/// Download a copy of the account's data.
///
/// `GET /api/settings/export-data` answers with a JSON document and a
/// `Content-Disposition` filename - a file download, not an API envelope.
/// On the web that lands in the downloads folder; here it is written to a
/// file and handed to the share sheet, so the person can save it to
/// Files, mail it to themselves, or send it anywhere else.
struct DataExportView: View {

    @State private var exportURL: URL?
    @State private var isWorking = false
    @State private var errorText: String?

    private let repository = SettingsRepository()

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: ZrpSpacing.lg) {
                Text(.settingsExportDataDesc)
                    .font(.subheadline)
                    .foregroundStyle(ZrpColor.onSurfaceMuted)
                    .fixedSize(horizontal: false, vertical: true)

                Button { export() } label: {
                    Label {
                        Text(isWorking ? L10nKey.settingsSaving : L10nKey.settingsExportData)
                    } icon: {
                        Image(systemName: "square.and.arrow.down")
                    }
                    .font(.subheadline.weight(.semibold))
                    .frame(maxWidth: .infinity)
                    .frame(minHeight: ZrpMetrics.minTouchTarget)
                    .background(ZrpColor.red)
                    .foregroundStyle(.white)
                    .clipShape(RoundedRectangle(cornerRadius: ZrpRadius.md))
                }
                .buttonStyle(.plain)
                .disabled(isWorking)

                // Offered only once a real file exists - a share button
                // with nothing behind it is a dead control.
                if let exportURL {
                    ShareLink(item: exportURL) {
                        Label { Text(.settingsExportData) } icon: { Image(systemName: "square.and.arrow.up") }
                            .font(.subheadline.weight(.semibold))
                            .frame(maxWidth: .infinity)
                            .frame(minHeight: ZrpMetrics.minTouchTarget)
                            .background(ZrpColor.surfaceHighest)
                            .foregroundStyle(ZrpColor.onSurface)
                            .clipShape(RoundedRectangle(cornerRadius: ZrpRadius.md))
                    }
                }

                if let errorText {
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
        .background(ZrpColor.background.ignoresSafeArea())
        .navigationTitle(Text(.settingsExportDataHeading))
        .navigationBarTitleDisplayMode(.inline)
    }

    private func export() {
        Task {
            isWorking = true
            defer { isWorking = false }
            do {
                exportURL = try await repository.exportData()
                errorText = nil
            } catch {
                exportURL = nil
                errorText = (error as? ApiError)?.serverMessage
                    ?? L10n.string(.settingsErrSomethingWrong)
            }
        }
    }
}

/// Report a post, comment or listing: `POST /api/reports`.
///
/// The reasons are the website's exact stored strings - `Report.reason`
/// is free text that moderators read, so the value on the wire stays
/// English while the label is localized.
struct ReportSheet: View {

    let target: ReportRequest.Target

    @Environment(\.dismiss) private var dismiss
    @State private var reason: ReportReason?
    @State private var details = ""
    @State private var isSubmitting = false
    @State private var errorText: String?

    private let repository = SettingsRepository()

    var body: some View {
        NavigationStack {
            List {
                Section {
                    Picker(selection: $reason) {
                        Text(.reportSelectReasonPlaceholder).tag(ReportReason?.none)
                        ForEach(ReportReason.allCases) { option in
                            Text(option.labelKey).tag(ReportReason?.some(option))
                        }
                    } label: {
                        Text(.reportReasonLabel)
                    }
                }

                Section {
                    TextField(
                        text: $details,
                        prompt: Text(.reportDetailsPlaceholder),
                        axis: .vertical,
                        label: { Text(.reportDetailsLabel) }
                    )
                    .lineLimit(3...8)
                } header: {
                    Text(.reportDetailsLabel)
                } footer: {
                    if let errorText {
                        Text(verbatim: errorText).foregroundStyle(ZrpColor.red)
                    }
                }

                Section {
                    Button { submit() } label: {
                        Text(isSubmitting ? L10nKey.reportSubmitting : L10nKey.reportSubmit)
                            .frame(maxWidth: .infinity)
                    }
                    .disabled(reason == nil || isSubmitting)
                }
            }
            .scrollContentBackground(.hidden)
            .background(ZrpColor.background.ignoresSafeArea())
            .navigationTitle(Text(.reportModalTitle))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button { dismiss() } label: { Text(.musicStudioCancel) }
                }
            }
        }
    }

    private func submit() {
        guard let reason else { return }
        Task {
            isSubmitting = true
            defer { isSubmitting = false }
            do {
                try await repository.report(
                    ReportRequest(
                        target: target,
                        reason: reason,
                        details: details.trimmingCharacters(in: .whitespacesAndNewlines).nilIfEmpty
                    )
                )
                dismiss()
            } catch {
                // A 409 means this person already has a pending report on
                // this exact thing. The route says so in words worth
                // showing, rather than reading as a generic failure.
                errorText = (error as? ApiError)?.serverMessage
                    ?? L10n.string(.settingsErrSomethingWrong)
            }
        }
    }
}
