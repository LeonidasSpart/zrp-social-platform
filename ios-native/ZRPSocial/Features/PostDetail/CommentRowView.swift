import SwiftUI
import UIKit

/// One comment in a thread.
///
/// Nesting is shown with a leading indent and a rule rather than nested
/// containers: a thread can be arbitrarily deep, and stacked containers
/// would push the text off a phone screen within a few levels.
struct CommentRowView: View {

    let comment: Comment
    let depth: Int
    let interaction: CommentInteraction
    let isOwnComment: Bool

    var onLike: () -> Void
    var onReply: () -> Void
    var onEdit: () -> Void
    var onDelete: () -> Void

    @EnvironmentObject private var navigator: Navigator
    @State private var isConfirmingDelete = false
    @State private var isReporting = false

    /// Indentation stops growing after four levels. Deeper replies stay
    /// readable on a 320-point screen instead of collapsing into a
    /// column two words wide.
    private var indent: CGFloat {
        CGFloat(min(depth, 4)) * ZrpSpacing.lg
    }

    var body: some View {
        HStack(alignment: .top, spacing: 0) {
            if depth > 0 {
                Rectangle()
                    .fill(ZrpColor.outline)
                    .frame(width: 1)
                    .padding(.leading, indent)
                    .padding(.trailing, ZrpSpacing.md)
                    .accessibilityHidden(true)
            }

            VStack(alignment: .leading, spacing: ZrpSpacing.sm) {
                header
                Text(verbatim: comment.content)
                    .font(.subheadline)
                    .foregroundStyle(ZrpColor.onSurface)
                    .fixedSize(horizontal: false, vertical: true)
                actions
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .padding(.horizontal, ZrpSpacing.lg)
        .padding(.vertical, ZrpSpacing.md)
        .overlay(alignment: .bottom) {
            Rectangle().fill(ZrpColor.outlineFaint).frame(height: 0.5)
        }
        .confirmationDialog(
            Text(.iosCommentDeleteConfirmTitle),
            isPresented: $isConfirmingDelete,
            titleVisibility: .visible
        ) {
            Button(role: .destructive) { onDelete() } label: { Text(.actionDelete) }
            Button(role: .cancel) {} label: { Text(.actionCancel) }
        }
        .sheet(isPresented: $isReporting) {
            ReportSheet(target: .comment(comment.id))
        }
    }

    private var header: some View {
        HStack(spacing: ZrpSpacing.sm) {
            Button {
                navigator.push(.profile(username: comment.author.username))
            } label: {
                HStack(spacing: ZrpSpacing.sm) {
                    AvatarView(
                        url: comment.author.avatarUrl,
                        displayName: comment.author.displayName,
                        size: ZrpMetrics.avatarSmall
                    )
                    Text(verbatim: comment.author.displayName)
                        .font(.footnote.weight(.semibold))
                        .foregroundStyle(ZrpColor.onSurface)
                        .lineLimit(1)
                    VerifiedBadge(badgeType: comment.author.badgeType, size: 12)
                }
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel(
                Text(.iosA11yOpenProfile, ["name": comment.author.displayName])
            )

            Spacer(minLength: 0)

            Text(verbatim: RelativeTime.compact(from: comment.createdAt))
                .font(.caption2)
                .foregroundStyle(ZrpColor.onSurfaceMuted)
                .accessibilityLabel(
                    Text(verbatim: RelativeTime.accessible(from: comment.createdAt))
                )

            Menu {
                if isOwnComment {
                    // Editing and deleting are author-only and enforced
                    // server-side with a 403; this menu only hides what
                    // the backend would refuse anyway.
                    Button { onEdit() } label: {
                        Label { Text(.actionEdit) } icon: { Image(systemName: "pencil") }
                    }
                    Button(role: .destructive) {
                        isConfirmingDelete = true
                    } label: {
                        Label { Text(.actionDelete) } icon: { Image(systemName: "trash") }
                    }
                } else {
                    // Reporting your own comment is meaningless when you
                    // can simply delete it.
                    Button { isReporting = true } label: {
                        Label { Text(.reportModalTitle) } icon: { Image(systemName: "flag") }
                    }
                }
            } label: {
                Image(systemName: "ellipsis")
                    .font(.caption)
                    .foregroundStyle(ZrpColor.onSurfaceMuted)
                    .frame(width: ZrpMetrics.minTouchTarget, height: ZrpMetrics.minTouchTarget)
                    .contentShape(Rectangle())
            }
            .accessibilityLabel(Text(.iosA11yPostOptions))
        }
    }

    private var actions: some View {
        HStack(spacing: ZrpSpacing.lg) {
            Button {
                UIImpactFeedbackGenerator(style: .light).impactOccurred()
                onLike()
            } label: {
                HStack(spacing: ZrpSpacing.xs) {
                    Image(systemName: interaction.liked ? "heart.fill" : "heart")
                        .font(.caption)
                    if let count = CountFormatting.compact(interaction.likeCount) {
                        Text(verbatim: count)
                            .font(.caption)
                            .monospacedDigit()
                    }
                }
                .foregroundStyle(interaction.liked ? ZrpColor.red : ZrpColor.onSurfaceMuted)
                .frame(minHeight: ZrpMetrics.minTouchTarget)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .disabled(interaction.isMutating)
            .accessibilityLabel(
                Text(interaction.liked ? L10nKey.iosA11yUnlikeComment : L10nKey.iosA11yLikeComment)
            )
            .accessibilityValue(
                Text(verbatim: CountFormatting.exact(interaction.likeCount))
            )

            Button(action: onReply) {
                Text(.postDetailReply)
                    .font(.caption.weight(.medium))
                    .foregroundStyle(ZrpColor.onSurfaceMuted)
                    .frame(minHeight: ZrpMetrics.minTouchTarget)
                    .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel(
                Text(.iosA11yReplyToComment, ["name": comment.author.displayName])
            )

            Spacer(minLength: 0)
        }
    }
}
