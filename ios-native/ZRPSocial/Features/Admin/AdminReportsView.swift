import SwiftUI

@MainActor
final class AdminReportsViewModel: ObservableObject {

    enum Phase: Equatable {
        case loading
        case loaded
        case failed(ApiError)
    }

    @Published private(set) var reports: [AdminReport] = []
    @Published private(set) var phase: Phase = .loading
    @Published private(set) var isLoadingMore = false
    @Published private(set) var isWorking = false
    @Published var errorMessage: String?

    @Published var statusFilter: AdminReportStatusFilter = .pending {
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
        if reports.isEmpty { phase = .loading }
        await load(page: 1, replacing: true)
    }

    func loadMoreIfNeeded(currentReport: AdminReport) async {
        guard
            phase == .loaded,
            hasMore,
            !isLoadingMore,
            let index = reports.firstIndex(where: { $0.id == currentReport.id }),
            index >= reports.count - 5
        else { return }
        isLoadingMore = true
        await load(page: page + 1, replacing: false)
        isLoadingMore = false
    }

    private func load(page requestedPage: Int, replacing: Bool) async {
        do {
            let result = try await repository.reports(status: statusFilter, page: requestedPage)
            if replacing {
                reports = result.reports
            } else {
                let existing = Set(reports.map(\.id))
                reports.append(contentsOf: result.reports.filter { !existing.contains($0.id) })
            }
            page = result.page
            totalPages = result.totalPages
            phase = .loaded
        } catch ApiError.cancelled {
            return
        } catch {
            if reports.isEmpty {
                phase = .failed(error as? ApiError ?? .transport(underlying: "\(error)"))
            } else {
                phase = .loaded
            }
        }
    }

    // MARK: - Mutations

    /// Reloads the current page afterward - `PUT .../reports/{id}` answers
    /// a **flat** row with none of the nested reporter/target includes
    /// this screen displays, so there is nothing useful to merge in
    /// locally (see `AdminRepository`'s own doc comment).
    private func mutate(_ work: @escaping () async throws -> Void) async -> Bool {
        guard !isWorking else { return false }
        isWorking = true
        defer { isWorking = false }
        do {
            try await work()
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

    @discardableResult
    func setStatus(
        _ report: AdminReport,
        to status: AdminReportStatusFilter,
        actionType: AdminReportActionType? = nil,
        actionNote: String? = nil
    ) async -> Bool {
        await mutate { [repository] in
            try await repository.setReportStatus(
                id: report.id,
                status: status,
                actionType: actionType,
                actionNote: actionNote
            )
        }
    }

    /// The route refuses this for a `pending` report, or one with an
    /// appeal on file, with its own 409 message - shown as-is via
    /// `errorMessage` rather than pre-guessed here.
    @discardableResult
    func delete(_ report: AdminReport) async -> Bool {
        await mutate { [repository] in
            try await repository.deleteReport(id: report.id)
        }
    }
}

/// Staff report review - the native answer to `/admin/reports`.
///
/// Every polymorphic target (post/comment/listing/challenge/opportunity/
/// campaign/bare-profile) is handled - see `AdminReportTarget` - because
/// `Report` really can point at any of the seven.
struct AdminReportsView: View {

    @StateObject private var viewModel = AdminReportsViewModel()
    @State private var selectedReport: AdminReport?
    @State private var confirmingDeleteId: String?

    var body: some View {
        content
            .background(ZrpColor.background.ignoresSafeArea())
            .navigationTitle(Text(verbatim: "Reports"))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Picker(selection: $viewModel.statusFilter) {
                        ForEach(AdminReportStatusFilter.allCases) { status in
                            Text(verbatim: status.displayName).tag(status)
                        }
                    } label: {
                        Text(verbatim: viewModel.statusFilter.displayName)
                    }
                    .pickerStyle(.menu)
                }
            }
            .task { await viewModel.loadIfNeeded() }
            .sheet(item: $selectedReport) { report in
                AdminReportActionSheet(
                    report: report,
                    viewModel: viewModel,
                    onDismiss: { selectedReport = nil }
                )
            }
            .confirmationDialog(
                Text(verbatim: "Delete this report?"),
                isPresented: Binding(
                    get: { confirmingDeleteId != nil },
                    set: { if !$0 { confirmingDeleteId = nil } }
                ),
                titleVisibility: .visible
            ) {
                Button(role: .destructive) {
                    if let id = confirmingDeleteId, let report = viewModel.reports.first(where: { $0.id == id }) {
                        confirmingDeleteId = nil
                        Task { await viewModel.delete(report) }
                    }
                } label: {
                    Text(verbatim: "Delete")
                }
                Button(role: .cancel) { confirmingDeleteId = nil } label: { Text(.actionCancel) }
            } message: {
                Text(verbatim: "This permanently removes the report record. It cannot be undone.")
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
            if viewModel.reports.isEmpty {
                AdminEmptyState(systemImage: "flag", title: "No reports", subtitle: "Nothing matches this filter.")
            } else {
                list
            }
        }
    }

    private var list: some View {
        ScrollView {
            LazyVStack(spacing: 0) {
                ForEach(viewModel.reports) { report in
                    row(report)
                        .task { await viewModel.loadMoreIfNeeded(currentReport: report) }
                }
                if viewModel.isLoadingMore {
                    ProgressView().tint(ZrpColor.onSurfaceMuted).padding(ZrpSpacing.lg)
                }
            }
        }
        .refreshable { await viewModel.reload() }
    }

