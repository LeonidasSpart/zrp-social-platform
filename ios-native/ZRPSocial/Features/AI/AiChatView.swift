import SwiftUI

@MainActor
final class AiChatViewModel: ObservableObject {

    /// One turn on screen. Not `AiMessage`: the question is shown the
    /// moment it is asked, before the server has given it an id.
    struct Turn: Identifiable, Equatable {
        let id: String
        let content: String
        let isAssistant: Bool
    }

    @Published private(set) var turns: [Turn] = []
    @Published var draft = ""
    @Published private(set) var isSending = false
    @Published private(set) var remaining: Int?
    @Published var errorMessage: String?

    private var conversationId: String?
    private let repository: AiRepositoryProtocol

    init(repository: AiRepositoryProtocol = AiRepository()) {
        self.repository = repository
    }

    var canSend: Bool {
        !isSending && !draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }

    /// Starts a fresh conversation. The server keys a conversation by the
    /// id it returns, so forgetting that id is all "new chat" means.
    func startNewChat() {
        conversationId = nil
        turns = []
        draft = ""
        errorMessage = nil
    }

    func ask(_ text: String) {
        draft = text
        Task { await send() }
    }

    func send() async {
        guard canSend else { return }
        let question = draft.trimmingCharacters(in: .whitespacesAndNewlines)

        isSending = true
        draft = ""
        // Shown immediately, with a local id - the server gives the
        // question an id of its own but only alongside the answer, and
        // waiting for that would leave the question invisible until the
        // model finished.
        turns.append(Turn(id: UUID().uuidString, content: question, isAssistant: false))
        defer { isSending = false }

        do {
            let reply = try await repository.send(
                message: question,
                conversationId: conversationId
            )
            conversationId = reply.conversationId
            remaining = reply.remaining
            turns.append(
                Turn(
                    id: reply.message.id,
                    content: reply.message.content,
                    isAssistant: true
                )
            )
        } catch let error as ApiError {
            // Includes the daily-limit refusal, which the server words
            // itself - shown as written rather than reinterpreted here.
            errorMessage = error.userFacingMessage
        } catch {
            errorMessage = L10n.string(.aiChatErrFailedResponse)
        }
    }
}

/// ZRP AI.
///
/// The same `POST /api/ai/chat` the website's own AIChat calls, with the
/// buffered reply rather than the streamed one - see `AiRepository` for
/// why. Daily limits are per plan and enforced server-side; this shows
/// what the server reports as remaining and never predicts it.
struct AiChatView: View {

    @StateObject private var viewModel = AiChatViewModel()
    @FocusState private var isComposerFocused: Bool

    var body: some View {
        content
            .background(ZrpColor.background.ignoresSafeArea())
            .navigationTitle(Text(.navAiAssistant))
            .navigationBarTitleDisplayMode(.inline)
            .safeAreaInset(edge: .bottom) { composer }
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button {
                        viewModel.startNewChat()
                    } label: {
                        Image(systemName: "square.and.pencil")
                    }
                    .accessibilityLabel(Text(.aiChatNewChat))
                    .disabled(viewModel.turns.isEmpty)
                }
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
    private var content: some View {
        if viewModel.turns.isEmpty {
            welcome
        } else {
            conversation
        }
    }

    private var welcome: some View {
        ScrollView {
            VStack(spacing: ZrpSpacing.lg) {
                Image(systemName: "sparkles")
                    .font(.largeTitle)
                    .foregroundStyle(ZrpColor.red)

                Text(.aiChatAskAnything)
                    .font(.headline)
                    .foregroundStyle(ZrpColor.onSurface)

                Text(.aiChatGetHelpChat)
                    .font(.subheadline)
                    .foregroundStyle(ZrpColor.onSurfaceMuted)
                    .multilineTextAlignment(.center)

                // The website's own two starters, from the same keys.
                VStack(spacing: ZrpSpacing.sm) {
                    suggestion(.aiChatSuggestionWhatIsZrp)
                    suggestion(.aiChatSuggestionWriteCharity)
                }

                footer
            }
            .padding(ZrpSpacing.xl)
            .frame(maxWidth: ZrpMetrics.contentMaxWidth)
            .frame(maxWidth: .infinity)
        }
    }

