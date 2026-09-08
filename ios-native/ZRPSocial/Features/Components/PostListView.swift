import SwiftUI

/// The one timeline rendering used by every screen that shows posts.
///
/// Home, profiles, and hashtag pages differ in where their posts come
/// from, not in how a post looks or behaves - so they share this rather
/// than each growing their own copy of the card list, the paging
/// footer, and the delete plumbing.
struct PostListView<Header: View>: View {

    let posts: [Post]
    let isLoadingMore: Bool
    let hasMore: Bool

    /// Called as each row appears, so the host can decide whether to page.
    var onAppear: (Post) -> Void = { _ in }

    /// Called when a quote composed from this list is published, so the
    /// host can show it without a refetch.
    var onCreated: (Post) -> Void = { _ in }

    /// Called to pin or unpin one of the viewer's own posts. `nil` on
    /// every list except a profile's own, where a pin is meaningful and
    /// its result is visible.
    var onPin: ((Post) -> Void)?

    /// The author's currently pinned post, so the menu can offer Unpin
    /// on it and Pin on the rest.
    var pinnedPostId: String?

    /// A sponsored post to interleave, or `nil` on every list that does
    /// not carry ads - which is all of them but Home.
    ///
    /// Placed by the same rule the website uses: after the fifth post,
    /// and only in a feed that has more than five, so an ad is never the
    /// end of a short timeline. See `SponsoredPostCard`.
    var sponsoredAd: SponsoredAd?

    /// Rendered above the first post - a profile header, a hashtag
    /// summary, or nothing. Generic rather than type-erased so a header
    /// costs nothing when a screen does not have one.
    @ViewBuilder let header: () -> Header

    @EnvironmentObject private var interactions: PostInteractionStore

    // The quote composer and the edit sheet live at list level rather
    // than on each card: a sheet presented from inside a `LazyVStack`
    // row is torn down when that row recycles mid-scroll.
    @StateObject private var sheets = PostSheetState()

    /// Posts deleted this session are filtered here rather than removed
    /// from each screen's own array, so one delete is reflected
    /// everywhere the post appears.
    private var visiblePosts: [Post] {
        posts.filter { !interactions.deletedPostIDs.contains($0.id) }
    }

    var body: some View {
        LazyVStack(spacing: 0) {
            header()

            ForEach(Array(visiblePosts.enumerated()), id: \.element.id) { index, post in
                PostRowView(
                    post: post,
                    onPin: onPin,
                    pinnedPostId: pinnedPostId,
                    onAppear: onAppear,
                    sheets: sheets
                )

                if let sponsoredAd, index == SponsoredPostCard.feedSlotIndex,
                   visiblePosts.count > SponsoredPostCard.feedSlotIndex + 1 {
                    SponsoredPostCard(ad: sponsoredAd)
                }
            }

            footer
        }
        // Caps the reading width on iPad and in landscape rather than
        // stretching a post across a 12.9" display.
        .frame(maxWidth: ZrpMetrics.contentMaxWidth)
        .frame(maxWidth: .infinity)
        .postSheets(sheets, onCreated: onCreated)
    }

    @ViewBuilder
    private var footer: some View {
        if isLoadingMore {
            HStack(spacing: ZrpSpacing.sm) {
                ProgressView().tint(ZrpColor.onSurfaceMuted)
                Text(.feedLoadingMore)
                    .font(.footnote)
                    .foregroundStyle(ZrpColor.onSurfaceMuted)
            }
            .frame(maxWidth: .infinity)
            .padding(ZrpSpacing.lg)
        } else if !hasMore && !visiblePosts.isEmpty {
            Text(.feedEndOfFeed)
                .font(.footnote)
                .foregroundStyle(ZrpColor.onSurfaceMuted)
                .frame(maxWidth: .infinity)
                .padding(ZrpSpacing.xl)
        }
    }
}

/// Loading, error, and empty presentations shared by every timeline.
enum TimelineStateView {

    static func loading() -> some View {
        VStack(spacing: ZrpSpacing.md) {
            ProgressView().tint(ZrpColor.red)
            Text(.actionLoading)
                .font(.footnote)
                .foregroundStyle(ZrpColor.onSurfaceMuted)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    static func error(_ error: ApiError, retry: (() -> Void)?) -> some View {
        VStack(spacing: ZrpSpacing.lg) {
            Image(systemName: error == .offline ? "wifi.slash" : "exclamationmark.triangle")
                .font(.largeTitle)
                .foregroundStyle(ZrpColor.onSurfaceMuted)

            Text(verbatim: error.userFacingMessage)
                .font(.subheadline)
                .foregroundStyle(ZrpColor.onSurfaceMuted)
                .multilineTextAlignment(.center)

            if error.isRetryable, let retry {
                Button(action: retry) {
                    Text(.feedTryAgain)
                        .font(.subheadline.weight(.semibold))
                        .padding(.horizontal, ZrpSpacing.xl)
                        .frame(minHeight: ZrpMetrics.minTouchTarget)
                        .background(ZrpColor.red)
                        .foregroundStyle(.white)
                        .clipShape(Capsule())
                }
            }
        }
        .padding(ZrpSpacing.xl)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    static func empty(
        systemImage: String,
        title: L10nKey,
        subtitle: L10nKey?
    ) -> some View {
        VStack(spacing: ZrpSpacing.md) {
            Image(systemName: systemImage)
                .font(.largeTitle)
                .foregroundStyle(ZrpColor.onSurfaceMuted)

            Text(title)
                .font(.headline)
                .foregroundStyle(ZrpColor.onSurface)

            if let subtitle {
                Text(subtitle)
                    .font(.subheadline)
                    .foregroundStyle(ZrpColor.onSurfaceMuted)
                    .multilineTextAlignment(.center)
            }
        }
        .padding(ZrpSpacing.xl)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
}
