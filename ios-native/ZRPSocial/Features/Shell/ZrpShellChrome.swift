import SwiftUI

/// Whether the navigation menu is showing.
///
/// Shell-level state rather than a `@State` inside one view, because
/// three unrelated things open and close the menu: the hamburger in the
/// toolbar, the edge-drag gesture, and any row inside the menu itself.
@MainActor
final class DrawerState: ObservableObject {
    @Published var isOpen = false

    func toggle() {
        withAnimation(Self.animation) { isOpen.toggle() }
    }

    func open() {
        withAnimation(Self.animation) { isOpen = true }
    }

    func close() {
        withAnimation(Self.animation) { isOpen = false }
    }

    /// Short and unspringy. A navigation drawer is a control, not a
    /// flourish; anything slower than this starts to feel like waiting.
    static let animation: Animation = .easeOut(duration: 0.22)
}

// MARK: - The toolbar the root screens share

extension View {

    /// The chrome every root screen carries: the menu button, and on Home
    /// the ZRP mark and the notifications bell.
    ///
    /// Applied by the shell rather than by the four screens themselves,
    /// so none of them has to know it is currently a tab root - and so
    /// `ProfileView`, which is also pushed for other people, does not
    /// sprout a menu button when it is somebody else's profile.
    func zrpRootChrome(wordmark: Bool = false, bell: Bool = false) -> some View {
        modifier(ZrpRootChrome(showsWordmark: wordmark, showsBell: bell))
    }
}

private struct ZrpRootChrome: ViewModifier {

    let showsWordmark: Bool
    let showsBell: Bool

    @EnvironmentObject private var drawer: DrawerState
    @EnvironmentObject private var router: AppRouter
    @EnvironmentObject private var unread: UnreadBadgeViewModel
    @Environment(\.horizontalSizeClass) private var horizontalSizeClass

    /// On a regular-width iPad the menu is a permanent column beside the
    /// content, so a button that opens it would be a control with nothing
    /// to do.
    private var needsMenuButton: Bool { horizontalSizeClass == .compact }

    func body(content: Content) -> some View {
        content.toolbar {
            if needsMenuButton {
                ToolbarItem(placement: .topBarLeading) {
                    Button {
                        drawer.open()
                    } label: {
                        Image(systemName: "line.3.horizontal")
                            .font(.title3.weight(.semibold))
                            .foregroundStyle(ZrpColor.onSurface)
                    }
                    .accessibilityLabel(Text(.navOpenMenu))
                }
            }

            if showsWordmark {
                ToolbarItem(placement: .principal) {
                    // The official ZRP mark, drawn from the asset exactly
                    // as the project ships it.
                    Image("ZrpLogo")
                        .resizable()
                        .scaledToFit()
                        .frame(width: 28, height: 28)
                        .accessibilityHidden(true)
                }
            }

            if showsBell {
                ToolbarItem(placement: .topBarTrailing) {
                    Button {
                        router.openFromMenu(.notifications)
                    } label: {
                        Image(systemName: "bell")
                            .font(.title3)
                            .foregroundStyle(ZrpColor.onSurface)
                            .overlay(alignment: .topTrailing) {
                                if unread.notificationCount > 0 {
                                    Circle()
                                        .fill(ZrpColor.red)
                                        .frame(width: 8, height: 8)
                                        .offset(x: 3, y: -2)
                                }
                            }
                    }
                    .accessibilityLabel(bellLabel)
                }
            }
        }
    }

    private var bellLabel: Text {
        let title = L10n.string(.navNotifications)
        guard unread.notificationCount > 0 else { return Text(verbatim: title) }
        return Text(verbatim: title + ", " + L10n.string(
            .iosA11yUnreadCount,
            ["count": CountFormatting.exact(unread.notificationCount)]
        ))
    }
}

// MARK: - Drawer / sidebar

