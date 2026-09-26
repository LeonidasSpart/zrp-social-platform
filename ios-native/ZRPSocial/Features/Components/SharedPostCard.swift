import SwiftUI

/// What the first link in a chat message points at on ZRP, if anything.
///
/// Reuses the same extractor a post's own unfurl uses and the same
/// deep-link parser a tapped link uses, so the three agree on which link
/// a message carries and where it leads. Mirrors the website's
/// `classifyInternalLink` (`src/lib/link-preview-internal.ts`): a post
/// and a profile get a native card built from the live API; any other
/// zrp.one page gets no unfurl at all, because `/api/link-preview` can
/// never read ZRP's own pages (its SSRF guard rejects the server's own
/// origin) and the link text is already tappable and routes in-app.
enum SharedZrpLink: Equatable {
    case post(id: String)
    case profile(username: String)
    case other

    /// `nil` when the message's first link is not on zrp.one at all.
    static func classify(in content: String) -> SharedZrpLink? {
        guard
            let raw = FirstURL.first(in: content),
            let url = URL(string: raw),
            DeepLink.isZrpHost(url)
        else {
            return nil
        }
        switch DeepLink.target(for: url)?.route {
        case .postDetail(let id, _, _)?:
            return .post(id: id)
        case .profile(let username)?:
            return .profile(username: username)
        default:
            return .other
        }
    }
}

/// A ZRP post shared into a chat, drawn as a real post card.
///
/// "Send in Message" on every ZRP client sends the post's canonical URL
/// (`https://zrp.one/post/{id}`) as the message body - see
/// `SharePostModal.tsx`, which is the only way a post reaches a DM. Until
/// now this app showed that as a bare link plus whatever the generic
/// unfurl route could scrape from the web page, and tapping the card
/// opened Safari. This fetches the post itself from `GET /api/posts/{id}`
/// and renders the author, text and first picture natively; tapping
/// anywhere on it opens the post in-app, exactly as the quoted-post block
/// in a timeline does.
///
/// A post that cannot be loaded because it is gone or the viewer may not
/// see it (the route answers 404, or 403 for a private author) is shown
/// as an honest "no longer available" card rather than a spinner that
/// never ends or a card that navigates to an error screen.
struct SharedPostCard: View {

    let postId: String

    /// Opens the post. The card never navigates on its own: the host
    /// owns the navigator, exactly as `LinkifiedText` hands ZRP links
    /// back to its host.
    let onOpen: (Post) -> Void

    @State private var phase: Phase = .loading

    private let repository = PostsRepository()

    private enum Phase: Equatable {
        case loading
        case loaded(Post)
        /// The post is gone or hidden from this viewer.
        case unavailable
        /// A transient failure - offline, server error.
        case failed
    }

    var body: some View {
        Group {
            switch phase {
            case .loading:
                skeleton
            case .loaded(let post):
                card(post)
            case .unavailable:
                notice(.iosChatSharedPostUnavailable, systemImage: "eye.slash")
            case .failed:
                notice(.postDetailErrLoadFailed, systemImage: "exclamationmark.triangle")
            }
        }
        .frame(maxWidth: 280, alignment: .leading)
        .task(id: postId) { await load() }
    }

    private func load() async {
        phase = .loading
        do {
            phase = .loaded(try await repository.post(id: postId))
        } catch let error as ApiError {
            switch error {
            case .notFound, .forbidden:
                phase = .unavailable
            case .cancelled:
                return
            default:
                phase = .failed
            }
        } catch {
            phase = .failed
        }
    }

    // MARK: -

