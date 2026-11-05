import Foundation
import XCTest

// Verification functions mirroring SwiftUI presentation logic
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

final class SarvamStateTests: XCTestCase {
    func testTimeFormatting() {
        XCTAssertEqual(testFormatAudioTime(0), "0:00")
        XCTAssertEqual(testFormatAudioTime(45), "0:45")
        XCTAssertEqual(testFormatAudioTime(90), "1:30")
        XCTAssertEqual(testFormatAudioTime(-5), "0:00")
        XCTAssertEqual(testFormatAudioTime(Double.nan), "0:00")
    }

    func testRemainingTimeFormatting() {
        XCTAssertEqual(testFormatRemainingAudioTime(0, 90), "-1:30")
        XCTAssertEqual(testFormatRemainingAudioTime(45, 90), "-0:45")
        XCTAssertEqual(testFormatRemainingAudioTime(90, 90), "-0:00")
    }

    func testThreeSegmentProgression() {
        // At 0%
        let s0 = testSegmentFills(for: 0)
        XCTAssertEqual(s0.0, 0.0)
        XCTAssertEqual(s0.1, 0.0)
        XCTAssertEqual(s0.2, 0.0)

        // At 20%
        let s20 = testSegmentFills(for: 20)
        XCTAssertEqual(s20.0, 0.5)
        XCTAssertEqual(s20.1, 0.0)
        XCTAssertEqual(s20.2, 0.0)

        // At 40%
        let s40 = testSegmentFills(for: 40)
        XCTAssertEqual(s40.0, 1.0)
        XCTAssertEqual(s40.1, 0.0)
        XCTAssertEqual(s40.2, 0.0)

        // At 60%
        let s60 = testSegmentFills(for: 60)
        XCTAssertEqual(s60.0, 1.0)
        XCTAssertEqual(s60.1, 0.5)
        XCTAssertEqual(s60.2, 0.0)

        // At 80%
        let s80 = testSegmentFills(for: 80)
        XCTAssertEqual(s80.0, 1.0)
        XCTAssertEqual(s80.1, 1.0)
        XCTAssertEqual(s80.2, 0.0)

        // At 90%
        let s90 = testSegmentFills(for: 90)
        XCTAssertEqual(s90.0, 1.0)
        XCTAssertEqual(s90.1, 1.0)
        XCTAssertEqual(s90.2, 0.5)

        // At 100%
        let s100 = testSegmentFills(for: 100)
        XCTAssertEqual(s100.0, 1.0)
        XCTAssertEqual(s100.1, 1.0)
        XCTAssertEqual(s100.2, 1.0)
    }

    func testTickIndices() {
        XCTAssertEqual(testCurrentTickIndex(currentTime: 0, duration: 90), 0)
        XCTAssertEqual(testCurrentTickIndex(currentTime: 45, duration: 90), 15)
        XCTAssertEqual(testCurrentTickIndex(currentTime: 90, duration: 90), 30)
    }

    func testPrivacyDefault() {
        let state = SarvamActivityAttributes.ContentState()
        XCTAssertEqual(state.title, "Your document")
    }

    func testOdiaDisabled() {
        let state = SarvamActivityAttributes.ContentState(language: "or", allowListen: false)
        XCTAssertFalse(state.allowListen)
    }
}
