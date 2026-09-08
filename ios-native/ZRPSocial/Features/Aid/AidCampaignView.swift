import SwiftUI

@MainActor
final class AidCampaignViewModel: ObservableObject {

    enum Phase: Equatable {
        case loading
        case loaded(HelpCampaign)
        case failed(ApiError)
    }

    @Published private(set) var phase: Phase = .loading
    @Published private(set) var isSending = false
    @Published var notice: String?

    private let campaignId: String
    private let repository: HelpRepositoryProtocol

    init(campaignId: String, repository: HelpRepositoryProtocol = HelpRepository()) {
        self.campaignId = campaignId
        self.repository = repository
    }

    func load() async {
        do {
            phase = .loaded(try await repository.campaign(id: campaignId))
        } catch {
            if case .loaded = phase { return }
            phase = .failed(error as? ApiError ?? .transport(underlying: "\(error)"))
        }
    }

    /// Offering supplies, skills or time. Returns whether it was sent, so
    /// the sheet can close only on success.
    func offer(needType: HelpNeedType, message: String) async -> Bool {
        guard !isSending else { return false }
        isSending = true
        defer { isSending = false }

        do {
            try await repository.offerHelp(
                campaignId: campaignId,
                needType: needType,
                message: message
            )
            notice = L10n.string(.helpOfferSent)
            return true
        } catch let error as ApiError {
            notice = error.userFacingMessage
            return false
        } catch {
            notice = L10n.string(.helpErrOfferFailed)
            return false
        }
    }
}

/// One humanitarian campaign.
///
/// **There is no contribute button, and that is deliberate.**
/// `POST /api/help/{id}/contribute` calls `rejectNativePayment()` and
/// refuses any request carrying `x-zrp-native-app` - which every request
/// from this app does - because taking money for a cause outside Apple's
/// purchase system is App Store rule 3.1.1. A button here could only ever
/// produce that refusal. Offering supplies, skills or time is a different
/// route, is not a payment, and is offered in full.
struct AidCampaignView: View {

    @EnvironmentObject private var navigator: Navigator
    @StateObject private var viewModel: AidCampaignViewModel
    @State private var offering: HelpNeedType?

    init(campaignId: String) {
        _viewModel = StateObject(
            wrappedValue: AidCampaignViewModel(campaignId: campaignId)
        )
    }

    var body: some View {
        Group {
            switch viewModel.phase {
            case .loading:
                TimelineStateView.loading()
            case .failed(let error):
                TimelineStateView.error(error) {
                    Task { await viewModel.load() }
                }
            case .loaded(let campaign):
                detail(campaign)
            }
        }
        .background(ZrpColor.background.ignoresSafeArea())
        .navigationTitle(Text(.navHelp))
        .navigationBarTitleDisplayMode(.inline)
        .task { await viewModel.load() }
        .sheet(item: $offering) { need in
            OfferHelpSheet(needType: need) { message in
                await viewModel.offer(needType: need, message: message)
            }
        }
        .alert(
            Text(.iosErrorGenericTitle),
            isPresented: Binding(
                get: { viewModel.notice != nil },
                set: { if !$0 { viewModel.notice = nil } }
            )
        ) {
            Button { viewModel.notice = nil } label: { Text(.actionCancel) }
        } message: {
            Text(verbatim: viewModel.notice ?? "")
        }
    }

