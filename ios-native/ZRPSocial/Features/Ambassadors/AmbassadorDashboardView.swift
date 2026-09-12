import SwiftUI

@MainActor
final class AmbassadorDashboardViewModel: ObservableObject {

    enum Phase: Equatable {
        case loading
        /// Loaded, with a profile or genuinely without one. `nil` is the
        /// route's real answer for somebody who has never applied - not
        /// an error, and not something to paper over with a fabricated
        /// profile.
        case loaded(AmbassadorProfile?)
        case failed(ApiError)
    }

    @Published private(set) var phase: Phase = .loading
    @Published private(set) var isAccepting = false
    @Published var errorMessage: String?

    /// The version the server currently requires, mirrored from
    /// `CURRENT_CODE_OF_CONDUCT_VERSION`. Used only to decide whether to
    /// show the re-acceptance prompt; acceptance itself is recorded
    /// server-side with the server's own version, so a stale value here
    /// can prompt unnecessarily but can never record a false acceptance.
    static let currentCodeOfConductVersion = "1.0"

    private let repository: AmbassadorsRepositoryProtocol

    init(repository: AmbassadorsRepositoryProtocol = AmbassadorsRepository()) {
        self.repository = repository
    }

    var profile: AmbassadorProfile? {
        if case .loaded(let profile) = phase { return profile }
        return nil
    }

    /// True when an existing applicant accepted an older version.
    ///
    /// Only asked of somebody who actually has a profile: prompting
    /// someone who has never applied to re-accept something they never
    /// accepted would be nonsense.
    var needsCodeReacceptance: Bool {
        guard let profile else { return false }
        return profile.codeOfConductVersion != Self.currentCodeOfConductVersion
    }

    func load() async {
        if case .loaded = phase {} else { phase = .loading }
        do {
            phase = .loaded(try await repository.me())
        } catch ApiError.cancelled {
            return
        } catch {
            phase = .failed(error as? ApiError ?? .transport(underlying: "\(error)"))
        }
    }

    func acceptCode() async {
        guard !isAccepting else { return }
        isAccepting = true
        defer { isAccepting = false }
        do {
            phase = .loaded(try await repository.acceptCodeOfConduct())
        } catch let error as ApiError {
            errorMessage = error.userFacingMessage
        } catch {
            errorMessage = L10n.string(.ambassadorsApplyErrGeneric)
        }
    }

    /// `https://zrp.one/signup?ref=<code>` - what the web dashboard's
    /// "My Invitation Link" copies.
    var invitationLink: String? {
        guard let code = profile?.invitationCode, !code.isEmpty else { return nil }
        return "https://zrp.one/signup?ref=\(code)"
    }
}

/// The ambassador dashboard, and the way in for everyone else.
///
/// One screen for five states, because the route returns one shape and
/// the state is entirely the server's: no profile, pending, rejected,
/// suspended, approved. Nothing here promotes anybody - `apply` creates
/// a PENDING row and an admin does the rest - so this never shows a
/// badge or a level the server has not already reported.
struct AmbassadorDashboardView: View {

    @StateObject private var viewModel = AmbassadorDashboardViewModel()
    @EnvironmentObject private var navigator: Navigator
    @State private var copied = false

