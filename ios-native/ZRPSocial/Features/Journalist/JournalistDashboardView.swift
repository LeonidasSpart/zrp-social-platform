import SwiftUI

@MainActor
final class JournalistDashboardViewModel: ObservableObject {

    enum Phase: Equatable {
        case loading
        case loaded(JournalistDashboard)
        case failed(ApiError)
    }

    @Published private(set) var phase: Phase = .loading

    // The application form.
    @Published var outlet = ""
    @Published var pitch = ""
    @Published var portfolioUrl = ""
    @Published private(set) var isSubmitting = false
    @Published var errorMessage: String?

    private let repository: JournalistRepositoryProtocol

    init(repository: JournalistRepositoryProtocol = JournalistRepository()) {
        self.repository = repository
    }

    var dashboard: JournalistDashboard? {
        if case .loaded(let dashboard) = phase { return dashboard }
        return nil
    }

    var status: JournalistStatus? { dashboard?.profile?.status }

    /// Whether the application form should be shown at all.
    ///
    /// Only two cases: nobody has applied, or a previous application was
    /// rejected and may be replaced. Pending, verified and suspended all
    /// get a 409 from the route, so offering the form would be offering
    /// a refusal.
    var canApply: Bool {
        guard let dashboard else { return false }
        guard let profile = dashboard.profile else { return true }
        return profile.status == .rejected
    }

    /// Writing is the JOURNALIST role's, and submitting is VERIFIED's.
    /// Both are enforced with a 403; this only decides what to offer.
    var canWrite: Bool {
        guard let dashboard, dashboard.isJournalist else { return false }
        return status != .suspended
    }

    var canSubmitForReview: Bool {
        status == .verified
    }

    var canSubmitApplication: Bool {
        !pitch.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && !isSubmitting
    }

    func load() async {
        if case .loaded = phase {} else { phase = .loading }
        do {
            phase = .loaded(try await repository.dashboard())
        } catch ApiError.cancelled {
            return
        } catch {
            phase = .failed(error as? ApiError ?? .transport(underlying: "\(error)"))
        }
    }

    func apply() async {
        guard canSubmitApplication else { return }
        isSubmitting = true
        defer { isSubmitting = false }
        do {
            try await repository.apply(
                JournalistApplication(
                    outlet: outlet.isEmpty ? nil : outlet,
                    pitch: pitch.trimmingCharacters(in: .whitespacesAndNewlines),
                    portfolioUrl: portfolioUrl.isEmpty ? nil : portfolioUrl
                )
            )
            pitch = ""
            outlet = ""
            portfolioUrl = ""
            await load()
        } catch let error as ApiError {
            errorMessage = error.userFacingMessage
        } catch {
            errorMessage = L10n.string(.journalistDashErrFailedSubmit)
        }
    }
}

/// The Journalist dashboard, and the way in for everyone else.
///
/// One screen for every state the routes can report, because the state
/// is entirely theirs: not a journalist, pending, rejected, suspended,
/// verified. Applying grants the JOURNALIST role but **not**
/// verification and **not** a badge - so a pending journalist is offered
/// the editor and not the submit button, which is exactly what the
/// routes allow.
struct JournalistDashboardView: View {

    @StateObject private var viewModel = JournalistDashboardViewModel()
    @EnvironmentObject private var navigator: Navigator

