import SwiftUI
import UIKit

/// One post in a timeline.
///
/// Every control here performs a real backend action or is not rendered
/// as a control at all. Where a destination does not exist yet (a profile
/// screen, a comment thread), the affordance is shown as plain text
/// rather than a button that would do nothing when tapped.
struct PostCardView: View {

    let post: Post
    let interaction: PostInteraction
    let isOwnPost: Bool

    var onLike: () -> Void
    var onRepost: () -> Void
    var onBookmark: () -> Void
    var onDelete: () -> Void

    /// Opening the composer belongs to the host screen, which owns the
    /// sheet - a card inside a `LazyVStack` presenting its own would
    /// tear down mid-presentation as rows recycle.
    var onQuote: () -> Void = {}
    var onEdit: () -> Void = {}

    @State private var isConfirmingDelete = false
    @EnvironmentObject private var navigator: Navigator

    /// The canonical web URL for a post - what Share hands to other apps,
    /// and what "Copy link" copies. Same path the website itself uses.
    private var shareURL: URL? {
        URL(string: "https://zrp.one/post/\(post.id)")
    }

    var body: some View {
        VStack(alignment: .leading, spacing: ZrpSpacing.md) {
            header
            // The edited text when the viewer has edited this post,
            // otherwise what the server sent.
            let displayed = interaction.contentOverride ?? post.content
            if !displayed.isEmpty {
                LinkifiedText(
                    content: displayed,
                    onHashtag: { navigator.push(.hashtag(tag: $0)) },
                    onMention: { navigator.push(.profile(username: $0)) }
                )
            }
            media
            quotedPost
            actionBar
        }
        .padding(ZrpSpacing.lg)
        .background(ZrpColor.surface)
        .overlay(alignment: .bottom) {
            Rectangle()
                .fill(ZrpColor.outlineFaint)
                .frame(height: 0.5)
        }
        .confirmationDialog(
            Text(.iosPostDeleteConfirmTitle),
            isPresented: $isConfirmingDelete,
            titleVisibility: .visible
        ) {
            Button(role: .destructive) { onDelete() } label: { Text(.actionDelete) }
            Button(role: .cancel) {} label: { Text(.actionCancel) }
        } message: {
            Text(.iosPostDeleteConfirmMessage)
        }
    }

    // MARK: - Header

