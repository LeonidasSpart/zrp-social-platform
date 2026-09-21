import SwiftUI

/// One row of the navigation menu.
///
/// A value rather than a view so the same description drives the phone's
/// drawer and the iPad's permanent sidebar without either of them
/// re-stating the destination list.
struct MenuEntry: Identifiable, Hashable {

    /// Where the row goes. `nil` for the rows that select a tab rather
    /// than push a screen - Home has no `Route` because it *is* the root
    /// of a stack, not something pushed onto one.
    let route: Route?
    let tab: MainTab?
    let titleKey: L10nKey?
    /// A literal title, used instead of `titleKey` for the one row (Admin
    /// Console) that has no entry in ZRP's shared translation dictionary -
    /// see `ZrpMenu`'s own doc comment for why that row is English-only.
    /// Exactly one of `titleKey`/`titleVerbatim` is non-nil.
    let titleVerbatim: String?
    let systemImage: String

    var id: String { titleKey?.rawValue ?? titleVerbatim ?? systemImage }

    /// The row's rendered title. Equivalent to `Text(titleKey)` for a
    /// key-based entry - `Text(_:L10nKey)` itself resolves to
    /// `Text(verbatim: L10n.string(key))`, so routing every entry through
    /// this one property changes nothing about what a localized row shows.
    var title: String { titleKey.map(L10n.string) ?? titleVerbatim ?? "" }

    init(
        _ titleKey: L10nKey,
        systemImage: String,
        route: Route? = nil,
        tab: MainTab? = nil
    ) {
        self.titleKey = titleKey
        self.titleVerbatim = nil
        self.systemImage = systemImage
        self.route = route
        self.tab = tab
    }

    /// For a row with no localized copy to borrow - see `titleVerbatim`.
    init(
        verbatim title: String,
        systemImage: String,
        route: Route? = nil,
        tab: MainTab? = nil
    ) {
        self.titleKey = nil
        self.titleVerbatim = title
        self.systemImage = systemImage
        self.route = route
        self.tab = tab
    }
}

struct MenuSection: Identifiable {
    /// `nil` for the first group, which needs no heading: it sits
    /// directly under the account row and is obviously the main list.
    let headingKey: L10nKey?
    let entries: [MenuEntry]

    var id: String { headingKey?.rawValue ?? "_primary" }
}

/// Everywhere the menu can go.
///
/// This is the iOS answer to the web sidebar, and it is built from the
/// same inventory: every destination the website offers a signed-in
/// person, minus the ones this app deliberately does not carry.
///
/// What is **not** here, and why:
/// - **Admin** - phase 1 only. `.adminHome` (below, in `navMore`, gated to
///   MODERATOR/ADMIN) covers Users, Reports, Appeals and Posts. The other
///   ~35 admin routes (Ads, Marketplace, Opportunity, HELP, Payments,
///   Analytics, Music verification, Support tickets, News, Ambassadors,
///   the audit log, and more) stay web-only for now - see
///   `ios-native/PARITY.md`'s admin section for the exact remaining list.
/// - **Premium / Pricing** - a purchase surface. `/pricing` renders
///   upgrade buttons and a crypto payment modal, which App Store policy
///   does not allow in an app that takes payment outside it. The same
///   rule already keeps tips and premium posts off iOS.
enum ZrpMenu {

