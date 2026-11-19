import ActivityKit
import AppIntents
import SwiftUI
import WidgetKit

// MARK: - Color Tokens
extension Color {
    static let svIslandBg = Color.black
    static let svMustard = Color(red: 233/255, green: 180/255, blue: 76/255) // #E9B44C
    static let svLightMustard = Color(red: 255/255, green: 217/255, blue: 138/255) // #FFD98A
    static let svCoral = Color(red: 217/255, green: 96/255, blue: 59/255) // #D9603B
    static let svTealCard = Color(red: 34/255, green: 79/255, blue: 72/255) // #224F48
    static let svMintPill = Color(red: 207/255, green: 229/255, blue: 224/255) // #CFE5E0
    static let svMintText = Color(red: 18/255, green: 64/255, blue: 58/255) // #12403A
    static let svOffWhite = Color(red: 244/255, green: 245/255, blue: 242/255) // #F4F5F2
    static let svInk = Color(red: 26/255, green: 26/255, blue: 26/255) // #1A1A1A
    static let svDarkBtn = Color(red: 43/255, green: 43/255, blue: 43/255) // #2B2B2B
    static let svTrackGrey = Color(red: 61/255, green: 61/255, blue: 61/255) // #3D3D3D
    static let svFutureTick = Color(red: 91/255, green: 95/255, blue: 92/255) // #5B5F5C
    static let svCardStroke = Color.white.opacity(0.16)
}

// MARK: - Font Helper with Graceful Fallback
enum SarvamFonts {
    static func fraunces(size: CGFloat, weight: Font.Weight = .bold) -> Font {
        return Font.custom("Fraunces", size: size).weight(weight)
    }

    static func dmSans(size: CGFloat, weight: Font.Weight = .regular) -> Font {
        return Font.custom("DM Sans", size: size).weight(weight)
    }

    static func indic(size: CGFloat, weight: Font.Weight = .medium) -> Font {
        return Font.custom("Noto Sans Tamil", size: size).weight(weight)
    }
}

// MARK: - Helper Formatting
func formatAudioTime(_ seconds: Double) -> String {
    guard seconds.isFinite && seconds >= 0 else { return "0:00" }
    let m = Int(seconds) / 60
    let s = Int(seconds) % 60
    return String(format: "%d:%02d", m, s)
}

func formatRemainingAudioTime(_ current: Double, _ total: Double) -> String {
    let diff = max(0, total - current)
    return "-" + formatAudioTime(diff)
}

/// Live Activity link into the app. Ids are percent-encoded so a name with spaces can never crash
/// the widget (URL(string:)! returned nil for "Laboratory Test Report.pdf").
func sarvamLink(_ kind: String, _ docId: String) -> URL {
    let id = docId.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? docId
    return URL(string: "sarvam://\(kind)/\(id)") ?? URL(string: "sarvam://open")!
}

// Height budget: iOS clips a Lock Screen Live Activity at 160 pt and the expanded Dynamic Island
// at about 160 pt. The prototypes are taller (Lock Screen listen card ~230 pt), so the layouts
// below keep the prototype's parts and order but with tighter sizes. Earlier versions were taller
// and the controls were cut off on the phone.

// MARK: - Scan bar (3 segments, 2 : 2 : 1)
/// Drawn by the system from the scan's start time, so it keeps filling while the app is suspended.
struct ScanSegmentBar: View {
    let state: SarvamActivityAttributes.ContentState
    var height: CGFloat = 6
    var trackColor: Color = Color.white.opacity(0.24)

    var body: some View {
        GeometryReader { proxy in
            let spacing: CGFloat = 4
            let width = max(0, proxy.size.width - spacing * 2)
            HStack(spacing: spacing) {
                segment(0).frame(width: width * 0.4)
                segment(1).frame(width: width * 0.4)
                segment(2).frame(width: width * 0.2)
            }
        }
        .frame(height: height)
    }

    @ViewBuilder
    private func segment(_ index: Int) -> some View {
        if state.phase == "scanning", let range = state.scanSegmentInterval(index) {
            ProgressView(timerInterval: range, countsDown: false, label: { EmptyView() }, currentValueLabel: { EmptyView() })
                .progressViewStyle(.linear)
                .tint(Color.svMustard)
        } else {
            // Fallback (no start time, or Ready): fill from the stored percent.
            let p = Double(max(0, min(100, state.progress)))
            let bounds: [(Double, Double)] = [(0, 40), (40, 80), (80, 100)]
            let b = bounds[index]
            let fill = min(1, max(0, (p - b.0) / (b.1 - b.0)))
            GeometryReader { g in
                ZStack(alignment: .leading) {
                    Capsule().fill(trackColor)
                    Capsule().fill(Color.svMustard).frame(width: g.size.width * CGFloat(fill))
                }
            }
            .frame(height: height)
        }
    }
}

/// "62%" while the app is awake and pushing updates; once iOS suspends it (the activity goes
/// stale a few seconds later) a system-driven countdown takes its place, so nothing looks frozen.
struct ScanPercentText: View {
    let state: SarvamActivityAttributes.ContentState
    let isStale: Bool
    let numberSize: CGFloat
    let unitSize: CGFloat
    var timerWidth: CGFloat = 64

