import AVFoundation
import Combine
import Foundation
import MediaPlayer
import SwiftUI
import UIKit

/// The app's audio engine.
///
/// A real `AVPlayer` that keeps playing when the app is backgrounded or
/// the screen locks, publishes Now Playing metadata, answers the lock
/// screen and Control Center transport controls, and survives phone
/// calls and headphone unplugs. None of that is decoration: an audio app
/// that stops at the home button is not a music player.
///
/// What makes background playback actually work is three things
/// together, and all three are here:
///   1. `UIBackgroundModes: audio` in Info.plist (declared in this phase,
///      because this is the phase that earns it).
///   2. An `AVAudioSession` configured `.playback` and made active -
///      without which iOS silences the app on the ringer switch and kills
///      audio on backgrounding.
///   3. `MPRemoteCommandCenter` targets, without which the lock screen
///      controls appear but do nothing.
@MainActor
final class MusicPlayer: ObservableObject {

    enum RepeatMode: String, CaseIterable {
        case off
        case all
        case one
    }

    @Published private(set) var current: MusicTrack?
    @Published private(set) var queue: [MusicTrack] = []
    @Published private(set) var currentIndex: Int = 0
    @Published private(set) var isPlaying = false

    /// Seconds elapsed and total. `duration` prefers what AVPlayer has
    /// actually decoded over the server's stored value, since the server
    /// may have none at all.
    @Published private(set) var elapsed: Double = 0
    @Published private(set) var duration: Double = 0

    @Published var repeatMode: RepeatMode = .off
    @Published private(set) var isShuffled = false

    /// True while the expanded player is presented.
    @Published var isExpanded = false

    private let player = AVPlayer()
    private let repository: MusicRepositoryProtocol

    /// The queue as it was before shuffling, so turning shuffle off
    /// restores the real order rather than leaving a scrambled list.
    private var unshuffledQueue: [MusicTrack] = []

    private var timeObserver: Any?
    private var itemEndObserver: NSObjectProtocol?
    private var interruptionObserver: NSObjectProtocol?
    private var routeChangeObserver: NSObjectProtocol?

    /// How much of the current track has actually been heard, for the
    /// play report. Accumulated rather than read from `elapsed` so a
    /// seek backwards does not erase listening time.
    private var secondsHeard: Double = 0
    private var lastObservedTime: Double = 0
    private var hasReportedPlay = false

    init(repository: MusicRepositoryProtocol = MusicRepository()) {
        self.repository = repository
        configureAudioSession()
        configureRemoteCommands()
        observePlayer()
        observeSystemEvents()
    }

    deinit {
        // Observers are removed rather than left dangling; a stale time
        // observer on a deallocated player traps.
        if let timeObserver { player.removeTimeObserver(timeObserver) }
        for observer in [itemEndObserver, interruptionObserver, routeChangeObserver] {
            if let observer { NotificationCenter.default.removeObserver(observer) }
        }
    }

    // MARK: - Session

    /// `.playback` is what allows audio to continue in the background and
    /// with the ringer switch silenced - the correct category for a music
    /// player, and the wrong one for, say, a UI sound effect.
    private func configureAudioSession() {
        let session = AVAudioSession.sharedInstance()
        do {
            try session.setCategory(.playback, mode: .default)
            try session.setActive(true)
        } catch {
            ZrpLog.error("Audio session could not be configured; playback may not survive backgrounding")
        }
    }

    // MARK: - Playback

    /// Starts a queue at `index`.
    ///
    /// Tracks with no usable `audioUrl` are dropped rather than queued:
    /// a row that silently fails to play is worse than one that is not
    /// offered.
    func play(_ tracks: [MusicTrack], startingAt index: Int) {
        let playable = tracks.filter(\.isPlayable)
        guard !playable.isEmpty else { return }

        let startId = tracks.indices.contains(index) ? tracks[index].id : nil
        let resolvedIndex = startId.flatMap { id in
            playable.firstIndex(where: { $0.id == id })
        } ?? 0

        unshuffledQueue = playable
        queue = isShuffled ? Self.shuffled(playable, keepingFirst: resolvedIndex) : playable
        currentIndex = isShuffled ? 0 : resolvedIndex
        loadCurrent(autoPlay: true)
    }