    static let sections: [MenuSection] = {
        [
            // The five places the bottom bar and the bell already reach.
            // Repeated here on purpose: the menu is meant to be a map of
            // the whole app, and a map with holes in it sends people
            // hunting for the things it left out.
            MenuSection(headingKey: nil, entries: [
                MenuEntry(.navHome, systemImage: "house", tab: .home),
                MenuEntry(.navSearch, systemImage: "magnifyingglass", tab: .search),
                // Search and Explore are two different pages on the web -
                // one is a query box, the other a browse surface - and
                // they stay two here rather than being collapsed into
                // whichever the tab happens to host.
                MenuEntry(.navExplore, systemImage: "safari", route: .explore),
                MenuEntry(.navNotifications, systemImage: "bell", route: .notifications),
                MenuEntry(.navMessages, systemImage: "envelope", tab: .messages),
                MenuEntry(.navBookmarks, systemImage: "bookmark", route: .bookmarks),
                MenuEntry(.navLists, systemImage: "list.bullet", route: .lists),
                MenuEntry(.navProfile, systemImage: "person", tab: .profile),
            ]),

            // The verticals. Every one of these was reachable only
            // through an overflow menu behind Home's toolbar before now.
            MenuSection(headingKey: .navPlatform, entries: [
                MenuEntry(.navShorts, systemImage: "play.rectangle", route: .shorts(startId: nil)),
                MenuEntry(.navNews, systemImage: "newspaper", route: .news),
                MenuEntry(.navMusic, systemImage: "music.note", route: .music),
                MenuEntry(.navCommunities, systemImage: "person.3", route: .communities),
                MenuEntry(.navPlay, systemImage: "gamecontroller", route: .play),
                MenuEntry(.navMarketplace, systemImage: "bag", route: .marketplace),
                MenuEntry(.navOpportunity, systemImage: "briefcase", route: .opportunity),
                MenuEntry(.navHelp, systemImage: "heart", route: .aid),
                MenuEntry(.ambassadorsNavLabel, systemImage: "globe", route: .ambassadors),
            ]),

            // Tools that belong to the person rather than to the feed.
            // Team and API keys answer a 403 for a Free or Pro account
            // and each screen says so in the route's own words, which is
            // why they are listed rather than hidden on a plan guess the
            // client would sometimes get wrong.
            MenuSection(headingKey: .navMore, entries: [
                MenuEntry(.navCreatorStudio, systemImage: "chart.bar", route: .creatorStudio),
                MenuEntry(.musicShellStudioLabel, systemImage: "waveform", route: .musicStudio),
                MenuEntry(.navAiAssistant, systemImage: "sparkles", route: .aiChat),
                MenuEntry(.navJournalistDashboard, systemImage: "pencil.and.outline", route: .journalistDashboard),
                MenuEntry(.navTeamManagement, systemImage: "person.2", route: .team),
                MenuEntry(.navApiKeys, systemImage: "key", route: .apiKeys),
                MenuEntry(.footerCharity, systemImage: "heart.circle", route: .charityTransparency),
                MenuEntry(.footerTransparency, systemImage: "checkmark.shield", route: .moderationTransparency),
                // Filtered out in `ZrpMenuView.visibleSections` for anyone
                // whose session role is not MODERATOR/ADMIN - a UI
                // convenience only, see `CurrentUser.isStaff`.
                MenuEntry(verbatim: "Admin Console", systemImage: "lock.shield", route: .adminHome),
            ]),

            MenuSection(headingKey: .navAccount, entries: [
                MenuEntry(.navSettings, systemImage: "gearshape", route: .settings),
                MenuEntry(.footerMyTickets, systemImage: "lifepreserver", route: .supportTickets),
            ]),
        ]
    }()
}

/// The navigation menu's contents.
///
/// Rendered as a sliding drawer on iPhone and as a permanent sidebar on
/// iPad - see `DrawerContainer`. This view knows nothing about which:
/// it draws rows and calls `onSelect`.
struct ZrpMenuView: View {

    @EnvironmentObject private var session: SessionController
    @EnvironmentObject private var router: AppRouter
    @EnvironmentObject private var unread: UnreadBadgeViewModel

    /// `nil` on iPad, where the sidebar is always visible and a close
    /// button would be a control that does nothing anyone wants.
    var onClose: (() -> Void)? = nil

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            header
            Divider().overlay(ZrpColor.outline)

            ScrollView {
                LazyVStack(alignment: .leading, spacing: 0) {
                    ForEach(visibleSections) { section in
                        if let heading = section.headingKey {
                            Text(heading)
                                .font(.footnote.weight(.semibold))
                                .foregroundStyle(ZrpColor.onSurfaceMuted)
                                .textCase(.uppercase)
                                .padding(.horizontal, ZrpSpacing.lg)
                                .padding(.top, ZrpSpacing.lg)
                                .padding(.bottom, ZrpSpacing.xs)
                                .accessibilityAddTraits(.isHeader)
                        }
                        ForEach(section.entries) { entry in
                            row(entry)
                        }
                    }
                }
                .padding(.bottom, ZrpSpacing.lg)
            }