    private func card(_ post: Post) -> some View {
        Button {
            onOpen(post)
        } label: {
            VStack(alignment: .leading, spacing: ZrpSpacing.sm) {
                Label {
                    Text(.iosChatSharedPost)
                } icon: {
                    Image(systemName: "arrowshape.turn.up.forward")
                }
                .font(.caption2.weight(.medium))
                .foregroundStyle(ZrpColor.onSurfaceMuted)

                HStack(spacing: ZrpSpacing.sm) {
                    AvatarView(
                        url: post.author.avatarUrl,
                        displayName: post.author.displayName,
                        size: ZrpMetrics.avatarSmall
                    )
                    Text(verbatim: post.author.displayName)
                        .font(.footnote.weight(.semibold))
                        .foregroundStyle(ZrpColor.onSurface)
                        .lineLimit(1)
                    VerifiedBadge(badgeType: post.author.badgeType, size: 12)
                    Text(verbatim: post.author.handle)
                        .font(.footnote)
                        .foregroundStyle(ZrpColor.onSurfaceMuted)
                        .lineLimit(1)
                        .layoutPriority(-1)
                    Spacer(minLength: 0)
                    Text(verbatim: RelativeTime.compact(from: post.createdAt))
                        .font(.caption2)
                        .foregroundStyle(ZrpColor.onSurfaceMuted)
                }

                if !post.content.isEmpty {
                    Text(verbatim: post.content)
                        .font(.footnote)
                        .foregroundStyle(ZrpColor.onSurface)
                        .multilineTextAlignment(.leading)
                        .lineLimit(5)
                }

                if let first = post.galleryImageURLs.first {
                    RemoteImage(url: first, targetSize: 560) {
                        Rectangle().fill(ZrpColor.surfaceHighest)
                    }
                    .aspectRatio(contentMode: .fill)
                    .frame(maxWidth: .infinity)
                    .frame(height: 150)
                    .clipped()
                    .clipShape(RoundedRectangle(cornerRadius: ZrpRadius.sm, style: .continuous))
                    .overlay(alignment: .center) {
                        if PostMedia.isVideo(post) {
                            Image(systemName: "play.circle.fill")
                                .font(.largeTitle)
                                .foregroundStyle(.white)
                                .shadow(radius: 4)
                        }
                    }
                }
            }
            .padding(ZrpSpacing.md)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(ZrpColor.surface)
            .clipShape(RoundedRectangle(cornerRadius: ZrpRadius.md, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: ZrpRadius.md, style: .continuous)
                    .strokeBorder(ZrpColor.outline, lineWidth: 1)
            )
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityElement(children: .combine)
        .accessibilityAddTraits(.isButton)
    }

    /// The same shape as the loaded card, greyed, so the bubble does not
    /// jump in height when the post arrives.
    private var skeleton: some View {
        VStack(alignment: .leading, spacing: ZrpSpacing.sm) {
            HStack(spacing: ZrpSpacing.sm) {
                Circle()
                    .fill(ZrpColor.surfaceHighest)
                    .frame(width: ZrpMetrics.avatarSmall, height: ZrpMetrics.avatarSmall)
                RoundedRectangle(cornerRadius: 4)
                    .fill(ZrpColor.surfaceHighest)
                    .frame(width: 120, height: 12)
            }
            RoundedRectangle(cornerRadius: 4)
                .fill(ZrpColor.surfaceHighest)
                .frame(maxWidth: .infinity)
                .frame(height: 12)
            RoundedRectangle(cornerRadius: 4)
                .fill(ZrpColor.surfaceHighest)
                .frame(width: 160, height: 12)
        }
        .padding(ZrpSpacing.md)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(ZrpColor.surface)
        .clipShape(RoundedRectangle(cornerRadius: ZrpRadius.md, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: ZrpRadius.md, style: .continuous)
                .strokeBorder(ZrpColor.outline, lineWidth: 1)
        )
        .accessibilityLabel(Text(.actionLoading))
    }

    private func notice(_ key: L10nKey, systemImage: String) -> some View {
        Label {
            Text(key)
                .font(.footnote)
                .multilineTextAlignment(.leading)
        } icon: {
            Image(systemName: systemImage)
        }
        .foregroundStyle(ZrpColor.onSurfaceMuted)
        .padding(ZrpSpacing.md)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(ZrpColor.surface)
        .clipShape(RoundedRectangle(cornerRadius: ZrpRadius.md, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: ZrpRadius.md, style: .continuous)
                .strokeBorder(ZrpColor.outline, lineWidth: 1)
        )
    }
}

/// A ZRP profile linked from a chat message, drawn as a real card.
///
/// The profile counterpart of `SharedPostCard`: built from
/// `GET /api/users/{username}`, and opens the profile in-app when
/// tapped. A private or missing account (403/404) is stated honestly.
struct SharedProfileCard: View {

    let username: String
    let onOpen: (String) -> Void

