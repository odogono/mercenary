#!/usr/bin/env swift

import AppKit
import ApplicationServices
import CryptoKit
import Darwin
import Foundation

private struct KeyEvent: Decodable {
    let atMilliseconds: Int
    let type: String
    let keyCode: Int
    let modifiers: [String]?
}

private struct CaptureRequest: Decodable {
    let schemaVersion: Int
    let vicePid: Int32
    let viceExecutableSha256: String
    let windowOwner: String
    let windowTitle: String
    let durationMilliseconds: Int
    let eventHistory: EventHistoryRequest
    let events: [KeyEvent]
}

private struct EventHistoryRequest: Decodable {
    let startSnapshotPath: String
    let endSnapshotPath: String
    let hotkeyFilePath: String
    let hotkeyFileSha256: String
}

private struct CapturedEvent: Encodable {
    let atMilliseconds: Int
    let actualMilliseconds: Int
    let type: String
    let keyCode: Int
    let modifiers: [String]
}

private struct CaptureReport: Encodable {
    let schemaVersion: Int
    let vicePid: Int32
    let windowOwner: String
    let windowTitle: String
    let viceExecutablePath: String
    let viceExecutableSha256: String
    let driverExecutablePath: String
    let driverExecutableSha256: String
    let accessibilityTrusted: Bool
    let focusChecks: Int
    let durationMilliseconds: Int
    let events: [CapturedEvent]
    let eventHistory: EventHistoryReport
}

