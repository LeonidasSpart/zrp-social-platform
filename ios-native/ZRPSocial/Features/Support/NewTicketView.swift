import SwiftUI

@MainActor
final class NewTicketViewModel: ObservableObject {

    @Published var subject = ""
    @Published var message = ""
    @Published var category: SupportCategory = .general
    @Published private(set) var isSubmitting = false
    @Published var errorMessage: String?

    private let repository: SupportRepositoryProtocol

    init(repository: SupportRepositoryProtocol = SupportRepository()) {
        self.repository = repository
    }

    /// The route refuses a blank subject or message with a 400; this only
    /// avoids spending a request that can only fail.
    var canSubmit: Bool {
        !isSubmitting
            && !subject.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
            && !message.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }

    func submit() async -> SupportTicket? {
        guard canSubmit else { return nil }
        isSubmitting = true
        defer { isSubmitting = false }

        do {
            return try await repository.createTicket(
                subject: subject,
                category: category,
                message: message
            )
        } catch let error as ApiError {
            errorMessage = error.userFacingMessage
            return nil
        } catch {
            errorMessage = L10n.string(.supportErrCreateFailed)
            return nil
        }
    }
}

/// Opening a support ticket.
///
/// Priority is deliberately not a field: the route sets it from the
/// opener's plan, and a client that chose its own would be asking for a
/// queue position it has no right to.
struct NewTicketView: View {

    @Environment(\.dismiss) private var dismiss
    @StateObject private var viewModel = NewTicketViewModel()

    /// Called with the created ticket so the list can show it without a
    /// refetch.
    let onCreated: (SupportTicket) -> Void

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextField(
                        L10n.string(.supportSubjectPlaceholder),
                        text: $viewModel.subject
                    )
                } header: {
                    Text(.supportSubjectLabel)
                }

                Section {
                    Picker(selection: $viewModel.category) {
                        ForEach(SupportCategory.selectable) { category in
                            if let key = category.titleKey {
                                Text(key).tag(category)
                            }
                        }
                    } label: {
                        Text(.supportCategoryLabel)
                    }
                }

                Section {
                    TextField(
                        L10n.string(.supportMessagePlaceholder),
                        text: $viewModel.message,
                        axis: .vertical
                    )
                    .lineLimit(5...12)
                } header: {
                    Text(.supportMessageLabel)
                } footer: {
                    Text(.supportPageSubtitle)
                }
            }
            .scrollContentBackground(.hidden)
            .background(ZrpColor.background.ignoresSafeArea())
            .navigationTitle(Text(.supportPageTitle))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button { dismiss() } label: { Text(.actionCancel) }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button {
                        Task {
                            if let created = await viewModel.submit() {
                                onCreated(created)
                                dismiss()
                            }
                        }
                    } label: {
                        Text(viewModel.isSubmitting
                            ? L10nKey.supportSubmitting
                            : L10nKey.supportSubmitTicket)
                            .font(.subheadline.weight(.semibold))
                    }
                    .disabled(!viewModel.canSubmit)
                }
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
    }
}
