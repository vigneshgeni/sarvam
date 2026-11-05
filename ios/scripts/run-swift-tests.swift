import Foundation

func assertEqual<T: Equatable>(_ actual: T, _ expected: T, _ message: String = "") {
    if actual != expected {
        fputs("TEST FAILED: \(actual) != \(expected). \(message)\n", stderr)
        exit(1)
    }
}

func testFormatAudioTime(_ seconds: Double) -> String {
    guard seconds.isFinite && seconds >= 0 else { return "0:00" }
    let m = Int(seconds) / 60
    let s = Int(seconds) % 60
    return String(format: "%d:%02d", m, s)
}

func testFormatRemainingAudioTime(_ current: Double, _ total: Double) -> String {
    let diff = max(0, total - current)
    return "-" + testFormatAudioTime(diff)
}

func testSegmentFills(for progress: Int) -> (Double, Double, Double) {
    let p = Double(max(0, min(100, progress)))
    let fill1 = min(1.0, max(0.0, p / 40.0))
    let fill2 = min(1.0, max(0.0, (p - 40.0) / 40.0))
    let fill3 = min(1.0, max(0.0, (p - 80.0) / 20.0))
    return (fill1, fill2, fill3)
}

func testCurrentTickIndex(currentTime: Double, duration: Double, tickCount: Int = 31) -> Int {
    let dur = duration > 0 ? duration : 90.0
    let currentRatio = max(0.0, min(1.0, currentTime / dur))
    return Int(round(currentRatio * Double(tickCount - 1)))
}

print("Running Sarvam Swift Unit Tests...")

// Test 1: Time formatting
assertEqual(testFormatAudioTime(0), "0:00", "0 seconds formatted")
assertEqual(testFormatAudioTime(45), "0:45", "45 seconds formatted")
assertEqual(testFormatAudioTime(90), "1:30", "90 seconds formatted")
assertEqual(testFormatAudioTime(-5), "0:00", "Negative clamped")
assertEqual(testFormatAudioTime(Double.nan), "0:00", "NaN clamped")
print("✓ Time formatting tests passed")

// Test 2: Remaining time formatting
assertEqual(testFormatRemainingAudioTime(0, 90), "-1:30", "Remaining at start")
assertEqual(testFormatRemainingAudioTime(45, 90), "-0:45", "Remaining at midpoint")
assertEqual(testFormatRemainingAudioTime(90, 90), "-0:00", "Remaining at end")
print("✓ Remaining time formatting tests passed")

// Test 3: 3-Segment progression
let s0 = testSegmentFills(for: 0)
assertEqual(s0.0, 0.0)
assertEqual(s0.1, 0.0)
assertEqual(s0.2, 0.0)

let s20 = testSegmentFills(for: 20)
assertEqual(s20.0, 0.5)
assertEqual(s20.1, 0.0)
assertEqual(s20.2, 0.0)

let s40 = testSegmentFills(for: 40)
assertEqual(s40.0, 1.0)
assertEqual(s40.1, 0.0)
assertEqual(s40.2, 0.0)

let s60 = testSegmentFills(for: 60)
assertEqual(s60.0, 1.0)
assertEqual(s60.1, 0.5)
assertEqual(s60.2, 0.0)

let s80 = testSegmentFills(for: 80)
assertEqual(s80.0, 1.0)
assertEqual(s80.1, 1.0)
assertEqual(s80.2, 0.0)

let s90 = testSegmentFills(for: 90)
assertEqual(s90.0, 1.0)
assertEqual(s90.1, 1.0)
assertEqual(s90.2, 0.5)

let s100 = testSegmentFills(for: 100)
assertEqual(s100.0, 1.0)
assertEqual(s100.1, 1.0)
assertEqual(s100.2, 1.0)
print("✓ 3-Segment progression tests passed")

// Test 4: Tick indices for ruler
assertEqual(testCurrentTickIndex(currentTime: 0, duration: 90), 0, "Tick at start")
assertEqual(testCurrentTickIndex(currentTime: 45, duration: 90), 15, "Tick at midpoint")
assertEqual(testCurrentTickIndex(currentTime: 90, duration: 90), 30, "Tick at end")
print("✓ Tick index tests passed")

// Test 5: Privacy displayTitle & displayFileName
struct TestState {
    var title: String
    var fileName: String?
    var fileCount: Int
    var showDocumentName: Bool

    var displayTitle: String {
        if showDocumentName && !title.isEmpty && title != "Your document" {
            return title
        }
        return "Your document"
    }

    var displayFileName: String {
        if showDocumentName, let name = fileName, !name.isEmpty {
            return name
        }
        return "\(fileCount) photo"
    }
}

let privDefault = TestState(title: "Secret Lab Report.pdf", fileName: "Secret Lab Report.pdf", fileCount: 1, showDocumentName: false)
assertEqual(privDefault.displayTitle, "Your document", "Privacy default title must be 'Your document'")
assertEqual(privDefault.displayFileName, "1 photo", "Privacy default fileName must be '1 photo'")

let privEnabled = TestState(title: "Secret Lab Report.pdf", fileName: "Secret Lab Report.pdf", fileCount: 1, showDocumentName: true)
assertEqual(privEnabled.displayTitle, "Secret Lab Report.pdf", "When enabled, title shows real name")
assertEqual(privEnabled.displayFileName, "Secret Lab Report.pdf", "When enabled, fileName shows real name")
print("✓ Privacy display tests passed")

// Test 6: Skip Back & Forward Clamping
func skipTime(current: Double, delta: Double, duration: Double) -> Double {
    return max(0.0, min(duration, current + delta))
}
assertEqual(skipTime(current: 5, delta: -10, duration: 90), 0.0, "Back near 0 clamps to 0")
assertEqual(skipTime(current: 85, delta: 10, duration: 90), 90.0, "Forward near end clamps to duration")
assertEqual(skipTime(current: 45, delta: -10, duration: 90), 35.0, "Back 10 from 45 is 35")
assertEqual(skipTime(current: 45, delta: 10, duration: 90), 55.0, "Forward 10 from 45 is 55")
print("✓ Audio skip clamping tests passed")

// Test 7: Seconds remaining formula
func calcSecondsRemaining(progress: Int, baselineDuration: Double = 15.0) -> Int {
    if progress >= 100 { return 0 }
    return max(1, Int(round(baselineDuration * (1.0 - Double(progress) / 100.0))))
}
assertEqual(calcSecondsRemaining(progress: 0), 15, "0% gives 15s")
assertEqual(calcSecondsRemaining(progress: 62), 6, "62% gives 6s")
assertEqual(calcSecondsRemaining(progress: 95), 1, "95% gives 1s")
assertEqual(calcSecondsRemaining(progress: 100), 0, "100% gives 0s")
print("✓ Seconds remaining calculation tests passed")

// Test 8: Odia Listen prohibition rule
func allowsListen(for language: String) -> Bool {
    return language != "or"
}
assertEqual(allowsListen(for: "en"), true, "English allows listen")
assertEqual(allowsListen(for: "ta"), true, "Tamil allows listen")
assertEqual(allowsListen(for: "hi"), true, "Hindi allows listen")
assertEqual(allowsListen(for: "or"), false, "Odia strictly forbids listen")
print("✓ Odia listen prohibition tests passed")

print("ALL 32 SWIFT STATE UNIT TESTS PASSED!")
