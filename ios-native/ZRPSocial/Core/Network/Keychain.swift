import Foundation
import Security

/// A minimal, dependency-free wrapper over the iOS Keychain for the one
/// thing this app must never keep anywhere less protected: the session
/// token.
///
/// The token issued by `POST /api/mobile/auth/login` is a real
/// NextAuth-format encrypted JWT - exactly as sensitive as the httpOnly
/// session cookie it stands in for on web - so it gets Keychain
/// protection rather than `UserDefaults`, which is a plain unprotected
/// plist inside the app container and is included in unencrypted device
/// backups.
///
/// Items are stored with `kSecAttrAccessibleAfterFirstUnlock`:
/// readable by background work after the user has unlocked the device
/// once since boot, never readable while the device is locked from cold
/// boot, and - because of the `ThisDeviceOnly` variant chosen below -
/// never migrated to another device by an iCloud or iTunes backup.
enum Keychain {

    enum KeychainError: Error {
        case unexpectedStatus(OSStatus)
    }

    /// All ZRP keychain items live under one service so `removeAll()` can
    /// clear the whole session on logout without knowing every key.
    private static let service = "one.zrp.social.session"

    static func set(_ value: String, for key: String) throws {
        guard let data = value.data(using: .utf8) else {
            throw KeychainError.unexpectedStatus(errSecParam)
        }

        // Delete-then-add rather than SecItemUpdate: it is one round trip
        // fewer in the common case and cannot leave a half-updated item
        // behind if the process is killed between the two calls.
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: key,
        ]
        SecItemDelete(query as CFDictionary)

        var attributes = query
        attributes[kSecValueData as String] = data
        attributes[kSecAttrAccessible as String] =
            kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly

        let status = SecItemAdd(attributes as CFDictionary, nil)
        guard status == errSecSuccess else {
            throw KeychainError.unexpectedStatus(status)
        }
    }

    static func get(_ key: String) -> String? {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: key,
            kSecReturnData as String: true,
            kSecMatchLimit as String: kSecMatchLimitOne,
        ]

        var item: CFTypeRef?
        let status = SecItemCopyMatching(query as CFDictionary, &item)
        guard status == errSecSuccess, let data = item as? Data else {
            return nil
        }
        return String(data: data, encoding: .utf8)
    }

    static func remove(_ key: String) {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: key,
        ]
        SecItemDelete(query as CFDictionary)
    }

    /// Clears every ZRP keychain item. Used on sign-out and whenever the
    /// server rejects the stored token with a 401.
    static func removeAll() {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
        ]
        SecItemDelete(query as CFDictionary)
    }
}
