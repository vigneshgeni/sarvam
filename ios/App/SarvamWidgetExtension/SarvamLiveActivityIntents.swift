import AppIntents
import Foundation
#if canImport(ActivityKit)
import ActivityKit
#endif

/// "Listen" on the Ready card: plays the document from the Lock Screen / Dynamic Island without
/// opening the app. AudioPlaybackIntent lets the app start audio from the background;
/// LiveActivityIntent makes it run in the app's process (where the player lives).
@available(iOS 17.0, *)
public struct StartListenIntent: LiveActivityIntent, AudioPlaybackIntent {
    public static var title: LocalizedStringResource = "Listen to the Document"
    public static var isDiscoverable: Bool = false

    @Parameter(title: "Document")
    public var docId: String

    public init() {}

    public init(docId: String) {
        self.docId = docId
    }

    public func perform() async throws -> some IntentResult {
        await SarvamListenService.shared.startListening(docId: docId)
        return .result()
    }
}

@available(iOS 17.0, *)
public struct PlayPauseIntent: LiveActivityIntent, AudioPlaybackIntent {
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
        await SarvamListenService.shared.pushNow()
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
        await SarvamListenService.shared.pushNow()
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
        await SarvamListenService.shared.pushNow()
        return .result()
    }
}

/// Tap on the Listen ruler (Lock Screen / Dynamic Island): jump to that point of the audio.
/// Live Activities cannot be dragged, so the ruler is split into tap zones.
@available(iOS 17.0, *)
public struct SeekToFractionIntent: LiveActivityIntent {
    public static var title: LocalizedStringResource = "Jump to a Point in Listen Audio"
    public static var isDiscoverable: Bool = false

    @Parameter(title: "Position")
    public var fraction: Double

    public init() {}

    public init(fraction: Double) {
        self.fraction = fraction
    }

    public func perform() async throws -> some IntentResult {
        let player = SarvamAudioPlayer.shared
        let clamped = max(0, min(1, fraction))
        player.seek(to: clamped * player.totalDuration)
        await SarvamListenService.shared.pushNow()
        return .result()
    }
}

/// Tap on the centre ruler (Lock Screen / Dynamic Island): the tapped second moves under the gold
/// mark. Each tap zone carries the second it stands for.
@available(iOS 17.0, *)
public struct SeekToSecondsIntent: LiveActivityIntent {
    public static var title: LocalizedStringResource = "Jump to a Second in Listen Audio"
    public static var isDiscoverable: Bool = false

    @Parameter(title: "Seconds")
    public var seconds: Double

    public init() {}

    public init(seconds: Double) {
        self.seconds = seconds
    }

    public func perform() async throws -> some IntentResult {
        let player = SarvamAudioPlayer.shared
        await withCheckedContinuation { (done: CheckedContinuation<Void, Never>) in
            DispatchQueue.main.async {
                player.seek(to: max(0, seconds), fast: false) { done.resume() }
            }
        }
        await SarvamListenService.shared.pushNow()
        return .result()
    }
}

@available(iOS 17.0, *)
public struct CancelScanIntent: LiveActivityIntent {
    public static var title: LocalizedStringResource = "Cancel Document Analysis"
    public static var isDiscoverable: Bool = false

    public init() {}

    public func perform() async throws -> some IntentResult {
        #if canImport(ActivityKit)
        if #available(iOS 16.1, *) {
            // Only the scan card. A Listen activity keeps playing.
            for activity in Activity<SarvamActivityAttributes>.activities
            where activity.content.state.phase == "scanning" {
                await activity.end(nil, dismissalPolicy: .immediate)
            }
        }
        #endif

        NotificationCenter.default.post(name: NSNotification.Name("SarvamCancelScanRequested"), object: nil)
        CFNotificationCenterPostNotification(
            CFNotificationCenterGetDarwinNotifyCenter(),
            CFNotificationName("com.sarvam.app.scanCancelled" as CFString),
            nil,
            nil,
            true
        )
        return .result()
    }
}
