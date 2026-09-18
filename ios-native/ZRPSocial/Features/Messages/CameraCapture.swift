import SwiftUI
import UIKit

/// Wraps `UIImagePickerController(sourceType: .camera)` - SwiftUI has no
/// native camera-capture view (`PhotosPicker` is photo-library-only by
/// design), so this is the one place in the app that still needs a UIKit
/// bridge. The captured photo is written to a temp JPEG and then handed
/// through `PickedMedia`'s own copy-and-classify initializer, so it joins
/// the exact same `pendingImage` -> chatImage-upload pipeline a photo
/// chosen from the library already uses - one real path, two real
/// sources, matching ChatInterface.tsx's own `capture="environment"`
/// input and Android's `TakePicture()` launcher from the same pass.
struct CameraCapture: UIViewControllerRepresentable {

    let onCapture: (PickedMedia) -> Void
    let onFailure: () -> Void
    let onCancel: () -> Void

    func makeUIViewController(context: Context) -> UIImagePickerController {
        let picker = UIImagePickerController()
        picker.sourceType = .camera
        picker.delegate = context.coordinator
        return picker
    }

    func updateUIViewController(_ uiViewController: UIImagePickerController, context: Context) {}

    func makeCoordinator() -> Coordinator {
        Coordinator(onCapture: onCapture, onFailure: onFailure, onCancel: onCancel)
    }

    final class Coordinator: NSObject, UIImagePickerControllerDelegate, UINavigationControllerDelegate {

        private let onCapture: (PickedMedia) -> Void
        private let onFailure: () -> Void
        private let onCancel: () -> Void

        init(onCapture: @escaping (PickedMedia) -> Void, onFailure: @escaping () -> Void, onCancel: @escaping () -> Void) {
            self.onCapture = onCapture
            self.onFailure = onFailure
            self.onCancel = onCancel
        }

        func imagePickerController(
            _ picker: UIImagePickerController,
            didFinishPickingMediaWithInfo info: [UIImagePickerController.InfoKey: Any]
        ) {
            guard
                let image = info[.originalImage] as? UIImage,
                let data = image.jpegData(compressionQuality: 0.9)
            else {
                onFailure()
                return
            }

            // A short-lived source PickedMedia's own copying init reads
            // once and then owns its own destination copy - this source
            // file is removed right after, the same way PhotosPicker's
            // system-owned sandbox is gone the moment its transfer
            // closure returns.
            let source = FileManager.default.temporaryDirectory
                .appendingPathComponent("zrp-camera-\(UUID().uuidString)")
                .appendingPathExtension("jpg")
            do {
                try data.write(to: source)
                defer { try? FileManager.default.removeItem(at: source) }
                let media = try PickedMedia(copying: source, isVideo: false)
                onCapture(media)
            } catch {
                onFailure()
            }
        }

        func imagePickerControllerDidCancel(_ picker: UIImagePickerController) {
            onCancel()
        }
    }
}
