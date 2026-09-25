import SwiftUI

/// A profile's identity block: cover, avatar, name, bio, metadata, stats,
/// and the follow control.
struct ProfileHeaderView: View {

    let profile: UserProfile
    let isOwnProfile: Bool
    let isTogglingFollow: Bool
    let onToggleFollow: () -> Void

    @EnvironmentObject private var navigator: Navigator

    /// Set to open the avatar or cover full-size. There is no inline
    /// "change avatar/cover" control on this screen to conflict with -
    /// editing happens on the separate `EditProfileView` reached through
    /// the "Edit Profile" button below - so the image itself can be the
    /// whole tap target, matching the website and Android fix for the
    /// same bug.
    @State private var mediaPresentation: MediaPresentation?

    private static let joinedFormatter: DateFormatter = {
        let formatter = DateFormatter()
        // Locale-appropriate month + year ordering rather than a fixed
        // format, which reads wrong in most of ZRP's 25 languages.
        formatter.setLocalizedDateFormatFromTemplate("MMMMy")
        return formatter
    }()

    var body: some View {
        VStack(alignment: .leading, spacing: ZrpSpacing.md) {
            cover
            identity
            if let bio = profile.bio, !bio.isEmpty {
                Text(verbatim: bio)
                    .font(.subheadline)
                    .foregroundStyle(ZrpColor.onSurface)
                    .fixedSize(horizontal: false, vertical: true)
            }
            metadata
            stats
            impact
            milestoneBadges
        }
        .padding(.bottom, ZrpSpacing.md)
        .background(ZrpColor.surface)
        .overlay(alignment: .bottom) {
            Rectangle().fill(ZrpColor.outline).frame(height: 0.5)
        }
    }

    // MARK: -

