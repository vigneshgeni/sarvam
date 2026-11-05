import AVFoundation
import Foundation
import MediaPlayer

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

    public var onPlaybackProgress: ((Double, Double, Bool) -> Void)?
    public var onPlaybackEnded: (() -> Void)?

    private override init() {
        super.init()
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
        var info = [String: Any]()
        info[MPMediaItemPropertyTitle] = currentTitle
        info[MPMediaItemPropertyArtist] = "Sarvam"
        info[MPMediaItemPropertyAlbumTitle] = currentLanguageLabel
        info[MPMediaItemPropertyPlaybackDuration] = totalDuration
        info[MPNowPlayingInfoPropertyElapsedPlaybackTime] = currentPosition
        info[MPNowPlayingInfoPropertyPlaybackRate] = isPlaying ? 1.0 : 0.0

        MPNowPlayingInfoCenter.default().nowPlayingInfo = info
    }

    public func play(
        url: URL? = nil,
        audioBase64: String? = nil,
        title: String = "Your document",
        langLabel: String = "English",
        duration: Double = 90,
        startPosition: Double = 0
    ) {
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
            SarvamNativeLogger.info("[Audio] Using audio stream URL: \(url.absoluteString)")
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

        player?.play()
        isPlaying = true
        updateNowPlayingInfo()
        SarvamNativeLogger.info("[Audio] AVPlayer started playback at \(currentPosition)s")
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
        player?.play()
        isPlaying = true
        updateNowPlayingInfo()
        onPlaybackProgress?(currentPosition, totalDuration, isPlaying)
    }

    public func skip(seconds: Double) {
        let newPos = max(0, min(currentPosition + seconds, totalDuration))
        SarvamNativeLogger.info("[Audio] skip(\(seconds)s) to \(newPos)s")
        seek(to: newPos)
    }

    public func seek(to position: Double) {
        let clamped = max(0, min(position, totalDuration))
        currentPosition = clamped
        SarvamNativeLogger.info("[Audio] seek(to: \(clamped)s)")
        player?.seek(to: CMTime(seconds: clamped, preferredTimescale: 600))
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
        currentPosition = 0
        MPNowPlayingInfoCenter.default().nowPlayingInfo = nil
        onPlaybackProgress?(0, totalDuration, false)
    }

    @objc private func playerDidFinishPlaying() {
        SarvamNativeLogger.info("[Audio] playerDidFinishPlaying reached end of track (\(totalDuration)s)")
        isPlaying = false
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
