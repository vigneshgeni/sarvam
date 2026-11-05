import UIKit
import Capacitor

class SceneDelegate: UIResponder, UIWindowSceneDelegate {

    var window: UIWindow?

    func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options connectionOptions: UIScene.ConnectionOptions) {
        guard let windowScene = (scene as? UIWindowScene) else { return }
        DispatchQueue.main.async {
            if let rootVC = windowScene.windows.first?.rootViewController as? CAPBridgeViewController {
                rootVC.bridge?.registerPluginType(SarvamLiveActivityPlugin.self)
                print("SARVAM_NATIVE: SceneDelegate verified SarvamLiveActivityPlugin registration!")
            }
        }
    }

    func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
        for context in URLContexts {
            _ = ApplicationDelegateProxy.shared.application(UIApplication.shared, open: context.url, options: [:])
        }
    }
}
