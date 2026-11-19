import Foundation
import ServiceManagement

enum LaunchAtLogin {
    static func enableIfPossible() {
        guard #available(macOS 13.0, *) else {
            return
        }

        // From `swift run`, registration "succeeds" with the bare debug executable, which macOS then
        // opens in Terminal at every login. Only register the installed app bundle.
        guard Bundle.main.bundleURL.pathExtension == "app" else {
            return
        }

        do {
            try SMAppService.mainApp.register()
        } catch {
            // Unsigned or otherwise unregistrable bundles can fail here; launch-at-login just stays off.
        }
    }
}
