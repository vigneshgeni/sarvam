import UIKit
import Capacitor
import ActivityKit
import WebKit

@UIApplicationMain
class AppDelegate: UIResponder, UIApplicationDelegate {

    var window: UIWindow?
    public static var lastOpenedURL: String?

    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        if let url = launchOptions?[.url] as? URL {
            AppDelegate.lastOpenedURL = url.absoluteString
            SarvamNativeLogger.info("[Lifecycle] App launched with URL: \(url.scheme ?? "")://\(url.host ?? "")")
        }
        let areEnabled: Bool
        if #available(iOS 16.1, *) {
            areEnabled = ActivityAuthorizationInfo().areActivitiesEnabled
        } else {
            areEnabled = false
        }
        SarvamNativeLogger.info("[Lifecycle] didFinishLaunchingWithOptions: areActivitiesEnabled=\(areEnabled)")
        #if DEBUG
        handleDebugLaunchArguments()
        #endif
        return true
    }

    #if DEBUG
    private func handleDebugLaunchArguments() {
        let args = ProcessInfo.processInfo.arguments
        print("SARVAM_DEBUG: Launch args = \(args)")
        let showDoc = args.contains("--show-doc-name")

        var stateToStart: SarvamActivityAttributes.ContentState?

        if args.contains("--start-scan-62") {
            stateToStart = SarvamActivityAttributes.ContentState(
                phase: "scanning",
                docId: "debug-scan",
                title: "image.jpg",
                fileName: "image.jpg",
                fileCount: 1,
                progress: 62,
                stage: "Checking against the document",
                secondsRemaining: 15,
                language: "en",
                languageLabel: "English",
                showDocumentName: showDoc
            )
        } else if args.contains("--start-ready") {
            stateToStart = SarvamActivityAttributes.ContentState(
                phase: "ready",
                docId: "debug-ready",
                title: "image.jpg",
                fileName: "image.jpg",
                fileCount: 1,
                progress: 100,
                stage: "Ready",
                secondsRemaining: 0,
                language: "en",
                languageLabel: "English",
                allowListen: true,
                showDocumentName: showDoc
            )
        } else if args.contains("--start-listen-en") {
            stateToStart = SarvamActivityAttributes.ContentState(
                phase: "listening",
                docId: "debug-listen",
                title: "Laboratory Report",
                fileCount: 1,
                progress: 50,
                stage: "Listening",
                secondsRemaining: 0,
                language: "en",
                languageLabel: "English",
                voiceGender: "female",
                currentTime: 45,
                duration: 90,
                allowListen: true,
                showDocumentName: showDoc
            )
        } else if args.contains("--start-listen-ta") {
            stateToStart = SarvamActivityAttributes.ContentState(
                phase: "listening",
                docId: "debug-listen-ta",
                title: "Laboratory Report",
                fileCount: 1,
                progress: 50,
                stage: "Listening",
                secondsRemaining: 0,
                language: "ta",
                languageLabel: "தமிழ் · Female",
                voiceGender: "female",
                currentTime: 45,
                duration: 90,
                allowListen: true,
                showDocumentName: showDoc
            )
        } else if args.contains("--start-listen-paused") {
            stateToStart = SarvamActivityAttributes.ContentState(
                phase: "paused",
                docId: "debug-listen-paused",
                title: "Laboratory Report",
                fileCount: 1,
                progress: 50,
                stage: "Paused",
                secondsRemaining: 0,
                language: "ta",
                languageLabel: "தமிழ் · Female",
                voiceGender: "female",
                currentTime: 45,
                duration: 90,
                allowListen: true,
                showDocumentName: showDoc
            )
        } else if args.contains("--start-scan-failed") {
            stateToStart = SarvamActivityAttributes.ContentState(
                phase: "failed",
                docId: "debug-scan-failed",
                title: "image.jpg",
                fileName: "image.jpg",
                fileCount: 1,
                progress: 62,
                stage: "Service is busy",
                secondsRemaining: 0,
                language: "en",
                languageLabel: "English",
                showDocumentName: showDoc,
                errorMessage: "Service is busy"
            )
        } else if args.contains("--start-scan-timeout") {
            stateToStart = SarvamActivityAttributes.ContentState(
                phase: "failed",
                docId: "debug-scan-timeout",
                title: "image.jpg",
                fileName: "image.jpg",
                fileCount: 1,
                progress: 62,
                stage: "Open Sarvam to finish",
                secondsRemaining: 0,
                language: "en",
                languageLabel: "English",
                showDocumentName: showDoc,
                errorMessage: "Open Sarvam to finish"
            )
        } else if args.contains("--start-listen-finished") {
            stateToStart = SarvamActivityAttributes.ContentState(
                phase: "finished",
                docId: "debug-listen-finished",
                title: "Laboratory Report",
                fileCount: 1,
                progress: 100,
                stage: "Finished",
                secondsRemaining: 0,
                language: "ta",
                languageLabel: "தமிழ் · Female",
                voiceGender: "female",
                currentTime: 90,
                duration: 90,
                allowListen: true,
                showDocumentName: showDoc
            )
        }

        if let state = stateToStart, #available(iOS 16.1, *) {
            let enabled = ActivityAuthorizationInfo().areActivitiesEnabled
            print("SARVAM_DEBUG: Activities enabled = \(enabled)")
            Task {
                for activity in Activity<SarvamActivityAttributes>.activities {
                    print("SARVAM_DEBUG: Ending existing activity \(activity.id)")
                    await activity.end(nil, dismissalPolicy: .immediate)
                }
                do {
                    let activity = try Activity.request(
                        attributes: SarvamActivityAttributes(activityId: state.docId),
                        content: ActivityContent(state: state, staleDate: nil),
                        pushType: nil
                    )
                    print("SARVAM_DEBUG: Activity successfully started with ID: \(activity.id)")
                } catch {
                    print("SARVAM_DEBUG: Failed to start activity: \(error)")
                }
            }
        } else {
            print("SARVAM_DEBUG: No state to start or iOS < 16.1 (stateToStart: \(String(describing: stateToStart)))")
        }
    }
    #endif

    func applicationWillResignActive(_ application: UIApplication) {
        // Sent when the application is about to move from active to inactive state. This can occur for certain types of temporary interruptions (such as an incoming phone call or SMS message) or when the user quits the application and it begins the transition to the background state.
        // Use this method to pause ongoing tasks, disable timers, and invalidate graphics rendering callbacks. Games should use this method to pause the game.
    }

    func applicationDidEnterBackground(_ application: UIApplication) {
        // Use this method to release shared resources, save user data, invalidate timers, and store enough application state information to restore your application to its current state in case it is terminated later.
        // If your application supports background execution, this method is called instead of applicationWillTerminate: when the user quits.
    }

    func applicationWillEnterForeground(_ application: UIApplication) {
        // Called as part of the transition from the background to the active state; here you can undo many of the changes made on entering the background.
    }

    func applicationDidBecomeActive(_ application: UIApplication) {
        // Restart any tasks that were paused (or not yet started) while the application was inactive. If the application was previously in the background, optionally refresh the user interface.
    }

    func applicationWillTerminate(_ application: UIApplication) {
        // Called when the application is about to terminate. Save data if appropriate. See also applicationDidEnterBackground:.
    }

    func application(_ app: UIApplication, open url: URL, options: [UIApplication.OpenURLOptionsKey: Any] = [:]) -> Bool {
        SarvamNativeLogger.info("[Lifecycle] openURL received: scheme=\(url.scheme ?? "") host=\(url.host ?? "") path=\(url.path)")
        AppDelegate.lastOpenedURL = url.absoluteString
        if let bridgeVC = window?.rootViewController as? CAPBridgeViewController, let web = bridgeVC.webView {
            let escaped = url.absoluteString.replacingOccurrences(of: "'", with: "\\'")
            let js = "window.dispatchEvent(new CustomEvent('sarvamDeepLink', { detail: { url: '\(escaped)' } }));"
            web.evaluateJavaScript(js, completionHandler: nil)
        }
        return ApplicationDelegateProxy.shared.application(app, open: url, options: options)
    }

    func application(_ application: UIApplication, continue userActivity: NSUserActivity, restorationHandler: @escaping ([UIUserActivityRestoring]?) -> Void) -> Bool {
        SarvamNativeLogger.info("[Lifecycle] continue userActivity: type=\(userActivity.activityType)")
        return ApplicationDelegateProxy.shared.application(application, continue: userActivity, restorationHandler: restorationHandler)
    }

    func application(_ application: UIApplication, handleEventsForBackgroundURLSession identifier: String, completionHandler: @escaping () -> Void) {
        SarvamNativeLogger.info("[Lifecycle] handleEventsForBackgroundURLSession: identifier=\(identifier)")
        SarvamScanWorker.shared.backgroundCompletionHandler = {
            SarvamNativeLogger.info("[Lifecycle] Executing background completion handler for identifier=\(identifier)")
            completionHandler()
        }
    }

}

