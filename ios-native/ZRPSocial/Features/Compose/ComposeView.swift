import PhotosUI
import SwiftUI

/// The post composer.
///
/// Text, images, a video, and GIFs - all against the real backend.
/// Attachments upload the moment they are picked, through the same
/// UploadThing router the website uses, with real progress, cancellation
/// and retry. Nothing here is simulated.
struct ComposeView: View {

    /// The post being quoted, if the composer was opened from a Quote
    /// action.
    var quoting: Post? = nil

    /// Called with the created post so the caller can show it without a
    /// refetch.
    let onPosted: (Post) -> Void

    @EnvironmentObject private var session: SessionController
    @Environment(\.dismiss) private var dismiss
    @StateObject private var viewModel = ComposeViewModel()

    @State private var pickerSelection: [PhotosPickerItem] = []
    @State private var isShowingGifPicker = false
    @State private var isConfirmingDiscard = false
    @FocusState private var isTextFocused: Bool

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: ZrpSpacing.lg) {
                    editor
                    quotedPreview
                    pollBuilder
                    attachmentsSection
                }
                .padding(ZrpSpacing.lg)
                .frame(maxWidth: ZrpMetrics.contentMaxWidth)
                .frame(maxWidth: .infinity)
            }
            .background(ZrpColor.background.ignoresSafeArea())
            .scrollDismissesKeyboard(.interactively)
            .safeAreaInset(edge: .bottom) { toolbar }
            .navigationTitle(Text(.iosComposeTitle))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { navigationButtons }
            .onAppear {
                viewModel.plan = session.currentUser?.plan
                viewModel.quotedPost = quoting
                isTextFocused = true
            }
            .onChange(of: pickerSelection) { _, items in
                guard !items.isEmpty else { return }
                Task { await load(items) }
            }
            .onChange(of: viewModel.createdPost) { _, post in
                guard let post else { return }
                onPosted(post)
                dismiss()
            }
            .sheet(isPresented: $isShowingGifPicker) {
                GifPickerView { viewModel.add(gif: $0) }
            }
            .confirmationDialog(
                Text(.iosComposeDiscardTitle),
                isPresented: $isConfirmingDiscard,
                titleVisibility: .visible
            ) {
                Button(role: .destructive) {
                    viewModel.discardDraft()
                    dismiss()
                } label: {
                    Text(.iosComposeDiscard)
                }
                Button(role: .cancel) {} label: { Text(.iosComposeKeepEditing) }
            } message: {
                Text(.iosComposeDiscardMessage)
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
        .interactiveDismissDisabled(hasUnsavedWork)
    }

    /// A compact, non-interactive rendering of the quoted post, so the
    /// author can see what they are quoting. Deliberately not tappable:
    /// opening it would abandon the draft.
    @ViewBuilder
    private var quotedPreview: some View {
        if let quoting {
            VStack(alignment: .leading, spacing: ZrpSpacing.sm) {
                HStack(spacing: ZrpSpacing.sm) {
                    AvatarView(
                        url: quoting.author.avatarUrl,
                        displayName: quoting.author.displayName,
                        size: ZrpMetrics.avatarSmall
                    )
                    Text(verbatim: quoting.author.displayName)
                        .font(.footnote.weight(.semibold))
                        .foregroundStyle(ZrpColor.onSurface)
                        .lineLimit(1)
                    VerifiedBadge(badgeType: quoting.author.badgeType, size: 12)
                    Text(verbatim: quoting.author.handle)
                        .font(.footnote)
                        .foregroundStyle(ZrpColor.onSurfaceMuted)
                        .lineLimit(1)
                        .layoutPriority(-1)
                    Spacer(minLength: 0)
                }
                if !quoting.content.isEmpty {
                    Text(verbatim: quoting.content)
                        .font(.footnote)
                        .foregroundStyle(ZrpColor.onSurface)
                        .lineLimit(4)
                }
            }
            .padding(ZrpSpacing.md)
            .frame(maxWidth: .infinity, alignment: .leading)
            .overlay(
                RoundedRectangle(cornerRadius: ZrpRadius.md, style: .continuous)
                    .strokeBorder(ZrpColor.outline, lineWidth: 1)
            )
            .accessibilityElement(children: .combine)
        }
    }

    private var hasUnsavedWork: Bool {
        !viewModel.text.isEmpty
            || !viewModel.attachments.isEmpty
            || !viewModel.pollQuestion.isEmpty
            || viewModel.pollOptions.contains { !$0.isEmpty }
    }

    // MARK: - Sections

    private var editor: some View {
        HStack(alignment: .top, spacing: ZrpSpacing.md) {
            AvatarView(
                url: session.currentUser?.avatarUrl,
                displayName: session.currentUser?.displayName ?? "",
                size: ZrpMetrics.avatarMedium
            )
            .accessibilityHidden(true)

            TextField(
                L10n.string(.composerPlaceholderDefault),
                text: $viewModel.text,
                axis: .vertical
            )
            .focused($isTextFocused)
            .font(.body)
            .foregroundStyle(ZrpColor.onSurface)
            .lineLimit(6...)
            .accessibilityLabel(Text(.composerPlaceholderDefault))
        }
    }

    @ViewBuilder
    private var attachmentsSection: some View {
        if !viewModel.attachments.isEmpty {
            VStack(spacing: ZrpSpacing.md) {
                ForEach(viewModel.attachments) { attachment in
                    AttachmentRow(
                        attachment: attachment,
                        onRemove: { viewModel.remove(attachment) },
                        onRetry: { viewModel.retry(attachment) }
                    )
                }
            }
        }
    }

    private var toolbar: some View {
        HStack(spacing: ZrpSpacing.lg) {
            PhotosPicker(
                selection: $pickerSelection,
                maxSelectionCount: max(1, viewModel.remainingMediaSlots),
                matching: .any(of: [.images, .videos])
            ) {
                Image(systemName: "photo.on.rectangle")
                    .font(.title3)
                    .frame(width: ZrpMetrics.minTouchTarget, height: ZrpMetrics.minTouchTarget)
                    .contentShape(Rectangle())
            }
            .disabled(!viewModel.canAddMoreMedia)
            .accessibilityLabel(Text(.iosComposeAddPhoto))

            Button {
                isShowingGifPicker = true
            } label: {
                Image(systemName: "square.grid.2x2")
                    .font(.title3)
                    .frame(width: ZrpMetrics.minTouchTarget, height: ZrpMetrics.minTouchTarget)
                    .contentShape(Rectangle())
            }
            .disabled(!viewModel.canAddMoreMedia)
            .accessibilityLabel(Text(.composerAddGif))

            Button {
                viewModel.isBuildingPoll.toggle()
            } label: {
                Image(systemName: viewModel.isBuildingPoll ? "chart.bar.fill" : "chart.bar")
                    .font(.title3)
                    .frame(width: ZrpMetrics.minTouchTarget, height: ZrpMetrics.minTouchTarget)
                    .contentShape(Rectangle())
            }
            .accessibilityLabel(Text(.iosComposeAddPoll))

            Spacer()

            characterCounter
        }
        .foregroundStyle(ZrpColor.red)
        .padding(.horizontal, ZrpSpacing.lg)
        .padding(.vertical, ZrpSpacing.sm)
        .background(.bar)
    }

    /// The poll builder.
    ///
    /// Closing it discards the poll outright rather than keeping fields
    /// that would be silently sent later. Two options is the floor - the
    /// route creates a poll only when there is more than one - and six
    /// the ceiling, which is the website's own default.
    @ViewBuilder
    private var pollBuilder: some View {
        if viewModel.isBuildingPoll {
            VStack(alignment: .leading, spacing: ZrpSpacing.sm) {
                TextField(
                    L10n.string(.iosComposePollQuestion),
                    text: $viewModel.pollQuestion,
                    axis: .vertical
                )
                .font(.subheadline)
                .lineLimit(1...3)
                .padding(ZrpSpacing.md)
                .background(ZrpColor.surfaceElevated)
                .clipShape(RoundedRectangle(cornerRadius: ZrpRadius.sm, style: .continuous))

                // Indexed rather than by value: two options may legally
                // hold the same text, and identity by content would then
                // collapse them into one row. The bounds check guards the
                // frame in which a removal has happened but the list has
                // not yet been re-evaluated.
                ForEach(Array(viewModel.pollOptions.indices), id: \.self) { index in
                    if viewModel.pollOptions.indices.contains(index) {
                        HStack(spacing: ZrpSpacing.sm) {
                            TextField(
                                L10n.string(.iosComposePollOption),
                                text: $viewModel.pollOptions[index]
                            )
                            .font(.subheadline)
                            .padding(ZrpSpacing.md)
                            .background(ZrpColor.surfaceElevated)
                            .clipShape(
                                RoundedRectangle(cornerRadius: ZrpRadius.sm, style: .continuous)
                            )

                            if viewModel.canRemovePollOption {
                                Button {
                                    viewModel.removePollOption(at: index)
                                } label: {
                                    Image(systemName: "minus.circle")
                                        .foregroundStyle(ZrpColor.onSurfaceMuted)
                                        .frame(
                                            width: ZrpMetrics.minTouchTarget,
                                            height: ZrpMetrics.minTouchTarget
                                        )
                                        .contentShape(Rectangle())
                                }
                                .accessibilityLabel(Text(.iosComposeRemovePollOption))
                            }
                        }
                    }
                }

                if viewModel.canAddPollOption {
                    Button {
                        viewModel.addPollOption()
                    } label: {
                        Label {
                            Text(.iosComposeAddPollOption)
                        } icon: {
                            Image(systemName: "plus.circle")
                        }
                        .font(.subheadline)
                        .frame(minHeight: ZrpMetrics.minTouchTarget)
                        .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    .foregroundStyle(ZrpColor.red)
                }

                // An end date is optional: a poll with no `expiresAt`
                // never closes, which is what the route stores when the
                // field is absent.
                Toggle(isOn: pollExpiryBinding) {
                    Text(.iosComposePollEnds)
                        .font(.subheadline)
                }
                .tint(ZrpColor.red)

                if viewModel.pollExpiry != nil {
                    DatePicker(
                        selection: Binding(
                            get: { viewModel.pollExpiry ?? Self.defaultPollExpiry },
                            set: { viewModel.pollExpiry = $0 }
                        ),
                        in: Date()...,
                        displayedComponents: [.date, .hourAndMinute]
                    ) {
                        Text(.iosComposePollEnds)
                    }
                    .labelsHidden()
                }
            }
            .padding(ZrpSpacing.md)
            .frame(maxWidth: .infinity, alignment: .leading)
            .overlay(
                RoundedRectangle(cornerRadius: ZrpRadius.md, style: .continuous)
                    .strokeBorder(ZrpColor.outline, lineWidth: 1)
            )
        }
    }

    /// A day out, which is the span most polls want and a sane starting
    /// point for the picker.
    private static var defaultPollExpiry: Date {
        Date().addingTimeInterval(24 * 60 * 60)
    }

    private var pollExpiryBinding: Binding<Bool> {
        Binding(
            get: { viewModel.pollExpiry != nil },
            set: { viewModel.pollExpiry = $0 ? Self.defaultPollExpiry : nil }
        )
    }

    private var characterCounter: some View {
        // Only appears as the limit approaches - a permanent counter is
        // noise for a short post, and the plan's limit can be 999,999.
        Group {
            if viewModel.remainingCharacters <= 40 {
                Text(verbatim: "\(viewModel.remainingCharacters)")
                    .font(.footnote.monospacedDigit())
                    .foregroundStyle(
                        viewModel.isOverCharacterLimit ? ZrpColor.red : ZrpColor.onSurfaceMuted
                    )
                    .accessibilityLabel(
                        Text(verbatim: CountFormatting.exact(viewModel.remainingCharacters))
                    )
            }
        }
    }

    @ToolbarContentBuilder
    private var navigationButtons: some ToolbarContent {
        ToolbarItem(placement: .topBarLeading) {
            Button {
                if hasUnsavedWork {
                    isConfirmingDiscard = true
                } else {
                    dismiss()
                }
            } label: {
                Text(.actionCancel)
            }
        }
        ToolbarItem(placement: .topBarTrailing) {
            Button {
                Task { await viewModel.post() }
            } label: {
                if viewModel.isPosting {
                    ProgressView().tint(.white)
                } else {
                    Text(.composerPostButton)
                        .font(.subheadline.weight(.semibold))
                }
            }
            .buttonStyle(.borderedProminent)
            .tint(ZrpColor.red)
            .disabled(!viewModel.canPost)
        }
    }

    // MARK: -

    private func load(_ items: [PhotosPickerItem]) async {
        var loaded: [PickedMedia] = []
        for item in items {
            // `PickedMedia` copies the file out of the picker's
            // short-lived sandbox as part of loading, so the upload can
            // still read it afterwards.
            if let media = try? await item.loadTransferable(type: PickedMedia.self) {
                loaded.append(media)
            }
        }
        pickerSelection = []
        guard !loaded.isEmpty else { return }
        viewModel.add(loaded)
    }
}

