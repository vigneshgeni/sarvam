import AVFoundation
import Foundation
import MediaPlayer
import ActivityKit

public final class SarvamAudioPlayer: NSObject {
    public static let shared = SarvamAudioPlayer()

    private var player: AVPlayer?
    private var timeObserverToken: Any?
    private var isConfigured = false

    public private(set) var isPlaying = false
    public private(set) var currentPosition: Double = 0
    public private(set) var totalDuration: Double = 90
    public private(set) var currentTitle = "Your document"
    public private(set) var currentLanguageLabel = "English"
    public private(set) var hasEnded = false
    public private(set) var playbackRate: Float = 1.0
    public var isActive: Bool { player != nil }

    public var onPlaybackProgress: ((Double, Double, Bool) -> Void)?
    public var onPlaybackEnded: (() -> Void)?

    /// The iOS system media player (Lock Screen / Control Center "Now Playing") is turned off:
    /// Sarvam shows its own Listen Live Activity instead, and two players at once was confusing.
    public static let showsSystemNowPlaying = false
    private static let rateKey = "sarvam.listenRate"

    private override init() {
        super.init()
        let savedRate = UserDefaults.standard.float(forKey: Self.rateKey)
        if savedRate >= 0.5 && savedRate <= 2.0 { playbackRate = savedRate }
        setupAudioSession()
        setupRemoteCommands()
        setupInterruptionObserver()
        setupRouteChangeObserver()
    }

    private func setupAudioSession() {
        do {
            let session = AVAudioSession.sharedInstance()
            try session.setCategory(.playback, mode: .spokenAudio, options: [])
            try session.setActive(true)
            SarvamNativeLogger.info("[Audio] AudioSession setCategory .playback mode .spokenAudio SUCCESS")
        } catch {
            SarvamNativeLogger.error("[Audio] Failed to activate AVAudioSession: \(error.localizedDescription)")
        }
    }

