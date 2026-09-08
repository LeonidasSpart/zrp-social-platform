import SwiftUI
import UIKit

/// How much of a view is actually on screen.
///
/// Lifted out of `InlineVideoView`, which has measured this since the
/// video feed shipped, because a second caller now needs the same
/// answer: a sponsored post logs a **billed** impression, and "billed"
/// is exactly why it cannot use `.onAppear`. A `LazyVStack` creates a
/// row slightly before it is on screen - fine for a view tally, and not
/// fine for something an advertiser pays for.
enum ScreenVisibility {

    /// How much of `frame` lies inside the key window, 0…1 by height.
    ///
    /// Height alone: a timeline scrolls vertically and a card is always
    /// full width, so the horizontal extent carries no information.
    ///
    /// `.global` is the window's coordinate space, so the window's own
    /// bounds are the viewport to measure against. With no key window -
    /// during a scene transition, or in a background scene - the honest
    /// answer is zero rather than a guess.
    static func fraction(of frame: CGRect) -> CGFloat {
        guard frame.height > 0 else { return 0 }
        guard let window = UIApplication.shared.connectedScenes
            .compactMap({ $0 as? UIWindowScene })
            .flatMap(\.windows)
            .first(where: \.isKeyWindow)
        else {
            return 0
        }
        let visible = frame.intersection(window.bounds).height
        return max(0, min(1, visible / frame.height))
    }
}

extension View {
    /// Calls `perform` once, the first time at least `threshold` of this
    /// view is on screen.
    ///
    /// Measured in a background `GeometryReader` so it adds no layout of
    /// its own, and fired at most once for the lifetime of the modifier's
    /// state - the caller does not have to guard against a scroll that
    /// crosses the threshold repeatedly.
    func onVisible(threshold: CGFloat, perform: @escaping () -> Void) -> some View {
        modifier(OnVisibleModifier(threshold: threshold, perform: perform))
    }
}

private struct OnVisibleModifier: ViewModifier {

    let threshold: CGFloat
    let perform: () -> Void

    @State private var hasFired = false

    func body(content: Content) -> some View {
        content.background {
            GeometryReader { proxy in
                Color.clear
                    .onChange(of: proxy.frame(in: .global)) { _, frame in
                        fire(if: frame)
                    }
                    .onAppear { fire(if: proxy.frame(in: .global)) }
            }
        }
    }

    private func fire(if frame: CGRect) {
        guard !hasFired,
              ScreenVisibility.fraction(of: frame) >= threshold
        else { return }
        hasFired = true
        perform()
    }
}
