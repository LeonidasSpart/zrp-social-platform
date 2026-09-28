import SwiftUI

/// Create Challenge - ported from CreateChallengePage.tsx /
/// PlayCreateChallengeScreen.kt: manual per-type builders (trivia/
/// memory/logic) plus an AI-generate tab against
/// `POST /api/play/challenges/generate`, both publishing via
/// `POST /api/play/challenges`.
///
/// **Only the three manually-buildable types.** `GAME_REGISTRY` also has
/// REACTION (nothing topic-driven to generate) and SEQUENCE, but neither
/// Android nor this app has a *player* view for them yet (`PlayChallenge`'s
/// own `PlayChallengeType` decodes both to `.unknown` - see its KDoc), so
/// offering them here would let someone publish a challenge nobody on
/// either mobile app can actually play. Recorded in PARITY.md.
@MainActor
final class PlayCreateChallengeViewModel: ObservableObject {

    enum Tab: Equatable {
        case manual
        case ai
    }

    enum GameType: String, CaseIterable, Identifiable, Equatable {
        case trivia = "TRIVIA"
        case memory = "MEMORY"
        case logic = "LOGIC"

        var id: String { rawValue }

        var labelKey: L10nKey {
            switch self {
            case .trivia: return .playTypeTrivia
            case .memory: return .playTypeMemory
            case .logic: return .playTypeLogic
            }
        }
    }

    enum Difficulty: String, CaseIterable, Identifiable, Equatable {
        case easy, medium, hard

        var id: String { rawValue }

        var labelKey: L10nKey {
            switch self {
            case .easy: return .playDifficultyEasy
            case .medium: return .playDifficultyMedium
            case .hard: return .playDifficultyHard
            }
        }
    }

    enum LogicAnswerType: Equatable {
        case choice
        case text
    }

    @Published var tab: Tab = .manual
    @Published var type: GameType = .trivia
    @Published var difficulty: Difficulty = .medium
    @Published var title = ""
    @Published var description = ""

    // MARK: Trivia

    @Published var questions: [TriviaQuestionPayload] = [
        TriviaQuestionPayload(q: "", options: ["", ""], correctIndex: 0)
    ]

    // MARK: Memory

    @Published var pairs: [String] = ["", "", ""]

    // MARK: Logic

    @Published var logicPrompt = ""
    @Published var logicAnswerType: LogicAnswerType = .choice
    @Published var logicOptions: [String] = ["", ""]
    @Published var logicCorrectIndex = 0
    @Published var logicAnswer = ""

    // MARK: AI generation

    @Published var aiTopic = ""
    @Published private(set) var isGenerating = false
    /// Shown as a one-line notice on the manual tab once AI has filled it
    /// in, so the creator knows to check the generated answer before
    /// publishing - matches `play.aiGeneratedNote`.
    @Published private(set) var isAiGenerated = false

    @Published private(set) var isPublishing = false
    @Published var errorMessage: String?
    @Published private(set) var createdChallengeId: String?

    private let repository: PlayRepositoryProtocol

    init(repository: PlayRepositoryProtocol = PlayRepository()) {
        self.repository = repository
    }

    // MARK: - Structural edits (add/remove; per-field edits go through
    // direct bindings from the view, same as ComposeViewModel's poll
    // options)

    var canAddQuestion: Bool { questions.count < 20 }
    var canAddPair: Bool { pairs.count < 12 }
    var canAddLogicOption: Bool { logicOptions.count < 6 }

    func addQuestion() {
        guard canAddQuestion else { return }
        questions.append(TriviaQuestionPayload(q: "", options: ["", ""], correctIndex: 0))
    }

    func removeQuestion(at index: Int) {
        guard questions.count > 1, questions.indices.contains(index) else { return }
        questions.remove(at: index)
    }

    func canAddQuestionOption(at index: Int) -> Bool {
        questions.indices.contains(index) && questions[index].options.count < 6
    }

