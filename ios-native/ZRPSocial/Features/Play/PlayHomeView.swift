import SwiftUI

@MainActor
final class PlayHomeViewModel: ObservableObject {

    enum Phase: Equatable {
        case idle
        case loading
        case loaded(PlayHome)
        case failed(ApiError)
    }

    @Published private(set) var phase: Phase = .idle

    private let repository: PlayRepositoryProtocol

    init(repository: PlayRepositoryProtocol = PlayRepository()) {
        self.repository = repository
    }

    func loadIfNeeded() async {
        if case .idle = phase { await load() }
    }

    func load() async {
        do {
            phase = .loaded(try await repository.home())
        } catch {
            if case .loaded = phase { return }
            phase = .failed(error as? ApiError ?? .transport(underlying: "\(error)"))
        }
    }
}

/// ZRP PLAY.
///
/// Today's challenge, what is trending, the top of the leaderboard, and
/// the viewer's own standing - all from `GET /api/play/home`, which
/// serves a signed-out reader too with the personal parts absent.
///
/// **Duels are not here.** They need opponent search, an invitation
/// lifecycle (pending / accepted / declined / expired) and a result
/// screen that waits for the other player - a module of their own rather
/// than a corner of this one. Recorded in PARITY.md.
struct PlayHomeView: View {

    @EnvironmentObject private var navigator: Navigator
    @StateObject private var viewModel = PlayHomeViewModel()

    var body: some View {
        Group {
            switch viewModel.phase {
            case .idle, .loading:
                TimelineStateView.loading()
            case .failed(let error):
                TimelineStateView.error(error) {
                    Task { await viewModel.load() }
                }
            case .loaded(let home):
                content(home)
            }
        }
        .background(ZrpColor.background.ignoresSafeArea())
        .navigationTitle(Text(.navPlay))
        .navigationBarTitleDisplayMode(.inline)
        .task { await viewModel.loadIfNeeded() }
    }

    private func content(_ home: PlayHome) -> some View {
        ScrollView {
            VStack(alignment: .leading, spacing: ZrpSpacing.xl) {
                if let profile = home.myProfile {
                    standing(profile)
                }
                daily(home.dailyChallenge)
                trending(home.trending)
                leaderboard(home.topLeaderboard)
            }
            .padding(ZrpSpacing.lg)
            .frame(maxWidth: ZrpMetrics.contentMaxWidth)
            .frame(maxWidth: .infinity)
        }
        .refreshable { await viewModel.load() }
    }

    /// The viewer's level, XP and streak - every figure computed by the
    /// server's own `xpProgress`, never recalculated here. The level
    /// curve is the backend's to define.
    private func standing(_ profile: PlayProfile) -> some View {
        VStack(alignment: .leading, spacing: ZrpSpacing.sm) {
            HStack {
                Text(.playLevel, ["n": CountFormatting.exact(profile.level)])
                    .font(.headline)
                    .foregroundStyle(ZrpColor.onSurface)
                Spacer()
                Text(.playXp, ["n": CountFormatting.exact(profile.totalXp)])
                    .font(.subheadline)
                    .foregroundStyle(ZrpColor.red)
            }

            ProgressView(value: profile.levelFraction)
                .tint(ZrpColor.red)

            HStack(spacing: ZrpSpacing.lg) {
                if let streak = profile.currentStreak {
                    stat(.playLongestStreak, value: streak)
                }
                if let completed = profile.challengesCompleted {
                    stat(.playChallengesCompleted, value: completed)
                }
            }
        }
        .padding(ZrpSpacing.lg)
        .background(ZrpColor.surfaceElevated)
        .clipShape(RoundedRectangle(cornerRadius: ZrpRadius.md, style: .continuous))
        .accessibilityElement(children: .combine)
    }