    func togglePlayPause() {
        isPlaying ? pause() : resume()
    }

    func resume() {
        guard current != nil else { return }
        player.play()
        isPlaying = true
        updateNowPlaying()
    }

    func pause() {
        player.pause()
        isPlaying = false
        updateNowPlaying()
    }

    /// Stops playback and empties the queue.
    ///
    /// Called when the session ends: what the previous viewer was
    /// listening to must not keep playing - or stay on the lock screen -
    /// for whoever signs in next. The outgoing track is still reported
    /// first, so a listen already earned is not lost.
    func reset() {
        reportPlayIfNeeded(completed: false)
        player.pause()
        player.replaceCurrentItem(with: nil)
        isPlaying = false
        isExpanded = false
        current = nil
        queue = []
        unshuffledQueue = []
        currentIndex = 0
        elapsed = 0
        duration = 0
        secondsHeard = 0
        lastObservedTime = 0
        hasReportedPlay = false
        updateNowPlaying()
    }

    func next() {
        // Repeat-one still advances on an explicit skip: the listener
        // asked for the next track, not for the same one again.
        guard !queue.isEmpty else { return }

        if currentIndex + 1 < queue.count {
            currentIndex += 1
            loadCurrent(autoPlay: true)
        } else if repeatMode == .all {
            currentIndex = 0
            loadCurrent(autoPlay: true)
        } else {
            // End of queue: stop at the last track rather than silently
            // clearing the player, so the UI still shows what was played.
            pause()
            seek(to: 0)
        }
    }

    func previous() {
        guard !queue.isEmpty else { return }

        // Restart the current track when more than a few seconds in -
        // the near-universal transport convention.
        if elapsed > 3 {
            seek(to: 0)
            return
        }

        if currentIndex > 0 {
            currentIndex -= 1
            loadCurrent(autoPlay: true)
        } else if repeatMode == .all {
            currentIndex = queue.count - 1
            loadCurrent(autoPlay: true)
        } else {
            seek(to: 0)
        }
    }

    func seek(to seconds: Double) {
        let clamped = max(0, min(seconds, duration > 0 ? duration : seconds))
        player.seek(
            to: CMTime(seconds: clamped, preferredTimescale: 600),
            toleranceBefore: .zero,
            toleranceAfter: .zero
        )
        elapsed = clamped
        lastObservedTime = clamped
        updateNowPlaying()
    }

    func toggleShuffle() {
        isShuffled.toggle()
        guard let currentTrack = current else { return }

        if isShuffled {
            unshuffledQueue = queue
            queue = Self.shuffled(queue, keepingFirst: currentIndex)
            currentIndex = 0
        } else {
            queue = unshuffledQueue
            currentIndex = queue.firstIndex(where: { $0.id == currentTrack.id }) ?? 0
        }
    }

    func cycleRepeatMode() {
        switch repeatMode {
        case .off: repeatMode = .all
        case .all: repeatMode = .one
        case .one: repeatMode = .off
        }
    }

    /// Moves to a specific queue entry - what tapping a row in the queue
    /// screen does.
    func jump(to index: Int) {
        guard queue.indices.contains(index) else { return }
        currentIndex = index
        loadCurrent(autoPlay: true)
    }

    private static func shuffled(_ tracks: [MusicTrack], keepingFirst index: Int) -> [MusicTrack] {
        guard tracks.indices.contains(index) else { return tracks.shuffled() }
        var rest = tracks
        let pinned = rest.remove(at: index)
        return [pinned] + rest.shuffled()
    }

    // MARK: - Loading