    var body: some View {
        if isStale, let range = state.scanInterval, range.upperBound > Date() {
            Text(timerInterval: range, countsDown: true, showsHours: false)
                .font(SarvamFonts.fraunces(size: numberSize * 0.8, weight: .bold))
                .monospacedDigit()
                .foregroundColor(Color.svMustard)
                .multilineTextAlignment(.trailing)
                .frame(width: timerWidth, alignment: .trailing)
        } else {
            HStack(alignment: .firstTextBaseline, spacing: 1) {
                Text("\(max(1, min(99, state.progress)))")
                    .font(SarvamFonts.fraunces(size: numberSize, weight: .bold))
                    .monospacedDigit()
                Text("%")
                    .font(SarvamFonts.dmSans(size: unitSize, weight: .semibold))
            }
            .foregroundColor(Color.svMustard)
        }
    }
}

/// Bottom-right of the scan card: "About 15 s left", or a running countdown once stale.
struct ScanTimeLeftText: View {
    let state: SarvamActivityAttributes.ContentState
    let isStale: Bool
    var size: CGFloat = 13

    var body: some View {
        if isStale {
            Text("Still working")
                .font(SarvamFonts.dmSans(size: size, weight: .regular))
        } else if state.secondsRemaining > 0 {
            Text("About \(state.secondsRemaining) s left")
                .font(SarvamFonts.dmSans(size: size, weight: .regular))
                .monospacedDigit()
        } else {
            Text("Almost ready")
                .font(SarvamFonts.dmSans(size: size, weight: .regular))
        }
    }
}

// MARK: - Progress Ring (compact / minimal / expanded scan)
struct ProgressRingView: View {
    let progress: Int
    let size: CGFloat

    var body: some View {
        let p = Double(max(4, min(100, progress))) / 100.0
        let line = max(2.5, size * 0.13)
        ZStack {
            Circle()
                .stroke(Color.svTrackGrey, lineWidth: line)
            Circle()
                .trim(from: 0.0, to: CGFloat(p))
                .stroke(Color.svMustard, style: StrokeStyle(lineWidth: line, lineCap: .round))
                .rotationEffect(.degrees(-90))
            Circle()
                .fill(Color.svCoral)
                .frame(width: size * 0.22, height: size * 0.22)
        }
        .frame(width: size, height: size)
    }
}

struct CheckDisc: View {
    let size: CGFloat
    var fill: Color = .svMustard
    var mark: Color = .svInk

    var body: some View {
        ZStack {
            Circle().fill(fill).frame(width: size, height: size)
            Image(systemName: "checkmark")
                .font(.system(size: size * 0.46, weight: .bold))
                .foregroundColor(mark)
        }
    }
}

// MARK: - 5-Bar Waveform Icon
struct WaveformIconView: View {
    let isPaused: Bool
    var scale: CGFloat = 1

    private let heights: [CGFloat] = [8, 15, 22, 12, 18]

    var body: some View {
        HStack(alignment: .center, spacing: 2.5 * scale) {
            ForEach(0..<heights.count, id: \.self) { idx in
                Capsule()
                    .fill(Color.svMustard.opacity(isPaused ? 0.5 : 1.0))
                    .frame(width: 3.5 * scale, height: heights[idx] * scale)
            }
        }
        .frame(height: 24 * scale)
    }
}

// MARK: - Listen v3 (approved prototype "Listen v3: one clock, three places")
// Left column: a centre ruler (10 pt per second) that slides under a fixed gold mark, the time
// under it ("0:22 / 0:28") and full-size controls (38 / 46 / 38 pt). Right column: captions like
// song lyrics (previous line dim, the sentence being read bright, next line dim), moving up one
// sentence at a time. Live Activities cannot be dragged, so the ruler is made of tap zones: a tap
// brings that part of the ruler under the gold mark. The app pushes a new state about once a
// second while playing (and at once on every new sentence, seek or button), and iOS glides the
// ruler and slides the captions between states.

enum ListenV3 {
    static let pointsPerSecond: CGFloat = 10
    static let rulerWidth: CGFloat = 166
    static let rulerHeight: CGFloat = 28
    static let columnGap: CGFloat = 16
    static let bodyHeight: CGFloat = 92
    static let dimGrey = Color(red: 141/255, green: 146/255, blue: 143/255) // #8D928F
    static let labelGrey = Color(red: 154/255, green: 160/255, blue: 156/255) // #9AA09C
    static let islandFutureTick = Color(red: 76/255, green: 80/255, blue: 77/255) // #4C504D
    static let lockFutureTick = Color.svOffWhite.opacity(0.32)
    /// Three seconds per tap zone, like the prototype.
    static let secondsPerZone = 3
    /// Longest audio drawn tick by tick (the spoken summary is capped well under this).
    static let maxSeconds = 420