    private func row(_ report: AdminReport) -> some View {
        Button {
            selectedReport = report
        } label: {
            VStack(alignment: .leading, spacing: ZrpSpacing.xs) {
                HStack(spacing: ZrpSpacing.sm) {
                    Text(verbatim: report.reason)
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(ZrpColor.onSurface)
                        .lineLimit(1)
                    Spacer(minLength: 0)
                    statusChip(report.status)
                }
                Text(verbatim: targetSummary(report.target))
                    .font(.footnote)
                    .foregroundStyle(ZrpColor.onSurfaceMuted)
                    .lineLimit(2)
                HStack(spacing: ZrpSpacing.xs) {
                    Text(verbatim: "Reported by @\(report.reporter.username)")
                    Text(verbatim: "\u{00B7}")
                    Text(verbatim: RelativeTime.compact(from: report.createdAt))
                }
                .font(.caption)
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
        .contextMenu {
            if report.status != "pending" {
                Button(role: .destructive) {
                    confirmingDeleteId = report.id
                } label: {
                    Label { Text(verbatim: "Delete report") } icon: { Image(systemName: "trash") }
                }
            }
        }
    }

    private func statusChip(_ status: String) -> some View {
        let tint: Color = {
            switch status {
            case "pending": return ZrpColor.amber
            case "reviewed": return ZrpColor.blue
            case "actioned": return ZrpColor.red
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

/// What a report's polymorphic target reads as in one line, shared by the
/// list row and the detail sheet.
func targetSummary(_ target: AdminReportTarget) -> String {
    switch target {
    case .post(let post): return "Post by @\(post.author.username): \(post.content)"
    case .comment(let comment): return "Comment by @\(comment.author.username): \(comment.content)"
    case .listing(let listing): return "Listing by @\(listing.seller.username): \(listing.title)"
    case .challenge(let challenge):
        let by = challenge.creator.map { "@\($0.username)" } ?? "unknown"
        return "PLAY challenge by \(by): \(challenge.title)"
    case .opportunity(let opportunity): return "Opportunity by @\(opportunity.poster.username): \(opportunity.title)"
    case .campaign(let campaign): return "HELP campaign by @\(campaign.organizer.username): \(campaign.title)"
    case .user(let user): return "Profile report: @\(user.username)"
    case .none: return "Target no longer available"
    }
}

/// Reviewing and actioning one report.
///
/// **`actionType` is a label only.** Selecting "Ban user" here records
/// that choice on the report; it does not ban anyone. Carrying out a
/// chosen action is a separate trip to Users (ban/delete) or Posts
/// (delete) - exactly how the web admin console works, and this screen
/// does not pretend otherwise.
struct AdminReportActionSheet: View {

    let report: AdminReport
    @ObservedObject var viewModel: AdminReportsViewModel
    let onDismiss: () -> Void

    @State private var actionType: AdminReportActionType = .other
    @State private var actionNote = ""

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    LabeledContent { Text(verbatim: report.reason) } label: { Text(verbatim: "Reason") }
                    if let details = report.details, !details.isEmpty {
                        Text(verbatim: details)
                            .font(.subheadline)
                            .foregroundStyle(ZrpColor.onSurface)
                    }
                    LabeledContent { Text(verbatim: "@\(report.reporter.username)") } label: { Text(verbatim: "Reported by") }
                    LabeledContent { Text(verbatim: RelativeTime.compact(from: report.createdAt)) } label: { Text(verbatim: "Filed") }
                } header: {
                    Text(verbatim: "Report")
                }

                Section {
                    Text(verbatim: targetSummary(report.target))
                        .font(.subheadline)
                        .foregroundStyle(ZrpColor.onSurface)
                } header: {
                    Text(verbatim: "Target")
                }

                if report.status != "pending" {
                    Section {
                        LabeledContent { Text(verbatim: report.status.capitalized) } label: { Text(verbatim: "Status") }
                        if let actionType = report.actionType {
                            LabeledContent { Text(verbatim: actionType.replacingOccurrences(of: "_", with: " ").capitalized) } label: { Text(verbatim: "Action") }
                        }
                        if let note = report.actionNote, !note.isEmpty {
                            Text(verbatim: note)
                                .font(.subheadline)
                                .foregroundStyle(ZrpColor.onSurfaceMuted)
                        }
                    } header: {
                        Text(verbatim: "Already resolved")
                    }
                }

                if report.status == "pending" {
                    Section {
                        Button {
                            Task {
                                if await viewModel.setStatus(report, to: .dismissed) { onDismiss() }
                            }
                        } label: {
                            Text(verbatim: "Dismiss")
                        }
                        Button {
                            Task {
                                if await viewModel.setStatus(report, to: .reviewed) { onDismiss() }
                            }
                        } label: {
                            Text(verbatim: "Mark reviewed")
                        }
                    } header: {
                        Text(verbatim: "Quick actions")
                    }

                    Section {
                        Picker(selection: $actionType) {
                            ForEach(AdminReportActionType.allCases) { type in
                                Text(verbatim: type.displayName).tag(type)
                            }
                        } label: {
                            Text(verbatim: "Action taken")
                        }
                        TextField(
                            "Note (optional)",
                            text: $actionNote,
                            axis: .vertical
                        )
                        .lineLimit(3...6)

                        Button {
                            Task {
                                if await viewModel.setStatus(
                                    report,
                                    to: .actioned,
                                    actionType: actionType,
                                    actionNote: actionNote
                                ) { onDismiss() }
                            }
                        } label: {
                            Text(verbatim: "Record action")
                                .font(.subheadline.weight(.semibold))
                        }
                        .disabled(viewModel.isWorking)
                    } header: {
                        Text(verbatim: "Record an action")
                    } footer: {
                        Text(verbatim: "This only records what was done - it does not itself delete a post, ban a user, or take any other automated step.")
                    }
                }
            }
            .navigationTitle(Text(verbatim: "Report"))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button { onDismiss() } label: { Text(.actionCancel) }
                }
            }
        }
    }
}
