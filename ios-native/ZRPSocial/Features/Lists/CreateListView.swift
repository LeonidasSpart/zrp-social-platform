import SwiftUI

@MainActor
final class CreateListViewModel: ObservableObject {
    @Published var name = ""
    @Published var description = ""
    @Published var isPrivate = false
    @Published private(set) var isSubmitting = false
    @Published var errorMessage: String?

    private let repository: ListsRepositoryProtocol

    init(repository: ListsRepositoryProtocol = ListsRepository()) {
        self.repository = repository
    }

    var canSubmit: Bool {
        !name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && !isSubmitting
    }

    func submit() async -> UserListSummary? {
        guard canSubmit else { return nil }
        isSubmitting = true
        defer { isSubmitting = false }

        let trimmedDescription = description.trimmingCharacters(in: .whitespacesAndNewlines)
        do {
            return try await repository.createList(
                CreateUserListRequest(
                    name: name.trimmingCharacters(in: .whitespacesAndNewlines),
                    description: trimmedDescription.isEmpty ? nil : trimmedDescription,
                    isPrivate: isPrivate
                )
            )
        } catch let error as ApiError {
            errorMessage = error.userFacingMessage
            return nil
        } catch {
            errorMessage = L10n.string(.listsErrorCreate)
            return nil
        }
    }
}

struct CreateListView: View {

    @StateObject private var viewModel = CreateListViewModel()
    @Environment(\.dismiss) private var dismiss
    let onCreated: (UserListSummary) -> Void

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextField(L10n.string(.listsCreateNamePlaceholder), text: $viewModel.name)
                } header: {
                    Text(.listsCreateNameLabel)
                }

                Section {
                    TextField(
                        L10n.string(.listsCreateDescriptionPlaceholder),
                        text: $viewModel.description,
                        axis: .vertical
                    )
                    .lineLimit(2...5)
                } header: {
                    Text(.listsCreateDescriptionLabel)
                }

                Section {
                    Toggle(isOn: $viewModel.isPrivate) {
                        Text(.listsCreatePrivateLabel)
                    }
                }

                if let errorMessage = viewModel.errorMessage {
                    Section {
                        Text(verbatim: errorMessage).foregroundStyle(.red)
                    }
                }
            }
            .navigationTitle(Text(.listsCreateTitle))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button(action: { dismiss() }) { Text(.listsCreateCancel) }
                }
                ToolbarItem(placement: .confirmationAction) {
                    if viewModel.isSubmitting {
                        ProgressView()
                    } else {
                        Button(action: {
                            Task {
                                if let list = await viewModel.submit() {
                                    onCreated(list)
                                }
                            }
                        }) {
                            Text(.listsCreateSubmit)
                        }
                        .disabled(!viewModel.canSubmit)
                    }
                }
            }
        }
    }
}
