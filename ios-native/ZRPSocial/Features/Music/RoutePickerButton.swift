import AVKit
import SwiftUI
import UIKit

/// The system AirPlay / output-route picker.
///
/// `AVRoutePickerView` is the only way to offer this: the list of
/// available routes is not public API, and a hand-built sheet could not
/// enumerate them, let alone switch to one. It also updates itself when
/// a route connects or drops, which is why it is wrapped rather than
/// driven from player state.
///
/// The button is always present, as it is in Apple's own players: it is
/// how someone discovers that AirPlay exists, and hiding it until a
/// route appears would mean hiding it exactly when it is being looked
/// for.
struct RoutePickerButton: UIViewRepresentable {

    func makeUIView(context: Context) -> AVRoutePickerView {
        let view = AVRoutePickerView()
        view.tintColor = UIColor(ZrpColor.onSurfaceMuted)
        // The colour used once a route is actually connected, so the
        // control reads as active the same way shuffle and repeat do.
        view.activeTintColor = UIColor(ZrpColor.red)
        // ZRP plays audio, not video, so the picker should not offer to
        // mirror the whole screen.
        view.prioritizesVideoDevices = false
        return view
    }

    func updateUIView(_ view: AVRoutePickerView, context: Context) {}
}