    static func captionFont(_ state: SarvamActivityAttributes.ContentState, size: CGFloat, weight: Font.Weight) -> Font {
        state.language == "en" ? SarvamFonts.dmSans(size: size, weight: weight) : SarvamFonts.indic(size: size, weight: weight)
    }
}

/// The ruler: second ticks (tall every 5 s), gold up to the playhead, grey after it. It slides so
/// the current second sits under the gold mark; the edges fade out.
struct CentreRulerView: View {
    let state: SarvamActivityAttributes.ContentState
    var futureColor: Color = ListenV3.islandFutureTick

    var body: some View {
        let pps = ListenV3.pointsPerSecond
        let width = ListenV3.rulerWidth
        let height = ListenV3.rulerHeight
        let preparing = state.isPreparingAudio
        let duration = preparing ? 30.0 : max(1.0, state.duration)
        let lastSecond = min(ListenV3.maxSeconds, Int(duration.rounded(.up)))
        let position = preparing ? 0.0 : max(0.0, min(duration, state.currentTime))
        let zoneCount = lastSecond / ListenV3.secondsPerZone + 1
        // Tick v is centred at v·pps + pps/2 in the strip; that point goes under the mark.
        let shift = width / 2 - (CGFloat(position) * pps + pps / 2)
        // Only the zones in view (±10 s), so no hidden button sits outside the ruler.
        let firstZone = max(0, Int(floor((position - 10) / Double(ListenV3.secondsPerZone))))
        let lastZone = min(zoneCount - 1, Int(ceil((position + 10) / Double(ListenV3.secondsPerZone))))

        ZStack(alignment: .topLeading) {
            ZStack(alignment: .topLeading) {
                ForEach(firstZone...max(firstZone, lastZone), id: \.self) { zone in
                    zoneButton(zone: zone, lastSecond: lastSecond, position: position, duration: duration, preparing: preparing)
                        .offset(x: CGFloat(zone * ListenV3.secondsPerZone) * pps)
                }
            }
            .offset(x: shift)

            Capsule()
                .fill(Color.svLightMustard)
                .frame(width: 3, height: height)
                .offset(x: width / 2 - 1.5)
                .allowsHitTesting(false)
        }
        .frame(width: width, height: height, alignment: .topLeading)
        .clipShape(Rectangle())
        .contentShape(Rectangle())
        .mask(
            LinearGradient(
                stops: [
                    .init(color: .clear, location: 0),
                    .init(color: .black, location: 0.18),
                    .init(color: .black, location: 0.82),
                    .init(color: .clear, location: 1)
                ],
                startPoint: .leading,
                endPoint: .trailing
            )
        )
        .accessibilityElement(children: .contain)
        .accessibilityLabel("Playback position, tap to jump")
    }

    /// One tap zone = its three ticks (a button's label must be visible to be reliably tappable).
    @ViewBuilder
    private func zoneButton(zone: Int, lastSecond: Int, position: Double, duration: Double, preparing: Bool) -> some View {
        let pps = ListenV3.pointsPerSecond
        let first = zone * ListenV3.secondsPerZone
        let ticks = HStack(spacing: 0) {
            ForEach(0..<ListenV3.secondsPerZone, id: \.self) { k in
                let v = first + k
                ZStack(alignment: .bottom) {
                    if v <= lastSecond {
                        Capsule()
                            .fill(Double(v) <= position && !preparing ? Color.svMustard : futureColor)
                            .frame(width: 3, height: v % 5 == 0 ? 22 : 12)
                    }
                }
                .frame(width: pps, height: ListenV3.rulerHeight, alignment: .bottom)
            }
        }
        .contentShape(Rectangle())

        // Middle second of the zone: a tap brings it under the gold mark.
        let target = min(duration, Double(first + 1))
        if !preparing {
            Button(intent: SeekToSecondsIntent(seconds: target)) {
                ticks
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Jump to \(formatAudioTime(target))")
        } else {
            ticks
        }
    }
}

/// Elapsed time: a system timer while playing (runs every second by itself), the stored time when
/// paused. Fixed width: a timer text otherwise takes all the space it is given.
struct ListenElapsedText: View {
    let state: SarvamActivityAttributes.ContentState
    let size: CGFloat
    var width: CGFloat? = nil
    var alignment: Alignment = .leading

    var body: some View {
        Group {
            // At another speed the clock and the audio run at different rates; then the app's
            // once-a-second updates keep the stored time right instead.
            if let range = state.playbackTimerRange, abs((state.playbackRate ?? 1) - 1) < 0.01 {
                Text(timerInterval: range, countsDown: false, showsHours: false)
            } else {
                Text(formatAudioTime(state.currentTime))
            }
        }
        .font(SarvamFonts.dmSans(size: size, weight: .semibold))
        .monospacedDigit()
        .foregroundColor(Color.svMustard)
        .multilineTextAlignment(alignment == .trailing ? .trailing : .leading)
        .frame(width: width, alignment: alignment)
    }
}

/// "0:22 / 0:28" under the ruler, centred on the gold mark.
struct ListenTimeLine: View {
    let state: SarvamActivityAttributes.ContentState
    var totalColor: Color = ListenV3.dimGrey

