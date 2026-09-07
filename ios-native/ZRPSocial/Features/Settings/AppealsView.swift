import SwiftUI

/// Appealing a moderation decision.
///
/// `GET /api/appeals` returns both halves at once: the actions still
/// open to appeal, and the appeals already filed. An entry in the first
/// list is appealable *by construction* - the route selects only reports
/// that are `actioned` and carry no appeal from this account - so
/// nothing is re-checked here before offering the button.
struct AppealsView: View {

    @State private var page: AppealsPage?
    @State private var loadError: ApiError?
    @State private var appealing: AppealableAction?

    private let repository = SettingsRepository()

    var body: some View {
        Group {
            if let page {
                content(page)
            } else if let loadError {
                TimelineStateView.error(loadError) { Task { await load() } }
            } else {
                TimelineStateView.loading()
            }
        }
        .background(ZrpColor.background.ignoresSafeArea())
        .navigationTitle(Text(.appealsTitle))
        .navigationBarTitleDisplayMode(.inline)
        .task { await load() }
        .sheet(item: $appealing) { action in
            AppealComposerView(action: action) {
                Task { await load() }
            }
        }
    }

    private func content(_ page: AppealsPage) -> some View {
        ScrollView {
            VStack(alignment: .leading, spacing: ZrpSpacing.lg) {
                Text(.appealsExplanation)
                    .font(.footnote)
                    .foregroundStyle(ZrpColor.onSurfaceMuted)

                section(.appealsEligibleHeading) {
                    if page.eligibleReports.isEmpty {
                        emptyLine(.appealsNoEligible)
                    } else {
                        ForEach(page.eligibleReports) { action in
                            eligibleRow(action)
                        }
                    }
                }

                section(.appealsFiledHeading) {
                    if page.appeals.isEmpty {
                        emptyLine(.appealsNoFiled)
                    } else {
                        ForEach(page.appeals) { appeal in
                            appealRow(appeal)
                        }
                    }
                }
            }
            .padding(ZrpSpacing.lg)
            .frame(maxWidth: ZrpMetrics.contentMaxWidth)
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .refreshable { await load() }
    }

    @ViewBuilder
    private func section<Content: View>(
        _ title: L10nKey,
        @ViewBuilder content: () -> Content
    ) -> some View {
        VStack(alignment: .leading, spacing: ZrpSpacing.sm) {
            Text(title)
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(ZrpColor.onSurface)
            content()
        }
    }

    private func emptyLine(_ key: L10nKey) -> some View {
        Text(key)
            .font(.footnote)
            .foregroundStyle(ZrpColor.onSurfaceMuted)
    }

    private func eligibleRow(_ action: AppealableAction) -> some View {
        VStack(alignment: .leading, spacing: ZrpSpacing.xs) {
            Text(verbatim: Self.actionLabel(action.actionType))
                .font(.subheadline.weight(.medium))
                .foregroundStyle(ZrpColor.onSurface)
            if let reason = action.reason, !reason.isEmpty {
                Text(verbatim: reason)
                    .font(.caption)
                    .foregroundStyle(ZrpColor.onSurfaceMuted)
            }
            if let note = action.actionNote, !note.isEmpty {
                Text(verbatim: note)
                    .font(.caption)
                    .foregroundStyle(ZrpColor.onSurfaceMuted)
            }
            if let date = action.actionedAt {
                Text(verbatim: date.formatted(date: .abbreviated, time: .shortened))
                    .font(.caption2)
                    .foregroundStyle(ZrpColor.onSurfaceMuted)
            }
            Button { appealing = action } label: {
                Text(.appealsFileAppeal)
                    .font(.subheadline.weight(.medium))
                    .frame(minHeight: ZrpMetrics.minTouchTarget)
                    .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .foregroundStyle(ZrpColor.red)
        }
        .padding(ZrpSpacing.md)
        .frame(maxWidth: .infinity, alignment: .leading)
        .overlay(
            RoundedRectangle(cornerRadius: ZrpRadius.md, style: .continuous)
                .strokeBorder(ZrpColor.outline, lineWidth: 1)
        )
    }

    private func appealRow(_ appeal: Appeal) -> some View {
        VStack(alignment: .leading, spacing: ZrpSpacing.xs) {
            HStack(spacing: ZrpSpacing.sm) {
                Text(verbatim: Self.actionLabel(appeal.report?.actionType))
                    .font(.subheadline.weight(.medium))
                    .foregroundStyle(ZrpColor.onSurface)
                Spacer(minLength: 0)
                statusBadge(appeal.status)
            }
            Text(verbatim: appeal.message)
                .font(.caption)
                .foregroundStyle(ZrpColor.onSurfaceMuted)
                .fixedSize(horizontal: false, vertical: true)
            if let note = appeal.resolutionNote, !note.isEmpty {
                Text(verbatim: note)
                    .font(.caption)
                    .foregroundStyle(ZrpColor.onSurface)
            }
            Text(verbatim: (appeal.resolvedAt ?? appeal.createdAt)
                .formatted(date: .abbreviated, time: .shortened))
                .font(.caption2)
                .foregroundStyle(ZrpColor.onSurfaceMuted)
        }
        .padding(ZrpSpacing.md)
        .frame(maxWidth: .infinity, alignment: .leading)
        .overlay(
            RoundedRectangle(cornerRadius: ZrpRadius.md, style: .continuous)
                .strokeBorder(ZrpColor.outline, lineWidth: 1)
        )
    }

    /// The three statuses the shared dictionary has wording for. Any
    /// other value the backend introduces is shown as it came rather
    /// than mislabelled as one of these.
    @ViewBuilder
    private func statusBadge(_ status: String) -> some View {
        let key: L10nKey? = switch status {
        case "pending": .appealsStatusPending
        case "upheld": .appealsStatusUpheld
        case "overturned": .appealsStatusOverturned
        default: nil
        }
        Group {
            if let key { Text(key) } else { Text(verbatim: status) }
        }
        .font(.caption.weight(.medium))
        .padding(.horizontal, ZrpSpacing.sm)
        .padding(.vertical, ZrpSpacing.xs)
        .background(ZrpColor.surfaceHighest)
        .foregroundStyle(ZrpColor.onSurfaceMuted)
        .clipShape(Capsule())
    }

    /// `post_removed` → `post removed`, which is exactly what the website
    /// does. There is no dictionary of action types, and the backend can
    /// add one at any time, so inventing labels would mean guessing.
    static func actionLabel(_ actionType: String?) -> String {
        guard let actionType, !actionType.isEmpty else {
            return L10n.string(.adminReportsActionOther)
        }
        return actionType.replacingOccurrences(of: "_", with: " ")
    }

    private func load() async {
        do {
            page = try await repository.appeals()
            loadError = nil
        } catch {
            loadError = error as? ApiError ?? .transport(underlying: "\(error)")
        }
    }
}

/// Writing one appeal.
private struct AppealComposerView: View {

    let action: AppealableAction
    let onFiled: () -> Void

    @Environment(\.dismiss) private var dismiss
    @State private var message = ""
    @State private var isSubmitting = false
    @State private var errorMessage: String?

    private let repository = SettingsRepository()

    /// The route requires a message and refuses one over 2000
    /// characters, so the button is disabled rather than the request
    /// being sent to be rejected.
    private var trimmed: String {
        message.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    private var canSubmit: Bool {
        !trimmed.isEmpty && trimmed.count <= 2000 && !isSubmitting
    }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    Text(verbatim: AppealsView.actionLabel(action.actionType))
                        .font(.subheadline.weight(.medium))
                    if let note = action.actionNote, !note.isEmpty {
                        Text(verbatim: note)
                            .font(.caption)
                            .foregroundStyle(ZrpColor.onSurfaceMuted)
                    }
                }

                Section {
                    TextField(
                        L10n.string(.appealsMessagePlaceholder),
                        text: $message,
                        axis: .vertical
                    )
                    .lineLimit(4...10)
                } footer: {
                    Text(verbatim: "\(trimmed.count)/2000")
                        .monospacedDigit()
                        .foregroundStyle(trimmed.count > 2000 ? ZrpColor.red : ZrpColor.onSurfaceMuted)
                }

                if let errorMessage {
                    Section {
                        Text(verbatim: errorMessage)
                            .font(.footnote)
                            .foregroundStyle(ZrpColor.red)
                    }
                }
            }
            .navigationTitle(Text(.appealsFileAppeal))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button { dismiss() } label: { Text(.actionCancel) }
                        .disabled(isSubmitting)
                }
                ToolbarItem(placement: .confirmationAction) {
                    if isSubmitting {
                        ProgressView().tint(ZrpColor.red)
                    } else {
                        Button { Task { await submit() } } label: { Text(.appealsSubmit) }
                            .disabled(!canSubmit)
                    }
                }
            }
        }
    }

    private func submit() async {
        guard canSubmit else { return }
        isSubmitting = true
        errorMessage = nil
        defer { isSubmitting = false }
        do {
            try await repository.submitAppeal(reportId: action.id, message: trimmed)
            onFiled()
            dismiss()
        } catch let error as ApiError {
            // 404 ("isn't eligible"), 409 ("already filed") and the rate
            // limit are all real rules the server states better than the
            // client could.
            errorMessage = error.serverMessage
                ?? error.userFacingMessage
        } catch {
            errorMessage = L10n.string(.appealsErrSubmitFailed)
        }
    }
}