    private func setupRouteChangeObserver() {
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(handleRouteChange),
            name: AVAudioSession.routeChangeNotification,
            object: nil
        )
    }

    @objc private func handleRouteChange(notification: Notification) {
        guard let userInfo = notification.userInfo,
              let reasonValue = userInfo[AVAudioSessionRouteChangeReasonKey] as? UInt,
              let reason = AVAudioSession.RouteChangeReason(rawValue: reasonValue) else {
            return
        }
        SarvamNativeLogger.info("[Audio] Route change notification received: reason=\(reasonValue)")
        switch reason {
        case .oldDeviceUnavailable:
            SarvamNativeLogger.info("[Audio] Audio output device disconnected (e.g. headphones unplugged); pausing playback")
            pause()
        case .newDeviceAvailable:
            SarvamNativeLogger.info("[Audio] New audio output device connected")
        default:
            break
        }
    }

    private func setupInterruptionObserver() {
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(handleInterruption),
            name: AVAudioSession.interruptionNotification,
            object: nil
        )
    }

    @objc private func handleInterruption(notification: Notification) {
        guard let userInfo = notification.userInfo,
              let typeValue = userInfo[AVAudioSessionInterruptionTypeKey] as? UInt,
              let type = AVAudioSession.InterruptionType(rawValue: typeValue) else {
            return
        }

        switch type {
        case .began:
            SarvamNativeLogger.info("[Audio] Audio interruption BEGAN (e.g. phone call/Siri); pausing playback")
            pause()
        case .ended:
            let optionsValue = userInfo[AVAudioSessionInterruptionOptionKey] as? UInt ?? 0
            let options = AVAudioSession.InterruptionOptions(rawValue: optionsValue)
            let shouldResume = options.contains(.shouldResume)
            SarvamNativeLogger.info("[Audio] Audio interruption ENDED: shouldResume=\(shouldResume)")
            if shouldResume {
                resume()
            }
        @unknown default:
            break
        }
    }

    private func setupRemoteCommands() {
        let commandCenter = MPRemoteCommandCenter.shared()
        guard Self.showsSystemNowPlaying else {
            for command in [commandCenter.playCommand, commandCenter.pauseCommand, commandCenter.togglePlayPauseCommand,
                            commandCenter.skipBackwardCommand, commandCenter.skipForwardCommand,
                            commandCenter.changePlaybackPositionCommand] as [MPRemoteCommand] {
                command.isEnabled = false
            }
            MPNowPlayingInfoCenter.default().nowPlayingInfo = nil
            return
        }

        commandCenter.playCommand.isEnabled = true
        commandCenter.playCommand.addTarget { [weak self] _ in
            self?.resume()
            return .success
        }

        commandCenter.pauseCommand.isEnabled = true
        commandCenter.pauseCommand.addTarget { [weak self] _ in
            self?.pause()
            return .success
        }

        commandCenter.togglePlayPauseCommand.isEnabled = true
        commandCenter.togglePlayPauseCommand.addTarget { [weak self] _ in
            guard let self = self else { return .commandFailed }
            if self.isPlaying {
                self.pause()
            } else {
                self.resume()
            }
            return .success
        }

        commandCenter.skipBackwardCommand.isEnabled = true
        commandCenter.skipBackwardCommand.preferredIntervals = [10]
        commandCenter.skipBackwardCommand.addTarget { [weak self] _ in
            self?.skip(seconds: -10)
            return .success
        }

        commandCenter.skipForwardCommand.isEnabled = true
        commandCenter.skipForwardCommand.preferredIntervals = [10]
        commandCenter.skipForwardCommand.addTarget { [weak self] _ in
            self?.skip(seconds: 10)
            return .success
        }

        commandCenter.changePlaybackPositionCommand.isEnabled = true
        commandCenter.changePlaybackPositionCommand.addTarget { [weak self] event in
            guard let posEvent = event as? MPChangePlaybackPositionCommandEvent else {
                return .commandFailed
            }
            self?.seek(to: posEvent.positionTime)
            return .success
        }
    }

    private func updateNowPlayingInfo() {
        guard Self.showsSystemNowPlaying else { return }
        var info = [String: Any]()
        info[MPMediaItemPropertyTitle] = currentTitle
        info[MPMediaItemPropertyArtist] = "Sarvam"
        info[MPMediaItemPropertyAlbumTitle] = currentLanguageLabel
        info[MPMediaItemPropertyPlaybackDuration] = totalDuration
        info[MPNowPlayingInfoPropertyElapsedPlaybackTime] = currentPosition
        info[MPNowPlayingInfoPropertyPlaybackRate] = isPlaying ? Double(playbackRate) : 0.0

        MPNowPlayingInfoCenter.default().nowPlayingInfo = info
    }

    public func play(
        url: URL? = nil,
        audioBase64: String? = nil,
        title: String = "Your document",
        langLabel: String = "English",
        duration: Double = 90,
        startPosition: Double = 0,
        autoStart: Bool = true
    ) {
        hasEnded = false
        currentTitle = title
        currentLanguageLabel = langLabel
        totalDuration = duration > 0 ? duration : 90
        currentPosition = max(0, min(startPosition, totalDuration))

        SarvamNativeLogger.info("[Audio] play() called: title=\(title) lang=\(langLabel) duration=\(totalDuration)s startPos=\(currentPosition)s hasBase64=\(audioBase64 != nil) hasUrl=\(url != nil)")

        // Clean up previous observer
        if let token = timeObserverToken, let p = player {
            p.removeTimeObserver(token)
            timeObserverToken = nil
        }

        var playerItem: AVPlayerItem?

        if let audioBase64 = audioBase64 {
            let cleanBase64 = audioBase64.components(separatedBy: ",").last ?? audioBase64
            if let data = Data(base64Encoded: cleanBase64) {
                let isMp3 = data.count > 3 && (data[0] == 0xFF && (data[1] & 0xE0) == 0xE0 || data.starts(with: "ID3".data(using: .utf8)!))
                let ext = isMp3 ? "mp3" : "wav"
                let tempUrl = FileManager.default.temporaryDirectory.appendingPathComponent("sarvam_playback.\(ext)")
                try? data.write(to: tempUrl)
                playerItem = AVPlayerItem(url: tempUrl)
                SarvamNativeLogger.info("[Audio] Decoded audio base64: \(data.count) bytes (detected format: .\(ext))")
            } else {
                SarvamNativeLogger.error("[Audio] Failed to decode base64 audio string (\(cleanBase64.count) chars)")
            }
        } else if let url = url {
            playerItem = AVPlayerItem(url: url)
            if url.isFileURL {
                // Real duration of the downloaded TTS file (the UI and the Live Activity use it).
                let asset = AVURLAsset(url: url)
                let secs = CMTimeGetSeconds(asset.duration)
                if secs.isFinite && secs > 0 {
                    totalDuration = secs
                    currentPosition = max(0, min(startPosition, secs))
                }
                SarvamNativeLogger.info("[Audio] Playing local file \(url.lastPathComponent) duration=\(totalDuration)s")
            } else {
                SarvamNativeLogger.info("[Audio] Using audio stream URL: \(url.absoluteString)")
            }
        }

        // If no URL or data was passed, create a dummy 90-second silence asset for Simulator
        if playerItem == nil {
            let dummyUrl = FileManager.default.temporaryDirectory.appendingPathComponent("sarvam_dummy_silent.wav")
            createDummyWavFile(at: dummyUrl, durationSeconds: totalDuration)
            playerItem = AVPlayerItem(url: dummyUrl)
            SarvamNativeLogger.info("[Audio] Created dummy silent audio asset for testing")
        }

        guard let item = playerItem else {
            SarvamNativeLogger.error("[Audio] Failed to create AVPlayerItem")
            return
        }

        player = AVPlayer(playerItem: item)

        NotificationCenter.default.removeObserver(self, name: .AVPlayerItemDidPlayToEndTime, object: nil)
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(playerDidFinishPlaying),
            name: .AVPlayerItemDidPlayToEndTime,
            object: item
        )

        NotificationCenter.default.removeObserver(self, name: .AVPlayerItemFailedToPlayToEndTime, object: nil)
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(playerItemFailedToPlay),
            name: .AVPlayerItemFailedToPlayToEndTime,
            object: item
        )

        let interval = CMTime(seconds: 0.5, preferredTimescale: CMTimeScale(NSEC_PER_SEC))
        timeObserverToken = player?.addPeriodicTimeObserver(forInterval: interval, queue: .main) { [weak self] time in
            guard let self = self else { return }
            self.currentPosition = time.seconds
            self.updateNowPlayingInfo()
            self.onPlaybackProgress?(self.currentPosition, self.totalDuration, self.isPlaying)
        }

        if currentPosition > 0 {
            player?.seek(to: CMTime(seconds: currentPosition, preferredTimescale: 600))
        }

        if autoStart {
            player?.play()
            player?.rate = playbackRate
            isPlaying = true
            SarvamNativeLogger.info("[Audio] AVPlayer started playback at \(currentPosition)s rate=\(playbackRate)")
        } else {
            isPlaying = false
            SarvamNativeLogger.info("[Audio] AVPlayer loaded (not started) at \(currentPosition)s")
        }
        updateNowPlayingInfo()
        onPlaybackProgress?(currentPosition, totalDuration, isPlaying)
    }

    public func setRate(_ rate: Float) {
        let clamped = max(0.5, min(rate, 2.0))
        playbackRate = clamped
        UserDefaults.standard.set(clamped, forKey: Self.rateKey)
        if isPlaying {
            player?.rate = clamped
        }
        updateNowPlayingInfo()
        onPlaybackProgress?(currentPosition, totalDuration, isPlaying)
    }

    public func pause() {
        SarvamNativeLogger.info("[Audio] pause() called at \(currentPosition)s")
        player?.pause()
        isPlaying = false
        updateNowPlayingInfo()
        onPlaybackProgress?(currentPosition, totalDuration, isPlaying)
    }

    public func resume() {
        SarvamNativeLogger.info("[Audio] resume() called at \(currentPosition)s")
        setupAudioSession()
        if hasEnded {
            // Replay after the audio finished.
            hasEnded = false
            currentPosition = 0
            player?.seek(to: .zero)
        }
        player?.play()
        player?.rate = playbackRate
        isPlaying = true
        updateNowPlayingInfo()
        onPlaybackProgress?(currentPosition, totalDuration, isPlaying)
    }

    public func skip(seconds: Double) {
        // Use the player's real position (the cached one can lag a tick behind, and a stale value
        // once sent +10 s straight to the end).
        if let t = player?.currentTime().seconds, t.isFinite, t >= 0 { currentPosition = t }
        let newPos = max(0, min(currentPosition + seconds, max(0, totalDuration - 0.25)))
        SarvamNativeLogger.info("[Audio] skip(\(seconds)s) to \(newPos)s")
        seek(to: newPos)
    }

    public func seek(to position: Double) {
        seek(to: position, fast: false, completion: nil)
    }

    /// `fast` is for live seeking while a finger drags the in-app ruler: older pending seeks are
    /// dropped so the voice follows the finger. A normal seek is sample-exact (WAV is cheap to seek).
    public func seek(to position: Double, fast: Bool, completion: (() -> Void)?) {
        let clamped = max(0, min(position, max(0, totalDuration - 0.25)))
        currentPosition = clamped
        // A seek after the end must not make the next Play restart from 0:00.
        hasEnded = false
        if !fast { SarvamNativeLogger.info("[Audio] seek(to: \(clamped)s)") }
        let target = CMTime(seconds: clamped, preferredTimescale: 600)
        guard let player = player else {
            onPlaybackProgress?(currentPosition, totalDuration, isPlaying)
            completion?()
            return
        }
        if fast { player.currentItem?.cancelPendingSeeks() }
        let tolerance = fast ? CMTime(seconds: 0.05, preferredTimescale: 600) : .zero
        player.seek(to: target, toleranceBefore: tolerance, toleranceAfter: tolerance) { [weak self] _ in
            DispatchQueue.main.async {
                guard let self = self else { completion?(); return }
                if !fast, let t = self.player?.currentTime().seconds, t.isFinite, t >= 0 {
                    self.currentPosition = t
                }
                self.onPlaybackProgress?(self.currentPosition, self.totalDuration, self.isPlaying)
                completion?()
            }
        }
        updateNowPlayingInfo()
        onPlaybackProgress?(currentPosition, totalDuration, isPlaying)
    }

    public func stop() {
        SarvamNativeLogger.info("[Audio] stop() called")
        player?.pause()
        if let token = timeObserverToken, let p = player {
            p.removeTimeObserver(token)
            timeObserverToken = nil
        }
        player = nil
        isPlaying = false
        hasEnded = false
        currentPosition = 0
        MPNowPlayingInfoCenter.default().nowPlayingInfo = nil
        onPlaybackProgress?(0, totalDuration, false)
    }

    @objc private func playerDidFinishPlaying() {
        SarvamNativeLogger.info("[Audio] playerDidFinishPlaying reached end of track (\(totalDuration)s)")
        isPlaying = false
        hasEnded = true
        currentPosition = totalDuration
        updateNowPlayingInfo()
        onPlaybackProgress?(totalDuration, totalDuration, false)
        onPlaybackEnded?()
    }

    @objc private func playerItemFailedToPlay(notification: Notification) {
        let errDesc = (notification.userInfo?[AVPlayerItemFailedToPlayToEndTimeErrorKey] as? Error)?.localizedDescription ?? "unknown error"
        SarvamNativeLogger.error("[Audio] AVPlayerItemFailedToPlayToEndTime: \(errDesc)")
    }

    private func createDummyWavFile(at url: URL, durationSeconds: Double) {
        // Minimal valid 16-bit 44.1kHz mono WAV header with silence
        let sampleRate: Int32 = 44100
        let channels: Int16 = 1
        let bitsPerSample: Int16 = 16
        let numSamples = Int32(durationSeconds * Double(sampleRate))
        let subChunk2Size = numSamples * Int32(channels) * Int32(bitsPerSample / 8)
        let chunkSize = 36 + subChunk2Size

        var data = Data()
        data.append("RIFF".data(using: .utf8)!)
        data.append(withUnsafeBytes(of: chunkSize.littleEndian) { Data($0) })
        data.append("WAVE".data(using: .utf8)!)
        data.append("fmt ".data(using: .utf8)!)
        let subchunk1Size: Int32 = 16
        data.append(withUnsafeBytes(of: subchunk1Size.littleEndian) { Data($0) })
        let audioFormat: Int16 = 1 // PCM
        data.append(withUnsafeBytes(of: audioFormat.littleEndian) { Data($0) })
        data.append(withUnsafeBytes(of: channels.littleEndian) { Data($0) })
        data.append(withUnsafeBytes(of: sampleRate.littleEndian) { Data($0) })
        let byteRate: Int32 = sampleRate * Int32(channels) * Int32(bitsPerSample / 8)
        data.append(withUnsafeBytes(of: byteRate.littleEndian) { Data($0) })
        let blockAlign: Int16 = channels * (bitsPerSample / 8)
        data.append(withUnsafeBytes(of: blockAlign.littleEndian) { Data($0) })
        data.append(withUnsafeBytes(of: bitsPerSample.littleEndian) { Data($0) })
        data.append("data".data(using: .utf8)!)
        data.append(withUnsafeBytes(of: subChunk2Size.littleEndian) { Data($0) })
        // Append silent samples
        data.append(Data(count: Int(subChunk2Size)))

        try? data.write(to: url)
    }
}