/// Puts the navigation menu beside the app.
///
/// Two genuinely different layouts, not one stretched into the other:
///
/// - **Compact** (every iPhone, and an iPad in a narrow Split View or
///   Slide Over): an overlay drawer that slides in from the leading edge
///   over a dimmed app, dismissed by the scrim, a drag, or picking
///   something.
/// - **Regular** (an iPad at half width and up): a permanent column. The
///   menu is simply always there, because there is room for it to be, and
///   an iPad with 1366 points of width should not be hiding its own
///   navigation behind a button.
struct DrawerContainer<Content: View>: View {

    @EnvironmentObject private var drawer: DrawerState
    @Environment(\.horizontalSizeClass) private var horizontalSizeClass
    @Environment(\.layoutDirection) private var layoutDirection

    @ViewBuilder let content: () -> Content

    /// Wide enough for the longest menu label at the largest non-
    /// accessibility text size, and narrow enough to leave the timeline
    /// its full reading width on the smallest iPad.
    private static var sidebarWidth: CGFloat { 280 }

    var body: some View {
        if horizontalSizeClass == .regular {
            permanentSidebar
        } else {
            overlayDrawer
        }
    }

    // MARK: iPad

    private var permanentSidebar: some View {
        HStack(spacing: 0) {
            ZrpMenuView()
                .frame(width: Self.sidebarWidth)
            Divider().overlay(ZrpColor.outline)
            content()
        }
        .background(ZrpColor.background.ignoresSafeArea())
        // A drawer left open by a rotation from portrait-compact would
        // otherwise still be "open" behind a sidebar that is always
        // visible, and the next rotation back would show it already out.
        .onAppear { drawer.isOpen = false }
    }

    // MARK: iPhone

    private var overlayDrawer: some View {
        GeometryReader { geometry in
            // Leaves a strip of the app visible at the trailing edge, so
            // it is obvious the menu is over the app rather than a screen
            // the app navigated to.
            let width = min(Self.sidebarWidth + 20, geometry.size.width - 56)

            ZStack(alignment: .leading) {
                content()

                if drawer.isOpen {
                    Color.black.opacity(0.55)
                        .ignoresSafeArea()
                        .onTapGesture { drawer.close() }
                        .transition(.opacity)
                        .accessibilityLabel(Text(.navCloseMenu))
                        .accessibilityAddTraits(.isButton)
                        .accessibilityAction { drawer.close() }
                }

                ZrpMenuView(onClose: { drawer.close() })
                    .frame(width: width)
                    .frame(maxHeight: .infinity)
                    .background(ZrpColor.surface.ignoresSafeArea(edges: .vertical))
                    .overlay(alignment: .trailing) {
                        Divider().overlay(ZrpColor.outline)
                    }
                    .offset(x: drawer.isOpen ? 0 : -(width + 2))
                    .gesture(closeDrag(width: width))
                    // Kept out of the accessibility tree entirely while
                    // shut: a VoiceOver swipe must not wander into a menu
                    // that is off-screen.
                    .accessibilityHidden(!drawer.isOpen)
            }
            // `simultaneousGesture` rather than `gesture`: this must
            // not swallow taps and swipes belonging to the content
            // underneath - the Shorts feed, the media pager, a carousel
            // all live in here.
            .simultaneousGesture(openDrag())
        }
    }

    /// A drag on the open menu, back towards the edge it came from.
    private func closeDrag(width: CGFloat) -> some Gesture {
        DragGesture(minimumDistance: 12)
            .onEnded { value in
                guard leadingward(value.translation.width) < -width / 4 else { return }
                drawer.close()
            }
    }

    /// The edge swipe that opens it.
    ///
    /// Restricted to a drag that both starts within 24 points of the
    /// leading edge and travels 60 points inward, so it cannot be
    /// mistaken for a horizontal swipe inside the content, and so it does
    /// not fight the system's own back-swipe - which starts from the same
    /// edge but is only live when a navigation stack has something to go
    /// back to.
    private func openDrag() -> some Gesture {
        DragGesture(minimumDistance: 20)
            .onEnded { value in
                guard !drawer.isOpen,
                      leadingward(value.startLocation.x) < 24,
                      leadingward(value.translation.width) > 60
                else { return }
                drawer.open()
            }
    }