    var body: some View {
        HStack(spacing: 0) {
            ListenElapsedText(state: state, size: 13, width: 40, alignment: .trailing)
            Text(" / \(state.isPreparingAudio ? "--:--" : formatAudioTime(state.duration))")
                .font(SarvamFonts.dmSans(size: 13, weight: .medium))
                .monospacedDigit()
                .foregroundColor(totalColor)
                .lineLimit(1)
                .frame(width: 52, alignment: .leading)
        }
        .frame(width: ListenV3.rulerWidth)
    }
}

/// Back 10 s · play/pause · forward 10 s, full size (38 / 46 / 38 pt, 10 pt apart).
struct ListenButtonsV3: View {
    let state: SarvamActivityAttributes.ContentState
    var playFill: Color = Color.svMustard.opacity(0.26)
    var playIcon: Color = Color.svMustard
    var skipFill: Color = Color.svOffWhite.opacity(0.12)

    var body: some View {
        let paused = state.phase != "listening"
        HStack(spacing: 10) {
            if #available(iOS 17.0, *) {
                Button(intent: SkipBackwardIntent()) {
                    ZStack {
                        Circle().fill(skipFill).frame(width: 38, height: 38)
                        Image(systemName: "gobackward.10")
                            .font(.system(size: 17, weight: .semibold))
                            .foregroundColor(Color.svOffWhite)
                    }
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Back 10 seconds")

                Button(intent: PlayPauseIntent()) {
                    ZStack {
                        Circle().fill(playFill).frame(width: 46, height: 46)
                        Image(systemName: paused ? "play.fill" : "pause.fill")
                            .font(.system(size: 18, weight: .bold))
                            .foregroundColor(playIcon)
                    }
                }
                .buttonStyle(.plain)
                .accessibilityLabel(paused ? "Play" : "Pause")

                Button(intent: SkipForwardIntent()) {
                    ZStack {
                        Circle().fill(skipFill).frame(width: 38, height: 38)
                        Image(systemName: "goforward.10")
                            .font(.system(size: 17, weight: .semibold))
                            .foregroundColor(Color.svOffWhite)
                    }
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Forward 10 seconds")
            }
        }
        .frame(width: ListenV3.rulerWidth)
    }
}

/// Lyrics: the sentence being read, bright, sized so the whole sentence fits (three lines at most);
/// the previous and next lines dim, one line each. A new sentence pushes the lines up.
struct ListenCaptionsView: View {
    let state: SarvamActivityAttributes.ContentState

    var body: some View {
        let lines = captionLines
        VStack(alignment: .leading, spacing: 5) {
            Text(lines.prev)
                .font(ListenV3.captionFont(state, size: state.captionDimSize, weight: .medium))
                .foregroundColor(Color.svOffWhite.opacity(0.42))
                .lineLimit(1)
                .minimumScaleFactor(0.8)
            Text(lines.now)
                .font(ListenV3.captionFont(state, size: lines.nowSize, weight: .bold))
                .foregroundColor(Color.svOffWhite)
                .lineLimit(3)
                .minimumScaleFactor(0.7)
                .layoutPriority(1)
            Text(lines.next)
                .font(ListenV3.captionFont(state, size: state.captionDimSize, weight: .medium))
                .foregroundColor(Color.svOffWhite.opacity(0.5))
                .lineLimit(1)
                .minimumScaleFactor(0.8)
        }
        .padding(.top, 2)
        .frame(maxWidth: .infinity, alignment: .topLeading)
        .id(state.captionIndex ?? -1)
        .transition(.push(from: .bottom))
        .frame(maxWidth: .infinity, minHeight: ListenV3.bodyHeight, maxHeight: ListenV3.bodyHeight, alignment: .topLeading)
        .clipped()
        .mask(
            LinearGradient(
                stops: [
                    .init(color: .clear, location: 0),
                    .init(color: .black, location: 0.24),
                    .init(color: .black, location: 0.80),
                    .init(color: .clear, location: 1)
                ],
                startPoint: .top,
                endPoint: .bottom
            )
        )
        .privacySensitive()
        .accessibilityElement(children: .combine)
    }

    private var captionLines: (prev: String, now: String, next: String, nowSize: CGFloat) {
        if state.isPreparingAudio {
            let text = state.stage.isEmpty ? "Getting the voice ready…" : state.stage
            return (" ", text, " ", 14)
        }
        if state.hasCaptions {
            return (state.captionPrev ?? " ", state.captionNow ?? " ", state.captionNext ?? " ", state.captionNowSize)
        }
        // No sentence timings (older voice server or the phone's own voice): the title and voice.
        return (" ", state.displayTitle, state.languageVoiceLabel, 15)
    }
}

/// While the phone is locked the Lock Screen shows this instead of the words (documents can be
/// private: prescriptions, lab results). iOS marks locked views with the privacy redaction reason.
struct ListenLockedCaptionsView: View {
    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Image(systemName: "lock")
                .font(.system(size: 16, weight: .semibold))
                .foregroundColor(Color.svMintPill)
            Text("Unlock to see the words being read.")
                .font(SarvamFonts.dmSans(size: 13, weight: .semibold))
                .foregroundColor(Color.svOffWhite.opacity(0.82))
                .lineLimit(3)
                .minimumScaleFactor(0.85)
                .fixedSize(horizontal: false, vertical: true)
        }
        .frame(maxWidth: .infinity, minHeight: ListenV3.bodyHeight, maxHeight: ListenV3.bodyHeight, alignment: .leading)
    }
}