    func addQuestionOption(at index: Int) {
        guard canAddQuestionOption(at: index) else { return }
        questions[index].options.append("")
    }

    func addPair() {
        guard canAddPair else { return }
        pairs.append("")
    }

    func addLogicOption() {
        guard canAddLogicOption else { return }
        logicOptions.append("")
    }

    // MARK: - AI generation

    /// Matches PlayCreateChallengeViewModel.kt's own `generate()`: fills
    /// in the manual form and switches to it, rather than publishing
    /// straight from the AI tab - the creator reviews (and can edit) an
    /// AI answer before it goes live, same as the web/Android.
    func generate() async {
        let topic = aiTopic.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !topic.isEmpty, !isGenerating else { return }
        isGenerating = true
        errorMessage = nil
        defer { isGenerating = false }

        do {
            let generated = try await repository.generateChallenge(
                topic: topic,
                type: type.rawValue,
                difficulty: difficulty.rawValue
            )
            title = generated.title
            description = generated.description ?? ""
            isAiGenerated = true
            tab = .manual
            apply(generated.content, to: type)
        } catch let error as ApiError {
            // The route's own refusals are worth reading as written - a
            // daily AI-quota limit shared with ZRP AI chat, in
            // particular, is not what a generic "failed" would convey.
            errorMessage = error.userFacingMessage
        } catch {
            errorMessage = L10n.string(.playErrGenerateFailed)
        }
    }

    private func apply(_ content: GeneratedContent, to type: GameType) {
        switch type {
        case .trivia:
            if let questions = content.questions, !questions.isEmpty {
                self.questions = questions
            }
        case .memory:
            if let pairs = content.pairs, !pairs.isEmpty {
                self.pairs = pairs
            }
        case .logic:
            logicPrompt = content.prompt ?? ""
            if let options = content.options, let correctIndex = content.correctIndex {
                logicAnswerType = .choice
                logicOptions = options
                logicCorrectIndex = correctIndex
            } else {
                logicAnswerType = .text
                logicAnswer = content.answer ?? ""
            }
        }
    }

    // MARK: - Publish

    /// Pure port of the website's/Android's own content-building switch,
    /// pulled out for direct unit-test coverage. What is actually *valid*
    /// inside each shape (2-6 trivia options, 3-12 unique memory pairs, a
    /// logic prompt with either a valid choice or a non-empty free-text
    /// answer) is `validateChallengeContent` in `src/lib/play/scoring.ts`'s
    /// job; a violation comes back as the route's own 400 message rather
    /// than being re-validated here, so there is exactly one definition
    /// of "valid content" instead of two that can drift.
    nonisolated static func buildContent(
        type: GameType,
        questions: [TriviaQuestionPayload],
        pairs: [String],
        logicPrompt: String,
        logicAnswerType: LogicAnswerType,
        logicOptions: [String],
        logicCorrectIndex: Int,
        logicAnswer: String
    ) -> ChallengeContentPayload {
        switch type {
        case .trivia:
            return .trivia(questions: questions)
        case .memory:
            let cleaned = pairs
                .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
                .filter { !$0.isEmpty }
            return .memory(pairs: cleaned)
        case .logic:
            switch logicAnswerType {
            case .choice:
                return .logicChoice(prompt: logicPrompt, options: logicOptions, correctIndex: logicCorrectIndex)
            case .text:
                return .logicText(prompt: logicPrompt, answer: logicAnswer)
            }
        }
    }

    func publish() async {
        let trimmedTitle = title.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmedTitle.isEmpty else {
            errorMessage = L10n.string(.playErrTitleRequired)
            return
        }
        guard !isPublishing else { return }
        isPublishing = true
        errorMessage = nil
        defer { isPublishing = false }

        let trimmedDescription = description.trimmingCharacters(in: .whitespacesAndNewlines)
        let request = CreateChallengeRequest(
            type: type.rawValue,
            title: trimmedTitle,
            description: trimmedDescription.isEmpty ? nil : trimmedDescription,
            difficulty: difficulty.rawValue,
            content: Self.buildContent(
                type: type,
                questions: questions,
                pairs: pairs,
                logicPrompt: logicPrompt,
                logicAnswerType: logicAnswerType,
                logicOptions: logicOptions,
                logicCorrectIndex: logicCorrectIndex,
                logicAnswer: logicAnswer
            )
        )

        do {
            let challenge = try await repository.createChallenge(request)
            createdChallengeId = challenge.id
        } catch let error as ApiError {
            errorMessage = error.userFacingMessage
        } catch {
            errorMessage = L10n.string(.playErrCreateFailed)
        }
    }
}