    private var cover: some View {
        ZStack(alignment: .bottomLeading) {
            Group {
                if let coverUrl = profile.coverUrl, !coverUrl.isEmpty {
                    // The image itself is the tap target that opens the
                    // full-size viewer - no separate "change cover" control
                    // sits on this screen to fight it for taps.
                    Button {
                        mediaPresentation = MediaPresentation(
                            urls: [coverUrl],
                            isVideo: false,
                            startIndex: 0
                        )
                    } label: {
                        RemoteImage(url: coverUrl, targetSize: 200) {
                            ZrpColor.surfaceHighest
                        }
                        .scaledToFill()
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel(
                        Text(verbatim: L10n.string(.profileViewPhotoAria, ["name": profile.displayName]))
                    )
                } else {
                    // No cover is the common case, so it gets a deliberate
                    // brand treatment rather than an empty grey band. There
                    // is nothing to view full-size, so this stays decorative.
                    LinearGradient(
                        colors: [ZrpColor.red.opacity(0.7), ZrpColor.darkRed.opacity(0.5)],
                        startPoint: .topLeading,
                        endPoint: .bottomTrailing
                    )
                    .accessibilityHidden(true)
                }
            }
            .frame(height: 140)
            .frame(maxWidth: .infinity)
            .clipped()

            avatarButton
        }
        .padding(.bottom, ZrpMetrics.avatarLarge / 2)
        .fullScreenCover(item: $mediaPresentation) { item in
            FullScreenMediaView(urls: item.urls, isVideo: item.isVideo, startIndex: item.startIndex)
        }
    }

    /// The avatar as its own tap target, opening it full-size. Disabled
    /// (and left as a plain image) when there is no photo to view - an
    /// initials fallback has nothing to show full screen, matching the
    /// website, which only makes the avatar a button when `avatarUrl` is
    /// set.
    @ViewBuilder
    private var avatarButton: some View {
        let avatar = AvatarView(
            url: profile.avatarUrl,
            displayName: profile.displayName,
            size: ZrpMetrics.avatarLarge
        )
        .overlay(Circle().strokeBorder(ZrpColor.background, lineWidth: 4))

        if let avatarUrl = profile.avatarUrl, !avatarUrl.isEmpty {
            Button {
                mediaPresentation = MediaPresentation(
                    urls: [avatarUrl],
                    isVideo: false,
                    startIndex: 0
                )
            } label: {
                avatar
            }
            .buttonStyle(.plain)
            .accessibilityLabel(
                Text(verbatim: L10n.string(.profileViewPhotoAria, ["name": profile.displayName]))
            )
            .padding(.leading, ZrpSpacing.lg)
            .offset(y: ZrpMetrics.avatarLarge / 2)
        } else {
            avatar
                .padding(.leading, ZrpSpacing.lg)
                .offset(y: ZrpMetrics.avatarLarge / 2)
        }
    }

    private var identity: some View {
        HStack(alignment: .top) {
            VStack(alignment: .leading, spacing: 2) {
                HStack(spacing: ZrpSpacing.xs) {
                    Text(verbatim: profile.displayName)
                        .font(.title2.weight(.bold))
                        .foregroundStyle(ZrpColor.onSurface)
                    VerifiedBadge(badgeType: profile.badgeType, size: 18)
                }
                Text(verbatim: profile.handle)
                    .font(.subheadline)
                    .foregroundStyle(ZrpColor.onSurfaceMuted)
            }
            Spacer(minLength: ZrpSpacing.md)
            followControl
        }
        .padding(.horizontal, ZrpSpacing.lg)
    }

    @ViewBuilder
    private var followControl: some View {
        if isOwnProfile {
            // The website resolves its own-profile case by deep-linking
            // this same slot to `/settings` rather than a separate
            // profile-edit modal; this pushes the same real, working
            // `EditProfileView` Settings already opens (`Route.editProfile`)
            // instead of inventing a second edit surface.
            Button {
                navigator.push(.editProfile)
            } label: {
                Text(.profileEditProfileButton)
                    .font(.subheadline.weight(.semibold))
                    .frame(minWidth: 100)
                    .frame(minHeight: ZrpMetrics.minTouchTarget)
                    .padding(.horizontal, ZrpSpacing.lg)
                    .background(ZrpColor.surfaceHighest)
                    .foregroundStyle(ZrpColor.onSurface)
                    .clipShape(Capsule())
                    .overlay(Capsule().strokeBorder(ZrpColor.outline, lineWidth: 1))
            }
        } else {
            Button(action: onToggleFollow) {
                Group {
                    if isTogglingFollow {
                        ProgressView()
                            .tint(profile.isFollowing ? ZrpColor.onSurface : .white)
                    } else {
                        Text(profile.isFollowing ? L10nKey.actionFollowing : L10nKey.actionFollow)
                            .font(.subheadline.weight(.semibold))
                    }
                }
                .frame(minWidth: 100)
                .frame(minHeight: ZrpMetrics.minTouchTarget)
                .padding(.horizontal, ZrpSpacing.lg)
                .background(profile.isFollowing ? ZrpColor.surfaceHighest : ZrpColor.red)
                .foregroundStyle(profile.isFollowing ? ZrpColor.onSurface : .white)
                .clipShape(Capsule())
                .overlay(
                    Capsule().strokeBorder(
                        profile.isFollowing ? ZrpColor.outline : .clear,
                        lineWidth: 1
                    )
                )
            }
            .disabled(isTogglingFollow)
            .accessibilityLabel(
                Text(profile.isFollowing ? L10nKey.actionUnfollow : L10nKey.actionFollow)
            )
        }
    }

    private var metadata: some View {
        // Wraps rather than truncating - a profile can carry location,
        // website, and join date at once, and at large Dynamic Type sizes
        // they will not fit on one line.
        ViewThatFits(in: .horizontal) {
            HStack(spacing: ZrpSpacing.lg) { metadataItems }
            VStack(alignment: .leading, spacing: ZrpSpacing.sm) { metadataItems }
        }
        .font(.footnote)
        .foregroundStyle(ZrpColor.onSurfaceMuted)
        .padding(.horizontal, ZrpSpacing.lg)
    }

    @ViewBuilder
    private var metadataItems: some View {
        if let location = profile.location, !location.isEmpty {
            Label { Text(verbatim: location) } icon: { Image(systemName: "mappin.and.ellipse") }
        }
        if let website = profile.website, !website.isEmpty, let url = websiteURL(website) {
            // A real, tappable link. The system opens it in Safari so the
            // address stays visible to the viewer - user-supplied URLs are
            // never opened in an in-app browser that would hide it.
            Link(destination: url) {
                Label { Text(verbatim: website) } icon: { Image(systemName: "link") }
            }
            .tint(ZrpColor.red)
        }
        Label {
            Text(verbatim: L10n.string(.profileJoined) + " " + Self.joinedFormatter.string(from: profile.createdAt))
        } icon: {
            Image(systemName: "calendar")
        }
    }

    private var stats: some View {
        HStack(spacing: ZrpSpacing.xl) {
            stat(count: profile.counts.posts, label: .profilePosts, route: nil)
            stat(
                count: profile.counts.followers,
                label: .profileFollowers,
                route: .userList(.followers(username: profile.username))
            )
            stat(
                count: profile.counts.following,
                label: .profileFollowing,
                route: .userList(.following(username: profile.username))
            )
            Spacer(minLength: 0)
        }
        .padding(.horizontal, ZrpSpacing.lg)
        .padding(.top, ZrpSpacing.xs)
    }

    /// What this account has sent to charity, and the platform's own
    /// note about the share.
    ///
    /// Shown only when the route actually reported a figure. Absent is
    /// not zero: an older deployment sends no field at all, and
    /// rendering "$0.00 contributed" for that would be stating something
    /// the server never said. Zero itself is shown, because that IS a
    /// figure the server reported.
    ///
    /// The amount is formatted to two decimal places the way the website
    /// formats it, through the active locale's own number rules so a
    /// French reader sees `12,34` rather than `12.34`.
    @ViewBuilder
    private var impact: some View {
        if let amount = profile.charityContributionUsdc {
            VStack(alignment: .leading, spacing: ZrpSpacing.xs) {
                Label {
                    Text(.profileImpact, ["amount": Self.usdc(amount)])
                        .font(.caption)
                } icon: {
                    Image(systemName: "heart.fill")
                        .font(.caption)
                }
                .foregroundStyle(ZrpColor.red)
                .padding(.horizontal, ZrpSpacing.md)
                .padding(.vertical, ZrpSpacing.xs)
                .background(ZrpColor.red.opacity(0.1))
                .clipShape(Capsule())

                // The share is the website's own constant, passed as a
                // parameter there too - not a number invented here.
                Text(.profileCharityNote, ["pct": CountFormatting.exact(Self.charitySharePercent)])
                    .font(.caption2)
                    .foregroundStyle(ZrpColor.onSurfaceMuted)
                    .fixedSize(horizontal: false, vertical: true)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.horizontal, ZrpSpacing.lg)
            .padding(.top, ZrpSpacing.sm)
        }
    }

    /// The share of profits that goes to charity, as the website states
    /// it. Hard-coded there as well (`{ pct: 35 }`); no route reports it,
    /// so this mirrors the one place it is written down rather than
    /// inventing a second figure.
    private static let charitySharePercent = 35

    private static func usdc(_ amount: Double) -> String {
        let formatter = NumberFormatter()
        formatter.numberStyle = .decimal
        formatter.minimumFractionDigits = 2
        formatter.maximumFractionDigits = 2
        formatter.locale = L10n.activeLocale
        return formatter.string(from: NSNumber(value: amount)) ?? String(format: "%.2f", amount)
    }

    /// The badges this profile has earned.
    ///
    /// Every one of them is a fact the route computed. A badge whose key
    /// this app does not recognise is skipped rather than rendered as
    /// its raw key - an unknown key means a newer backend, and
    /// "posts_500" in front of an Arabic or Chinese reader is worse than
    /// one fewer badge.
    @ViewBuilder
    private var milestoneBadges: some View {
        let earned = (profile.milestones ?? []).filter { $0.localizedTitle != nil }
        if !earned.isEmpty {
            LazyVGrid(
                columns: [GridItem(.adaptive(minimum: 110), spacing: ZrpSpacing.sm)],
                alignment: .leading,
                spacing: ZrpSpacing.sm
            ) {
                ForEach(earned) { milestone in
                    HStack(spacing: ZrpSpacing.xs) {
                        Text(verbatim: milestone.icon)
                            .font(.caption)
                        Text(verbatim: milestone.localizedTitle ?? "")
                            .font(.caption.weight(.medium))
                            .lineLimit(1)
                    }
                    .padding(.horizontal, ZrpSpacing.sm)
                    .padding(.vertical, ZrpSpacing.xs)
                    .foregroundStyle(ZrpColor.onSurface)
                    .background(ZrpColor.surfaceElevated)
                    .clipShape(Capsule())
                    .overlay(Capsule().strokeBorder(ZrpColor.outline, lineWidth: 1))
                    // One element per badge, read as "icon, label" -
                    // the emoji alone would be announced by name.
                    .accessibilityElement(children: .combine)
                }
            }
            .padding(.horizontal, ZrpSpacing.lg)
            .padding(.top, ZrpSpacing.sm)
        }
    }

    @ViewBuilder
    private func stat(count: Int, label: L10nKey, route: Route?) -> some View {
        let content = HStack(spacing: ZrpSpacing.xs) {
            Text(verbatim: CountFormatting.compact(count) ?? "0")
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(ZrpColor.onSurface)
                .monospacedDigit()
            Text(label)
                .font(.subheadline)
                .foregroundStyle(ZrpColor.onSurfaceMuted)
        }
        .frame(minHeight: ZrpMetrics.minTouchTarget)

        if let route {
            Button { navigator.push(route) } label: { content }
                .buttonStyle(.plain)
                .accessibilityElement(children: .combine)
                .accessibilityAddTraits(.isButton)
        } else {
            // The post count is a statistic, not a destination - there is
            // no separate "all posts" screen to open, so it is not a
            // button.
            content
                .accessibilityElement(children: .combine)
        }
    }

    /// Profiles store websites with and without a scheme. A bare
    /// "example.com" is prefixed rather than dropped, matching how the
    /// website renders the same field.
    private func websiteURL(_ raw: String) -> URL? {
        if raw.lowercased().hasPrefix("http://") || raw.lowercased().hasPrefix("https://") {
            return URL(string: raw)
        }
        return URL(string: "https://\(raw)")
    }
}