            Divider().overlay(ZrpColor.outline)
            footer
        }
        .background(ZrpColor.surface)
        .foregroundStyle(ZrpColor.onSurface)
    }

    /// `ZrpMenu.sections` with the Admin Console row dropped for anyone
    /// who is not signed in as MODERATOR/ADMIN, and any section left
    /// empty by that removed entirely rather than rendering a bare
    /// heading over nothing.
    ///
    /// This is the *only* place that row is hidden - not a security
    /// boundary, see `CurrentUser.isStaff`.
    private var visibleSections: [MenuSection] {
        let isStaff = session.currentUser?.isStaff ?? false
        return ZrpMenu.sections.compactMap { section in
            let entries = section.entries.filter { $0.route != .adminHome || isStaff }
            return entries.isEmpty ? nil : MenuSection(headingKey: section.headingKey, entries: entries)
        }
    }

    // MARK: - Header

    /// The account row: who is signed in, and a way to their own profile
    /// and to Settings without hunting through the list below.
    private var header: some View {
        HStack(spacing: ZrpSpacing.md) {
            Button {
                select(MenuEntry(.navProfile, systemImage: "person", tab: .profile))
            } label: {
                HStack(spacing: ZrpSpacing.md) {
                    AvatarView(
                        url: session.currentUser?.avatarUrl,
                        displayName: session.currentUser?.displayName ?? "",
                        size: ZrpMetrics.avatarMedium
                    )
                    VStack(alignment: .leading, spacing: 2) {
                        Text(verbatim: session.currentUser?.displayName ?? "")
                            .font(.headline)
                            .foregroundStyle(ZrpColor.onSurface)
                            .lineLimit(1)
                        if let username = session.currentUser?.username {
                            Text(verbatim: "@" + username)
                                .font(.subheadline)
                                .foregroundStyle(ZrpColor.onSurfaceMuted)
                                .lineLimit(1)
                        }
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)

            Button {
                select(MenuEntry(.navSettings, systemImage: "gearshape", route: .settings))
            } label: {
                Image(systemName: "gearshape")
                    .font(.title3)
                    .foregroundStyle(ZrpColor.onSurfaceMuted)
                    .frame(width: ZrpMetrics.minTouchTarget, height: ZrpMetrics.minTouchTarget)
                    .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel(Text(.navSettings))
        }
        .padding(.horizontal, ZrpSpacing.lg)
        .padding(.vertical, ZrpSpacing.md)
    }

    // MARK: - Rows

    private func row(_ entry: MenuEntry) -> some View {
        Button {
            select(entry)
        } label: {
            HStack(spacing: ZrpSpacing.lg) {
                Image(systemName: entry.systemImage)
                    .font(.system(size: 20))
                    .frame(width: 24)
                    .foregroundStyle(isCurrent(entry) ? ZrpColor.red : ZrpColor.onSurfaceMuted)

                Text(verbatim: entry.title)
                    .font(.body.weight(isCurrent(entry) ? .semibold : .regular))
                    .foregroundStyle(ZrpColor.onSurface)
                    .lineLimit(1)
                    .minimumScaleFactor(0.8)

                Spacer(minLength: ZrpSpacing.sm)

                if let count = badge(for: entry), count > 0 {
                    Text(verbatim: CountFormatting.badge(count))
                        .font(.caption2.weight(.bold))
                        .foregroundStyle(.white)
                        .padding(.horizontal, 6)
                        .padding(.vertical, 2)
                        .background(Capsule().fill(ZrpColor.red))
                        .accessibilityHidden(true)
                }
            }
            .padding(.horizontal, ZrpSpacing.lg)
            // 52pt rather than the 44pt floor: these are the app's
            // primary navigation and are meant to be hit without aiming.
            .frame(minHeight: 52)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(
                isCurrent(entry)
                    ? ZrpColor.surfaceElevated
                    : Color.clear
            )
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(label(for: entry))
        .accessibilityAddTraits(isCurrent(entry) ? [.isButton, .isSelected] : .isButton)
    }

    /// Reads the count into the label rather than leaving it as a
    /// decoration beside the name, so VoiceOver says "Messages, 3 unread"
    /// in one breath instead of announcing a stray number.
    private func label(for entry: MenuEntry) -> Text {
        let title = entry.title
        guard let count = badge(for: entry), count > 0 else {
            return Text(verbatim: title)
        }
        return Text(verbatim: title + ", " + L10n.string(
            .iosA11yUnreadCount, ["count": CountFormatting.exact(count)]
        ))
    }

    private func badge(for entry: MenuEntry) -> Int? {
        if entry.tab == .messages { return unread.messageCount }
        if entry.route == .notifications { return unread.notificationCount }
        return nil
    }

    /// Highlights the row for the tab currently on screen.
    ///
    /// Only tab rows can claim this: a pushed screen lives inside a tab's
    /// stack, and marking "Music" as current for as long as it happened
    /// to be on the stack would make the menu disagree with the bottom
    /// bar about where you are.
    private func isCurrent(_ entry: MenuEntry) -> Bool {
        guard let tab = entry.tab else { return false }
        return router.selectedTab == tab
    }

    // MARK: - Footer

    private var footer: some View {
        VStack(alignment: .leading, spacing: ZrpSpacing.md) {
            Button(role: .destructive) {
                onClose?()
                Task { await session.signOut() }
            } label: {
                HStack(spacing: ZrpSpacing.lg) {
                    Image(systemName: "rectangle.portrait.and.arrow.right")
                        .font(.system(size: 20))
                        .frame(width: 24)
                    Text(.navSignOut)
                        .font(.body)
                }
                .foregroundStyle(ZrpColor.red)
                .frame(minHeight: ZrpMetrics.minTouchTarget)
                .frame(maxWidth: .infinity, alignment: .leading)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)

            HStack(spacing: ZrpSpacing.sm) {
                Image("ZrpLogo")
                    .resizable()
                    .scaledToFit()
                    .frame(width: 20, height: 20)
                Text(verbatim: Self.versionLabel)
                    .font(.caption2)
                    .foregroundStyle(ZrpColor.onSurfaceMuted)
            }
            .accessibilityHidden(true)
        }
        .padding(.horizontal, ZrpSpacing.lg)
        .padding(.top, ZrpSpacing.md)
        .padding(.bottom, ZrpSpacing.sm)
    }

    /// Read from the bundle rather than written here, so it cannot drift
    /// from what the build actually is.
    private static var versionLabel: String {
        let info = Bundle.main.infoDictionary
        let short = info?["CFBundleShortVersionString"] as? String ?? ""
        return short.isEmpty ? "" : "v" + short
    }

    // MARK: - Selection

    private func select(_ entry: MenuEntry) {
        onClose?()
        if let tab = entry.tab {
            router.selectTab(tab)
        } else if let route = entry.route {
            router.openFromMenu(route)
        }
    }
}
