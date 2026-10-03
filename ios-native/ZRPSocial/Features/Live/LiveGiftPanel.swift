import SwiftUI
import UIKit

/// The gift panel: the real catalog (`GET /api/live/gifts`), the real
/// coin balance (`GET /api/wallet/coins/balance`, re-read every time the
/// panel opens and after every send), a quantity picker, and a
/// confirmation that states the exact cost before anything is spent.
///
/// It only ever spends an existing balance. Adding coins is a real-money
/// purchase that the server refuses from this app
/// (`rejectNativePayment`, App Store rule 3.1.1) - so when the balance
/// cannot cover a gift, the panel says plainly that adding coins is not
/// available in the app, reusing the `native.paymentUnavailable` copy
/// the website's own native shell shows for tips, rather than offering a
/// button that could only fail or a link out of the app.
struct LiveGiftPanel: View {

    @ObservedObject var engagement: LiveEngagementViewModel
    /// The host - the only possible recipient (`room.hostId`).
    let hostName: String
    let onSent: () -> Void

    @Environment(\.dismiss) private var dismiss
    @State private var selectedKey: String?
    @State private var quantity = 1
    @State private var confirming = false

    private let quickQuantities = [1, 5, 10, 50]

    private var selectedGift: LiveGift? {
        selectedKey.flatMap { engagement.gift(forKey: $0) }
    }

    private var totalCoins: Int {
        (selectedGift?.priceCoins ?? 0) * quantity
    }

    /// True only when the balance is actually known and too low - an
    /// unknown balance never blocks a send; the server decides.
    private var balanceTooLow: Bool {
        guard let balance = engagement.coinBalance, selectedGift != nil else { return false }
        return totalCoins > balance
    }