    var body: some View {
        Group {
            switch viewModel.phase {
            case .loading:
                TimelineStateView.loading()
            case .failed(let error):
                TimelineStateView.error(error) { Task { await viewModel.load() } }
            case .loaded(let dashboard):
                content(dashboard)
            }
        }
        .background(ZrpColor.background.ignoresSafeArea())
        .navigationTitle(Text(.journalistDashTitle))
        .navigationBarTitleDisplayMode(.inline)
        .task { await viewModel.load() }
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

    @ViewBuilder
    private func content(_ dashboard: JournalistDashboard) -> some View {
        ScrollView {
            VStack(alignment: .leading, spacing: ZrpSpacing.lg) {
                switch viewModel.status {
                case .pending:
                    notice(
                        .journalistDashPendingTitle,
                        .journalistDashPendingDesc,
                        tint: ZrpColor.amber
                    )
                case .suspended:
                    notice(
                        .journalistDashSuspendedTitle,
                        .journalistDashSuspendedDefaultReason,
                        tint: ZrpColor.red,
                        detail: dashboard.profile?.suspensionReason
                    )
                case .rejected:
                    notice(
                        .journalistDashRejectedNoticeTitle,
                        .journalistDashRejectedNoticeHint,
                        tint: ZrpColor.onSurfaceMuted,
                        detail: dashboard.profile?.rejectionReason
                    )
                case .verified, .unknown, .none:
                    EmptyView()
                }

                if viewModel.canApply {
                    applicationForm
                }

                if dashboard.isJournalist {
                    stats(dashboard.counts)
                    articles(dashboard.recentArticles)
                }
            }
            .padding(ZrpSpacing.lg)
            .frame(maxWidth: ZrpMetrics.contentMaxWidth, alignment: .leading)
            .frame(maxWidth: .infinity)
        }
        .refreshable { await viewModel.load() }
    }

    // MARK: - Application

    private var applicationForm: some View {
        VStack(alignment: .leading, spacing: ZrpSpacing.md) {
            Text(.journalistDashBecomeTitle)
                .font(.headline)
                .foregroundStyle(ZrpColor.onSurface)
            Text(.journalistDashBecomeSubtitle)
                .font(.caption)
                .foregroundStyle(ZrpColor.onSurfaceMuted)
                .fixedSize(horizontal: false, vertical: true)

            field(.journalistDashOutletLabel, text: $viewModel.outlet)
            field(.journalistDashPortfolioLabel, text: $viewModel.portfolioUrl, isURL: true)

            VStack(alignment: .leading, spacing: ZrpSpacing.xs) {
                Text(.journalistDashPitchLabel)
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(ZrpColor.onSurfaceMuted)
                TextField(
                    text: $viewModel.pitch,
                    prompt: Text(.journalistDashPitchPlaceholder),
                    axis: .vertical,
                    label: { Text(.journalistDashPitchLabel) }
                )
                .labelsHidden()
                .lineLimit(4...10)
                .padding(ZrpSpacing.md)
                .background(ZrpColor.surfaceElevated)
                .clipShape(RoundedRectangle(cornerRadius: ZrpRadius.md))
            }

            Button {
                Task { await viewModel.apply() }
            } label: {
                Text(.journalistDashSubmitApplication)
                    .font(.subheadline.weight(.semibold))
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, ZrpSpacing.md)
                    .background(viewModel.canSubmitApplication ? ZrpColor.red : ZrpColor.surfaceHighest)
                    .foregroundStyle(viewModel.canSubmitApplication ? .white : ZrpColor.onSurfaceMuted)
                    .clipShape(RoundedRectangle(cornerRadius: ZrpRadius.md, style: .continuous))
            }
            .buttonStyle(.plain)
            .disabled(!viewModel.canSubmitApplication)

            // The one required field, named rather than left to a
            // disabled button to imply.
            if viewModel.pitch.trimmingCharacters(in: .whitespaces).isEmpty {
                Text(.journalistDashErrPitchRequired)
                    .font(.caption2)
                    .foregroundStyle(ZrpColor.onSurfaceMuted)
            }
        }
        .padding(ZrpSpacing.md)
        .frame(maxWidth: .infinity, alignment: .leading)
        .overlay(
            RoundedRectangle(cornerRadius: ZrpRadius.md, style: .continuous)
                .strokeBorder(ZrpColor.outline, lineWidth: 1)
        )
    }

    private func field(
        _ label: L10nKey,
        text: Binding<String>,
        isURL: Bool = false
    ) -> some View {
        VStack(alignment: .leading, spacing: ZrpSpacing.xs) {
            Text(label)
                .font(.caption.weight(.semibold))
                .foregroundStyle(ZrpColor.onSurfaceMuted)
            TextField(text: text, prompt: Text(label), label: { Text(label) })
                .labelsHidden()
                .autocorrectionDisabled(isURL)
                .textInputAutocapitalization(isURL ? .never : .sentences)
                .keyboardType(isURL ? .URL : .default)
                .padding(ZrpSpacing.md)
                .background(ZrpColor.surfaceElevated)
                .clipShape(RoundedRectangle(cornerRadius: ZrpRadius.md))
        }
    }

    // MARK: - Stats and articles

    private func stats(_ counts: JournalistCounts) -> some View {
        VStack(spacing: ZrpSpacing.sm) {
            HStack(spacing: ZrpSpacing.sm) {
                stat(.journalistDashStatTotalArticles, counts.total)
                stat(.journalistDashStatDrafts, counts.draft)
                stat(.journalistDashStatPendingReview, counts.pendingReview)
            }
            HStack(spacing: ZrpSpacing.sm) {
                stat(.journalistDashStatPublished, counts.published)
                stat(.journalistDashStatRejected, counts.rejected)
                stat(.journalistDashStatusArchived, counts.archived)
            }
        }
    }

    private func stat(_ label: L10nKey, _ value: Int) -> some View {
        VStack(spacing: ZrpSpacing.xs) {
            Text(verbatim: CountFormatting.exact(value))
                .font(.title3.weight(.bold))
                .foregroundStyle(ZrpColor.onSurface)
                .monospacedDigit()
            Text(label)
                .font(.caption2)
                .foregroundStyle(ZrpColor.onSurfaceMuted)
                .multilineTextAlignment(.center)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, ZrpSpacing.sm)
        .overlay(
            RoundedRectangle(cornerRadius: ZrpRadius.sm, style: .continuous)
                .strokeBorder(ZrpColor.outline, lineWidth: 1)
        )
        .accessibilityElement(children: .combine)
    }