// MARK: - Spoken sentences (captions)
/// One sentence of the spoken audio with its exact start / end in seconds. The voice server sends
/// these in the X-Sarvam-Segments header (base64 JSON), measured from the stitched audio.
public struct SarvamSpeechSegment: Codable, Hashable {
    public var text: String
    public var start: Double
    public var end: Double

    public init(text: String, start: Double, end: Double) {
        self.text = text
        self.start = start
        self.end = end
    }

    public static let headerName = "X-Sarvam-Segments"

    public static func parseHeader(_ value: String?) -> [SarvamSpeechSegment] {
        guard let value = value?.trimmingCharacters(in: .whitespacesAndNewlines), !value.isEmpty,
              let data = Data(base64Encoded: value),
              let list = try? JSONDecoder().decode([SarvamSpeechSegment].self, from: data) else { return [] }
        return list.filter { !$0.text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && $0.end >= $0.start }
            .sorted { $0.start < $1.start }
    }

    /// The sentence being read at `position`: the last one that has started (the one just read stays
    /// up through the short pause before the next).
    public static func index(in segments: [SarvamSpeechSegment], at position: Double) -> Int? {
        guard !segments.isEmpty else { return nil }
        var found = 0
        for (i, seg) in segments.enumerated() where seg.start <= position + 0.05 { found = i }
        return found
    }

