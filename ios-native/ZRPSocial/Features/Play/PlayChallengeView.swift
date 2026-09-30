import SwiftUI

@MainActor
final class PlayChallengeViewModel: ObservableObject {

    enum Phase: Equatable {
        case loading
        case playing(PlayChallenge)
        case finished(PlayResult)
        case failed(ApiError)
    }

    @Published private(set) var phase: Phase = .loading
    @Published private(set) var isSubmitting = false
    @Published var errorMessage: String?

    // MARK: Trivia

    @Published private(set) var questionIndex = 0
    /// One chosen option index per question, `nil` until answered. The
    /// server scores these; nothing here knows which is right.
    @Published private(set) var triviaAnswers: [Int?] = []

    // MARK: Logic

    @Published var logicAnswerIndex: Int?
    @Published var logicAnswerText = ""

    // MARK: Memory

    @Published private(set) var memory = MemoryGame()

    private var startedAt = Date()
    private let challengeId: String
    /// Set only when this challenge is being played as one side of a duel
    /// (reached from `PlayDuelDetailView`'s Play button) - carried along
    /// in every submission so the route scores it as that duel's side
    /// rather than a plain solo attempt. `nil` for every other entry
    /// point, which is also what makes `isDuelPlay` false and shows the
    /// "Challenge a Friend" panel below.
    private let duelId: String?
    private let repository: PlayRepositoryProtocol
    private let searchRepository: SearchRepositoryProtocol

    var isDuelPlay: Bool { duelId != nil }

    /// Set by the view from the real session, purely to keep a viewer
    /// from seeing themself in their own opponent search - the route's
    /// own "You can't duel yourself" refusal is what actually enforces
    /// it.
    var ownUserId: String?

    init(
        challengeId: String,
        duelId: String? = nil,
        repository: PlayRepositoryProtocol = PlayRepository(),
        searchRepository: SearchRepositoryProtocol = SearchRepository()
    ) {
        self.challengeId = challengeId
        self.duelId = duelId
        self.repository = repository
        self.searchRepository = searchRepository
    }

    func load() async {
        if case .playing = phase { return }
        do {
            let challenge = try await repository.challenge(id: challengeId)
            if let questions = challenge.content?.questions {
                triviaAnswers = Array(repeating: nil, count: questions.count)
            }
            if let pairs = challenge.content?.pairs {
                memory.start(with: pairs)
            }
            startedAt = Date()
            phase = .playing(challenge)
        } catch {
            phase = .failed(error as? ApiError ?? .transport(underlying: "\(error)"))
        }
    }

    // MARK: - Trivia

    func answerTrivia(_ optionIndex: Int) {
        guard questionIndex < triviaAnswers.count else { return }
        triviaAnswers[questionIndex] = optionIndex
    }

    func advance(total: Int) {
        guard questionIndex + 1 < total else { return }
        questionIndex += 1
    }

    var currentTriviaAnswer: Int? {
        guard questionIndex < triviaAnswers.count else { return nil }
        return triviaAnswers[questionIndex]
    }

    // MARK: - Memory

    func flip(_ index: Int) {
        memory.flip(index)
    }

    // MARK: - Challenge a Friend

    /// Shown only outside duel play (`!isDuelPlay`) and only once signed
    /// in - the same split PlayChallengePage.tsx makes, since sending a
    /// duel is `POST /api/play/duels`, which requires a session.
    @Published var showDuelPanel = false
    @Published var opponentQuery = ""
    @Published private(set) var opponentResults: [PostAuthor] = []
    @Published private(set) var isSearchingOpponents = false
    @Published var selectedOpponent: PostAuthor?
    @Published private(set) var isSendingDuel = false
    @Published private(set) var duelSent = false

    private var opponentSearchTask: Task<Void, Never>?

    func openDuelPanel() {
        showDuelPanel = true
    }

    /// Debounced the same way SearchViewModel's own hashtag search is -
    /// cancels the superseded request rather than letting it race the one
    /// the user is actually waiting on. Reuses the general
    /// `GET /api/search?type=all` the rest of the app already searches
    /// users with, filtered to just `.users` and to exclude the viewer's
    /// own account.
    func scheduleOpponentSearch() {
        opponentSearchTask?.cancel()

        let term = opponentQuery.trimmingCharacters(in: .whitespacesAndNewlines)
        guard term.count >= SearchRepository.minimumQueryLength else {
            opponentResults = []
            isSearchingOpponents = false
            return
        }

        opponentSearchTask = Task { [weak self] in
            try? await Task.sleep(for: .milliseconds(300))
            guard let self, !Task.isCancelled else { return }

            self.isSearchingOpponents = true
            defer { self.isSearchingOpponents = false }

            do {
                let found = try await self.searchRepository.search(query: term)
                guard !Task.isCancelled else { return }
                self.opponentResults = found.users.filter { $0.id != self.ownUserId }
            } catch is CancellationError {
                return
            } catch {
                guard !Task.isCancelled else { return }
                self.opponentResults = []
            }
        }
    }

