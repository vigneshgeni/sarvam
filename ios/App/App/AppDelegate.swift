import UIKit
import Capacitor
import ActivityKit

@UIApplicationMain
class AppDelegate: UIResponder, UIApplicationDelegate {

    var window: UIWindow?

    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        handleDebugLaunchArguments()
        return true
    }

    private func handleDebugLaunchArguments() {
        let args = ProcessInfo.processInfo.arguments
        print("SARVAM_DEBUG: Launch args = \(args)")

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
                languageLabel: "English"
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
                allowListen: true
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
                allowListen: true
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
                allowListen: true
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
                allowListen: true
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
        // Called when the app was launched with a url. Feel free to add additional processing here,
        // but if you want the App API to support tracking app url opens, make sure to keep this call
        return ApplicationDelegateProxy.shared.application(app, open: url, options: options)
    }

    func application(_ application: UIApplication, continue userActivity: NSUserActivity, restorationHandler: @escaping ([UIUserActivityRestoring]?) -> Void) -> Bool {
        // Called when the app was launched with an activity, including Universal Links.
        // Feel free to add additional processing here, but if you want the App API to support
        // tracking app url opens, make sure to keep this call
        return ApplicationDelegateProxy.shared.application(application, continue: userActivity, restorationHandler: restorationHandler)
    }

}