    /// A dim neighbour line: the first phrase that fits one line, cut at a word ("…"), like the design.
    public static func oneLine(_ text: String, maxChars: Int) -> String {
        let clean = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard clean.count > maxChars else { return clean }
        let cut = String(clean.prefix(maxChars))
        if let space = cut.lastIndex(of: " "), cut.distance(from: cut.startIndex, to: space) > maxChars / 2 {
            return String(cut[..<space]) + "…"
        }
        return cut + "…"
    }

    /// The bright line is shown whole; only a runaway sentence is shortened (Live Activity state is
    /// capped at 4 KB).
    public static func capped(_ text: String, maxChars: Int = 220) -> String {
        let clean = text.trimmingCharacters(in: .whitespacesAndNewlines)
        return clean.count > maxChars ? oneLine(clean, maxChars: maxChars) : clean
    }
}

// MARK: - Listen service
// Keeps the Listen Live Activity in step with the player (one place for every update), and plays
// a document straight from the Ready card's "Listen" button without opening the app.
// Compiled into the app and the widget extension (the intents reference it), but it only runs in
// the app process: Live Activity / audio intents perform there.
public final class SarvamListenService {
    public static let shared = SarvamListenService()

    public static let ttsBaseKey = "sarvam.ttsBase"
    public static let voiceGenderKey = "sarvam.voiceGender"
    private static let voiceIndexKey = "sarvam.voiceIndex"