    private func detail(_ campaign: HelpCampaign) -> some View {
        ScrollView {
            VStack(alignment: .leading, spacing: ZrpSpacing.lg) {
                if let images = campaign.imageUrls, !images.isEmpty {
                    MediaGalleryView(imageURLs: images, isVideo: false)
                }

                VStack(alignment: .leading, spacing: ZrpSpacing.md) {
                    HStack(spacing: ZrpSpacing.sm) {
                        if let key = campaign.category.titleKey {
                            Label {
                                Text(key)
                            } icon: {
                                Image(systemName: campaign.category.systemImage)
                            }
                            .font(.caption.weight(.semibold))
                            .foregroundStyle(ZrpColor.red)
                        }
                        if let location = campaign.location, !location.isEmpty {
                            Text(verbatim: location)
                                .font(.caption)
                                .foregroundStyle(ZrpColor.onSurfaceMuted)
                        }
                    }

                    Text(verbatim: campaign.title)
                        .font(.title3.weight(.bold))
                        .foregroundStyle(ZrpColor.onSurface)
                        .fixedSize(horizontal: false, vertical: true)

                    if let organizer = campaign.organizer {
                        Button {
                            navigator.push(.profile(username: organizer.username))
                        } label: {
                            HStack(spacing: ZrpSpacing.xs) {
                                AvatarView(
                                    url: organizer.avatarUrl,
                                    displayName: organizer.displayName,
                                    size: ZrpMetrics.avatarSmall
                                )
                                Text(verbatim: organizer.displayName)
                                    .font(.footnote.weight(.semibold))
                                    .foregroundStyle(ZrpColor.onSurface)
                                VerifiedBadge(badgeType: organizer.badgeType)
                            }
                        }
                        .buttonStyle(.plain)
                    }

                    AidProgress(campaign: campaign)
                    AidNeedBadges(needTypes: campaign.needTypes)

                    if let description = campaign.description, !description.isEmpty {
                        Text(verbatim: description)
                            .font(.body)
                            .foregroundStyle(ZrpColor.onSurface)
                            .fixedSize(horizontal: false, vertical: true)
                            .textSelection(.enabled)
                    }

                    offers(campaign)
                }
                .padding(.horizontal, ZrpSpacing.lg)
                .padding(.bottom, ZrpSpacing.xxl)
            }
            .frame(maxWidth: ZrpMetrics.contentMaxWidth)
            .frame(maxWidth: .infinity)
        }
    }

    /// One button per kind of help this campaign asks for that a native
    /// client can actually give. A campaign asking only for money gets
    /// none, and shows nothing rather than a control that cannot work.
    @ViewBuilder
    private func offers(_ campaign: HelpCampaign) -> some View {
        let needs = campaign.offerableNeeds
        if !needs.isEmpty {
            VStack(alignment: .leading, spacing: ZrpSpacing.sm) {
                Text(.helpOfferHelpTitle)
                    .font(.footnote.weight(.semibold))
                    .foregroundStyle(ZrpColor.onSurfaceMuted)

                ForEach(needs) { need in
                    if let key = need.titleKey {
                        Button {
                            offering = need
                        } label: {
                            Label {
                                Text(key)
                            } icon: {
                                Image(systemName: need.systemImage)
                            }
                            .font(.subheadline.weight(.semibold))
                            .foregroundStyle(.white)
                            .frame(maxWidth: .infinity)
                            .frame(minHeight: ZrpMetrics.minTouchTarget)
                            .background(ZrpColor.red)
                            .clipShape(RoundedRectangle(cornerRadius: ZrpRadius.md, style: .continuous))
                        }
                        .buttonStyle(.plain)
                    }
                }
            }
            .padding(.top, ZrpSpacing.md)
        }
    }
}

/// Writing an offer of help.
private struct OfferHelpSheet: View {

    let needType: HelpNeedType
    /// Returns whether it was sent, so the sheet closes only on success.
    let onSend: (String) async -> Bool

    @Environment(\.dismiss) private var dismiss
    @State private var message = ""
    @State private var isSending = false

    /// The route refuses an empty message and anything over 1000
    /// characters; this only avoids spending a request that can only fail.
    private var canSend: Bool {
        let trimmed = message.trimmingCharacters(in: .whitespacesAndNewlines)
        return !isSending && !trimmed.isEmpty && trimmed.count <= 1000
    }

    var body: some View {
        NavigationStack {
            VStack(alignment: .leading, spacing: ZrpSpacing.lg) {
                if let key = needType.titleKey {
                    Label {
                        Text(key)
                    } icon: {
                        Image(systemName: needType.systemImage)
                    }
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(ZrpColor.red)
                }

                TextField(
                    L10n.string(.helpOfferMessagePlaceholder),
                    text: $message,
                    axis: .vertical
                )
                .font(.body)
                .lineLimit(4...12)
                .padding(ZrpSpacing.md)
                .background(ZrpColor.surfaceElevated)
                .clipShape(RoundedRectangle(cornerRadius: ZrpRadius.md, style: .continuous))

                Spacer()
            }
            .padding(ZrpSpacing.lg)
            .background(ZrpColor.background.ignoresSafeArea())
            .navigationTitle(Text(.helpOfferHelpTitle))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button { dismiss() } label: { Text(.actionCancel) }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button {
                        isSending = true
                        Task {
                            let sent = await onSend(message)
                            isSending = false
                            if sent { dismiss() }
                        }
                    } label: {
                        Text(isSending ? L10nKey.helpSendingOffer : L10nKey.helpSendOffer)
                            .font(.subheadline.weight(.semibold))
                    }
                    .disabled(!canSend)
                }
            }
        }
        .presentationDetents([.medium])
    }
}