    private func loadCurrent(autoPlay: Bool) {
        guard queue.indices.contains(currentIndex) else { return }

        // Report the outgoing track before switching away from it.
        reportPlayIfNeeded(completed: false)

        let track = queue[currentIndex]
        current = track
        secondsHeard = 0
        lastObservedTime = 0
        hasReportedPlay = false
        elapsed = 0
        duration = Double(track.durationSec ?? 0)

        guard let url = URL(string: track.audioUrl) else { return }
        let item = AVPlayerItem(url: url)
        player.replaceCurrentItem(with: item)

        if autoPlay {
            player.play()
            isPlaying = true
        }

        // Read the real decoded duration. The server's stored value can
        // be missing entirely, and what is reported back repairs it for
        // everyone - see MusicRepository.reportPlay.
        Task { [weak self] in
            guard
                let loaded = try? await item.asset.load(.duration)
            else { return }
            let seconds = CMTimeGetSeconds(loaded)
            guard seconds.isFinite, seconds > 0 else { return }
            await MainActor.run {
                guard let self, self.current?.id == track.id else { return }
                self.duration = seconds
                self.updateNowPlaying()
            }
        }

        updateNowPlaying()
        loadArtwork(for: track)
    }

    // MARK: - Observation

    private func observePlayer() {
        timeObserver = player.addPeriodicTimeObserver(
            forInterval: CMTime(seconds: 0.5, preferredTimescale: 600),
            queue: .main
        ) { [weak self] time in
            MainActor.assumeIsolated {
                guard let self else { return }
                let seconds = CMTimeGetSeconds(time)
                guard seconds.isFinite else { return }

                // Accumulate only forward movement, so seeking backwards
                // does not erase time genuinely listened to.
                let delta = seconds - self.lastObservedTime
                if delta > 0, delta < 2 { self.secondsHeard += delta }
                self.lastObservedTime = seconds
                self.elapsed = seconds

                // A play is worth reporting once the listener has stayed
                // long enough to mean it, not the instant playback starts.
                if !self.hasReportedPlay, self.secondsHeard >= 5 {
                    self.hasReportedPlay = true
                    self.reportPlayIfNeeded(completed: false, force: true)
                }
            }
        }

        itemEndObserver = NotificationCenter.default.addObserver(
            forName: .AVPlayerItemDidPlayToEndTime,
            object: nil,
            queue: .main
        ) { [weak self] _ in
            MainActor.assumeIsolated {
                self?.handleTrackFinished()
            }
        }
    }

    private func handleTrackFinished() {
        reportPlayIfNeeded(completed: true, force: true)

        if repeatMode == .one {
            seek(to: 0)
            player.play()
            isPlaying = true
            return
        }
        next()
    }

    /// Interruptions (a phone call, Siri) and route changes (headphones
    /// unplugged) are real conditions a music player has to handle. iOS
    /// pauses the audio itself; without these the UI would keep claiming
    /// to be playing, and audio would blare from the speaker the moment
    /// headphones are pulled.
    private func observeSystemEvents() {
        interruptionObserver = NotificationCenter.default.addObserver(
            forName: AVAudioSession.interruptionNotification,
            object: nil,
            queue: .main
        ) { [weak self] notification in
            MainActor.assumeIsolated {
                guard
                    let self,
                    let info = notification.userInfo,
                    let rawType = info[AVAudioSessionInterruptionTypeKey] as? UInt,
                    let type = AVAudioSession.InterruptionType(rawValue: rawType)
                else { return }

                switch type {
                case .began:
                    self.isPlaying = false
                    self.updateNowPlaying()
                case .ended:
                    // Only resume when the system says it is appropriate -
                    // barging back in after every interruption is exactly
                    // the behaviour users hate.
                    guard
                        let rawOptions = info[AVAudioSessionInterruptionOptionKey] as? UInt,
                        AVAudioSession.InterruptionOptions(rawValue: rawOptions).contains(.shouldResume)
                    else { return }
                    self.resume()
                @unknown default:
                    break
                }
            }
        }

        routeChangeObserver = NotificationCenter.default.addObserver(
            forName: AVAudioSession.routeChangeNotification,
            object: nil,
            queue: .main
        ) { [weak self] notification in
            MainActor.assumeIsolated {
                guard
                    let self,
                    let info = notification.userInfo,
                    let rawReason = info[AVAudioSessionRouteChangeReasonKey] as? UInt,
                    let reason = AVAudioSession.RouteChangeReason(rawValue: rawReason)
                else { return }

                // Headphones pulled: pause, the way every other audio app
                // does, rather than switching to the speaker mid-track.
                if reason == .oldDeviceUnavailable {
                    self.pause()
                }
            }
        }
    }

