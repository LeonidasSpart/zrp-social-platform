import SwiftUI

/// Account deletion.
///
/// Required by App Store rule 5.1.1(v): an app that lets people create an
/// account must let them delete it from inside the app, not only on a
/// website. Both paths the website offers are here.
///
/// The backend gives two, and they are genuinely different:
///
/// - `POST /api/user/delete` schedules deletion **30 days** out, and
///   calling it again cancels. One toggle route for both.
/// - `POST /api/user/delete/confirm` deletes immediately and
///   irreversibly, cascading every post, message, track and listing and
///   removing the uploaded files behind them.
///
/// The immediate path is gated behind typing DELETE. The route itself
/// accepts a bare POST, so that gate lives in the UI - exactly where the
/// website puts it.
struct DeleteAccountView: View {

    @EnvironmentObject private var session: SessionController

    @State private var status: AccountDeletionStatus?
    @State private var loadError: ApiError?
    @State private var confirmationText = ""
    @State private var isWorking = false
    @State private var message: SettingsMessage?
    @State private var showsFinalConfirmation = false

    private let repository = SettingsRepository()

    private var canDeleteNow: Bool {
        confirmationText.trimmingCharacters(in: .whitespacesAndNewlines) == "DELETE" && !isWorking
    }

    var body: some View {
        Group {
            if let status {
                content(status)
            } else if let loadError {
                TimelineStateView.error(loadError) { Task { await load() } }
            } else {
                TimelineStateView.loading()
            }
        }
        .background(ZrpColor.background.ignoresSafeArea())
        .navigationTitle(Text(.deleteAccountTitle))
        .navigationBarTitleDisplayMode(.inline)
        .task { await load() }
        .alert(
            Text(.deleteAccountPermanentlyDeleteAccount),
            isPresented: $showsFinalConfirmation
        ) {
            Button(role: .destructive) { deleteNow() } label: {
                Text(.deleteAccountDeleteNow)
            }
            Button(role: .cancel) { } label: { Text(.musicStudioCancel) }
        } message: {
            Text(.deleteAccountPermanentWarning)
        }
    }

    private func load() async {
        do {
            status = try await repository.deletionStatus()
            loadError = nil
        } catch {
            loadError = error as? ApiError ?? .transport(underlying: "\(error)")
        }
    }

