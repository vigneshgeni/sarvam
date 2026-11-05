import ActivityKit
import Capacitor
import Foundation
import QuickLook
import UIKit

@objc(SarvamLiveActivityPlugin)
public class SarvamLiveActivityPlugin: CAPPlugin, CAPBridgedPlugin {
    public static weak var shared: SarvamLiveActivityPlugin?

    public let identifier = "SarvamLiveActivityPlugin"
    public let jsName = "SarvamLiveActivity"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "startActivity", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "updateActivity", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "endActivity", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "playAudio", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "pauseAudio", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "resumeAudio", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "seekAudio", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "stopAudio", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "isAvailable", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "startNativeScan", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "checkPendingScanResult", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "cancelNativeScan", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "previewDocument", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "shareContent", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getLastOpenedURL", returnType: CAPPluginReturnPromise)
    ]

    private var activeActivity: Activity<SarvamActivityAttributes>?
    private var backgroundTaskId: UIBackgroundTaskIdentifier = .invalid
    private var lastState: SarvamActivityAttributes.ContentState?
    private var qlDataSource: QuickLookPreviewControllerDataSource?

    override public func load() {
        super.load()
        SarvamLiveActivityPlugin.shared = self
        setupAudioPlayerBridge()
    }

    private func setupAudioPlayerBridge() {
        SarvamAudioPlayer.shared.onPlaybackProgress = { [weak self] current, duration, isPlaying in
            guard let self = self, var state = self.lastState else { return }
            state.currentTime = current
            state.duration = duration
            state.phase = isPlaying ? "listening" : "paused"
            self.lastState = state

            Task {
                await self.activeActivity?.update(
                    ActivityContent(state: state, staleDate: nil)
                )
            }
        }

        SarvamAudioPlayer.shared.onPlaybackEnded = { [weak self] in
            guard let self = self, var state = self.lastState else { return }
            state.phase = "finished"
            self.lastState = state

            Task {
                await self.activeActivity?.update(
                    ActivityContent(state: state, staleDate: nil)
                )
            }
        }
    }

    @objc func isAvailable(_ call: CAPPluginCall) {
        if #available(iOS 16.1, *) {
            let areEnabled = ActivityAuthorizationInfo().areActivitiesEnabled
            call.resolve(["available": areEnabled])
        } else {
            call.resolve(["available": false])
        }
    }

    @objc func startActivity(_ call: CAPPluginCall) {
        guard #available(iOS 16.1, *) else {
            call.reject("ActivityKit is not supported on this iOS version")
            return
        }

        guard ActivityAuthorizationInfo().areActivitiesEnabled else {
            call.reject("Live Activities are disabled by the user in Settings")
            return
        }

        let docId = call.getString("docId") ?? "doc"
        let phase = call.getString("phase") ?? "scanning"
        let title = call.getString("title") ?? "Your document"
        let fileName = call.getString("fileName")
        let fileCount = call.getInt("fileCount") ?? 1
        let progress = call.getInt("progress") ?? 0
        let stage = call.getString("stage") ?? "Reading your document"
        let secondsRemaining = call.getInt("secondsRemaining") ?? 15
        let language = call.getString("language") ?? "en"
        let languageLabel = call.getString("languageLabel") ?? "English"
        let voiceGender = call.getString("voiceGender") ?? "female"
        let currentTime = call.getDouble("currentTime") ?? 0
        let duration = call.getDouble("duration") ?? 90
        let allowListen = call.getBool("allowListen") ?? true
        let showDocumentName = call.getBool("showDocumentName") ?? false

        let state = SarvamActivityAttributes.ContentState(
            phase: phase,
            docId: docId,
            title: title,
            fileName: fileName,
            fileCount: fileCount,
            progress: progress,
            stage: stage,
            secondsRemaining: secondsRemaining,
            language: language,
            languageLabel: languageLabel,
            voiceGender: voiceGender,
            currentTime: currentTime,
            duration: duration,
            allowListen: allowListen,
            showDocumentName: showDocumentName
        )
        self.lastState = state

        // Begin background task for scanning (Scenario S1-S4, S13)
        if phase == "scanning" {
            beginScanningBackgroundTask(docId: docId)
        }

        let attributes = SarvamActivityAttributes(activityId: docId)
        do {
            // End any prior activity to enforce "one activity at a time" rule
            if let existing = activeActivity {
                Task {
                    await existing.end(nil, dismissalPolicy: .immediate)
                }
            }

            let activity = try Activity.request(
                attributes: attributes,
                content: ActivityContent(state: state, staleDate: nil),
                pushType: nil
            )
            self.activeActivity = activity
            print("SARVAM_NATIVE: [LiveActivity] Activity STARTED! ID=\(activity.id), docId=\(docId), phase=\(phase), title=\(state.displayTitle)")
            call.resolve(["success": true, "activityId": activity.id])
        } catch {
            print("SARVAM_NATIVE: [LiveActivity] Activity.request FAILED: \(error)")
            call.reject("Failed to request Live Activity: \(error.localizedDescription)")
        }
    }

    @objc func updateActivity(_ call: CAPPluginCall) {
        guard let activity = activeActivity else {
            print("SARVAM_NATIVE: [LiveActivity] updateActivity skipped (no active activity)")
            call.resolve(["success": false, "reason": "No active activity"])
            return
        }

        let phase = call.getString("phase") ?? (lastState?.phase ?? "scanning")
        let docId = call.getString("docId") ?? (lastState?.docId ?? "doc")
        let title = call.getString("title") ?? (lastState?.title ?? "Your document")
        let fileName = call.getString("fileName") ?? lastState?.fileName
        let fileCount = call.getInt("fileCount") ?? (lastState?.fileCount ?? 1)
        let progress = call.getInt("progress") ?? (lastState?.progress ?? 0)
        let stage = call.getString("stage") ?? (lastState?.stage ?? "Reading your document")
        let secondsRemaining = call.getInt("secondsRemaining") ?? (lastState?.secondsRemaining ?? 0)
        let language = call.getString("language") ?? (lastState?.language ?? "en")
        let languageLabel = call.getString("languageLabel") ?? (lastState?.languageLabel ?? "English")
        let voiceGender = call.getString("voiceGender") ?? (lastState?.voiceGender ?? "female")
        let currentTime = call.getDouble("currentTime") ?? (lastState?.currentTime ?? 0)
        let duration = call.getDouble("duration") ?? (lastState?.duration ?? 90)
        let allowListen = call.getBool("allowListen") ?? (lastState?.allowListen ?? true)
        let showDocumentName = call.getBool("showDocumentName") ?? (lastState?.showDocumentName ?? false)
        let errorMessage = call.getString("errorMessage") ?? lastState?.errorMessage

        let state = SarvamActivityAttributes.ContentState(
            phase: phase,
            docId: docId,
            title: title,
            fileName: fileName,
            fileCount: fileCount,
            progress: progress,
            stage: stage,
            secondsRemaining: secondsRemaining,
            language: language,
            languageLabel: languageLabel,
            voiceGender: voiceGender,
            currentTime: currentTime,
            duration: duration,
            allowListen: allowListen,
            showDocumentName: showDocumentName,
            errorMessage: errorMessage
        )
        self.lastState = state

        if phase == "ready" {
            endScanningBackgroundTask()
        }

        let alertConfig: AlertConfiguration? = (phase == "ready")
            ? AlertConfiguration(title: "Ready", body: "Your document is ready", sound: .default)
            : nil

        print("SARVAM_NATIVE: [LiveActivity] updateActivity updating activity: phase=\(phase), docId=\(docId), title=\(state.displayTitle)")
        Task {
            await activity.update(
                ActivityContent(state: state, staleDate: nil),
                alertConfiguration: alertConfig
            )
            call.resolve(["success": true])
        }
    }

    @objc func endActivity(_ call: CAPPluginCall) {
        print("SARVAM_NATIVE: [LiveActivity] endActivity called")
        endScanningBackgroundTask()
        SarvamAudioPlayer.shared.stop()

        guard let activity = activeActivity else {
            call.resolve(["success": true])
            return
        }

        let dismissal: ActivityUIDismissalPolicy = .immediate
        Task {
            await activity.end(nil, dismissalPolicy: dismissal)
            self.activeActivity = nil
            self.lastState = nil
            call.resolve(["success": true])
        }
    }

    @objc func playAudio(_ call: CAPPluginCall) {
        let audioData = call.getString("audioData")
        let audioUrlString = call.getString("audioUrl")
        let title = call.getString("title") ?? "Your document"
        let langLabel = call.getString("langLabel") ?? "English"
        let duration = call.getDouble("duration") ?? 90
        let startPos = call.getDouble("startPosition") ?? 0

        var url: URL?
        if let audioUrlString = audioUrlString {
            url = URL(string: audioUrlString)
        }

        SarvamAudioPlayer.shared.play(
            url: url,
            audioBase64: audioData,
            title: title,
            langLabel: langLabel,
            duration: duration,
            startPosition: startPos
        )

        call.resolve(["success": true])
    }

    @objc func pauseAudio(_ call: CAPPluginCall) {
        SarvamAudioPlayer.shared.pause()
        call.resolve(["success": true])
    }

    @objc func resumeAudio(_ call: CAPPluginCall) {
        SarvamAudioPlayer.shared.resume()
        call.resolve(["success": true])
    }

    @objc func seekAudio(_ call: CAPPluginCall) {
        let position = call.getDouble("position") ?? 0
        SarvamAudioPlayer.shared.seek(to: position)
        call.resolve(["success": true])
    }

    @objc func stopAudio(_ call: CAPPluginCall) {
        SarvamAudioPlayer.shared.stop()
        call.resolve(["success": true])
    }

    // MARK: - Background Scanning Task Management
    private func beginScanningBackgroundTask(docId: String) {
        endScanningBackgroundTask()
        backgroundTaskId = UIApplication.shared.beginBackgroundTask(withName: "SarvamDocumentScanning") { [weak self] in
            // Expiration handler: S13 honest state
            guard let self = self else { return }
            if var state = self.lastState, state.phase == "scanning" {
                state.stage = "Open Sarvam to finish"
                state.errorMessage = "Open Sarvam to finish"
                self.lastState = state
                Task {
                    await self.activeActivity?.update(
                        ActivityContent(state: state, staleDate: Date())
                    )
                }
            }
            self.endScanningBackgroundTask()
        }
    }

    private func endScanningBackgroundTask() {
        if backgroundTaskId != .invalid {
            UIApplication.shared.endBackgroundTask(backgroundTaskId)
            backgroundTaskId = .invalid
        }
    }

    // MARK: - Native Direct Updates for Worker
    func updateToReady(docId: String) async {
        guard var state = self.lastState else { return }
        state.phase = "ready"
        state.stage = "Ready"
        state.progress = 100
        state.secondsRemaining = 0
        self.lastState = state
        endScanningBackgroundTask()

        let alertConfig = AlertConfiguration(
            title: "Ready",
            body: "Your document is ready",
            sound: .default
        )
        print("SARVAM_NATIVE: [LiveActivity] Updating activity to READY for \(docId)")
        await self.activeActivity?.update(
            ActivityContent(state: state, staleDate: nil),
            alertConfiguration: alertConfig
        )
    }

    func updateToFailed(docId: String, errorMessage: String) async {
        guard var state = self.lastState else { return }
        state.phase = "failed"
        state.stage = errorMessage
        state.errorMessage = errorMessage
        self.lastState = state
        endScanningBackgroundTask()

        print("SARVAM_NATIVE: [LiveActivity] Updating activity to FAILED for \(docId): \(errorMessage)")
        await self.activeActivity?.update(
            ActivityContent(state: state, staleDate: nil)
        )
    }

    func endActiveActivity() async {
        endScanningBackgroundTask()
        SarvamAudioPlayer.shared.stop()
        if let activity = activeActivity {
            print("SARVAM_NATIVE: [LiveActivity] Ending active activity \(activity.id)")
            await activity.end(nil, dismissalPolicy: .immediate)
            self.activeActivity = nil
            self.lastState = nil
        }
    }

    // MARK: - Native Background Scan Worker Bridge
    @objc func startNativeScan(_ call: CAPPluginCall) {
        let docId = call.getString("docId") ?? "doc"
        let title = call.getString("title") ?? "Your document"
        let lang = call.getString("lang") ?? "en"
        let apiBase = call.getString("apiBase") ?? "http://127.0.0.1:8080"
        let showDoc = call.getBool("showDocumentName") ?? false
        let password = call.getString("password")
        guard let files = call.getArray("files") as? [[String: Any]], !files.isEmpty else {
            call.reject("No files provided for scan")
            return
        }

        // Start Live Activity with Option A parameters (NO percentage number)
        let state = SarvamActivityAttributes.ContentState(
            phase: "scanning",
            docId: docId,
            title: title,
            fileCount: files.count,
            progress: 0,
            stage: "Analyzing document…",
            secondsRemaining: 0,
            language: lang,
            showDocumentName: showDoc
        )
        self.lastState = state

        if #available(iOS 16.1, *) {
            if ActivityAuthorizationInfo().areActivitiesEnabled {
                Task {
                    for existing in Activity<SarvamActivityAttributes>.activities {
                        await existing.end(nil, dismissalPolicy: .immediate)
                    }
                    do {
                        let activity = try Activity.request(
                            attributes: SarvamActivityAttributes(activityId: docId),
                            content: ActivityContent(state: state, staleDate: nil),
                            pushType: nil
                        )
                        self.activeActivity = activity
                        print("SARVAM_NATIVE: [ScanWorker] Live Activity started with ID \(activity.id)")
                    } catch {
                        print("SARVAM_NATIVE: [ScanWorker] Failed to request Live Activity: \(error)")
                    }
                }
            }
        }

        let started = SarvamScanWorker.shared.startScan(
            docId: docId,
            title: title,
            lang: lang,
            apiBase: apiBase,
            showDocumentName: showDoc,
            files: files,
            password: password
        )

        if started {
            call.resolve(["success": true, "docId": docId])
        } else {
            call.reject("Failed to initiate native scan")
        }
    }

    @objc func checkPendingScanResult(_ call: CAPPluginCall) {
        let docId = call.getString("docId") ?? SarvamScanWorker.shared.currentDocId ?? "doc"
        let resultFile = SarvamScanWorker.resultFileURL(docId: docId)
        if FileManager.default.fileExists(atPath: resultFile.path) {
            if let data = try? Data(contentsOf: resultFile),
               let json = try? JSONSerialization.jsonObject(with: data, options: []) as? [String: Any] {
                call.resolve([
                    "ready": true,
                    "result": json
                ])
                return
            }
        }

        let errorFile = SarvamScanWorker.errorFileURL(docId: docId)
        if FileManager.default.fileExists(atPath: errorFile.path) {
            if let data = try? Data(contentsOf: errorFile),
               let json = try? JSONSerialization.jsonObject(with: data, options: []) as? [String: Any] {
                call.resolve([
                    "ready": false,
                    "error": true,
                    "details": json
                ])
                return
            }
        }

        let isScanning = SarvamScanWorker.shared.isScanning(docId: docId)
        call.resolve([
            "ready": false,
            "running": isScanning
        ])
    }

    @objc func cancelNativeScan(_ call: CAPPluginCall) {
        SarvamScanWorker.shared.cancelActiveScan()
        call.resolve(["success": true])
    }

    // MARK: - Native Document QuickLook & Share Sheets
    @objc func previewDocument(_ call: CAPPluginCall) {
        DispatchQueue.main.async { [weak self] in
            guard let self = self else { return }
            let fileName = call.getString("fileName") ?? "document.pdf"
            let title = call.getString("title") ?? fileName

            var targetURL: URL?
            if let base64 = call.getString("base64"), let data = Data(base64Encoded: base64) {
                let tempURL = FileManager.default.temporaryDirectory.appendingPathComponent(fileName)
                try? data.write(to: tempURL)
                targetURL = tempURL
            } else if let path = call.getString("url") {
                targetURL = URL(string: path)
            }

            guard let fileURL = targetURL else {
                call.reject("No document data or URL provided")
                return
            }

            let item = QuickLookPreviewItem(url: fileURL, title: title)
            self.qlDataSource = QuickLookPreviewControllerDataSource(item: item)

            let previewController = QLPreviewController()
            previewController.dataSource = self.qlDataSource

            if let presenter = self.bridge?.viewController {
                presenter.present(previewController, animated: true) {
                    call.resolve(["success": true])
                }
            } else {
                call.reject("No view controller to present preview")
            }
        }
    }

    @objc func shareContent(_ call: CAPPluginCall) {
        DispatchQueue.main.async { [weak self] in
            guard let self = self else { return }
            var items: [Any] = []

            if let text = call.getString("text"), !text.isEmpty {
                items.append(text)
            }
            if let urlStr = call.getString("url"), let url = URL(string: urlStr) {
                items.append(url)
            }
            if let icsData = call.getString("icsData") {
                let tempURL = FileManager.default.temporaryDirectory.appendingPathComponent("event.ics")
                try? icsData.data(using: .utf8)?.write(to: tempURL)
                items.append(tempURL)
            }

            guard !items.isEmpty else {
                call.reject("Nothing to share")
                return
            }

            let activityVC = UIActivityViewController(activityItems: items, applicationActivities: nil)
            if let presenter = self.bridge?.viewController {
                if let popover = activityVC.popoverPresentationController {
                    popover.sourceView = presenter.view
                    popover.sourceRect = CGRect(x: presenter.view.bounds.midX, y: presenter.view.bounds.midY, width: 0, height: 0)
                    popover.permittedArrowDirections = []
                }
                presenter.present(activityVC, animated: true) {
                    call.resolve(["success": true])
                }
            } else {
                call.reject("No view controller to present share sheet")
            }
        }
    }

    @objc func getLastOpenedURL(_ call: CAPPluginCall) {
        let url = AppDelegate.lastOpenedURL
        AppDelegate.lastOpenedURL = nil
        call.resolve(["url": url as Any])
    }
}