    // MARK: - Reporting

    private func reportPlayIfNeeded(completed: Bool, force: Bool = false) {
        guard let track = current else { return }
        guard force || secondsHeard >= 5 else { return }

        let seconds = Int(secondsHeard)
        let reportedDuration = duration > 0 ? Int(duration.rounded()) : track.durationSec

        Task { [repository] in
            // A failed report costs a play count and a history row; it is
            // not worth interrupting playback over.
            try? await repository.reportPlay(
                trackId: track.id,
                durationSec: reportedDuration,
                secondsPlayed: seconds,
                completed: completed
            )
        }
    }

    // MARK: - Now Playing / remote commands

    private func updateNowPlaying() {
        guard let track = current else {
            MPNowPlayingInfoCenter.default().nowPlayingInfo = nil
            return
        }

        var info = MPNowPlayingInfoCenter.default().nowPlayingInfo ?? [:]
        info[MPMediaItemPropertyTitle] = track.title
        info[MPMediaItemPropertyArtist] = track.artistName
        info[MPMediaItemPropertyAlbumTitle] = track.album?.title
        info[MPMediaItemPropertyPlaybackDuration] = duration
        info[MPNowPlayingInfoPropertyElapsedPlaybackTime] = elapsed
        info[MPNowPlayingInfoPropertyPlaybackRate] = isPlaying ? 1.0 : 0.0
        MPNowPlayingInfoCenter.default().nowPlayingInfo = info
    }

    /// Artwork is fetched separately and merged in when it arrives, so
    /// the lock screen shows the title immediately rather than waiting on
    /// an image download.
    private func loadArtwork(for track: MusicTrack) {
        guard let raw = track.artworkURL, let url = URL(string: raw) else { return }

        Task { [weak self] in
            guard
                let (data, _) = try? await URLSession.shared.data(from: url),
                let image = UIImage(data: data)
            else { return }

            await MainActor.run {
                guard let self, self.current?.id == track.id else { return }
                var info = MPNowPlayingInfoCenter.default().nowPlayingInfo ?? [:]
                info[MPMediaItemPropertyArtwork] = MPMediaItemArtwork(boundsSize: image.size) { _ in
                    image
                }
                MPNowPlayingInfoCenter.default().nowPlayingInfo = info
            }
        }
    }

    private func configureRemoteCommands() {
        let center = MPRemoteCommandCenter.shared()

        center.playCommand.addTarget { [weak self] _ in
            guard let self else { return .commandFailed }
            self.resume()
            return .success
        }
        center.pauseCommand.addTarget { [weak self] _ in
            guard let self else { return .commandFailed }
            self.pause()
            return .success
        }
        center.togglePlayPauseCommand.addTarget { [weak self] _ in
            guard let self else { return .commandFailed }
            self.togglePlayPause()
            return .success
        }
        center.nextTrackCommand.addTarget { [weak self] _ in
            guard let self else { return .commandFailed }
            self.next()
            return .success
        }
        center.previousTrackCommand.addTarget { [weak self] _ in
            guard let self else { return .commandFailed }
            self.previous()
            return .success
        }
        center.changePlaybackPositionCommand.addTarget { [weak self] event in
            guard
                let self,
                let positionEvent = event as? MPChangePlaybackPositionCommandEvent
            else { return .commandFailed }
            self.seek(to: positionEvent.positionTime)
            return .success
        }
    }
}
