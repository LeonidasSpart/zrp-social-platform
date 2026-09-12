import SwiftUI

@MainActor
final class CharityTransparencyViewModel: ObservableObject {

    enum Phase: Equatable {
        case loading
        case loaded(CharityTransparency)
        case failed(ApiError)
    }

    @Published private(set) var phase: Phase = .loading

    private let repository: TransparencyRepositoryProtocol

    init(repository: TransparencyRepositoryProtocol = TransparencyRepository()) {
        self.repository = repository
    }

    func load() async {
        if case .loaded = phase {} else { phase = .loading }
        do {
            phase = .loaded(try await repository.charity())
        } catch ApiError.cancelled {
            return
        } catch {
            phase = .failed(error as? ApiError ?? .transport(underlying: "\(error)"))
        }
    }
}

/// ZRP's public charity ledger.
///
/// Two figures that mean different things, kept apart on purpose. The
/// route separates them and explains why, and this screen preserves that
/// separation rather than adding them into one reassuring total:
///
/// - **Committed** is computed from completed tips and premium purchases.
///   It is what the commitment OWES so far, not money that has moved.
/// - **Disbursed** is the sum of real payments staff recorded, each with
///   a beneficiary and a date.
///
/// Collapsing the two would claim ZRP had paid out money it may only have
/// promised - on the one page whose entire purpose is being checkable.
struct CharityTransparencyView: View {

    @StateObject private var viewModel = CharityTransparencyViewModel()
    @Environment(\.openURL) private var openURL

    var body: some View {
        Group {
            switch viewModel.phase {
            case .loading:
                TimelineStateView.loading()
            case .failed(let error):
                TimelineStateView.error(error) { Task { await viewModel.load() } }
            case .loaded(let data):
                loaded(data)
            }
        }
        .background(ZrpColor.background.ignoresSafeArea())
        .navigationTitle(Text(.charityTransparencyHeading))
        .navigationBarTitleDisplayMode(.inline)
        .task { await viewModel.load() }
    }

    private func loaded(_ data: CharityTransparency) -> some View {
        ScrollView {
            VStack(alignment: .leading, spacing: ZrpSpacing.xl) {
                figure(
                    label: .charityCommittedLabel,
                    note: .charityCommittedNote,
                    amount: data.committed.amount,
                    currency: data.committed.currency,
                    tint: ZrpColor.amber
                )

                figure(
                    label: .charityDisbursedLabel,
                    note: .charityDisbursedNote,
                    amount: data.disbursed.total,
                    // The route reports no currency for the disbursed
                    // total - each record carries its own - so the
                    // committed figure's currency labels it. Every
                    // record in the ledger below states its own.
                    currency: data.committed.currency,
                    tint: ZrpColor.green
                )

                if !data.disbursed.byCause.isEmpty {
                    byCause(data.disbursed.byCause, currency: data.committed.currency)
                }

                ledger(data.disbursed.records, currency: data.committed.currency)
            }
            .padding(ZrpSpacing.lg)
            .frame(maxWidth: ZrpMetrics.contentMaxWidth, alignment: .leading)
            .frame(maxWidth: .infinity)
        }
        .refreshable { await viewModel.load() }
    }

