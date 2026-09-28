import SwiftUI

// MARK: - List

@MainActor
final class PlayDuelsViewModel: ObservableObject {

    enum Phase: Equatable {
        case idle
        case loading
        case loaded
        case failed(ApiError)
    }

    @Published private(set) var phase: Phase = .idle
    @Published private(set) var duels: [PlayDuel] = []
    /// The duel whose accept/decline is currently in flight, so its two
    /// buttons (and only its two) show a spinner rather than the whole
    /// list.
    @Published private(set) var busyDuelId: String?

    private let repository: PlayRepositoryProtocol

    init(repository: PlayRepositoryProtocol = PlayRepository()) {
        self.repository = repository
    }

    func loadIfNeeded() async {
        guard phase == .idle else { return }
        await load()
    }

    func load() async {
        if duels.isEmpty { phase = .loading }
        do {
            duels = try await repository.duels(status: nil)
            phase = .loaded
        } catch {
            if duels.isEmpty {
                phase = .failed(error as? ApiError ?? .transport(underlying: "\(error)"))
            } else {
                phase = .loaded
            }
        }
    }

    var incoming: [PlayDuel] { duels.filter { $0.status == .pending } }
    var active: [PlayDuel] { duels.filter { $0.status == .accepted } }
    var history: [PlayDuel] {
        duels.filter { [.completed, .declined, .expired].contains($0.status) }
    }

    /// `PUT /api/play/duels/{id}`. Reloads afterward regardless of
    /// outcome - matching Android's own `respond()`, which always
    /// re-fetches rather than patching the one row locally, since
    /// accepting also changes what else in the list is now playable.
    func respond(duelId: String, accept: Bool) async {
        busyDuelId = duelId
        _ = try? await repository.respondToDuel(id: duelId, accept: accept)
        busyDuelId = nil
        await load()
    }
}

/// My Duels - ported from PlayDuelsPage.tsx: incoming/active/history
/// sections from the real `GET /api/play/duels`.
struct PlayDuelsView: View {

    @EnvironmentObject private var navigator: Navigator
    @EnvironmentObject private var session: SessionController
    @StateObject private var viewModel = PlayDuelsViewModel()

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
                if viewModel.duels.isEmpty {
                    TimelineStateView.empty(
                        systemImage: "flag.2.crossed",
                        title: .playNoDuelsYet,
                        subtitle: nil
                    )
                } else {
                    list
                }
            }
        }
        .background(ZrpColor.background.ignoresSafeArea())
        .navigationTitle(Text(.playDuelsTitle))
        .navigationBarTitleDisplayMode(.inline)
        .task { await viewModel.loadIfNeeded() }
    }

    private var list: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: ZrpSpacing.xl) {
                Text(.playDuelsSubtitle)
                    .font(.subheadline)
                    .foregroundStyle(ZrpColor.onSurfaceMuted)

                section(.playIncomingDuels, duels: viewModel.incoming, respondable: true)
                section(.playActiveDuels, duels: viewModel.active, respondable: false)
                section(.playDuelHistory, duels: viewModel.history, respondable: false)
            }
            .padding(ZrpSpacing.lg)
            .frame(maxWidth: ZrpMetrics.contentMaxWidth)
            .frame(maxWidth: .infinity)
        }
        .refreshable { await viewModel.load() }
    }

    @ViewBuilder
    private func section(_ titleKey: L10nKey, duels: [PlayDuel], respondable: Bool) -> some View {
        if !duels.isEmpty {
            VStack(alignment: .leading, spacing: ZrpSpacing.sm) {
                Text(titleKey)
                    .font(.subheadline.weight(.bold))
                    .foregroundStyle(ZrpColor.onSurfaceMuted)

                ForEach(duels) { duel in
                    DuelCard(
                        duel: duel,
                        ownUserId: session.currentUser?.id,
                        busy: viewModel.busyDuelId == duel.id,
                        onOpen: { navigator.push(.playDuelDetail(id: duel.id)) },
                        onAccept: respondable
                            ? { Task { await viewModel.respond(duelId: duel.id, accept: true) } }
                            : nil,
                        onDecline: respondable
                            ? { Task { await viewModel.respond(duelId: duel.id, accept: false) } }
                            : nil
                    )
                }
            }
        }
    }
}

/// One duel row - ported from DuelCard.tsx/DuelCardView.kt.
private struct DuelCard: View {

    let duel: PlayDuel
    let ownUserId: String?
    let busy: Bool
    let onOpen: () -> Void
    /// `nil` outside the incoming section - a duel already responded to
    /// (or not the viewer's to respond to) gets no buttons at all.
    let onAccept: (() -> Void)?
    let onDecline: (() -> Void)?

    private var opponent: PostAuthor {
        ownUserId == duel.challengerId ? duel.opponent : duel.challenger
    }

    private var canRespond: Bool { onAccept != nil && duel.status == .pending }
    private var canPlay: Bool { duel.status == .accepted }

