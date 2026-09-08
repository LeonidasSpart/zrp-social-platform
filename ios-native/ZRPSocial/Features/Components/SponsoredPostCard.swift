import SwiftUI

/// One sponsored post in the timeline.
///
/// Deliberately not a `PostRowView`. An ad carries no like, repost,
/// reply or bookmark - the serve route sends no counts and no viewer
/// flags for it, and there is no route to act on one - so reusing the
/// post card would put four controls on screen with nothing behind
/// them. The website's `AdCard` reuses none of `PostCard`'s engagement
/// machinery for exactly this reason, and this matches that decision
/// rather than arriving at a different one.
///
/// **Two different taps, and the difference is money.** Tapping the
/// author opens their profile and is not billed - looking up who is
/// advertising is not the same event as responding to the ad. Tapping
/// the content is the click the advertiser pays for. The website draws
/// the same line, and PostCard draws it between its author link and its
/// body too.
struct SponsoredPostCard: View {

    let ad: SponsoredAd

    @EnvironmentObject private var navigator: Navigator
    @Environment(\.openURL) private var openURL

    private let repository = AdsRepository()

    /// The website's own IntersectionObserver threshold.
    private static let impressionThreshold: CGFloat = 0.5

    var body: some View {
        VStack(alignment: .leading, spacing: ZrpSpacing.sm) {
            Label {
                Text(.iosAdsSponsored)
                    .font(.caption2)
            } icon: {
                Image(systemName: "megaphone")
                    .font(.caption2)
            }
            .foregroundStyle(ZrpColor.onSurfaceMuted)

            HStack(alignment: .top, spacing: ZrpSpacing.md) {
                Button {
                    navigator.push(.profile(username: ad.post.author.username))
                } label: {
                    AvatarView(
                        url: ad.post.author.avatarUrl,
                        displayName: ad.post.author.displayName,
                        size: ZrpMetrics.avatarMedium
                    )
                }
                .buttonStyle(.plain)

                VStack(alignment: .leading, spacing: ZrpSpacing.xs) {
                    Button {
                        navigator.push(.profile(username: ad.post.author.username))
                    } label: {
                        HStack(spacing: ZrpSpacing.xs) {
                            Text(verbatim: ad.post.author.displayName)
                                .font(.subheadline.weight(.semibold))
                                .foregroundStyle(ZrpColor.onSurface)
                            VerifiedBadge(badgeType: ad.post.author.badgeType)
                        }
                    }
                    .buttonStyle(.plain)

                    Button(action: handleClick) {
                        VStack(alignment: .leading, spacing: ZrpSpacing.sm) {
                            if !ad.post.content.isEmpty {
                                Text(verbatim: ad.post.content)
                                    .font(.subheadline)
                                    .foregroundStyle(ZrpColor.onSurface)
                                    .multilineTextAlignment(.leading)
                                    .fixedSize(horizontal: false, vertical: true)
                            }

                            if let image = ad.post.displayImageUrl {
                                // A still, even for a video ad. The
                                // feed's one shared player belongs to
                                // the timeline; letting an ad take it
                                // would interrupt the video someone was
                                // actually watching.
                                MediaGalleryView(
                                    imageURLs: [image],
                                    isVideo: ad.post.isVideo
                                )
                            }
                        }
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                }
            }
        }
        .padding(.horizontal, ZrpSpacing.lg)
        .padding(.vertical, ZrpSpacing.md)
        .frame(maxWidth: .infinity, alignment: .leading)
        .overlay(alignment: .bottom) {
            Rectangle()
                .fill(ZrpColor.outline)
                .frame(height: 1)
        }
        .accessibilityElement(children: .contain)
        .accessibilityLabel(
            Text(.iosA11ySponsoredPost, ["name": ad.post.author.displayName])
        )
        // Half on screen, once - the website's own threshold, and
        // measured rather than assumed. `.onAppear` would have been the
        // simpler hook and the wrong one: a `LazyVStack` builds a row
        // slightly before it is visible, which is fine for a view tally
        // and not fine for something an advertiser is billed for.
        .onVisible(threshold: Self.impressionThreshold) {
            Task { await repository.logImpression(campaignId: ad.campaignId) }
        }
    }

    /// Logs the click, then goes where the route says.
    ///
    /// The destination comes from the server rather than from
    /// `targetUrl` here, because the route is what decides it: an
    /// advertiser with no external destination gets `/post/{id}` back.
    /// Falling back to the post locally covers the case where the route
    /// declined to log at all - a campaign paused between being served
    /// and being tapped - so a tap always goes somewhere.
    private func handleClick() {
        Task {
            let destination = await repository.logClick(campaignId: ad.campaignId)
            open(destination)
        }
    }

    @MainActor
    private func open(_ destination: String?) {
        guard let destination, !destination.isEmpty else {
            navigator.push(.postDetail(postId: ad.post.id, preloaded: nil))
            return
        }

        // A relative path is one of ZRP's own - the route returns
        // "/post/{id}" for an advertiser who set no external URL - and
        // belongs in the app, not in a browser.
        if destination.hasPrefix("/") {
            if let target = DeepLink.target(forPath: destination), let route = target.route {
                navigator.push(route)
            } else {
                navigator.push(.postDetail(postId: ad.post.id, preloaded: nil))
            }
            return
        }

        guard let url = URL(string: destination), url.scheme != nil else {
            navigator.push(.postDetail(postId: ad.post.id, preloaded: nil))
            return
        }

        // An advertiser's own destination. Opened in the browser rather
        // than an in-app web view: it is someone else's site, and the
        // address bar is what lets a reader see whose.
        if let target = DeepLink.target(for: url), let route = target.route {
            navigator.push(route)
        } else {
            openURL(url)
        }
    }
}