/// One attachment with its real upload state.
private struct AttachmentRow: View {

    let attachment: Attachment
    let onRemove: () -> Void
    let onRetry: () -> Void

    var body: some View {
        HStack(spacing: ZrpSpacing.md) {
            thumbnail

            VStack(alignment: .leading, spacing: ZrpSpacing.xs) {
                switch attachment.state {
                case .pending:
                    Text(.composerUploading)
                        .font(.footnote)
                        .foregroundStyle(ZrpColor.onSurfaceMuted)

                case .uploading(let progress):
                    // A real byte-level progress bar driven by
                    // URLSession, not an indeterminate spinner - a video
                    // upload can take minutes and the user deserves to
                    // see it move.
                    ProgressView(value: progress)
                        .tint(ZrpColor.red)
                    Text(verbatim: "\(Int(progress * 100))%")
                        .font(.caption.monospacedDigit())
                        .foregroundStyle(ZrpColor.onSurfaceMuted)

                case .uploaded:
                    Label {
                        Text(.iosComposeUploaded)
                    } icon: {
                        Image(systemName: "checkmark.circle.fill")
                    }
                    .font(.footnote)
                    .foregroundStyle(ZrpColor.green)

                case .failed(let message):
                    Text(verbatim: message)
                        .font(.caption)
                        .foregroundStyle(ZrpColor.red)
                        .lineLimit(3)
                    Button(action: onRetry) {
                        Text(.actionRetry)
                            .font(.caption.weight(.semibold))
                    }
                    .accessibilityLabel(Text(.iosComposeRetryUpload))
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)

            Button(action: onRemove) {
                Image(systemName: "xmark.circle.fill")
                    .font(.title3)
                    .foregroundStyle(ZrpColor.onSurfaceMuted)
                    .frame(width: ZrpMetrics.minTouchTarget, height: ZrpMetrics.minTouchTarget)
                    .contentShape(Rectangle())
            }
            .accessibilityLabel(Text(.iosComposeRemoveAttachment))
        }
        .padding(ZrpSpacing.md)
        .background(ZrpColor.surfaceElevated)
        .clipShape(RoundedRectangle(cornerRadius: ZrpRadius.md, style: .continuous))
    }

    private var thumbnail: some View {
        AttachmentThumbnail(
            fileURL: attachment.media?.url,
            remoteURL: attachment.remoteURL,
            isVideo: attachment.isVideo
        )
    }
}
