import SwiftUI

@MainActor
final class CreateCommunityViewModel: ObservableObject {
    @Published var name = ""
    @Published var description = ""
    @Published var category: CommunityCategory = .general
    @Published var hashtag = ""
    @Published private(set) var isSubmitting = false
    @Published var errorMessage: String?

    private let repository: CommunitiesRepositoryProtocol

    init(repository: CommunitiesRepositoryProtocol = CommunitiesRepository()) {
        self.repository = repository
    }

    var canSubmit: Bool {
        name.trimmingCharacters(in: .whitespacesAndNewlines).count >= 3
            && description.trimmingCharacters(in: .whitespacesAndNewlines).count >= 10
            && !hashtag.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
            && !isSubmitting
    }

    func submit() async -> Community? {
        guard canSubmit else { return nil }
        isSubmitting = true
        defer { isSubmitting = false }

        do {
            return try await repository.createCommunity(
                CreateCommunityRequest(
                    name: name.trimmingCharacters(in: .whitespacesAndNewlines),
                    description: description.trimmingCharacters(in: .whitespacesAndNewlines),
                    category: category.rawValue,
                    hashtag: hashtag.trimmingCharacters(in: .whitespacesAndNewlines)
                )
            )
        } catch let error as ApiError {
            errorMessage = error.userFacingMessage
            return nil
        } catch {
            errorMessage = L10n.string(.communitiesErrorCreate)
            return nil
        }
    }
}

struct CreateCommunityView: View {

    @StateObject private var viewModel = CreateCommunityViewModel()
    @Environment(\.dismiss) private var dismiss
    let onCreated: (Community) -> Void

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextField(L10n.string(.communitiesCreateNamePlaceholder), text: $viewModel.name)
                } header: {
                    Text(.communitiesCreateNameLabel)
                }

                Section {
                    TextField(
                        L10n.string(.communitiesCreateDescriptionPlaceholder),
                        text: $viewModel.description,
                        axis: .vertical
                    )
                    .lineLimit(3...6)
                } header: {
                    Text(.communitiesCreateDescriptionLabel)
                }

                Section {
                    Picker(L10n.string(.communitiesCreateCategoryLabel), selection: $viewModel.category) {
                        ForEach(CommunityCategory.allCases, id: \.self) { category in
                            Text(L10n.string(category.titleKey)).tag(category)
                        }
                    }
                } header: {
                    Text(.communitiesCreateCategoryLabel)
                }

                Section {
                    HStack {
                        Text(verbatim: "#")
                            .foregroundStyle(ZrpColor.onSurfaceMuted)
                        TextField(L10n.string(.communitiesCreateHashtagPlaceholder), text: $viewModel.hashtag)
                            .textInputAutocapitalization(.never)
                            .autocorrectionDisabled()
                            .onChange(of: viewModel.hashtag) { _, newValue in
                                viewModel.hashtag = newValue
                                    .lowercased()
                                    .filter { $0.isLetter || $0.isNumber || $0 == "_" }
                            }
                    }
                } header: {
                    Text(.communitiesCreateHashtagLabel)
                } footer: {
                    Text(.communitiesCreateHashtagHint)
                }

                if let errorMessage = viewModel.errorMessage {
                    Section {
                        Text(verbatim: errorMessage)
                            .foregroundStyle(.red)
                    }
                }
            }
            .navigationTitle(Text(.communitiesCreateTitle))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button(action: { dismiss() }) { Text(.communitiesCreateCancel) }
                }
                ToolbarItem(placement: .confirmationAction) {
                    if viewModel.isSubmitting {
                        ProgressView()
                    } else {
                        Button(action: {
                            Task {
                                if let community = await viewModel.submit() {
                                    onCreated(community)
                                }
                            }
                        }) {
                            Text(.communitiesCreateSubmit)
                        }
                        .disabled(!viewModel.canSubmit)
                    }
                }
            }
        }
    }
}
