import SwiftUI

@MainActor
final class LiveGiftsReceivedViewModel: ObservableObject {

    enum Phase: Equatable {
        case loading
        case loaded([LiveReceivedGift])
        case failed(ApiError)
    }

    @Published private(set) var phase: Phase = .loading
    private let repository: LiveEngagementRepositoryProtocol

    init(repository: LiveEngagementRepositoryProtocol = LiveEngagementRepository()) {
        self.repository = repository
    }

    func load() async {
        do {
            phase = .loaded(try await repository.receivedGifts())
        } catch let error as ApiError {
            if case .loaded = phase { return }
            phase = .failed(error)
        } catch {
            if case .loaded = phase { return }
            phase = .failed(.transport(underlying: "\(error)"))
        }
    }
}

/// Gifts the signed-in person received while hosting - `GET /api/creator/
/// gifts`, newest first. Shows who sent what, how many, and its coin
/// value; the USDC earnings split that route also returns is the money
/// surface this app leaves to the website (see `LiveReceivedGift`).
struct LiveGiftsReceivedView: View {

    @StateObject private var viewModel = LiveGiftsReceivedViewModel()

    var body: some View {
        Group {
            switch viewModel.phase {
            case .loading:
                TimelineStateView.loading()
            case .failed(let error):
                TimelineStateView.error(error) {
                    Task { await viewModel.load() }
                }
            case .loaded(let gifts):
                if gifts.isEmpty {
                    TimelineStateView.empty(
                        systemImage: "gift",
                        title: .iosLiveGiftReceivedEmptyTitle,
                        subtitle: .iosLiveGiftReceivedEmptyDesc
                    )
                } else {
                    list(gifts)
                }
            }
        }
        .background(ZrpColor.background.ignoresSafeArea())
        .navigationTitle(Text(.iosLiveGiftReceivedTitle))
        .navigationBarTitleDisplayMode(.inline)
        .task { await viewModel.load() }
    }

    private func list(_ gifts: [LiveReceivedGift]) -> some View {
        List(gifts) { gift in
            HStack(spacing: ZrpSpacing.md) {
                AvatarView(url: gift.sender.avatarUrl, displayName: gift.sender.displayName, size: ZrpMetrics.avatarMedium)
                VStack(alignment: .leading, spacing: 2) {
                    Text(verbatim: gift.sender.displayName)
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(ZrpColor.onSurface)
                        .lineLimit(1)
                    Text(.iosLiveGiftQuantityLabel, [
                        "gift": liveGiftDisplayName(gift.giftDefinition.key),
                        "n": "\(gift.quantity)",
                    ])
                    .font(.footnote)
                    .foregroundStyle(ZrpColor.onSurfaceMuted)
                    .lineLimit(1)
                    Text(verbatim: RelativeTime.compact(from: gift.createdAt))
                        .font(.caption)
                        .foregroundStyle(ZrpColor.onSurfaceMuted)
                        .accessibilityLabel(Text(verbatim: RelativeTime.accessible(from: gift.createdAt)))
                }
                Spacer(minLength: ZrpSpacing.sm)
                VStack(alignment: .trailing, spacing: 2) {
                    RemoteImage(url: gift.giftDefinition.iconUrl, targetSize: 32) {
                        Image(systemName: "gift.fill")
                            .resizable()
                            .scaledToFit()
                            .foregroundStyle(ZrpColor.red)
                    }
                    .scaledToFit()
                    .frame(width: 32, height: 32)
                    .accessibilityHidden(true)
                    Text(.iosLiveGiftCoins, ["n": CountFormatting.exact(gift.totalCoins)])
                        .font(.caption.weight(.semibold).monospacedDigit())
                        .foregroundStyle(ZrpColor.onSurface)
                }
            }
            .padding(.vertical, ZrpSpacing.xs)
            .accessibilityElement(children: .combine)
            .listRowBackground(ZrpColor.surface)
        }
        .listStyle(.plain)
        .refreshable { await viewModel.load() }
    }
}
