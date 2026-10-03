import SwiftUI

/// What the create sheet hands back. `scheduledAt` set means "create a
/// SCHEDULED room for then" - the server only honours a time in the
/// future (`createRoom`'s `isScheduled` check), which the sheet enforces
/// first so nobody learns that from a silently-live room.
struct LiveRoomDraft: Equatable {
    let title: String
    let description: String?
    let category: String?
    /// `"PUBLIC"` | `"COMMUNITY"` | `"PRIVATE"`
    let visibility: String
    let communityId: String?
    let scheduledAt: Date?
}

/// The "Go live" sheet for both Live Audio and Live Video - their create
/// routes take the identical body (`CreateLiveAudioRoomRequest`). Ported
/// from the web's `CreateLiveAudioModal`/`CreateLiveVideoModal`, plus a
/// "Schedule" option neither web modal has yet: the backend has always
/// accepted `scheduledAt`, and scheduled-live reminders are meaningless
/// without a way to schedule. Visibility defaults to PUBLIC; COMMUNITY
/// requires one of the caller's own communities (membership is enforced
/// server-side, not re-checked here).
struct LiveCreateRoomSheet: View {

    private enum Visibility: String, CaseIterable {
        case pub = "PUBLIC"
        case community = "COMMUNITY"
        case priv = "PRIVATE"

        var titleKey: L10nKey {
            switch self {
            case .pub: return .liveAudioVisibilityPublic
            case .community: return .liveAudioVisibilityCommunity
            case .priv: return .liveAudioVisibilityPrivate
            }
        }
    }

    let myCommunities: [Community]
    let isCreating: Bool
    let createError: String?
    let onCancel: () -> Void
    let onSubmit: (LiveRoomDraft) -> Void

    @State private var title = ""
    @State private var description = ""
    @State private var category = ""
    @State private var visibility: Visibility = .pub
    @State private var communityId: String?
    @State private var schedule = false
    @State private var scheduledAt = Date().addingTimeInterval(3600)
    @State private var localError: String?

    /// A scheduled start has to be meaningfully in the future by the time
    /// the request lands, not merely a second from now.
    private var earliestStart: Date { Date().addingTimeInterval(5 * 60) }

    private var trimmedTitle: String {
        title.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    private var canSubmit: Bool {
        guard !trimmedTitle.isEmpty, trimmedTitle.count <= 200, !isCreating else { return false }
        if visibility == .community, communityId == nil { return false }
        return true
    }

    var body: some View {
        NavigationStack {
            Form {
                if let error = localError ?? createError {
                    Section {
                        Text(verbatim: error)
                            .foregroundStyle(ZrpColor.red)
                    }
                }

                Section {
                    TextField(L10n.string(.liveAudioTitlePlaceholder), text: $title)
                } header: {
                    Text(.liveAudioTitleLabel)
                }

                Section {
                    TextField(L10n.string(.liveAudioDescriptionLabel), text: $description, axis: .vertical)
                        .lineLimit(2...5)
                } header: {
                    Text(.liveAudioDescriptionLabel)
                }

                Section {
                    TextField(L10n.string(.liveAudioCategoryLabel), text: $category)
                } header: {
                    Text(.liveAudioCategoryLabel)
                }

                Section {
                    Picker(L10n.string(.liveAudioVisibilityLabel), selection: $visibility) {
                        ForEach(Visibility.allCases, id: \.self) { option in
                            Text(option.titleKey).tag(option)
                        }
                    }
                    .pickerStyle(.segmented)

                    if visibility == .community {
                        if myCommunities.isEmpty {
                            Text(.liveAudioNoCommunitiesHint)
                                .font(.footnote)
                                .foregroundStyle(ZrpColor.onSurfaceMuted)
                        } else {
                            Picker(L10n.string(.liveAudioCommunityLabel), selection: $communityId) {
                                Text(.liveAudioSelectCommunityPlaceholder).tag(String?.none)
                                ForEach(myCommunities) { community in
                                    Text(verbatim: community.name).tag(String?.some(community.id))
                                }
                            }
                        }
                    }
                } header: {
                    Text(.liveAudioVisibilityLabel)
                }

                Section {
                    Toggle(isOn: $schedule) {
                        Text(.iosLiveScheduleToggle)
                    }
                    .tint(ZrpColor.red)

                    if schedule {
                        DatePicker(
                            selection: $scheduledAt,
                            in: earliestStart...,
                            displayedComponents: [.date, .hourAndMinute]
                        ) {
                            Text(.iosLiveScheduleStartsAt)
                        }
                        .environment(\.locale, L10n.activeLocale)
                        Text(.iosLiveScheduleHint)
                            .font(.footnote)
                            .foregroundStyle(ZrpColor.onSurfaceMuted)
                    }
                } header: {
                    Text(.composerSchedule)
                }
            }
            .navigationTitle(Text(.liveAudioCreateTitle))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button(action: onCancel) {
                        Text(.actionCancel)
                    }
                }
                ToolbarItem(placement: .confirmationAction) {
                    if isCreating {
                        ProgressView()
                    } else {
                        Button {
                            submit()
                        } label: {
                            Text(schedule ? L10nKey.composerScheduleButton : L10nKey.liveAudioCreateSubmit)
                        }
                        .disabled(!canSubmit)
                    }
                }
            }
        }
    }

    private func submit() {
        localError = nil
        if schedule, scheduledAt <= Date() {
            localError = L10n.string(.composerErrScheduleFuture)
            return
        }
        onSubmit(LiveRoomDraft(
            title: trimmedTitle,
            description: description.trimmingCharacters(in: .whitespacesAndNewlines).nilIfEmpty,
            category: category.trimmingCharacters(in: .whitespacesAndNewlines).nilIfEmpty,
            visibility: visibility.rawValue,
            communityId: visibility == .community ? communityId : nil,
            scheduledAt: schedule ? scheduledAt : nil
        ))
    }
}

extension LiveRoomDraft {
    /// The wire body both create routes accept. `scheduledAt` goes out as
    /// the ISO-8601 instant the route parses with `Date.parse`.
    var request: CreateLiveAudioRoomRequest {
        CreateLiveAudioRoomRequest(
            title: title,
            description: description,
            category: category,
            visibility: visibility,
            communityId: communityId,
            scheduledAt: scheduledAt.map { $0.formatted(Date.ISO8601FormatStyle(includingFractionalSeconds: true)) }
        )
    }
}
