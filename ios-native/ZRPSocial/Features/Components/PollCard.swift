import SwiftUI

/// A poll on a post.
///
/// Voting is permanent: `POST /api/polls/{id}/vote` accepts one vote per
/// person and refuses a second with a 400, so the options stop being
/// controls the moment one is chosen. Results are shown only after
/// voting or after the poll has ended - the same rule the website uses,
/// which keeps early answers from steering later ones.
struct PollCard: View {

    let poll: Poll

    @EnvironmentObject private var session: SessionController
    @EnvironmentObject private var interactions: PostInteractionStore

    private var state: PollVote { interactions.state(for: poll) }

    /// Voting needs a session (the route answers 401 without one), an
    /// unvoted poll, and one that has not closed.
    private var canVote: Bool {
        session.currentUser != nil
            && state.chosenOption == nil
            && !poll.hasEnded
            && !state.isVoting
    }

    /// Counts are revealed once the viewer has voted or the poll has
    /// closed - never before.
    private var showsResults: Bool {
        state.chosenOption != nil || poll.hasEnded
    }

    var body: some View {
        VStack(alignment: .leading, spacing: ZrpSpacing.sm) {
            Text(verbatim: poll.question)
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(ZrpColor.onSurface)
                .fixedSize(horizontal: false, vertical: true)

            ForEach(Array(poll.options.enumerated()), id: \.offset) { index, option in
                optionRow(index: index, option: option)
            }

            if let message = state.errorMessage {
                Text(verbatim: message)
                    .font(.caption)
                    .foregroundStyle(ZrpColor.red)
            }

            footer
        }
        .padding(ZrpSpacing.md)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(ZrpColor.surfaceHighest)
        .clipShape(RoundedRectangle(cornerRadius: ZrpRadius.md, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: ZrpRadius.md, style: .continuous)
                .strokeBorder(ZrpColor.outline, lineWidth: 1)
        )
    }

    private func optionRow(index: Int, option: String) -> some View {
        let isChosen = state.chosenOption == index
        let percent = state.percent(forOption: index)

        return Button {
            interactions.vote(on: poll, optionIndex: index)
        } label: {
            HStack(spacing: ZrpSpacing.sm) {
                Text(verbatim: option)
                    .font(.subheadline)
                    .foregroundStyle(ZrpColor.onSurface)
                    .multilineTextAlignment(.leading)
                Spacer(minLength: ZrpSpacing.sm)
                if showsResults {
                    Text(verbatim: "\(percent)%")
                        .font(.caption.monospacedDigit())
                        .foregroundStyle(ZrpColor.onSurfaceMuted)
                }
                if isChosen {
                    Image(systemName: "checkmark.circle.fill")
                        .font(.caption)
                        .foregroundStyle(ZrpColor.blue)
                }
            }
            .padding(.horizontal, ZrpSpacing.md)
            .frame(minHeight: ZrpMetrics.minTouchTarget)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(alignment: .leading) {
                // The filled bar is drawn only alongside the numbers it
                // represents, so an unvoted poll gives nothing away.
                if showsResults {
                    GeometryReader { proxy in
                        Rectangle()
                            .fill(ZrpColor.blue.opacity(isChosen ? 0.25 : 0.12))
                            .frame(width: proxy.size.width * CGFloat(percent) / 100)
                    }
                }
            }
            .background(ZrpColor.surface)
            .clipShape(RoundedRectangle(cornerRadius: ZrpRadius.sm, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: ZrpRadius.sm, style: .continuous)
                    .strokeBorder(isChosen ? ZrpColor.blue : ZrpColor.outline, lineWidth: 1)
            )
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .disabled(!canVote)
        .accessibilityElement(children: .combine)
        .accessibilityAddTraits(isChosen ? [.isButton, .isSelected] : .isButton)
        .accessibilityValue(
            showsResults
                ? Text(verbatim: "\(percent)%")
                : Text(verbatim: "")
        )
    }

    private var footer: some View {
        HStack(spacing: ZrpSpacing.sm) {
            Text(verbatim: CountFormatting.exact(state.total))
                .font(.caption.monospacedDigit())
                .foregroundStyle(ZrpColor.onSurfaceMuted)
            Text(.iosPollVotes)
                .font(.caption)
                .foregroundStyle(ZrpColor.onSurfaceMuted)

            Spacer(minLength: 0)

            if poll.hasEnded {
                Text(.iosPollEnded)
                    .font(.caption)
                    .foregroundStyle(ZrpColor.onSurfaceMuted)
            } else if let expiresAt = poll.expiresAt {
                Text(.iosPollEnds, ["date": expiresAt.formatted(date: .abbreviated, time: .omitted)])
                    .font(.caption)
                    .foregroundStyle(ZrpColor.onSurfaceMuted)
            }

            if state.isVoting {
                ProgressView()
                    .tint(ZrpColor.onSurfaceMuted)
            }
        }
    }
}
