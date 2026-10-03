import SwiftUI

// The two celebratory layers drawn over a live room. Both are
// hit-testing-disabled and independent of the room's media views, so
// a burst of gifts or reactions can never block a tap on the stage or
// stall a camera tile - they are pure decoration on top of it.

// MARK: - Gifts

/// Gift banners from `live-gift:sent`, as admitted by `LiveGiftQueue`
/// (at most two on screen, repeat gifts folded into a growing combo).
struct LiveGiftBannerLayer: View {

    @ObservedObject var engagement: LiveEngagementViewModel
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        VStack(alignment: .leading, spacing: ZrpSpacing.sm) {
            ForEach(engagement.giftQueue.visible) { banner in
                LiveGiftBannerView(
                    banner: banner,
                    gift: engagement.gift(forKey: banner.giftKey),
                    sender: engagement.people[banner.senderId]
                )
                .transition(
                    reduceMotion
                        ? AnyTransition.opacity
                        : AnyTransition.move(edge: .leading).combined(with: AnyTransition.opacity)
                )
            }
        }
        .animation(reduceMotion ? Animation?.none : Animation.easeOut(duration: 0.25), value: engagement.giftQueue.visible)
        .frame(maxWidth: .infinity, alignment: .leading)
        .allowsHitTesting(false)
    }
}

private struct LiveGiftBannerView: View {

    let banner: LiveGiftBanner
    let gift: LiveGift?
    let sender: LiveChatAuthor?

    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var pop = false

    private var giftName: String { gift?.displayName ?? liveGiftDisplayName(banner.giftKey) }
    private var senderName: String { sender?.displayName ?? L10n.string(.iosLiveSomeone) }

    var body: some View {
        HStack(spacing: ZrpSpacing.sm) {
            AvatarView(url: sender?.avatarUrl, displayName: senderName, size: 32)
            Text(.iosLiveGiftBanner, ["name": senderName, "gift": giftName])
                .font(.footnote.weight(.semibold))
                .foregroundStyle(.white)
                .lineLimit(2)
            animation
            HStack(spacing: 2) {
                Image(systemName: "multiply")
                    .font(.caption.weight(.bold))
                Text(verbatim: "\(banner.quantity)")
                    .font(.title3.weight(.heavy).monospacedDigit())
            }
            .foregroundStyle(.white)
            .scaleEffect(pop ? 1.25 : 1)
        }
        .padding(.vertical, ZrpSpacing.xs)
        .padding(.leading, ZrpSpacing.xs)
        .padding(.trailing, ZrpSpacing.md)
        .background(
            LinearGradient(
                colors: [ZrpColor.darkRed.opacity(0.92), Color.black.opacity(0.55)],
                startPoint: .leading,
                endPoint: .trailing
            ),
            in: Capsule()
        )
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(Text(.iosLiveGiftBanner, ["name": senderName, "gift": giftName]))
        .accessibilityValue(Text(verbatim: "\(banner.quantity)"))
        .onChange(of: banner.generation) { _, _ in
            guard !reduceMotion else { return }
            withAnimation(.spring(response: 0.18, dampingFraction: 0.5)) { pop = true }
            withAnimation(.easeOut(duration: 0.18).delay(0.18)) { pop = false }
        }
    }

    /// A gift's own animation (a GIF, played by `AnimatedImage`) when it
    /// has one and motion is allowed; its still icon otherwise.
    @ViewBuilder
    private var animation: some View {
        if !reduceMotion, let url = gift?.animationUrl, !url.isEmpty {
            AnimatedImage(url: url, fallbackTargetSize: 40)
                .frame(width: 40, height: 40)
                .clipShape(RoundedRectangle(cornerRadius: ZrpRadius.sm, style: .continuous))
                .accessibilityHidden(true)
        } else {
            LiveGiftIcon(gift: gift, size: 36)
        }
    }
}

// MARK: - Reactions

/// Floating hearts. Each `LiveReactionBurst` draws a handful of
/// particles proportional to its tap count (capped - see
/// `liveReactionParticleCount`) plus a "+N" for the rest, so a 20-tap
/// batch reads as big without twenty views.
struct LiveReactionLayer: View {

    let bursts: [LiveReactionBurst]

    var body: some View {
        ZStack(alignment: .bottom) {
            ForEach(bursts) { burst in
                LiveReactionBurstView(burst: burst)
            }
        }
        .frame(width: 120, height: 280, alignment: .bottom)
        .allowsHitTesting(false)
        .accessibilityHidden(true)
    }
}

private struct LiveReactionBurstView: View {

    let burst: LiveReactionBurst

    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var launched = false

    var body: some View {
        ZStack(alignment: .bottom) {
            ForEach(0..<burst.particles, id: \.self) { index in
                Image(systemName: "heart.fill")
                    .font(.title2)
                    .foregroundStyle(index.isMultiple(of: 3) ? ZrpColor.darkRed : ZrpColor.red)
                    .shadow(color: .black.opacity(0.25), radius: 2, y: 1)
                    .offset(
                        x: reduceMotion || !launched ? 0 : drift(index),
                        y: reduceMotion || !launched ? 0 : -CGFloat(150 + index * 18)
                    )
                    .scaleEffect(launched ? 1.15 : 0.6)
                    .opacity(launched ? 0 : 1)
                    .animation(
                        .easeOut(duration: reduceMotion ? 0.6 : 1.8).delay(Double(index) * 0.07),
                        value: launched
                    )
            }
            if burst.overflow > 0 {
                Text(verbatim: "+\(burst.overflow)")
                    .font(.caption.weight(.heavy).monospacedDigit())
                    .foregroundStyle(.white)
                    .padding(.horizontal, ZrpSpacing.xs)
                    .background(ZrpColor.red, in: Capsule())
                    .offset(y: launched && !reduceMotion ? -110 : -20)
                    .opacity(launched ? 0 : 1)
                    .animation(.easeOut(duration: 1.6), value: launched)
            }
        }
        .onAppear { launched = true }
    }

    /// A deterministic sideways drift per particle, so a burst fans out
    /// rather than stacking into one column.
    private func drift(_ index: Int) -> CGFloat {
        let direction: CGFloat = index.isMultiple(of: 2) ? -1 : 1
        let magnitude = CGFloat(10 + (index * 13) % 32)
        return direction * magnitude + (burst.isMine ? 6 : -6)
    }
}

/// The reaction button with the room's live total under it.
struct LiveReactionButton: View {

    @ObservedObject var engagement: LiveEngagementViewModel
    var onVideo = false

    var body: some View {
        Button {
            engagement.tapReaction()
        } label: {
            VStack(spacing: 2) {
                Image(systemName: "heart.fill")
                    .font(.title3)
                    .foregroundStyle(ZrpColor.red)
                    .frame(width: ZrpMetrics.minTouchTarget, height: ZrpMetrics.minTouchTarget)
                    .background(onVideo ? Color.black.opacity(0.45) : ZrpColor.surfaceElevated, in: Circle())
                if let compact = CountFormatting.compact(engagement.roomReactionCount) {
                    Text(verbatim: compact)
                        .font(.caption2.weight(.semibold).monospacedDigit())
                        .foregroundStyle(onVideo ? Color.white : ZrpColor.onSurfaceMuted)
                }
            }
        }
        .buttonStyle(.plain)
        .accessibilityLabel(Text(.chatReactAria))
        .accessibilityValue(Text(.iosLiveReactionCount, ["n": CountFormatting.exact(engagement.roomReactionCount)]))
    }
}
