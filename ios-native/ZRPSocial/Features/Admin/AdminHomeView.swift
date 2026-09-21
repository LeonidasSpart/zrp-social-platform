import SwiftUI

@MainActor
final class AdminHomeViewModel: ObservableObject {

    @Published private(set) var stats: AdminStats?

    private let repository: AdminRepositoryProtocol

    init(repository: AdminRepositoryProtocol = AdminRepository()) {
        self.repository = repository
    }

    /// Stat-grid load failures are shown nowhere - this is a convenience
    /// summary, not a screen whose job is these numbers. Every section
    /// below reads for itself and shows its own error state if staff
    /// access has actually been lost.
    func load() async {
        guard stats == nil else { return }
        stats = try? await repository.stats()
    }

    func refresh() async {
        stats = try? await repository.stats()
    }
}

/// The staff admin console's landing screen - the native answer to
/// `/admin` (`src/app/admin/page.tsx`) and to Android's
/// `AdminDashboardScreen`.
///
/// **Phase 1**: four sections (Users, Reports, Appeals, Posts), the
/// content-moderation core every staff role (`requireStaff` - ADMIN or
/// MODERATOR) can already reach on web. The other ~20 admin sections
/// (financial queues, the review queues for Ads/Marketplace/Opportunity/
/// HELP/Journalists/Music, Support Tickets, News, Ambassadors, the audit
/// log, analytics, storage cleanup) stay web-only for now - see
/// `ios-native/PARITY.md`.
///
/// Reachability here is a UI convenience, not the access boundary: this
/// screen itself is only reachable from `ZrpMenuView`'s gated row, and
/// every section it links to re-asks its own route for `requireStaff`/
/// `requireAdmin` regardless of how somebody got here.
struct AdminHomeView: View {

    @StateObject private var viewModel = AdminHomeViewModel()

