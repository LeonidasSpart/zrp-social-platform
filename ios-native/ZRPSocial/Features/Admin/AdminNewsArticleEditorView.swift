import SwiftUI

@MainActor
final class AdminNewsArticleEditorViewModel: ObservableObject {

    @Published private(set) var isSaving = false
    @Published var errorMessage: String?

    private let repository: AdminRepositoryProtocol

    init(repository: AdminRepositoryProtocol = AdminRepository()) {
        self.repository = repository
    }

    func save(existingId: String?, draft: AdminNewsArticleDraft) async -> AdminNewsArticle? {
        guard !isSaving else { return nil }
        isSaving = true
        defer { isSaving = false }
        do {
            if let existingId {
                return try await repository.updateNewsArticle(id: existingId, draft)
            } else {
                return try await repository.createNewsArticle(draft)
            }
        } catch let error as ApiError {
            errorMessage = error.userFacingMessage
            return nil
        } catch {
            errorMessage = "Something went wrong. Please try again."
            return nil
        }
    }
}

/// Create or edit a news article. Approving/rejecting a journalist's
/// PENDING_REVIEW submission is just setting `status` here and saving -
/// same as web, this is not a separate action, and the two quick buttons
/// below are a shortcut for exactly that, not a different code path.
struct AdminNewsArticleEditorView: View {

    let existing: AdminNewsArticle?
    let defaultAuthorId: String
    let onSaved: (AdminNewsArticle) -> Void

    @Environment(\.dismiss) private var dismiss
    @StateObject private var viewModel = AdminNewsArticleEditorViewModel()
    @State private var draft: AdminNewsArticleDraft

    init(existing: AdminNewsArticle?, defaultAuthorId: String, onSaved: @escaping (AdminNewsArticle) -> Void) {
        self.existing = existing
        self.defaultAuthorId = defaultAuthorId
        self.onSaved = onSaved
        if let existing {
            _draft = State(initialValue: AdminNewsArticleDraft(
                title: existing.title,
                slug: existing.slug,
                excerpt: existing.excerpt ?? "",
                content: existing.content,
                coverImage: existing.coverImage ?? "",
                sourceName: existing.sourceName ?? "",
                sourceUrl: existing.sourceUrl ?? "",
                category: AdminNewsCategory(rawValue: existing.category) ?? .world,
                status: AdminNewsStatus(rawValue: existing.status) ?? .draft,
                authorId: existing.author.id,
                featured: existing.featured,
                reviewNote: existing.reviewNote ?? ""
            ))
        } else {
            _draft = State(initialValue: AdminNewsArticleDraft(authorId: defaultAuthorId))
        }
    }

    private var canSave: Bool {
        !draft.title.trimmingCharacters(in: .whitespaces).isEmpty
            && !draft.slug.trimmingCharacters(in: .whitespaces).isEmpty
            && !draft.content.trimmingCharacters(in: .whitespaces).isEmpty
            && !draft.authorId.trimmingCharacters(in: .whitespaces).isEmpty
            && !viewModel.isSaving
    }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextField(text: $draft.title, prompt: Text(verbatim: "Title"), label: { Text(verbatim: "Title") })
                        .onChange(of: draft.title) { _, newValue in
                            if existing == nil { draft.slug = Self.slugify(newValue) }
                        }
                    TextField(text: $draft.slug, prompt: Text(verbatim: "url-slug"), label: { Text(verbatim: "Slug") })
                        .autocorrectionDisabled()
                        .textInputAutocapitalization(.never)
                    TextField("Excerpt (optional)", text: $draft.excerpt, axis: .vertical)
                        .lineLimit(2...4)
                } header: {
                    Text(verbatim: "Headline")
                }

                Section {
                    TextField("Body", text: $draft.content, axis: .vertical)
                        .lineLimit(8...20)
                } header: {
                    Text(verbatim: "Content")
                }

                Section {
                    Picker(selection: $draft.category) {
                        ForEach(AdminNewsCategory.allCases) { category in
                            Text(verbatim: category.displayName).tag(category)
                        }
                    } label: {
                        Text(verbatim: "Category")
                    }
                    Picker(selection: $draft.status) {
                        ForEach(AdminNewsStatus.allCases) { status in
                            Text(verbatim: status.displayName).tag(status)
                        }
                    } label: {
                        Text(verbatim: "Status")
                    }
                    Toggle(isOn: $draft.featured) {
                        Text(verbatim: "Featured")
                    }
                } header: {
                    Text(verbatim: "Publishing")
                } footer: {
                    if draft.featured {
                        Text(verbatim: "Only one article is ever featured - saving this removes featured from whichever article currently has it.")
                    }
                }

                if existing?.status == "PENDING_REVIEW" {
                    Section {
                        Button {
                            draft.status = .published
                            commit()
                        } label: {
                            Text(verbatim: "Approve and publish")
                        }
                        Button(role: .destructive) {
                            draft.status = .rejected
                            commit()
                        } label: {
                            Text(verbatim: "Reject")
                        }
                    } header: {
                        Text(verbatim: "Journalist submission")
                    } footer: {
                        Text(verbatim: "Uses the review note below as feedback to the journalist, especially on rejection.")
                    }
                }

                Section {
                    TextField("Review note (shown to the journalist)", text: $draft.reviewNote, axis: .vertical)
                        .lineLimit(2...5)
                }

                Section {
                    TextField(text: $draft.coverImage, prompt: Text(verbatim: "https://\u{2026}"), label: { Text(verbatim: "Cover image URL") })
                        .keyboardType(.URL)
                        .autocorrectionDisabled()
                        .textInputAutocapitalization(.never)
                    TextField(text: $draft.sourceName, prompt: Text(verbatim: "Source name"), label: { Text(verbatim: "Source name") })
                    TextField(text: $draft.sourceUrl, prompt: Text(verbatim: "https://\u{2026}"), label: { Text(verbatim: "Source URL") })
                        .keyboardType(.URL)
                        .autocorrectionDisabled()
                        .textInputAutocapitalization(.never)
                } header: {
                    Text(verbatim: "Source")
                }

                Section {
                    TextField(text: $draft.authorId, prompt: Text(verbatim: "user id"), label: { Text(verbatim: "Author (user ID)") })
                        .autocorrectionDisabled()
                        .textInputAutocapitalization(.never)
                        .font(.footnote.monospaced())
                } footer: {
                    // No author-search picker in this pass - see PARITY.md.
                    Text(verbatim: "Defaults to your own account. Must be an existing ZRP user's id, not a username.")
                }
            }
            .navigationTitle(Text(verbatim: existing == nil ? "New article" : "Edit article"))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button { dismiss() } label: { Text(.actionCancel) }
                }
                ToolbarItem(placement: .topBarTrailing) {
                    Button {
                        commit()
                    } label: {
                        Text(verbatim: viewModel.isSaving ? "Saving\u{2026}" : "Save")
                    }
                    .disabled(!canSave)
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
    }

    private func commit() {
        Task {
            if let saved = await viewModel.save(existingId: existing?.id, draft: draft) {
                onSaved(saved)
                dismiss()
            }
        }
    }

    private static func slugify(_ title: String) -> String {
        let lowered = title.lowercased()
        let allowed = CharacterSet(charactersIn: "abcdefghijklmnopqrstuvwxyz0123456789 -")
        let filtered = String(lowered.unicodeScalars.filter { allowed.contains($0) })
        return filtered
            .split(separator: " ")
            .joined(separator: "-")
    }
}
