import SwiftUI

/// The ZRP Trust Passport for one account.
///
/// Every number on this screen comes from the route. The backend's own
/// comment is explicit that a client must never calculate the score, so
/// nothing here derives one: the ring is the reported score over the
/// reported maximum, and each signal shows the points the route assigned
/// it.
struct TrustPassportView: View {

    let username: String

    @State private var passport: TrustPassport?
    @State private var loadError: ApiError?

    private let repository = UsersRepository()

    /// The five groups the website uses, in its order. A category the
    /// backend adds later is not silently dropped - it falls into the
    /// ungrouped section below.
    private static let categories = ["SECURITY", "PROFILE", "HISTORY", "COMMUNITY", "ZRP"]

    var body: some View {
        Group {
            if let passport {
                content(passport)
            } else if let loadError {
                if case .notFound = loadError {
                    TimelineStateView.empty(
                        systemImage: "person.slash",
                        title: .trustUnavailableTitle,
                        subtitle: .trustNotFoundFallback
                    )
                } else {
                    TimelineStateView.error(loadError) { Task { await load() } }
                }
            } else {
                TimelineStateView.loading()
            }
        }
        .background(ZrpColor.background.ignoresSafeArea())
        .navigationTitle(Text(.trustHeaderTitle))
        .navigationBarTitleDisplayMode(.inline)
        .task { await load() }
    }