// MARK: - Custom Bridge View Controller for Native Shell Configuration
class SarvamBridgeViewController: CAPBridgeViewController {
    override func capacitorDidLoad() {
        super.capacitorDidLoad()
        let plugin = SarvamLiveActivityPlugin()
        bridge?.registerPluginInstance(plugin)
        SarvamNativeLogger.info("[Bridge] SarvamBridgeViewController registered SarvamLiveActivityPlugin instance on bridge: jsName=\(plugin.jsName), identifier=\(plugin.identifier)")
        if let registered = bridge?.plugin(withName: plugin.jsName) {
            SarvamNativeLogger.info("[Bridge] Verified registration: bridge has plugin \(type(of: registered))")
        } else {
            SarvamNativeLogger.error("[Bridge] CRITICAL: bridge plugin lookup for \(plugin.jsName) returned nil!")
        }
    }

    override func viewDidLoad() {
        super.viewDidLoad()

        let sarvamCream = UIColor(red: 244/255, green: 245/255, blue: 242/255, alpha: 1.0)
        view.backgroundColor = sarvamCream

        if let web = webView {
            web.allowsBackForwardNavigationGestures = true
            web.isOpaque = false
            web.backgroundColor = sarvamCream
            web.scrollView.backgroundColor = sarvamCream
            web.scrollView.contentInsetAdjustmentBehavior = .never
            SarvamNativeLogger.info("[Lifecycle] WKWebView configured with swipe gestures and #F4F5F2 background")
        }
    }

