import ActivityKit
import CoreGraphics
import Foundation
import OSLog

// MARK: - Structured OSLog Diagnostic Logger
public enum SarvamNativeLogger {
    private static let osLogger = Logger(
        subsystem: Bundle.main.bundleIdentifier ?? "com.sarvam.app",
        category: "native"
    )

    public static func info(_ message: String) {
        osLogger.info("[SarvamNative] \(message, privacy: .public)")
        #if DEBUG
        print("[SarvamNative] \(message)")
        #endif
    }

    public static func error(_ message: String) {
        osLogger.error("[SarvamNative] [ERROR] \(message, privacy: .public)")
        #if DEBUG
        print("[SarvamNative] [ERROR] \(message)")
        #endif
    }

    public static func warning(_ message: String) {
        osLogger.warning("[SarvamNative] [WARN] \(message, privacy: .public)")
        #if DEBUG
        print("[SarvamNative] [WARN] \(message)")
        #endif
    }

    public static func debug(_ message: String) {
        osLogger.debug("[SarvamNative] [DEBUG] \(message, privacy: .public)")
        #if DEBUG
        print("[SarvamNative] [DEBUG] \(message)")
        #endif
    }
}

public struct SarvamActivityAttributes: ActivityAttributes {
    public struct ContentState: Codable, Hashable {
        public var phase: String // "preparing", "scanning", "ready", "listening", "paused", "finished", "failed", "passwordNeeded"
        public var docId: String
        public var title: String
        public var fileName: String?
        public var fileCount: Int
        public var progress: Int // 0 to 100
        public var stage: String
        public var secondsRemaining: Int
        public var language: String
        public var languageLabel: String
        public var voiceGender: String // "female" or "male"
        public var currentTime: Double
        public var duration: Double
        public var allowListen: Bool
        public var showDocumentName: Bool
        public var errorMessage: String?
        /// When the scan started. The scan bar and the time-left countdown are drawn by the system
        /// from this date, so they keep moving while the app is suspended in the background.
        public var scanStartedAt: Date?
        /// Expected scan length in seconds (learned from recent scans on this phone).
        public var scanEstimateSeconds: Int?
        /// Listen speed the user picked in the app (1.0 = normal).
        public var playbackRate: Double?
        /// While playing: the moment the audio would have been at 0:00 (now − position ÷ speed).
        /// The Live Activity draws the running time and progress from it with system timers, so
        /// they move every second without waiting for updates from the app.
        public var playbackAnchor: Date?
        /// Captions (exact sentence timings from the voice server): the sentence being read, the one
        /// before (it moves up and fades) and the next (dim). Nil when the audio has no timings.
        public var captionIndex: Int?
        public var captionPrev: String?
        public var captionNow: String?
        public var captionNext: String?

        public var displayTitle: String {
            if showDocumentName && !title.isEmpty && title != "Your document" {
                return title
            }
            return "Your document"
        }

        public var displayFileName: String {
            if showDocumentName, let name = fileName, !name.isEmpty {
                return name
            }
            return "\(fileCount) photo"
        }

        public init(
            phase: String = "scanning",
            docId: String = "doc",
            title: String = "Your document",
            fileName: String? = nil,
            fileCount: Int = 1,
            progress: Int = 0,
            stage: String = "Reading your document",
            secondsRemaining: Int = 15,
            language: String = "en",
            languageLabel: String = "English",
            voiceGender: String = "female",
            currentTime: Double = 0,
            duration: Double = 90,
            allowListen: Bool = true,
            showDocumentName: Bool = false,
            errorMessage: String? = nil,
            scanStartedAt: Date? = nil,
            scanEstimateSeconds: Int? = nil,
            playbackRate: Double? = nil,
            playbackAnchor: Date? = nil,
            captionIndex: Int? = nil,
            captionPrev: String? = nil,
            captionNow: String? = nil,
            captionNext: String? = nil
        ) {
            self.phase = phase
            self.docId = docId
            self.title = title
            self.fileName = fileName
            self.fileCount = fileCount
            self.progress = progress
            self.stage = stage
            self.secondsRemaining = secondsRemaining
            self.language = language
            self.languageLabel = languageLabel
            self.voiceGender = voiceGender
            self.currentTime = currentTime
            self.duration = duration
            self.allowListen = allowListen
            self.showDocumentName = showDocumentName
            self.errorMessage = errorMessage
            self.scanStartedAt = scanStartedAt
            self.scanEstimateSeconds = scanEstimateSeconds
            self.playbackRate = playbackRate
            self.playbackAnchor = playbackAnchor
            self.captionIndex = captionIndex
            self.captionPrev = captionPrev
            self.captionNow = captionNow
            self.captionNext = captionNext
        }

