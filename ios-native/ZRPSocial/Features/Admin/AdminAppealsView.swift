import SwiftUI

@MainActor
final class AdminAppealsViewModel: ObservableObject {

    enum Phase: Equatable {
        case loading
        case loaded
        case failed(ApiError)
    }

    @Published private(set) var appeals: [AdminAppeal] = []
    @Published private(set) var phase: Phase = .loading
    @Published private(set) var isLoadingMore = false
    @Published private(set) var isWorking = false
    @Published var errorMessage: String?

    @Published var statusFilter: AdminAppealStatusFilter = .pending {
        didSet {
            guard statusFilter != oldValue else { return }
            Task { await reload() }
        }
    }

    private let repository: AdminRepositoryProtocol
    private var page = 1
    private var totalPages = 1
    private var hasLoadedOnce = false

    init(repository: AdminRepositoryProtocol = AdminRepository()) {
        self.repository = repository
    }

    var hasMore: Bool { page < totalPages }

    func loadIfNeeded() async {
        guard !hasLoadedOnce else { return }
        hasLoadedOnce = true
        await reload()
    }

    func reload() async {
        if appeals.isEmpty { phase = .loading }
        await load(page: 1, replacing: true)
    }

    func loadMoreIfNeeded(currentAppeal: AdminAppeal) async {
        guard
            phase == .loaded,
            hasMore,
            !isLoadingMore,
            let index = appeals.firstIndex(where: { $0.id == currentAppeal.id }),
            index >= appeals.count - 5
        else { return }
        isLoadingMore = true
        await load(page: page + 1, replacing: false)
        isLoadingMore = false
    }

    private func load(page requestedPage: Int, replacing: Bool) async {
        do {
            let result = try await repository.appeals(status: statusFilter, page: requestedPage)
            if replacing {
                appeals = result.appeals
            } else {
                let existing = Set(appeals.map(\.id))
                appeals.append(contentsOf: result.appeals.filter { !existing.contains($0.id) })
            }
            page = result.page
            totalPages = result.totalPages
            phase = .loaded
        } catch ApiError.cancelled {
            return
        } catch {
            if appeals.isEmpty {
                phase = .failed(error as? ApiError ?? .transport(underlying: "\(error)"))
            } else {
                phase = .loaded
            }
        }
    }

