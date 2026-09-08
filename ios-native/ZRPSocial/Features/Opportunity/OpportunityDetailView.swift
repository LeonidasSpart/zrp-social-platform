import SwiftUI

@MainActor
final class OpportunityDetailViewModel: ObservableObject {

    enum Phase: Equatable {
        case loading
        case loaded(Opportunity)
        case failed(ApiError)
    }

    @Published private(set) var phase: Phase = .loading
    @Published private(set) var hasApplied = false
    @Published private(set) var isBusy = false
    @Published var notice: String?

    /// Whether this listing is saved - or `nil` for "not known".
    ///
    /// Seeded from the detail route's own `alreadySaved`, which it began
    /// reporting in PR #150. Before that no route reported saved state
    /// at all, and this app deliberately showed an indeterminate control
    /// rather than claiming "not saved" - a claim about the server it
    /// had no way to make.
    ///
    /// It stays optional because the answer can still be genuinely
    /// unknown: the route omits the field for a signed-out viewer, who
    /// has nothing saved and no way to save it.
    @Published private(set) var isSaved: Bool?

    private let listingId: String
    private let repository: OpportunityRepositoryProtocol

    init(listingId: String, repository: OpportunityRepositoryProtocol = OpportunityRepository()) {
        self.listingId = listingId
        self.repository = repository
    }

    func load() async {
        do {
            let listing = try await repository.listing(id: listingId)
            hasApplied = listing.alreadyApplied ?? false
            isSaved = listing.alreadySaved
            phase = .loaded(listing)
        } catch {
            if case .loaded = phase { return }
            phase = .failed(error as? ApiError ?? .transport(underlying: "\(error)"))
        }
    }

    func apply(coverNote: String) async -> Bool {
        guard !isBusy else { return false }
        isBusy = true
        defer { isBusy = false }

        do {
            try await repository.apply(id: listingId, coverNote: coverNote)
            hasApplied = true
            notice = L10n.string(.opportunityApplicationSent)
            return true
        } catch let error as ApiError {
            // The route distinguishes "already applied", "your own
            // listing" and "cover note too long", each with its own
            // message. They are shown as written.
            notice = error.userFacingMessage
            return false
        } catch {
            notice = L10n.string(.opportunityErrApplyFailed)
            return false
        }
    }

    func toggleSaved() async {
        guard !isBusy else { return }
        isBusy = true
        defer { isBusy = false }

        do {
            isSaved = try await repository.setSaved(id: listingId, saved: !(isSaved ?? false))
        } catch let error as ApiError {
            notice = error.userFacingMessage
        } catch {
            notice = L10n.string(.authErrTryAgain)
        }
    }
}

/// One opportunity.
struct OpportunityDetailView: View {

    @EnvironmentObject private var session: SessionController
    @EnvironmentObject private var navigator: Navigator
    @Environment(\.openURL) private var openURL

    @StateObject private var viewModel: OpportunityDetailViewModel
    @State private var isApplying = false

    init(listingId: String) {
        _viewModel = StateObject(
            wrappedValue: OpportunityDetailViewModel(listingId: listingId)
        )
    }

    var body: some View {
        Group {
            switch viewModel.phase {
            case .loading:
                TimelineStateView.loading()
            case .failed(let error):
                TimelineStateView.error(error) {
                    Task { await viewModel.load() }
                }
            case .loaded(let listing):
                detail(listing)
            }
        }
        .background(ZrpColor.background.ignoresSafeArea())
        .navigationTitle(Text(.navOpportunity))
        .navigationBarTitleDisplayMode(.inline)
        .task { await viewModel.load() }
        .sheet(isPresented: $isApplying) {
            ApplySheet { note in await viewModel.apply(coverNote: note) }
        }
        .alert(
            Text(.iosErrorGenericTitle),
            isPresented: Binding(
                get: { viewModel.notice != nil },
                set: { if !$0 { viewModel.notice = nil } }
            )
        ) {
            Button { viewModel.notice = nil } label: { Text(.actionCancel) }
        } message: {
            Text(verbatim: viewModel.notice ?? "")
        }
    }

