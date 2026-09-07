import SwiftUI

@MainActor
final class GifPickerViewModel: ObservableObject {

    @Published var query = ""
    @Published private(set) var gifs: [GifResult] = []
    @Published private(set) var isLoading = false
    @Published private(set) var errorMessage: String?

    private let repository: MediaRepositoryProtocol
    private var searchTask: Task<Void, Never>?

    init(repository: MediaRepositoryProtocol = MediaRepository()) {
        self.repository = repository
    }

    func loadTrending() async {
        isLoading = true
        defer { isLoading = false }
        do {
            gifs = try await repository.trendingGifs()
            errorMessage = nil
        } catch {
            gifs = []
            errorMessage = Self.message(for: error)
        }
    }

    /// Debounced so typing does not fire a request per keystroke, and so
    /// a superseded search is cancelled rather than racing the one the
    /// user is actually waiting on.
    func search() {
        searchTask?.cancel()
        let term = query.trimmingCharacters(in: .whitespacesAndNewlines)

        searchTask = Task { [weak self] in
            guard let self else { return }
            try? await Task.sleep(for: .milliseconds(350))
            guard !Task.isCancelled else { return }

            if term.isEmpty {
                await self.loadTrending()
                return
            }

            await MainActor.run { self.isLoading = true }
            defer { Task { @MainActor in self.isLoading = false } }

            do {
                let results = try await self.repository.searchGifs(query: term)
                guard !Task.isCancelled else { return }
                await MainActor.run {
                    self.gifs = results
                    self.errorMessage = nil
                }
            } catch is CancellationError {
                return
            } catch {
                guard !Task.isCancelled else { return }
                await MainActor.run {
                    self.gifs = []
                    self.errorMessage = Self.message(for: error)
                }
            }
        }
    }

    /// The GIF routes answer 503 when `GIPHY_API_KEY` is unset. That is a
    /// configuration state, not an empty result, so it is reported as
    /// "unavailable" rather than silently showing no GIFs.
    private static func message(for error: Error) -> String {
        if case ApiError.server(let status, _, _) = error, status == 503 {
            return L10n.string(.iosComposeGifUnavailable)
        }
        return (error as? ApiError)?.userFacingMessage
            ?? L10n.string(.iosComposeGifUnavailable)
    }
}

/// GIF search, proxied through the ZRP backend to Giphy - the same route
/// the website's own picker uses. The client never talks to Giphy
/// directly and never holds a Giphy key.
struct GifPickerView: View {

    let onSelect: (GifResult) -> Void

    @Environment(\.dismiss) private var dismiss
    @StateObject private var viewModel = GifPickerViewModel()

    private let columns = [
        GridItem(.adaptive(minimum: 110), spacing: ZrpSpacing.sm)
    ]

    var body: some View {
        NavigationStack {
            Group {
                if viewModel.isLoading && viewModel.gifs.isEmpty {
                    TimelineStateView.loading()
                } else if let error = viewModel.errorMessage, viewModel.gifs.isEmpty {
                    VStack(spacing: ZrpSpacing.md) {
                        Image(systemName: "photo.badge.exclamationmark")
                            .font(.largeTitle)
                            .foregroundStyle(ZrpColor.onSurfaceMuted)
                        Text(verbatim: error)
                            .font(.subheadline)
                            .foregroundStyle(ZrpColor.onSurfaceMuted)
                            .multilineTextAlignment(.center)
                    }
                    .padding(ZrpSpacing.xl)
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                } else {
                    grid
                }
            }
            .background(ZrpColor.background.ignoresSafeArea())
            .navigationTitle(Text(.composerAddGif))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button { dismiss() } label: { Text(.actionCancel) }
                }
            }
            .searchable(
                text: $viewModel.query,
                placement: .navigationBarDrawer(displayMode: .always),
                prompt: Text(.iosComposeGifSearch)
            )
            .onChange(of: viewModel.query) { _, _ in viewModel.search() }
            .task {
                if viewModel.gifs.isEmpty { await viewModel.loadTrending() }
            }
        }
    }

    private var grid: some View {
        ScrollView {
            LazyVGrid(columns: columns, spacing: ZrpSpacing.sm) {
                ForEach(viewModel.gifs) { gif in
                    Button {
                        onSelect(gif)
                        dismiss()
                    } label: {
                        AsyncImage(url: URL(string: gif.url)) { phase in
                            if case .success(let image) = phase {
                                image.resizable().scaledToFill()
                            } else {
                                ZrpColor.surfaceElevated
                            }
                        }
                        .frame(height: 110)
                        .frame(maxWidth: .infinity)
                        .clipped()
                        .clipShape(RoundedRectangle(cornerRadius: ZrpRadius.sm, style: .continuous))
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel(Text(verbatim: gif.title ?? gif.id))
                }
            }
            .padding(ZrpSpacing.lg)
        }
    }
}