    private func stat(_ key: L10nKey, value: Int) -> some View {
        VStack(alignment: .leading, spacing: 1) {
            Text(verbatim: CountFormatting.exact(value))
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(ZrpColor.onSurface)
            Text(key)
                .font(.caption2)
                .foregroundStyle(ZrpColor.onSurfaceMuted)
        }
    }

    @ViewBuilder
    private func daily(_ challenge: PlayChallenge?) -> some View {
        VStack(alignment: .leading, spacing: ZrpSpacing.sm) {
            Text(.playTodaysChallenge)
                .font(.headline)
                .foregroundStyle(ZrpColor.onSurface)

            if let challenge {
                Button {
                    navigator.push(.playChallenge(id: challenge.id))
                } label: {
                    PlayChallengeCard(challenge: challenge, isDaily: true)
                }
                .buttonStyle(.plain)
            } else {
                Text(.playNoDailyChallenge)
                    .font(.subheadline)
                    .foregroundStyle(ZrpColor.onSurfaceMuted)
            }
        }
    }

    @ViewBuilder
    private func trending(_ challenges: [PlayChallenge]) -> some View {
        VStack(alignment: .leading, spacing: ZrpSpacing.sm) {
            Text(.playTrending)
                .font(.headline)
                .foregroundStyle(ZrpColor.onSurface)

            if challenges.isEmpty {
                Text(.playNoTrendingYet)
                    .font(.subheadline)
                    .foregroundStyle(ZrpColor.onSurfaceMuted)
            } else {
                ForEach(challenges) { challenge in
                    Button {
                        navigator.push(.playChallenge(id: challenge.id))
                    } label: {
                        PlayChallengeCard(challenge: challenge, isDaily: false)
                    }
                    .buttonStyle(.plain)
                }
            }
        }
    }

    @ViewBuilder
    private func leaderboard(_ entries: [PlayLeaderboardEntry]) -> some View {
        VStack(alignment: .leading, spacing: ZrpSpacing.sm) {
            HStack {
                Text(.playLeaderboard)
                    .font(.headline)
                    .foregroundStyle(ZrpColor.onSurface)
                Spacer()
                Button {
                    navigator.push(.playLeaderboard)
                } label: {
                    Text(.playViewLeaderboard)
                        .font(.footnote.weight(.semibold))
                        .foregroundStyle(ZrpColor.red)
                }
                .buttonStyle(.plain)
            }

            if entries.isEmpty {
                Text(.playNoLeaderboardData)
                    .font(.subheadline)
                    .foregroundStyle(ZrpColor.onSurfaceMuted)
            } else {
                ForEach(entries) { entry in
                    PlayLeaderboardRow(entry: entry)
                }
            }
        }
    }
}

/// One challenge, as a card.
struct PlayChallengeCard: View {

    let challenge: PlayChallenge
    let isDaily: Bool

    var body: some View {
        VStack(alignment: .leading, spacing: ZrpSpacing.xs) {
            HStack(spacing: ZrpSpacing.sm) {
                if let key = challenge.type.titleKey {
                    Text(key)
                        .font(.caption2.weight(.semibold))
                        .foregroundStyle(ZrpColor.red)
                }
                if let key = challenge.difficulty?.titleKey {
                    Text(key)
                        .font(.caption2)
                        .foregroundStyle(ZrpColor.onSurfaceMuted)
                }
                Spacer(minLength: 0)
                if isDaily, challenge.alreadyPlayed == true {
                    Text(.playPlayed)
                        .font(.caption2.weight(.semibold))
                        .foregroundStyle(ZrpColor.green)
                }
            }

            Text(verbatim: challenge.title)
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(ZrpColor.onSurface)
                .multilineTextAlignment(.leading)
                .fixedSize(horizontal: false, vertical: true)

            if let description = challenge.description, !description.isEmpty {
                Text(verbatim: description)
                    .font(.caption)
                    .foregroundStyle(ZrpColor.onSurfaceMuted)
                    .multilineTextAlignment(.leading)
                    .lineLimit(2)
            }

            if let plays = challenge.playCount, plays > 0 {
                Text(.playPlays, ["n": CountFormatting.exact(plays)])
                    .font(.caption2)
                    .foregroundStyle(ZrpColor.onSurfaceMuted)
            }
        }
        .padding(ZrpSpacing.md)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(ZrpColor.surfaceElevated)
        .clipShape(RoundedRectangle(cornerRadius: ZrpRadius.md, style: .continuous))
        .contentShape(Rectangle())
        .accessibilityElement(children: .combine)
    }
}

