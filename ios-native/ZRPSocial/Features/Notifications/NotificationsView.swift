import SwiftUI

/// The notification filters, matching the website's own three tabs.
enum NotificationFilter: String, CaseIterable, Identifiable {
    case all
    case verified
    case follows

    var id: String { rawValue }

    var titleKey: L10nKey {
        switch self {
        case .all: return .adminUsersStatusAll
        case .verified: return .adminUsersBadgeVerified
        // The web tab is labelled "Follows", which has no translated
        // counterpart anywhere in the dictionary; "Followers" does, and
        // means the same thing about the same rows.
        case .follows: return .profileFollowers
        }
    }
}

@MainActor
final class NotificationsViewModel: ObservableObject {

    enum Phase: Equatable {
        case idle
        case loading
        case loaded
        case failed(ApiError)
    }

    @Published private(set) var notifications: [AppNotification] = []
    @Published private(set) var phase: Phase = .idle
    @Published var filter: NotificationFilter = .all

    /// What the list actually shows.
    ///
    /// Filtered here rather than refetched: the route returns the whole
    /// list and takes no filter parameter, so a chip is a view over data
    /// the app is already holding. Switching chips costs nothing and
    /// works offline.
    var visible: [AppNotification] {
        switch filter {
        case .all:
            return notifications
        case .verified:
            // Any badge at all, which is exactly the test the web page
            // applies - not one particular badge type.
            return notifications.filter { $0.fromUser?.badgeType?.isEmpty == false }
        case .follows:
            return notifications.filter {
                $0.kind == .follow || $0.kind == .followRequest
            }
        }
    }

    private let repository: NotificationsRepositoryProtocol

    init(repository: NotificationsRepositoryProtocol = NotificationsRepository()) {
        self.repository = repository
    }

    func loadIfNeeded() async {
        guard phase == .idle else { return }
        await load()
    }

    func load() async {
        if notifications.isEmpty { phase = .loading }
        do {
            notifications = try await repository.notifications()
            phase = .loaded
        } catch {
            if notifications.isEmpty {
                phase = .failed(error as? ApiError ?? .transport(underlying: "\(error)"))
            } else {
                phase = .loaded
            }
        }
    }

    /// Opening the list marks everything read, mirroring the website's own
    /// behaviour. The route only supports all-at-once, so this is called
    /// after the first successful load rather than per row.
    func markAllRead() async {
        guard notifications.contains(where: { !$0.read }) else { return }
        try? await repository.markAllRead()
    }
}

/// The in-app notification list.
///
/// **Device push is a separate, blocked concern** - see PARITY.md B3.
/// `/api/push/fcm` hardcodes `platform: "android"`, the Firebase project
/// has no APNs key, and no `GoogleService-Info.plist` exists for iOS.
/// Nothing here simulates a push with a local notification: that would
/// look like the feature working while delivering nothing when the app is
/// closed.
struct NotificationsView: View {

    @EnvironmentObject private var navigator: Navigator
    /// Cleared after the list marks everything read, so the tab badge
    /// goes away with the notifications rather than at the next refresh.
    @EnvironmentObject private var unread: UnreadBadgeViewModel
    @StateObject private var viewModel = NotificationsViewModel()

    var body: some View {
        Group {
            switch viewModel.phase {
            case .idle, .loading:
                TimelineStateView.loading()
            case .failed(let error):
                TimelineStateView.error(error) {
                    Task { await viewModel.load() }
                }
            case .loaded:
                if viewModel.notifications.isEmpty {
                    TimelineStateView.empty(
                        systemImage: "bell",
                        title: .notificationsEmpty,
                        subtitle: .notificationsEmptyDesc
                    )
                } else {
                    VStack(spacing: 0) {
                        filterChips
                        Divider().overlay(ZrpColor.outline)
                        if viewModel.visible.isEmpty {
                            // The inbox has notifications; this filter
                            // has none. Saying "no notifications yet"
                            // here would be untrue and would look like
                            // the list had failed to load.
                            TimelineStateView.empty(
                                systemImage: "line.3.horizontal.decrease.circle",
                                title: .notificationsEmpty,
                                subtitle: .notificationsEmptyDesc
                            )
                        } else {
                            list
                        }
                    }
                }
            }
        }
        .background(ZrpColor.background.ignoresSafeArea())
        .navigationTitle(Text(.notificationsTitle))
        .navigationBarTitleDisplayMode(.inline)
        .task {
            await viewModel.loadIfNeeded()
            await viewModel.markAllRead()
            unread.clearNotificationCount()
        }
    }

