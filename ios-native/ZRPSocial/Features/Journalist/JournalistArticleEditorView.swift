import PhotosUI
import SwiftUI

@MainActor
final class JournalistArticleEditorViewModel: ObservableObject {

    @Published var title = ""
    @Published var slug = ""
    @Published var excerpt = ""
    @Published var content = ""
    @Published var coverImage: String?
    @Published var sourceName = ""
    @Published var sourceUrl = ""
    @Published var category: NewsCategory = .world

    @Published private(set) var isLoading: Bool
    @Published private(set) var isSaving = false
    @Published private(set) var isUploadingCover = false
    @Published private(set) var status: ArticleStatus = .draft
    @Published private(set) var reviewNote: String?
    @Published var errorMessage: String?

    /// nil for a new article.
    let articleId: String?

    /// VERIFIED-only, decided by the dashboard and passed in rather than
    /// re-fetched. Submitting is refused server-side with a 403
    /// regardless; this only decides whether to offer the button.
    let canSubmitForReview: Bool

    private let repository: JournalistRepositoryProtocol
    private let uploads: UploadThingClient

    /// True once the slug has been typed by hand. Until then it follows
    /// the title, which is what a person expects and what stops a
    /// mismatched slug going unnoticed.
    private var slugIsManual = false

    init(
        articleId: String?,
        canSubmitForReview: Bool,
        repository: JournalistRepositoryProtocol = JournalistRepository(),
        uploads: UploadThingClient = UploadThingClient()
    ) {
        self.articleId = articleId
        self.canSubmitForReview = canSubmitForReview
        self.repository = repository
        self.uploads = uploads
        self.isLoading = articleId != nil
    }

    var isNew: Bool { articleId == nil }

    /// PATCH refuses anything that is not a draft or a rejected article
    /// with a 409, so the whole form goes read-only rather than letting
    /// the refusal be how somebody finds out.
    var isEditable: Bool { isNew || status.isEditable }

    var canDelete: Bool { !isNew && status.isDeletable }

    var canSave: Bool {
        !title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
            && !slug.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
            && !content.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
            && !isSaving
            && isEditable
    }

    func load() async {
        guard let articleId else { return }
        isLoading = true
        defer { isLoading = false }
        do {
            let article = try await repository.article(id: articleId)
            title = article.title
            slug = article.slug
            slugIsManual = true
            excerpt = article.excerpt ?? ""
            content = article.content ?? ""
            coverImage = article.coverImage
            sourceName = article.sourceName ?? ""
            sourceUrl = article.sourceUrl ?? ""
            category = article.category == .unknown ? .world : article.category
            status = article.status
            reviewNote = article.reviewNote
        } catch ApiError.cancelled {
            return
        } catch let error as ApiError {
            errorMessage = error.userFacingMessage
        } catch {
            errorMessage = L10n.string(.journalistEditorErrSaveFailed)
        }
    }

    /// Mirrors the slug web generates while typing a title.
    ///
    /// Lowercase, non-alphanumerics collapsed to single hyphens,
    /// trimmed. The server does not generate one - it requires the
    /// client to send it and rejects a duplicate with a 409 - so
    /// offering a sensible default is what stops every article being
    /// called "untitled".
    static func slugify(_ value: String) -> String {
        let folded = value.folding(options: [.diacriticInsensitive], locale: .current)
        var out = ""
        var lastWasHyphen = true
        for character in folded.lowercased() {
            if character.isLetter || character.isNumber {
                out.append(character)
                lastWasHyphen = false
            } else if !lastWasHyphen {
                out.append("-")
                lastWasHyphen = true
            }
        }
        while out.hasSuffix("-") { out.removeLast() }
        return String(out.prefix(120))
    }

    func titleChanged() {
        guard !slugIsManual else { return }
        slug = Self.slugify(title)
    }

    func slugEdited() {
        slugIsManual = true
    }

    private func draft(submit: Bool?) -> ArticleDraft {
        ArticleDraft(
            title: title.trimmingCharacters(in: .whitespacesAndNewlines),
            slug: slug.trimmingCharacters(in: .whitespacesAndNewlines),
            excerpt: excerpt.isEmpty ? nil : excerpt,
            content: content.trimmingCharacters(in: .whitespacesAndNewlines),
            coverImage: coverImage,
            sourceName: sourceName.isEmpty ? nil : sourceName,
            sourceUrl: sourceUrl.isEmpty ? nil : sourceUrl,
            category: category.rawValue,
            submit: submit,
            // POST takes `status`, PATCH takes `submit`. Sending the
            // right one to each is not cosmetic: PATCH ignores `status`
            // entirely, so a submit sent that way would silently save a
            // draft and nobody would know it was never submitted.
            status: nil
        )
    }

