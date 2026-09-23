import UIKit
import Capacitor

@UIApplicationMain
class AppDelegate: UIResponder, UIApplicationDelegate {

    var window: UIWindow?

    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        // Плеер: категория playback — песня продолжает играть при блокировке экрана и в фоне
        // (вместе с UIBackgroundModes=audio в Info.plist) и не глохнет от переключателя «без звука».
        try? AVAudioSession.sharedInstance().setCategory(.playback, mode: .default)
        // Override point for customization after application launch.
        return true
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

    // Push-уведомления (APNs): передаём результат регистрации плагину @capacitor/push-notifications.
    // Без этих двух методов события 'registration' / 'registrationError' на JS-стороне не приходят никогда.
    func application(_ application: UIApplication, didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
        NotificationCenter.default.post(name: .capacitorDidRegisterForRemoteNotifications, object: deviceToken)
    }

    func application(_ application: UIApplication, didFailToRegisterForRemoteNotificationsWithError error: Error) {
        NotificationCenter.default.post(name: .capacitorDidFailToRegisterForRemoteNotifications, object: error)
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

import MediaPlayer
import AVFoundation

// Плеер — громкость по кнопкам айфона (Алла 23.09): на iOS WebKit audio.volume из JS
// не задаётся (Apple, "Safari HTML5 Audio and Video Guide": «the volume property is not
// settable in JavaScript»). Системную громкость читаем через AVAudioSession.outputVolume
// (+ KVO для live-слежения за кнопками громкости), а меняем через скрытый MPVolumeView —
// единственный официальный способ программно подвинуть системный уровень звука на iOS.
@objc(SystemVolumePlugin)
public class SystemVolumePlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "SystemVolumePlugin"
    public let jsName = "SystemVolume"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "getVolume", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setVolume", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "startWatching", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "stopWatching", returnType: CAPPluginReturnPromise)
    ]

    private var volumeView: MPVolumeView?
    private var volumeSlider: UISlider?
    private var volumeObservation: NSKeyValueObservation?

    @objc func getVolume(_ call: CAPPluginCall) {
        call.resolve(["value": AVAudioSession.sharedInstance().outputVolume])
    }

    @objc func setVolume(_ call: CAPPluginCall) {
        guard let value = call.getFloat("value") else {
            call.reject("value required")
            return
        }
        DispatchQueue.main.async {
            self.withHiddenVolumeSlider { slider in
                slider?.value = value
            }
        }
        call.resolve()
    }

    @objc func startWatching(_ call: CAPPluginCall) {
        try? AVAudioSession.sharedInstance().setActive(true)
        if volumeObservation == nil {
            volumeObservation = AVAudioSession.sharedInstance().observe(\.outputVolume, options: [.new]) { [weak self] session, _ in
                self?.notifyListeners("volumeChange", data: ["value": session.outputVolume])
            }
        }
        call.resolve()
    }

    @objc func stopWatching(_ call: CAPPluginCall) {
        volumeObservation?.invalidate()
        volumeObservation = nil
        call.resolve()
    }

    // Скрытый MPVolumeView создаётся один раз на главном потоке; его внутренний UISlider —
    // единственный API, которым можно физически подвинуть системную громкость с iOS 13+.
    private func withHiddenVolumeSlider(_ completion: @escaping (UISlider?) -> Void) {
        if let slider = volumeSlider {
            completion(slider)
            return
        }
        guard let hostView = self.bridge?.viewController?.view else {
            completion(nil)
            return
        }
        let view = MPVolumeView(frame: CGRect(x: -1000, y: -1000, width: 40, height: 40))
        view.alpha = 0.01
        hostView.addSubview(view)
        volumeView = view
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.05) {
            let slider = view.subviews.first(where: { $0 is UISlider }) as? UISlider
            self.volumeSlider = slider
            completion(slider)
        }
    }
}

// Плеер (Алла, TestFlight 26: «бегунок живёт своей жизнью»): корень — плагин SystemVolume
// регистрировался в applicationDidBecomeActive, а Capacitor отдаёт вебу список плагинов
// один раз при старте моста. Поздняя регистрация в JS не видна — Purchases/SocialLogin
// приходят как поды, а свой плагин надо объявлять до загрузки WebView: в capacitorDidLoad()
// подкласса CAPBridgeViewController (класс указан в Main.storyboard).
class ViewController: CAPBridgeViewController {
    override open func capacitorDidLoad() {
        bridge?.registerPluginInstance(SystemVolumePlugin())
    }
}
