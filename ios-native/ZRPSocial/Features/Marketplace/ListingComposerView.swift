import PhotosUI
import SwiftUI

/// Create or edit a listing.
///
/// One screen for both, because `POST /api/listings` and
/// `PUT /api/listings/{id}` accept the same fields and enforce the same
/// rules. Two things the route decides, which this screen states rather
/// than hides:
///
/// - a new listing is created `PENDING_REVIEW`; it is not live yet
/// - a substantive edit to a live listing sends it back for review
struct ListingComposerView: View {

    /// `nil` creates; an id loads that listing and updates it.
    let listingId: String?

    @EnvironmentObject private var navigator: Navigator

    @State private var category: ListingCategory?
    @State private var title = ""
    @State private var description = ""
    @State private var price = ""
    @State private var currency = "USD"
    @State private var priceOnRequest = false
    @State private var location = ""
    @State private var imageUrls: [String] = []
    @State private var videoUrl: String?

    @State private var photoSelections: [PhotosPickerItem] = []
    @State private var uploadingCount = 0
    @State private var isSaving = false
    @State private var error: String?
    @State private var loadState: LoadState = .ready

    private let repository = ListingsRepository()
    private let uploader = UploadThingClient()

    private enum LoadState: Equatable {
        case loading
        case ready
        case failed(ApiError)
    }

    private var isEditing: Bool { listingId != nil }

    private var canSave: Bool {
        !isSaving
            && uploadingCount == 0
            && category != nil
            && !title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
            && !description.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
            && !imageUrls.isEmpty
            && (priceOnRequest || (Double(price) ?? 0) > 0)
    }

    var body: some View {
        Group {
            switch loadState {
            case .loading:
                TimelineStateView.loading()
            case .failed(let apiError):
                TimelineStateView.error(apiError) { Task { await loadExisting() } }
            case .ready:
                form
            }
        }
        .background(ZrpColor.background.ignoresSafeArea())
        .navigationTitle(Text(isEditing ? L10nKey.marketplaceEditListing : L10nKey.marketplaceCreateListing))
        .navigationBarTitleDisplayMode(.inline)
        .task {
            if isEditing { await loadExisting() }
        }
        .onChange(of: photoSelections) { _, items in
            guard !items.isEmpty else { return }
            uploadPhotos(items)
        }
    }

