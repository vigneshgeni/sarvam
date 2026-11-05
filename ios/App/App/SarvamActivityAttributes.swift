import ActivityKit
import Foundation

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
            errorMessage: String? = nil
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
        }
    }

    public var activityId: String

    public init(activityId: String) {
        self.activityId = activityId
    }
}
