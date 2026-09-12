import AVKit
import SwiftUI

/// The attachment inside a chat bubble, whatever kind it is.
///
/// One view for direct and group threads. The two message types differ
/// (`Message` carries reactions and replies, `GroupMessage` does not),
/// but an attachment is a URL plus the marker in `content`, and those
/// are identical - so the rendering is written once.
struct ChatAttachmentView: View {

    let url: String
    let content: String?
    let isOwn: Bool

    var body: some View {
        switch ChatAttachmentKind.of(content) {
        case .video:
            video
        case .voice:
            VoiceNoteBubble(url: url, content: content, isOwn: isOwn)
        case .document:
            document
        case .image:
            image
        }
    }

    // MARK: - Video

    private var video: some View {
        // `VideoPlayer` rather than an image with a play button: the
        // route stores a plain URL and AVKit streams it, so there is no
        // reason to build a second player.
        VideoPlayer(player: AVPlayer(url: URL(string: url) ?? URL(fileURLWithPath: "/")))
            .frame(width: 240, height: 180)
            .clipShape(RoundedRectangle(cornerRadius: ZrpRadius.md, style: .continuous))
            .accessibilityLabel(Text(.iosA11yPlayVideo))
    }

    // MARK: - Image

    private var image: some View {
        RemoteImage(url: url, targetSize: 320) {
            Rectangle().fill(ZrpColor.surfaceHighest)
        }
        .aspectRatio(contentMode: .fit)
        .frame(maxWidth: 240, maxHeight: 320)
        .clipShape(RoundedRectangle(cornerRadius: ZrpRadius.md, style: .continuous))
        .accessibilityLabel(Text(.iosA11yMessagePhoto))
    }

    // MARK: - Document

    /// A file card that opens the document in the system browser.
    ///
    /// Deliberately not an inline preview: the route accepts PDFs, text
    /// and arbitrary binaries under 8MB, and there is no viewer that
    /// handles all three. Handing it to `openURL` uses whatever the
    /// device actually has.
    @ViewBuilder
    private var document: some View {
        let name = ChatAttachmentMarker.documentName(from: content)

        Link(destination: URL(string: url) ?? URL(fileURLWithPath: "/")) {
            HStack(spacing: ZrpSpacing.sm) {
                Image(systemName: "doc.fill")
                    .font(.title3)
                if let name {
                    Text(verbatim: name)
                        .font(.subheadline.weight(.medium))
                        .lineLimit(1)
                        .truncationMode(.middle)
                } else {
                    // The marker carried no name - an older client, or a
                    // file with an empty name. The translated generic
                    // label beats a blank card.
                    Text(.chatAttachment)
                        .font(.subheadline.weight(.medium))
                }
                Image(systemName: "arrow.down.circle")
                    .font(.footnote)
            }
            .foregroundStyle(isOwn ? .white : ZrpColor.onSurface)
            .padding(.horizontal, ZrpSpacing.md)
            .padding(.vertical, ZrpSpacing.sm)
            .background(
                (isOwn ? Color.white.opacity(0.15) : ZrpColor.surfaceHighest),
                in: RoundedRectangle(cornerRadius: ZrpRadius.md, style: .continuous)
            )
        }
        .accessibilityLabel(Text(.chatAttachment))
        .accessibilityValue(Text(verbatim: name ?? ""))
    }
}

/// A voice note: play/pause, a progress bar, and its duration.
///
/// The duration comes from the message marker, so it is on screen before
/// the file has been fetched. Only the progress needs the audio itself.
struct VoiceNoteBubble: View {

    let url: String
    let content: String?
    let isOwn: Bool

    @ObservedObject private var player = VoiceNotePlayer.shared

    private var isCurrent: Bool { player.isCurrent(url) }

    var body: some View {
        HStack(spacing: ZrpSpacing.sm) {
            Button { player.toggle(url) } label: {
                if isCurrent && player.isLoading {
                    ProgressView()
                        .tint(isOwn ? .white : ZrpColor.onSurface)
                        .frame(width: 28, height: 28)
                } else {
                    Image(systemName: isCurrent && player.isPlaying ? "pause.fill" : "play.fill")
                        .font(.subheadline)
                        .frame(width: 28, height: 28)
                }
            }
            .buttonStyle(.plain)
            .foregroundStyle(isOwn ? .white : ZrpColor.onSurface)
            .accessibilityLabel(
                Text(isCurrent && player.isPlaying ? L10nKey.musicCommonPause : .musicCommonPlay)
            )

            // A plain bar rather than a waveform: a real waveform needs
            // the samples, which means downloading and decoding every
            // note in the thread whether or not anyone plays it.
            GeometryReader { geometry in
                ZStack(alignment: .leading) {
                    Capsule()
                        .fill(isOwn ? Color.white.opacity(0.3) : ZrpColor.surfaceHighest)
                    Capsule()
                        .fill(isOwn ? Color.white : ZrpColor.red)
                        .frame(width: geometry.size.width * (isCurrent ? player.progress : 0))
                }
            }
            .frame(width: 110, height: 4)

            if let duration = ChatAttachmentMarker.voiceDuration(from: content) {
                Text(verbatim: duration)
                    .font(.caption.monospacedDigit())
                    .foregroundStyle(isOwn ? .white.opacity(0.85) : ZrpColor.onSurfaceMuted)
            }
        }
        .padding(.horizontal, ZrpSpacing.sm)
        .padding(.vertical, ZrpSpacing.xs)
        .accessibilityElement(children: .combine)
    }
}