    private func figure(
        label: L10nKey,
        note: L10nKey,
        amount: Double,
        currency: String,
        tint: Color
    ) -> some View {
        VStack(alignment: .leading, spacing: ZrpSpacing.xs) {
            Text(label)
                .font(.footnote)
                .foregroundStyle(ZrpColor.onSurfaceMuted)

            Text(verbatim: Self.money(amount, currency: currency))
                .font(.title.weight(.bold))
                .foregroundStyle(tint)
                .monospacedDigit()

            // The route explains what each figure is and is not. That
            // explanation is the substance of the page, not decoration,
            // so it is shown rather than truncated away.
            Text(note)
                .font(.caption)
                .foregroundStyle(ZrpColor.onSurfaceMuted)
                .fixedSize(horizontal: false, vertical: true)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(ZrpSpacing.md)
        .overlay(
            RoundedRectangle(cornerRadius: ZrpRadius.md, style: .continuous)
                .strokeBorder(ZrpColor.outline, lineWidth: 1)
        )
    }

    private func byCause(_ byCause: [String: Double], currency: String) -> some View {
        VStack(alignment: .leading, spacing: ZrpSpacing.sm) {
            // Sorted by the route's own cause order where recognised, so
            // the list does not reshuffle between loads the way a
            // dictionary's natural order would.
            ForEach(Self.orderedCauses(byCause), id: \.key) { entry in
                HStack {
                    if let key = Self.causeTitleKey(entry.key) {
                        Text(key)
                    } else {
                        Text(verbatim: entry.key)
                    }
                    Spacer(minLength: ZrpSpacing.md)
                    Text(verbatim: Self.money(entry.value, currency: currency))
                        .monospacedDigit()
                }
                .font(.subheadline)
                .foregroundStyle(ZrpColor.onSurface)
            }
        }
        .padding(ZrpSpacing.md)
        .frame(maxWidth: .infinity, alignment: .leading)
        .overlay(
            RoundedRectangle(cornerRadius: ZrpRadius.md, style: .continuous)
                .strokeBorder(ZrpColor.outline, lineWidth: 1)
        )
    }

    @ViewBuilder
    private func ledger(_ records: [Disbursement], currency: String) -> some View {
        VStack(alignment: .leading, spacing: ZrpSpacing.md) {
            Text(.charityLedgerHeading)
                .font(.headline)
                .foregroundStyle(ZrpColor.onSurface)

            if records.isEmpty {
                // The route's own wording: the ledger is real and simply
                // empty, which is a different statement from "failed to
                // load" and is worth making clearly.
                Text(.charityNoDisbursementsYet)
                    .font(.subheadline)
                    .foregroundStyle(ZrpColor.onSurfaceMuted)
                    .fixedSize(horizontal: false, vertical: true)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(.vertical, ZrpSpacing.lg)
            } else {
                ForEach(records) { record in
                    row(record)
                }
            }
        }
    }

    private func row(_ record: Disbursement) -> some View {
        VStack(alignment: .leading, spacing: ZrpSpacing.xs) {
            HStack(alignment: .firstTextBaseline) {
                Text(verbatim: record.beneficiaryName)
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(ZrpColor.onSurface)
                Spacer(minLength: ZrpSpacing.md)
                Text(verbatim: Self.money(record.amount, currency: record.currency))
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(ZrpColor.green)
                    .monospacedDigit()
            }

            HStack(spacing: ZrpSpacing.sm) {
                // An unrecognised cause shows its raw value rather than
                // being hidden. A disbursement is a financial record;
                // dropping one from a public ledger because this app
                // does not know its category would be worse than an
                // untranslated word.
                if let key = record.causeTitleKey {
                    Text(key)
                } else {
                    Text(verbatim: record.cause)
                }
                Text(verbatim: record.disbursedAt.formatted(date: .abbreviated, time: .omitted))
            }
            .font(.caption)
            .foregroundStyle(ZrpColor.onSurfaceMuted)

            if let note = record.note, !note.isEmpty {
                Text(verbatim: note)
                    .font(.caption)
                    .foregroundStyle(ZrpColor.onSurfaceMuted)
                    .fixedSize(horizontal: false, vertical: true)
            }

            // Only when there is real evidence to open.
            if let proof = record.proofUrl,
               !proof.isEmpty,
               let url = URL(string: proof),
               url.scheme != nil {
                Button { openURL(url) } label: {
                    Text(.charityViewProof)
                        .font(.caption.weight(.medium))
                }
                .buttonStyle(.plain)
                .foregroundStyle(ZrpColor.red)
            }
        }
        .padding(ZrpSpacing.md)
        .frame(maxWidth: .infinity, alignment: .leading)
        .overlay(
            RoundedRectangle(cornerRadius: ZrpRadius.md, style: .continuous)
                .strokeBorder(ZrpColor.outline, lineWidth: 1)
        )
    }

    // MARK: - Formatting

    /// Two decimal places, through the active locale's own number rules,
    /// with the route's currency code appended rather than a symbol -
    /// "USDC" has no symbol, and guessing "$" would misstate it.
    private static func money(_ amount: Double, currency: String) -> String {
        let formatter = NumberFormatter()
        formatter.numberStyle = .decimal
        formatter.minimumFractionDigits = 2
        formatter.maximumFractionDigits = 2
        formatter.locale = L10n.activeLocale
        let number = formatter.string(from: NSNumber(value: amount))
            ?? String(format: "%.2f", amount)
        return currency.isEmpty ? number : "\(number) \(currency)"
    }

    private static let causeOrder = ["orphanages", "schools", "hospitals", "climate"]

    private static func orderedCauses(
        _ byCause: [String: Double]
    ) -> [(key: String, value: Double)] {
        byCause.sorted { lhs, rhs in
            let l = causeOrder.firstIndex(of: lhs.key.lowercased()) ?? Int.max
            let r = causeOrder.firstIndex(of: rhs.key.lowercased()) ?? Int.max
            return l == r ? lhs.key < rhs.key : l < r
        }
    }

    private static func causeTitleKey(_ cause: String) -> L10nKey? {
        switch cause.lowercased() {
        case "orphanages": return .charityOrphanagesLabel
        case "schools": return .charitySchoolsLabel
        case "hospitals": return .charityHospitalsLabel
        case "climate": return .charityClimateProjectsLabel
        default: return nil
        }
    }
}
