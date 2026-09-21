import SwiftUI

@MainActor
final class AdminStorageCleanupViewModel: ObservableObject {

    enum Phase: Equatable {
        case loading
        case loaded
        case failed(ApiError)
    }

    @Published private(set) var scan: AdminStorageScanResult?
    @Published private(set) var lastCleanup: AdminStorageCleanupResult?
    @Published private(set) var phase: Phase = .loading
    @Published private(set) var isWorking = false
    @Published var errorMessage: String?

    private let repository: AdminRepositoryProtocol

    init(repository: AdminRepositoryProtocol = AdminRepository()) {
        self.repository = repository
    }

    func loadIfNeeded() async {
        guard scan == nil else { return }
        await rescan()
    }

    func rescan() async {
        if scan == nil { phase = .loading }
        do {
            scan = try await repository.scanStorage()
            phase = .loaded
        } catch {
            phase = .failed(error as? ApiError ?? .transport(underlying: "\(error)"))
        }
    }

    @discardableResult
    func cleanUp() async -> Bool {
        guard !isWorking else { return false }
        isWorking = true
        defer { isWorking = false }
        do {
            lastCleanup = try await repository.cleanUpStorage()
            await rescan()
            return true
        } catch let error as ApiError {
            errorMessage = error.userFacingMessage
            return false
        } catch {
            errorMessage = "Something went wrong. Please try again."
            return false
        }
    }
}

/// UploadThing orphan cleanup - the native answer to `/admin/storage`.
/// Admin-only; deletion is real and irreversible, so this always shows a
/// fresh scan before offering the delete button, and the confirmation
/// copy states plainly what is about to be permanently removed.
struct AdminStorageCleanupView: View {

    @StateObject private var viewModel = AdminStorageCleanupViewModel()
    @State private var confirmingCleanup = false

    var body: some View {
        content
            .background(ZrpColor.background.ignoresSafeArea())
            .navigationTitle(Text(verbatim: "Storage cleanup"))
            .navigationBarTitleDisplayMode(.inline)
            .task { await viewModel.loadIfNeeded() }
            .confirmationDialog(
                Text(verbatim: "Delete orphaned files?"),
                isPresented: $confirmingCleanup,
                titleVisibility: .visible
            ) {
                Button(role: .destructive) {
                    Task { await viewModel.cleanUp() }
                } label: {
                    Text(verbatim: "Delete permanently")
                }
                Button(role: .cancel) {} label: { Text(.actionCancel) }
            } message: {
                Text(verbatim: "This permanently deletes every file this scan found orphaned from storage. Files uploaded in the last 24 hours are never included, but this cannot be undone for what is deleted.")
            }
            .alert(
                Text(.iosErrorGenericTitle),
                isPresented: Binding(get: { viewModel.errorMessage != nil }, set: { if !$0 { viewModel.errorMessage = nil } })
            ) {
                Button { viewModel.errorMessage = nil } label: { Text(.actionCancel) }
            } message: {
                Text(verbatim: viewModel.errorMessage ?? "")
            }
    }

    @ViewBuilder
    private var content: some View {
        switch viewModel.phase {
        case .loading:
            TimelineStateView.loading()
        case .failed(let error):
            TimelineStateView.error(error) { Task { await viewModel.rescan() } }
        case .loaded:
            if let scan = viewModel.scan {
                ScrollView {
                    VStack(alignment: .leading, spacing: ZrpSpacing.lg) {
                        if let last = viewModel.lastCleanup {
                            VStack(alignment: .leading, spacing: 2) {
                                Text(verbatim: "Last cleanup")
                                    .font(.caption.weight(.semibold))
                                    .foregroundStyle(ZrpColor.onSurfaceMuted)
                                Text(verbatim: "Deleted \(CountFormatting.exact(last.deleted)) files (\(String(format: "%.1f", last.orphanedSizeMB)) MB)")
                                    .font(.subheadline)
                                    .foregroundStyle(ZrpColor.green)
                            }
                            .padding(ZrpSpacing.md)
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .background(ZrpColor.green.opacity(0.1), in: RoundedRectangle(cornerRadius: 12))
                        }

                        statRow("Files in storage", CountFormatting.exact(scan.totalFilesInUploadThing))
                        statRow("Referenced in database", CountFormatting.exact(scan.totalReferencedInDb))
                        statRow("Not yet fully uploaded", CountFormatting.exact(scan.nonUploadedStatusCount))
                        statRow("Held for review (< 24h old)", CountFormatting.exact(scan.heldForReviewCount))

                        VStack(alignment: .leading, spacing: 4) {
                            Text(verbatim: "Eligible for deletion")
                                .font(.caption.weight(.semibold))
                                .foregroundStyle(ZrpColor.onSurfaceMuted)
                            Text(verbatim: "\(CountFormatting.exact(scan.orphanedCount)) files \u{00B7} \(String(format: "%.1f", scan.orphanedSizeMB)) MB")
                                .font(.title3.weight(.bold))
                                .foregroundStyle(scan.orphanedCount > 0 ? ZrpColor.red : ZrpColor.onSurface)
                        }
                        .padding(ZrpSpacing.md)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .background(ZrpColor.surfaceElevated, in: RoundedRectangle(cornerRadius: 16))

                        if scan.orphanedCount > 0 {
                            Button(role: .destructive) {
                                confirmingCleanup = true
                            } label: {
                                Text(verbatim: "Delete \(CountFormatting.exact(scan.orphanedCount)) orphaned files")
                                    .font(.subheadline.weight(.semibold))
                                    .frame(maxWidth: .infinity)
                                    .padding(.vertical, ZrpSpacing.sm)
                            }
                            .buttonStyle(.borderedProminent)
                            .tint(ZrpColor.red)
                            .disabled(viewModel.isWorking)
                        }

                        Text(verbatim: "This is a dry-run scan until you choose to delete. Files uploaded in the last 24 hours are always held back, in case an upload is still mid-flow.")
                            .font(.caption)
                            .foregroundStyle(ZrpColor.onSurfaceMuted)
                    }
                    .padding(ZrpSpacing.lg)
                }
                .refreshable { await viewModel.rescan() }
            }
        }
    }

    private func statRow(_ label: String, _ value: String) -> some View {
        HStack {
            Text(verbatim: label)
                .font(.subheadline)
                .foregroundStyle(ZrpColor.onSurfaceMuted)
            Spacer(minLength: ZrpSpacing.sm)
            Text(verbatim: value)
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(ZrpColor.onSurface)
        }
    }
}
