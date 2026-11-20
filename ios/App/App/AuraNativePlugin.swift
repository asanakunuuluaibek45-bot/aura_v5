import Capacitor
import UIKit
import Security
import WebKit
import Network

final class AuraBridgeViewController: CAPBridgeViewController {
    override func capacitorDidLoad() {
        bridge?.registerPluginInstance(AuraNativePlugin())
    }
}

/// Registered only on the packaged local bridge. Remote CRM gets no native bridge.
@objc(AuraNativePlugin)
public class AuraNativePlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "AuraNativePlugin"
    public let jsName = "AuraNative"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "get", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "set", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "remove", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "openOnline", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "closeOnline", returnType: CAPPluginReturnPromise)
    ]
    private weak var onlineNavigation: UINavigationController?
    private let paths: Set<String> = [
        "/crm/money", "/crm/showcase", "/crm/customers", "/crm/reports",
        "/crm/suppliers", "/crm/stores", "/crm/notifications", "/crm/cabinet"
    ]
    private func query(_ call: CAPPluginCall) -> [String: Any]? {
        guard let key = call.getString("key"), key.hasPrefix("sb-"), key.count < 256 else {
            call.reject("Invalid storage key"); return nil
        }
        return [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: (Bundle.main.bundleIdentifier ?? "com.auracrm.app") + ".auth",
            kSecAttrAccount as String: key
        ]
    }
    @objc func get(_ call: CAPPluginCall) {
        guard var q = query(call) else { return }
        q[kSecReturnData as String] = true
        q[kSecMatchLimit as String] = kSecMatchLimitOne
        var result: CFTypeRef?
        let status = SecItemCopyMatching(q as CFDictionary, &result)
        if status == errSecItemNotFound { call.resolve(["value": NSNull()]); return }
        guard status == errSecSuccess, let data = result as? Data,
              let value = String(data: data, encoding: .utf8) else {
            call.reject("Keychain read failed", String(status)); return
        }
        call.resolve(["value": value])
    }
    @objc func set(_ call: CAPPluginCall) {
        guard let q = query(call) else { return }
        guard let value = call.getString("value"), let data = value.data(using: .utf8) else {
            call.reject("Missing storage value"); return
        }
        let attributes: [String: Any] = [
            kSecValueData as String: data,
            kSecAttrAccessible as String: kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
        ]
        var status = SecItemUpdate(q as CFDictionary, attributes as CFDictionary)
        if status == errSecItemNotFound {
            status = SecItemAdd(q.merging(attributes) { _, new in new } as CFDictionary, nil)
        }
        guard status == errSecSuccess else {
            call.reject("Keychain write failed", String(status)); return
        }
        call.resolve()
    }
    @objc func remove(_ call: CAPPluginCall) {
        guard let q = query(call) else { return }
        let status = SecItemDelete(q as CFDictionary)
        guard status == errSecSuccess || status == errSecItemNotFound else {
            call.reject("Keychain removal failed", String(status)); return
        }
        call.resolve()
    }
    @objc func openOnline(_ call: CAPPluginCall) {
        guard let path = call.getString("path"), paths.contains(path),
              let token = call.getString("accessToken"), !token.isEmpty,
              let origin = Bundle.main.object(forInfoDictionaryKey: "AuraWebOrigin") as? String,
              let base = URL(string: origin), base.scheme == "https", base.host != nil,
              let endpoint = URL(string: "/auth/native", relativeTo: base)?.absoluteURL else {
            call.reject("Invalid online destination"); return
        }
        DispatchQueue.main.async {
            guard self.onlineNavigation == nil, let presenter = self.bridge?.viewController,
                  presenter.presentedViewController == nil else {
                call.reject("Another screen is already open"); return
            }
            let controller = AuraOnlineController(origin: base)
            controller.onLocalNavigate = { [weak self] path in
                self?.notifyListeners("localNavigate", data: ["path": path])
            }
            let nav = UINavigationController(rootViewController: controller)
            nav.modalPresentationStyle = .fullScreen
            self.onlineNavigation = nav
            var request = URLRequest(url: endpoint, cachePolicy: .reloadIgnoringLocalCacheData, timeoutInterval: 30)
            request.httpMethod = "POST"
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            request.setValue("1", forHTTPHeaderField: "X-Aura-Native")
            request.httpBody = try? JSONSerialization.data(withJSONObject: ["accessToken": token, "path": path])
            presenter.present(nav, animated: true) {
                controller.load(request)
                call.resolve()
            }
        }
    }
    @objc func closeOnline(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            self.onlineNavigation?.dismiss(animated: false)
            self.onlineNavigation = nil
            call.resolve()
        }
    }
}

/// No script handlers, no Capacitor bridge, no shared offline database or cookies.
private final class AuraOnlineController: UIViewController, WKNavigationDelegate {
    var onLocalNavigate: ((String) -> Void)?
    private let origin: URL
    private let web: WKWebView
    private let monitor = NWPathMonitor()
    init(origin: URL) {
        self.origin = origin
        let config = WKWebViewConfiguration()
        config.websiteDataStore = .nonPersistent()
        web = WKWebView(frame: .zero, configuration: config)
        super.init(nibName: nil, bundle: nil)
    }
    required init?(coder: NSCoder) { fatalError("init(coder:) is not supported") }
    override func viewDidLoad() {
        super.viewDidLoad()
        title = "GOLDUCHET · Онлайн"
        navigationItem.leftBarButtonItem = UIBarButtonItem(
            title: "Закрыть", style: .done, target: self, action: #selector(close))
        view = web
        web.navigationDelegate = self
        web.isOpaque = true
        monitor.pathUpdateHandler = { [weak self] path in
            if path.status == .unsatisfied {
                DispatchQueue.main.async { self?.block("Нет сети. Закройте раздел и откройте его после подключения.") }
            }
        }
        monitor.start(queue: DispatchQueue(label: "com.auracrm.online-network"))
    }
    func load(_ request: URLRequest) { loadViewIfNeeded(); web.load(request) }
    @objc private func close() { dismiss(animated: true) }
    private func block(_ message: String) {
        web.stopLoading()
        web.isHidden = true
        let label = UILabel()
        label.text = message
        label.numberOfLines = 0
        label.textAlignment = .center
        label.backgroundColor = .systemBackground
        view = label
    }
    func webView(_ webView: WKWebView, decidePolicyFor action: WKNavigationAction,
                 decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        guard let url = action.request.url else { decisionHandler(.cancel); return }
        let allowed = url.scheme == "https" && url.host == origin.host && url.port == origin.port
        let localPaths = [
            "/crm/pos": "/crm/pos", "/pos": "/crm/pos",
            "/crm/inventory": "/crm/inventory", "/inventory": "/crm/inventory",
            "/crm/revisions": "/crm/revisions", "/revisions": "/crm/revisions"
        ]
        if allowed, let local = localPaths[url.path], action.targetFrame?.isMainFrame == true {
            decisionHandler(.cancel)
            dismiss(animated: true) { [weak self] in self?.onLocalNavigate?(local) }
            return
        }
        decisionHandler(allowed && action.targetFrame != nil ? .allow : .cancel)
    }
    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        if (error as NSError).code != NSURLErrorCancelled {
            block("Не удалось загрузить онлайн-раздел. Проверьте сеть и откройте его снова.")
        }
    }
    deinit { monitor.cancel() }
}