    /// Saves, and optionally submits for review in the same request.
    ///
    /// Returns true when the caller should leave the editor.
    func save(submit: Bool) async -> Bool {
        guard canSave else { return false }
        if submit, !canSubmitForReview {
            errorMessage = L10n.string(.journalistEditorErrSubmitRestricted)
            return false
        }
        isSaving = true
        defer { isSaving = false }

        do {
            if let articleId {
                let updated = try await repository.update(
                    id: articleId,
                    draft(submit: submit ? true : nil)
                )
                status = updated.status
                reviewNote = updated.reviewNote
            } else {
                var body = draft(submit: nil)
                body.status = submit ? "PENDING_REVIEW" : "DRAFT"
                let created = try await repository.create(body)
                status = created.status
            }
            return true
        } catch let error as ApiError {
            // The route's own wording for a duplicate slug, an
            // unverified submit, a suspended account and a locked
            // article all say something specific. Flattening them would
            // lose the only thing that tells somebody what to change.
            errorMessage = error.userFacingMessage
            return false
        } catch {
            errorMessage = L10n.string(.journalistEditorErrSaveFailed)
            return false
        }
    }

    func delete() async -> Bool {
        guard let articleId, canDelete else { return false }
        do {
            try await repository.delete(id: articleId)
            return true
        } catch let error as ApiError {
            errorMessage = error.userFacingMessage
            return false
        } catch {
            errorMessage = L10n.string(.journalistEditorErrSaveFailed)
            return false
        }
    }

    /// Uploads a cover through `newsCoverImage`, the router entry the
    /// web editor uses for exactly this.
    func uploadCover(_ item: PhotosPickerItem) async {
        isUploadingCover = true
        defer { isUploadingCover = false }

        guard let picked = try? await item.loadTransferable(type: PickedMedia.self),
              let picked
        else {
            errorMessage = L10n.string(.composerErrUploadFailed)
            return
        }
        defer { picked.discard() }

        do {
            let uploaded = try await uploads.upload(
                picked.asUploadCandidate(),
                to: .newsCoverImage
            ) { _ in }
            coverImage = uploaded.url
        } catch {
            errorMessage = L10n.string(
                .journalistEditorErrCoverUploadFailed,
                ["message": "\(error)"]
            )
        }
    }
}

/// Writing and editing an article.
///
/// The editorial rules are the routes': a draft or a rejected article
/// may be edited, anything submitted may not; only a draft may be
/// deleted; only a VERIFIED journalist may submit. Each control appears
/// only where the route would honour it, so the 409 or 403 is never how
/// somebody learns the rule.
struct JournalistArticleEditorView: View {

    @StateObject private var viewModel: JournalistArticleEditorViewModel
    @EnvironmentObject private var navigator: Navigator
    @State private var pickedCover: PhotosPickerItem?
    @State private var confirmingDelete = false

    init(articleId: String?, canSubmitForReview: Bool) {
        _viewModel = StateObject(
            wrappedValue: JournalistArticleEditorViewModel(
                articleId: articleId,
                canSubmitForReview: canSubmitForReview
            )
        )
    }