        public var isListenPhase: Bool {
            phase == "listening" || phase == "paused" || phase == "finished"
        }

        /// Whole expected scan window (start ... start + estimate), or nil when unknown.
        public var scanInterval: ClosedRange<Date>? {
            guard let start = scanStartedAt else { return nil }
            let seconds = Double(max(10, scanEstimateSeconds ?? 40))
            return start...start.addingTimeInterval(seconds)
        }

        /// The three bar segments fill one after the other (2 : 2 : 1, like the in-app design):
        /// segment 0 covers 0-40 % of the window, segment 1 40-80 %, segment 2 80-100 %.
        public func scanSegmentInterval(_ index: Int) -> ClosedRange<Date>? {
            guard let whole = scanInterval else { return nil }
            let bounds: [(Double, Double)] = [(0.0, 0.4), (0.4, 0.8), (0.8, 1.0)]
            let pair = bounds[max(0, min(2, index))]
            let total = whole.upperBound.timeIntervalSince(whole.lowerBound)
            let lower = whole.lowerBound.addingTimeInterval(total * pair.0)
            let upper = whole.lowerBound.addingTimeInterval(total * pair.1)
            return lower...upper
        }

        public var voiceLabel: String {
            voiceGender == "male" ? "Male" : "Female"
        }

        /// "தமிழ் · Female", plus the speed when it is not normal ("தமிழ் · Male · 1.5×").
        public var languageVoiceLabel: String {
            let base = "\(languageLabel) · \(voiceLabel)"
            guard let rate = playbackRate, abs(rate - 1.0) > 0.01 else { return base }
            let speed = rate == rate.rounded() ? String(format: "%.0f", rate) : String(format: "%g", rate)
            return "\(base) · \(speed)×"
        }

        /// Start ... end of the audio in clock time while it plays, else nil (paused / finished).
        public var playbackTimerRange: ClosedRange<Date>? {
            guard phase == "listening", duration > 0, let anchor = playbackAnchor else { return nil }
            let rate = max(0.5, min(2.0, playbackRate ?? 1.0))
            let end = anchor.addingTimeInterval(duration / rate)
            guard end > anchor else { return nil }
            return anchor...end
        }

        public var hasCaptions: Bool {
            !(captionNow ?? "").isEmpty
        }

        /// Text size of the bright caption: it shrinks with length so the whole sentence fits in
        /// three lines (same steps as the approved design).
        public var captionNowSize: CGFloat {
            let count = (captionNow ?? "").count
            let latin = language == "en"
            let steps = latin ? [34, 52, 72] : [22, 34, 48]
            let sizes: [CGFloat] = latin ? [15, 14, 13, 12] : [14, 13, 12, 11]
            var i = 0
            while i < steps.count && count > steps[i] { i += 1 }
            return sizes[i]
        }

        public var captionDimSize: CGFloat {
            language == "en" ? 12 : 11
        }

        /// True while the voice is being fetched (no audio length yet).
        public var isPreparingAudio: Bool {
            isListenPhase && duration <= 0
        }
    }

    public var activityId: String

    /// Each language's own name, as the app shows it.
    public static func languageName(for code: String) -> String {
        switch code {
        case "ta": return "தமிழ்"
        case "hi": return "हिंदी"
        case "te": return "తెలుగు"
        case "ml": return "മലയാളം"
        case "kn": return "ಕನ್ನಡ"
        case "mr": return "मराठी"
        case "bn": return "বাংলা"
        case "or": return "ଓଡ଼ିଆ"
        default: return "English"
        }
    }

    public init(activityId: String) {
        self.activityId = activityId
    }
}