    /// Id of the document whose audio the player holds (scan id, or the result title in-app).
    public var currentDocId: String?
    /// Voice / language of the audio actually loaded in the player. The Listen card always shows
    /// these (it used to show whichever update arrived last, so Female/Male could flip).
    public var currentVoiceGender: String?
    public var currentLanguageCode: String?
    public var currentLanguageLabel: String?
    /// Exact sentence timings of the loaded audio (empty when the server did not send them).
    public private(set) var currentSegments: [SarvamSpeechSegment] = []
    /// Timings of downloaded voice files, by file path, until the file is played.
    private var segmentsByPath: [String: [SarvamSpeechSegment]] = [:]
    private var lastPushedCaption: Int = -1
    private var trackedActivityId: String?
    private var state: SarvamActivityAttributes.ContentState?
    private var lastPushedPosition: Double = -100
    private var lastPushedRate: Float = 1
    private var lastPushedPhase = ""
    private var installed = false
    /// Updates are chained so they reach the Live Activity in order (no stale overwrite).
    private var pushChain: Task<Void, Never>?
    private let lock = NSLock()

    private init() {}

    /// Routes player progress into the Listen Live Activity. Safe to call more than once.
    public func install() {
        guard !installed else { return }
        installed = true
        let player = SarvamAudioPlayer.shared
        player.onPlaybackProgress = { [weak self] current, duration, isPlaying in
            self?.playerChanged(current: current, duration: duration, isPlaying: isPlaying, ended: false)
        }
        player.onPlaybackEnded = { [weak self] in
            let total = SarvamAudioPlayer.shared.totalDuration
            self?.playerChanged(current: total, duration: total, isPlaying: false, ended: true)
        }
    }

    /// The Listen activity to keep updated, with the language / voice the app is using.
    public func track(activityId: String, state: SarvamActivityAttributes.ContentState) {
        install()
        lock.lock()
        trackedActivityId = activityId
        self.state = state
        lastPushedPosition = -100
        lastPushedPhase = ""
        lock.unlock()
        if currentVoiceGender == nil { currentVoiceGender = state.voiceGender }
        UserDefaults.standard.set(state.voiceGender, forKey: Self.voiceGenderKey)
        pushNowDetached()
    }

    /// The plugin's download keeps the timings of each file it saves.
    public func rememberSegments(_ segments: [SarvamSpeechSegment], forPath path: String) {
        lock.lock()
        if segmentsByPath.count > 8 { segmentsByPath.removeAll() }
        segmentsByPath[path] = segments
        lock.unlock()
    }