/// Ruler, time and buttons on the left; captions on the right (no divider).
struct ListenBodyV3: View {
    let state: SarvamActivityAttributes.ContentState
    var onLockScreen: Bool = false
    @Environment(\.redactionReasons) private var redactionReasons

    var body: some View {
        HStack(alignment: .top, spacing: ListenV3.columnGap) {
            VStack(spacing: 3) {
                CentreRulerView(
                    state: state,
                    futureColor: onLockScreen ? ListenV3.lockFutureTick : ListenV3.islandFutureTick
                )
                ListenTimeLine(
                    state: state,
                    totalColor: onLockScreen ? Color.svOffWhite.opacity(0.6) : ListenV3.dimGrey
                )
                ListenButtonsV3(
                    state: state,
                    playFill: onLockScreen ? Color.svMustard : Color.svMustard.opacity(0.26),
                    playIcon: onLockScreen ? Color.svInk : Color.svMustard,
                    skipFill: Color.svOffWhite.opacity(onLockScreen ? 0.16 : 0.12)
                )
                .padding(.top, 2)
            }
            .frame(width: ListenV3.rulerWidth)

            if onLockScreen && redactionReasons.contains(.privacy) {
                ListenLockedCaptionsView()
            } else {
                ListenCaptionsView(state: state)
            }
        }
    }
}

/// Ready card "Listen": starts the audio right here (Lock Screen / Dynamic Island), no app open.
struct ListenNowButton<Content: View>: View {
    let docId: String
    @ViewBuilder let label: () -> Content

    var body: some View {
        if #available(iOS 17.0, *) {
            Button(intent: StartListenIntent(docId: docId)) {
                label()
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Listen")
        } else {
            Link(destination: sarvamLink("listen", docId)) {
                label()
            }
            .accessibilityLabel("Listen")
        }
    }
}

/// Shown in place of the ruler while the voice is being fetched (or if that failed).
struct ListenPreparingText: View {
    let state: SarvamActivityAttributes.ContentState
    let height: CGFloat

    var body: some View {
        HStack(spacing: 8) {
            WaveformIconView(isPaused: true, scale: 0.7)
            Text(state.stage.isEmpty ? "Getting the voice ready…" : state.stage)
                .font(SarvamFonts.dmSans(size: 13, weight: .medium))
                .foregroundColor(Color.svOffWhite.opacity(0.85))
                .lineLimit(1)
                .minimumScaleFactor(0.85)
            Spacer(minLength: 0)
        }
        .frame(height: height)
    }
}

// MARK: - Wordmark View
struct WordmarkView: View {
    var dotColor: Color = .svCoral
    var textColor: Color = .svOffWhite
    var size: CGFloat = 16

    var body: some View {
        HStack(spacing: 0) {
            Text("Sarvam")
                .font(SarvamFonts.dmSans(size: size, weight: .bold))
                .foregroundColor(textColor)
            Text(".")
                .font(SarvamFonts.dmSans(size: size, weight: .bold))
                .foregroundColor(dotColor)
        }
    }
}

struct PillView: View {
    let text: String
    var fill: Color = .svMintPill
    var ink: Color = .svMintText
    var outlined: Bool = false

    var body: some View {
        Text(text)
            .font(SarvamFonts.indic(size: 12, weight: .semibold))
            .foregroundColor(ink)
            .lineLimit(1)
            .padding(.horizontal, 10)
            .frame(height: 22)
            .background(outlined ? Color.clear : fill)
            .overlay(Capsule().stroke(outlined ? ink : Color.clear, lineWidth: 1.5))
            .clipShape(Capsule())
    }
}

// MARK: - MAIN WIDGET CONFIGURATION
@main
struct SarvamActivityWidget: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: SarvamActivityAttributes.self) { context in
            LockScreenLiveActivityView(state: context.state, isStale: context.isStale)
                .activityBackgroundTint(Color.clear)
                .activitySystemActionForegroundColor(Color.svOffWhite)
        } dynamicIsland: { context in
            DynamicIsland {
                DynamicIslandExpandedRegion(.leading) {
                    ExpandedLeadingView(state: context.state)
                }
                DynamicIslandExpandedRegion(.trailing) {
                    ExpandedTrailingView(state: context.state, isStale: context.isStale)
                }
                DynamicIslandExpandedRegion(.bottom) {
                    ExpandedBottomView(state: context.state, isStale: context.isStale)
                }
            } compactLeading: {
                CompactLeadingView(state: context.state)
            } compactTrailing: {
                CompactTrailingView(state: context.state, isStale: context.isStale)
            } minimal: {
                MinimalView(state: context.state)
            }
            .widgetURL(context.state.phase == "ready" ? sarvamLink("doc", context.state.docId) : nil)
            .keylineTint(Color.svMustard)
        }
    }
}