    var body: some View {
        Group {
            switch viewModel.phase {
            case .loading:
                TimelineStateView.loading()
            case .failed(let error):
                TimelineStateView.error(error) { Task { await viewModel.load() } }
            case .loaded(let profile):
                content(profile)
            }
        }
        .background(ZrpColor.background.ignoresSafeArea())
        .navigationTitle(Text(.ambassadorsDashboardTitle))
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
    private func content(_ profile: AmbassadorProfile?) -> some View {
        ScrollView {
            VStack(alignment: .leading, spacing: ZrpSpacing.lg) {
                if let profile {
                    switch profile.status {
                    case .pending:
                        notice(
                            title: .ambassadorsDashboardPendingTitle,
                            body: .ambassadorsDashboardPendingBody,
                            tint: ZrpColor.amber
                        )
                    case .rejected:
                        notice(
                            title: .ambassadorsDashboardRejectedTitle,
                            body: .ambassadorsDashboardRejectedBody,
                            tint: ZrpColor.onSurfaceMuted,
                            // The admin's own reason, when there is one.
                            // Somebody re-applying deserves to know what
                            // to change.
                            detail: profile.rejectionReason
                        )
                        applyButton(.ambassadorsDashboardReapplyCta)
                    case .suspended:
                        notice(
                            title: .ambassadorsDashboardSuspendedTitle,
                            body: .ambassadorsDashboardSuspendedBody,
                            tint: ZrpColor.red,
                            detail: profile.suspensionReason
                        )
                    case .approved:
                        approved(profile)
                    case .unknown:
                        // A status this build does not know about. Its
                        // raw value is not shown as a label because it
                        // would read as a claim; the profile details
                        // below are still true.
                        EmptyView()
                    }

                    if viewModel.needsCodeReacceptance {
                        codeOfConductPrompt
                    }

                    details(profile)
                } else {
                    notice(
                        title: .ambassadorsDashboardNotAppliedTitle,
                        body: .ambassadorsDashboardNotAppliedBody,
                        tint: ZrpColor.onSurfaceMuted
                    )
                    applyButton(.ambassadorsDashboardNotAppliedCta)
                }
            }
            .padding(ZrpSpacing.lg)
            .frame(maxWidth: ZrpMetrics.contentMaxWidth, alignment: .leading)
            .frame(maxWidth: .infinity)
        }
        .refreshable { await viewModel.load() }
    }

    // MARK: - Pieces

    private func notice(
        title: L10nKey,
        body: L10nKey,
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

    private func applyButton(_ label: L10nKey) -> some View {
        Button { navigator.push(.ambassadorApply) } label: {
            Text(label)
                .font(.subheadline.weight(.semibold))
                .frame(maxWidth: .infinity)
                .padding(.vertical, ZrpSpacing.md)
                .background(ZrpColor.red)
                .foregroundStyle(.white)
                .clipShape(RoundedRectangle(cornerRadius: ZrpRadius.md, style: .continuous))
        }
        .buttonStyle(.plain)
    }

    private func approved(_ profile: AmbassadorProfile) -> some View {
        VStack(alignment: .leading, spacing: ZrpSpacing.md) {
            HStack(spacing: ZrpSpacing.lg) {
                labelled(.ambassadorsDashboardMyCountry) {
                    Text(verbatim: profile.countryCode)
                        .font(.headline)
                        .foregroundStyle(ZrpColor.onSurface)
                }
                // A level this build has no string for simply shows
                // nothing rather than a placeholder dash, which would
                // read as "no level" - a different and wrong claim.
                if let key = profile.level.titleKey {
                    labelled(.ambassadorsDashboardMyLevel) {
                        Text(key)
                            .font(.headline)
                            .foregroundStyle(ZrpColor.red)
                    }
                }
            }

            if let link = viewModel.invitationLink {
                VStack(alignment: .leading, spacing: ZrpSpacing.xs) {
                    Text(.ambassadorsDashboardMyInvitationLink)
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(ZrpColor.onSurfaceMuted)
                    HStack {
                        Text(verbatim: link)
                            .font(.caption.monospaced())
                            .foregroundStyle(ZrpColor.onSurface)
                            .lineLimit(1)
                            .truncationMode(.middle)
                        Spacer(minLength: ZrpSpacing.sm)
                        Button {
                            UIPasteboard.general.string = link
                            copied = true
                        } label: {
                            Image(systemName: copied ? "checkmark" : "doc.on.doc")
                        }
                        .accessibilityLabel(Text(.ambassadorsDashboardCopyLink))
                    }
                    .padding(ZrpSpacing.sm)
                    .background(ZrpColor.surfaceElevated)
                    .clipShape(RoundedRectangle(cornerRadius: ZrpRadius.sm))
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(ZrpSpacing.md)
        .overlay(
            RoundedRectangle(cornerRadius: ZrpRadius.md, style: .continuous)
                .strokeBorder(ZrpColor.outline, lineWidth: 1)
        )
    }

    private func labelled<Content: View>(
        _ label: L10nKey,
        @ViewBuilder content: () -> Content
    ) -> some View {
        VStack(alignment: .leading, spacing: ZrpSpacing.xs) {
            Text(label)
                .font(.caption)
                .foregroundStyle(ZrpColor.onSurfaceMuted)
            content()
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .accessibilityElement(children: .combine)
    }

    private var codeOfConductPrompt: some View {
        VStack(alignment: .leading, spacing: ZrpSpacing.sm) {
            Text(.ambassadorsDashboardCodeUpdatedTitle)
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(ZrpColor.amber)
            Text(.ambassadorsDashboardCodeUpdatedBody)
                .font(.caption)
                .foregroundStyle(ZrpColor.onSurfaceMuted)
                .fixedSize(horizontal: false, vertical: true)

            Button {
                Task { await viewModel.acceptCode() }
            } label: {
                Text(
                    viewModel.isAccepting
                        ? L10nKey.ambassadorsDashboardCodeAccepting
                        : .ambassadorsDashboardCodeReviewCta
                )
                .font(.caption.weight(.semibold))
            }
            .disabled(viewModel.isAccepting)
            .buttonStyle(.plain)
            .foregroundStyle(ZrpColor.red)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(ZrpSpacing.md)
        .overlay(
            RoundedRectangle(cornerRadius: ZrpRadius.md, style: .continuous)
                .strokeBorder(ZrpColor.amber.opacity(0.5), lineWidth: 1)
        )
    }

    @ViewBuilder
    private func details(_ profile: AmbassadorProfile) -> some View {
        VStack(alignment: .leading, spacing: ZrpSpacing.sm) {
            if let accepted = profile.codeOfConductAcceptedAt {
                HStack {
                    Text(.ambassadorsDashboardCodeAcceptedOn)
                    Spacer(minLength: ZrpSpacing.sm)
                    Text(verbatim: accepted.formatted(date: .abbreviated, time: .omitted))
                }
                .font(.caption)
                .foregroundStyle(ZrpColor.onSurfaceMuted)
            }

            if !profile.languages.isEmpty {
                HStack(alignment: .top) {
                    Text(.ambassadorsApplyFieldLanguages)
                    Spacer(minLength: ZrpSpacing.sm)
                    Text(verbatim: profile.languages.joined(separator: ", "))
                        .multilineTextAlignment(.trailing)
                }
                .font(.caption)
                .foregroundStyle(ZrpColor.onSurfaceMuted)
            }

            if let city = profile.cityRegion, !city.isEmpty {
                HStack {
                    Text(.ambassadorsApplyFieldCityRegion)
                    Spacer(minLength: ZrpSpacing.sm)
                    Text(verbatim: city)
                }
                .font(.caption)
                .foregroundStyle(ZrpColor.onSurfaceMuted)
            }
        }
        .padding(.top, ZrpSpacing.sm)
    }
}