    /// Called when a file starts playing: its timings become the captions.
    public func useSegments(forPath path: String?) {
        lock.lock()
        currentSegments = path.flatMap { segmentsByPath[$0] } ?? []
        lastPushedCaption = -1
        lock.unlock()
    }

    public func setSegments(_ segments: [SarvamSpeechSegment]) {
        lock.lock()
        currentSegments = segments
        lastPushedCaption = -1
        lock.unlock()
    }

    public func untrack() {
        lock.lock()
        trackedActivityId = nil
        state = nil
        lock.unlock()
        currentDocId = nil
    }

    /// Current state with the player's real position, speed, voice and the clock anchor.
    private func snapshot(ended: Bool = false) -> (SarvamActivityAttributes.ContentState, String)? {
        lock.lock()
        defer { lock.unlock() }
        guard var next = state, let activityId = trackedActivityId, next.isListenPhase else { return nil }
        let player = SarvamAudioPlayer.shared
        let rate = player.playbackRate
        let playing = player.isPlaying
        let position = ended ? player.totalDuration : player.currentPosition
        if player.isActive {
            next.phase = ended || player.hasEnded ? "finished" : (playing ? "listening" : "paused")
            next.currentTime = position
            next.duration = player.totalDuration
            next.stage = ""
        }
        next.playbackRate = Double(rate)
        next.playbackAnchor = (next.phase == "listening")
            ? Date().addingTimeInterval(-position / Double(max(0.5, rate)))
            : nil
        if let voice = currentVoiceGender { next.voiceGender = voice }
        if let code = currentLanguageCode { next.language = code }
        if let label = currentLanguageLabel { next.languageLabel = label }
        Self.applyCaptions(to: &next, segments: currentSegments, position: next.currentTime)
        state = next
        return (next, activityId)
    }

    /// Previous / current / next sentence for the Live Activity (nil fields when no timings).
    static func applyCaptions(to state: inout SarvamActivityAttributes.ContentState,
                              segments: [SarvamSpeechSegment], position: Double) {
        guard let idx = SarvamSpeechSegment.index(in: segments, at: position) else {
            state.captionIndex = nil
            state.captionPrev = nil
            state.captionNow = nil
            state.captionNext = nil
            return
        }
        // Latin text fits about 30 characters on a dim line, Indian scripts about 22.
        let width = state.language == "en" ? 30 : 22
        state.captionIndex = idx
        state.captionPrev = idx > 0 ? SarvamSpeechSegment.oneLine(segments[idx - 1].text, maxChars: width) : nil
        state.captionNow = SarvamSpeechSegment.capped(segments[idx].text)
        state.captionNext = idx + 1 < segments.count
            ? SarvamSpeechSegment.oneLine(segments[idx + 1].text, maxChars: width) : nil
    }

    private func playerChanged(current: Double, duration: Double, isPlaying: Bool, ended: Bool) {
        let rate = SarvamAudioPlayer.shared.playbackRate
        let phase = ended ? "finished" : (isPlaying ? "listening" : "paused")
        lock.lock()
        let caption = SarvamSpeechSegment.index(in: currentSegments, at: current) ?? -1
        let important = phase != lastPushedPhase || rate != lastPushedRate
            || caption != lastPushedCaption // next sentence: captions move up at once
            || abs(current - lastPushedPosition) > 2.0 // a seek / skip
        // While playing, about once a second so the centre ruler glides under the gold mark;
        // paused, any real move (a drag in the app) so the card matches at once.
        let moved = abs(current - lastPushedPosition)
        let periodic = isPlaying ? moved >= 0.95 : moved >= 0.3
        lock.unlock()
        // The time text runs on the system clock (anchor); updates move the ruler and captions.
        guard important || periodic else { return }
        guard let (next, activityId) = snapshot(ended: ended) else { return }
        lock.lock()
        lastPushedPosition = current
        lastPushedRate = rate
        lastPushedPhase = next.phase
        lastPushedCaption = next.captionIndex ?? -1
        lock.unlock()
        push(next, activityId: activityId)
    }

    private func push(_ next: SarvamActivityAttributes.ContentState, activityId: String) {
        lock.lock()
        let previous = pushChain
        let task = Task {
            await previous?.value
            guard let activity = Activity<SarvamActivityAttributes>.activities.first(where: { $0.id == activityId }) else { return }
            await activity.update(ActivityContent(state: next, staleDate: nil))
        }
        pushChain = task
        lock.unlock()
    }

    private func pushNowDetached() {
        guard let (next, activityId) = snapshot() else { return }
        lock.lock()
        lastPushedPosition = next.currentTime
        lastPushedPhase = next.phase
        lastPushedCaption = next.captionIndex ?? -1
        lock.unlock()
        push(next, activityId: activityId)
    }

