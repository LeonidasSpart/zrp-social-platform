import AVFoundation
import AVKit
import SwiftUI

/// Full-screen media viewer.
///
/// Images page horizontally and pinch to zoom; a video plays through
/// `AVPlayer` with the system transport controls. Real playback, not a
/// still stand-in - `AVKit` needs no third-party dependency for this.
struct FullScreenMediaView: View {

    let urls: [String]
    let isVideo: Bool
    let startIndex: Int

    @Environment(\.dismiss) private var dismiss
    @State private var page: Int
    @State private var player: AVPlayer?

    init(urls: [String], isVideo: Bool, startIndex: Int) {
        self.urls = urls
        self.isVideo = isVideo
        self.startIndex = startIndex
        _page = State(initialValue: startIndex)
    }

    var body: some View {
        ZStack(alignment: .topTrailing) {
            Color.black.ignoresSafeArea()

            if isVideo {
                videoPlayer
            } else {
                imagePager
            }

            closeButton
        }
        .statusBarHidden()
        .onDisappear {
            // Release the player explicitly. Without this a paused item
            // keeps its decoder and buffers alive for as long as the
            // view's storage does.
            player?.pause()
            player = nil
        }
    }

    // MARK: -

    @ViewBuilder
    private var videoPlayer: some View {
        if let player {
            VideoPlayer(player: player)
                .ignoresSafeArea()
                .onAppear { player.play() }
        } else {
            ProgressView()
                .tint(.white)
                .task {
                    guard let first = urls.first, let url = URL(string: first) else { return }
                    // Configure playback before creating the player so
                    // audio is not silenced by the ringer switch, which is
                    // what a user expects when they deliberately opened a
                    // video full screen.
                    try? AVAudioSession.sharedInstance().setCategory(.playback)
                    try? AVAudioSession.sharedInstance().setActive(true)
                    player = AVPlayer(url: url)
                }
        }
    }

    private var imagePager: some View {
        TabView(selection: $page) {
            ForEach(Array(urls.enumerated()), id: \.offset) { index, url in
                ZoomableImage(url: url).tag(index)
            }
        }
        .tabViewStyle(.page(indexDisplayMode: urls.count > 1 ? .automatic : .never))
        .ignoresSafeArea()
    }

    private var closeButton: some View {
        Button {
            dismiss()
        } label: {
            Image(systemName: "xmark")
                .font(.headline)
                .foregroundStyle(.white)
                .frame(width: ZrpMetrics.minTouchTarget, height: ZrpMetrics.minTouchTarget)
                .background(.black.opacity(0.5), in: Circle())
        }
        .padding(ZrpSpacing.lg)
        .accessibilityLabel(Text(.iosMediaClose))
    }
}

/// One pinch-to-zoom, drag-to-pan image.
private struct ZoomableImage: View {

    let url: String

    @State private var scale: CGFloat = 1
    @State private var committedScale: CGFloat = 1
    @State private var offset: CGSize = .zero
    @State private var committedOffset: CGSize = .zero

    var body: some View {
        AsyncImage(url: URL(string: url)) { phase in
            switch phase {
            case .success(let image):
                image
                    .resizable()
                    .scaledToFit()
                    .scaleEffect(scale)
                    .offset(offset)
                    .gesture(magnification)
                    .simultaneousGesture(drag)
                    .onTapGesture(count: 2) { resetOrZoom() }
            case .failure:
                Image(systemName: "exclamationmark.triangle")
                    .font(.largeTitle)
                    .foregroundStyle(.white.opacity(0.7))
            case .empty:
                ProgressView().tint(.white)
            @unknown default:
                EmptyView()
            }
        }
    }

    private var magnification: some Gesture {
        MagnifyGesture()
            .onChanged { value in
                // Clamped so an image cannot be shrunk away or blown up
                // past anything useful.
                scale = min(max(committedScale * value.magnification, 1), 6)
            }
            .onEnded { _ in
                committedScale = scale
                if scale <= 1 { resetPan() }
            }
    }

    private var drag: some Gesture {
        DragGesture()
            .onChanged { value in
                // Panning only makes sense once zoomed in; otherwise the
                // drag belongs to the pager underneath.
                guard scale > 1 else { return }
                offset = CGSize(
                    width: committedOffset.width + value.translation.width,
                    height: committedOffset.height + value.translation.height
                )
            }
            .onEnded { _ in
                guard scale > 1 else { return }
                committedOffset = offset
            }
    }

    private func resetOrZoom() {
        withAnimation(.easeInOut(duration: 0.2)) {
            if scale > 1 {
                scale = 1
                committedScale = 1
                resetPan()
            } else {
                scale = 2.5
                committedScale = 2.5
            }
        }
    }

    private func resetPan() {
        offset = .zero
        committedOffset = .zero
    }
}