    private var header: some View {
        HStack(alignment: .top, spacing: ZrpSpacing.md) {
            Button {
                navigator.push(.profile(username: post.author.username))
            } label: {
                AvatarView(
                    url: post.author.avatarUrl,
                    displayName: post.author.displayName,
                    size: ZrpMetrics.avatarMedium
                )
            }
            .buttonStyle(.plain)
            .accessibilityLabel(
                Text(.iosA11yOpenProfile, ["name": post.author.displayName])
            )

            VStack(alignment: .leading, spacing: 2) {
                Button {
                    navigator.push(.profile(username: post.author.username))
                } label: {
                    HStack(spacing: ZrpSpacing.xs) {
                        Text(verbatim: post.author.displayName)
                            .font(.subheadline.weight(.semibold))
                            .foregroundStyle(ZrpColor.onSurface)
                            .lineLimit(1)

                        VerifiedBadge(badgeType: post.author.badgeType)

                        Text(verbatim: post.author.handle)
                            .font(.subheadline)
                            .foregroundStyle(ZrpColor.onSurfaceMuted)
                            .lineLimit(1)
                            .layoutPriority(-1)
                    }
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityLabel(
                    Text(.iosA11yOpenProfile, ["name": post.author.displayName])
                )

                Text(verbatim: RelativeTime.compact(from: post.createdAt))
                    .font(.caption)
                    .foregroundStyle(ZrpColor.onSurfaceMuted)
                    .accessibilityLabel(
                        Text(verbatim: RelativeTime.accessible(from: post.createdAt))
                    )
            }
            .frame(maxWidth: .infinity, alignment: .leading)

            overflowMenu
        }
    }

    private var overflowMenu: some View {
        Menu {
            if let shareURL {
                Button {
                    UIPasteboard.general.url = shareURL
                } label: {
                    Label { Text(.iosPostCopyLink) } icon: { Image(systemName: "link") }
                }
            }
            if isOwnPost {
                // Editing and deletion are both author-only and enforced
                // server-side with a 403; these items only hide what the
                // backend would refuse anyway.
                Button(action: onEdit) {
                    Label { Text(.actionEdit) } icon: { Image(systemName: "pencil") }
                }
                Button(role: .destructive) {
                    isConfirmingDelete = true
                } label: {
                    Label { Text(.actionDelete) } icon: { Image(systemName: "trash") }
                }
            }
        } label: {
            Image(systemName: "ellipsis")
                .font(.subheadline)
                .foregroundStyle(ZrpColor.onSurfaceMuted)
                .frame(width: ZrpMetrics.minTouchTarget, height: ZrpMetrics.minTouchTarget)
                .contentShape(Rectangle())
        }
        .accessibilityLabel(Text(.iosA11yPostOptions))
    }

    // MARK: - Body content

    @ViewBuilder
    private var media: some View {
        let urls = post.galleryImageURLs
        if !urls.isEmpty {
            MediaGalleryView(imageURLs: urls, isVideo: PostMedia.isVideo(post))
        }
    }

    @ViewBuilder
    private var quotedPost: some View {
        if let quoted = post.quotePost {
            VStack(alignment: .leading, spacing: ZrpSpacing.sm) {
                HStack(spacing: ZrpSpacing.sm) {
                    Button {
                        navigator.push(.profile(username: quoted.author.username))
                    } label: {
                        HStack(spacing: ZrpSpacing.sm) {
                            AvatarView(
                                url: quoted.author.avatarUrl,
                                displayName: quoted.author.displayName,
                                size: ZrpMetrics.avatarSmall
                            )
                            Text(verbatim: quoted.author.displayName)
                                .font(.footnote.weight(.semibold))
                                .foregroundStyle(ZrpColor.onSurface)
                                .lineLimit(1)
                            VerifiedBadge(badgeType: quoted.author.badgeType, size: 12)
                            Text(verbatim: quoted.author.handle)
                                .font(.footnote)
                                .foregroundStyle(ZrpColor.onSurfaceMuted)
                                .lineLimit(1)
                                .layoutPriority(-1)
                        }
                        .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel(
                        Text(.iosA11yOpenProfile, ["name": quoted.author.displayName])
                    )

                    Spacer(minLength: 0)

                    Text(verbatim: RelativeTime.compact(from: quoted.createdAt))
                        .font(.caption2)
                        .foregroundStyle(ZrpColor.onSurfaceMuted)
                }

                if !quoted.content.isEmpty {
                    Text(verbatim: quoted.content)
                        .font(.footnote)
                        .foregroundStyle(ZrpColor.onSurface)
                        .lineLimit(6)
                }

                let quotedURLs = quoted.imageUrls.flatMap { $0.isEmpty ? nil : $0 }
                    ?? [quoted.imageUrl].compactMap { $0 }
                if !quotedURLs.isEmpty {
                    MediaGalleryView(
                        imageURLs: quotedURLs,
                        isVideo: PostMedia.isVideo(quoted),
                        cornerRadius: ZrpRadius.sm
                    )
                }
            }
            .padding(ZrpSpacing.md)
            .frame(maxWidth: .infinity, alignment: .leading)
            .overlay(
                RoundedRectangle(cornerRadius: ZrpRadius.md, style: .continuous)
                    .strokeBorder(ZrpColor.outline, lineWidth: 1)
            )
            .accessibilityElement(children: .contain)
        }
    }

    // MARK: - Actions

    private var actionBar: some View {
        HStack(spacing: 0) {
            actionButton(
                systemImage: "bubble.left",
                isActive: false,
                activeTint: ZrpColor.onSurfaceMuted,
                count: post.counts.comments,
                label: L10n.string(.actionReply),
                disabledWhileMutating: false,
                action: {
                    navigator.push(.postDetail(postId: post.id, preloaded: post))
                }
            )

            Spacer(minLength: 0)

            Menu {
                Button {
                    UIImpactFeedbackGenerator(style: .light).impactOccurred()
                    onRepost()
                } label: {
                    Label {
                        Text((interaction.reposted ?? false)
                            ? L10nKey.iosA11yUndoRepost
                            : L10nKey.iosPostRepostAction)
                    } icon: {
                        Image(systemName: "arrow.2.squarepath")
                    }
                }
                Button(action: onQuote) {
                    Label { Text(.iosPostQuote) } icon: { Image(systemName: "quote.bubble") }
                }
            } label: {
                HStack(spacing: ZrpSpacing.xs) {
                    Image(systemName: "arrow.2.squarepath")
                        .font(.subheadline)
                    if let text = CountFormatting.compact(interaction.repostCount) {
                        Text(verbatim: text)
                            .font(.footnote)
                            .monospacedDigit()
                    }
                }
                .foregroundStyle(
                    (interaction.reposted ?? false) ? ZrpColor.green : ZrpColor.onSurfaceMuted
                )
                .frame(minWidth: ZrpMetrics.minTouchTarget, minHeight: ZrpMetrics.minTouchTarget)
                .contentShape(Rectangle())
            }
            .disabled(interaction.isMutating)
            .accessibilityLabel(Text(.iosA11yRepostOptions))
            .accessibilityValue(
                Text(verbatim: CountFormatting.exact(interaction.repostCount))
            )

            Spacer(minLength: 0)

            actionButton(
                systemImage: interaction.liked ? "heart.fill" : "heart",
                isActive: interaction.liked,
                activeTint: ZrpColor.red,
                count: interaction.likeCount,
                label: interaction.liked
                    ? L10n.string(.iosA11yUnlike)
                    : L10n.string(.actionLike),
                action: onLike
            )

            Spacer(minLength: 0)

            actionButton(
                systemImage: (interaction.bookmarked ?? false) ? "bookmark.fill" : "bookmark",
                isActive: interaction.bookmarked ?? false,
                activeTint: ZrpColor.blue,
                count: nil,
                label: (interaction.bookmarked ?? false)
                    ? L10n.string(.iosA11yRemoveBookmark)
                    : L10n.string(.iosA11yBookmark),
                action: onBookmark
            )

            Spacer(minLength: 0)

            if let shareURL {
                ShareLink(item: shareURL) {
                    Image(systemName: "square.and.arrow.up")
                        .font(.subheadline)
                        .foregroundStyle(ZrpColor.onSurfaceMuted)
                        .frame(minWidth: ZrpMetrics.minTouchTarget, minHeight: ZrpMetrics.minTouchTarget)
                        .contentShape(Rectangle())
                }
                .accessibilityLabel(Text(.profileShare))
            }
        }
        .padding(.top, ZrpSpacing.xs)
    }

    private func actionButton(
        systemImage: String,
        isActive: Bool,
        activeTint: Color,
        count: Int?,
        label: String,
        // Navigation is not a mutation, so the comment button must stay
        // usable while a like or repost is still in flight.
        disabledWhileMutating: Bool = true,
        action: @escaping () -> Void
    ) -> some View {
        Button {
            // Light haptic on a social action, matching the weight of the
            // gesture. Deliberately not used on every tap in the app -
            // constant feedback stops meaning anything.
            UIImpactFeedbackGenerator(style: .light).impactOccurred()
            action()
        } label: {
            HStack(spacing: ZrpSpacing.xs) {
                Image(systemName: systemImage)
                    .font(.subheadline)
                if let count, let text = CountFormatting.compact(count) {
                    Text(verbatim: text)
                        .font(.footnote)
                        .monospacedDigit()
                }
            }
            .foregroundStyle(isActive ? activeTint : ZrpColor.onSurfaceMuted)
            .frame(minWidth: ZrpMetrics.minTouchTarget, minHeight: ZrpMetrics.minTouchTarget)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .disabled(disabledWhileMutating && interaction.isMutating)
        .accessibilityLabel(Text(verbatim: label))
        .accessibilityValue(
            Text(verbatim: count.map { CountFormatting.exact($0) } ?? "")
        )
    }

}
