import SwiftUI

/// The poster's side of ZRP OPPORTUNITY: listings you posted, and
/// applications you sent.
///
/// Two routes behind one screen because they are two halves of the same
/// question - what have I got going on here. `my-listings` returns your
/// listings in **any** status, which no other route does; the public
/// browse route returns only `ACTIVE`, and the detail route 404s a
/// pending or rejected listing to everyone but its poster.
struct MyOpportunitiesView: View {

    enum Tab: Hashable, CaseIterable {
        case listings
        case applications

        var titleKey: L10nKey {
            switch self {
            case .listings: return .opportunityMyListings
            case .applications: return .opportunityMyApplications
            }
        }
    }

    @EnvironmentObject private var navigator: Navigator

    @State private var tab: Tab = .listings

    @State private var listings: [MyOpportunityListing] = []
    @State private var listingsCursor: String?
    @State private var listingsPhase: Phase = .loading

    @State private var applications: [MyOpportunityApplication] = []
    @State private var applicationsCursor: String?
    @State private var applicationsPhase: Phase = .idle

    @State private var isPaging = false
    @State private var pendingClose: MyOpportunityListing?
    @State private var pendingWithdraw: MyOpportunityApplication?

    private let repository = OpportunityRepository()

    private enum Phase: Equatable {
        case idle
        case loading
        case loaded
        case failed(ApiError)
    }