    var body: some View {
        // A plain tap gesture rather than wrapping the row in a `Button`:
        // `trailing` holds its own real Accept/Decline buttons, and a
        // `Button` nested inside another `Button` does not route taps to
        // the inner one correctly in SwiftUI. Matches DuelCardView.kt's
        // own `Modifier.clickable(enabled = canPlay)` - the row opens the
        // detail screen only once there is something to play; a history
        // row's outcome is already shown inline below, so tapping it does
        // nothing, same as Android.
        Group {
            if canRespond {
                // Left as separate accessibility elements: `trailing`'s
                // Accept/Decline are real, independently-focusable buttons
                // here, so they must not be swallowed into one combined
                // element the way the other two branches below are.
                row
            } else if canPlay {
                row
                    .accessibilityElement(children: .combine)
                    .accessibilityAddTraits(.isButton)
            } else {
                row.accessibilityElement(children: .combine)
            }
        }
    }

    private var row: some View {
        HStack(spacing: ZrpSpacing.md) {
            AvatarView(url: opponent.avatarUrl, displayName: opponent.displayName, size: ZrpMetrics.avatarMedium)

            VStack(alignment: .leading, spacing: 2) {
                HStack(spacing: ZrpSpacing.xs) {
                    Text(verbatim: opponent.handle)
                        .font(.subheadline.weight(.bold))
                        .foregroundStyle(ZrpColor.onSurface)
                        .lineLimit(1)
                    VerifiedBadge(badgeType: opponent.badgeType)
                }
                if let typeKey = duel.challenge.type.titleKey {
                    Text(verbatim: "\(L10n.string(typeKey)) - \(duel.challenge.title)")
                        .font(.caption)
                        .foregroundStyle(ZrpColor.onSurfaceMuted)
                        .lineLimit(1)
                } else {
                    Text(verbatim: duel.challenge.title)
                        .font(.caption)
                        .foregroundStyle(ZrpColor.onSurfaceMuted)
                        .lineLimit(1)
                }
                if duel.status == .completed, let outcomeKey {
                    Text(outcomeKey)
                        .font(.caption.weight(.bold))
                        .foregroundStyle(outcomeKey == .playYouWon ? ZrpColor.green : ZrpColor.onSurfaceMuted)
                }
            }

            Spacer(minLength: 0)

            trailing
        }
        .padding(ZrpSpacing.md)
        .background(ZrpColor.surfaceElevated)
        .clipShape(RoundedRectangle(cornerRadius: ZrpRadius.md, style: .continuous))
        .contentShape(Rectangle())
        .onTapGesture {
            if canPlay { onOpen() }
        }
    }

    private var outcomeKey: L10nKey? {
        guard duel.status == .completed else { return nil }
        if duel.winnerId == nil { return .playTied }
        return duel.winnerId == ownUserId ? .playYouWon : .playYouLost
    }

    @ViewBuilder
    private var trailing: some View {
        if canRespond {
            HStack(spacing: ZrpSpacing.sm) {
                Button {
                    onDecline?()
                } label: {
                    Text(.playDecline)
                        .font(.caption.weight(.semibold))
                }
                .buttonStyle(.bordered)
                .disabled(busy)

                Button {
                    onAccept?()
                } label: {
                    Text(.playAccept)
                        .font(.caption.weight(.semibold))
                }
                .buttonStyle(.borderedProminent)
                .tint(ZrpColor.red)
                .disabled(busy)
            }
        } else if canPlay {
            Text(.playPlay)
                .font(.caption.weight(.semibold))
                .foregroundStyle(.white)
                .padding(.horizontal, ZrpSpacing.md)
                .padding(.vertical, ZrpSpacing.xs)
                .background(ZrpColor.red)
                .clipShape(Capsule())
        } else if let key = duel.status.titleKey {
            Text(key)
                .font(.caption.weight(.semibold))
                .foregroundStyle(ZrpColor.onSurfaceMuted)
                .padding(.horizontal, ZrpSpacing.sm)
                .padding(.vertical, ZrpSpacing.xs)
                .background(ZrpColor.background)
                .clipShape(Capsule())
        }
    }
}

// MARK: - Detail

@MainActor
final class PlayDuelDetailViewModel: ObservableObject {

    enum Phase: Equatable {
        case loading
        case loaded(PlayDuelDetail)
        case failed(ApiError)
    }

    @Published private(set) var phase: Phase = .loading

    private let duelId: String
    private let repository: PlayRepositoryProtocol

    init(duelId: String, repository: PlayRepositoryProtocol = PlayRepository()) {
        self.duelId = duelId
        self.repository = repository
    }

    func load() async {
        do {
            phase = .loaded(try await repository.duel(id: duelId))
        } catch {
            phase = .failed(error as? ApiError ?? .transport(underlying: "\(error)"))
        }
    }
}

/// A single duel - ported from PlayDuelDetailPage.tsx/PlayDuelDetailScreen.kt.
/// Accepting/declining an incoming invite happens from the list
/// (`DuelCard`'s own buttons), not here - this screen only ever shows
/// Play, "waiting for opponent", a completed outcome, or a plain status
/// pill for anything else (a PENDING duel opened directly, DECLINED,
/// EXPIRED).
struct PlayDuelDetailView: View {

