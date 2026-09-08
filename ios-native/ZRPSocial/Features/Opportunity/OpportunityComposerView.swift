import SwiftUI

/// Post an opportunity, or edit one you already posted.
///
/// One screen for both, because `POST /api/opportunity` and
/// `PUT /api/opportunity/{id}` accept the same fields. Two rules the
/// routes enforce, which this screen states before you press the button
/// rather than after:
///
/// - a new listing is created `PENDING_REVIEW`. There is no field that
///   skips review; the route sets the status itself.
/// - a **substantive** edit to a live listing (its type, title,
///   description or compensation) sends it back to `PENDING_REVIEW` and
///   clears the previous decision. Changing a location or a deadline
///   does not. That distinction is the route's, and the warning only
///   appears when it applies.
struct OpportunityComposerView: View {

    /// `nil` creates. An existing listing is passed whole rather than by
    /// id: it always arrives from "My listings", which has already
    /// fetched it, so re-fetching would put a spinner over data the app
    /// is already holding.
    let editing: MyOpportunityListing?

    @EnvironmentObject private var navigator: Navigator

    @State private var draft: OpportunityDraft
    @State private var skillEntry = ""
    @State private var hasDeadline: Bool
    @State private var deadlineDate: Date
    @State private var isSaving = false
    @State private var error: String?

    private let repository = OpportunityRepository()

    /// What was on the listing when the editor opened, so a substantive
    /// change can be recognised. Compared against the same four fields
    /// the route compares.
    private let original: OpportunityDraft?
    private let originalStatus: OpportunityStatus?

    init(editing: MyOpportunityListing?) {
        self.editing = editing
        let initial = editing.map(OpportunityDraft.init) ?? OpportunityDraft()
        _draft = State(initialValue: initial)
        _hasDeadline = State(initialValue: initial.deadline != nil)
        // A default a week out, so turning the toggle on lands somewhere
        // sensible instead of on this instant - which would already have
        // passed by the time anyone read it.
        _deadlineDate = State(
            initialValue: initial.deadline ?? Date().addingTimeInterval(7 * 24 * 60 * 60)
        )
        original = editing.map(OpportunityDraft.init)
        originalStatus = editing?.status
    }

    private var isEditing: Bool { editing != nil }

    private var canSave: Bool { draft.isValid && !isSaving }