    private func content(_ passport: TrustPassport) -> some View {
        ScrollView {
            VStack(alignment: .leading, spacing: ZrpSpacing.xl) {
                header(passport)
                scoreRing(passport.passport)
                stats(passport)
                accountHistory(passport.user)
                signalSections(passport)
                footnotes
            }
            .padding(ZrpSpacing.lg)
            .frame(maxWidth: ZrpMetrics.contentMaxWidth)
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .refreshable { await load() }
    }

    private func header(_ passport: TrustPassport) -> some View {
        HStack(spacing: ZrpSpacing.md) {
            AvatarView(
                url: passport.user.avatarUrl,
                displayName: passport.user.displayName,
                size: ZrpMetrics.avatarMedium
            )
            VStack(alignment: .leading, spacing: 2) {
                HStack(spacing: ZrpSpacing.xs) {
                    Text(verbatim: passport.user.displayName)
                        .font(.headline)
                        .foregroundStyle(ZrpColor.onSurface)
                    VerifiedBadge(badgeType: passport.user.badgeType, size: 14)
                }
                Text(.trustHeaderSubtitle)
                    .font(.caption)
                    .foregroundStyle(ZrpColor.onSurfaceMuted)
            }
            Spacer(minLength: 0)
        }
    }

    private func scoreRing(_ score: TrustScore) -> some View {
        HStack(spacing: ZrpSpacing.xl) {
            ZStack {
                Circle()
                    .stroke(ZrpColor.surfaceHighest, lineWidth: 10)
                Circle()
                    .trim(from: 0, to: score.fraction)
                    .stroke(
                        ZrpColor.red,
                        style: StrokeStyle(lineWidth: 10, lineCap: .round)
                    )
                    .rotationEffect(.degrees(-90))
                VStack(spacing: 0) {
                    Text(verbatim: CountFormatting.exact(score.score))
                        .font(.title.weight(.bold).monospacedDigit())
                        .foregroundStyle(ZrpColor.onSurface)
                    Text(.trustOutOf100)
                        .font(.caption2)
                        .foregroundStyle(ZrpColor.onSurfaceMuted)
                }
            }
            .frame(width: 120, height: 120)
            .accessibilityElement(children: .ignore)
            .accessibilityLabel(Text(.trustHeaderTitle))
            .accessibilityValue(
                Text(verbatim: "\(CountFormatting.exact(score.score)) / \(CountFormatting.exact(score.maxScore))")
            )

            VStack(alignment: .leading, spacing: ZrpSpacing.xs) {
                if !score.levelLabel.isEmpty {
                    // The level's name is the backend's, in English -
                    // there is no dictionary of them to translate
                    // against, and inventing one would mean guessing at
                    // values it can add to.
                    Text(verbatim: score.levelLabel)
                        .font(.title3.weight(.semibold))
                        .foregroundStyle(ZrpColor.onSurface)
                }
                Text(.trustScoreFootnote)
                    .font(.caption)
                    .foregroundStyle(ZrpColor.onSurfaceMuted)
            }
            Spacer(minLength: 0)
        }
    }

    private func stats(_ passport: TrustPassport) -> some View {
        HStack(spacing: ZrpSpacing.xl) {
            stat(.trustStatPosts, value: passport.counts.posts)
            stat(.trustStatFollowers, value: passport.counts.followers)
            stat(.trustStatOnZrp, value: passport.user.accountAgeMonths)
        }
    }

    private func stat(_ title: L10nKey, value: Int) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(verbatim: CountFormatting.compact(value) ?? "0")
                .font(.headline.monospacedDigit())
                .foregroundStyle(ZrpColor.onSurface)
            Text(title)
                .font(.caption)
                .foregroundStyle(ZrpColor.onSurfaceMuted)
        }
        .accessibilityElement(children: .combine)
    }

    @ViewBuilder
    private func accountHistory(_ user: TrustUser) -> some View {
        VStack(alignment: .leading, spacing: ZrpSpacing.xs) {
            Text(.trustAccountHistoryTitle)
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(ZrpColor.onSurface)
            if let createdAt = user.createdAt {
                Text(.trustJoinedIn, [
                    "date": createdAt.formatted(date: .abbreviated, time: .omitted),
                ])
                .font(.caption)
                .foregroundStyle(ZrpColor.onSurfaceMuted)
            }
            HStack(spacing: ZrpSpacing.xs) {
                Text(.trustAccountAgeLabel)
                Text(.trustDaysSuffix, ["days": CountFormatting.exact(user.accountAgeDays)])
            }
            .font(.caption)
            .foregroundStyle(ZrpColor.onSurfaceMuted)
            Text(.trustAccountAgeFootnote)
                .font(.caption2)
                .foregroundStyle(ZrpColor.onSurfaceMuted)
        }
    }

    @ViewBuilder
    private func signalSections(_ passport: TrustPassport) -> some View {
        VStack(alignment: .leading, spacing: ZrpSpacing.lg) {
            Text(.trustTrustSignalsTitle)
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(ZrpColor.onSurface)
            Text(.trustTrustSignalsSubtitle)
                .font(.caption)
                .foregroundStyle(ZrpColor.onSurfaceMuted)

            ForEach(Self.categories, id: \.self) { category in
                let matching = passport.signals.filter { $0.category == category }
                if !matching.isEmpty {
                    VStack(alignment: .leading, spacing: ZrpSpacing.sm) {
                        // The category name is the backend's constant,
                        // not a label - shown as it comes rather than
                        // invented wording for it.
                        Text(verbatim: category.capitalized)
                            .font(.caption.weight(.semibold))
                            .foregroundStyle(ZrpColor.onSurfaceMuted)
                        ForEach(matching) { signal in
                            signalRow(signal)
                        }
                    }
                }
            }

            // Anything the backend groups under a category this screen
            // does not know about still appears, rather than vanishing.
            let ungrouped = passport.signals.filter {
                $0.category.map { !Self.categories.contains($0) } ?? true
            }
            if !ungrouped.isEmpty {
                ForEach(ungrouped) { signal in
                    signalRow(signal)
                }
            }

            if !passport.additionalSignals.isEmpty {
                Text(.trustAdditionalSignalsHeading)
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(ZrpColor.onSurface)
                Text(.trustAdditionalSignalsNote)
                    .font(.caption)
                    .foregroundStyle(ZrpColor.onSurfaceMuted)
                ForEach(passport.additionalSignals) { signal in
                    signalRow(signal)
                }
            }
        }
    }

    private func signalRow(_ signal: TrustSignal) -> some View {
        HStack(alignment: .top, spacing: ZrpSpacing.md) {
            Image(systemName: signal.verified ? "checkmark.circle.fill" : "circle")
                .foregroundStyle(signal.verified ? ZrpColor.green : ZrpColor.onSurfaceMuted)
            VStack(alignment: .leading, spacing: 2) {
                // Server-provided English: the route hardcodes these
                // titles, so they are not translated here and are not
                // rewritten either.
                Text(verbatim: signal.title)
                    .font(.subheadline)
                    .foregroundStyle(ZrpColor.onSurface)
                if let description = signal.description, !description.isEmpty {
                    Text(verbatim: description)
                        .font(.caption)
                        .foregroundStyle(ZrpColor.onSurfaceMuted)
                }
            }
            Spacer(minLength: 0)
            if signal.maxPoints > 0 {
                Text(verbatim: "\(signal.points)/\(signal.maxPoints)")
                    .font(.caption.monospacedDigit())
                    .foregroundStyle(ZrpColor.onSurfaceMuted)
            }
        }
        .accessibilityElement(children: .combine)
    }

    private var footnotes: some View {
        VStack(alignment: .leading, spacing: ZrpSpacing.sm) {
            Text(.trustWhatItMeansTitle)
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(ZrpColor.onSurface)
            Text(.trustWhatItMeansDesc)
                .font(.caption)
                .foregroundStyle(ZrpColor.onSurfaceMuted)
            Text(.trustTransparencyNotice)
                .font(.caption2)
                .foregroundStyle(ZrpColor.onSurfaceMuted)
        }
    }

    private func load() async {
        do {
            passport = try await repository.trustPassport(username: username)
            loadError = nil
        } catch {
            loadError = error as? ApiError ?? .transport(underlying: "\(error)")
        }
    }
}
