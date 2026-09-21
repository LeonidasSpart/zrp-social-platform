import SwiftUI

@MainActor
final class AdminNewsNetworkViewModel: ObservableObject {

    enum Phase: Equatable {
        case loading
        case loaded
        case failed(ApiError)
    }

    @Published private(set) var status: AdminNewsNetworkStatus?
    @Published private(set) var phase: Phase = .loading
    @Published private(set) var isWorking = false
    @Published var errorMessage: String?
    @Published var lastRunMessage: String?

    private let repository: AdminRepositoryProtocol

    init(repository: AdminRepositoryProtocol = AdminRepository()) {
        self.repository = repository
    }

    func loadIfNeeded() async {
        guard status == nil else { return }
        await load()
    }

    func load() async {
        if status == nil { phase = .loading }
        do {
            status = try await repository.newsNetworkStatus()
            phase = .loaded
        } catch {
            phase = .failed(error as? ApiError ?? .transport(underlying: "\(error)"))
        }
    }

    @discardableResult
    func setPaused(_ paused: Bool) async -> Bool {
        guard !isWorking else { return false }
        isWorking = true
        defer { isWorking = false }
        do {
            try await repository.setNewsNetworkPaused(paused)
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

    @discardableResult
    func runNow() async -> Bool {
        guard !isWorking else { return false }
        isWorking = true
        defer { isWorking = false }
        do {
            let result = try await repository.runNewsNetworkCycle()
            if result.result.ran {
                lastRunMessage = "Cycle ran: published \(result.result.published ?? 0), scheduled \(result.result.scheduled ?? 0)."
            } else {
                lastRunMessage = "Cycle did not run: \(result.result.reason ?? "no reason given")."
            }
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

/// ZRP News Network automation - the native answer to
/// `/admin/news-network`'s overview. Staff can view status; pausing and
/// running a cycle are **admin-only**, matching the route split
/// (`GET status` is `requireStaff`, `PATCH settings` and `POST run` are
/// `requireAdmin`) - a moderator sees this screen read-only.
///
/// **Deliberately narrower than web**: this is the overview/control
/// panel (status, pause/resume, manual run) only. The Feeds, Sources,
/// editorial Stories queue and Publications tabs the web page also has
/// are **not built** in this pass - see PARITY.md. This is the largest
/// remaining admin section and the overview is what a phone-side
/// "is it healthy, and can I stop it" check actually needs.
struct AdminNewsNetworkView: View {

    @StateObject private var viewModel = AdminNewsNetworkViewModel()
    @State private var confirmingPauseToggle = false
    @State private var confirmingRun = false

    var body: some View {
        content
            .background(ZrpColor.background.ignoresSafeArea())
            .navigationTitle(Text(verbatim: "News Network"))
            .navigationBarTitleDisplayMode(.inline)
            .task { await viewModel.loadIfNeeded() }
            .confirmationDialog(
                Text(verbatim: viewModel.status?.status.paused == true ? "Resume automation?" : "Pause automation?"),
                isPresented: $confirmingPauseToggle,
                titleVisibility: .visible
            ) {
                Button(role: viewModel.status?.status.paused == true ? nil : .destructive) {
                    Task { await viewModel.setPaused(!(viewModel.status?.status.paused ?? false)) }
                } label: {
                    Text(verbatim: viewModel.status?.status.paused == true ? "Resume" : "Pause")
                }
                Button(role: .cancel) {} label: { Text(.actionCancel) }
            } message: {
                Text(verbatim: "This is the platform-wide kill switch. It takes effect on the very next cycle.")
            }
            .confirmationDialog(
                Text(verbatim: "Run an editorial cycle now?"),
                isPresented: $confirmingRun,
                titleVisibility: .visible
            ) {
                Button(role: .destructive) {
                    Task { await viewModel.runNow() }
                } label: {
                    Text(verbatim: "Run now")
                }
                Button(role: .cancel) {} label: { Text(.actionCancel) }
            } message: {
                Text(verbatim: "Runs one editorial cycle immediately, outside the schedule - this can publish real posts. Rate-limited to a few per hour.")
            }
            .alert(
                Text(verbatim: "Cycle result"),
                isPresented: Binding(get: { viewModel.lastRunMessage != nil }, set: { if !$0 { viewModel.lastRunMessage = nil } })
            ) {
                Button { viewModel.lastRunMessage = nil } label: { Text(verbatim: "OK") }
            } message: {
                Text(verbatim: viewModel.lastRunMessage ?? "")
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
            if let status = viewModel.status {
                ScrollView {
                    VStack(alignment: .leading, spacing: ZrpSpacing.xl) {
                        pauseCard(status)
                        statGrid(status)
                        sourceHealthSection(status)

                        Text(verbatim: "Feeds, Sources, the editorial Stories queue and Publications management aren't built in this app yet - see the web console for those.")
                            .font(.caption)
                            .foregroundStyle(ZrpColor.onSurfaceMuted)
                    }
                    .padding(ZrpSpacing.lg)
                }
                .refreshable { await viewModel.load() }
            }
        }
    }

    private func pauseCard(_ status: AdminNewsNetworkStatus) -> some View {
        VStack(alignment: .leading, spacing: ZrpSpacing.md) {
            HStack {
                VStack(alignment: .leading, spacing: 2) {
                    Text(verbatim: status.status.paused ? "Paused" : "Running")
                        .font(.headline)
                        .foregroundStyle(status.status.paused ? ZrpColor.amber : ZrpColor.green)
                    if let next = status.status.nextCycleAt, !status.status.paused {
                        Text(verbatim: "Next cycle: \(RelativeTime.compact(from: next))")
                            .font(.caption)
                            .foregroundStyle(ZrpColor.onSurfaceMuted)
                    }
                }
                Spacer(minLength: 0)
                Button {
                    confirmingPauseToggle = true
                } label: {
                    Text(verbatim: status.status.paused ? "Resume" : "Pause")
                        .font(.subheadline.weight(.semibold))
                        .padding(.horizontal, ZrpSpacing.lg)
                        .padding(.vertical, ZrpSpacing.sm)
                        .background(status.status.paused ? ZrpColor.green : ZrpColor.red, in: Capsule())
                        .foregroundStyle(.white)
                }
                .disabled(viewModel.isWorking)
            }
            Button {
                confirmingRun = true
            } label: {
                Text(verbatim: "Run a cycle now")
                    .font(.caption.weight(.semibold))
            }
            .disabled(viewModel.isWorking)
        }
        .padding(ZrpSpacing.lg)
        .background(ZrpColor.surfaceElevated, in: RoundedRectangle(cornerRadius: 16))
    }

    private func statGrid(_ status: AdminNewsNetworkStatus) -> some View {
        let cards: [(String, Int)] = [
            ("Feeds enabled", status.feeds.enabled),
            ("Feeds total", status.feeds.total),
            ("Published today", status.publications.today),
            ("Scheduled", status.publications.scheduled),
            ("Failed publications", status.publications.failed),
            ("Ready stories", status.stories.ready),
            ("Pending sensitive review", status.stories.pendingSensitiveReview),
            ("Duplicates prevented today", status.duplicatesPreventedToday),
        ]
        return LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: ZrpSpacing.md) {
            ForEach(cards, id: \.0) { label, value in
                VStack(alignment: .leading, spacing: 2) {
                    Text(verbatim: CountFormatting.exact(value))
                        .font(.title3.weight(.bold))
                        .foregroundStyle(value > 0 && label.contains("Failed") ? ZrpColor.red : ZrpColor.onSurface)
                    Text(verbatim: label)
                        .font(.caption)
                        .foregroundStyle(ZrpColor.onSurfaceMuted)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(ZrpSpacing.md)
                .background(ZrpColor.surfaceElevated, in: RoundedRectangle(cornerRadius: 16))
            }
        }
    }

    private func sourceHealthSection(_ status: AdminNewsNetworkStatus) -> some View {
        VStack(alignment: .leading, spacing: ZrpSpacing.sm) {
            Text(verbatim: "Source health")
                .font(.footnote.weight(.semibold))
                .foregroundStyle(ZrpColor.onSurfaceMuted)
                .textCase(.uppercase)
            HStack(spacing: ZrpSpacing.md) {
                healthPill("Healthy", status.sourceHealth.healthy, ZrpColor.green)
                healthPill("Warning", status.sourceHealth.warning, ZrpColor.amber)
                healthPill("Failed", status.sourceHealth.failed, ZrpColor.red)
                healthPill("Disabled", status.sourceHealth.disabled, ZrpColor.onSurfaceMuted)
            }
        }
    }

    private func healthPill(_ label: String, _ value: Int, _ tint: Color) -> some View {
        VStack(spacing: 0) {
            Text(verbatim: CountFormatting.exact(value))
                .font(.subheadline.weight(.bold))
                .foregroundStyle(tint)
            Text(verbatim: label)
                .font(.caption2)
                .foregroundStyle(ZrpColor.onSurfaceMuted)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, ZrpSpacing.sm)
        .background(ZrpColor.surfaceHighest, in: RoundedRectangle(cornerRadius: 12))
    }
}