    private func detail(_ listing: Opportunity) -> some View {
        ScrollView {
            VStack(alignment: .leading, spacing: ZrpSpacing.md) {
                HStack(spacing: ZrpSpacing.sm) {
                    if let key = listing.type.titleKey {
                        Text(key)
                            .font(.caption.weight(.semibold))
                            .foregroundStyle(ZrpColor.red)
                    }
                    if listing.remote == true {
                        Text(.opportunityRemote)
                            .font(.caption)
                            .foregroundStyle(ZrpColor.onSurfaceMuted)
                    }
                    Spacer(minLength: 0)
                    saveButton
                }

                Text(verbatim: listing.title)
                    .font(.title3.weight(.bold))
                    .foregroundStyle(ZrpColor.onSurface)
                    .fixedSize(horizontal: false, vertical: true)

                if let organization = listing.organizationName, !organization.isEmpty {
                    Text(verbatim: organization)
                        .font(.subheadline)
                        .foregroundStyle(ZrpColor.onSurfaceMuted)
                }

                facts(listing)
                skills(listing)

                if let description = listing.description, !description.isEmpty {
                    Text(verbatim: description)
                        .font(.body)
                        .foregroundStyle(ZrpColor.onSurface)
                        .fixedSize(horizontal: false, vertical: true)
                        .textSelection(.enabled)
                }

                if let poster = listing.poster {
                    Button {
                        navigator.push(.profile(username: poster.username))
                    } label: {
                        HStack(spacing: ZrpSpacing.xs) {
                            AvatarView(
                                url: poster.avatarUrl,
                                displayName: poster.displayName,
                                size: ZrpMetrics.avatarSmall
                            )
                            Text(verbatim: poster.displayName)
                                .font(.footnote.weight(.semibold))
                                .foregroundStyle(ZrpColor.onSurface)
                            VerifiedBadge(badgeType: poster.badgeType)
                        }
                    }
                    .buttonStyle(.plain)
                }

                applyControl(listing)
            }
            .padding(ZrpSpacing.lg)
            .frame(maxWidth: ZrpMetrics.contentMaxWidth)
            .frame(maxWidth: .infinity)
        }
    }

    @ViewBuilder
    private func facts(_ listing: Opportunity) -> some View {
        VStack(alignment: .leading, spacing: ZrpSpacing.xs) {
            if let location = listing.location, !location.isEmpty {
                fact(.opportunityLocationLabel, value: location)
            }
            if let compensation = listing.compensationInfo, !compensation.isEmpty {
                fact(.opportunityCompensationLabel, value: compensation)
            }
            if let deadline = listing.deadline {
                fact(
                    .opportunityDeadlineLabel,
                    value: deadline.formatted(date: .abbreviated, time: .omitted)
                )
            }
        }
        .font(.footnote)
        .foregroundStyle(ZrpColor.onSurfaceMuted)
    }

    private func fact(_ key: L10nKey, value: String) -> some View {
        HStack(alignment: .top, spacing: ZrpSpacing.xs) {
            Text(key).fontWeight(.semibold)
            Text(verbatim: value)
        }
    }

    @ViewBuilder
    private func skills(_ listing: Opportunity) -> some View {
        if let skills = listing.skills, !skills.isEmpty {
            VStack(alignment: .leading, spacing: ZrpSpacing.xs) {
                Text(.opportunitySkillsLabel)
                    .font(.footnote.weight(.semibold))
                    .foregroundStyle(ZrpColor.onSurfaceMuted)

                // A wrapping row of chips. `Layout` would be the tidy way
                // to do this, but SwiftUI has no built-in flow layout and
                // a hand-written one is a lot of geometry for a list of
                // words - a lazy grid with adaptive columns wraps the same
                // way with none of it.
                LazyVGrid(
                    columns: [GridItem(.adaptive(minimum: 72), spacing: ZrpSpacing.xs)],
                    alignment: .leading,
                    spacing: ZrpSpacing.xs
                ) {
                    ForEach(skills, id: \.self) { skill in
                        Text(verbatim: skill)
                            .font(.caption2)
                            .foregroundStyle(ZrpColor.onSurface)
                            .lineLimit(1)
                            .padding(.horizontal, ZrpSpacing.sm)
                            .padding(.vertical, 3)
                            .frame(maxWidth: .infinity)
                            .background(ZrpColor.surfaceElevated, in: Capsule())
                    }
                }
            }
        }
    }

