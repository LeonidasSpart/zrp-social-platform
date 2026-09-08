import SwiftUI

/// Who applied to one of your listings, and what you decided.
///
/// `GET /api/opportunity/{id}/applications` is poster-or-staff only and
/// answers 403 to everyone else. That 403 is shown as the route words
/// it rather than translated into a generic failure - it is the correct
/// answer, not an error, and it says why.
struct OpportunityApplicantsView: View {

    let listingId: String

    @EnvironmentObject private var navigator: Navigator

    @State private var applicants: [OpportunityApplicant] = []
    @State private var cursor: String?
    @State private var phase: Phase = .loading
    @State private var isPaging = false

    private let repository = OpportunityRepository()

    private enum Phase: Equatable {
        case loading
        case loaded
        case failed(ApiError)
    }

    var body: some View {
        Group {
            switch phase {
            case .loading:
                TimelineStateView.loading()
            case .failed(let error):
                TimelineStateView.error(error) { Task { await load() } }
            case .loaded:
                if applicants.isEmpty {
                    TimelineStateView.empty(
                        systemImage: "person.2",
                        title: .opportunityNoApplicantsYet,
                        subtitle: nil
                    )
                } else {
                    list
                }
            }
        }
        .background(ZrpColor.background.ignoresSafeArea())
        .navigationTitle(Text(.opportunityApplicants))
        .navigationBarTitleDisplayMode(.inline)
        .task { await load() }
    }

    private var list: some View {
        ScrollView {
            LazyVStack(spacing: ZrpSpacing.md) {
                ForEach(applicants) { applicant in
                    row(applicant)
                }
                if cursor != nil {
                    ProgressView()
                        .tint(ZrpColor.red)
                        .padding(ZrpSpacing.lg)
                        .task { await page() }
                }
            }
            .padding(ZrpSpacing.lg)
            .frame(maxWidth: ZrpMetrics.contentMaxWidth)
            .frame(maxWidth: .infinity)
        }
        .refreshable { await load() }
    }

    private func row(_ applicant: OpportunityApplicant) -> some View {
        VStack(alignment: .leading, spacing: ZrpSpacing.sm) {
            HStack(alignment: .top, spacing: ZrpSpacing.sm) {
                if let person = applicant.applicant {
                    Button {
                        navigator.push(.profile(username: person.username))
                    } label: {
                        HStack(spacing: ZrpSpacing.sm) {
                            AvatarView(url: person.avatarUrl, displayName: person.displayName, size: 36)
                            VStack(alignment: .leading, spacing: 0) {
                                Text(verbatim: person.displayName)
                                    .font(.subheadline.weight(.semibold))
                                    .foregroundStyle(ZrpColor.onSurface)
                                Text(verbatim: "@" + person.username)
                                    .font(.caption)
                                    .foregroundStyle(ZrpColor.onSurfaceMuted)
                            }
                        }
                    }
                    .buttonStyle(.plain)
                }
                Spacer(minLength: 0)
                if let key = applicant.status.titleKey {
                    Text(key)
                        .font(.caption2.weight(.semibold))
                        .padding(.horizontal, ZrpSpacing.sm)
                        .padding(.vertical, ZrpSpacing.xs)
                        .background(tint(applicant.status).opacity(0.15))
                        .foregroundStyle(tint(applicant.status))
                        .clipShape(Capsule())
                }
            }

            if let note = applicant.coverNote, !note.isEmpty {
                Text(verbatim: note)
                    .font(.footnote)
                    .foregroundStyle(ZrpColor.onSurface)
                    .fixedSize(horizontal: false, vertical: true)
            }

            // Only the three statuses the route lets a listing owner
            // set. WITHDRAWN belongs to the applicant, and offering it
            // here would produce a 403 saying exactly that.
            HStack(spacing: ZrpSpacing.sm) {
                decisionButton(.reviewed, for: applicant, tint: ZrpColor.blue)
                decisionButton(.accepted, for: applicant, tint: ZrpColor.green)
                decisionButton(.rejected, for: applicant, tint: ZrpColor.red)
                Spacer(minLength: 0)
            }
        }
        .padding(ZrpSpacing.md)
        .frame(maxWidth: .infinity, alignment: .leading)
        .overlay(
            RoundedRectangle(cornerRadius: ZrpRadius.md, style: .continuous)
                .strokeBorder(ZrpColor.outline, lineWidth: 1)
        )
    }

    @ViewBuilder
    private func decisionButton(
        _ status: OpportunityApplicationStatus,
        for applicant: OpportunityApplicant,
        tint: Color
    ) -> some View {
        if let key = status.titleKey {
            Button {
                decide(applicant, status)
            } label: {
                Text(key)
                    .font(.caption.weight(.medium))
                    .padding(.horizontal, ZrpSpacing.sm)
                    .padding(.vertical, ZrpSpacing.xs)
                    .overlay(
                        Capsule().strokeBorder(
                            applicant.status == status ? tint : ZrpColor.outline,
                            lineWidth: 1
                        )
                    )
            }
            .buttonStyle(.plain)
            .foregroundStyle(applicant.status == status ? tint : ZrpColor.onSurfaceMuted)
            .disabled(applicant.status == status)
        }
    }

    private func tint(_ status: OpportunityApplicationStatus) -> Color {
        switch status {
        case .pending: return ZrpColor.amber
        case .reviewed: return ZrpColor.blue
        case .accepted: return ZrpColor.green
        case .rejected: return ZrpColor.red
        case .withdrawn, .unknown: return ZrpColor.onSurfaceMuted
        }
    }

    private func decide(_ applicant: OpportunityApplicant, _ status: OpportunityApplicationStatus) {
        Task {
            try? await repository.setApplicationStatus(
                applicationId: applicant.id,
                status: status
            )
            await load()
        }
    }

    private func load() async {
        if applicants.isEmpty { phase = .loading }
        do {
            let page = try await repository.applicants(listingId: listingId, cursor: nil)
            applicants = page.applications
            cursor = page.nextCursor
            phase = .loaded
        } catch ApiError.cancelled {
            return
        } catch {
            if applicants.isEmpty {
                phase = .failed(error as? ApiError ?? .transport(underlying: "\(error)"))
            }
        }
    }

    private func page() async {
        guard let current = cursor, !isPaging else { return }
        isPaging = true
        defer { isPaging = false }
        do {
            let next = try await repository.applicants(listingId: listingId, cursor: current)
            let known = Set(applicants.map(\.id))
            applicants.append(contentsOf: next.applications.filter { !known.contains($0.id) })
            cursor = next.nextCursor
        } catch {
            cursor = nil
        }
    }
}