    func chooseOpponent(_ opponent: PostAuthor) {
        selectedOpponent = opponent
        opponentSearchTask?.cancel()
        opponentQuery = ""
        opponentResults = []
    }

    /// `POST /api/play/duels`. The route itself blocks a self-challenge,
    /// a blocked-either-way opponent, and any non-active challenge - each
    /// with its own message, surfaced as sent rather than re-derived here.
    func sendDuel() async {
        guard let opponent = selectedOpponent, !isSendingDuel else { return }
        isSendingDuel = true
        errorMessage = nil
        defer { isSendingDuel = false }

        do {
            _ = try await repository.createDuel(challengeId: challengeId, opponentId: opponent.id)
            duelSent = true
        } catch let error as ApiError {
            errorMessage = error.userFacingMessage
        } catch {
            errorMessage = L10n.string(.playErrDuelCreateFailed)
        }
    }

    // MARK: - Submitting

    /// Builds the shape this challenge's type calls for, and sends it.
    ///
    /// Everything that comes back - score, XP, level, streak,
    /// achievements - is the server's own figure. This never computes a
    /// score: the answers were stripped before the content arrived.
    func submit(_ challenge: PlayChallenge) async {
        guard !isSubmitting else { return }
        isSubmitting = true
        defer { isSubmitting = false }

        var submission = PlaySubmission()
        submission.timeMs = Int(Date().timeIntervalSince(startedAt) * 1000)
        submission.duelId = duelId

        switch challenge.type {
        case .trivia:
            // An unanswered question is sent as -1 rather than skipped:
            // the server reads the array positionally, so a shorter array
            // would shift every later answer onto the wrong question.
            submission.answers = triviaAnswers.map { $0 ?? -1 }
        case .memory:
            submission.moves = memory.moves
            submission.matchedPairs = memory.matchedPairs
        case .logic:
            submission.answerIndex = logicAnswerIndex
            let text = logicAnswerText.trimmingCharacters(in: .whitespacesAndNewlines)
            submission.answerText = text.isEmpty ? nil : text
        case .unknown:
            errorMessage = L10n.string(.playErrSubmitFailed)
            return
        }

        do {
            let result = try await repository.submit(
                challengeId: challengeId,
                submission: submission
            )
            phase = .finished(result)
        } catch let error as ApiError {
            errorMessage = error.userFacingMessage
        } catch {
            errorMessage = L10n.string(.playErrSubmitFailed)
        }
    }
}

/// The memory game's board.
///
/// Pure client-side play state: which cards are face up, which are
/// matched, and how many moves it took. The score is still the server's -
/// it is computed from the move count and the matched pairs this reports.
struct MemoryGame: Equatable {

    struct Card: Identifiable, Equatable {
        let id: Int
        let face: String
        var isFaceUp = false
        var isMatched = false
    }

    private(set) var cards: [Card] = []
    private(set) var moves = 0
    private(set) var matchedPairs = 0

    private var firstFlipped: Int?

    var isComplete: Bool {
        !cards.isEmpty && cards.allSatisfy(\.isMatched)
    }

    /// Two of each face, shuffled. The faces are not secret - the server
    /// sends them deliberately, because the game is about remembering
    /// where they are.
    mutating func start(with pairs: [String]) {
        cards = (pairs + pairs)
            .shuffled()
            .enumerated()
            .map { Card(id: $0.offset, face: $0.element) }
        moves = 0
        matchedPairs = 0
        firstFlipped = nil
    }

    mutating func flip(_ index: Int) {
        guard cards.indices.contains(index) else { return }
        guard !cards[index].isMatched, !cards[index].isFaceUp else { return }

        if let first = firstFlipped {
            cards[index].isFaceUp = true
            moves += 1
            if cards[first].face == cards[index].face {
                cards[first].isMatched = true
                cards[index].isMatched = true
                matchedPairs += 1
            }
            firstFlipped = nil
        } else {
            // A fresh turn: anything left face up from the previous
            // mismatch turns back over now, which is what gives the
            // player a moment to see it.
            for i in cards.indices where !cards[i].isMatched {
                cards[i].isFaceUp = false
            }
            cards[index].isFaceUp = true
            firstFlipped = index
        }
    }
}