    var body: some View {
        VStack(spacing: 0) {
            Picker("", selection: $tab) {
                ForEach(Tab.allCases, id: \.self) { option in
                    Text(option.titleKey).tag(option)
                }
            }
            .pickerStyle(.segmented)
            .labelsHidden()
            .padding(ZrpSpacing.lg)

            switch tab {
            case .listings: listingsList
            case .applications: applicationsList
            }
        }
        .background(ZrpColor.background.ignoresSafeArea())
        .navigationTitle(Text(.opportunityMyListings))
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button {
                    navigator.push(.opportunityCompose(listing: nil))
                } label: {
                    Image(systemName: "square.and.pencil")
                }
                .accessibilityLabel(Text(.opportunityPostOpportunity))
            }
        }
        .task { await loadListings() }
        .onChange(of: tab) { _, newValue in
            // The second tab is fetched the first time it is opened, not
            // alongside the first: two requests on arrival would pay for
            // a screen most people never switch away from.
            guard newValue == .applications, applicationsPhase == .idle else { return }
            Task { await loadApplications() }
        }
        .confirmationDialog(
            Text(.opportunityClose),
            isPresented: Binding(
                get: { pendingClose != nil },
                set: { if !$0 { pendingClose = nil } }
            ),
            titleVisibility: .visible
        ) {
            Button(role: .destructive) {
                if let listing = pendingClose { close(listing) }
            } label: {
                Text(.opportunityClose)
            }
            Button(role: .cancel) { pendingClose = nil } label: { Text(.actionCancel) }
        }
        .confirmationDialog(
            Text(.opportunityAppStatusWithdrawn),
            isPresented: Binding(
                get: { pendingWithdraw != nil },
                set: { if !$0 { pendingWithdraw = nil } }
            ),
            titleVisibility: .visible
        ) {
            Button(role: .destructive) {
                if let application = pendingWithdraw { withdraw(application) }
            } label: {
                Text(.opportunityAppStatusWithdrawn)
            }
            Button(role: .cancel) { pendingWithdraw = nil } label: { Text(.actionCancel) }
        }
    }

    // MARK: - Listings

    @ViewBuilder
    private var listingsList: some View {
        switch listingsPhase {
        case .idle, .loading:
            TimelineStateView.loading()
        case .failed(let error):
            TimelineStateView.error(error) { Task { await loadListings() } }
        case .loaded:
            if listings.isEmpty {
                TimelineStateView.empty(
                    systemImage: "briefcase",
                    title: .opportunityNoListingsYet,
                    subtitle: nil
                )
            } else {
                ScrollView {
                    LazyVStack(spacing: ZrpSpacing.md) {
                        ForEach(listings) { listing in
                            listingRow(listing)
                        }
                        if listingsCursor != nil {
                            ProgressView()
                                .tint(ZrpColor.red)
                                .padding(ZrpSpacing.lg)
                                .task { await pageListings() }
                        }
                    }
                    .padding(.horizontal, ZrpSpacing.lg)
                    .padding(.bottom, ZrpSpacing.lg)
                    .frame(maxWidth: ZrpMetrics.contentMaxWidth)
                    .frame(maxWidth: .infinity)
                }
                .refreshable { await loadListings() }
            }
        }
    }

    private func listingRow(_ listing: MyOpportunityListing) -> some View {
        VStack(alignment: .leading, spacing: ZrpSpacing.sm) {
            HStack(alignment: .top, spacing: ZrpSpacing.sm) {
                VStack(alignment: .leading, spacing: ZrpSpacing.xs) {
                    if let typeKey = listing.type.titleKey {
                        Text(typeKey)
                            .font(.caption.weight(.semibold))
                            .foregroundStyle(ZrpColor.onSurfaceMuted)
                    }
                    Text(verbatim: listing.title)
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(ZrpColor.onSurface)
                        .multilineTextAlignment(.leading)
                }
                Spacer(minLength: 0)
                statusChip(listing.status)
            }

            // A moderator's reason, verbatim. It is the only explanation
            // a rejected poster gets, and paraphrasing a moderation
            // decision would be both inaccurate and unkind.
            if let reason = listing.rejectionReason, !reason.isEmpty {
                Text(verbatim: reason)
                    .font(.caption)
                    .foregroundStyle(ZrpColor.red)
                    .fixedSize(horizontal: false, vertical: true)
            }

            HStack(spacing: ZrpSpacing.md) {
                Button {
                    navigator.push(.opportunityApplicants(listingId: listing.id))
                } label: {
                    Label {
                        Text(.opportunityApplicants)
                    } icon: {
                        Image(systemName: "person.2")
                    }
                    .font(.caption)
                }
                .buttonStyle(.plain)
                .foregroundStyle(ZrpColor.red)

                Text(verbatim: CountFormatting.exact(listing.applicationCount))
                    .font(.caption)
                    .foregroundStyle(ZrpColor.onSurfaceMuted)

                Spacer(minLength: 0)

                Button {
                    navigator.push(.opportunityCompose(listing: listing))
                } label: {
                    Text(.opportunityEditListing)
                        .font(.caption)
                }
                .buttonStyle(.plain)
                .foregroundStyle(ZrpColor.red)

                // Offered only while the route would honour it: it
                // accepts CLOSED from the owner only on an ACTIVE
                // listing, and otherwise keeps the status unchanged
                // without erroring. A button that silently does nothing
                // is worse than no button.
                if listing.canClose {
                    Button { pendingClose = listing } label: {
                        Text(.opportunityClose)
                            .font(.caption)
                    }
                    .buttonStyle(.plain)
                    .foregroundStyle(ZrpColor.onSurfaceMuted)
                }
            }
        }
        .padding(ZrpSpacing.md)
        .frame(maxWidth: .infinity, alignment: .leading)
        .overlay(
            RoundedRectangle(cornerRadius: ZrpRadius.md, style: .continuous)
                .strokeBorder(ZrpColor.outline, lineWidth: 1)
        )
    }

    // MARK: - Applications

    @ViewBuilder
    private var applicationsList: some View {
        switch applicationsPhase {
        case .idle, .loading:
            TimelineStateView.loading()
        case .failed(let error):
            TimelineStateView.error(error) { Task { await loadApplications() } }
        case .loaded:
            if applications.isEmpty {
                TimelineStateView.empty(
                    systemImage: "paperplane",
                    title: .opportunityNoApplicationsYet,
                    subtitle: nil
                )
            } else {
                ScrollView {
                    LazyVStack(spacing: ZrpSpacing.md) {
                        ForEach(applications) { application in
                            applicationRow(application)
                        }
                        if applicationsCursor != nil {
                            ProgressView()
                                .tint(ZrpColor.red)
                                .padding(ZrpSpacing.lg)
                                .task { await pageApplications() }
                        }
                    }
                    .padding(.horizontal, ZrpSpacing.lg)
                    .padding(.bottom, ZrpSpacing.lg)
                    .frame(maxWidth: ZrpMetrics.contentMaxWidth)
                    .frame(maxWidth: .infinity)
                }
                .refreshable { await loadApplications() }
            }
        }
    }

    private func applicationRow(_ application: MyOpportunityApplication) -> some View {
        VStack(alignment: .leading, spacing: ZrpSpacing.sm) {
            HStack(alignment: .top, spacing: ZrpSpacing.sm) {
                VStack(alignment: .leading, spacing: ZrpSpacing.xs) {
                    Text(verbatim: application.listing.title)
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(ZrpColor.onSurface)
                        .multilineTextAlignment(.leading)
                    if let organization = application.listing.organizationName,
                       !organization.isEmpty {
                        Text(verbatim: organization)
                            .font(.caption)
                            .foregroundStyle(ZrpColor.onSurfaceMuted)
                    }
                }
                Spacer(minLength: 0)
                applicationStatusChip(application.status)
            }

            if let note = application.coverNote, !note.isEmpty {
                Text(verbatim: note)
                    .font(.caption)
                    .foregroundStyle(ZrpColor.onSurfaceMuted)
                    .lineLimit(3)
                    .fixedSize(horizontal: false, vertical: true)
            }

            HStack(spacing: ZrpSpacing.md) {
                Button {
                    navigator.push(.opportunityDetail(id: application.listing.id))
                } label: {
                    Text(.opportunityBackToListing)
                        .font(.caption)
                }
                .buttonStyle(.plain)
                .foregroundStyle(ZrpColor.red)

                Spacer(minLength: 0)

                // WITHDRAWN is the only status the route lets an
                // applicant set, and only on their own application.
                // Nothing else is offered here, so the 403 explaining
                // that rule is never how anyone learns it.
                if application.canWithdraw {
                    Button { pendingWithdraw = application } label: {
                        Text(.opportunityAppStatusWithdrawn)
                            .font(.caption)
                    }
                    .buttonStyle(.plain)
                    .foregroundStyle(ZrpColor.onSurfaceMuted)
                }
            }
        }
        .padding(ZrpSpacing.md)
        .frame(maxWidth: .infinity, alignment: .leading)
        .overlay(
            RoundedRectangle(cornerRadius: ZrpRadius.md, style: .continuous)
                .strokeBorder(ZrpColor.outline, lineWidth: 1)
        )
    }

    // MARK: - Chips

    @ViewBuilder
    private func statusChip(_ status: OpportunityStatus) -> some View {
        if let key = status.titleKey {
            chip(key, tint: statusTint(status))
        }
    }

    @ViewBuilder
    private func applicationStatusChip(_ status: OpportunityApplicationStatus) -> some View {
        if let key = status.titleKey {
            chip(key, tint: applicationStatusTint(status))
        }
    }

    private func chip(_ key: L10nKey, tint: Color) -> some View {
        Text(key)
            .font(.caption2.weight(.semibold))
            .padding(.horizontal, ZrpSpacing.sm)
            .padding(.vertical, ZrpSpacing.xs)
            .background(tint.opacity(0.15))
            .foregroundStyle(tint)
            .clipShape(Capsule())
    }

    /// The same meanings the website's own STATUS_STYLES assigns -
    /// amber for waiting, green for live, red for refused, muted for
    /// over - rather than a new colour language invented here.
    private func statusTint(_ status: OpportunityStatus) -> Color {
        switch status {
        case .pendingReview: return ZrpColor.amber
        case .active: return ZrpColor.green
        case .rejected, .removed: return ZrpColor.red
        case .closed: return ZrpColor.blue
        case .expired, .unknown: return ZrpColor.onSurfaceMuted
        }
    }

    private func applicationStatusTint(_ status: OpportunityApplicationStatus) -> Color {
        switch status {
        case .pending: return ZrpColor.amber
        case .reviewed: return ZrpColor.blue
        case .accepted: return ZrpColor.green
        case .rejected: return ZrpColor.red
        case .withdrawn, .unknown: return ZrpColor.onSurfaceMuted
        }
    }

    // MARK: - Loading

    private func loadListings() async {
        if listings.isEmpty { listingsPhase = .loading }
        do {
            let page = try await repository.myListings(cursor: nil)
            listings = page.listings
            listingsCursor = page.nextCursor
            listingsPhase = .loaded
        } catch ApiError.cancelled {
            return
        } catch {
            if listings.isEmpty {
                listingsPhase = .failed(error as? ApiError ?? .transport(underlying: "\(error)"))
            }
        }
    }

    private func pageListings() async {
        guard let cursor = listingsCursor, !isPaging else { return }
        isPaging = true
        defer { isPaging = false }
        do {
            let page = try await repository.myListings(cursor: cursor)
            let known = Set(listings.map(\.id))
            listings.append(contentsOf: page.listings.filter { !known.contains($0.id) })
            listingsCursor = page.nextCursor
        } catch {
            // A failed page must not clear what is already on screen, but
            // it must stop the spinner asking for the same page forever.
            listingsCursor = nil
        }
    }

    private func loadApplications() async {
        if applications.isEmpty { applicationsPhase = .loading }
        do {
            let page = try await repository.myApplications(cursor: nil)
            applications = page.applications
            applicationsCursor = page.nextCursor
            applicationsPhase = .loaded
        } catch ApiError.cancelled {
            return
        } catch {
            if applications.isEmpty {
                applicationsPhase = .failed(
                    error as? ApiError ?? .transport(underlying: "\(error)")
                )
            }
        }
    }

    private func pageApplications() async {
        guard let cursor = applicationsCursor, !isPaging else { return }
        isPaging = true
        defer { isPaging = false }
        do {
            let page = try await repository.myApplications(cursor: cursor)
            let known = Set(applications.map(\.id))
            applications.append(contentsOf: page.applications.filter { !known.contains($0.id) })
            applicationsCursor = page.nextCursor
        } catch {
            applicationsCursor = nil
        }
    }

    // MARK: - Actions

    private func close(_ listing: MyOpportunityListing) {
        pendingClose = nil
        Task {
            // Refetched rather than patched locally: the route decides
            // the resulting status (it keeps the existing one when the
            // listing is not ACTIVE), so assuming CLOSED here could
            // show a state the server never entered.
            try? await repository.close(id: listing.id)
            await loadListings()
        }
    }

    private func withdraw(_ application: MyOpportunityApplication) {
        pendingWithdraw = nil
        Task {
            try? await repository.setApplicationStatus(
                applicationId: application.id,
                status: .withdrawn
            )
            await loadApplications()
        }
    }
}
