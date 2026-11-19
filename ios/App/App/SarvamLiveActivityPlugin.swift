import ActivityKit
import Capacitor
import Foundation
import OSLog
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
        CAPPluginMethod(name: "getAudioState", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setAudioRate", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "downloadSpeech", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "isAvailable", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "startNativeScan", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "checkPendingScanResult", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "cancelNativeScan", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "previewDocument", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "shareContent", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getLastOpenedURL", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "updateScanProgress", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "markScanFailed", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "echo", returnType: CAPPluginReturnPromise)
    ]

    private var storedActivity: Activity<SarvamActivityAttributes>?
    /// Self-healing handle: returns nil once the system has ended/dismissed the activity, so a
    /// stale (ended) activity is never "adopted" and silently updated for a later Listen.
    private var activeActivity: Activity<SarvamActivityAttributes>? {
        get {
            if let a = storedActivity, a.activityState == .active { return a }
            storedActivity = nil
            return nil
        }
        set { storedActivity = newValue }
    }
    private var liveActivities: [Activity<SarvamActivityAttributes>] {
        Activity<SarvamActivityAttributes>.activities.filter { $0.activityState == .active }
    }
    private var backgroundTaskId: UIBackgroundTaskIdentifier = .invalid
    private var lastState: SarvamActivityAttributes.ContentState?
    private var qlDataSource: QuickLookPreviewControllerDataSource?

    private var lastPushedPosition: Double = -100
    private var pendingScanState: SarvamActivityAttributes.ContentState?
    private var scanRetryWorkItem: DispatchWorkItem?
    private var didRegisterForegroundObserver = false
    /// Drives the scan percent / stage / time left while the app process is awake (foreground and
    /// the ~30 s background grace). Each push sets a short stale date, so once iOS suspends the app
    /// the Live Activity shows its system-driven countdown instead of a frozen percent.
    private var scanTicker: Timer?
    private var scanStageLabels: [String] = []
    private var readyCleanupWorkItem: DispatchWorkItem?

    override public func load() {
        super.load()
        SarvamLiveActivityPlugin.shared = self
        setupAudioPlayerBridge()
        setupForegroundObserver()
    }

    private func setupForegroundObserver() {
        guard !didRegisterForegroundObserver else { return }
        didRegisterForegroundObserver = true
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(handleAppDidBecomeActive),
            name: UIApplication.didBecomeActiveNotification,
            object: nil
        )
    }

    @objc private func handleAppDidBecomeActive() {
        if let pending = pendingScanState {
            SarvamNativeLogger.info("[ActivityKit] App became active; retrying pending Live Activity request for docId=\(pending.docId)")
            requestScanActivityWithRetry(state: pending, attempt: 1)
        }
        // A Ready / failed card has done its job once the app is open (the result shows in-app).
        // Wait a little: tapping "Listen" on the card turns it into the Listen activity instead.
        readyCleanupWorkItem?.cancel()
        let work = DispatchWorkItem { [weak self] in
            guard #available(iOS 16.1, *) else { return }
            guard UIApplication.shared.applicationState == .active else { return }
            Task {
                for activity in Activity<SarvamActivityAttributes>.activities
                where activity.content.state.phase == "ready" || activity.content.state.phase == "failed" {
                    SarvamNativeLogger.info("[ActivityKit] App is open; ending \(activity.content.state.phase) card id=\(activity.id)")
                    await activity.end(nil, dismissalPolicy: .immediate)
                    if self?.storedActivity?.id == activity.id { self?.activeActivity = nil }
                }
            }
        }
        readyCleanupWorkItem = work
        DispatchQueue.main.asyncAfter(deadline: .now() + 2.5, execute: work)
    }

    /// True when this activity shows a scan that is still running (never end or adopt it then).
    private func isRunningScan(_ activity: Activity<SarvamActivityAttributes>) -> Bool {
        let state = activity.content.state
        return state.phase == "scanning" && SarvamScanWorker.shared.currentDocId != nil
    }

    // MARK: - Scan progress ticker (runs only while the process is awake)
    public func startScanTicker() {
        DispatchQueue.main.async { [weak self] in
            guard let self = self else { return }
            self.scanTicker?.invalidate()
            let timer = Timer(timeInterval: 2.0, repeats: true) { [weak self] _ in
                self?.tickScan()
            }
            RunLoop.main.add(timer, forMode: .common)
            self.scanTicker = timer
            self.tickScan()
        }
    }

    public func stopScanTicker() {
        DispatchQueue.main.async { [weak self] in
            self?.scanTicker?.invalidate()
            self?.scanTicker = nil
        }
    }

    private func stageText(forFraction fraction: Double) -> String {
        let labels = scanStageLabels.count == 3
            ? scanStageLabels
            : ["Reading your document", "Checking against the document", "Writing your explanation"]
        if fraction < 0.35 { return labels[0] }
        if fraction < 0.70 { return labels[1] }
        return labels[2]
    }

    private func tickScan() {
        guard var state = lastState, state.phase == "scanning", let start = state.scanStartedAt else {
            scanTicker?.invalidate()
            scanTicker = nil
            return
        }
        guard SarvamScanWorker.shared.currentDocId == state.docId else {
            scanTicker?.invalidate()
            scanTicker = nil
            return
        }
        let estimate = Double(max(10, state.scanEstimateSeconds ?? 40))
        let elapsed = max(0, Date().timeIntervalSince(start))
        let fraction = elapsed / estimate
        // Same linear timeline as the system-drawn bar, held below 100 until the result exists.
        state.progress = min(99, max(1, Int(fraction * 100)))
        state.secondsRemaining = max(0, Int((estimate - elapsed).rounded(.up)))
        state.stage = stageText(forFraction: fraction)
        lastState = state

        guard #available(iOS 16.1, *) else { return }
        let target = activeActivity ?? liveActivities.first(where: { $0.attributes.activityId == state.docId })
        guard let activity = target, activity.content.state.phase == "scanning" else { return }
        let content = ActivityContent(state: state, staleDate: Date().addingTimeInterval(6))
        Task { await activity.update(content) }
    }

    /// Called by the scan worker when the scan finished, failed or was cancelled.
    public func scanDidStop() {
        stopScanTicker()
        DispatchQueue.main.async { [weak self] in
            self?.endScanningBackgroundTask()
        }
    }

    public func clearPendingScanRetry() {
        pendingScanState = nil
        scanRetryWorkItem?.cancel()
        scanRetryWorkItem = nil
    }

    public func requestScanActivityWithRetry(state: SarvamActivityAttributes.ContentState, attempt: Int = 1) {
        guard #available(iOS 16.1, *) else { return }
        setupForegroundObserver()

        let areEnabled = ActivityAuthorizationInfo().areActivitiesEnabled
        guard areEnabled else {
            SarvamNativeLogger.warning("[ActivityKit] Live Activities are disabled in Settings; skipping request")
            pendingScanState = nil
            return
        }

        // 1. Check if an activity already exists for this scan or can be adopted
        if let existing = liveActivities.first(where: { $0.attributes.activityId == state.docId }) ?? liveActivities.first {
            SarvamNativeLogger.info("[ActivityKit] Adopting existing activity id=\(existing.id) in place for docId=\(state.docId)")
            self.activeActivity = existing
            clearPendingScanRetry()
            if state.isListenPhase {
                // The listen service sends this (in order with the player's own updates).
                SarvamListenService.shared.track(activityId: existing.id, state: state)
            } else {
                Task {
                    await existing.update(ActivityContent(state: state, staleDate: nil))
                    SarvamNativeLogger.info("[ActivityKit] Updated adopted activity id=\(existing.id) in place")
                }
            }
            return
        }

        // 2. Log pending-start
        SarvamNativeLogger.info("[ActivityKit] pending-start: docId=\(state.docId) phase=\(state.phase) attempt=\(attempt)")
        self.pendingScanState = state

        do {
            let activity = try Activity.request(
                attributes: SarvamActivityAttributes(activityId: state.docId),
                content: ActivityContent(state: state, staleDate: nil),
                pushType: nil
            )
            self.activeActivity = activity
            clearPendingScanRetry()
            SarvamNativeLogger.info("[ActivityKit] Activity.request SUCCESS id=\(activity.id) docId=\(state.docId) phase=\(state.phase)")
        } catch {
            let errDesc = error.localizedDescription
            SarvamNativeLogger.warning("[ActivityKit] Activity.request FAILED (attempt \(attempt)): \(errDesc)")

            let maxAttempts = 5
            if attempt < maxAttempts {
                let delays: [Double] = [0.3, 1.0, 2.0, 4.0]
                let delay = delays[min(attempt - 1, delays.count - 1)]
                SarvamNativeLogger.info("[ActivityKit] Scheduling retry in \(delay)s (attempt \(attempt + 1)/\(maxAttempts))")
                self.scanRetryWorkItem?.cancel()
                let workItem = DispatchWorkItem { [weak self] in
                    self?.requestScanActivityWithRetry(state: state, attempt: attempt + 1)
                }
                self.scanRetryWorkItem = workItem
                DispatchQueue.main.asyncAfter(deadline: .now() + delay, execute: workItem)
            } else {
                SarvamNativeLogger.error("[ActivityKit] Activity.request exhausted \(maxAttempts) attempts for docId=\(state.docId)")
            }
        }
    }

    private func setupAudioPlayerBridge() {
        // One place keeps the Listen Live Activity in step with the player (also used when
        // "Listen" is tapped on the Ready card while the app is closed).
        SarvamListenService.shared.install()
    }

    @objc func echo(_ call: CAPPluginCall) {
        let value = call.getString("value") ?? "pong"
        SarvamNativeLogger.info("[Bridge] echo called via bridge: value=\(value)")
        call.resolve(["value": value, "bridgeActive": true])
    }

    @objc func updateScanProgress(_ call: CAPPluginCall) {
        SarvamNativeLogger.info("[Bridge] updateScanProgress called via bridge alias -> delegating to updateActivity")
        updateActivity(call)
    }

    @objc func markScanFailed(_ call: CAPPluginCall) {
        SarvamNativeLogger.info("[Bridge] markScanFailed called via bridge alias -> delegating to updateActivity")
        updateActivity(call)
    }

    @objc func isAvailable(_ call: CAPPluginCall) {
        if #available(iOS 16.1, *) {
            let areEnabled = ActivityAuthorizationInfo().areActivitiesEnabled
            SarvamNativeLogger.info("[Bridge] isAvailable called: areActivitiesEnabled=\(areEnabled)")
            call.resolve(["available": areEnabled])
        } else {
            SarvamNativeLogger.info("[Bridge] isAvailable called: iOS < 16.1 (false)")
            call.resolve(["available": false])
        }
    }

    @objc func startActivity(_ call: CAPPluginCall) {
        SarvamNativeLogger.info("[Bridge] startActivity called from JS")
        guard #available(iOS 16.1, *) else {
            SarvamNativeLogger.error("[Bridge] startActivity rejected: ActivityKit is not supported on this iOS version")
            call.reject("ActivityKit is not supported on this iOS version")
            return
        }

        let areEnabled = ActivityAuthorizationInfo().areActivitiesEnabled
        let activeCount = Activity<SarvamActivityAttributes>.activities.count
        let phase = call.getString("phase") ?? "scanning"
        let docId = call.getString("docId") ?? "doc"
        SarvamNativeLogger.info("[Bridge] startActivity parameters: docId=\(docId) phase=\(phase) areActivitiesEnabled=\(areEnabled) activeCount=\(activeCount)")

        guard areEnabled else {
            SarvamNativeLogger.error("[Bridge] startActivity FAILED: Live Activities are disabled by the user in Settings (areActivitiesEnabled=false)")
            call.reject("Live Activities are disabled by the user in Settings")
            return
        }

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
        if let tts = call.getString("ttsBase"), !tts.isEmpty {
            UserDefaults.standard.set(tts, forKey: SarvamListenService.ttsBaseKey)
        }

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
        self.lastPushedPosition = -100

        // Begin background task for scanning (Scenario S1-S4, S13)
        if phase == "scanning" {
            beginScanningBackgroundTask(docId: docId)
            requestScanActivityWithRetry(state: state, attempt: 1)
            call.resolve(["success": true, "docId": docId])
            return
        }

        // For non-scanning (e.g. listening):
        // If an existing activity matches or can be adopted:
        // Adopt the Ready card or an earlier Listen activity, never a scan that is still running.
        let adoptable = liveActivities.filter { !isRunningScan($0) }
        if let existing = adoptable.first(where: { $0.attributes.activityId == docId })
            ?? adoptable.first(where: { $0.content.state.isListenPhase || $0.content.state.phase == "ready" })
            ?? adoptable.first {
            SarvamNativeLogger.info("[ActivityKit] Adopting existing activity id=\(existing.id) for docId=\(docId)")
            self.activeActivity = existing
            clearPendingScanRetry()
            Task {
                await existing.update(ActivityContent(state: state, staleDate: nil))
                SarvamNativeLogger.info("[ActivityKit] Updated adopted activity id=\(existing.id) in place")
            }
            call.resolve(["success": true, "activityId": existing.id])
            return
        }

        let attributes = SarvamActivityAttributes(activityId: docId)
        do {
            let activity = try Activity.request(
                attributes: attributes,
                content: ActivityContent(state: state, staleDate: nil),
                pushType: nil
            )
            self.activeActivity = activity
            clearPendingScanRetry()
            if state.isListenPhase { SarvamListenService.shared.track(activityId: activity.id, state: state) }
            SarvamNativeLogger.info("[ActivityKit] Activity.request SUCCESS id=\(activity.id) docId=\(docId) phase=\(phase)")
            call.resolve(["success": true, "activityId": activity.id])
        } catch {
            SarvamNativeLogger.error("[ActivityKit] Activity.request FAILED: \(error.localizedDescription) (type: \(type(of: error)))")
            call.reject("Failed to request Live Activity: \(error.localizedDescription)")
        }
    }

    @objc func updateActivity(_ call: CAPPluginCall) {
        SarvamNativeLogger.info("[Bridge] updateActivity called from JS")
        guard let activity = activeActivity ?? liveActivities.first else {
            SarvamNativeLogger.warning("[Bridge] updateActivity skipped: no active activity")
            call.resolve(["success": false, "reason": "No active activity"])
            return
        }
        self.activeActivity = activity

        // A running scan belongs to the native worker; JS may only flip "show document name".
        if isRunningScan(activity), var scan = lastState, scan.phase == "scanning" {
            if let show = call.getBool("showDocumentName") { scan.showDocumentName = show }
            lastState = scan
            let snapshot = scan
            Task {
                await activity.update(ActivityContent(state: snapshot, staleDate: Date().addingTimeInterval(6)))
                call.resolve(["success": true, "scanOwned": true])
            }
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
            errorMessage: errorMessage,
            scanStartedAt: lastState?.scanStartedAt,
            scanEstimateSeconds: lastState?.scanEstimateSeconds
        )
        self.lastState = state
        if state.isListenPhase {
            // Listen state goes through the listen service (ordered with player updates; voice,
            // language and position come from the audio actually loaded).
            SarvamListenService.shared.track(activityId: activity.id, state: state)
            call.resolve(["success": true])
            return
        }

        if phase == "ready" {
            endScanningBackgroundTask()
        }

        let alertConfig: AlertConfiguration? = (phase == "ready")
            ? AlertConfiguration(title: "Ready", body: "Your document is ready", sound: .default)
            : nil

        SarvamNativeLogger.info("[ActivityKit] updateActivity: phase=\(phase) docId=\(docId) id=\(activity.id)")
        Task {
            await activity.update(
                ActivityContent(state: state, staleDate: nil),
                alertConfiguration: alertConfig
            )
            SarvamNativeLogger.info("[ActivityKit] updateActivity SUCCESS id=\(activity.id) phase=\(phase)")
            call.resolve(["success": true])
        }
    }

    @objc func endActivity(_ call: CAPPluginCall) {
        let requestedDocId = call.getString("docId")
        let force = call.getBool("force") ?? false
        let listenOnly = call.getBool("listenOnly") ?? false
        SarvamNativeLogger.info("[Bridge] endActivity called from JS docId=\(requestedDocId ?? "nil") force=\(force) listenOnly=\(listenOnly)")

        // The scan and Ready activities belong to the native scan worker. JS can only end a
        // Listen activity (and a failed card). Real log: JS ended the scan activity about a second
        // after it started, so the island never reached Ready.
        let candidates = liveActivities.filter { activity in
            let state = activity.content.state
            if state.isListenPhase { return true }
            if listenOnly { return false }
            if state.phase == "failed" || state.phase == "passwordNeeded" { return true }
            return false
        }

        if listenOnly || candidates.contains(where: { $0.content.state.isListenPhase }) {
            SarvamListenService.shared.untrack()
            SarvamAudioPlayer.shared.stop()
        }

        guard !candidates.isEmpty else {
            SarvamNativeLogger.info("[Bridge] endActivity: nothing JS may end (scan/Ready activities are kept)")
            call.resolve(["success": true, "skipped": true])
            return
        }

        Task {
            for activity in candidates {
                SarvamNativeLogger.info("[Bridge] Ending activity id=\(activity.id) phase=\(activity.content.state.phase)")
                await activity.end(nil, dismissalPolicy: .immediate)
                if self.storedActivity?.id == activity.id {
                    self.activeActivity = nil
                }
            }
            if let last = self.lastState, last.isListenPhase || last.phase == "failed" {
                self.lastState = nil
            }
            SarvamNativeLogger.info("[Bridge] endActivity SUCCESS ended=\(candidates.count)")
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
        let filePath = call.getString("filePath")
        let rate = call.getDouble("rate") ?? 1.0
        let autoStart = call.getBool("autoStart") ?? true
        if let audioDocId = call.getString("docId"), !audioDocId.isEmpty {
            SarvamListenService.shared.currentDocId = audioDocId
        }
        // Voice / language of THIS audio: the Listen card shows exactly these.
        if let voice = call.getString("voiceGender"), !voice.isEmpty {
            SarvamListenService.shared.currentVoiceGender = voice
        }
        if let code = call.getString("language"), !code.isEmpty {
            SarvamListenService.shared.currentLanguageCode = code
        }
        SarvamListenService.shared.currentLanguageLabel = langLabel

        SarvamNativeLogger.info("[Bridge] playAudio called from JS: title=\(title) hasData=\(audioData != nil) hasFile=\(filePath != nil) rate=\(rate) autoStart=\(autoStart)")

        var url: URL?
        if let filePath = filePath {
            guard FileManager.default.fileExists(atPath: filePath) else {
                SarvamNativeLogger.error("[Audio] playAudio rejected: file missing at \(filePath)")
                call.reject("Audio file not found", "file_missing")
                return
            }
            url = URL(fileURLWithPath: filePath)
        } else if let audioUrlString = audioUrlString {
            url = URL(string: audioUrlString)
        }

        // Captions follow the exact sentence timings saved with this file (none for other audio).
        SarvamListenService.shared.useSegments(forPath: filePath)
        SarvamAudioPlayer.shared.setRate(Float(rate))
        SarvamAudioPlayer.shared.play(
            url: url,
            audioBase64: audioData,
            title: title,
            langLabel: langLabel,
            duration: duration,
            startPosition: startPos,
            autoStart: autoStart
        )

        let realDuration = SarvamAudioPlayer.shared.totalDuration
        SarvamNativeLogger.info("[Bridge] playAudio resolved duration=\(realDuration)s")
        call.resolve(["success": true, "duration": realDuration])
    }

    /// Reports the real native player state. JS polls this (also re-syncs after the app returns
    /// from the background, when JS timers were suspended).
    @objc func getAudioState(_ call: CAPPluginCall) {
        let p = SarvamAudioPlayer.shared
        var out: [String: Any] = [
            "active": p.isActive,
            "playing": p.isPlaying,
            "position": p.currentPosition,
            "duration": p.totalDuration,
            "ended": p.hasEnded,
            "rate": Double(p.playbackRate),
            "docId": SarvamListenService.shared.currentDocId ?? ""
        ]
        // Once, when the sheet takes over audio started from the Ready card: its captions.
        if call.getBool("withSegments") ?? false {
            out["segments"] = SarvamListenService.shared.currentSegments.map {
                ["text": $0.text, "start": $0.start, "end": $0.end] as [String: Any]
            }
        }
        call.resolve(out)
    }

    @objc func setAudioRate(_ call: CAPPluginCall) {
        let rate = call.getDouble("rate") ?? 1.0
        SarvamNativeLogger.info("[Bridge] setAudioRate called from JS: rate=\(rate)")
        SarvamAudioPlayer.shared.setRate(Float(rate))
        call.resolve(["success": true])
    }

    /// Downloads server TTS natively into a temp file. The WKWebView fetch path (CapacitorHttp)
    /// returned HTTP 200 with 0 bytes for audio/wav, so JS could never play it.
    @objc func downloadSpeech(_ call: CAPPluginCall) {
        guard let urlString = call.getString("url"), let url = URL(string: urlString) else {
            call.reject("Invalid speech url", "bad_url")
            return
        }
        let body = call.getString("body") ?? "{}"
        let timeoutSeconds = (call.getDouble("timeoutMs") ?? 60000) / 1000.0

        var request = URLRequest(url: url, cachePolicy: .reloadIgnoringLocalCacheData, timeoutInterval: timeoutSeconds)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = body.data(using: .utf8)

        let started = CFAbsoluteTimeGetCurrent()
        SarvamNativeLogger.info("[TTS] POST \(url.path) started: bodyBytes=\(body.utf8.count) timeout=\(Int(timeoutSeconds))s")

        let task = URLSession.shared.dataTask(with: request) { data, response, error in
            let ms = Int((CFAbsoluteTimeGetCurrent() - started) * 1000)
            if let error = error {
                SarvamNativeLogger.error("[TTS] POST \(url.path) FAILED after \(ms)ms: \(error.localizedDescription)")
                call.reject("Network error: \(error.localizedDescription)", "network_error")
                return
            }
            guard let http = response as? HTTPURLResponse else {
                SarvamNativeLogger.error("[TTS] POST \(url.path) FAILED after \(ms)ms: no HTTP response")
                call.reject("No response", "no_response")
                return
            }
            guard (200..<300).contains(http.statusCode), let data = data, !data.isEmpty else {
                SarvamNativeLogger.error("[TTS] POST \(url.path) FAILED after \(ms)ms: status=\(http.statusCode) bytes=\(data?.count ?? 0)")
                call.reject("Speak error \(http.statusCode)", String(http.statusCode))
                return
            }
            let contentType = http.value(forHTTPHeaderField: "Content-Type") ?? "audio/wav"
            let lower = contentType.lowercased()
            let ext = (lower.contains("mpeg") || lower.contains("mp3")) ? "mp3" : "wav"
            let fileURL = FileManager.default.temporaryDirectory.appendingPathComponent("sarvam_tts_\(UUID().uuidString).\(ext)")
            do {
                try data.write(to: fileURL)
            } catch {
                SarvamNativeLogger.error("[TTS] Could not write audio file: \(error.localizedDescription)")
                call.reject("Could not save audio", "write_failed")
                return
            }
            let segments = SarvamSpeechSegment.parseHeader(http.value(forHTTPHeaderField: SarvamSpeechSegment.headerName))
            SarvamListenService.shared.rememberSegments(segments, forPath: fileURL.path)
            SarvamNativeLogger.info("[TTS] POST \(url.path) SUCCESS status=\(http.statusCode) duration=\(ms)ms bytes=\(data.count) type=\(contentType) sentences=\(segments.count)")
            call.resolve([
                "path": fileURL.path,
                "bytes": data.count,
                "status": http.statusCode,
                "contentType": contentType,
                "segments": segments.map { ["text": $0.text, "start": $0.start, "end": $0.end] as [String: Any] }
            ])
        }
        task.resume()
    }

    @objc func pauseAudio(_ call: CAPPluginCall) {
        SarvamNativeLogger.info("[Bridge] pauseAudio called from JS")
        SarvamAudioPlayer.shared.pause()
        SarvamNativeLogger.info("[Bridge] pauseAudio resolved")
        call.resolve(["success": true])
    }

    @objc func resumeAudio(_ call: CAPPluginCall) {
        SarvamNativeLogger.info("[Bridge] resumeAudio called from JS")
        SarvamAudioPlayer.shared.resume()
        SarvamNativeLogger.info("[Bridge] resumeAudio resolved")
        call.resolve(["success": true])
    }

    @objc func seekAudio(_ call: CAPPluginCall) {
        let position = call.getDouble("position") ?? 0
        // fast: live seeking while the in-app ruler is dragged (resolves at once, newest wins).
        let fast = call.getBool("fast") ?? false
        if fast {
            SarvamAudioPlayer.shared.seek(to: position, fast: true, completion: nil)
            call.resolve(["success": true, "position": SarvamAudioPlayer.shared.currentPosition])
            return
        }
        SarvamNativeLogger.info("[Bridge] seekAudio called from JS: position=\(position)")
        SarvamAudioPlayer.shared.seek(to: position, fast: false) {
            SarvamNativeLogger.info("[Bridge] seekAudio resolved")
            call.resolve(["success": true, "position": SarvamAudioPlayer.shared.currentPosition])
        }
    }

    @objc func stopAudio(_ call: CAPPluginCall) {
        SarvamNativeLogger.info("[Bridge] stopAudio called from JS")
        SarvamAudioPlayer.shared.stop()
        SarvamNativeLogger.info("[Bridge] stopAudio resolved")
        call.resolve(["success": true])
    }

    // MARK: - Background Scanning Task Management
    private func beginScanningBackgroundTask(docId: String) {
        endScanningBackgroundTask()
        backgroundTaskId = UIApplication.shared.beginBackgroundTask(withName: "SarvamDocumentScanning") { [weak self] in
            // iOS is about to suspend the app. The upload keeps running in the system's background
            // session and wakes the app when it finishes (then the card turns Ready). Stop the
            // percent ticker; the card goes stale and shows its system-driven countdown.
            SarvamNativeLogger.info("[ScanWorker] Background time is ending for docId=\(docId); scan continues in the background session")
            self?.scanTicker?.invalidate()
            self?.scanTicker = nil
            self?.endScanningBackgroundTask()
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
        let fileName = call.getString("fileName")
        let lang = call.getString("lang") ?? "en"
        let languageLabel = call.getString("languageLabel") ?? SarvamActivityAttributes.languageName(for: lang)
        let kind = call.getString("kind") ?? "photo"
        let apiBase = call.getString("apiBase") ?? "http://127.0.0.1:8080"
        let showDoc = call.getBool("showDocumentName") ?? false
        let password = call.getString("password")
        let labels = (call.getArray("stageLabels") as? [String]) ?? []
        if let tts = call.getString("ttsBase"), !tts.isEmpty {
            UserDefaults.standard.set(tts, forKey: SarvamListenService.ttsBaseKey)
        }
        guard let files = call.getArray("files") as? [[String: Any]], !files.isEmpty else {
            SarvamNativeLogger.error("[ScanWorker] startNativeScan rejected: no files provided")
            call.reject("No files provided for scan")
            return
        }

        let estimate = SarvamScanEstimator.estimateSeconds(kind: kind, fileCount: files.count)
        SarvamNativeLogger.info("[ScanWorker] startNativeScan called: docId=\(docId) files=\(files.count) lang=\(lang) kind=\(kind) estimate=\(estimate)s apiBase=\(apiBase)")

        scanStageLabels = labels.count == 3 ? labels : []
        let state = SarvamActivityAttributes.ContentState(
            phase: "scanning",
            docId: docId,
            title: title,
            fileName: fileName,
            fileCount: files.count,
            progress: 1,
            stage: stageText(forFraction: 0),
            secondsRemaining: estimate,
            language: lang,
            languageLabel: languageLabel,
            allowListen: lang != "or",
            showDocumentName: showDoc,
            scanStartedAt: Date(),
            scanEstimateSeconds: estimate
        )
        self.lastState = state

        requestScanActivityWithRetry(state: state, attempt: 1)

        let started = SarvamScanWorker.shared.startScan(
            docId: docId,
            title: title,
            lang: lang,
            kind: kind,
            apiBase: apiBase,
            showDocumentName: showDoc,
            files: files,
            password: password
        )

        if started {
            DispatchQueue.main.async { [weak self] in
                self?.beginScanningBackgroundTask(docId: docId)
            }
            startScanTicker()
            SarvamNativeLogger.info("[Bridge] startNativeScan resolved: docId=\(docId)")
            call.resolve(["success": true, "docId": docId, "estimateSeconds": estimate])
        } else {
            SarvamNativeLogger.error("[Bridge] startNativeScan rejected: failed to start scan task")
            call.reject("Failed to initiate native scan")
        }
    }

    @objc func checkPendingScanResult(_ call: CAPPluginCall) {
        let docId = call.getString("docId") ?? SarvamScanWorker.shared.currentDocId ?? "doc"
        let resultFile = SarvamScanWorker.resultFileURL(docId: docId)
        if FileManager.default.fileExists(atPath: resultFile.path) {
            if let data = try? Data(contentsOf: resultFile),
               let json = try? JSONSerialization.jsonObject(with: data, options: []) as? [String: Any] {
                SarvamNativeLogger.info("[Bridge] checkPendingScanResult docId=\(docId) status=ready bytes=\(data.count)")
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
                SarvamNativeLogger.warning("[Bridge] checkPendingScanResult docId=\(docId) status=error")
                call.resolve([
                    "ready": false,
                    "error": true,
                    "details": json
                ])
                return
            }
        }

        let isScanning = SarvamScanWorker.shared.isScanning(docId: docId)
        SarvamNativeLogger.info("[Bridge] checkPendingScanResult docId=\(docId) status=running(\(isScanning))")
        call.resolve([
            "ready": false,
            "running": isScanning
        ])
    }

    @objc func cancelNativeScan(_ call: CAPPluginCall) {
        SarvamNativeLogger.info("[Bridge] cancelNativeScan called from JS")
        clearPendingScanRetry()
        SarvamScanWorker.shared.cancelActiveScan()
        scanDidStop()
        SarvamNativeLogger.info("[Bridge] cancelNativeScan resolved")
        call.resolve(["success": true])
    }

    // MARK: - Native Document QuickLook & Share Sheets
    @objc func previewDocument(_ call: CAPPluginCall) {
        DispatchQueue.main.async { [weak self] in
            guard let self = self else { return }
            let fileName = call.getString("fileName") ?? "document.pdf"
            let title = call.getString("title") ?? fileName
            SarvamNativeLogger.info("[Bridge] previewDocument called from JS: fileName=\(fileName) title=\(title)")

            var targetURL: URL?
            if let base64 = call.getString("base64"), let data = Data(base64Encoded: base64) {
                let tempURL = FileManager.default.temporaryDirectory.appendingPathComponent(fileName)
                try? data.write(to: tempURL)
                targetURL = tempURL
            } else if let path = call.getString("url") {
                targetURL = URL(string: path)
            }

            guard let fileURL = targetURL else {
                SarvamNativeLogger.error("[Bridge] previewDocument rejected: no document data")
                call.reject("No document data or URL provided")
                return
            }

            let item = QuickLookPreviewItem(url: fileURL, title: title)
            self.qlDataSource = QuickLookPreviewControllerDataSource(item: item)

            let previewController = QLPreviewController()
            previewController.dataSource = self.qlDataSource

            if let presenter = self.bridge?.viewController {
                presenter.present(previewController, animated: true) {
                    SarvamNativeLogger.info("[Bridge] previewDocument resolved")
                    call.resolve(["success": true])
                }
            } else {
                SarvamNativeLogger.error("[Bridge] previewDocument rejected: no presenter")
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

            SarvamNativeLogger.info("[Bridge] shareContent called from JS: itemsCount=\(items.count)")

            guard !items.isEmpty else {
                SarvamNativeLogger.error("[Bridge] shareContent rejected: items empty")
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
                    SarvamNativeLogger.info("[Bridge] shareContent resolved")
                    call.resolve(["success": true])
                }
            } else {
                SarvamNativeLogger.error("[Bridge] shareContent rejected: no presenter")
                call.reject("No view controller to present share sheet")
            }
        }
    }

    @objc func getLastOpenedURL(_ call: CAPPluginCall) {
        let url = AppDelegate.lastOpenedURL
        AppDelegate.lastOpenedURL = nil
        SarvamNativeLogger.info("[Bridge] getLastOpenedURL called from JS: returning url=\(url ?? "nil")")
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

// MARK: - Scan length estimate (learned from recent scans on this phone)
public enum SarvamScanEstimator {
    private static let defaults = UserDefaults.standard

    private static func key(_ kind: String) -> String { "sarvam.scanSeconds.\(kind == "pdf" ? "pdf" : "photo")" }

    /// Expected scan length. A little longer than the recent average, so the bar rarely sits full.
    public static func estimateSeconds(kind: String, fileCount: Int) -> Int {
        let learned = defaults.double(forKey: key(kind))
        let base: Double = learned > 0 ? learned * 1.25 : (kind == "pdf" ? 55 : 35)
        let extra = Double(max(0, fileCount - 1)) * (kind == "pdf" ? 12 : 8)
        return Int(min(120, max(15, (base + extra).rounded())))
    }

    /// Keeps a smoothed average of how long one scan really took.
    public static func record(kind: String, seconds: Double, fileCount: Int) {
        guard seconds.isFinite, seconds > 2, seconds < 600 else { return }
        let perScan = seconds - Double(max(0, fileCount - 1)) * (kind == "pdf" ? 12 : 8)
        let old = defaults.double(forKey: key(kind))
        let next = old > 0 ? old * 0.6 + max(5, perScan) * 0.4 : max(5, perScan)
        defaults.set(next, forKey: key(kind))
        SarvamNativeLogger.info("[ScanWorker] Scan took \(Int(seconds))s; average for \(kind) is now \(Int(next))s")
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
    private var scanStartTime: CFAbsoluteTime = 0
    private var currentKind = "photo"
    private var currentFileCount = 1
    // Survives a relaunch: the system can wake a terminated app to deliver the upload result.
    private static let metaKey = "sarvam.activeScanMeta"

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
                SarvamNativeLogger.info("[ScanWorker] Received Darwin scan cancelled notification")
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
            SarvamNativeLogger.info("[ScanWorker] Saved result for docId=\(docId) (\(data.count) bytes)")
        }
    }

    public static func saveError(docId: String, errorJson: [String: Any]) {
        if let data = try? JSONSerialization.data(withJSONObject: errorJson, options: []) {
            try? data.write(to: errorFileURL(docId: docId))
            SarvamNativeLogger.error("[ScanWorker] Saved error for docId=\(docId): \(errorJson["message"] ?? "")")
        }
    }

    public static func clearCache(docId: String) {
        try? FileManager.default.removeItem(at: resultFileURL(docId: docId))
        try? FileManager.default.removeItem(at: errorFileURL(docId: docId))
    }

    /// Removes saved results older than three days.
    public static func pruneOldResults() {
        let fm = FileManager.default
        guard let items = try? fm.contentsOfDirectory(at: cacheDir, includingPropertiesForKeys: [.contentModificationDateKey]) else { return }
        let cutoff = Date().addingTimeInterval(-3 * 24 * 3600)
        for url in items where url.lastPathComponent.hasPrefix("scan_result_") || url.lastPathComponent.hasPrefix("scan_error_") {
            let modified = (try? url.resourceValues(forKeys: [.contentModificationDateKey]))?.contentModificationDate ?? Date()
            if modified < cutoff { try? fm.removeItem(at: url) }
        }
    }

    public func isScanning(docId: String) -> Bool {
        return currentDocId == docId && currentUploadTask != nil
    }

    public func startScan(
        docId: String,
        title: String,
        lang: String,
        kind: String = "photo",
        apiBase: String,
        showDocumentName: Bool,
        files: [[String: Any]],
        password: String? = nil
    ) -> Bool {
        cancelActiveScan(endActivities: false)
        isCancelled = false
        currentDocId = docId
        currentKind = kind
        currentFileCount = files.count
        receivedData = Data()
        scanStartTime = CFAbsoluteTimeGetCurrent()
        UserDefaults.standard.set([
            "docId": docId,
            "kind": kind,
            "fileCount": files.count,
            "startedAt": Date().timeIntervalSince1970
        ], forKey: Self.metaKey)
        Self.pruneOldResults()

        Self.clearCache(docId: docId)

        let boundary = "Boundary-\(UUID().uuidString)"
        let tempFileURL = FileManager.default.temporaryDirectory.appendingPathComponent("upload_\(docId)_\(UUID().uuidString).tmp")
        currentTempFile = tempFileURL

        guard let stream = OutputStream(url: tempFileURL, append: false) else {
            SarvamNativeLogger.error("[ScanWorker] Failed to create output stream at \(tempFileURL)")
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
            SarvamNativeLogger.error("[ScanWorker] [API] Invalid URL: \(apiBase)/api/explain")
            return false
        }

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("multipart/form-data; boundary=\(boundary)", forHTTPHeaderField: "Content-Type")

        let task = session.uploadTask(with: request, fromFile: tempFileURL)
        // The scan id travels with the task, so a relaunched app still saves the result under it
        // (it used to fall back to "doc", and the app could never find the result).
        task.taskDescription = docId
        currentUploadTask = task
        task.resume()
        SarvamNativeLogger.info("[ScanWorker] [API] POST /api/explain upload task started: docId=\(docId) files=\(files.count) lang=\(lang)")
        return true
    }

    /// Cancels the in-flight upload and clears the cache.
    /// - Parameter endActivities: pass `false` when a NEW scan is about to start, so the Live
    ///   Activity just requested for it is not torn down. The old code ended ALL activities here,
    ///   which killed the new scan's activity right after it started (real-device log:
    ///   "Activity.request SUCCESS" followed by "Ending activity ... due to cancel").
    public func cancelActiveScan(endActivities: Bool = true) {
        let cancelledDocId = currentDocId
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
        UserDefaults.standard.removeObject(forKey: Self.metaKey)

        guard endActivities else {
            SarvamNativeLogger.info("[ScanWorker] Previous scan cancelled; keeping the Live Activity for the new scan")
            return
        }

        if #available(iOS 16.1, *) {
            Task {
                // Only the scan's own card. A Listen activity keeps playing.
                for activity in Activity<SarvamActivityAttributes>.activities
                where activity.content.state.phase == "scanning" || activity.attributes.activityId == cancelledDocId {
                    if activity.content.state.isListenPhase { continue }
                    SarvamNativeLogger.info("[ScanWorker] Ending activity \(activity.id) due to cancel")
                    await activity.end(nil, dismissalPolicy: .immediate)
                }
            }
        }
    }

    // MARK: - URLSession Delegate Methods
    public func urlSession(_ session: URLSession, dataTask: URLSessionDataTask, didReceive data: Data) {
        receivedData.append(data)
        SarvamNativeLogger.debug("[ScanWorker] [API] Received data chunk: \(data.count) bytes (total=\(receivedData.count))")
    }

    public func urlSession(_ session: URLSession, task: URLSessionTask, didCompleteWithError error: Error?) {
        let meta = UserDefaults.standard.dictionary(forKey: Self.metaKey)
        let docId = task.taskDescription ?? currentDocId ?? (meta?["docId"] as? String) ?? "doc"
        let isCurrentTask = (currentUploadTask == nil || currentUploadTask?.taskIdentifier == task.taskIdentifier)
        if (error as NSError?)?.code == NSURLErrorCancelled || (isCancelled && isCurrentTask && currentDocId == nil) {
            SarvamNativeLogger.info("[ScanWorker] [API] POST /api/explain CANCELLED docId=\(docId)")
            finishBackgroundEvents()
            return
        }

        SarvamLiveActivityPlugin.shared?.clearPendingScanRetry()
        SarvamLiveActivityPlugin.shared?.scanDidStop()
        if let tmp = currentTempFile {
            try? FileManager.default.removeItem(at: tmp)
            currentTempFile = nil
        }
        let startedAt: Double = {
            if currentDocId == docId, scanStartTime > 0 { return Date().timeIntervalSince1970 - (CFAbsoluteTimeGetCurrent() - scanStartTime) }
            return (meta?["startedAt"] as? Double) ?? Date().timeIntervalSince1970
        }()
        let seconds = Date().timeIntervalSince1970 - startedAt
        let durationMs = Int(seconds * 1000)
        let kind = (currentDocId == docId) ? currentKind : ((meta?["kind"] as? String) ?? "photo")
        let fileCount = (currentDocId == docId) ? currentFileCount : ((meta?["fileCount"] as? Int) ?? 1)
        let httpResponse = task.response as? HTTPURLResponse
        let statusCode = httpResponse?.statusCode ?? (error != nil ? 500 : 200)
        let body = receivedData

        var failure: (message: String, type: String, status: Int)?
        if error != nil || statusCode >= 400 {
            if statusCode == 429 {
                failure = ("Too many requests. Please wait.", "http_429_rate_limit", statusCode)
            } else if statusCode == 503 || statusCode == 504 {
                failure = ("Service is busy. Please try again soon.", "http_\(statusCode)_busy", statusCode)
            } else {
                failure = ("Analysis failed. Please try again.", error != nil ? "network_error" : "http_\(statusCode)", statusCode)
            }
            SarvamNativeLogger.error("[ScanWorker] [API] POST /api/explain FAILED: docId=\(docId) status=\(statusCode) duration=\(durationMs)ms error=\(failure!.type) desc=\(error?.localizedDescription ?? "none")")
        } else if let json = try? JSONSerialization.jsonObject(with: body, options: []) as? [String: Any] {
            SarvamNativeLogger.info("[ScanWorker] [API] POST /api/explain SUCCESS: docId=\(docId) status=\(statusCode) duration=\(durationMs)ms bytes=\(body.count)")
            Self.saveResult(docId: docId, resultJson: json)
            SarvamScanEstimator.record(kind: kind, seconds: seconds, fileCount: fileCount)
        } else {
            SarvamNativeLogger.error("[ScanWorker] [API] Failed to parse JSON response docId=\(docId) (\(body.count) bytes) duration=\(durationMs)ms")
            failure = ("Service is busy", "json_parse_error", 500)
        }

        if let failure = failure {
            Self.saveError(docId: docId, errorJson: [
                "message": failure.message,
                "messageLocal": failure.message,
                "statusCode": failure.status
            ])
        }

        if currentDocId == docId || currentDocId == nil {
            currentUploadTask = nil
            currentDocId = nil
            receivedData = Data()
            UserDefaults.standard.removeObject(forKey: Self.metaKey)
        }

        guard #available(iOS 16.1, *) else {
            finishBackgroundEvents()
            return
        }
        let outcome = failure  // a let: Task closures cannot capture a var
        Task {
            let all = Activity<SarvamActivityAttributes>.activities
            var targets = all.filter { $0.attributes.activityId == docId && !$0.content.state.isListenPhase }
            if targets.isEmpty {
                targets = all.filter { $0.content.state.phase == "scanning" }
            }
            let appIsActive = await MainActor.run { UIApplication.shared.applicationState == .active }

            for activity in targets {
                var updated = activity.content.state
                if let failure = outcome {
                    updated.phase = "failed"
                    updated.stage = failure.message
                    updated.errorMessage = failure.message
                    SarvamNativeLogger.info("[ScanWorker] Updating Activity \(activity.id) to failed (\(failure.type))")
                    await activity.update(ActivityContent(state: updated, staleDate: nil))
                } else if appIsActive {
                    // The user is looking at the app: the result opens in-app right away, so no
                    // Ready card or sound, just end the scan activity.
                    SarvamNativeLogger.info("[ScanWorker] App is in the foreground; ending scan activity \(activity.id) (result is shown in-app)")
                    await activity.end(nil, dismissalPolicy: .immediate)
                } else {
                    updated.phase = "ready"
                    updated.stage = "Ready"
                    updated.progress = 100
                    updated.secondsRemaining = 0
                    let alertConfig = AlertConfiguration(
                        title: "Ready",
                        body: "Your document is ready",
                        sound: .default
                    )
                    SarvamNativeLogger.info("[ScanWorker] Updating Activity \(activity.id) to ready")
                    await activity.update(
                        ActivityContent(state: updated, staleDate: nil),
                        alertConfiguration: alertConfig
                    )
                }
            }
            self.finishBackgroundEvents()
        }
    }

    private func finishBackgroundEvents() {
        if let handler = backgroundCompletionHandler {
            backgroundCompletionHandler = nil
            DispatchQueue.main.async {
                SarvamNativeLogger.info("[ScanWorker] Background completion handler executed")
                handler()
            }
        }
    }
}