    @EnvironmentObject private var navigator: Navigator
    @EnvironmentObject private var session: SessionController
    @StateObject private var viewModel: PlayDuelDetailViewModel

    init(duelId: String) {
        _viewModel = StateObject(wrappedValue: PlayDuelDetailViewModel(duelId: duelId))
    }

    var body: some View {
        Group {
            switch viewModel.phase {
            case .loading:
                TimelineStateView.loading()
            case .failed(let error):
                TimelineStateView.error(error) {
                    Task { await viewModel.load() }
                }
            case .loaded(let duel):
                content(duel)
            }
        }
        .background(ZrpColor.background.ignoresSafeArea())
        .navigationTitle(Text(.playDuelsTitle))
        .navigationBarTitleDisplayMode(.inline)
        .task { await viewModel.load() }
    }

    private func content(_ duel: PlayDuelDetail) -> some View {
        let myId = session.currentUser?.id
        let isChallenger = myId == duel.challengerId
        let me = isChallenger ? duel.challenger : duel.opponent
        let opponent = isChallenger ? duel.opponent : duel.challenger
        let myScore = isChallenger ? duel.challengerScore : duel.opponentScore
        let opponentScore = isChallenger ? duel.opponentScore : duel.challengerScore
        let iHavePlayed = myScore != nil

        return ScrollView {
            VStack(spacing: ZrpSpacing.xl) {
                VStack(spacing: ZrpSpacing.xs) {
                    if let typeKey = duel.challenge.type.titleKey {
                        Text(typeKey)
                            .font(.caption.weight(.bold))
                            .foregroundStyle(ZrpColor.red)
                    }
                    Text(verbatim: duel.challenge.title)
                        .font(.title3.weight(.bold))
                        .foregroundStyle(ZrpColor.onSurface)
                        .multilineTextAlignment(.center)
                }

                HStack(spacing: ZrpSpacing.xl) {
                    participant(
                        me,
                        score: duel.status == .completed ? myScore : nil
                    )
                    Text(.playVs)
                        .font(.subheadline.weight(.bold))
                        .foregroundStyle(ZrpColor.onSurfaceMuted)
                    participant(
                        opponent,
                        score: duel.status == .completed ? opponentScore : nil
                    )
                }

                outcome(duel, myId: myId, iHavePlayed: iHavePlayed)
            }
            .padding(ZrpSpacing.xl)
            .frame(maxWidth: ZrpMetrics.contentMaxWidth)
            .frame(maxWidth: .infinity)
        }
    }

    private func participant(_ user: PostAuthor, score: Int?) -> some View {
        Button {
            navigator.push(.profile(username: user.username))
        } label: {
            VStack(spacing: ZrpSpacing.xs) {
                AvatarView(url: user.avatarUrl, displayName: user.displayName, size: ZrpMetrics.avatarLarge)
                HStack(spacing: 2) {
                    Text(verbatim: user.handle)
                        .font(.subheadline.weight(.bold))
                        .foregroundStyle(ZrpColor.onSurface)
                        .lineLimit(1)
                    VerifiedBadge(badgeType: user.badgeType)
                }
                if let score {
                    Text(verbatim: CountFormatting.exact(score))
                        .font(.title2.weight(.heavy))
                        .foregroundStyle(ZrpColor.onSurface)
                }
            }
        }
        .buttonStyle(.plain)
    }

    @ViewBuilder
    private func outcome(_ duel: PlayDuelDetail, myId: String?, iHavePlayed: Bool) -> some View {
        switch duel.status {
        case .completed:
            VStack(spacing: ZrpSpacing.xs) {
                Image(systemName: "trophy.fill")
                    .foregroundStyle(ZrpColor.red)
                Text(completedOutcomeKey(duel, myId: myId))
                    .font(.headline.weight(.bold))
                    .foregroundStyle(ZrpColor.onSurface)
            }
        case .accepted where !iHavePlayed:
            Button {
                navigator.push(.playChallenge(id: duel.challenge.id, duelId: duel.id))
            } label: {
                Text(.playPlay)
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(.white)
                    .frame(maxWidth: .infinity)
                    .frame(minHeight: ZrpMetrics.minTouchTarget)
                    .background(ZrpColor.red)
                    .clipShape(RoundedRectangle(cornerRadius: ZrpRadius.md, style: .continuous))
            }
            .buttonStyle(.plain)
        case .accepted:
            Text(.playWaitingForOpponent)
                .font(.subheadline)
                .foregroundStyle(ZrpColor.onSurfaceMuted)
        default:
            if let key = duel.status.titleKey {
                Text(key)
                    .font(.subheadline.weight(.bold))
                    .foregroundStyle(ZrpColor.onSurfaceMuted)
                    .padding(.horizontal, ZrpSpacing.md)
                    .padding(.vertical, ZrpSpacing.sm)
                    .background(ZrpColor.surfaceElevated)
                    .clipShape(Capsule())
            }
        }
    }

    private func completedOutcomeKey(_ duel: PlayDuelDetail, myId: String?) -> L10nKey {
        if duel.winnerId == nil { return .playTied }
        return duel.winnerId == myId ? .playYouWon : .playYouLost
    }
}