/// One leaderboard row.
struct PlayLeaderboardRow: View {

    let entry: PlayLeaderboardEntry

    var body: some View {
        HStack(spacing: ZrpSpacing.md) {
            if let rank = entry.rank {
                Text(verbatim: CountFormatting.exact(rank))
                    .font(.subheadline.weight(.bold))
                    .foregroundStyle(ZrpColor.onSurfaceMuted)
                    .frame(minWidth: 24, alignment: .trailing)
            }
            if let user = entry.user {
                AvatarView(
                    url: user.avatarUrl,
                    displayName: user.displayName,
                    size: ZrpMetrics.avatarSmall
                )
                Text(verbatim: user.displayName)
                    .font(.subheadline)
                    .foregroundStyle(ZrpColor.onSurface)
                    .lineLimit(1)
                VerifiedBadge(badgeType: user.badgeType)
            }
            Spacer(minLength: 0)
            Text(.playXp, ["n": CountFormatting.exact(entry.totalXp)])
                .font(.caption)
                .foregroundStyle(ZrpColor.onSurfaceMuted)
        }
        .padding(.vertical, ZrpSpacing.xs)
        .accessibilityElement(children: .combine)
    }
}

/// The full leaderboard.
struct PlayLeaderboardView: View {

    @StateObject private var viewModel = PlayLeaderboardViewModel()

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
                if viewModel.entries.isEmpty {
                    TimelineStateView.empty(
                        systemImage: "trophy",
                        title: .playNoLeaderboardData,
                        subtitle: nil
                    )
                } else {
                    ScrollView {
                        LazyVStack(spacing: 0) {
                            ForEach(viewModel.entries) { entry in
                                PlayLeaderboardRow(entry: entry)
                                    .padding(.horizontal, ZrpSpacing.lg)
                                    .padding(.vertical, ZrpSpacing.sm)
                                    .overlay(alignment: .bottom) {
                                        Rectangle()
                                            .fill(ZrpColor.outlineFaint)
                                            .frame(height: 0.5)
                                    }
                            }
                        }
                        .frame(maxWidth: ZrpMetrics.contentMaxWidth)
                        .frame(maxWidth: .infinity)
                    }
                    .refreshable { await viewModel.load() }
                }
            }
        }
        .background(ZrpColor.background.ignoresSafeArea())
        .navigationTitle(Text(.playLeaderboardTitle))
        .navigationBarTitleDisplayMode(.inline)
        .task { await viewModel.loadIfNeeded() }
    }
}

@MainActor
final class PlayLeaderboardViewModel: ObservableObject {

    enum Phase: Equatable {
        case idle
        case loading
        case loaded
        case failed(ApiError)
    }

    @Published private(set) var entries: [PlayLeaderboardEntry] = []
    @Published private(set) var phase: Phase = .idle

    private let repository: PlayRepositoryProtocol

    init(repository: PlayRepositoryProtocol = PlayRepository()) {
        self.repository = repository
    }

    func loadIfNeeded() async {
        guard phase == .idle else { return }
        await load()
    }

    func load() async {
        if entries.isEmpty { phase = .loading }
        do {
            entries = try await repository.leaderboard()
            phase = .loaded
        } catch {
            if entries.isEmpty {
                phase = .failed(error as? ApiError ?? .transport(underlying: "\(error)"))
            } else {
                phase = .loaded
            }
        }
    }
}
