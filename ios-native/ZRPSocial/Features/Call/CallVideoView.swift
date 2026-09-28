import SwiftUI
import WebRTC

/// Wraps `RTCMTLVideoView` - the Metal-backed renderer every modern
/// (arm64-only) iOS device uses; this app's 17.0 deployment target never
/// needs the OpenGL ES `RTCEAGLVideoView` fallback older WebRTC samples
/// still carry for pre-Metal hardware.
struct CallVideoView: UIViewRepresentable {

    let track: RTCVideoTrack?
    var mirror: Bool = false

    func makeUIView(context: Context) -> RTCMTLVideoView {
        let view = RTCMTLVideoView()
        view.videoContentMode = .scaleAspectFill
        view.transform = mirror ? CGAffineTransform(scaleX: -1, y: 1) : .identity
        return view
    }

    func updateUIView(_ uiView: RTCMTLVideoView, context: Context) {
        // The previous track (if any) is detached before the new one is
        // attached - a stale `RTCVideoRenderer` left on a track that has
        // already switched (this view's `track` changing without the
        // `UIView` itself being torn down) would otherwise keep drawing
        // frames from media nobody asked for.
        if let previous = context.coordinator.attachedTrack, previous !== track {
            previous.remove(uiView)
            context.coordinator.attachedTrack = nil
        }
        if let track, context.coordinator.attachedTrack !== track {
            track.add(uiView)
            context.coordinator.attachedTrack = track
        }
    }

    static func dismantleUIView(_ uiView: RTCMTLVideoView, coordinator: Coordinator) {
        coordinator.attachedTrack?.remove(uiView)
        coordinator.attachedTrack = nil
    }

    func makeCoordinator() -> Coordinator { Coordinator() }

    final class Coordinator {
        var attachedTrack: RTCVideoTrack?
    }
}
