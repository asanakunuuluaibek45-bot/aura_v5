import Capacitor
import UIKit
import Security

final class AuraBridgeViewController: CAPBridgeViewController {
    override func capacitorDidLoad() {
        bridge?.registerPluginInstance(AuraNativePlugin())
    }
}

/// Packaged PWA UI only. Remote HTML is never loaded into the native bridge.
@objc(AuraNativePlugin)
public class AuraNativePlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "AuraNativePlugin"
    public let jsName = "AuraNative"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "get", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "set", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "remove", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "action", returnType: CAPPluginReturnPromise)
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
    @objc func action(_ call: CAPPluginCall) {
        guard let module = call.getString("module"), !module.isEmpty, module.count < 64,
              let action = call.getString("action"), !action.isEmpty, action.count < 96,
              let args = call.getArray("args"), args.count <= 10,
              let token = call.getString("accessToken"), !token.isEmpty, token.count <= 16384,
              !token.contains("\r"), !token.contains("\n"),
              let origin = Bundle.main.object(forInfoDictionaryKey: "AuraWebOrigin") as? String,
              let base = URL(string: origin), base.scheme == "https", base.host != nil,
              base.user == nil, base.password == nil,
              let endpoint = URL(string: "/api/native-actions", relativeTo: base)?.absoluteURL else {
            call.reject("Некорректный онлайн-запрос"); return
        }
        guard let body = try? JSONSerialization.data(withJSONObject: [
            "module": module, "action": action, "args": args
        ]), body.count <= 1024 * 1024 else {
            call.reject("Слишком большой запрос"); return
        }
        var request = URLRequest(url: endpoint, cachePolicy: .reloadIgnoringLocalCacheData, timeoutInterval: 45)
        request.httpMethod = "POST"
        request.httpShouldHandleCookies = false
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("Bearer " + token, forHTTPHeaderField: "Authorization")
        request.httpBody = body
        // No shared cookie jar: signing out cannot leave another account's
        // server cookies in a second browser/session.
        let configuration = URLSessionConfiguration.ephemeral
        configuration.httpShouldSetCookies = false
        configuration.httpCookieStorage = nil
        let session = URLSession(configuration: configuration, delegate: NoRedirects(), delegateQueue: nil)
        session.dataTask(with: request) { data, response, error in
            defer { session.finishTasksAndInvalidate() }
            if error != nil { call.reject("Не удалось связаться с сервером. Проверьте интернет."); return }
            guard let response = response as? HTTPURLResponse, let data = data,
                  let json = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any] else {
                call.reject("Сервер ещё не поддерживает эту версию приложения."); return
            }
            guard (200..<300).contains(response.statusCode) else {
                call.reject(json["error"] as? String ?? "Ошибка онлайн-раздела"); return
            }
            call.resolve(["value": json["value"] ?? NSNull()])
        }.resume()
    }
}

/// Never forward an authenticated action request to a redirected destination.
private final class NoRedirects: NSObject, URLSessionTaskDelegate {
    func urlSession(_ session: URLSession, task: URLSessionTask,
                    willPerformHTTPRedirection response: HTTPURLResponse,
                    newRequest request: URLRequest,
                    completionHandler: @escaping (URLRequest?) -> Void) {
        completionHandler(nil)
    }
}
