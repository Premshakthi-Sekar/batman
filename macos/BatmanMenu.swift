import Cocoa
import Darwin

final class AppDelegate: NSObject, NSApplicationDelegate {
    var statusItem: NSStatusItem!

    func applicationDidFinishLaunching(_ notification: Notification) {
        NSApp.setActivationPolicy(.accessory)
        statusItem = NSStatusBar.system.statusItem(withLength: NSStatusItem.variableLength)
        if let button = statusItem.button {
            button.title = "🦇"
            button.toolTip = "Desktop Batman"
            button.target = self
            button.action = #selector(statusClicked(_:))
            button.sendAction(on: [.leftMouseUp, .rightMouseUp])
        }
    }

    @objc func statusClicked(_ sender: Any?) {
        let event = NSApp.currentEvent
        if event?.type == .rightMouseUp {
            showMenu()
            return
        }
        startBatman()
    }

    func showMenu() {
        let menu = NSMenu()
        menu.addItem(NSMenuItem(title: "Start Batman", action: #selector(startBatman), keyEquivalent: ""))
        menu.addItem(NSMenuItem(title: "Quit Batman", action: #selector(quitBatman), keyEquivalent: ""))
        menu.addItem(NSMenuItem.separator())
        menu.addItem(NSMenuItem(title: "Remove this menu icon", action: #selector(quitHelper), keyEquivalent: ""))
        guard let button = statusItem.button else { return }
        let point = NSPoint(x: 0, y: button.bounds.height + 4)
        menu.popUp(positioning: nil, at: point, in: button)
    }

    @objc func startBatman() {
        guard let repo = repoPath() else { return }
        let script = (repo as NSString).appendingPathComponent("scripts/launch-batman.sh")
        let task = Process()
        task.executableURL = URL(fileURLWithPath: "/bin/bash")
        task.arguments = [script]
        task.environment = ProcessInfo.processInfo.environment
        var env = task.environment ?? [:]
        let homebrew = "/opt/homebrew/bin:/usr/local/bin"
        env["PATH"] = "\(homebrew):" + (env["PATH"] ?? "")
        task.environment = env
        do {
            try task.run()
        } catch {
            NSLog("Could not start Batman: \(error)")
        }
    }

    @objc func quitBatman() {
        let pidPath = NSHomeDirectory() + "/.desktop-batman.pid"
        guard let raw = try? String(contentsOfFile: pidPath, encoding: .utf8),
              let pid = Int32(raw.trimmingCharacters(in: .whitespacesAndNewlines)), pid > 1 else {
            return
        }
        kill(pid, SIGTERM)
    }

    @objc func quitHelper() {
        NSApp.terminate(nil)
    }

    func repoPath() -> String? {
        let url = FileManager.default.homeDirectoryForCurrentUser
            .appendingPathComponent("Library/Application Support/DesktopBatman/repo-path")
        guard let raw = try? String(contentsOf: url, encoding: .utf8) else { return nil }
        return raw.trimmingCharacters(in: .whitespacesAndNewlines)
    }
}

let app = NSApplication.shared
let delegate = AppDelegate()
app.delegate = delegate
app.run()