/// Playing one challenge, and its result.
struct PlayChallengeView: View {

    @EnvironmentObject private var session: SessionController
    @StateObject private var viewModel: PlayChallengeViewModel

    init(challengeId: String, duelId: String? = nil) {
        _viewModel = StateObject(
            wrappedValue: PlayChallengeViewModel(challengeId: challengeId, duelId: duelId)
        )
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
            case .playing(let challenge):
                board(challenge)
            case .finished(let result):
                PlayResultView(result: result, ownUserId: session.currentUser?.id)
            }
        }
        .background(ZrpColor.background.ignoresSafeArea())
        .navigationTitle(Text(.navPlay))
        .navigationBarTitleDisplayMode(.inline)
        .task {
            viewModel.ownUserId = session.currentUser?.id
            await viewModel.load()
        }
        .alert(
            Text(.iosErrorGenericTitle),
            isPresented: Binding(
                get: { viewModel.errorMessage != nil },
                set: { if !$0 { viewModel.errorMessage = nil } }
            )
        ) {
            Button { viewModel.errorMessage = nil } label: { Text(.actionCancel) }
        } message: {
            Text(verbatim: viewModel.errorMessage ?? "")
        }
    }

    @ViewBuilder
    private func board(_ challenge: PlayChallenge) -> some View {
        ScrollView {
            VStack(alignment: .leading, spacing: ZrpSpacing.lg) {
                Text(verbatim: challenge.title)
                    .font(.title3.weight(.bold))
                    .foregroundStyle(ZrpColor.onSurface)
                    .fixedSize(horizontal: false, vertical: true)

                if session.currentUser == nil {
                    // Submitting needs a session; the challenge is still
                    // readable, which is what the route allows.
                    Text(.opportunityLoginToApply)
                        .font(.footnote)
                        .foregroundStyle(ZrpColor.onSurfaceMuted)
                } else if !viewModel.isDuelPlay && challenge.type != .unknown {
                    // Sending a duel for a type this build cannot render
                    // would put both sides on a challenge neither of them
                    // can play - a dead end reachable via a shared link,
                    // a search result, or (previously) the trending list.
                    duelPanel
                }

                switch challenge.type {
                case .trivia:
                    trivia(challenge)
                case .logic:
                    logic(challenge)
                case .memory:
                    memoryBoard(challenge)
                case .unknown:
                    // A challenge type this build does not know how to
                    // play (REACTION/SEQUENCE) - reached only via a
                    // direct/duel/daily link now that the trending list
                    // filters these out. Says so plainly rather than
                    // reusing the generic load-failure string, which
                    // reads as a bug rather than "not built yet."
                    Text(.iosPlayChallengeUnsupported)
                        .font(.subheadline)
                        .foregroundStyle(ZrpColor.onSurfaceMuted)
                }
            }
            .padding(ZrpSpacing.lg)
            .frame(maxWidth: ZrpMetrics.contentMaxWidth)
            .frame(maxWidth: .infinity)
        }
    }

    // MARK: - Trivia

    @ViewBuilder
    private func trivia(_ challenge: PlayChallenge) -> some View {
        if let questions = challenge.content?.questions, !questions.isEmpty {
            let index = min(viewModel.questionIndex, questions.count - 1)
            let question = questions[index]

            VStack(alignment: .leading, spacing: ZrpSpacing.md) {
                Text(
                    .playQuestion,
                    [
                        "n": CountFormatting.exact(index + 1),
                        "total": CountFormatting.exact(questions.count),
                    ]
                )
                .font(.caption)
                .foregroundStyle(ZrpColor.onSurfaceMuted)

                Text(verbatim: question.q)
                    .font(.headline)
                    .foregroundStyle(ZrpColor.onSurface)
                    .fixedSize(horizontal: false, vertical: true)

                ForEach(Array(question.options.enumerated()), id: \.offset) { offset, option in
                    optionButton(
                        option,
                        isSelected: viewModel.currentTriviaAnswer == offset
                    ) {
                        viewModel.answerTrivia(offset)
                    }
                }

                if index + 1 < questions.count {
                    primaryButton(.playNext) {
                        viewModel.advance(total: questions.count)
                    }
                    .disabled(viewModel.currentTriviaAnswer == nil)
                } else {
                    submitButton(challenge)
                        .disabled(viewModel.currentTriviaAnswer == nil)
                }
            }
        }
    }

    // MARK: - Logic

    @ViewBuilder
    private func logic(_ challenge: PlayChallenge) -> some View {
        VStack(alignment: .leading, spacing: ZrpSpacing.md) {
            if let prompt = challenge.content?.prompt {
                Text(verbatim: prompt)
                    .font(.headline)
                    .foregroundStyle(ZrpColor.onSurface)
                    .fixedSize(horizontal: false, vertical: true)
            }

            // The route accepts either an option index or free text, and
            // which one a puzzle wants is decided by whether it sent
            // options.
            if let options = challenge.content?.options, !options.isEmpty {
                ForEach(Array(options.enumerated()), id: \.offset) { offset, option in
                    optionButton(option, isSelected: viewModel.logicAnswerIndex == offset) {
                        viewModel.logicAnswerIndex = offset
                    }
                }
                submitButton(challenge).disabled(viewModel.logicAnswerIndex == nil)
            } else {
                TextField(
                    L10n.string(.playYourAnswer),
                    text: $viewModel.logicAnswerText
                )
                .font(.body)
                .padding(ZrpSpacing.md)
                .background(ZrpColor.surfaceElevated)
                .clipShape(RoundedRectangle(cornerRadius: ZrpRadius.md, style: .continuous))

                submitButton(challenge)
                    .disabled(
                        viewModel.logicAnswerText
                            .trimmingCharacters(in: .whitespacesAndNewlines)
                            .isEmpty
                    )
            }
        }
    }

    // MARK: - Memory

    @ViewBuilder
    private func memoryBoard(_ challenge: PlayChallenge) -> some View {
        VStack(alignment: .leading, spacing: ZrpSpacing.md) {
            HStack(spacing: ZrpSpacing.lg) {
                Text(.playMoves, ["n": CountFormatting.exact(viewModel.memory.moves)])
                Text(
                    .playMatched,
                    [
                        "matched": CountFormatting.exact(viewModel.memory.matchedPairs),
                        "total": CountFormatting.exact(viewModel.memory.cards.count / 2),
                    ]
                )
            }
            .font(.caption)
            .foregroundStyle(ZrpColor.onSurfaceMuted)

            LazyVGrid(
                columns: Array(
                    repeating: GridItem(.flexible(), spacing: ZrpSpacing.sm),
                    count: 4
                ),
                spacing: ZrpSpacing.sm
            ) {
                ForEach(viewModel.memory.cards) { card in
                    Button {
                        withAnimation(.easeInOut(duration: 0.15)) {
                            viewModel.flip(card.id)
                        }
                    } label: {
                        Text(verbatim: card.isFaceUp || card.isMatched ? card.face : "")
                            .font(.headline)
                            .foregroundStyle(ZrpColor.onSurface)
                            .lineLimit(1)
                            .minimumScaleFactor(0.5)
                            .frame(maxWidth: .infinity)
                            .aspectRatio(1, contentMode: .fit)
                            .background(
                                card.isMatched
                                    ? ZrpColor.green.opacity(0.2)
                                    : ZrpColor.surfaceElevated
                            )
                            .clipShape(
                                RoundedRectangle(cornerRadius: ZrpRadius.sm, style: .continuous)
                            )
                    }
                    .buttonStyle(.plain)
                    .disabled(card.isMatched)
                }
            }

            submitButton(challenge).disabled(!viewModel.memory.isComplete)
        }
    }

    // MARK: - Shared controls

    private func optionButton(
        _ text: String,
        isSelected: Bool,
        action: @escaping () -> Void
    ) -> some View {
        Button(action: action) {
            Text(verbatim: text)
                .font(.subheadline)
                .foregroundStyle(isSelected ? .white : ZrpColor.onSurface)
                .multilineTextAlignment(.leading)
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(ZrpSpacing.md)
                .frame(minHeight: ZrpMetrics.minTouchTarget)
                .background(isSelected ? ZrpColor.red : ZrpColor.surfaceElevated)
                .clipShape(RoundedRectangle(cornerRadius: ZrpRadius.md, style: .continuous))
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(isSelected ? [.isSelected, .isButton] : .isButton)
    }

    private func submitButton(_ challenge: PlayChallenge) -> some View {
        primaryButton(viewModel.isSubmitting ? .playSubmitting : .playFinish) {
            Task { await viewModel.submit(challenge) }
        }
        .disabled(viewModel.isSubmitting || session.currentUser == nil)
    }

    private func primaryButton(_ key: L10nKey, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Text(key)
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(.white)
                .frame(maxWidth: .infinity)
                .frame(minHeight: ZrpMetrics.minTouchTarget)
                .background(ZrpColor.red)
                .clipShape(RoundedRectangle(cornerRadius: ZrpRadius.md, style: .continuous))
        }
        .buttonStyle(.plain)
    }

    // MARK: - Challenge a Friend

    /// Ported from PlayChallengeScreen.kt's own duel panel: a collapsed
    /// link that expands into opponent search, then a "sent" note once
    /// `POST /api/play/duels` succeeds.
    @ViewBuilder
    private var duelPanel: some View {
        if viewModel.duelSent {
            Text(.playDuelSent)
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(ZrpColor.green)
        } else if !viewModel.showDuelPanel {
            Button {
                viewModel.openDuelPanel()
            } label: {
                HStack(spacing: ZrpSpacing.xs) {
                    Image(systemName: "flag.2.crossed")
                    Text(.playChallengeFriend)
                        .font(.subheadline.weight(.semibold))
                }
                .foregroundStyle(ZrpColor.red)
            }
            .buttonStyle(.plain)
        } else {
            VStack(alignment: .leading, spacing: ZrpSpacing.sm) {
                Text(.playSelectOpponent)
                    .font(.footnote.weight(.semibold))
                    .foregroundStyle(ZrpColor.onSurface)

                opponentSearchField

                Button {
                    Task { await viewModel.sendDuel() }
                } label: {
                    if viewModel.isSendingDuel {
                        ProgressView().tint(.white)
                    } else {
                        Text(.playSendChallenge)
                    }
                }
                .font(.footnote.weight(.semibold))
                .frame(maxWidth: .infinity)
                .padding(.vertical, ZrpSpacing.sm)
                .buttonStyle(.borderedProminent)
                .tint(ZrpColor.red)
                .disabled(viewModel.selectedOpponent == nil || viewModel.isSendingDuel)
            }
            .padding(ZrpSpacing.md)
            .background(ZrpColor.surfaceElevated)
            .clipShape(RoundedRectangle(cornerRadius: ZrpRadius.md, style: .continuous))
        }
    }

    @ViewBuilder
    private var opponentSearchField: some View {
        if let opponent = viewModel.selectedOpponent {
            HStack(spacing: ZrpSpacing.sm) {
                AvatarView(url: opponent.avatarUrl, displayName: opponent.displayName, size: ZrpMetrics.avatarSmall)
                Text(verbatim: opponent.handle)
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(ZrpColor.onSurface)
                    .lineLimit(1)
                VerifiedBadge(badgeType: opponent.badgeType)
                Spacer(minLength: 0)
                Button {
                    viewModel.selectedOpponent = nil
                } label: {
                    Image(systemName: "xmark.circle.fill")
                        .foregroundStyle(ZrpColor.onSurfaceMuted)
                }
                .accessibilityLabel(Text(.playSelectOpponent))
            }
            .padding(ZrpSpacing.sm)
            .background(ZrpColor.background)
            .clipShape(RoundedRectangle(cornerRadius: ZrpRadius.sm, style: .continuous))
        } else {
            VStack(alignment: .leading, spacing: ZrpSpacing.xs) {
                TextField(L10n.string(.playSearchUsers), text: $viewModel.opponentQuery)
                    .textFieldStyle(.roundedBorder)
                    .onChange(of: viewModel.opponentQuery) { _, _ in
                        viewModel.scheduleOpponentSearch()
                    }

                if viewModel.isSearchingOpponents {
                    ProgressView()
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, ZrpSpacing.sm)
                } else if !viewModel.opponentResults.isEmpty {
                    VStack(spacing: 0) {
                        ForEach(viewModel.opponentResults) { user in
                            Button {
                                viewModel.chooseOpponent(user)
                            } label: {
                                HStack(spacing: ZrpSpacing.sm) {
                                    AvatarView(
                                        url: user.avatarUrl,
                                        displayName: user.displayName,
                                        size: ZrpMetrics.avatarSmall
                                    )
                                    Text(verbatim: user.handle)
                                        .font(.subheadline)
                                        .foregroundStyle(ZrpColor.onSurface)
                                        .lineLimit(1)
                                    VerifiedBadge(badgeType: user.badgeType)
                                    Spacer(minLength: 0)
                                }
                                .padding(ZrpSpacing.sm)
                                .contentShape(Rectangle())
                            }
                            .buttonStyle(.plain)
                        }
                    }
                    .background(ZrpColor.background)
                    .clipShape(RoundedRectangle(cornerRadius: ZrpRadius.sm, style: .continuous))
                }
            }
        }
    }
}

