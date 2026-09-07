import SwiftUI

/// Blocked or muted users.
///
/// One screen for both: `GET /api/users/blocked` and `/api/users/muted`
/// return the same flattened shape, and each list's only action is to
/// undo itself. The two differ in what they mean, which the explanation
/// line states in the site's own words.
struct ModerationListView: View {

    enum Kind {
        case blocked
        case muted

        var titleKey: L10nKey {
            switch self {
            case .blocked: return .blockedTitle
            case .muted: return .mutedTitle
            }
        }

        var explanationKey: L10nKey {
            switch self {
            case .blocked: return .blockedExplanation
            case .muted: return .mutedExplanation
            }
        }

        var emptyTitleKey: L10nKey {
            switch self {
            case .blocked: return .blockedEmptyTitle
            case .muted: return .mutedEmptyTitle
            }
        }

        var emptyBodyKey: L10nKey {
            switch self {
            case .blocked: return .blockedEmptyDesc
            case .muted: return .mutedEmptyDesc
            }
        }

        var undoKey: L10nKey {
            switch self {
            case .blocked: return .blockedUnblock
            case .muted: return .mutedUnmute
            }
        }

        var sinceKey: L10nKey {
            switch self {
            case .blocked: return .blockedBlockedOn
            case .muted: return .mutedMutedOn
            }
        }

        var undoErrorKey: L10nKey {
            switch self {
            case .blocked: return .blockedErrUnblock
            case .muted: return .mutedErrUnmute
            }
        }

        var systemImage: String {
            switch self {
            case .blocked: return "nosign"
            case .muted: return "speaker.slash"
            }
        }
    }

    let kind: Kind

    @EnvironmentObject private var navigator: Navigator
    @State private var users: [ModeratedUser]?
    @State private var loadError: ApiError?
    @State private var actionError: String?
    @State private var working: Set<String> = []

    private let repository = SettingsRepository()

    var body: some View {
        Group {
            if let loadError, users == nil {
                TimelineStateView.error(loadError) { Task { await load() } }
            } else if let users {
                if users.isEmpty {
                    TimelineStateView.empty(
                        systemImage: kind.systemImage,
                        title: kind.emptyTitleKey,
                        subtitle: kind.emptyBodyKey
                    )
                } else {
                    list(users)
                }
            } else {
                TimelineStateView.loading()
            }
        }
        .background(ZrpColor.background.ignoresSafeArea())
        .navigationTitle(Text(kind.titleKey))
        .navigationBarTitleDisplayMode(.inline)
        .task { await load() }
    }

    private func load() async {
        do {
            users = kind == .blocked
                ? try await repository.blockedUsers()
                : try await repository.mutedUsers()
            loadError = nil
        } catch {
            loadError = error as? ApiError ?? .transport(underlying: "\(error)")
        }
    }

    private func list(_ users: [ModeratedUser]) -> some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 0) {
                Text(kind.explanationKey)
                    .font(.footnote)
                    .foregroundStyle(ZrpColor.onSurfaceMuted)
                    .fixedSize(horizontal: false, vertical: true)
                    .padding(.horizontal, ZrpSpacing.lg)
                    .padding(.vertical, ZrpSpacing.md)

                if let actionError {
                    Text(verbatim: actionError)
                        .font(.footnote)
                        .foregroundStyle(ZrpColor.red)
                        .padding(.horizontal, ZrpSpacing.lg)
                        .padding(.bottom, ZrpSpacing.sm)
                }

                ForEach(users) { user in
                    row(user)
                    Divider().overlay(ZrpColor.outlineFaint)
                }
            }
            .frame(maxWidth: ZrpMetrics.contentMaxWidth)
            .frame(maxWidth: .infinity)
        }
        .refreshable { await load() }
    }

    private func row(_ user: ModeratedUser) -> some View {
        HStack(spacing: ZrpSpacing.md) {
            Button {
                navigator.push(.profile(username: user.username))
            } label: {
                HStack(spacing: ZrpSpacing.md) {
                    AvatarView(
                        url: user.avatarUrl,
                        displayName: user.displayName,
                        size: ZrpMetrics.avatarMedium
                    )
                    VStack(alignment: .leading, spacing: 2) {
                        Text(verbatim: user.displayName)
                            .font(.subheadline.weight(.semibold))
                            .foregroundStyle(ZrpColor.onSurface)
                            .lineLimit(1)
                        if let since = user.since {
                            Text(kind.sinceKey, ["date": ModerationDateFormat.day(since)])
                                .font(.caption)
                                .foregroundStyle(ZrpColor.onSurfaceMuted)
                        }
                    }
                    Spacer(minLength: 0)
                }
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)

            Button {
                undo(user)
            } label: {
                Text(kind.undoKey)
                    .font(.footnote.weight(.semibold))
                    .padding(.horizontal, ZrpSpacing.md)
                    .frame(minHeight: ZrpMetrics.minTouchTarget)
                    .background(ZrpColor.surfaceHighest)
                    .foregroundStyle(ZrpColor.onSurface)
                    .clipShape(Capsule())
            }
            .buttonStyle(.plain)
            .disabled(working.contains(user.id))
        }
        .padding(.horizontal, ZrpSpacing.lg)
        .padding(.vertical, ZrpSpacing.md)
    }

    /// Both routes are toggles, so undoing is the same call that created
    /// the entry. The row is removed only once the server confirms the
    /// new state - an optimistic removal here would hide a failure that
    /// leaves the person still blocked.
    private func undo(_ user: ModeratedUser) {
        working.insert(user.id)
        Task {
            defer { working.remove(user.id) }
            do {
                let stillOn: Bool
                switch kind {
                case .blocked:
                    stillOn = try await repository.toggleBlock(username: user.username)
                case .muted:
                    stillOn = try await repository.toggleMute(userId: user.id)
                }
                if !stillOn {
                    users?.removeAll { $0.id == user.id }
                    actionError = nil
                }
            } catch {
                actionError = (error as? ApiError)?.serverMessage
                    ?? L10n.string(kind.undoErrorKey)
            }
        }
    }
}

enum ModerationDateFormat {
    /// A plain calendar date in the viewer's locale - these lines say
    /// when something happened, not how long ago.
    static func day(_ date: Date) -> String {
        date.formatted(.dateTime.locale(L10n.activeLocale).year().month().day())
    }
}