// MARK: - QuickLook Helpers
class QuickLookPreviewItem: NSObject, QLPreviewItem {
    let previewItemURL: URL?
    let previewItemTitle: String?

    init(url: URL, title: String?) {
        self.previewItemURL = url
        self.previewItemTitle = title
        super.init()
    }
}

class QuickLookPreviewControllerDataSource: NSObject, QLPreviewControllerDataSource {
    let item: QuickLookPreviewItem

    init(item: QuickLookPreviewItem) {
        self.item = item
        super.init()
    }

    func numberOfPreviewItems(in controller: QLPreviewController) -> Int {
        return 1
    }

    func previewController(_ controller: QLPreviewController, previewItemAt index: Int) -> QLPreviewItem {
        return item
    }
}

// MARK: - Native Background Scan Worker
public class SarvamScanWorker: NSObject, URLSessionDelegate, URLSessionTaskDelegate, URLSessionDataDelegate {
    public static let shared = SarvamScanWorker()

    public var backgroundCompletionHandler: (() -> Void)?
    public private(set) var currentDocId: String?
    private var session: URLSession!
    private var currentUploadTask: URLSessionUploadTask?
    private var currentTempFile: URL?
    private var receivedData = Data()
    private var isCancelled = false

    override private init() {
        super.init()
        let config = URLSessionConfiguration.background(withIdentifier: "com.sarvam.app.scan")
        config.isDiscretionary = false
        config.sessionSendsLaunchEvents = true
        self.session = URLSession(configuration: config, delegate: self, delegateQueue: nil)

        // Listen for Darwin scan cancel notification from Lock Screen / Dynamic Island widget
        let center = CFNotificationCenterGetDarwinNotifyCenter()
        let observer = Unmanaged.passUnretained(self).toOpaque()
        CFNotificationCenterAddObserver(
            center,
            observer,
            { _, observer, _, _, _ in
                guard let observer = observer else { return }
                let worker = Unmanaged<SarvamScanWorker>.fromOpaque(observer).takeUnretainedValue()
                print("SARVAM_NATIVE: [ScanWorker] Received Darwin scan cancelled notification")
                worker.cancelActiveScan()
            },
            "com.sarvam.app.scanCancelled" as CFString,
            nil,
            .deliverImmediately
        )
    }