    /// Called by the island / Lock Screen buttons after they act, so the card shows the new state
    /// before the tap finishes (instead of ~2 s later).
    public func pushNow() async {
        guard let (next, activityId) = snapshot() else { return }
        lock.lock()
        lastPushedPosition = next.currentTime
        lastPushedPhase = next.phase
        lastPushedRate = SarvamAudioPlayer.shared.playbackRate
        lastPushedCaption = next.captionIndex ?? -1
        let previous = pushChain
        lock.unlock()
        await previous?.value
        guard let activity = Activity<SarvamActivityAttributes>.activities.first(where: { $0.id == activityId }) else { return }
        await activity.update(ActivityContent(state: next, staleDate: nil))
    }

    /// "Listen" on the Ready card: read the saved result, fetch the voice, play, show the Listen card.
    public func startListening(docId: String) async {
        install()
        let player = SarvamAudioPlayer.shared
        if currentDocId == docId, player.isActive {
            if !player.isPlaying { await MainActor.run { player.resume() } }
            return
        }
        let all = Activity<SarvamActivityAttributes>.activities
        guard let activity = all.first(where: { $0.attributes.activityId == docId })
            ?? all.first(where: { $0.content.state.phase == "ready" }) else {
            SarvamNativeLogger.error("[Listen] No Live Activity for docId=\(docId)")
            return
        }
        var next = activity.content.state
        let lang = next.language
        let gender = UserDefaults.standard.string(forKey: Self.voiceGenderKey) ?? "female"
        next.phase = "listening"
        next.voiceGender = gender
        next.currentTime = 0
        next.duration = 0
        next.stage = "Getting the voice ready…"
        if player.isActive { await MainActor.run { player.stop() } }
        setSegments([])
        currentDocId = nil
        currentVoiceGender = gender
        currentLanguageCode = lang
        currentLanguageLabel = next.languageLabel
        track(activityId: activity.id, state: next)
        await activity.update(ActivityContent(state: next, staleDate: nil))

        guard let text = Self.speechText(docId: docId, lang: lang) else {
            await fail(activity: activity, state: next, message: "Open Sarvam to listen")
            return
        }
        guard let base = UserDefaults.standard.string(forKey: Self.ttsBaseKey),
              let url = URL(string: base.trimmingCharacters(in: CharacterSet(charactersIn: "/")) + "/api/speak") else {
            await fail(activity: activity, state: next, message: "Open Sarvam to listen")
            return
        }
        let index = (UserDefaults.standard.integer(forKey: Self.voiceIndexKey) + 1) % 3
        UserDefaults.standard.set(index, forKey: Self.voiceIndexKey)
        do {
            let started = CFAbsoluteTimeGetCurrent()
            let (file, segments) = try await Self.downloadSpeech(url: url, text: text, lang: lang, gender: gender, voiceIndex: index)
            setSegments(segments)
            SarvamNativeLogger.info("[Listen] Voice ready for docId=\(docId) in \(Int((CFAbsoluteTimeGetCurrent() - started) * 1000))ms lang=\(lang) voice=\(gender)")
            currentDocId = docId
            currentVoiceGender = gender
            currentLanguageCode = lang
            currentLanguageLabel = next.languageLabel
            let title = next.title
            let label = next.languageLabel
            await MainActor.run {
                player.play(url: file, title: title, langLabel: label, duration: 0, startPosition: 0, autoStart: true)
            }
            await pushNow()
        } catch {
            SarvamNativeLogger.error("[Listen] Voice download failed for docId=\(docId): \(error.localizedDescription)")
            await fail(activity: activity, state: next, message: "Couldn't get the voice. Open Sarvam to try again.")
        }
    }

    private func fail(activity: Activity<SarvamActivityAttributes>, state: SarvamActivityAttributes.ContentState, message: String) async {
        var next = state
        next.phase = "paused"
        next.duration = 0
        next.stage = message
        next.playbackAnchor = nil
        lock.lock()
        self.state = next
        lock.unlock()
        await activity.update(ActivityContent(state: next, staleDate: nil))
    }

