#!/usr/bin/env swift

import AppKit
import ApplicationServices
import CryptoKit
import Darwin
import Foundation

private struct ReplayRequest: Decodable {
    let schemaVersion: Int
    let vicePid: Int32
    let viceExecutableSha256: String
    let windowOwner: String
    let windowTitle: String
    let durationMilliseconds: Int
    let startSnapshotPath: String
    let startSnapshotSha256: String
    let hotkeyFilePath: String
    let hotkeyFileSha256: String
}

private struct ReplayReport: Encodable {
    let schemaVersion: Int
    let vicePid: Int32
    let viceExecutablePath: String
    let viceExecutableSha256: String
    let driverExecutablePath: String
    let driverExecutableSha256: String
    let startSnapshotPath: String
    let startSnapshotSha256: String
    let hotkeyFilePath: String
    let hotkeyFileSha256: String
    let windowOwner: String
    let windowTitle: String
    let accessibilityTrusted: Bool
    let durationMilliseconds: Int
    let focusChecks: Int
}

private enum DriverError: Error, CustomStringConvertible {
    case invalid(String)

    var description: String {
        switch self {
        case .invalid(let message): return message
        }
    }
}

private func require(_ condition: @autoclosure () -> Bool, _ message: String) throws {
    if !condition() { throw DriverError.invalid(message) }
}

private func sha256(path: String) throws -> String {
    let data = try Data(contentsOf: URL(fileURLWithPath: path), options: .mappedIfSafe)
    return SHA256.hash(data: data).map { String(format: "%02x", $0) }.joined()
}

private func processPath(pid: Int32) throws -> String {
    var buffer = [CChar](repeating: 0, count: 4096)
    let length = proc_pidpath(pid, &buffer, UInt32(buffer.count))
    try require(length > 0, "pinned VICE process is not running")
    return String(cString: buffer)
}

private func visibleApplicationWindows() -> [[String: Any]] {
    let options: CGWindowListOption = [.optionOnScreenOnly, .excludeDesktopElements]
    return (CGWindowListCopyWindowInfo(options, kCGNullWindowID) as? [[String: Any]] ?? []).filter {
        ($0[kCGWindowLayer as String] as? Int) == 0
    }
}

private func verifyFocus(pid: Int32, owner: String, title: String) throws {
    guard let frontmost = visibleApplicationWindows().first,
          let ownerPID = frontmost[kCGWindowOwnerPID as String] as? Int32,
          let ownerName = frontmost[kCGWindowOwnerName as String] as? String,
          let windowTitle = frontmost[kCGWindowName as String] as? String else {
        throw DriverError.invalid("frontmost application window is unavailable")
    }
    try require(ownerPID == pid, "focus left the pinned VICE process")
    try require(ownerName == owner, "frontmost process is not the pinned VICE owner")
    try require(windowTitle == title, "frontmost VICE window is not the pinned main window")
    let viceWindows = visibleApplicationWindows().filter { ($0[kCGWindowOwnerPID as String] as? Int32) == pid }
    try require(viceWindows.count == 1, "a VICE modal or auxiliary window obstructs replay")
}

private func activate(pid: Int32) throws {
    guard let application = NSRunningApplication(processIdentifier: pid) else {
        throw DriverError.invalid("pinned VICE application is unavailable")
    }
    if !application.isActive {
        _ = application.activate(options: [.activateAllWindows])
    }
    let deadline = Date().addingTimeInterval(2)
    while !application.isActive && Date() < deadline {
        Thread.sleep(forTimeInterval: 0.02)
    }
    try require(application.isActive, "pinned VICE process did not become active")
}

private func postPlaybackShortcut() throws {
    for keyDown in [true, false] {
        guard let event = CGEvent(
            keyboardEventSource: CGEventSource(stateID: .hidSystemState),
            virtualKey: 35, // P
            keyDown: keyDown
        ) else { throw DriverError.invalid("could not construct VICE playback shortcut") }
        event.flags = [.maskCommand, .maskShift]
        event.post(tap: .cghidEventTap)
        Thread.sleep(forTimeInterval: 0.02)
    }
}

private func run() throws {
    try require((2...3).contains(CommandLine.arguments.count), "usage: replay-keyboard-history.swift REQUEST.json [REPORT.json]")
    let request = try JSONDecoder().decode(
        ReplayRequest.self,
        from: Data(contentsOf: URL(fileURLWithPath: CommandLine.arguments[1]))
    )
    try require(request.schemaVersion == 1, "request schemaVersion must be 1")
    try require(request.vicePid > 0, "VICE PID must be positive")
    try require(request.windowOwner == "x64sc", "window owner must be x64sc")
    try require(request.windowTitle == "VICE (C64SC)", "window title must pin the VICE C64SC main window")
    try require((1...60_000).contains(request.durationMilliseconds), "replay duration must be 1...60000 ms")
    try require(AXIsProcessTrusted(), "macOS Accessibility permission is not granted")
    let startSnapshotDigest = try sha256(path: request.startSnapshotPath)
    let hotkeyFileDigest = try sha256(path: request.hotkeyFilePath)
    try require(startSnapshotDigest == request.startSnapshotSha256, "start snapshot digest does not match the pinned identity")
    try require(hotkeyFileDigest == request.hotkeyFileSha256, "hotkey file digest does not match the pinned identity")

    let vicePath = try processPath(pid: request.vicePid)
    let viceDigest = try sha256(path: vicePath)
    try require(viceDigest == request.viceExecutableSha256, "VICE executable digest does not match the pinned identity")
    try activate(pid: request.vicePid)
    try verifyFocus(pid: request.vicePid, owner: request.windowOwner, title: request.windowTitle)
    try postPlaybackShortcut()

    let deadline = Date().addingTimeInterval(Double(request.durationMilliseconds) / 1000)
    var focusChecks = 1
    while Date() < deadline {
        Thread.sleep(forTimeInterval: 0.05)
        try verifyFocus(pid: request.vicePid, owner: request.windowOwner, title: request.windowTitle)
        focusChecks += 1
    }

    let driverPath = URL(fileURLWithPath: CommandLine.arguments[0]).standardized.path
    let report = ReplayReport(
        schemaVersion: 1,
        vicePid: request.vicePid,
        viceExecutablePath: vicePath,
        viceExecutableSha256: viceDigest,
        driverExecutablePath: driverPath,
        driverExecutableSha256: try sha256(path: driverPath),
        startSnapshotPath: request.startSnapshotPath,
        startSnapshotSha256: request.startSnapshotSha256,
        hotkeyFilePath: request.hotkeyFilePath,
        hotkeyFileSha256: request.hotkeyFileSha256,
        windowOwner: request.windowOwner,
        windowTitle: request.windowTitle,
        accessibilityTrusted: true,
        durationMilliseconds: request.durationMilliseconds,
        focusChecks: focusChecks
    )
    let encoder = JSONEncoder()
    encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
    let data = try encoder.encode(report) + Data("\n".utf8)
    if CommandLine.arguments.count == 3 {
        try data.write(to: URL(fileURLWithPath: CommandLine.arguments[2]), options: .atomic)
    } else {
        FileHandle.standardOutput.write(data)
    }
}

do {
    try run()
} catch {
    FileHandle.standardError.write(Data("replay-keyboard-history: \(error)\n".utf8))
    exit(1)
}
