import AppIntents
import Foundation

@available(iOS 17.0, *)
public struct PlayPauseIntent: LiveActivityIntent {
    public static var title: LocalizedStringResource = "Play or Pause Listen Audio"
    public static var isDiscoverable: Bool = false

    public init() {}

    public func perform() async throws -> some IntentResult {
        // Toggle playback on the shared player
        if SarvamAudioPlayer.shared.isPlaying {
            SarvamAudioPlayer.shared.pause()
        } else {
            SarvamAudioPlayer.shared.resume()
        }
        return .result()
    }
}

@available(iOS 17.0, *)
public struct SkipBackwardIntent: LiveActivityIntent {
    public static var title: LocalizedStringResource = "Skip Back 10 Seconds"
    public static var isDiscoverable: Bool = false

    public init() {}

    public func perform() async throws -> some IntentResult {
        SarvamAudioPlayer.shared.skip(seconds: -10)
        return .result()
    }
}

@available(iOS 17.0, *)
public struct SkipForwardIntent: LiveActivityIntent {
    public static var title: LocalizedStringResource = "Skip Forward 10 Seconds"
    public static var isDiscoverable: Bool = false

    public init() {}

    public func perform() async throws -> some IntentResult {
        SarvamAudioPlayer.shared.skip(seconds: 10)
        return .result()
    }
}

@available(iOS 17.0, *)
public struct CancelScanIntent: LiveActivityIntent {
    public static var title: LocalizedStringResource = "Cancel Document Analysis"
    public static var isDiscoverable: Bool = false

    public init() {}

    public func perform() async throws -> some IntentResult {
        NotificationCenter.default.post(name: NSNotification.Name("SarvamCancelScanRequested"), object: nil)
        return .result()
    }
}