    #if DEBUG
    override func viewDidAppear(_ animated: Bool) {
        super.viewDidAppear(animated)
        if ProcessInfo.processInfo.arguments.contains("--run-bridge-matrix") {
            runBridgeVerificationMatrix()
        }
    }

    private func runBridgeVerificationMatrix() {
        guard let web = webView else { return }
        SarvamNativeLogger.info("[BridgeTest] Launch argument --run-bridge-matrix detected; starting JS round-trip test matrix...")
        let jsTest = """
        (async function() {
            console.log('[BridgeTest] JS Bridge Test Runner started in WKWebView');
            const plugin = window.__sarvamNativePlugin || window.Capacitor?.Plugins?.SarvamLiveActivity;
            if (!plugin) {
                console.error('[BridgeTest] Plugin SarvamLiveActivity not found on window');
                return;
            }
            try {
                // 1. echo
                const echoRes = await plugin.echo({ value: 'hello_bridge' });
                console.log('[BridgeTest] 1. echo result: ' + JSON.stringify(echoRes));

                // 2. isAvailable
                const availRes = await plugin.isAvailable();
                console.log('[BridgeTest] 2. isAvailable result: ' + JSON.stringify(availRes));

                // 3. startActivity
                const startRes = await plugin.startActivity({
                    docId: 'test-matrix-doc',
                    phase: 'scanning',
                    title: 'Your document',
                    fileCount: 1,
                    progress: 10,
                    stage: 'Reading document',
                    showDocumentName: false
                });
                console.log('[BridgeTest] 3. startActivity result: ' + JSON.stringify(startRes));

                // 4. updateActivity
                const updateRes = await plugin.updateActivity({
                    docId: 'test-matrix-doc',
                    phase: 'scanning',
                    progress: 50,
                    stage: 'Analyzing document…'
                });
                console.log('[BridgeTest] 4. updateActivity result: ' + JSON.stringify(updateRes));

                // 5. updateScanProgress (alias)
                const scanProgRes = await plugin.updateScanProgress({
                    docId: 'test-matrix-doc',
                    progress: 60,
                    stageText: 'Still analyzing…'
                });
                console.log('[BridgeTest] 5. updateScanProgress result: ' + JSON.stringify(scanProgRes));

                // 6. markScanFailed (alias)
                const failRes = await plugin.markScanFailed({
                    docId: 'test-matrix-doc',
                    errorMessage: 'Service is busy'
                });
                console.log('[BridgeTest] 6. markScanFailed result: ' + JSON.stringify(failRes));

                // 7. playAudio
                const playRes = await plugin.playAudio({
                    title: 'Your document',
                    langLabel: 'English',
                    duration: 30
                });
                console.log('[BridgeTest] 7. playAudio result: ' + JSON.stringify(playRes));

                // 8. pauseAudio
                const pauseRes = await plugin.pauseAudio();
                console.log('[BridgeTest] 8. pauseAudio result: ' + JSON.stringify(pauseRes));

                // 9. resumeAudio
                const resumeRes = await plugin.resumeAudio();
                console.log('[BridgeTest] 9. resumeAudio result: ' + JSON.stringify(resumeRes));

                // 10. seekAudio
                const seekRes = await plugin.seekAudio({ position: 10 });
                console.log('[BridgeTest] 10. seekAudio result: ' + JSON.stringify(seekRes));

                // 11. stopAudio
                const stopRes = await plugin.stopAudio();
                console.log('[BridgeTest] 11. stopAudio result: ' + JSON.stringify(stopRes));

                // 12. startNativeScan
                const scanRes = await plugin.startNativeScan({
                    docId: 'test-matrix-doc',
                    title: 'Your document',
                    lang: 'en',
                    apiBase: 'http://127.0.0.1:8080',
                    showDocumentName: false,
                    files: [{
                        name: 'sample.pdf',
                        type: 'application/pdf',
                        base64: 'JVBERi0xLjQKJcTl8uXrCg=='
                    }]
                });
                console.log('[BridgeTest] 12. startNativeScan result: ' + JSON.stringify(scanRes));

                // 13. checkPendingScanResult
                const checkRes = await plugin.checkPendingScanResult({ docId: 'test-matrix-doc' });
                console.log('[BridgeTest] 13. checkPendingScanResult result: ' + JSON.stringify(checkRes));

                // 14. cancelNativeScan
                const cancelRes = await plugin.cancelNativeScan({ docId: 'test-matrix-doc' });
                console.log('[BridgeTest] 14. cancelNativeScan result: ' + JSON.stringify(cancelRes));

                // 15. getLastOpenedURL
                const urlRes = await plugin.getLastOpenedURL();
                console.log('[BridgeTest] 15. getLastOpenedURL result: ' + JSON.stringify(urlRes));

                // 16. endActivity
                const endRes = await plugin.endActivity({ docId: 'test-matrix-doc' });
                console.log('[BridgeTest] 16. endActivity result: ' + JSON.stringify(endRes));

                console.log('[BridgeTest] ALL 16 BRIDGE METHODS COMPLETED ROUND-TRIP SUCCESSFULLY!');
            } catch (err) {
                console.error('[BridgeTest] Method failed with error:', err);
            }
        })();
        """
        DispatchQueue.main.asyncAfter(deadline: .now() + 2.0) {
            web.evaluateJavaScript(jsTest) { _, error in
                if let error = error {
                    SarvamNativeLogger.error("[BridgeTest] evaluateJavaScript failed: \(error)")
                } else {
                    SarvamNativeLogger.info("[BridgeTest] evaluateJavaScript dispatched successfully")
                }
            }
        }
    }
    #endif

    override var preferredStatusBarStyle: UIStatusBarStyle {
        return .darkContent
    }
}