    private var form: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: ZrpSpacing.lg) {
                Text(isEditing ? L10nKey.marketplaceEditListingNote : L10nKey.marketplaceCreateListingNote)
                    .font(.footnote)
                    .foregroundStyle(ZrpColor.onSurfaceMuted)
                    .fixedSize(horizontal: false, vertical: true)

                Picker(selection: $category) {
                    Text(.marketplaceSelectCategory).tag(ListingCategory?.none)
                    ForEach(ListingCategory.allCases) { option in
                        Text(option.titleKey).tag(ListingCategory?.some(option))
                    }
                } label: {
                    Text(.marketplaceCategory)
                }
                .pickerStyle(.menu)
                .tint(ZrpColor.onSurface)

                field(.marketplaceListingTitle, text: $title)

                TextField(
                    text: $description,
                    prompt: Text(.marketplaceDescription),
                    axis: .vertical,
                    label: { Text(.marketplaceDescription) }
                )
                .labelsHidden()
                .lineLimit(4...10)
                .padding(ZrpSpacing.md)
                .background(ZrpColor.surfaceElevated)
                .clipShape(RoundedRectangle(cornerRadius: ZrpRadius.md))

                Toggle(isOn: $priceOnRequest) {
                    Text(.marketplacePriceOnRequestLabel)
                        .font(.subheadline)
                        .foregroundStyle(ZrpColor.onSurface)
                }
                .tint(ZrpColor.red)

                if !priceOnRequest {
                    HStack(spacing: ZrpSpacing.sm) {
                        TextField(
                            text: $price,
                            prompt: Text(.marketplacePrice),
                            label: { Text(.marketplacePrice) }
                        )
                        .labelsHidden()
                        .keyboardType(.decimalPad)
                        .padding(ZrpSpacing.md)
                        .background(ZrpColor.surfaceElevated)
                        .clipShape(RoundedRectangle(cornerRadius: ZrpRadius.md))

                        TextField(
                            text: $currency,
                            prompt: Text(.marketplaceCurrency),
                            label: { Text(.marketplaceCurrency) }
                        )
                        .labelsHidden()
                        .textInputAutocapitalization(.characters)
                        .autocorrectionDisabled()
                        .frame(width: 90)
                        .padding(ZrpSpacing.md)
                        .background(ZrpColor.surfaceElevated)
                        .clipShape(RoundedRectangle(cornerRadius: ZrpRadius.md))
                    }
                }

                field(.marketplaceLocation, text: $location)

                photosSection

                if let error {
                    Text(verbatim: error)
                        .font(.footnote)
                        .foregroundStyle(ZrpColor.red)
                        .fixedSize(horizontal: false, vertical: true)
                }

                // Said before submitting, not after: a seller should know
                // the listing will not be live immediately.
                Text(.marketplaceModerationNote)
                    .font(.caption)
                    .foregroundStyle(ZrpColor.onSurfaceMuted)
                    .fixedSize(horizontal: false, vertical: true)

                Button { save() } label: {
                    Text(saveLabel)
                        .font(.subheadline.weight(.bold))
                        .frame(maxWidth: .infinity)
                        .frame(minHeight: ZrpMetrics.minTouchTarget)
                        .background(canSave ? ZrpColor.red : ZrpColor.surfaceHighest)
                        .foregroundStyle(canSave ? .white : ZrpColor.onSurfaceMuted)
                        .clipShape(RoundedRectangle(cornerRadius: ZrpRadius.md))
                }
                .buttonStyle(.plain)
                .disabled(!canSave)
            }
            .padding(ZrpSpacing.lg)
            .frame(maxWidth: ZrpMetrics.contentMaxWidth, alignment: .leading)
            .frame(maxWidth: .infinity)
        }
    }

    private var saveLabel: L10nKey {
        if isSaving { return .marketplaceSubmitting }
        return isEditing ? .marketplaceSaveChanges : .marketplaceSubmitListing
    }

    private func field(_ key: L10nKey, text: Binding<String>) -> some View {
        TextField(text: text, prompt: Text(key), label: { Text(key) })
            .labelsHidden()
            .padding(ZrpSpacing.md)
            .background(ZrpColor.surfaceElevated)
            .clipShape(RoundedRectangle(cornerRadius: ZrpRadius.md))
    }

    private var photosSection: some View {
        VStack(alignment: .leading, spacing: ZrpSpacing.sm) {
            HStack {
                Text(.marketplacePhotos)
                    .font(.footnote.weight(.semibold))
                    .foregroundStyle(ZrpColor.onSurfaceMuted)
                Spacer(minLength: 0)
                if uploadingCount > 0 {
                    ProgressView().tint(ZrpColor.red)
                }
            }

            if !imageUrls.isEmpty {
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: ZrpSpacing.sm) {
                        ForEach(Array(imageUrls.enumerated()), id: \.offset) { index, url in
                            ZStack(alignment: .topTrailing) {
                                ListingImageView(url: url, height: 96)
                                    .frame(width: 120)
                                    .clipShape(RoundedRectangle(cornerRadius: ZrpRadius.sm))
                                Button {
                                    imageUrls.remove(at: index)
                                } label: {
                                    Image(systemName: "xmark.circle.fill")
                                        .foregroundStyle(.white, .black.opacity(0.6))
                                        .padding(4)
                                }
                                .buttonStyle(.plain)
                                .accessibilityLabel(Text(.marketplaceDelete))
                            }
                        }
                    }
                }
            }

            // The route requires at least one photo and caps at 30; the
            // seller's plan caps it lower still, which only the server
            // knows - so its message is what gets shown if it refuses.
            PhotosPicker(
                selection: $photoSelections,
                maxSelectionCount: 10,
                matching: .images
            ) {
                Label { Text(.marketplacePhotos) } icon: { Image(systemName: "photo.badge.plus") }
                    .font(.subheadline.weight(.medium))
                    .frame(maxWidth: .infinity)
                    .frame(minHeight: ZrpMetrics.minTouchTarget)
                    .background(ZrpColor.surfaceElevated)
                    .foregroundStyle(ZrpColor.onSurface)
                    .clipShape(RoundedRectangle(cornerRadius: ZrpRadius.md))
            }
            .disabled(uploadingCount > 0)
        }
    }

    // MARK: - Loading an existing listing

    private func loadExisting() async {
        guard let listingId else { return }
        loadState = .loading
        do {
            let listing = try await repository.listing(id: listingId)
            category = listing.category
            title = listing.title
            description = listing.description ?? ""
            price = listing.price.map { String(format: "%.0f", $0) } ?? ""
            currency = listing.currency
            priceOnRequest = listing.priceOnRequest
            location = listing.location ?? ""
            imageUrls = listing.imageUrls
            videoUrl = listing.videoUrl
            loadState = .ready
        } catch {
            loadState = .failed(error as? ApiError ?? .transport(underlying: "\(error)"))
        }
    }

    // MARK: - Photos

    private func uploadPhotos(_ items: [PhotosPickerItem]) {
        photoSelections = []
        Task {
            uploadingCount += items.count
            defer { uploadingCount = max(0, uploadingCount - items.count) }

            var candidates: [UploadCandidate] = []
            var picked: [PickedMedia] = []
            for item in items {
                guard let media = try? await item.loadTransferable(type: PickedMedia.self) else { continue }
                picked.append(media)
                candidates.append(media.asUploadCandidate())
            }
            defer { picked.forEach { $0.discard() } }

            guard !candidates.isEmpty else {
                error = L10n.string(.marketplaceErrPhotoRequired)
                return
            }

            do {
                // One presign for the whole selection, as the website's
                // own uploader does: the router's middleware then applies
                // the plan's images-per-listing cap to the real set.
                let uploaded = try await uploader.upload(candidates, to: .listingMedia) { _ in }
                imageUrls.append(contentsOf: uploaded.map(\.url))
                error = nil
            } catch UploadThingClient.UploadError.presignFailed(let message) {
                // The middleware's message is the plan limit's own
                // wording, which is what the seller needs to read.
                error = message ?? L10n.string(.marketplaceErrCreateFailed)
            } catch {
                self.error = L10n.string(.marketplaceErrCreateFailed)
            }
        }
    }

    // MARK: - Saving

    private func save() {
        guard let category else {
            error = L10n.string(.marketplaceErrCategoryRequired)
            return
        }
        guard !imageUrls.isEmpty else {
            error = L10n.string(.marketplaceErrPhotoRequired)
            return
        }

        let trimmedCurrency = currency.trimmingCharacters(in: .whitespacesAndNewlines).uppercased()
        let request = ListingWriteRequest(
            category: category.rawValue,
            title: title.trimmingCharacters(in: .whitespacesAndNewlines),
            description: description.trimmingCharacters(in: .whitespacesAndNewlines),
            price: priceOnRequest ? nil : Double(price),
            // The route only accepts a 3-letter code and otherwise falls
            // back to USD; sending a malformed one silently would change
            // the price's meaning, so it is normalised here too.
            currency: trimmedCurrency.count == 3 ? trimmedCurrency : "USD",
            priceOnRequest: priceOnRequest,
            location: location.trimmingCharacters(in: .whitespacesAndNewlines).nilIfEmpty,
            imageUrls: imageUrls,
            videoUrl: videoUrl
        )

        Task {
            isSaving = true
            defer { isSaving = false }
            do {
                if let listingId {
                    _ = try await repository.update(id: listingId, request)
                } else {
                    _ = try await repository.create(request)
                }
                navigator.pop()
            } catch {
                // The listings routes return specific, useful reasons -
                // a plan's active-listing cap, a too-long title - which
                // beat a generic failure line.
                self.error = (error as? ApiError)?.serverMessage
                    ?? L10n.string(isEditing ? .marketplaceErrUpdateFailed : .marketplaceErrCreateFailed)
            }
        }
    }
}