    private static func downloadSpeech(url: URL, text: String, lang: String, gender: String, voiceIndex: Int) async throws -> (URL, [SarvamSpeechSegment]) {
        var request = URLRequest(url: url, cachePolicy: .reloadIgnoringLocalCacheData, timeoutInterval: 45)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        let body: [String: Any] = ["text": text, "lang": lang, "voice": gender, "rate": 1.0, "voice_index": voiceIndex]
        request.httpBody = try JSONSerialization.data(withJSONObject: body, options: [])
        let (data, response) = try await URLSession.shared.data(for: request)
        guard let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode), !data.isEmpty else {
            throw URLError(.badServerResponse)
        }
        let type = (http.value(forHTTPHeaderField: "Content-Type") ?? "audio/wav").lowercased()
        let ext = (type.contains("mpeg") || type.contains("mp3")) ? "mp3" : "wav"
        let file = FileManager.default.temporaryDirectory.appendingPathComponent("sarvam_tts_\(UUID().uuidString).\(ext)")
        try data.write(to: file)
        let segments = SarvamSpeechSegment.parseHeader(http.value(forHTTPHeaderField: SarvamSpeechSegment.headerName))
        SarvamNativeLogger.info("[Listen] Voice has \(segments.count) timed sentences")
        return (file, segments)
    }

    /// Same choice as the app's quick summary: the spoken summary, else the summary, else
    /// title + headline + first action. Only text already in the chosen language is read.
    static func speechText(docId: String, lang: String) -> String? {
        guard let dir = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask).first else { return nil }
        let file = dir.appendingPathComponent("scan_result_\(docId).json")
        guard let data = try? Data(contentsOf: file),
              let json = (try? JSONSerialization.jsonObject(with: data, options: [])) as? [String: Any] else { return nil }

        var candidates: [String] = []
        if let spoken = json["spoken_summary"] as? String { candidates.append(spoken) }
        if let summary = json["summary"] as? [String] { candidates.append(summary.joined(separator: " ")) }
        for candidate in candidates {
            let text = candidate.trimmingCharacters(in: .whitespacesAndNewlines)
            if !text.isEmpty && isInLanguage(text, lang: lang) { return prepare(text, lang: lang) }
        }
        var parts: [String] = []
        if let title = json["title"] as? String, !title.isEmpty { parts.append(title) }
        if let glance = json["glance"] as? [String: Any], let headline = glance["headline"] as? String, !headline.isEmpty {
            parts.append(headline)
        }
        if let actions = json["actions"] as? [[String: Any]], let first = actions.first?["text"] as? String, !first.isEmpty {
            parts.append(first)
        }
        let joined = parts.joined(separator: ". ")
        if !joined.isEmpty { return prepare(joined, lang: lang) }
        if let first = candidates.first(where: { !$0.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }) {
            return prepare(first, lang: lang)
        }
        return nil
    }

    private static func isInLanguage(_ text: String, lang: String) -> Bool {
        let ranges: [String: ClosedRange<UInt32>] = [
            "ta": 0x0B80...0x0BFF, "hi": 0x0900...0x097F, "mr": 0x0900...0x097F,
            "te": 0x0C00...0x0C7F, "ml": 0x0D00...0x0D7F, "kn": 0x0C80...0x0CFF,
            "bn": 0x0980...0x09FF, "or": 0x0B00...0x0B7F
        ]
        let letters = text.unicodeScalars.filter { CharacterSet.letters.contains($0) }
        guard !letters.isEmpty else { return false }
        guard let range = ranges[lang] else {
            // English: mostly Latin letters
            let latin = letters.filter { $0.value < 0x0250 }.count
            return Double(latin) >= Double(letters.count) * 0.6
        }
        let inScript = letters.filter { range.contains($0.value) }.count
        return Double(inScript) >= Double(letters.count) * 0.3
    }

    private static func prepare(_ text: String, lang: String) -> String {
        let doctor: [String: String] = [
            "en": "Doctor", "ta": "டாக்டர்", "hi": "डॉक्टर", "te": "డాక్టర్", "ml": "ഡോക്ടർ",
            "kn": "ಡಾಕ್ಟರ್", "mr": "डॉक्टर", "bn": "ডাক্তার", "or": "ଡାକ୍ତର"
        ]
        var out = text
        if let regex = try? NSRegularExpression(pattern: "\\bDr\\.?(?=\\s+\\p{L})", options: []) {
            out = regex.stringByReplacingMatches(
                in: out, options: [], range: NSRange(out.startIndex..., in: out),
                withTemplate: doctor[lang] ?? "Doctor"
            )
        }
        // /api/speak accepts up to 1,200 characters (the app keeps its script under 1,180 too).
        if out.count > 1180 {
            let cut = String(out.prefix(1180))
            if let end = cut.lastIndex(where: { ".!?।".contains($0) }), cut.distance(from: cut.startIndex, to: end) > 200 {
                out = String(cut[...end])
            } else {
                out = cut
            }
        }
        return out
    }
}
