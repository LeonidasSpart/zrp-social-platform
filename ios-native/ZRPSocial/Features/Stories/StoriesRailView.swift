import SwiftUI

/// The horizontal rail of story rings above the feed.
///
/// Renders nothing at all when there are no unexpired stories, rather
/// than an empty strip: `GET /api/stories` returns only the viewer's own
/// stories and those of accounts they follow, so an empty result is the
/// normal state for a new account.
struct StoriesRailView: View {

    let groups: [StoryGroup]
    let onOpen: (StoryGroup) -> Void
    let onCreate: () -> Void

    @EnvironmentObject private var session: SessionController

    private let ringSize: CGFloat = 62

    var body: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: ZrpSpacing.md) {
                createButton
                ForEach(groups) { group in
                    ring(for: group)
                }
            }
            .padding(.horizontal, ZrpSpacing.lg)
            .padding(.vertical, ZrpSpacing.md)
        }
        .background(ZrpColor.background)
        .overlay(alignment: .bottom) {
            Rectangle().fill(ZrpColor.outlineFaint).frame(height: 0.5)
        }
    }

    private var createButton: some View {
        Button(action: onCreate) {
            VStack(spacing: ZrpSpacing.xs) {
                ZStack(alignment: .bottomTrailing) {
                    AvatarView(
                        url: session.currentUser?.avatarUrl,
                        displayName: session.currentUser?.displayName ?? "",
                        size: ringSize - 6
                    )
                    Image(systemName: "plus.circle.fill")
                        .font(.system(size: 20))
                        .foregroundStyle(ZrpColor.red, ZrpColor.background)
                }
                .frame(width: ringSize, height: ringSize)

                Text(.storiesYourStory)
                    .font(.caption2)
                    .foregroundStyle(ZrpColor.onSurfaceMuted)
                    .lineLimit(1)
            }
            .frame(width: 72)
        }
        .buttonStyle(.plain)
        .accessibilityLabel(Text(.storiesAddStory))
    }

    private func ring(for group: StoryGroup) -> some View {
        Button {
            onOpen(group)
        } label: {
            VStack(spacing: ZrpSpacing.xs) {
                AvatarView(
                    url: group.user.avatarUrl,
                    displayName: group.user.displayName,
                    size: ringSize - 8
                )
                .padding(3)
                .overlay(
                    Circle().strokeBorder(
                        // A fully-seen group drops to a flat outline, the
                        // same signal the web and Android rails use.
                        group.isFullyViewed
                            ? AnyShapeStyle(ZrpColor.outline)
                            : AnyShapeStyle(
                                LinearGradient(
                                    colors: [ZrpColor.red, ZrpColor.darkRed],
                                    startPoint: .topLeading,
                                    endPoint: .bottomTrailing
                                )
                            ),
                        lineWidth: group.isFullyViewed ? 1.5 : 2.5
                    )
                )
                .frame(width: ringSize, height: ringSize)

                Text(verbatim: group.user.displayName)
                    .font(.caption2)
                    .foregroundStyle(ZrpColor.onSurfaceMuted)
                    .lineLimit(1)
            }
            .frame(width: 72)
        }
        .buttonStyle(.plain)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(Text(.iosA11yStoryOf, ["name": group.user.displayName]))
        .accessibilityAddTraits(.isButton)
    }
}
