import ActivityKit
import Capacitor
import Foundation
import UIKit

@objc(SarvamLiveActivityPlugin)
public class SarvamLiveActivityPlugin: CAPPlugin, CAPBridgedPlugin {
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
        CAPPluginMethod(name: "isAvailable", returnType: CAPPluginReturnPromise)
    ]

    private var activeActivity: Activity<SarvamActivityAttributes>?
    private var backgroundTaskId: UIBackgroundTaskIdentifier = .invalid
    private var lastState: SarvamActivityAttributes.ContentState?

    override public func load() {
        super.load()
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
}
