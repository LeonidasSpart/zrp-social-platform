import SwiftUI

@MainActor
final class AdminCharityDisbursementsViewModel: ObservableObject {

    enum Phase: Equatable {
        case loading
        case loaded
        case failed(ApiError)
    }

    @Published private(set) var disbursements: [AdminCharityDisbursement] = []
    @Published private(set) var phase: Phase = .loading
    @Published private(set) var isWorking = false
    @Published var errorMessage: String?

    private let repository: AdminRepositoryProtocol

    init(repository: AdminRepositoryProtocol = AdminRepository()) {
        self.repository = repository
    }

    func loadIfNeeded() async {
        guard case .loading = phase, disbursements.isEmpty else { return }
        await load()
    }

    func load() async {
        if disbursements.isEmpty { phase = .loading }
        do {
            disbursements = try await repository.charityDisbursements()
            phase = .loaded
        } catch {
            phase = .failed(error as? ApiError ?? .transport(underlying: "\(error)"))
        }
    }

    @discardableResult
    func record(
        beneficiaryName: String,
        cause: AdminCharityCause,
        amount: Double,
        currency: String,
        disbursedAt: Date,
        note: String,
        proofUrl: String
    ) async -> Bool {
        guard !isWorking else { return false }
        isWorking = true
        defer { isWorking = false }
        do {
            try await repository.recordCharityDisbursement(
                beneficiaryName: beneficiaryName,
                cause: cause,
                amount: amount,
                currency: currency,
                disbursedAt: disbursedAt,
                note: note,
                proofUrl: proofUrl
            )
            await load()
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

/// Charity disbursement records - the native answer to a route that has
/// **no web UI at all** (`GET/POST /api/admin/charity-disbursements`).
/// Full-admin only: every record here becomes part of ZRP's public
/// charity ledger (`/transparency`, and `moderationTransparency`'s
/// sibling `charityTransparency` screen this app already has).
struct AdminCharityDisbursementsView: View {

    @StateObject private var viewModel = AdminCharityDisbursementsViewModel()
    @State private var isRecording = false

    var body: some View {
        content
            .background(ZrpColor.background.ignoresSafeArea())
            .navigationTitle(Text(verbatim: "Charity disbursements"))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button { isRecording = true } label: { Image(systemName: "plus") }
                        .accessibilityLabel(Text(verbatim: "Record a disbursement"))
                }
            }
            .task { await viewModel.loadIfNeeded() }
            .sheet(isPresented: $isRecording) {
                AdminRecordDisbursementSheet { name, cause, amount, currency, date, note, proof in
                    await viewModel.record(beneficiaryName: name, cause: cause, amount: amount, currency: currency, disbursedAt: date, note: note, proofUrl: proof)
                }
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
            TimelineStateView.error(error) { Task { await viewModel.load() } }
        case .loaded:
            if viewModel.disbursements.isEmpty {
                AdminEmptyState(systemImage: "heart.circle", title: "No disbursements recorded", subtitle: "Use + to record the first one.")
            } else {
                list
            }
        }
    }

    private var list: some View {
        ScrollView {
            LazyVStack(spacing: 0) {
                ForEach(viewModel.disbursements) { record in
                    row(record)
                }
            }
        }
        .refreshable { await viewModel.load() }
    }

    private func row(_ record: AdminCharityDisbursement) -> some View {
        VStack(alignment: .leading, spacing: ZrpSpacing.xs) {
            HStack(spacing: ZrpSpacing.sm) {
                Text(verbatim: record.beneficiaryName)
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(ZrpColor.onSurface)
                Spacer(minLength: 0)
                Text(verbatim: "\(record.currency) \(CountFormatting.exact(Int(record.amount)))")
                    .font(.subheadline.weight(.bold))
                    .foregroundStyle(ZrpColor.green)
            }
            Text(verbatim: record.cause.capitalized)
                .font(.caption)
                .foregroundStyle(ZrpColor.onSurfaceMuted)
            if let note = record.note, !note.isEmpty {
                Text(verbatim: note)
                    .font(.footnote)
                    .foregroundStyle(ZrpColor.onSurfaceMuted)
            }
            HStack(spacing: ZrpSpacing.xs) {
                Text(verbatim: RelativeTime.compact(from: record.disbursedAt))
                if let by = record.recordedByUsername {
                    Text(verbatim: "\u{00B7} recorded by @\(by)")
                }
            }
            .font(.caption2)
            .foregroundStyle(ZrpColor.onSurfaceMuted)
        }
        .padding(ZrpSpacing.lg)
        .frame(maxWidth: .infinity, alignment: .leading)
        .overlay(alignment: .bottom) {
            Rectangle().fill(ZrpColor.outlineFaint).frame(height: 0.5)
        }
    }
}

struct AdminRecordDisbursementSheet: View {

    let onRecord: (String, AdminCharityCause, Double, String, Date, String, String) async -> Bool

    @Environment(\.dismiss) private var dismiss
    @State private var beneficiaryName = ""
    @State private var cause: AdminCharityCause = .orphanages
    @State private var amountText = ""
    @State private var currency = "USD"
    @State private var disbursedAt = Date()
    @State private var note = ""
    @State private var proofUrl = ""
    @State private var isSaving = false

    private var amount: Double? { Double(amountText) }
    private var canSave: Bool {
        !beneficiaryName.trimmingCharacters(in: .whitespaces).isEmpty && (amount ?? 0) > 0 && !isSaving
    }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextField(text: $beneficiaryName, prompt: Text(verbatim: "Beneficiary name"), label: { Text(verbatim: "Beneficiary") })
                    Picker(selection: $cause) {
                        ForEach(AdminCharityCause.allCases) { cause in
                            Text(verbatim: cause.displayName).tag(cause)
                        }
                    } label: {
                        Text(verbatim: "Cause")
                    }
                    TextField(text: $amountText, prompt: Text(verbatim: "0.00"), label: { Text(verbatim: "Amount") })
                        .keyboardType(.decimalPad)
                    TextField(text: $currency, prompt: Text(verbatim: "USD"), label: { Text(verbatim: "Currency") })
                        .autocorrectionDisabled()
                        .textInputAutocapitalization(.characters)
                    DatePicker(selection: $disbursedAt, in: ...Date(), displayedComponents: .date) {
                        Text(verbatim: "Disbursed on")
                    }
                } header: {
                    Text(verbatim: "Disbursement")
                } footer: {
                    Text(verbatim: "This becomes part of ZRP's public charity ledger immediately.")
                }

                Section {
                    TextField("Note (optional)", text: $note, axis: .vertical)
                        .lineLimit(2...5)
                    TextField(text: $proofUrl, prompt: Text(verbatim: "https://\u{2026}"), label: { Text(verbatim: "Proof URL (optional)") })
                        .keyboardType(.URL)
                        .autocorrectionDisabled()
                        .textInputAutocapitalization(.never)
                }
            }
            .navigationTitle(Text(verbatim: "Record disbursement"))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button { dismiss() } label: { Text(.actionCancel) }
                }
                ToolbarItem(placement: .topBarTrailing) {
                    Button {
                        commit()
                    } label: {
                        Text(verbatim: isSaving ? "Saving\u{2026}" : "Save")
                    }
                    .disabled(!canSave)
                }
            }
        }
    }

    private func commit() {
        guard let amount, !isSaving else { return }
        isSaving = true
        Task {
            defer { isSaving = false }
            if await onRecord(beneficiaryName, cause, amount, currency, disbursedAt, note, proofUrl) {
                dismiss()
            }
        }
    }
}
