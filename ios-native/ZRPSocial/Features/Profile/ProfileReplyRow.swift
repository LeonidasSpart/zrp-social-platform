import SwiftUI

/// One row of a profile's Replies tab.
///
/// The replies route sends the comment and just enough of the post it
/// answers - an id, the text, and the author's names - so the context is
/// shown as a quoted line rather than a second card the data could not
/// fill. Tapping anywhere opens the post, which is where the reply
/// actually lives and where it can be liked, edited or replied to.
struct ProfileReplyRow: View {

    let reply: ProfileReply

    @EnvironmentObject private var navigator: Navigator

    var body: some View {
        Button {
            navigator.push(.postDetail(postId: reply.postId, preloaded: nil))
        } label: {
            VStack(alignment: .leading, spacing: ZrpSpacing.sm) {
                if let target = reply.replyTo {
                    HStack(spacing: ZrpSpacing.xs) {
                        Image(systemName: "arrowshape.turn.up.left")
                            .font(.caption2)
                        Text(.iosCommentReplyingTo, ["name": target.author.displayName])
                            .font(.caption)
                    }
                    .foregroundStyle(ZrpColor.onSurfaceMuted)

                    Text(verbatim: target.content)
                        .font(.footnote)
                        .foregroundStyle(ZrpColor.onSurfaceMuted)
                        .lineLimit(2)
                        .padding(.leading, ZrpSpacing.md)
                        .overlay(alignment: .leading) {
                            Rectangle()
                                .fill(ZrpColor.outline)
                                .frame(width: 1)
                                .accessibilityHidden(true)
                        }
                }

                HStack(spacing: ZrpSpacing.sm) {
                    AvatarView(
                        url: reply.author.avatarUrl,
                        displayName: reply.author.displayName,
                        size: ZrpMetrics.avatarSmall
                    )
                    Text(verbatim: reply.author.displayName)
                        .font(.footnote.weight(.semibold))
                        .foregroundStyle(ZrpColor.onSurface)
                        .lineLimit(1)
                    VerifiedBadge(badgeType: reply.author.badgeType, size: 12)
                    Spacer(minLength: 0)
                    Text(verbatim: RelativeTime.compact(from: reply.createdAt))
                        .font(.caption2)
                        .foregroundStyle(ZrpColor.onSurfaceMuted)
                }

                Text(verbatim: reply.content)
                    .font(.subheadline)
                    .foregroundStyle(ZrpColor.onSurface)
                    .fixedSize(horizontal: false, vertical: true)
            }
            .padding(ZrpSpacing.lg)
            .frame(maxWidth: .infinity, alignment: .leading)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .overlay(alignment: .bottom) {
            Rectangle().fill(ZrpColor.outlineFaint).frame(height: 0.5)
        }
        .accessibilityElement(children: .combine)
    }
}