/// What the server made of it.
private struct PlayResultView: View {

    @EnvironmentObject private var navigator: Navigator

    let result: PlayResult
    /// So a completed duel's outcome (won/lost/tied) can be worked out
    /// from `result.winnerId` - never guessed, since the server is what
    /// determined it.
    let ownUserId: String?

    var body: some View {
        ScrollView {
            VStack(spacing: ZrpSpacing.lg) {
                Text(.playYourScore)
                    .font(.headline)
                    .foregroundStyle(ZrpColor.onSurfaceMuted)

                Text(verbatim: scoreText)
                    .font(.largeTitle.weight(.bold))
                    .foregroundStyle(ZrpColor.red)

                if let duelOutcomeKey {
                    Label {
                        Text(duelOutcomeKey)
                    } icon: {
                        Image(systemName: "trophy.fill")
                    }
                    .font(.headline.weight(.bold))
                    .foregroundStyle(duelOutcomeKey == .playYouWon ? ZrpColor.green : ZrpColor.onSurface)
                } else if result.waitingForOpponent == true {
                    Text(.playWaitingForOpponent)
                        .font(.subheadline)
                        .foregroundStyle(ZrpColor.onSurfaceMuted)
                        .multilineTextAlignment(.center)
                }

                if result.waitingForOpponent == true || duelOutcomeKey != nil {
                    Button {
                        navigator.push(.playDuels)
                    } label: {
                        Text(.playDuelsTitle)
                            .font(.footnote.weight(.semibold))
                            .foregroundStyle(ZrpColor.red)
                    }
                    .buttonStyle(.plain)
                }

                HStack(spacing: ZrpSpacing.xl) {
                    if let xp = result.xpEarned {
                        figure(.playXpEarned, value: xp)
                    }
                    if let level = result.level {
                        figure(.playLevel, value: level)
                    }
                    if let streak = result.streak {
                        figure(.playLongestStreak, value: streak)
                    }
                }

                achievements
            }
            .padding(ZrpSpacing.xl)
            .frame(maxWidth: ZrpMetrics.contentMaxWidth)
            .frame(maxWidth: .infinity)
        }
    }