    public static var cacheDir: URL {
        FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask).first!
    }

    public static func resultFileURL(docId: String) -> URL {
        cacheDir.appendingPathComponent("scan_result_\(docId).json")
    }

    public static func errorFileURL(docId: String) -> URL {
        cacheDir.appendingPathComponent("scan_error_\(docId).json")
    }

    public static func saveResult(docId: String, resultJson: [String: Any]) {
        if let data = try? JSONSerialization.data(withJSONObject: resultJson, options: []) {
            try? data.write(to: resultFileURL(docId: docId))
            print("SARVAM_NATIVE: [ScanWorker] Saved result for \(docId)")
        }
    }

    public static func saveError(docId: String, errorJson: [String: Any]) {
        if let data = try? JSONSerialization.data(withJSONObject: errorJson, options: []) {
            try? data.write(to: errorFileURL(docId: docId))
            print("SARVAM_NATIVE: [ScanWorker] Saved error for \(docId)")
        }
    }

    public static func clearCache(docId: String) {
        try? FileManager.default.removeItem(at: resultFileURL(docId: docId))
        try? FileManager.default.removeItem(at: errorFileURL(docId: docId))
    }

    public func isScanning(docId: String) -> Bool {
        return currentDocId == docId && currentUploadTask != nil
    }

    public func startScan(
        docId: String,
        title: String,
        lang: String,
        apiBase: String,
        showDocumentName: Bool,
        files: [[String: Any]],
        password: String? = nil
    ) -> Bool {
        cancelActiveScan()
        isCancelled = false
        currentDocId = docId
        receivedData = Data()

        Self.clearCache(docId: docId)

        let boundary = "Boundary-\(UUID().uuidString)"
        let tempFileURL = FileManager.default.temporaryDirectory.appendingPathComponent("upload_\(docId)_\(UUID().uuidString).tmp")
        currentTempFile = tempFileURL

        guard let stream = OutputStream(url: tempFileURL, append: false) else {
            print("SARVAM_NATIVE: [ScanWorker] Failed to create output stream at \(tempFileURL)")
            return false
        }
        stream.open()
        defer { stream.close() }

        func writeString(_ str: String) {
            if let d = str.data(using: .utf8) {
                d.withUnsafeBytes { ptr in
                    _ = stream.write(ptr.bindMemory(to: UInt8.self).baseAddress!, maxLength: d.count)
                }
            }
        }

        for file in files {
            let name = file["name"] as? String ?? "file"
            let type = file["type"] as? String ?? "application/octet-stream"
            if let b64 = file["base64"] as? String, let data = Data(base64Encoded: b64) {
                writeString("--\(boundary)\r\n")
                writeString("Content-Disposition: form-data; name=\"files\"; filename=\"\(name)\"\r\n")
                writeString("Content-Type: \(type)\r\n\r\n")
                data.withUnsafeBytes { ptr in
                    _ = stream.write(ptr.bindMemory(to: UInt8.self).baseAddress!, maxLength: data.count)
                }
                writeString("\r\n")
            }
        }

        writeString("--\(boundary)\r\n")
        writeString("Content-Disposition: form-data; name=\"lang\"\r\n\r\n")
        writeString("\(lang)\r\n")

        if let pw = password, !pw.isEmpty {
            writeString("--\(boundary)\r\n")
            writeString("Content-Disposition: form-data; name=\"password\"\r\n\r\n")
            writeString("\(pw)\r\n")
        }

        writeString("--\(boundary)--\r\n")

        guard let url = URL(string: "\(apiBase)/api/explain") else {
            print("SARVAM_NATIVE: [ScanWorker] Invalid URL: \(apiBase)/api/explain")
            return false
        }

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("multipart/form-data; boundary=\(boundary)", forHTTPHeaderField: "Content-Type")

        let task = session.uploadTask(with: request, fromFile: tempFileURL)
        currentUploadTask = task
        task.resume()
        print("SARVAM_NATIVE: [ScanWorker] Upload task started for docId: \(docId), url: \(url)")
        return true
    }

    public func cancelActiveScan() {
        isCancelled = true
        currentUploadTask?.cancel()
        currentUploadTask = nil
        if let tmp = currentTempFile {
            try? FileManager.default.removeItem(at: tmp)
            currentTempFile = nil
        }
        if let docId = currentDocId {
            Self.clearCache(docId: docId)
        }
        currentDocId = nil
        receivedData = Data()

        if #available(iOS 16.1, *) {
            Task {
                for activity in Activity<SarvamActivityAttributes>.activities {
                    await activity.end(nil, dismissalPolicy: .immediate)
                }
            }
        }
    }

    // MARK: - URLSession Delegate Methods
    public func urlSession(_ session: URLSession, dataTask: URLSessionDataTask, didReceive data: Data) {
        receivedData.append(data)
    }

    public func urlSession(_ session: URLSession, task: URLSessionTask, didCompleteWithError error: Error?) {
        if let tmp = currentTempFile {
            try? FileManager.default.removeItem(at: tmp)
            currentTempFile = nil
        }
        let docId = self.currentDocId ?? "doc"
        let httpResponse = task.response as? HTTPURLResponse
        let statusCode = httpResponse?.statusCode ?? (error != nil ? 500 : 200)

        if isCancelled || (error as NSError?)?.code == NSURLErrorCancelled {
            print("SARVAM_NATIVE: [ScanWorker] Upload was cancelled")
            Self.clearCache(docId: docId)
            finishBackgroundEvents()
            return
        }

        if error != nil || statusCode >= 400 {
            let errorMsg: String
            if statusCode == 429 {
                errorMsg = "Too many requests. Please wait."
            } else if statusCode == 503 || statusCode == 504 {
                errorMsg = "Service is busy. Please try again soon."
            } else {
                errorMsg = "Analysis failed. Please try again."
            }
            print("SARVAM_NATIVE: [ScanWorker] Scan failed with code \(statusCode): \(errorMsg)")
            Self.saveError(docId: docId, errorJson: [
                "message": errorMsg,
                "messageLocal": errorMsg,
                "statusCode": statusCode
            ])

            if #available(iOS 16.1, *) {
                Task {
                    for activity in Activity<SarvamActivityAttributes>.activities {
                        var updatedState = activity.content.state
                        updatedState.phase = "failed"
                        updatedState.stage = errorMsg
                        updatedState.errorMessage = errorMsg
                        await activity.update(ActivityContent(state: updatedState, staleDate: nil))
                    }
                }
            }
        } else {
            print("SARVAM_NATIVE: [ScanWorker] Scan completed successfully, \(receivedData.count) bytes received")
            if let json = try? JSONSerialization.jsonObject(with: receivedData, options: []) as? [String: Any] {
                Self.saveResult(docId: docId, resultJson: json)

                if #available(iOS 16.1, *) {
                    Task {
                        for activity in Activity<SarvamActivityAttributes>.activities {
                            var updatedState = activity.content.state
                            updatedState.phase = "ready"
                            updatedState.stage = "Ready"
                            updatedState.progress = 100
                            updatedState.secondsRemaining = 0
                            let alertConfig = AlertConfiguration(
                                title: "Ready",
                                body: "Your document is ready",
                                sound: .default
                            )
                            await activity.update(
                                ActivityContent(state: updatedState, staleDate: nil),
                                alertConfiguration: alertConfig
                            )
                        }
                    }
                }
            } else {
                print("SARVAM_NATIVE: [ScanWorker] Failed to parse JSON response")
                let errorMsg = "Service is busy"
                Self.saveError(docId: docId, errorJson: [
                    "message": errorMsg,
                    "messageLocal": errorMsg,
                    "statusCode": 500
                ])
                if #available(iOS 16.1, *) {
                    Task {
                        for activity in Activity<SarvamActivityAttributes>.activities {
                            var updatedState = activity.content.state
                            updatedState.phase = "failed"
                            updatedState.stage = errorMsg
                            updatedState.errorMessage = errorMsg
                            await activity.update(ActivityContent(state: updatedState, staleDate: nil))
                        }
                    }
                }
            }
        }

        currentUploadTask = nil
        currentDocId = nil
        finishBackgroundEvents()
    }

    private func finishBackgroundEvents() {
        if let handler = backgroundCompletionHandler {
            backgroundCompletionHandler = nil
            DispatchQueue.main.async {
                handler()
            }
        }
    }
}