    /// `PUT .../appeals/{id}` answers a flat row with no nested user/
    /// report include, so - same reasoning as reports - the caller
    /// reloads the current page rather than merging a mismatched shape.
    @discardableResult
    func resolve(_ appeal: AdminAppeal, decision: AdminAppealDecision, resolutionNote: String) async -> Bool {
        guard !isWorking else { return false }
        isWorking = true
        defer { isWorking = false }
        do {
            try await repository.resolveAppeal(id: appeal.id, decision: decision, resolutionNote: resolutionNote)
            await load(page: page, replacing: true)
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

/// Staff appeal review - the native answer to `/admin/appeals`.
struct AdminAppealsView: View {

    @StateObject private var viewModel = AdminAppealsViewModel()
    @State private var selectedAppeal: AdminAppeal?

    var body: some View {
        content
            .background(ZrpColor.background.ignoresSafeArea())
            .navigationTitle(Text(verbatim: "Appeals"))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Picker(selection: $viewModel.statusFilter) {
                        ForEach(AdminAppealStatusFilter.allCases) { status in
                            Text(verbatim: status.displayName).tag(status)
                        }
                    } label: {
                        Text(verbatim: viewModel.statusFilter.displayName)
                    }
                    .pickerStyle(.menu)
                }
            }
            .task { await viewModel.loadIfNeeded() }
            .sheet(item: $selectedAppeal) { appeal in
                AdminAppealResolveSheet(
                    appeal: appeal,
                    viewModel: viewModel,
                    onDismiss: { selectedAppeal = nil }
                )
            }
            .alert(
                Text(.iosErrorGenericTitle),
                isPresented: Binding(
                    get: { viewModel.errorMessage != nil },
                    set: { if !$0 { viewModel.errorMessage = nil } }
                )
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
            TimelineStateView.error(error) { Task { await viewModel.reload() } }
        case .loaded:
            if viewModel.appeals.isEmpty {
                AdminEmptyState(systemImage: "scalemass", title: "No appeals", subtitle: "Nothing matches this filter.")
            } else {
                list
            }
        }
    }

    private var list: some View {
        ScrollView {
            LazyVStack(spacing: 0) {
                ForEach(viewModel.appeals) { appeal in
                    row(appeal)
                        .task { await viewModel.loadMoreIfNeeded(currentAppeal: appeal) }
                }
                if viewModel.isLoadingMore {
                    ProgressView().tint(ZrpColor.onSurfaceMuted).padding(ZrpSpacing.lg)
                }
            }
        }
        .refreshable { await viewModel.reload() }
    }

    private func row(_ appeal: AdminAppeal) -> some View {
        Button {
            // Only a pending appeal is reachable through this row's tap:
            // an already-resolved one has nothing left to change, and the
            // sheet's only controls are the two resolve buttons.
            guard appeal.status == "pending" else { return }
            selectedAppeal = appeal
        } label: {
            VStack(alignment: .leading, spacing: ZrpSpacing.xs) {
                HStack(spacing: ZrpSpacing.sm) {
                    Text(verbatim: "@\(appeal.user.username)")
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(ZrpColor.onSurface)
                    Spacer(minLength: 0)
                    statusChip(appeal.status)
                }
                Text(verbatim: appeal.message)
                    .font(.footnote)
                    .foregroundStyle(ZrpColor.onSurface)
                    .lineLimit(3)
                Text(verbatim: "Appealing: \(appeal.report.reason)")
                    .font(.caption)
                    .foregroundStyle(ZrpColor.onSurfaceMuted)
                if let note = appeal.resolutionNote, !note.isEmpty {
                    Text(verbatim: "Resolution: \(note)")
                        .font(.caption)
                        .foregroundStyle(ZrpColor.onSurfaceMuted)
                }
                Text(verbatim: RelativeTime.compact(from: appeal.createdAt))
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

    private func statusChip(_ status: String) -> some View {
        let tint: Color = {
            switch status {
            case "pending": return ZrpColor.amber
            case "upheld": return ZrpColor.onSurfaceMuted
            case "overturned": return ZrpColor.green
            default: return ZrpColor.onSurfaceMuted
            }
        }()
        return Text(verbatim: status.capitalized)
            .font(.caption2.weight(.semibold))
            .foregroundStyle(tint)
            .padding(.horizontal, ZrpSpacing.sm)
            .padding(.vertical, 2)
            .background(tint.opacity(0.12), in: Capsule())
    }
}

/// Resolving one pending appeal: uphold the original action, or overturn
/// it.
///
/// A resolution note is **required** here even though the route itself
/// accepts an empty one - an appeal decision without any stated reason is
/// not a standard this screen sets for staff, even where the server does
/// not insist on it.
struct AdminAppealResolveSheet: View {

    let appeal: AdminAppeal
    @ObservedObject var viewModel: AdminAppealsViewModel
    let onDismiss: () -> Void

    @State private var decision: AdminAppealDecision = .upheld
    @State private var resolutionNote = ""

    private var canSubmit: Bool {
        !resolutionNote.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && !viewModel.isWorking
    }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    LabeledContent { Text(verbatim: "@\(appeal.user.username)") } label: { Text(verbatim: "Appealed by") }
                    Text(verbatim: appeal.message)
                        .font(.subheadline)
                        .foregroundStyle(ZrpColor.onSurface)
                } header: {
                    Text(verbatim: "Appeal")
                }

                Section {
                    LabeledContent { Text(verbatim: appeal.report.reason) } label: { Text(verbatim: "Report reason") }
                    if let actionType = appeal.report.actionType {
                        LabeledContent {
                            Text(verbatim: actionType.replacingOccurrences(of: "_", with: " ").capitalized)
                        } label: {
                            Text(verbatim: "Action taken")
                        }
                    }
                    if let note = appeal.report.actionNote, !note.isEmpty {
                        Text(verbatim: note)
                            .font(.footnote)
                            .foregroundStyle(ZrpColor.onSurfaceMuted)
                    }
                } header: {
                    Text(verbatim: "The action being appealed")
                } footer: {
                    // Only BAN_USER has a real, reversible database state
                    // to actually restore - see AdminRepository.resolveAppeal.
                    if appeal.report.actionType == "BAN_USER" {
                        Text(verbatim: "Overturning this unbans the user immediately, as part of this same decision.")
                    } else {
                        Text(verbatim: "This action has no automated undo. Overturning it records the decision but does not by itself restore deleted content or reverse a warning/mute.")
                    }
                }

                Section {
                    Picker(selection: $decision) {
                        ForEach(AdminAppealDecision.allCases) { option in
                            Text(verbatim: option.displayName).tag(option)
                        }
                    } label: {
                        Text(verbatim: "Decision")
                    }
                    .pickerStyle(.segmented)

                    TextField(
                        "Explain the decision",
                        text: $resolutionNote,
                        axis: .vertical
                    )
                    .lineLimit(3...6)
                } header: {
                    Text(verbatim: "Resolve")
                }

                Section {
                    Button {
                        Task {
                            if await viewModel.resolve(appeal, decision: decision, resolutionNote: resolutionNote) {
                                onDismiss()
                            }
                        }
                    } label: {
                        Text(verbatim: decision == .upheld ? "Uphold the original action" : "Overturn the original action")
                            .font(.subheadline.weight(.semibold))
                    }
                    .disabled(!canSubmit)
                }
            }
            .navigationTitle(Text(verbatim: "Resolve appeal"))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button { onDismiss() } label: { Text(.actionCancel) }
                }
            }
        }
    }
}
