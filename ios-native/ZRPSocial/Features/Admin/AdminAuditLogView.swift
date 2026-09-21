import SwiftUI

@MainActor
final class AdminAuditLogViewModel: ObservableObject {

    enum Phase: Equatable {
        case loading
        case loaded
        case failed(ApiError)
    }

    @Published private(set) var entries: [AdminAuditLogEntry] = []
    @Published private(set) var phase: Phase = .loading
    @Published private(set) var isLoadingMore = false

    @Published var actionFilter = "" {
        didSet {
            guard actionFilter != oldValue else { return }
            scheduleReload()
        }
    }
    @Published var targetTypeFilter = "" {
        didSet {
            guard targetTypeFilter != oldValue else { return }
            scheduleReload()
        }
    }

    private let repository: AdminRepositoryProtocol
    private var cursor: String?
    private var hasLoadedOnce = false
    private var filterTask: Task<Void, Never>?

    private func scheduleReload() {
        filterTask?.cancel()
        filterTask = Task { [weak self] in
            try? await Task.sleep(nanoseconds: 350_000_000)
            guard !Task.isCancelled, let self else { return }
            await self.reload()
        }
    }

    init(repository: AdminRepositoryProtocol = AdminRepository()) {
        self.repository = repository
    }

    var hasMore: Bool { cursor != nil }

    func loadIfNeeded() async {
        guard !hasLoadedOnce else { return }
        hasLoadedOnce = true
        await reload()
    }

    func reload() async {
        if entries.isEmpty { phase = .loading }
        await load(replacing: true)
    }

    func loadMoreIfNeeded(currentEntry: AdminAuditLogEntry) async {
        guard
            phase == .loaded,
            hasMore,
            !isLoadingMore,
            let index = entries.firstIndex(where: { $0.id == currentEntry.id }),
            index >= entries.count - 8
        else { return }
        isLoadingMore = true
        await load(replacing: false)
        isLoadingMore = false
    }

    private func load(replacing: Bool) async {
        do {
            let result = try await repository.auditLog(
                action: actionFilter.trimmingCharacters(in: .whitespacesAndNewlines),
                targetType: targetTypeFilter.trimmingCharacters(in: .whitespacesAndNewlines),
                targetId: "",
                cursor: replacing ? nil : cursor
            )
            if replacing {
                entries = result.entries
            } else {
                let existing = Set(entries.map(\.id))
                entries.append(contentsOf: result.entries.filter { !existing.contains($0.id) })
            }
            cursor = result.nextCursor
            phase = .loaded
        } catch ApiError.cancelled {
            return
        } catch {
            if entries.isEmpty {
                phase = .failed(error as? ApiError ?? .transport(underlying: "\(error)"))
            } else {
                phase = .loaded
            }
        }
    }
}

/// The staff audit log - the native answer to a route that has **no web
/// UI at all** (`GET /api/admin/audit-log`); this is the second UI for
/// it, after Android's. Admin-only, cursor-paginated.
struct AdminAuditLogView: View {

    @StateObject private var viewModel = AdminAuditLogViewModel()
    @State private var selectedEntry: AdminAuditLogEntry?

    var body: some View {
        content
            .background(ZrpColor.background.ignoresSafeArea())
            .navigationTitle(Text(verbatim: "Audit log"))
            .navigationBarTitleDisplayMode(.inline)
            .searchable(text: $viewModel.actionFilter, prompt: Text(verbatim: "Filter by action, e.g. user.ban"))
            .task { await viewModel.loadIfNeeded() }
            .sheet(item: $selectedEntry) { entry in
                AdminAuditLogEntryDetail(entry: entry) { selectedEntry = nil }
            }
    }

    @ViewBuilder
    private var content: some View {
        switch viewModel.phase {
        case .loading:
            TimelineStateView.loading()
        case .failed(let error):
            TimelineStateView.error(error) { Task { await viewModel.reload() } }
        case .loaded:
            if viewModel.entries.isEmpty {
                AdminEmptyState(systemImage: "clock.arrow.circlepath", title: "No entries", subtitle: "Nothing matches this filter.")
            } else {
                list
            }
        }
    }

    private var list: some View {
        ScrollView {
            LazyVStack(spacing: 0) {
                ForEach(viewModel.entries) { entry in
                    row(entry)
                        .task { await viewModel.loadMoreIfNeeded(currentEntry: entry) }
                }
                if viewModel.isLoadingMore {
                    ProgressView().tint(ZrpColor.onSurfaceMuted).padding(ZrpSpacing.lg)
                }
            }
        }
        .refreshable { await viewModel.reload() }
    }

    private func row(_ entry: AdminAuditLogEntry) -> some View {
        Button {
            selectedEntry = entry
        } label: {
            VStack(alignment: .leading, spacing: ZrpSpacing.xs) {
                Text(verbatim: entry.action)
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(ZrpColor.onSurface)
                HStack(spacing: ZrpSpacing.xs) {
                    if let actor = entry.actorUsername {
                        Text(verbatim: "@\(actor)")
                    }
                    if let targetType = entry.targetType {
                        Text(verbatim: "\u{2192} \(targetType)\(entry.targetId.map { " (\($0.prefix(8))\u{2026})" } ?? "")")
                    }
                }
                .font(.caption)
                .foregroundStyle(ZrpColor.onSurfaceMuted)
                Text(verbatim: RelativeTime.compact(from: entry.createdAt))
                    .font(.caption2)
                    .foregroundStyle(ZrpColor.onSurfaceMuted)
            }
            .padding(ZrpSpacing.lg)
            .frame(maxWidth: .infinity, alignment: .leading)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .overlay(alignment: .bottom) {
            Rectangle().fill(ZrpColor.outlineFaint).frame(height: 0.5)
        }
    }
}

struct AdminAuditLogEntryDetail: View {

    let entry: AdminAuditLogEntry
    let onDismiss: () -> Void

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    LabeledContent { Text(verbatim: entry.action) } label: { Text(verbatim: "Action") }
                    if let actor = entry.actorUsername {
                        LabeledContent { Text(verbatim: "@\(actor)") } label: { Text(verbatim: "Actor") }
                    }
                    if let targetType = entry.targetType {
                        LabeledContent { Text(verbatim: targetType) } label: { Text(verbatim: "Target type") }
                    }
                    if let targetId = entry.targetId {
                        LabeledContent { Text(verbatim: targetId).font(.caption.monospaced()) } label: { Text(verbatim: "Target ID") }
                    }
                    LabeledContent { Text(verbatim: RelativeTime.compact(from: entry.createdAt)) } label: { Text(verbatim: "When") }
                }

                if let metadata = entry.metadata, !metadata.isEmpty {
                    Section {
                        ForEach(metadata.keys.sorted(), id: \.self) { key in
                            LabeledContent {
                                Text(verbatim: metadata[key]?.displayString ?? "")
                                    .font(.footnote)
                            } label: {
                                Text(verbatim: key)
                            }
                        }
                    } header: {
                        Text(verbatim: "Details")
                    }
                }
            }
            .navigationTitle(Text(verbatim: "Audit entry"))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button { onDismiss() } label: { Text(.actionCancel) }
                }
            }
        }
    }
}