    private var saveButton: some View {
        Button {
            Task { await viewModel.toggleSaved() }
        } label: {
            Image(systemName: viewModel.isSaved == true ? "bookmark.fill" : "bookmark")
                .foregroundStyle(viewModel.isSaved == true ? ZrpColor.red : ZrpColor.onSurfaceMuted)
                .frame(width: ZrpMetrics.minTouchTarget, height: ZrpMetrics.minTouchTarget)
        }
        .buttonStyle(.plain)
        .disabled(viewModel.isBusy || session.currentUser == nil)
        .accessibilityLabel(Text(.opportunitySave))
    }

    /// Applying, or the reason there is no button.
    ///
    /// A listing with an external link is applied to on somebody else's
    /// site - the route stores that link precisely so ZRP does not collect
    /// the application - so the control opens it rather than posting one.
    @ViewBuilder
    private func applyControl(_ listing: Opportunity) -> some View {
        if session.currentUser == nil {
            note(.opportunityLoginToApply)
        } else if viewModel.hasApplied {
            note(.opportunityAlreadyApplied)
        } else if let external = listing.externalUrl,
                  let url = URL(string: external) {
            Button {
                openURL(url)
            } label: {
                primaryLabel(.opportunityApplyExternally)
            }
            .buttonStyle(.plain)
        } else {
            Button {
                isApplying = true
            } label: {
                primaryLabel(.opportunityApply)
            }
            .buttonStyle(.plain)
        }
    }

    private func primaryLabel(_ key: L10nKey) -> some View {
        Text(key)
            .font(.subheadline.weight(.semibold))
            .foregroundStyle(.white)
            .frame(maxWidth: .infinity)
            .frame(minHeight: ZrpMetrics.minTouchTarget)
            .background(ZrpColor.red)
            .clipShape(RoundedRectangle(cornerRadius: ZrpRadius.md, style: .continuous))
    }

    private func note(_ key: L10nKey) -> some View {
        Text(key)
            .font(.footnote)
            .foregroundStyle(ZrpColor.onSurfaceMuted)
            .frame(maxWidth: .infinity, alignment: .center)
            .padding(ZrpSpacing.md)
            .background(ZrpColor.surfaceElevated)
            .clipShape(RoundedRectangle(cornerRadius: ZrpRadius.md, style: .continuous))
    }
}

/// The cover note.
private struct ApplySheet: View {

    let onSend: (String) async -> Bool

    @Environment(\.dismiss) private var dismiss
    @State private var note = ""
    @State private var isSending = false

    /// The route caps the cover note at 3000 characters and accepts an
    /// empty one, so this only prevents a request that could only fail.
    private var canSend: Bool {
        !isSending && note.count <= 3000
    }

    var body: some View {
        NavigationStack {
            VStack(alignment: .leading, spacing: ZrpSpacing.lg) {
                Text(.opportunityCoverNoteLabel)
                    .font(.footnote.weight(.semibold))
                    .foregroundStyle(ZrpColor.onSurfaceMuted)

                TextField(
                    L10n.string(.opportunityCoverNotePlaceholder),
                    text: $note,
                    axis: .vertical
                )
                .font(.body)
                .lineLimit(5...14)
                .padding(ZrpSpacing.md)
                .background(ZrpColor.surfaceElevated)
                .clipShape(RoundedRectangle(cornerRadius: ZrpRadius.md, style: .continuous))

                Spacer()
            }
            .padding(ZrpSpacing.lg)
            .background(ZrpColor.background.ignoresSafeArea())
            .navigationTitle(Text(.opportunityApplyTitle))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button { dismiss() } label: { Text(.actionCancel) }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button {
                        isSending = true
                        Task {
                            let sent = await onSend(note)
                            isSending = false
                            if sent { dismiss() }
                        }
                    } label: {
                        Text(isSending
                            ? L10nKey.opportunitySubmitting
                            : L10nKey.opportunitySubmitApplication)
                            .font(.subheadline.weight(.semibold))
                    }
                    .disabled(!canSend)
                }
            }
        }
        .presentationDetents([.medium, .large])
    }
}