    private func content(_ status: AccountDeletionStatus) -> some View {
        ScrollView {
            VStack(alignment: .leading, spacing: ZrpSpacing.lg) {
                if let scheduledFor = status.scheduledFor {
                    scheduled(scheduledFor)
                } else {
                    consequences
                    scheduleSection
                }

                Divider().overlay(ZrpColor.outline)

                immediateSection

                if let message {
                    Text(verbatim: message.text)
                        .font(.footnote)
                        .foregroundStyle(message.isError ? ZrpColor.red : ZrpColor.green)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
            .padding(ZrpSpacing.lg)
            .frame(maxWidth: ZrpMetrics.contentMaxWidth, alignment: .leading)
            .frame(maxWidth: .infinity)
        }
    }

    /// What deletion actually does, in the site's own words - said before
    /// the button, not after it.
    private var consequences: some View {
        VStack(alignment: .leading, spacing: ZrpSpacing.sm) {
            Text(.deleteAccountDeletingWillIntro)
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(ZrpColor.onSurface)

            ForEach(
                [L10nKey.deleteAccountBullet1, .deleteAccountBullet2, .deleteAccountBullet3,
                 .deleteAccountBullet4, .deleteAccountBullet5],
                id: \.rawValue
            ) { bullet in
                Label { Text(bullet) } icon: {
                    // Decorative bullet: the sentence is the content.
                    Image(systemName: "circle.fill")
                        .font(.system(size: 5))
                        .accessibilityHidden(true)
                }
                    .font(.footnote)
                    .foregroundStyle(ZrpColor.onSurfaceMuted)
            }

            Text(.deleteAccountPermanentWarning)
                .font(.footnote.weight(.semibold))
                .foregroundStyle(ZrpColor.red)
                .fixedSize(horizontal: false, vertical: true)
        }
    }

    private var scheduleSection: some View {
        VStack(alignment: .leading, spacing: ZrpSpacing.sm) {
            Text(.deleteAccountScheduleHintPre)
                .font(.footnote)
                .foregroundStyle(ZrpColor.onSurfaceMuted)
                .fixedSize(horizontal: false, vertical: true)

            Button { toggleSchedule() } label: {
                Text(.deleteAccountRequestAccountDeletion)
                    .font(.subheadline.weight(.semibold))
                    .frame(maxWidth: .infinity)
                    .frame(minHeight: ZrpMetrics.minTouchTarget)
                    .background(ZrpColor.surfaceHighest)
                    .foregroundStyle(ZrpColor.red)
                    .clipShape(RoundedRectangle(cornerRadius: ZrpRadius.md))
            }
            .buttonStyle(.plain)
            .disabled(isWorking)
        }
    }

    private func scheduled(_ date: Date) -> some View {
        VStack(alignment: .leading, spacing: ZrpSpacing.sm) {
            Text(.deleteAccountScheduledMessage, ["date": ModerationDateFormat.day(date)])
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(ZrpColor.onSurface)
                .fixedSize(horizontal: false, vertical: true)

            Text(.deleteAccountCancelAnytimeHint)
                .font(.footnote)
                .foregroundStyle(ZrpColor.onSurfaceMuted)
                .fixedSize(horizontal: false, vertical: true)

            Button { toggleSchedule() } label: {
                Text(.deleteAccountCancelDeletionRequest)
                    .font(.subheadline.weight(.semibold))
                    .frame(maxWidth: .infinity)
                    .frame(minHeight: ZrpMetrics.minTouchTarget)
                    .background(ZrpColor.red)
                    .foregroundStyle(.white)
                    .clipShape(RoundedRectangle(cornerRadius: ZrpRadius.md))
            }
            .buttonStyle(.plain)
            .disabled(isWorking)
        }
    }

    private var immediateSection: some View {
        VStack(alignment: .leading, spacing: ZrpSpacing.sm) {
            Text(.deleteAccountConfirmDeletionTitle)
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(ZrpColor.onSurface)

            TextField(
                text: $confirmationText,
                prompt: Text(.deleteAccountTypeDeleteToConfirm),
                label: { Text(.deleteAccountTypeDeleteToConfirm) }
            )
            .labelsHidden()
            .textInputAutocapitalization(.characters)
            .autocorrectionDisabled()
            .padding(ZrpSpacing.md)
            .background(ZrpColor.surfaceElevated)
            .clipShape(RoundedRectangle(cornerRadius: ZrpRadius.md))

            Button {
                showsFinalConfirmation = true
            } label: {
                Text(isWorking ? L10nKey.deleteAccountDeleting : L10nKey.deleteAccountPermanentlyDeleteAccount)
                    .font(.subheadline.weight(.bold))
                    .frame(maxWidth: .infinity)
                    .frame(minHeight: ZrpMetrics.minTouchTarget)
                    .background(canDeleteNow ? ZrpColor.red : ZrpColor.surfaceHighest)
                    .foregroundStyle(canDeleteNow ? .white : ZrpColor.onSurfaceMuted)
                    .clipShape(RoundedRectangle(cornerRadius: ZrpRadius.md))
            }
            .buttonStyle(.plain)
            .disabled(!canDeleteNow)
        }
    }

    // MARK: - Actions

    private func toggleSchedule() {
        Task {
            isWorking = true
            defer { isWorking = false }
            do {
                let result = try await repository.toggleScheduledDeletion()
                // Refetched rather than assumed: one route does both, and
                // the status endpoint is what the rest of this screen
                // renders from.
                status = try await repository.deletionStatus()
                message = SettingsMessage(
                    text: L10n.string(
                        result.didSchedule
                            ? .deleteAccountSuccessScheduled
                            : .deleteAccountCancelledInfo
                    ),
                    isError: false
                )
            } catch {
                message = SettingsMessage(
                    text: (error as? ApiError)?.serverMessage
                        ?? L10n.string(.deleteAccountErrFailedSchedule),
                    isError: true
                )
            }
        }
    }

    private func deleteNow() {
        guard canDeleteNow else {
            message = SettingsMessage(
                text: L10n.string(.deleteAccountErrTypeDeleteConfirm),
                isError: true
            )
            return
        }
        Task {
            isWorking = true
            defer { isWorking = false }
            do {
                try await repository.deleteAccountNow()
                // The account is gone and the server has cleared its
                // session cookie; signing out locally drops the stored
                // token and returns the app to the sign-in screen rather
                // than leaving it holding a credential for a deleted
                // account.
                await session.signOut()
            } catch {
                message = SettingsMessage(
                    text: (error as? ApiError)?.serverMessage
                        ?? L10n.string(.deleteAccountErrFailedDelete),
                    isError: true
                )
            }
        }
    }
}