// MARK: - Dynamic Island Compact Views
struct CompactLeadingView: View {
    let state: SarvamActivityAttributes.ContentState

    var body: some View {
        if state.isListenPhase {
            WaveformIconView(isPaused: state.phase != "listening", scale: 0.9)
                .accessibilityLabel(state.phase == "listening" ? "Audio playing" : "Audio paused")
        } else if state.phase == "ready" {
            CheckDisc(size: 22)
        } else if state.phase == "failed" {
            Image(systemName: "exclamationmark.circle.fill")
                .font(.system(size: 18, weight: .bold))
                .foregroundColor(Color.svCoral)
        } else {
            ProgressRingView(progress: state.progress, size: 20)
                .accessibilityLabel("Sarvam analyzing document")
        }
    }
}

struct CompactTrailingView: View {
    let state: SarvamActivityAttributes.ContentState
    let isStale: Bool

    var body: some View {
        if state.isListenPhase {
            Text(formatAudioTime(state.currentTime))
                .font(SarvamFonts.dmSans(size: 14, weight: .semibold))
                .monospacedDigit()
                .foregroundColor(state.phase == "listening" ? Color.svMustard : Color.svMustard.opacity(0.6))
        } else if state.phase == "ready" {
            Text("Ready")
                .font(SarvamFonts.dmSans(size: 14, weight: .semibold))
                .foregroundColor(Color.svMustard)
        } else if state.phase == "failed" {
            Text("Retry")
                .font(SarvamFonts.dmSans(size: 14, weight: .semibold))
                .foregroundColor(Color.svCoral)
        } else {
            ScanPercentText(state: state, isStale: isStale, numberSize: 14, unitSize: 12, timerWidth: 40)
                .accessibilityLabel("Analyzing document")
        }
    }
}

// MARK: - Dynamic Island Minimal View
struct MinimalView: View {
    let state: SarvamActivityAttributes.ContentState

    var body: some View {
        if state.isListenPhase {
            WaveformIconView(isPaused: state.phase != "listening", scale: 0.75)
        } else if state.phase == "ready" {
            CheckDisc(size: 18)
        } else if state.phase == "failed" {
            Image(systemName: "exclamationmark.circle.fill")
                .font(.system(size: 16, weight: .bold))
                .foregroundColor(Color.svCoral)
        } else {
            ProgressRingView(progress: state.progress, size: 18)
        }
    }
}

// MARK: - Dynamic Island Expanded Views
struct ExpandedLeadingView: View {
    let state: SarvamActivityAttributes.ContentState

    var body: some View {
        if state.isListenPhase {
            HStack(spacing: 8) {
                ZStack {
                    Circle().fill(Color.svTealCard).frame(width: 26, height: 26)
                    Text("S")
                        .font(SarvamFonts.fraunces(size: 15, weight: .bold))
                        .foregroundColor(Color.svOffWhite)
                }
                Text(state.displayTitle)
                    .font(SarvamFonts.dmSans(size: 15, weight: .semibold))
                    .foregroundColor(Color.svOffWhite)
                    .lineLimit(1)
                    .privacySensitive()
            }
            .padding(.leading, 6)
        } else if state.phase == "ready" {
            CheckDisc(size: 28)
                .padding(.leading, 6)
        } else if state.phase == "failed" {
            Image(systemName: "exclamationmark.circle.fill")
                .font(.system(size: 26, weight: .bold))
                .foregroundColor(Color.svCoral)
                .padding(.leading, 6)
        } else {
            ProgressRingView(progress: state.progress, size: 28)
                .padding(.leading, 6)
                .accessibilityLabel("Analyzing document")
        }
    }
}

struct ExpandedTrailingView: View {
    let state: SarvamActivityAttributes.ContentState
    let isStale: Bool

    var body: some View {
        if state.isListenPhase {
            Text(state.languageVoiceLabel)
                .font(SarvamFonts.indic(size: 13, weight: .semibold))
                .foregroundColor(ListenV3.labelGrey)
                .lineLimit(1)
                .minimumScaleFactor(0.8)
                .padding(.trailing, 6)
        } else if state.phase == "ready" {
            Text("Ready")
                .font(SarvamFonts.fraunces(size: 24, weight: .bold))
                .foregroundColor(Color.svMustard)
                .padding(.trailing, 6)
        } else if state.phase == "failed" {
            EmptyView()
        } else {
            ScanPercentText(state: state, isStale: isStale, numberSize: 28, unitSize: 15, timerWidth: 64)
                .padding(.trailing, 6)
        }
    }
}

struct ExpandedBottomView: View {
    let state: SarvamActivityAttributes.ContentState
    let isStale: Bool