    /// Mirrors a horizontal measurement in a right-to-left layout, so
    /// "towards the leading edge" means the same thing in Arabic as it
    /// does in English. ZRP ships in eleven languages, one of them RTL.
    private func leadingward(_ x: CGFloat) -> CGFloat {
        layoutDirection == .rightToLeft ? -x : x
    }
}

// MARK: - The bottom bar

/// The five-item bar, with Create raised in the middle.
///
/// Hand-built rather than a `TabView`'s own bar because the centre
/// control is not a tab: it is a button that opens the composer and hands
/// the current screen straight back, and the reference design gives it a
/// raised red circle that a `tabItem` cannot draw.
struct ZrpTabBar: View {

    @EnvironmentObject private var router: AppRouter
    @EnvironmentObject private var unread: UnreadBadgeViewModel

    var body: some View {
        HStack(spacing: 0) {
            ForEach(MainTab.allCases, id: \.self) { tab in
                if tab == .create {
                    createButton
                } else {
                    item(tab)
                }
            }
        }
        // The labels scale with Dynamic Type, but only so far. Five of
        // them side by side at an accessibility size would leave the row
        // unreadable and the glyphs squeezed out - which is why iOS caps
        // its own tab bar the same way. Nothing is lost: at those sizes
        // the system shows each tab full-screen on long press, and
        // VoiceOver reads the full label regardless of this cap.
        .dynamicTypeSize(...DynamicTypeSize.xxLarge)
        .frame(minHeight: 52)
        .padding(.top, ZrpSpacing.xs)
        .background(alignment: .top) {
            ZrpColor.surface
                .ignoresSafeArea(edges: .bottom)
                .overlay(alignment: .top) {
                    Divider().overlay(ZrpColor.outline)
                }
        }
    }

    private func item(_ tab: MainTab) -> some View {
        let selected = router.selectedTab == tab

        return Button {
            router.selectTab(tab)
        } label: {
            VStack(spacing: 3) {
                Image(systemName: selected ? tab.selectedSystemImage : tab.systemImage)
                    .font(.system(size: 20, weight: selected ? .semibold : .regular))
                    .overlay(alignment: .topTrailing) {
                        if badge(for: tab) > 0 {
                            Circle()
                                .fill(ZrpColor.red)
                                .frame(width: 8, height: 8)
                                .offset(x: 6, y: -2)
                        }
                    }
                Text(tab.titleKey)
                    .font(.caption2.weight(selected ? .semibold : .regular))
                    .lineLimit(1)
                    .minimumScaleFactor(0.7)
            }
            .foregroundStyle(selected ? ZrpColor.red : ZrpColor.onSurfaceMuted)
            .frame(maxWidth: .infinity)
            .frame(minHeight: ZrpMetrics.minTouchTarget)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(label(for: tab))
        .accessibilityAddTraits(selected ? [.isButton, .isSelected] : .isButton)
    }

    private var createButton: some View {
        Button {
            router.requestCompose()
        } label: {
            Image(systemName: "plus")
                .font(.system(size: 22, weight: .semibold))
                .foregroundStyle(.white)
                .frame(width: 46, height: 46)
                .background(Circle().fill(ZrpColor.red))
                // Lifted clear of the bar, the way the reference draws
                // it. Only eight points: enough to read as raised,
                // little enough that the circle stays inside the bar's
                // own tap area rather than floating over content.
                .offset(y: -8)
                .frame(maxWidth: .infinity)
                .frame(minHeight: ZrpMetrics.minTouchTarget)
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(Text(.actionPost))
    }

    private func badge(for tab: MainTab) -> Int {
        tab == .messages ? unread.messageCount : 0
    }

    private func label(for tab: MainTab) -> Text {
        let title = L10n.string(tab.titleKey)
        let count = badge(for: tab)
        guard count > 0 else { return Text(verbatim: title) }
        return Text(verbatim: title + ", " + L10n.string(
            .iosA11yUnreadCount, ["count": CountFormatting.exact(count)]
        ))
    }
}