    var body: some View {
        Group {
            if viewModel.isLoading {
                TimelineStateView.loading()
            } else {
                form
            }
        }
        .background(ZrpColor.background.ignoresSafeArea())
        .navigationTitle(
            Text(viewModel.isNew ? L10nKey.journalistEditorNewTitle : .journalistEditorEditTitle)
        )
        .navigationBarTitleDisplayMode(.inline)
        .task { await viewModel.load() }
        .onChange(of: pickedCover) { _, item in
            guard let item else { return }
            pickedCover = nil
            Task { await viewModel.uploadCover(item) }
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
        .confirmationDialog(
            Text(.actionDelete),
            isPresented: $confirmingDelete,
            titleVisibility: .visible
        ) {
            Button(role: .destructive) {
                Task { if await viewModel.delete() { navigator.pop() } }
            } label: {
                Text(.actionDelete)
            }
            Button(role: .cancel) {} label: { Text(.actionCancel) }
        }
    }

    private var form: some View {
        Form {
            if !viewModel.isEditable {
                Section {
                    // The route refuses a PATCH on this article, so the
                    // form is read-only and says which state it is in.
                    Text(
                        .journalistEditorLockedNotice,
                        ["status": lockedStatusName]
                    )
                    .font(.caption)
                    .foregroundStyle(ZrpColor.amber)
                    .fixedSize(horizontal: false, vertical: true)
                }
            }

            if viewModel.status == .rejected {
                Section {
                    Text(.journalistEditorRejectedTitle)
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(ZrpColor.red)
                    Text(.journalistEditorRejectedHint)
                        .font(.caption)
                        .foregroundStyle(ZrpColor.onSurfaceMuted)
                    if let note = viewModel.reviewNote, !note.isEmpty {
                        Text(verbatim: note)
                            .font(.caption)
                            .foregroundStyle(ZrpColor.onSurface)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                }
            }

            Section {
                TextField(
                    text: $viewModel.title,
                    prompt: Text(.journalistEditorTitlePlaceholder),
                    label: { Text(.journalistEditorTitle) }
                )
                .onChange(of: viewModel.title) { _, _ in viewModel.titleChanged() }

                TextField(
                    text: $viewModel.slug,
                    prompt: Text(.journalistEditorSlugPlaceholder),
                    label: { Text(.journalistEditorSlug) }
                )
                .autocorrectionDisabled()
                .textInputAutocapitalization(.never)
                .onChange(of: viewModel.slug) { _, _ in viewModel.slugEdited() }

                Picker(selection: $viewModel.category) {
                    ForEach(NewsCategory.selectable) { category in
                        if let key = category.titleKey {
                            Text(key).tag(category)
                        }
                    }
                } label: {
                    Text(.journalistEditorCategory)
                }
            }

            Section {
                TextField(
                    text: $viewModel.excerpt,
                    prompt: Text(.journalistEditorExcerptPlaceholder),
                    axis: .vertical,
                    label: { Text(.journalistEditorExcerpt) }
                )
                .lineLimit(2...4)

                TextField(
                    text: $viewModel.content,
                    prompt: Text(.journalistEditorContentPlaceholder),
                    axis: .vertical,
                    label: { Text(.journalistEditorContent) }
                )
                .lineLimit(8...30)
            } header: {
                Text(.journalistEditorContent)
            }

            Section {
                if let cover = viewModel.coverImage, !cover.isEmpty {
                    RemoteImage(url: cover, targetSize: 320) {
                        Rectangle().fill(ZrpColor.surfaceHighest)
                    }
                    .aspectRatio(16 / 9, contentMode: .fit)
                    .clipShape(RoundedRectangle(cornerRadius: ZrpRadius.sm))
                }

                if viewModel.isEditable {
                    if viewModel.isUploadingCover {
                        HStack {
                            ProgressView().tint(ZrpColor.red)
                            Text(.journalistEditorUploading)
                        }
                    } else {
                        PhotosPicker(
                            selection: $pickedCover,
                            matching: .images,
                            photoLibrary: .shared()
                        ) {
                            Label { Text(.journalistEditorUploadImage) } icon: {
                                Image(systemName: "photo")
                            }
                        }
                    }
                }
            } header: {
                Text(.journalistEditorCoverImage)
            }

            Section {
                TextField(
                    text: $viewModel.sourceName,
                    prompt: Text(.journalistEditorSourceName),
                    label: { Text(.journalistEditorSourceName) }
                )
                TextField(
                    text: $viewModel.sourceUrl,
                    prompt: Text(.journalistEditorSourceUrl),
                    label: { Text(.journalistEditorSourceUrl) }
                )
                .autocorrectionDisabled()
                .textInputAutocapitalization(.never)
                .keyboardType(.URL)
            }

            if viewModel.isEditable {
                actions
            }
        }
        .disabled(!viewModel.isEditable)
        .scrollContentBackground(.hidden)
        .background(ZrpColor.background.ignoresSafeArea())
    }

    /// The translated name of the state that locked this article, for
    /// the "this article is {status}" notice.
    private var lockedStatusName: String {
        guard let key = viewModel.status.titleKey else { return "" }
        return L10n.string(key)
    }

    private var actions: some View {
        Section {
            Button {
                Task { if await viewModel.save(submit: false) { navigator.pop() } }
            } label: {
                Text(.journalistEditorSaveDraft)
                    .frame(maxWidth: .infinity)
            }
            .disabled(!viewModel.canSave)

            // Submitting is VERIFIED-only, enforced with a 403. An
            // unverified journalist sees the rule instead of a button
            // that would be refused.
            if viewModel.canSubmitForReview {
                Button {
                    Task { if await viewModel.save(submit: true) { navigator.pop() } }
                } label: {
                    Text(
                        viewModel.status == .rejected
                            ? L10nKey.journalistEditorResubmitForReview
                            : .journalistEditorSubmitForReview
                    )
                    .frame(maxWidth: .infinity)
                }
                .disabled(!viewModel.canSave)
            } else {
                Text(.journalistEditorSubmitTooltip)
                    .font(.caption2)
                    .foregroundStyle(ZrpColor.onSurfaceMuted)
                    .fixedSize(horizontal: false, vertical: true)
            }

            // Drafts only. Anything ever submitted stays for the
            // editorial record, so the control is simply absent.
            if viewModel.canDelete {
                Button(role: .destructive) { confirmingDelete = true } label: {
                    Text(.actionDelete)
                        .frame(maxWidth: .infinity)
                }
            }
        }
    }
}