struct PlayCreateChallengeView: View {

    @EnvironmentObject private var navigator: Navigator
    @StateObject private var viewModel = PlayCreateChallengeViewModel()

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: ZrpSpacing.lg) {
                Text(.playCreateSubtitle)
                    .font(.subheadline)
                    .foregroundStyle(ZrpColor.onSurfaceMuted)

                tabPicker

                if let errorMessage = viewModel.errorMessage {
                    Text(verbatim: errorMessage)
                        .font(.footnote)
                        .foregroundStyle(ZrpColor.red)
                }

                typePicker
                difficultyPicker

                if viewModel.tab == .ai {
                    aiSection
                } else {
                    manualSection
                }
            }
            .padding(ZrpSpacing.lg)
            .frame(maxWidth: ZrpMetrics.contentMaxWidth)
            .frame(maxWidth: .infinity)
        }
        .background(ZrpColor.background.ignoresSafeArea())
        .scrollDismissesKeyboard(.interactively)
        .navigationTitle(Text(.playCreateTitle))
        .navigationBarTitleDisplayMode(.inline)
        .onChange(of: viewModel.createdChallengeId) { _, id in
            guard let id else { return }
            navigator.push(.playChallenge(id: id))
        }
    }

    // MARK: - Tab / type / difficulty pickers

    private var tabPicker: some View {
        HStack(spacing: ZrpSpacing.sm) {
            tabButton(.playManualTab, isSelected: viewModel.tab == .manual) { viewModel.tab = .manual }
            tabButton(.playAiTab, isSelected: viewModel.tab == .ai) { viewModel.tab = .ai }
        }
    }

    private func tabButton(_ key: L10nKey, isSelected: Bool, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Text(key)
                .font(.subheadline.weight(.semibold))
                .frame(maxWidth: .infinity)
                .padding(.vertical, ZrpSpacing.sm)
                .background(isSelected ? ZrpColor.red : ZrpColor.surfaceElevated)
                .foregroundStyle(isSelected ? .white : ZrpColor.onSurface)
                .clipShape(RoundedRectangle(cornerRadius: ZrpRadius.md, style: .continuous))
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(isSelected ? [.isSelected, .isButton] : .isButton)
    }

    private var typePicker: some View {
        VStack(alignment: .leading, spacing: ZrpSpacing.xs) {
            sectionLabel(.playChallengeType)
            HStack(spacing: ZrpSpacing.sm) {
                ForEach(PlayCreateChallengeViewModel.GameType.allCases) { type in
                    chip(L10n.string(type.labelKey), isSelected: viewModel.type == type) {
                        viewModel.type = type
                    }
                }
            }
        }
    }

    private var difficultyPicker: some View {
        VStack(alignment: .leading, spacing: ZrpSpacing.xs) {
            sectionLabel(.playDifficultyLabel)
            HStack(spacing: ZrpSpacing.sm) {
                ForEach(PlayCreateChallengeViewModel.Difficulty.allCases) { difficulty in
                    chip(L10n.string(difficulty.labelKey), isSelected: viewModel.difficulty == difficulty) {
                        viewModel.difficulty = difficulty
                    }
                }
            }
        }
    }

    private func sectionLabel(_ key: L10nKey) -> some View {
        Text(key)
            .font(.subheadline.weight(.semibold))
            .foregroundStyle(ZrpColor.onSurface)
    }

    private func chip(_ title: String, isSelected: Bool, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Text(verbatim: title)
                .font(.footnote.weight(.semibold))
                .frame(maxWidth: .infinity)
                .padding(.vertical, ZrpSpacing.xs)
                .background(isSelected ? ZrpColor.red : ZrpColor.surfaceElevated)
                .foregroundStyle(isSelected ? .white : ZrpColor.onSurface)
                .clipShape(Capsule())
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(isSelected ? [.isSelected, .isButton] : .isButton)
    }

    // MARK: - AI tab

    private var aiSection: some View {
        VStack(alignment: .leading, spacing: ZrpSpacing.sm) {
            sectionLabel(.playAiTopicLabel)
            TextField(L10n.string(.playAiTopicPlaceholder), text: $viewModel.aiTopic)
                .textFieldStyle(.roundedBorder)

            Button {
                Task { await viewModel.generate() }
            } label: {
                HStack(spacing: ZrpSpacing.xs) {
                    if viewModel.isGenerating {
                        ProgressView().tint(.white)
                    } else {
                        Image(systemName: "sparkles")
                    }
                    Text(viewModel.isGenerating ? .playGenerating : .playGenerate)
                }
                .font(.subheadline.weight(.semibold))
                .frame(maxWidth: .infinity)
                .padding(.vertical, ZrpSpacing.sm)
            }
            .buttonStyle(.borderedProminent)
            .tint(ZrpColor.red)
            .disabled(
                viewModel.aiTopic.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
                    || viewModel.isGenerating
            )
        }
    }

    // MARK: - Manual tab

    @ViewBuilder
    private var manualSection: some View {
        VStack(alignment: .leading, spacing: ZrpSpacing.lg) {
            if viewModel.isAiGenerated {
                Text(.playAiGeneratedNote)
                    .font(.caption)
                    .foregroundStyle(ZrpColor.onSurfaceMuted)
            }

            VStack(alignment: .leading, spacing: ZrpSpacing.xs) {
                sectionLabel(.playTitleLabel)
                TextField(L10n.string(.playTitlePlaceholder), text: $viewModel.title)
                    .textFieldStyle(.roundedBorder)
            }

            VStack(alignment: .leading, spacing: ZrpSpacing.xs) {
                sectionLabel(.playDescriptionLabel)
                TextField(
                    L10n.string(.playDescriptionPlaceholder),
                    text: $viewModel.description,
                    axis: .vertical
                )
                .textFieldStyle(.roundedBorder)
                .lineLimit(2...4)
            }

            switch viewModel.type {
            case .trivia: triviaBuilder
            case .memory: memoryBuilder
            case .logic: logicBuilder
            }

            Button {
                Task { await viewModel.publish() }
            } label: {
                if viewModel.isPublishing {
                    ProgressView().tint(.white)
                } else {
                    Text(.playPublish)
                }
            }
            .font(.subheadline.weight(.semibold))
            .frame(maxWidth: .infinity)
            .padding(.vertical, ZrpSpacing.sm)
            .buttonStyle(.borderedProminent)
            .tint(ZrpColor.red)
            .disabled(viewModel.isPublishing)
        }
    }

    // MARK: Trivia

    private var triviaBuilder: some View {
        VStack(alignment: .leading, spacing: ZrpSpacing.md) {
            sectionLabel(.playQuestionsLabel)

            ForEach(Array(viewModel.questions.indices), id: \.self) { qIndex in
                if viewModel.questions.indices.contains(qIndex) {
                    questionCard(qIndex)
                }
            }

            if viewModel.canAddQuestion {
                Button {
                    viewModel.addQuestion()
                } label: {
                    Label { Text(.playAddQuestion) } icon: { Image(systemName: "plus.circle") }
                        .font(.footnote.weight(.semibold))
                        .foregroundStyle(ZrpColor.red)
                }
                .buttonStyle(.plain)
            }
        }
    }

    private func questionCard(_ qIndex: Int) -> some View {
        VStack(alignment: .leading, spacing: ZrpSpacing.sm) {
            HStack(spacing: ZrpSpacing.sm) {
                TextField(L10n.string(.playQuestionPlaceholder), text: questionTextBinding(qIndex))
                    .textFieldStyle(.roundedBorder)

                if viewModel.questions.count > 1 {
                    Button {
                        viewModel.removeQuestion(at: qIndex)
                    } label: {
                        Image(systemName: "trash")
                            .foregroundStyle(ZrpColor.onSurfaceMuted)
                            .frame(width: ZrpMetrics.minTouchTarget, height: ZrpMetrics.minTouchTarget)
                            .contentShape(Rectangle())
                    }
                    .accessibilityLabel(Text(.actionDelete))
                }
            }

            ForEach(Array(viewModel.questions[qIndex].options.indices), id: \.self) { optIndex in
                if viewModel.questions.indices.contains(qIndex),
                    viewModel.questions[qIndex].options.indices.contains(optIndex) {
                    optionRow(qIndex, optIndex)
                }
            }

            if viewModel.canAddQuestionOption(at: qIndex) {
                Button {
                    viewModel.addQuestionOption(at: qIndex)
                } label: {
                    Text(.playAddOption)
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(ZrpColor.red)
                }
                .buttonStyle(.plain)
            }
        }
        .padding(ZrpSpacing.md)
        .background(ZrpColor.surfaceElevated)
        .clipShape(RoundedRectangle(cornerRadius: ZrpRadius.md, style: .continuous))
    }

    private func optionRow(_ qIndex: Int, _ optIndex: Int) -> some View {
        HStack(spacing: ZrpSpacing.sm) {
            let isCorrect = viewModel.questions[qIndex].correctIndex == optIndex
            Button {
                viewModel.questions[qIndex].correctIndex = optIndex
            } label: {
                Image(systemName: isCorrect ? "checkmark.circle.fill" : "circle")
                    .foregroundStyle(isCorrect ? ZrpColor.green : ZrpColor.onSurfaceMuted)
                    .frame(width: ZrpMetrics.minTouchTarget, height: ZrpMetrics.minTouchTarget)
                    .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel(Text(.playMarkCorrect))
            .accessibilityAddTraits(isCorrect ? [.isSelected, .isButton] : .isButton)

            TextField(
                L10n.string(.playOptionPlaceholder, ["n": "\(optIndex + 1)"]),
                text: questionOptionBinding(qIndex, optIndex)
            )
            .textFieldStyle(.roundedBorder)
        }
    }

    private func questionTextBinding(_ qIndex: Int) -> Binding<String> {
        Binding(
            get: { viewModel.questions.indices.contains(qIndex) ? viewModel.questions[qIndex].q : "" },
            set: { newValue in
                guard viewModel.questions.indices.contains(qIndex) else { return }
                viewModel.questions[qIndex].q = newValue
            }
        )
    }

    private func questionOptionBinding(_ qIndex: Int, _ optIndex: Int) -> Binding<String> {
        Binding(
            get: {
                guard viewModel.questions.indices.contains(qIndex),
                    viewModel.questions[qIndex].options.indices.contains(optIndex)
                else { return "" }
                return viewModel.questions[qIndex].options[optIndex]
            },
            set: { newValue in
                guard viewModel.questions.indices.contains(qIndex),
                    viewModel.questions[qIndex].options.indices.contains(optIndex)
                else { return }
                viewModel.questions[qIndex].options[optIndex] = newValue
            }
        )
    }

    // MARK: Memory

    private var memoryBuilder: some View {
        VStack(alignment: .leading, spacing: ZrpSpacing.sm) {
            sectionLabel(.playMemoryPairsLabel)

            let columns = [GridItem(.flexible()), GridItem(.flexible())]
            LazyVGrid(columns: columns, spacing: ZrpSpacing.sm) {
                ForEach(Array(viewModel.pairs.indices), id: \.self) { index in
                    if viewModel.pairs.indices.contains(index) {
                        TextField(
                            L10n.string(.playPairPlaceholder, ["n": "\(index + 1)"]),
                            text: pairBinding(index)
                        )
                        .textFieldStyle(.roundedBorder)
                    }
                }
            }

            if viewModel.canAddPair {
                Button {
                    viewModel.addPair()
                } label: {
                    Label { Text(.playAddPair) } icon: { Image(systemName: "plus.circle") }
                        .font(.footnote.weight(.semibold))
                        .foregroundStyle(ZrpColor.red)
                }
                .buttonStyle(.plain)
            }
        }
    }

    private func pairBinding(_ index: Int) -> Binding<String> {
        Binding(
            get: { viewModel.pairs.indices.contains(index) ? viewModel.pairs[index] : "" },
            set: { newValue in
                guard viewModel.pairs.indices.contains(index) else { return }
                viewModel.pairs[index] = newValue
            }
        )
    }

    // MARK: Logic

    private var logicBuilder: some View {
        VStack(alignment: .leading, spacing: ZrpSpacing.sm) {
            sectionLabel(.playLogicPromptLabel)
            TextField(
                L10n.string(.playLogicPromptPlaceholder),
                text: $viewModel.logicPrompt,
                axis: .vertical
            )
            .textFieldStyle(.roundedBorder)
            .lineLimit(1...3)

            HStack(spacing: ZrpSpacing.sm) {
                chip(
                    L10n.string(.playLogicAnswerTypeChoice),
                    isSelected: viewModel.logicAnswerType == .choice
                ) { viewModel.logicAnswerType = .choice }
                chip(
                    L10n.string(.playLogicAnswerTypeText),
                    isSelected: viewModel.logicAnswerType == .text
                ) { viewModel.logicAnswerType = .text }
            }

            if viewModel.logicAnswerType == .choice {
                VStack(alignment: .leading, spacing: ZrpSpacing.sm) {
                    ForEach(Array(viewModel.logicOptions.indices), id: \.self) { index in
                        if viewModel.logicOptions.indices.contains(index) {
                            logicOptionRow(index)
                        }
                    }
                    if viewModel.canAddLogicOption {
                        Button {
                            viewModel.addLogicOption()
                        } label: {
                            Text(.playAddOption)
                                .font(.caption.weight(.semibold))
                                .foregroundStyle(ZrpColor.red)
                        }
                        .buttonStyle(.plain)
                    }
                }
            } else {
                VStack(alignment: .leading, spacing: ZrpSpacing.xs) {
                    sectionLabel(.playLogicFreeTextAnswer)
                    TextField("", text: $viewModel.logicAnswer)
                        .textFieldStyle(.roundedBorder)
                }
            }
        }
    }

    private func logicOptionRow(_ index: Int) -> some View {
        HStack(spacing: ZrpSpacing.sm) {
            let isCorrect = viewModel.logicCorrectIndex == index
            Button {
                viewModel.logicCorrectIndex = index
            } label: {
                Image(systemName: isCorrect ? "checkmark.circle.fill" : "circle")
                    .foregroundStyle(isCorrect ? ZrpColor.green : ZrpColor.onSurfaceMuted)
                    .frame(width: ZrpMetrics.minTouchTarget, height: ZrpMetrics.minTouchTarget)
                    .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel(Text(.playMarkCorrect))
            .accessibilityAddTraits(isCorrect ? [.isSelected, .isButton] : .isButton)

            TextField(
                L10n.string(.playOptionPlaceholder, ["n": "\(index + 1)"]),
                text: logicOptionBinding(index)
            )
            .textFieldStyle(.roundedBorder)
        }
    }

    private func logicOptionBinding(_ index: Int) -> Binding<String> {
        Binding(
            get: { viewModel.logicOptions.indices.contains(index) ? viewModel.logicOptions[index] : "" },
            set: { newValue in
                guard viewModel.logicOptions.indices.contains(index) else { return }
                viewModel.logicOptions[index] = newValue
            }
        )
    }
}