    /// Exactly the four fields `PUT /api/opportunity/{id}` calls a
    /// substantive change. Location, remote, skills and the rest are
    /// deliberately not among them.
    private var wouldReturnToReview: Bool {
        guard originalStatus == .active, let original else { return false }
        return draft.type != original.type
            || draft.title != original.title
            || draft.description != original.description
            || draft.compensationInfo != original.compensationInfo
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: ZrpSpacing.lg) {
                Text(isEditing ? L10nKey.opportunityEditSubtitle : L10nKey.opportunityCreateSubtitle)
                    .font(.footnote)
                    .foregroundStyle(ZrpColor.onSurfaceMuted)
                    .fixedSize(horizontal: false, vertical: true)

                typePicker
                labelled(.opportunityTitleLabel) { field(.opportunityTitleLabel, text: $draft.title) }
                labelled(.opportunityDescriptionLabel) { descriptionField }
                labelled(.opportunityOrganizationLabel) {
                    field(.opportunityOrganizationLabel, text: $draft.organizationName)
                }
                skillsSection
                labelled(.opportunityLocationLabel) {
                    field(.opportunityLocationLabel, text: $draft.location)
                }

                Toggle(isOn: $draft.remote) {
                    Text(.opportunityRemote)
                        .font(.subheadline)
                        .foregroundStyle(ZrpColor.onSurface)
                }
                .tint(ZrpColor.red)

                Toggle(isOn: $draft.isPaid) {
                    Text(.opportunityIsPaid)
                        .font(.subheadline)
                        .foregroundStyle(ZrpColor.onSurface)
                }
                .tint(ZrpColor.red)

                if draft.isPaid {
                    labelled(.opportunityCompensationLabel) {
                        field(.opportunityCompensationPlaceholder, text: $draft.compensationInfo)
                    }
                }

                externalUrlSection
                deadlineSection

                if let error {
                    Text(verbatim: error)
                        .font(.footnote)
                        .foregroundStyle(ZrpColor.red)
                        .fixedSize(horizontal: false, vertical: true)
                }

                // Said before submitting. A poster should know the
                // listing will not be live the moment they press this.
                Text(noteKey)
                    .font(.caption)
                    .foregroundStyle(ZrpColor.onSurfaceMuted)
                    .fixedSize(horizontal: false, vertical: true)

                Button { save() } label: {
                    Text(saveLabel)
                        .font(.subheadline.weight(.bold))
                        .frame(maxWidth: .infinity)
                        .frame(minHeight: ZrpMetrics.minTouchTarget)
                        .background(canSave ? ZrpColor.red : ZrpColor.surfaceHighest)
                        .foregroundStyle(canSave ? .white : ZrpColor.onSurfaceMuted)
                        .clipShape(RoundedRectangle(cornerRadius: ZrpRadius.md))
                }
                .buttonStyle(.plain)
                .disabled(!canSave)
            }
            .padding(ZrpSpacing.lg)
            .frame(maxWidth: ZrpMetrics.contentMaxWidth, alignment: .leading)
            .frame(maxWidth: .infinity)
        }
        .background(ZrpColor.background.ignoresSafeArea())
        .navigationTitle(Text(isEditing ? L10nKey.opportunityEditTitle : L10nKey.opportunityCreateTitle))
        .navigationBarTitleDisplayMode(.inline)
    }

    /// The plain moderation note, or the sharper one when this edit
    /// would actually pull a live listing back into review.
    private var noteKey: L10nKey {
        wouldReturnToReview ? .opportunityEditModerationNote : .opportunityModerationNote
    }

    private var saveLabel: L10nKey {
        if isSaving { return isEditing ? .opportunitySaving : .opportunityPublishing }
        return isEditing ? .opportunitySaveChanges : .opportunityPublish
    }

    // MARK: - Fields

    private var typePicker: some View {
        Picker(selection: $draft.type) {
            ForEach(OpportunityType.selectable) { option in
                if let key = option.titleKey {
                    Text(key).tag(option)
                }
            }
        } label: {
            Text(.opportunityTypeLabel)
        }
        .pickerStyle(.menu)
        .tint(ZrpColor.onSurface)
    }

    private var descriptionField: some View {
        TextField(
            text: $draft.description,
            prompt: Text(.opportunityDescriptionLabel),
            axis: .vertical,
            label: { Text(.opportunityDescriptionLabel) }
        )
        .labelsHidden()
        .lineLimit(5...14)
        .padding(ZrpSpacing.md)
        .background(ZrpColor.surfaceElevated)
        .clipShape(RoundedRectangle(cornerRadius: ZrpRadius.md))
    }

    /// Skills are a list, not a comma-separated string: the route stores
    /// an array and filters it, so entering them one at a time is what
    /// the data actually is.
    ///
    /// Lower-cased and truncated to 40 characters on submit exactly as
    /// the route does, so what is shown here is what gets stored rather
    /// than a version the server will quietly rewrite.
    private var skillsSection: some View {
        labelled(.opportunitySkillsLabel) {
            VStack(alignment: .leading, spacing: ZrpSpacing.sm) {
                HStack(spacing: ZrpSpacing.sm) {
                    TextField(
                        text: $skillEntry,
                        prompt: Text(.opportunitySkillsPlaceholder),
                        label: { Text(.opportunitySkillsPlaceholder) }
                    )
                    .labelsHidden()
                    .autocorrectionDisabled()
                    .textInputAutocapitalization(.never)
                    .onSubmit(addSkill)
                    .padding(ZrpSpacing.md)
                    .background(ZrpColor.surfaceElevated)
                    .clipShape(RoundedRectangle(cornerRadius: ZrpRadius.md))

                    Button(action: addSkill) {
                        Image(systemName: "plus")
                            .frame(
                                width: ZrpMetrics.minTouchTarget,
                                height: ZrpMetrics.minTouchTarget
                            )
                    }
                    .buttonStyle(.plain)
                    .foregroundStyle(canAddSkill ? ZrpColor.red : ZrpColor.onSurfaceMuted)
                    .disabled(!canAddSkill)
                    .accessibilityLabel(Text(.opportunityAddSkill))
                }

                if !draft.skills.isEmpty {
                    LazyVGrid(
                        columns: [GridItem(.adaptive(minimum: 96), spacing: ZrpSpacing.sm)],
                        alignment: .leading,
                        spacing: ZrpSpacing.sm
                    ) {
                        ForEach(draft.skills, id: \.self) { skill in
                            Button {
                                draft.skills.removeAll { $0 == skill }
                            } label: {
                                HStack(spacing: ZrpSpacing.xs) {
                                    Text(verbatim: skill)
                                        .font(.caption)
                                        .lineLimit(1)
                                    Image(systemName: "xmark")
                                        .font(.caption2)
                                }
                                .padding(.horizontal, ZrpSpacing.sm)
                                .padding(.vertical, ZrpSpacing.xs)
                                .background(ZrpColor.surfaceElevated)
                                .clipShape(Capsule())
                            }
                            .buttonStyle(.plain)
                            .foregroundStyle(ZrpColor.onSurface)
                        }
                    }
                }
            }
        }
    }

    private var canAddSkill: Bool {
        !skillEntry.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
            && draft.skills.count < OpportunityDraft.skillCountLimit
    }

    private func addSkill() {
        // Normalised here the same way the route normalises it, so the
        // chip shows the value that will actually be stored - and so a
        // duplicate that differs only in case is recognised as one.
        let value = String(
            skillEntry
                .trimmingCharacters(in: .whitespacesAndNewlines)
                .lowercased()
                .prefix(OpportunityDraft.skillLimit)
        )
        guard !value.isEmpty,
              !draft.skills.contains(value),
              draft.skills.count < OpportunityDraft.skillCountLimit
        else { return }
        draft.skills.append(value)
        skillEntry = ""
    }

    /// The route refuses an external URL pointing back at ZRP itself,
    /// with a message explaining that leaving it blank uses ZRP's own
    /// apply flow. The hint says the same thing up front.
    private var externalUrlSection: some View {
        labelled(.opportunityExternalUrlLabel) {
            VStack(alignment: .leading, spacing: ZrpSpacing.xs) {
                TextField(
                    text: $draft.externalUrl,
                    prompt: Text(.opportunityExternalUrlPlaceholder),
                    label: { Text(.opportunityExternalUrlLabel) }
                )
                .labelsHidden()
                .keyboardType(.URL)
                .autocorrectionDisabled()
                .textInputAutocapitalization(.never)
                .padding(ZrpSpacing.md)
                .background(ZrpColor.surfaceElevated)
                .clipShape(RoundedRectangle(cornerRadius: ZrpRadius.md))

                Text(.opportunityExternalUrlHint)
                    .font(.caption)
                    .foregroundStyle(ZrpColor.onSurfaceMuted)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
    }

    private var deadlineSection: some View {
        VStack(alignment: .leading, spacing: ZrpSpacing.sm) {
            Toggle(isOn: $hasDeadline) {
                Text(.opportunityDeadlineLabel)
                    .font(.subheadline)
                    .foregroundStyle(ZrpColor.onSurface)
            }
            .tint(ZrpColor.red)

            if hasDeadline {
                DatePicker(
                    selection: $deadlineDate,
                    in: Date()...,
                    displayedComponents: .date
                ) {
                    Text(.opportunityDeadlineLabel)
                }
                .labelsHidden()
                .datePickerStyle(.compact)
            }
        }
    }

    // MARK: - Pieces

    private func labelled<Content: View>(
        _ key: L10nKey,
        @ViewBuilder content: () -> Content
    ) -> some View {
        VStack(alignment: .leading, spacing: ZrpSpacing.xs) {
            Text(key)
                .font(.caption.weight(.semibold))
                .foregroundStyle(ZrpColor.onSurfaceMuted)
            content()
        }
    }

    private func field(_ key: L10nKey, text: Binding<String>) -> some View {
        TextField(text: text, prompt: Text(key), label: { Text(key) })
            .labelsHidden()
            .padding(ZrpSpacing.md)
            .background(ZrpColor.surfaceElevated)
            .clipShape(RoundedRectangle(cornerRadius: ZrpRadius.md))
    }

    // MARK: - Saving

    private func save() {
        guard canSave else { return }
        error = nil
        isSaving = true

        var outgoing = draft
        outgoing.deadline = hasDeadline ? deadlineDate : nil

        Task {
            defer { isSaving = false }
            do {
                if let editing {
                    try await repository.update(id: editing.id, draft: outgoing)
                } else {
                    _ = try await repository.create(outgoing)
                }
                navigator.pop()
            } catch let apiError as ApiError {
                // The route distinguishes a bad type, an over-long title,
                // an invalid deadline and an external URL pointing back
                // at ZRP - each with its own sentence. Those are worth
                // reading as written; a generic failure would throw away
                // the only thing that says how to fix it.
                error = apiError.userFacingMessage
            } catch {
                self.error = L10n.string(
                    isEditing ? .opportunityErrUpdateFailed : .opportunityErrCreateFailed
                )
            }
        }
    }
}