    var body: some View {
        List {
            if let stats = viewModel.stats {
                Section {
                    statGrid(stats)
                        .listRowInsets(EdgeInsets())
                        .listRowBackground(Color.clear)
                        .listRowSeparator(.hidden)
                }
            }

            Section {
                NavigationLink(value: Route.adminUsers) {
                    Label { Text(verbatim: "Users") } icon: { Image(systemName: "person.2.badge.gearshape") }
                }
                NavigationLink(value: Route.adminReports) {
                    HStack {
                        Label { Text(verbatim: "Reports") } icon: { Image(systemName: "flag") }
                        Spacer(minLength: ZrpSpacing.sm)
                        if let pending = viewModel.stats?.pendingReports, pending > 0 {
                            Text(verbatim: CountFormatting.badge(pending))
                                .font(.caption2.weight(.bold))
                                .foregroundStyle(.white)
                                .padding(.horizontal, 6)
                                .padding(.vertical, 2)
                                .background(Capsule().fill(ZrpColor.red))
                        }
                    }
                }
                NavigationLink(value: Route.adminAppeals) {
                    Label { Text(verbatim: "Appeals") } icon: { Image(systemName: "scalemass") }
                }
                NavigationLink(value: Route.adminPosts) {
                    Label { Text(verbatim: "Posts") } icon: { Image(systemName: "doc.text.magnifyingglass") }
                }
            } header: {
                Text(verbatim: "Moderation")
            }

            Section {
                NavigationLink(value: Route.adminAds) {
                    Label { Text(verbatim: "Ads") } icon: { Image(systemName: "megaphone") }
                }
                NavigationLink(value: Route.adminMarketplace) {
                    Label { Text(verbatim: "Marketplace") } icon: { Image(systemName: "bag") }
                }
                NavigationLink(value: Route.adminOpportunity) {
                    Label { Text(verbatim: "Opportunity") } icon: { Image(systemName: "briefcase") }
                }
                NavigationLink(value: Route.adminHelpCampaigns) {
                    Label { Text(verbatim: "HELP campaigns") } icon: { Image(systemName: "heart") }
                }
            } header: {
                Text(verbatim: "Review queues")
            }

            Section {
                NavigationLink(value: Route.adminWithdrawals) {
                    Label { Text(verbatim: "Creator withdrawals") } icon: { Image(systemName: "banknote") }
                }
                NavigationLink(value: Route.adminHelpWithdrawals) {
                    Label { Text(verbatim: "HELP withdrawals") } icon: { Image(systemName: "banknote") }
                }
            } header: {
                Text(verbatim: "Payouts")
            } footer: {
                Text(verbatim: "Approving a payout sends a real on-chain USDC transfer.")
            }

            Section {
                NavigationLink(value: Route.adminJournalists) {
                    Label { Text(verbatim: "Journalists") } icon: { Image(systemName: "newspaper") }
                }
                NavigationLink(value: Route.adminAmbassadors) {
                    Label { Text(verbatim: "Ambassadors") } icon: { Image(systemName: "globe") }
                }
                NavigationLink(value: Route.adminMusicArtists) {
                    Label { Text(verbatim: "Music artists") } icon: { Image(systemName: "music.mic") }
                }
            } header: {
                Text(verbatim: "People")
            }

            Section {
                NavigationLink(value: Route.adminSupportTickets) {
                    Label { Text(verbatim: "Support tickets") } icon: { Image(systemName: "lifepreserver") }
                }
                NavigationLink(value: Route.adminAnalytics) {
                    Label { Text(verbatim: "Analytics") } icon: { Image(systemName: "chart.bar") }
                }
                NavigationLink(value: Route.adminAuditLog) {
                    Label { Text(verbatim: "Audit log") } icon: { Image(systemName: "clock.arrow.circlepath") }
                }
                NavigationLink(value: Route.adminCharityDisbursements) {
                    Label { Text(verbatim: "Charity disbursements") } icon: { Image(systemName: "heart.circle") }
                }
                NavigationLink(value: Route.adminSubscriptions) {
                    Label { Text(verbatim: "Subscriptions & Billing") } icon: { Image(systemName: "creditcard") }
                }
                NavigationLink(value: Route.adminStorageCleanup) {
                    Label { Text(verbatim: "Storage cleanup") } icon: { Image(systemName: "externaldrive.badge.minus") }
                }
            } header: {
                Text(verbatim: "Ops")
            } footer: {
                // Deliberately explains itself rather than pretending to
                // be the entire web admin console - see this view's own
                // doc comment for the exact list of what is still absent.
                Text(verbatim: "Every action here re-checks your role on the server. News CMS and News Network automation remain web-only for now.")
            }
        }
        .listStyle(.insetGrouped)
        .scrollContentBackground(.hidden)
        .background(ZrpColor.background.ignoresSafeArea())
        .navigationTitle(Text(verbatim: "Admin Console"))
        .navigationBarTitleDisplayMode(.inline)
        .task { await viewModel.load() }
        .refreshable { await viewModel.refresh() }
    }

    private func statGrid(_ stats: AdminStats) -> some View {
        let cards: [(String, Int)] = [
            ("Users", stats.users),
            ("Posts", stats.posts),
            ("Comments", stats.comments),
            ("Reports", stats.reports),
            ("Pending reports", stats.pendingReports),
            ("Admins", stats.admins),
            ("Moderators", stats.moderators),
        ]
        return LazyVGrid(
            columns: [GridItem(.flexible()), GridItem(.flexible())],
            spacing: ZrpSpacing.md
        ) {
            ForEach(cards, id: \.0) { label, value in
                VStack(alignment: .leading, spacing: 2) {
                    Text(verbatim: CountFormatting.exact(value))
                        .font(.title3.weight(.bold))
                        .foregroundStyle(ZrpColor.red)
                    Text(verbatim: label)
                        .font(.caption)
                        .foregroundStyle(ZrpColor.onSurfaceMuted)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(ZrpSpacing.md)
                .background(ZrpColor.surfaceElevated, in: RoundedRectangle(cornerRadius: 16))
            }
        }
        .padding(.horizontal, ZrpSpacing.lg)
        .padding(.vertical, ZrpSpacing.md)
    }
}