    private var scoreText: String {
        guard let max = result.maxScore else {
            return CountFormatting.exact(result.score)
        }
        return "\(CountFormatting.exact(result.score))/\(CountFormatting.exact(max))"
    }

    /// `nil` unless this submission was the one that completed a duel.
    /// `winnerId == nil` is a real tie, not "unknown" - the route only
    /// ever sends it once both scores are in.
    private var duelOutcomeKey: L10nKey? {
        guard result.duelCompleted == true else { return nil }
        if result.winnerId == nil { return .playTied }
        return result.winnerId == ownUserId ? .playYouWon : .playYouLost
    }

    private func figure(_ key: L10nKey, value: Int) -> some View {
        VStack(spacing: 2) {
            Text(verbatim: CountFormatting.exact(value))
                .font(.headline)
                .foregroundStyle(ZrpColor.onSurface)
            Text(key, ["n": CountFormatting.exact(value)])
                .font(.caption2)
                .foregroundStyle(ZrpColor.onSurfaceMuted)
                .multilineTextAlignment(.center)
        }
    }

    @ViewBuilder
    private var achievements: some View {
        if let unlocked = result.unlockedAchievements, !unlocked.isEmpty {
            VStack(alignment: .leading, spacing: ZrpSpacing.sm) {
                Text(.playNewAchievement)
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(ZrpColor.onSurface)

                ForEach(unlocked) { achievement in
                    // The name and description are written by the server
                    // and are not in the translation dictionary, so they
                    // are shown as it sent them.
                    VStack(alignment: .leading, spacing: 2) {
                        Text(verbatim: achievement.name)
                            .font(.footnote.weight(.semibold))
                            .foregroundStyle(ZrpColor.onSurface)
                        if let description = achievement.description {
                            Text(verbatim: description)
                                .font(.caption2)
                                .foregroundStyle(ZrpColor.onSurfaceMuted)
                        }
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(ZrpSpacing.md)
                    .background(ZrpColor.surfaceElevated)
                    .clipShape(RoundedRectangle(cornerRadius: ZrpRadius.md, style: .continuous))
                }
            }
        }
    }
}