    private func articles(_ articles: [JournalistArticle]) -> some View {
        VStack(alignment: .leading, spacing: ZrpSpacing.md) {
            HStack {
                Text(.journalistDashRecentArticles)
                    .font(.headline)
                    .foregroundStyle(ZrpColor.onSurface)
                Spacer(minLength: ZrpSpacing.sm)

                // Writing needs the role; submitting needs
                // verification. A pending journalist gets the editor and
                // no submit button, which is exactly what the routes
                // permit.
                if viewModel.canWrite {
                    Button { navigator.push(.journalistArticle(id: nil, canSubmit: viewModel.canSubmitForReview)) } label: {
                        Label { Text(.journalistDashCreateArticle) } icon: {
                            Image(systemName: "square.and.pencil")
                        }
                        .font(.caption.weight(.semibold))
                    }
                    .buttonStyle(.plain)
                    .foregroundStyle(ZrpColor.red)
                }
            }

            if articles.isEmpty {
                Text(.journalistDashNoArticlesYet)
                    .font(.subheadline)
                    .foregroundStyle(ZrpColor.onSurfaceMuted)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(.vertical, ZrpSpacing.lg)
            } else {
                ForEach(articles) { article in
                    row(article)
                }
            }
        }
    }

    private func row(_ article: JournalistArticle) -> some View {
        Button { navigator.push(.journalistArticle(id: article.id, canSubmit: viewModel.canSubmitForReview)) } label: {
            VStack(alignment: .leading, spacing: ZrpSpacing.xs) {
                HStack(alignment: .firstTextBaseline) {
                    Text(verbatim: article.title.isEmpty
                        ? L10n.string(.journalistEditorUntitledArticle)
                        : article.title)
                        .font(.subheadline.weight(.medium))
                        .foregroundStyle(ZrpColor.onSurface)
                        .lineLimit(2)
                        .multilineTextAlignment(.leading)
                    Spacer(minLength: ZrpSpacing.sm)
                    if let statusKey = article.status.titleKey {
                        Text(statusKey)
                            .font(.caption2.weight(.semibold))
                            .padding(.horizontal, ZrpSpacing.sm)
                            .padding(.vertical, 2)
                            .background(statusTint(article.status).opacity(0.15))
                            .foregroundStyle(statusTint(article.status))
                            .clipShape(Capsule())
                    }
                }

                HStack(spacing: ZrpSpacing.sm) {
                    if let categoryKey = article.category.titleKey {
                        Text(categoryKey)
                    }
                    if article.status == .published {
                        Text(verbatim: "\(CountFormatting.exact(article.views))")
                            .monospacedDigit()
                    }
                }
                .font(.caption2)
                .foregroundStyle(ZrpColor.onSurfaceMuted)

                // The reviewer's note is the only feedback a rejected
                // article carries. Showing it in the list means somebody
                // does not have to open each one to find out why.
                if article.status == .rejected, let note = article.reviewNote, !note.isEmpty {
                    Text(verbatim: note)
                        .font(.caption)
                        .foregroundStyle(ZrpColor.onSurface)
                        .fixedSize(horizontal: false, vertical: true)
                        .padding(ZrpSpacing.sm)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .background(ZrpColor.surfaceElevated)
                        .clipShape(RoundedRectangle(cornerRadius: ZrpRadius.sm))
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.vertical, ZrpSpacing.sm)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityElement(children: .combine)
    }

    private func statusTint(_ status: ArticleStatus) -> Color {
        switch status {
        case .published: return ZrpColor.green
        case .pendingReview: return ZrpColor.amber
        case .rejected: return ZrpColor.red
        default: return ZrpColor.onSurfaceMuted
        }
    }

    private func notice(
        _ title: L10nKey,
        _ body: L10nKey,
        tint: Color,
        detail: String? = nil
    ) -> some View {
        VStack(alignment: .leading, spacing: ZrpSpacing.sm) {
            Text(title)
                .font(.headline)
                .foregroundStyle(tint)
            Text(body)
                .font(.subheadline)
                .foregroundStyle(ZrpColor.onSurfaceMuted)
                .fixedSize(horizontal: false, vertical: true)
            if let detail, !detail.isEmpty {
                Text(verbatim: detail)
                    .font(.caption)
                    .foregroundStyle(ZrpColor.onSurface)
                    .fixedSize(horizontal: false, vertical: true)
                    .padding(ZrpSpacing.sm)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(ZrpColor.surfaceElevated)
                    .clipShape(RoundedRectangle(cornerRadius: ZrpRadius.sm))
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(ZrpSpacing.md)
        .overlay(
            RoundedRectangle(cornerRadius: ZrpRadius.md, style: .continuous)
                .strokeBorder(ZrpColor.outline, lineWidth: 1)
        )
    }
}