    /// The same three filters the website's own notifications page
    /// offers. It has had them all along; this app showed one
    /// undifferentiated list.
    private var filterChips: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: ZrpSpacing.sm) {
                ForEach(NotificationFilter.allCases) { option in
                    let selected = viewModel.filter == option

                    Button {
                        withAnimation(.easeInOut(duration: 0.15)) {
                            viewModel.filter = option
                        }
                    } label: {
                        Text(option.titleKey)
                            .font(.subheadline.weight(selected ? .semibold : .regular))
                            .foregroundStyle(selected ? .white : ZrpColor.onSurfaceMuted)
                            .padding(.horizontal, ZrpSpacing.lg)
                            .padding(.vertical, ZrpSpacing.sm)
                            .frame(minHeight: ZrpMetrics.minTouchTarget)
                            .background(
                                Capsule().fill(
                                    selected ? ZrpColor.red : ZrpColor.surfaceElevated
                                )
                            )
                            .contentShape(Capsule())
                    }
                    .buttonStyle(.plain)
                    .accessibilityAddTraits(
                        selected ? [.isButton, .isSelected] : .isButton
                    )
                }
            }
            .padding(.horizontal, ZrpSpacing.lg)
            .padding(.vertical, ZrpSpacing.sm)
        }
        .background(ZrpColor.background)
    }

    private var list: some View {
        ScrollView {
            LazyVStack(spacing: 0) {
                ForEach(viewModel.visible) { notification in
                    row(notification)
                }
            }
            .frame(maxWidth: ZrpMetrics.contentMaxWidth)
            .frame(maxWidth: .infinity)
        }
        .refreshable { await viewModel.load() }
    }

    @ViewBuilder
    private func row(_ notification: AppNotification) -> some View {
        let destination = destination(for: notification)

        Button {
            if let destination { navigator.push(destination) }
        } label: {
            HStack(alignment: .top, spacing: ZrpSpacing.md) {
                Image(systemName: notification.kind.systemImage)
                    .font(.subheadline)
                    .foregroundStyle(tint(for: notification.kind))
                    .frame(width: 24)
                    .padding(.top, 2)

                if let author = notification.fromUser {
                    AvatarView(
                        url: author.avatarUrl,
                        displayName: author.displayName,
                        size: ZrpMetrics.avatarSmall
                    )
                }

                VStack(alignment: .leading, spacing: 2) {
                    text(for: notification)
                    if let post = notification.post, !post.content.isEmpty {
                        Text(verbatim: post.content)
                            .font(.footnote)
                            .foregroundStyle(ZrpColor.onSurfaceMuted)
                            .lineLimit(2)
                    }
                    Text(verbatim: RelativeTime.compact(from: notification.createdAt))
                        .font(.caption2)
                        .foregroundStyle(ZrpColor.onSurfaceMuted)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
            }
            .padding(ZrpSpacing.lg)
            .frame(maxWidth: .infinity, alignment: .leading)
            // Unread rows get a faint wash, the same signal the website
            // uses, and it persists for this viewing even though the
            // route has already marked them read.
            .background(notification.read ? ZrpColor.background : ZrpColor.surfaceElevated)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        // A notification with no destination is not a button. That is
        // now only an unrecognised type, or a known one whose payload is
        // missing the thing it points at - a row that did nothing when
        // tapped would be worse than one that plainly is not tappable.
        .disabled(destination == nil)
        .overlay(alignment: .bottom) {
            Rectangle().fill(ZrpColor.outlineFaint).frame(height: 0.5)
        }
        .accessibilityElement(children: .combine)
    }

    @ViewBuilder
    private func text(for notification: AppNotification) -> some View {
        let name = notification.fromUser?.displayName ?? ""
        if let actionKey = notification.kind.actionKey {
            (
                Text(verbatim: name).font(.subheadline.weight(.semibold))
                    + Text(verbatim: " ")
                    + Text(actionKey).font(.subheadline)
            )
            .foregroundStyle(ZrpColor.onSurface)
        } else {
            // No action phrase for this type, exactly as on web.
            Text(verbatim: name)
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(ZrpColor.onSurface)
        }
    }

    private func tint(for kind: NotificationKind) -> Color {
        switch kind {
        case .like: return ZrpColor.red
        case .comment: return ZrpColor.blue
        case .follow, .followRequest, .repost: return ZrpColor.green
        default: return ZrpColor.onSurfaceMuted
        }
    }

    /// Where a notification leads, or `nil` when this app has no screen
    /// for it yet.
    private func destination(for notification: AppNotification) -> Route? {
        switch notification.kind {
        case .like, .comment, .repost:
            guard let post = notification.post else { return nil }
            return .postDetail(postId: post.id, preloaded: nil)
        case .follow, .followRequest:
            guard let author = notification.fromUser else { return nil }
            return .profile(username: author.username)
        case .message:
            guard let author = notification.fromUser else { return nil }
            return .conversation(partner: author)
        case .appealResolved:
            return .appeals
        case .listingApproved, .listingRejected, .listingRemoved:
            // The notification carries no listing id - it has only a
            // `post` reference, which a listing decision does not use -
            // so this leads to the seller's own listings, where the
            // outcome is visible, rather than guessing at an id.
            return .myListings
        case .unknown:
            // A type this app does not recognise leads nowhere rather
            // than somewhere plausible-looking.
            return nil
        }
    }
}