private struct EventHistoryReport: Encodable {
    let startSnapshotPath: String
    let startSnapshotSha256: String
    let endSnapshotPath: String
    let endSnapshotSha256: String
    let hotkeyFilePath: String
    let hotkeyFileSha256: String
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

private func flags(for names: [String]) throws -> CGEventFlags {
    var result: CGEventFlags = []
    for name in names {
        switch name {
        case "command": result.insert(.maskCommand)
        case "control": result.insert(.maskControl)
        case "option": result.insert(.maskAlternate)
        case "shift": result.insert(.maskShift)
        default: throw DriverError.invalid("unsupported modifier \(name)")
        }
    }
    return result
}

private func sleepUntil(start: ContinuousClock.Instant, milliseconds: Int) throws {
    let deadline = start.advanced(by: .milliseconds(milliseconds))
    let remaining = ContinuousClock.now.duration(to: deadline)
    if remaining > .zero {
        let interval = Double(remaining.components.seconds) + Double(remaining.components.attoseconds) / 1_000_000_000_000_000_000
        Thread.sleep(forTimeInterval: interval)
    }
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

private func verifyWindowOwner(pid: Int32, owner: String) throws {
    let windows = visibleApplicationWindows().filter { ($0[kCGWindowOwnerPID as String] as? Int32) == pid }
    try require(windows.contains { ($0[kCGWindowOwnerName as String] as? String) == owner }, "pinned process does not own the expected VICE window")
}

private func verifyFocus(pid: Int32, title: String) throws {
    guard let frontmost = visibleApplicationWindows().first,
          let ownerPID = frontmost[kCGWindowOwnerPID as String] as? Int32,
          let windowTitle = frontmost[kCGWindowName as String] as? String else {
        throw DriverError.invalid("frontmost application window is unavailable")
    }
    try require(ownerPID == pid, "focus left the pinned VICE process")
    try require(windowTitle == title, "frontmost VICE window is not the pinned main window")
    let viceWindows = visibleApplicationWindows().filter { ($0[kCGWindowOwnerPID as String] as? Int32) == pid }
    try require(viceWindows.count == 1, "a VICE modal or auxiliary window obstructs capture")
}

private func waitForFile(_ path: String, timeoutMilliseconds: Int) throws {
    let deadline = Date().addingTimeInterval(Double(timeoutMilliseconds) / 1000)
    while Date() < deadline {
        if FileManager.default.fileExists(atPath: path) { return }
        Thread.sleep(forTimeInterval: 0.02)
    }
    throw DriverError.invalid("VICE did not create expected event-history snapshot")
}

private func postHostShortcut(keyCode: CGKeyCode) throws {
    let shortcutFlags: CGEventFlags = [.maskCommand, .maskShift]
    for keyDown in [true, false] {
        guard let event = CGEvent(
            keyboardEventSource: CGEventSource(stateID: .hidSystemState),
            virtualKey: keyCode,
            keyDown: keyDown
        ) else { throw DriverError.invalid("could not construct VICE history shortcut") }
        event.flags = shortcutFlags
        event.post(tap: .cghidEventTap)
        Thread.sleep(forTimeInterval: 0.02)
    }
}

private func run() throws {
    try require((2...3).contains(CommandLine.arguments.count), "usage: capture-keyboard-history.swift REQUEST.json [REPORT.json]")
    let requestURL = URL(fileURLWithPath: CommandLine.arguments[1])
    let request = try JSONDecoder().decode(CaptureRequest.self, from: Data(contentsOf: requestURL))
    try require(request.schemaVersion == 1, "request schemaVersion must be 1")
    try require(request.vicePid > 0, "VICE PID must be positive")
    try require(request.windowOwner == "x64sc", "window owner must be x64sc")
    try require(request.windowTitle == "VICE (C64SC)", "window title must pin the VICE C64SC main window")
    try require((1...60_000).contains(request.durationMilliseconds), "capture duration must be 1...60000 ms")
    try require(!request.events.isEmpty && request.events.count <= 512, "capture must contain 1...512 events")
    try require(request.eventHistory.startSnapshotPath != request.eventHistory.endSnapshotPath, "event-history snapshots must be distinct")
    try require(!FileManager.default.fileExists(atPath: request.eventHistory.startSnapshotPath), "event-history start snapshot already exists")
    try require(!FileManager.default.fileExists(atPath: request.eventHistory.endSnapshotPath), "event-history end snapshot already exists")
    try require(AXIsProcessTrusted(), "macOS Accessibility permission is not granted")
    let hotkeyDigest = try sha256(path: request.eventHistory.hotkeyFilePath)
    try require(hotkeyDigest == request.eventHistory.hotkeyFileSha256, "VICE history hotkey file digest does not match the pinned identity")

    let vicePath = try processPath(pid: request.vicePid)
    try verifyWindowOwner(pid: request.vicePid, owner: request.windowOwner)
    let viceDigest = try sha256(path: vicePath)
    try require(viceDigest == request.viceExecutableSha256, "VICE executable digest does not match the pinned identity")

    var held = Set<Int>()
    var previous = -1
    for event in request.events {
        try require((0...127).contains(event.keyCode), "keyCode must be 0...127")
        try require(event.atMilliseconds >= previous && event.atMilliseconds <= request.durationMilliseconds, "events must be ordered and bounded")
        if event.type == "key-down" {
            try require(!held.contains(event.keyCode), "key is pressed twice")
            held.insert(event.keyCode)
        } else if event.type == "key-up" {
            try require(held.remove(event.keyCode) != nil, "key is released without a press")
        } else {
            throw DriverError.invalid("event type must be key-down or key-up")
        }
        _ = try flags(for: event.modifiers ?? [])
        previous = event.atMilliseconds
    }
    try require(held.isEmpty, "all keys must be released within the bounded capture")

    try verifyFocus(pid: request.vicePid, title: request.windowTitle)
    // These host controls are defined by the pinned hotkey file. Clearing the
    // default map there prevents Command-Shift-R from opening media recording.
    try postHostShortcut(keyCode: 15) // R: start recording events
    try waitForFile(request.eventHistory.startSnapshotPath, timeoutMilliseconds: 2_000)
    let start = ContinuousClock.now
    var captured: [CapturedEvent] = []
    var focusChecks = 1
    for event in request.events {
        try sleepUntil(start: start, milliseconds: event.atMilliseconds)
        try verifyFocus(pid: request.vicePid, title: request.windowTitle)
        focusChecks += 1
        guard let cgEvent = CGEvent(
            keyboardEventSource: CGEventSource(stateID: .hidSystemState),
            virtualKey: CGKeyCode(event.keyCode),
            keyDown: event.type == "key-down"
        ) else { throw DriverError.invalid("could not construct keyboard event") }
        let modifiers = event.modifiers ?? []
        cgEvent.flags = try flags(for: modifiers)
        // GTK receives host accelerators from the HID event stream. The
        // immediately preceding foreground-window check pins that global
        // delivery to the exact VICE process.
        cgEvent.post(tap: .cghidEventTap)
        let elapsed = start.duration(to: ContinuousClock.now)
        captured.append(CapturedEvent(
            atMilliseconds: event.atMilliseconds,
            actualMilliseconds: Int(elapsed.components.seconds * 1_000) + Int(elapsed.components.attoseconds / 1_000_000_000_000_000),
            type: event.type,
            keyCode: event.keyCode,
            modifiers: modifiers
        ))
    }
    try sleepUntil(start: start, milliseconds: request.durationMilliseconds)
    try verifyFocus(pid: request.vicePid, title: request.windowTitle)
    focusChecks += 1
    try postHostShortcut(keyCode: 17) // T: stop recording events
    try waitForFile(request.eventHistory.endSnapshotPath, timeoutMilliseconds: 2_000)

    let driverPath = URL(fileURLWithPath: CommandLine.arguments[0]).standardized.path
    let report = CaptureReport(
        schemaVersion: 1,
        vicePid: request.vicePid,
        windowOwner: request.windowOwner,
        windowTitle: request.windowTitle,
        viceExecutablePath: vicePath,
        viceExecutableSha256: viceDigest,
        driverExecutablePath: driverPath,
        driverExecutableSha256: try sha256(path: driverPath),
        accessibilityTrusted: true,
        focusChecks: focusChecks,
        durationMilliseconds: request.durationMilliseconds,
        events: captured,
        eventHistory: EventHistoryReport(
            startSnapshotPath: request.eventHistory.startSnapshotPath,
            startSnapshotSha256: try sha256(path: request.eventHistory.startSnapshotPath),
            endSnapshotPath: request.eventHistory.endSnapshotPath,
            endSnapshotSha256: try sha256(path: request.eventHistory.endSnapshotPath),
            hotkeyFilePath: request.eventHistory.hotkeyFilePath,
            hotkeyFileSha256: hotkeyDigest
        )
    )
    let encoder = JSONEncoder()
    encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
    let reportData = try encoder.encode(report) + Data("\n".utf8)
    if CommandLine.arguments.count == 3 {
        try reportData.write(to: URL(fileURLWithPath: CommandLine.arguments[2]), options: .atomic)
    } else {
        FileHandle.standardOutput.write(reportData)
    }
}

do {
    try run()
} catch {
    FileHandle.standardError.write(Data("capture-keyboard-history: \(error)\n".utf8))
    exit(1)
}