    var body: some View {
        if state.isListenPhase {
            ListenBodyV3(state: state)
                .padding(.horizontal, 6)
                .padding(.bottom, 2)
        } else if state.phase == "ready" {
            VStack(alignment: .leading, spacing: 8) {
                VStack(alignment: .leading, spacing: 2) {
                    Text(state.displayTitle)
                        .font(SarvamFonts.dmSans(size: 16, weight: .semibold))
                        .foregroundColor(Color.svOffWhite)
                        .lineLimit(1)
                        .privacySensitive()
                    Text(state.allowListen ? "Explained in \(state.languageLabel), with voice" : "Explained in \(state.languageLabel)")
                        .font(SarvamFonts.indic(size: 13, weight: .regular))
                        .foregroundColor(Color(red: 211/255, green: 215/255, blue: 210/255))
                        .lineLimit(1)
                }
                HStack(spacing: 10) {
                    Link(destination: sarvamLink("doc", state.docId)) {
                        HStack(spacing: 6) {
                            Text("Open").font(SarvamFonts.dmSans(size: 15, weight: .semibold))
                            Image(systemName: "arrow.right").font(.system(size: 13, weight: .bold))
                        }
                        .foregroundColor(Color.svInk)
                        .frame(maxWidth: .infinity)
                        .frame(height: 38)
                        .background(Color.svMustard)
                        .clipShape(Capsule())
                    }
                    .accessibilityLabel("Open document result")

                    if state.allowListen {
                        ListenNowButton(docId: state.docId) {
                            HStack(spacing: 6) {
                                Image(systemName: "play.fill").font(.system(size: 12, weight: .bold))
                                Text("Listen").font(SarvamFonts.dmSans(size: 15, weight: .semibold))
                            }
                            .foregroundColor(Color.svOffWhite)
                            .frame(maxWidth: .infinity)
                            .frame(height: 38)
                            .background(Color.svDarkBtn)
                            .clipShape(Capsule())
                        }
                    }
                }
            }
            .padding(.horizontal, 8)
            .padding(.bottom, 4)
        } else if state.phase == "failed" {
            VStack(alignment: .leading, spacing: 3) {
                Text(state.errorMessage ?? "Analysis failed. Please try again.")
                    .font(SarvamFonts.dmSans(size: 15, weight: .semibold))
                    .foregroundColor(Color.svOffWhite)
                    .lineLimit(2)
                Text("Open Sarvam to try again")
                    .font(SarvamFonts.dmSans(size: 13, weight: .regular))
                    .foregroundColor(Color.svOffWhite.opacity(0.75))
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.horizontal, 8)
            .padding(.bottom, 4)
        } else {
            VStack(alignment: .leading, spacing: 4) {
                Text(state.displayTitle)
                    .font(SarvamFonts.dmSans(size: 16, weight: .semibold))
                    .foregroundColor(Color.svOffWhite)
                    .lineLimit(1)
                    .privacySensitive()
                HStack {
                    Text(isStale ? "Analyzing document…" : state.stage)
                        .font(SarvamFonts.indic(size: 13, weight: .regular))
                        .foregroundColor(Color(red: 211/255, green: 215/255, blue: 210/255))
                        .lineLimit(1)
                        .minimumScaleFactor(0.85)
                    Spacer(minLength: 6)
                    ScanTimeLeftText(state: state, isStale: isStale, size: 12)
                        .foregroundColor(Color.svOffWhite.opacity(0.7))
                }
                ScanSegmentBar(state: state)
                    .padding(.top, 6)
            }
            .padding(.horizontal, 8)
            .padding(.bottom, 6)
        }
    }
}

// MARK: - LOCK SCREEN PRESENTATIONS (each kept under the 160 pt limit)
struct LockScreenLiveActivityView: View {
    let state: SarvamActivityAttributes.ContentState
    let isStale: Bool

    var body: some View {
        Group {
            if state.isListenPhase {
                LockScreenListenView(state: state)
            } else if state.phase == "ready" {
                LockScreenReadyView(state: state)
            } else if state.phase == "failed" {
                LockScreenFailedView(state: state)
            } else {
                LockScreenScanningView(state: state, isStale: isStale)
            }
        }
    }
}

// MARK: - Lock Screen scanning (teal card)
struct LockScreenScanningView: View {
    let state: SarvamActivityAttributes.ContentState
    let isStale: Bool

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack {
                WordmarkView(dotColor: .svCoral)
                Spacer()
                PillView(text: "Processing securely")
            }

            HStack(alignment: .bottom, spacing: 10) {
                VStack(alignment: .leading, spacing: 2) {
                    Text(state.displayTitle)
                        .font(SarvamFonts.fraunces(size: 22, weight: .semibold))
                        .foregroundColor(Color.svOffWhite)
                        .lineLimit(1)
                        .privacySensitive()
                    Text(state.fileCount == 1 ? "1 photo" : "\(state.fileCount) files")
                        .font(SarvamFonts.dmSans(size: 13, weight: .regular))
                        .foregroundColor(Color.svOffWhite.opacity(0.82))
                }
                Spacer(minLength: 6)
                ScanPercentText(state: state, isStale: isStale, numberSize: 36, unitSize: 17, timerWidth: 84)
            }
            .padding(.top, 10)

            ScanSegmentBar(state: state)
                .padding(.top, 12)