    private func suggestion(_ key: L10nKey) -> some View {
        Button {
            viewModel.ask(L10n.string(key))
        } label: {
            Text(key)
                .font(.subheadline)
                .foregroundStyle(ZrpColor.onSurface)
                .padding(.horizontal, ZrpSpacing.lg)
                .frame(maxWidth: .infinity)
                .frame(minHeight: ZrpMetrics.minTouchTarget)
                .background(ZrpColor.surfaceElevated)
                .clipShape(RoundedRectangle(cornerRadius: ZrpRadius.md, style: .continuous))
        }
        .buttonStyle(.plain)
    }

    private var conversation: some View {
        ScrollViewReader { proxy in
            ScrollView {
                LazyVStack(alignment: .leading, spacing: ZrpSpacing.md) {
                    ForEach(viewModel.turns) { turn in
                        bubble(turn).id(turn.id)
                    }
                    if viewModel.isSending {
                        ProgressView()
                            .tint(ZrpColor.red)
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .padding(.leading, ZrpSpacing.md)
                    }
                    footer
                }
                .padding(ZrpSpacing.lg)
                .frame(maxWidth: ZrpMetrics.contentMaxWidth)
                .frame(maxWidth: .infinity)
            }
            .scrollDismissesKeyboard(.interactively)
            .onChange(of: viewModel.turns.count) { _, _ in
                guard let last = viewModel.turns.last else { return }
                withAnimation(.easeOut(duration: 0.2)) {
                    proxy.scrollTo(last.id, anchor: .bottom)
                }
            }
        }
    }

    private func bubble(_ turn: AiChatViewModel.Turn) -> some View {
        Text(verbatim: turn.content)
            .font(.subheadline)
            .foregroundStyle(turn.isAssistant ? ZrpColor.onSurface : .white)
            .textSelection(.enabled)
            .fixedSize(horizontal: false, vertical: true)
            .padding(ZrpSpacing.md)
            .background(turn.isAssistant ? ZrpColor.surfaceElevated : ZrpColor.red)
            .clipShape(RoundedRectangle(cornerRadius: ZrpRadius.md, style: .continuous))
            .frame(
                maxWidth: .infinity,
                alignment: turn.isAssistant ? .leading : .trailing
            )
    }

    /// What the website puts under the same chat: who provides the model,
    /// where the revenue goes, and how many messages are left today.
    private var footer: some View {
        VStack(spacing: ZrpSpacing.xs) {
            if let remaining = viewModel.remaining {
                Text(.aiChatRemainingToday, ["n": CountFormatting.exact(remaining)])
            }
            Text(.aiChatCharityFooter)
            Text(.aiChatPoweredByDeepseek)
        }
        .font(.caption2)
        .foregroundStyle(ZrpColor.onSurfaceMuted)
        .multilineTextAlignment(.center)
        .frame(maxWidth: .infinity)
        .padding(.top, ZrpSpacing.md)
    }

    private var composer: some View {
        HStack(alignment: .bottom, spacing: ZrpSpacing.sm) {
            TextField(
                L10n.string(.aiChatInputPlaceholder),
                text: $viewModel.draft,
                axis: .vertical
            )
            .focused($isComposerFocused)
            .font(.subheadline)
            .lineLimit(1...5)
            .padding(ZrpSpacing.md)
            .background(ZrpColor.surfaceElevated)
            .clipShape(RoundedRectangle(cornerRadius: ZrpRadius.lg, style: .continuous))

            Button {
                Task { await viewModel.send() }
            } label: {
                Image(systemName: "paperplane.fill")
                    .foregroundStyle(viewModel.canSend ? ZrpColor.red : ZrpColor.onSurfaceMuted)
                    .frame(width: ZrpMetrics.minTouchTarget, height: ZrpMetrics.minTouchTarget)
            }
            .disabled(!viewModel.canSend)
            .accessibilityLabel(Text(.actionPost))
        }
        .padding(.horizontal, ZrpSpacing.lg)
        .padding(.vertical, ZrpSpacing.sm)
        .background(.bar)
    }
}