    var body: some View {
        NavigationStack {
            content
                .background(ZrpColor.background.ignoresSafeArea())
                .navigationTitle(Text(.iosLiveGiftTitle))
                .navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    ToolbarItem(placement: .cancellationAction) {
                        Button {
                            dismiss()
                        } label: {
                            Text(.actionCancel)
                        }
                    }
                }
        }
        .presentationDetents([.medium, .large])
        .task { await engagement.loadGiftPanel() }
        .confirmationDialog(
            Text(.iosLiveGiftConfirmTitle, [
                "qty": "\(quantity)",
                "gift": selectedGift?.displayName ?? "",
                "name": hostName,
            ]),
            isPresented: $confirming,
            titleVisibility: .visible
        ) {
            Button {
                send()
            } label: {
                Text(.iosLiveGiftSendFor, ["n": CountFormatting.exact(totalCoins)])
            }
        }
    }

    @ViewBuilder
    private var content: some View {
        switch engagement.catalogPhase {
        case .idle, .loading:
            TimelineStateView.loading()
        case .failed(let message):
            VStack(spacing: ZrpSpacing.lg) {
                Text(verbatim: message)
                    .font(.subheadline)
                    .foregroundStyle(ZrpColor.onSurfaceMuted)
                    .multilineTextAlignment(.center)
                Button {
                    Task { await engagement.loadCatalog() }
                } label: {
                    Text(.feedTryAgain)
                        .font(.subheadline.weight(.semibold))
                        .padding(.horizontal, ZrpSpacing.xl)
                        .frame(minHeight: ZrpMetrics.minTouchTarget)
                        .background(ZrpColor.red, in: Capsule())
                        .foregroundStyle(.white)
                }
            }
            .padding(ZrpSpacing.xl)
            .frame(maxWidth: .infinity, maxHeight: .infinity)
        case .loaded:
            if engagement.catalog.isEmpty {
                VStack(spacing: ZrpSpacing.md) {
                    balanceRow
                    Spacer()
                    Image(systemName: "gift")
                        .font(.largeTitle)
                        .foregroundStyle(ZrpColor.onSurfaceMuted)
                    Text(.iosLiveGiftEmpty)
                        .font(.subheadline)
                        .foregroundStyle(ZrpColor.onSurfaceMuted)
                        .multilineTextAlignment(.center)
                    Spacer()
                }
                .padding(ZrpSpacing.lg)
            } else {
                loaded
            }
        }
    }

    private var balanceRow: some View {
        HStack(spacing: ZrpSpacing.sm) {
            Text(.creatorDashStatBalance)
                .font(.subheadline)
                .foregroundStyle(ZrpColor.onSurfaceMuted)
            Spacer()
            Image(systemName: "circle.hexagongrid.fill")
                .foregroundStyle(ZrpColor.red)
                .accessibilityHidden(true)
            if let balance = engagement.coinBalance {
                Text(.iosLiveGiftCoins, ["n": CountFormatting.exact(balance)])
                    .font(.subheadline.weight(.semibold).monospacedDigit())
                    .foregroundStyle(ZrpColor.onSurface)
            } else {
                ProgressView().controlSize(.small)
            }
        }
        .accessibilityElement(children: .combine)
    }

    private var loaded: some View {
        VStack(spacing: 0) {
            ScrollView {
                VStack(alignment: .leading, spacing: ZrpSpacing.lg) {
                    balanceRow

                    LazyVGrid(columns: [GridItem(.adaptive(minimum: 84), spacing: ZrpSpacing.md)], spacing: ZrpSpacing.md) {
                        ForEach(engagement.catalog) { gift in
                            giftCell(gift)
                        }
                    }

                    if selectedGift != nil {
                        quantityPicker
                    }

                    if let error = engagement.giftError {
                        Text(verbatim: error)
                            .font(.footnote)
                            .foregroundStyle(ZrpColor.red)
                            .accessibilityAddTraits(.isStaticText)
                    }

                    if balanceTooLow || engagement.giftErrorIsInsufficientBalance {
                        coinsUnavailableNotice
                    }
                }
                .padding(ZrpSpacing.lg)
            }

            sendBar
        }
    }

    private func giftCell(_ gift: LiveGift) -> some View {
        let isSelected = gift.key == selectedKey
        return Button {
            selectedKey = gift.key
            engagement.giftError = nil
        } label: {
            VStack(spacing: ZrpSpacing.xs) {
                LiveGiftIcon(gift: gift, size: 44)
                Text(verbatim: gift.displayName)
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(ZrpColor.onSurface)
                    .lineLimit(1)
                    .minimumScaleFactor(0.8)
                Text(.iosLiveGiftCoins, ["n": CountFormatting.exact(gift.priceCoins)])
                    .font(.caption2.monospacedDigit())
                    .foregroundStyle(ZrpColor.onSurfaceMuted)
                    .lineLimit(1)
            }
            .padding(ZrpSpacing.sm)
            .frame(maxWidth: .infinity, minHeight: 104)
            .background(ZrpColor.surfaceElevated, in: RoundedRectangle(cornerRadius: ZrpRadius.md, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: ZrpRadius.md, style: .continuous)
                    .strokeBorder(isSelected ? ZrpColor.red : ZrpColor.outline, lineWidth: isSelected ? 2 : 0.5)
            )
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(isSelected ? .isSelected : [])
    }

    private var quantityPicker: some View {
        VStack(alignment: .leading, spacing: ZrpSpacing.sm) {
            Stepper(value: $quantity, in: 1...liveGiftMaxQuantity) {
                HStack {
                    Text(.iosLiveGiftQuantity)
                        .font(.subheadline)
                    Spacer()
                    Text(verbatim: "\(quantity)")
                        .font(.subheadline.weight(.semibold).monospacedDigit())
                }
            }

            HStack(spacing: ZrpSpacing.sm) {
                ForEach(quickQuantities, id: \.self) { value in
                    Button {
                        quantity = value
                    } label: {
                        Text(verbatim: "\(value)")
                            .font(.footnote.weight(.semibold).monospacedDigit())
                            .frame(minWidth: ZrpMetrics.minTouchTarget, minHeight: 36)
                            .background(
                                quantity == value ? ZrpColor.red : ZrpColor.surfaceHighest,
                                in: Capsule()
                            )
                            .foregroundStyle(quantity == value ? Color.white : ZrpColor.onSurface)
                    }
                    .buttonStyle(.plain)
                    .accessibilityAddTraits(quantity == value ? .isSelected : [])
                }
            }
        }
    }

    private var coinsUnavailableNotice: some View {
        VStack(alignment: .leading, spacing: ZrpSpacing.xs) {
            Text(.nativePaymentUnavailableTitle)
                .font(.footnote.weight(.semibold))
                .foregroundStyle(ZrpColor.onSurface)
            Text(.iosLiveGiftCoinsUnavailable)
                .font(.footnote)
                .foregroundStyle(ZrpColor.onSurfaceMuted)
        }
        .padding(ZrpSpacing.md)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(ZrpColor.surfaceElevated, in: RoundedRectangle(cornerRadius: ZrpRadius.md, style: .continuous))
        .accessibilityElement(children: .combine)
    }

    private var sendBar: some View {
        let disabled = selectedGift == nil || engagement.isSendingGift || balanceTooLow || engagement.amHost
        return Button {
            confirming = true
        } label: {
            Group {
                if engagement.isSendingGift {
                    ProgressView().tint(.white)
                } else if selectedGift != nil {
                    Text(.iosLiveGiftSendFor, ["n": CountFormatting.exact(totalCoins)])
                } else {
                    Text(.iosLiveGiftTitle)
                }
            }
            .font(.subheadline.weight(.semibold))
            .frame(maxWidth: .infinity, minHeight: ZrpMetrics.minTouchTarget)
            .background(disabled ? ZrpColor.red.opacity(0.4) : ZrpColor.red, in: Capsule())
            .foregroundStyle(.white)
        }
        .disabled(disabled)
        .padding(ZrpSpacing.lg)
        .background(ZrpColor.surface)
    }

    private func send() {
        guard let gift = selectedGift else { return }
        let count = quantity
        Task {
            if await engagement.sendGift(gift, quantity: count) {
                UIAccessibility.post(notification: .announcement, argument: L10n.string(.iosLiveGiftSent))
                onSent()
                dismiss()
            }
        }
    }
}

/// A gift's icon, or a gift glyph when it has none (an admin may create
/// a gift without artwork) or the image fails to load.
struct LiveGiftIcon: View {
    let gift: LiveGift?
    let size: CGFloat

    var body: some View {
        Group {
            if let url = gift?.iconUrl, !url.isEmpty {
                RemoteImage(url: url, targetSize: size) { placeholder }
                    .scaledToFit()
            } else {
                placeholder
            }
        }
        .frame(width: size, height: size)
        .accessibilityHidden(true)
    }

    private var placeholder: some View {
        Image(systemName: "gift.fill")
            .resizable()
            .scaledToFit()
            .padding(size * 0.15)
            .foregroundStyle(ZrpColor.red)
    }
}