            HStack {
                Text(isStale ? "Analyzing document…" : state.stage)
                    .font(SarvamFonts.indic(size: 13, weight: .semibold))
                    .foregroundColor(Color.svMustard)
                    .lineLimit(1)
                    .minimumScaleFactor(0.85)
                Spacer(minLength: 6)
                ScanTimeLeftText(state: state, isStale: isStale, size: 13)
                    .foregroundColor(Color.svOffWhite.opacity(0.78))
            }
            .padding(.top, 8)
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 14)
        .background(Color.svTealCard)
        .overlay(RoundedRectangle(cornerRadius: 22).stroke(Color.svCardStroke, lineWidth: 1))
        .clipShape(RoundedRectangle(cornerRadius: 22))
    }
}

// MARK: - Lock Screen Ready (gold card)
struct LockScreenReadyView: View {
    let state: SarvamActivityAttributes.ContentState

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack {
                WordmarkView(dotColor: Color(red: 169/255, green: 61/255, blue: 27/255), textColor: .svInk)
                Spacer()
                PillView(text: state.languageLabel, ink: .svInk, outlined: true)
            }

            HStack(alignment: .center, spacing: 10) {
                VStack(alignment: .leading, spacing: 2) {
                    Text("Your document is ready")
                        .font(SarvamFonts.fraunces(size: 20, weight: .semibold))
                        .foregroundColor(Color.svInk)
                        .lineLimit(1)
                        .minimumScaleFactor(0.85)
                    Text(state.showDocumentName ? "\(state.displayFileName) · \(photoCount)" : photoCount)
                        .font(SarvamFonts.dmSans(size: 13, weight: .regular))
                        .foregroundColor(Color.svInk.opacity(0.78))
                        .lineLimit(1)
                        .privacySensitive()
                }
                Spacer(minLength: 6)
                CheckDisc(size: 32, fill: .svInk, mark: .svMustard)
            }
            .padding(.top, 10)

            HStack(spacing: 10) {
                Link(destination: sarvamLink("doc", state.docId)) {
                    HStack(spacing: 6) {
                        Text("Open").font(SarvamFonts.dmSans(size: 15, weight: .semibold))
                        Image(systemName: "arrow.right").font(.system(size: 13, weight: .bold))
                    }
                    .foregroundColor(Color.svOffWhite)
                    .frame(maxWidth: .infinity)
                    .frame(height: 40)
                    .background(Color.svInk)
                    .clipShape(Capsule())
                }
                .accessibilityLabel("Open result")

                if state.allowListen {
                    ListenNowButton(docId: state.docId) {
                        HStack(spacing: 6) {
                            Image(systemName: "play.fill").font(.system(size: 12, weight: .bold))
                            Text("Listen").font(SarvamFonts.dmSans(size: 15, weight: .semibold))
                        }
                        .foregroundColor(Color.svInk)
                        .frame(maxWidth: .infinity)
                        .frame(height: 40)
                        .overlay(Capsule().stroke(Color.svInk, lineWidth: 1.5))
                    }
                }
            }
            .padding(.top, 12)
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 13)
        .background(Color.svMustard)
        .clipShape(RoundedRectangle(cornerRadius: 22))
    }

    private var photoCount: String {
        state.fileCount == 1 ? "1 photo" : "\(state.fileCount) files"
    }
}

// MARK: - Lock Screen failed
struct LockScreenFailedView: View {
    let state: SarvamActivityAttributes.ContentState

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                WordmarkView(dotColor: .svCoral)
                Spacer()
                PillView(text: state.languageLabel)
            }
            Text(state.errorMessage ?? "Analysis failed. Please try again.")
                .font(SarvamFonts.fraunces(size: 19, weight: .semibold))
                .foregroundColor(Color.svOffWhite)
                .lineLimit(2)
            Text("Open Sarvam to try again")
                .font(SarvamFonts.dmSans(size: 13, weight: .regular))
                .foregroundColor(Color.svOffWhite.opacity(0.8))
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 14)
        .background(Color.svTealCard)
        .overlay(RoundedRectangle(cornerRadius: 22).stroke(Color.svCardStroke, lineWidth: 1))
        .clipShape(RoundedRectangle(cornerRadius: 22))
    }
}

// MARK: - Lock Screen Listen (teal card, Listen v3)
// Wordmark + language/voice pill, then the same body as the island: about 154 pt (limit 160).
struct LockScreenListenView: View {
    let state: SarvamActivityAttributes.ContentState

    var body: some View {
        VStack(alignment: .leading, spacing: 9) {
            HStack {
                WordmarkView(dotColor: .svCoral, size: 15)
                Spacer(minLength: 8)
                PillView(text: state.languageVoiceLabel)
            }
            .frame(height: 24)

            ListenBodyV3(state: state, onLockScreen: true)
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
        .background(Color.svTealCard)
        .overlay(RoundedRectangle(cornerRadius: 24).stroke(Color.svCardStroke, lineWidth: 1))
        .clipShape(RoundedRectangle(cornerRadius: 24))
    }
}