    @State private var phase: Phase = .loading

    private let repository = UsersRepository()

    private enum Phase: Equatable {
        case loading
        case loaded(UserProfile)
        case unavailable
        case failed
    }

    var body: some View {
        Group {
            switch phase {
            case .loading:
                skeleton
            case .loaded(let profile):
                card(profile)
            case .unavailable:
                notice(.iosChatSharedPostUnavailable, systemImage: "eye.slash")
            case .failed:
                notice(.profileErrLoadPosts, systemImage: "exclamationmark.triangle")
            }
        }
        .frame(maxWidth: 280, alignment: .leading)
        .task(id: username) { await load() }
    }

    private func load() async {
        phase = .loading
        do {
            phase = .loaded(try await repository.profile(username: username))
        } catch let error as ApiError {
            switch error {
            case .notFound, .forbidden:
                phase = .unavailable
            case .cancelled:
                return
            default:
                phase = .failed
            }
        } catch {
            phase = .failed
        }
    }

    private func card(_ profile: UserProfile) -> some View {
        Button {
            onOpen(profile.username)
        } label: {
            HStack(alignment: .top, spacing: ZrpSpacing.md) {
                AvatarView(
                    url: profile.avatarUrl,
                    displayName: profile.displayName,
                    size: ZrpMetrics.avatarMedium
                )
                VStack(alignment: .leading, spacing: 2) {
                    HStack(spacing: ZrpSpacing.xs) {
                        Text(verbatim: profile.displayName)
                            .font(.footnote.weight(.semibold))
                            .foregroundStyle(ZrpColor.onSurface)
                            .lineLimit(1)
                        VerifiedBadge(badgeType: profile.badgeType, size: 12)
                    }
                    Text(verbatim: profile.handle)
                        .font(.caption)
                        .foregroundStyle(ZrpColor.onSurfaceMuted)
                        .lineLimit(1)
                    if let bio = profile.bio, !bio.isEmpty {
                        Text(verbatim: bio)
                            .font(.caption)
                            .foregroundStyle(ZrpColor.onSurface)
                            .multilineTextAlignment(.leading)
                            .lineLimit(2)
                            .padding(.top, 2)
                    }
                }
                Spacer(minLength: 0)
            }
            .padding(ZrpSpacing.md)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(ZrpColor.surface)
            .clipShape(RoundedRectangle(cornerRadius: ZrpRadius.md, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: ZrpRadius.md, style: .continuous)
                    .strokeBorder(ZrpColor.outline, lineWidth: 1)
            )
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityElement(children: .combine)
        .accessibilityAddTraits(.isButton)
    }

    private var skeleton: some View {
        HStack(spacing: ZrpSpacing.md) {
            Circle()
                .fill(ZrpColor.surfaceHighest)
                .frame(width: ZrpMetrics.avatarMedium, height: ZrpMetrics.avatarMedium)
            VStack(alignment: .leading, spacing: ZrpSpacing.xs) {
                RoundedRectangle(cornerRadius: 4)
                    .fill(ZrpColor.surfaceHighest)
                    .frame(width: 120, height: 12)
                RoundedRectangle(cornerRadius: 4)
                    .fill(ZrpColor.surfaceHighest)
                    .frame(width: 80, height: 10)
            }
        }
        .padding(ZrpSpacing.md)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(ZrpColor.surface)
        .clipShape(RoundedRectangle(cornerRadius: ZrpRadius.md, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: ZrpRadius.md, style: .continuous)
                .strokeBorder(ZrpColor.outline, lineWidth: 1)
        )
        .accessibilityLabel(Text(.actionLoading))
    }

    private func notice(_ key: L10nKey, systemImage: String) -> some View {
        Label {
            Text(key)
                .font(.footnote)
                .multilineTextAlignment(.leading)
        } icon: {
            Image(systemName: systemImage)
        }
        .foregroundStyle(ZrpColor.onSurfaceMuted)
        .padding(ZrpSpacing.md)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(ZrpColor.surface)
        .clipShape(RoundedRectangle(cornerRadius: ZrpRadius.md, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: ZrpRadius.md, style: .continuous)
                .strokeBorder(ZrpColor.outline, lineWidth: 1)
        )
    }
}
