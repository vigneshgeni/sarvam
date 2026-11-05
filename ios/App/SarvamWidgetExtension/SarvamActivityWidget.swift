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

// MARK: - 3-Segment Progress Bar (flex 2 : 2 : 1, 6 pt tall)
struct ThreeSegmentProgressBar: View {
    let progress: Int // 0 to 100

    var body: some View {
        GeometryReader { proxy in
            let totalWidth = proxy.size.width
            let spacing: CGFloat = 4
            let availableWidth = max(0, totalWidth - (spacing * 2))
            // 2 : 2 : 1 ratio => segments are 40%, 40%, 20%
            let seg1Width = availableWidth * 0.40
            let seg2Width = availableWidth * 0.40
            let seg3Width = availableWidth * 0.20

            let p = Double(max(0, min(100, progress)))

            // Fill proportions for each segment
            let fill1 = min(1.0, max(0.0, p / 40.0))
            let fill2 = min(1.0, max(0.0, (p - 40.0) / 40.0))
            let fill3 = min(1.0, max(0.0, (p - 80.0) / 20.0))

            HStack(spacing: spacing) {
                segment(width: seg1Width, fill: fill1)
                segment(width: seg2Width, fill: fill2)
                segment(width: seg3Width, fill: fill3)
            }
        }
        .frame(height: 6)
    }

    private func segment(width: CGFloat, fill: Double) -> some View {
        ZStack(alignment: .leading) {
            Capsule()
                .fill(Color.white.opacity(0.24))
                .frame(width: width, height: 6)

            if fill > 0 {
                Capsule()
                    .fill(Color.svMustard)
                    .frame(width: max(6, width * CGFloat(fill)), height: 6)
            }
        }
    }
}

// MARK: - 26 pt Progress Ring
struct ProgressRingView: View {
    let progress: Int
    let size: CGFloat

    var body: some View {
        let p = Double(max(0, min(100, progress))) / 100.0
        ZStack {
            // Track
            Circle()
                .stroke(Color.svTrackGrey, lineWidth: 3.5)
                .frame(width: size, height: size)

            // Progress Arc
            Circle()
                .trim(from: 0.0, to: CGFloat(p))
                .stroke(Color.svMustard, style: StrokeStyle(lineWidth: 3.5, lineCap: .round))
                .rotationEffect(.degrees(-90))
                .frame(width: size, height: size)

            // Small pulsing coral dot in the middle
            Circle()
                .fill(Color.svCoral)
                .frame(width: 5, height: 5)
        }
    }
}

// MARK: - 5-Bar Waveform Icon
struct WaveformIconView: View {
    let isPaused: Bool

    // Bar heights: 8, 15, 22, 12, 18 pt, 3.5 pt wide
    private let heights: [CGFloat] = [8, 15, 22, 12, 18]

    var body: some View {
        HStack(alignment: .center, spacing: 2.5) {
            ForEach(0..<heights.count, id: \.self) { idx in
                Capsule()
                    .fill(Color.svMustard.opacity(isPaused ? 0.5 : 1.0))
                    .frame(width: 3.5, height: heights[idx])
            }
        }
        .frame(height: 24)
    }
}

// MARK: - 31-Tick Dynamic Ruler
struct TickRulerView: View {
    let currentTime: Double
    let duration: Double

    private let tickCount = 31

    var body: some View {
        let dur = duration > 0 ? duration : 90.0
        let currentRatio = max(0.0, min(1.0, currentTime / dur))
        let currentIdx = Int(round(currentRatio * Double(tickCount - 1)))

        VStack(spacing: 3) {
            // Marker labels: 0:30 and 1:00
            HStack {
                Spacer()
                Text("0:30")
                    .font(SarvamFonts.dmSans(size: 10, weight: .medium))
                    .foregroundColor(Color.svOffWhite.opacity(0.6))
                Spacer()
                Text("1:00")
                    .font(SarvamFonts.dmSans(size: 10, weight: .medium))
                    .foregroundColor(Color.svOffWhite.opacity(0.6))
                Spacer()
            }
            .frame(height: 12)

            // 31 ticks with soft edge fade
            HStack(alignment: .center, spacing: 3.5) {
                ForEach(0..<tickCount, id: \.self) { idx in
                    let isMarker = (idx == 0 || idx == 10 || idx == 20 || idx == 30)
                    let isCurrent = (idx == currentIdx)
                    let isPast = (idx < currentIdx)

                    let height: CGFloat = isCurrent ? 36 : (isMarker ? 36 : 24)
                    let color: Color = isCurrent
                        ? Color.svLightMustard
                        : (isPast ? Color.svMustard : Color.svFutureTick)

                    Capsule()
                        .fill(color)
                        .frame(width: 4, height: height)
                }
            }
            .frame(height: 38)
            .mask(
                LinearGradient(
                    stops: [
                        .init(color: .clear, location: 0.0),
                        .init(color: .black, location: 0.06),
                        .init(color: .black, location: 0.94),
                        .init(color: .clear, location: 1.0)
                    ],
                    startPoint: .leading,
                    endPoint: .trailing
                )
            )
        }
        .padding(.horizontal, 4)
    }
}

// MARK: - Wordmark View
struct WordmarkView: View {
    var dotColor: Color = .svCoral

    var body: some View {
        HStack(spacing: 0) {
            Text("Sarvam")
                .font(SarvamFonts.fraunces(size: 17, weight: .bold))
                .foregroundColor(.svOffWhite)
            Text(".")
                .font(SarvamFonts.fraunces(size: 17, weight: .bold))
                .foregroundColor(dotColor)
        }
    }
}

// MARK: - MAIN WIDGET CONFIGURATION
@main
struct SarvamActivityWidget: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: SarvamActivityAttributes.self) { context in
            // Lock Screen Presentation
            LockScreenLiveActivityView(state: context.state)
                .activityBackgroundTint(Color.clear)
                .activitySystemActionForegroundColor(Color.svOffWhite)
        } dynamicIsland: { context in
            DynamicIsland {
                // Expanded Island Layout
                DynamicIslandExpandedRegion(.leading) {
                    ExpandedLeadingView(state: context.state)
                }
                DynamicIslandExpandedRegion(.trailing) {
                    ExpandedTrailingView(state: context.state)
                }
                DynamicIslandExpandedRegion(.bottom) {
                    ExpandedBottomView(state: context.state)
                }
            } compactLeading: {
                CompactLeadingView(state: context.state)
            } compactTrailing: {
                CompactTrailingView(state: context.state)
            } minimal: {
                MinimalView(state: context.state)
            }
            .keylineTint(Color.svMustard)
        }
    }
}

// MARK: - Dynamic Island Compact Views
struct CompactLeadingView: View {
    let state: SarvamActivityAttributes.ContentState

    var body: some View {
        if state.phase == "listening" || state.phase == "paused" {
            WaveformIconView(isPaused: state.phase == "paused")
                .accessibilityLabel(state.phase == "paused" ? "Audio paused" : "Audio playing")
        } else if state.phase == "ready" {
            ZStack {
                Circle()
                    .fill(Color.svMustard)
                    .frame(width: 22, height: 22)
                Image(systemName: "checkmark")
                    .font(.system(size: 11, weight: .bold))
                    .foregroundColor(Color.svInk)
            }
        } else {
            ProgressRingView(progress: state.progress, size: 22)
                .accessibilityLabel("\(state.progress)%")
        }
    }
}

struct CompactTrailingView: View {
    let state: SarvamActivityAttributes.ContentState

    var body: some View {
        if state.phase == "listening" || state.phase == "paused" {
            Text(formatAudioTime(state.currentTime))
                .font(SarvamFonts.dmSans(size: 14, weight: .semibold))
                .monospacedDigit()
                .foregroundColor(state.phase == "paused" ? Color.svMustard.opacity(0.6) : Color.svMustard)
        } else if state.phase == "ready" {
            Text("Ready")
                .font(SarvamFonts.fraunces(size: 13, weight: .bold))
                .foregroundColor(Color.svMustard)
        } else {
            Text("\(state.progress)%")
                .font(SarvamFonts.dmSans(size: 14, weight: .semibold))
                .monospacedDigit()
                .foregroundColor(Color.svMustard)
        }
    }
}

// MARK: - Dynamic Island Minimal View
struct MinimalView: View {
    let state: SarvamActivityAttributes.ContentState

    var body: some View {
        if state.phase == "listening" || state.phase == "paused" {
            WaveformIconView(isPaused: state.phase == "paused")
        } else if state.phase == "ready" {
            ZStack {
                Circle()
                    .fill(Color.svMustard)
                    .frame(width: 18, height: 18)
                Image(systemName: "checkmark")
                    .font(.system(size: 9, weight: .bold))
                    .foregroundColor(Color.svInk)
            }
        } else {
            ProgressRingView(progress: state.progress, size: 20)
        }
    }
}

// MARK: - Dynamic Island Expanded Views
struct ExpandedLeadingView: View {
    let state: SarvamActivityAttributes.ContentState

    var body: some View {
        if state.phase == "listening" || state.phase == "paused" {
            HStack(spacing: 8) {
                // Teal monogram "S"
                ZStack {
                    Circle()
                        .fill(Color.svTealCard)
                        .frame(width: 28, height: 28)
                    Text("S")
                        .font(SarvamFonts.fraunces(size: 16, weight: .bold))
                        .foregroundColor(Color.svOffWhite)
                }
                Text(state.displayTitle)
                    .font(SarvamFonts.fraunces(size: 15, weight: .semibold))
                    .foregroundColor(Color.svOffWhite)
                    .lineLimit(1)
                    .privacySensitive()
            }
            .padding(.leading, 8)
        } else if state.phase == "ready" {
            HStack(spacing: 8) {
                ZStack {
                    Circle()
                        .fill(Color.svMustard)
                        .frame(width: 26, height: 26)
                    Image(systemName: "checkmark")
                        .font(.system(size: 13, weight: .bold))
                        .foregroundColor(Color.svInk)
                }
                Text("Ready")
                    .font(SarvamFonts.fraunces(size: 24, weight: .bold))
                    .foregroundColor(Color.svMustard)
            }
            .padding(.leading, 8)
        } else {
            HStack(spacing: 8) {
                ProgressRingView(progress: state.progress, size: 26)
            }
            .padding(.leading, 8)
        }
    }
}

struct ExpandedTrailingView: View {
    let state: SarvamActivityAttributes.ContentState

    var body: some View {
        if state.phase == "listening" || state.phase == "paused" {
            Text(state.languageLabel)
                .font(SarvamFonts.indic(size: 13, weight: .medium))
                .foregroundColor(Color.svOffWhite.opacity(0.65))
                .padding(.trailing, 8)
        } else if state.phase == "ready" {
            EmptyView()
        } else {
            Text("\(state.progress)%")
                .font(SarvamFonts.fraunces(size: 28, weight: .bold))
                .monospacedDigit()
                .foregroundColor(Color.svMustard)
                .padding(.trailing, 8)
        }
    }
}

struct ExpandedBottomView: View {
    let state: SarvamActivityAttributes.ContentState

    var body: some View {
        if state.phase == "listening" || state.phase == "paused" {
            // Listen Island Controls
            VStack(spacing: 12) {
                TickRulerView(currentTime: state.currentTime, duration: state.duration)

                // Controls Row
                HStack {
                    Text(formatAudioTime(state.currentTime))
                        .font(SarvamFonts.dmSans(size: 15, weight: .semibold))
                        .monospacedDigit()
                        .foregroundColor(Color.svMustard)

                    Spacer()

                    // Back 10 s
                    if #available(iOS 17.0, *) {
                        Button(intent: SkipBackwardIntent()) {
                            Image(systemName: "gobackward.10")
                                .font(.system(size: 20, weight: .semibold))
                                .foregroundColor(Color.svOffWhite)
                                .frame(width: 44, height: 44)
                        }
                        .buttonStyle(.plain)
                        .accessibilityLabel("Back 10 seconds")
                    }

                    Spacer()

                    // Play / Pause button: 58 pt round tinted mustard
                    if #available(iOS 17.0, *) {
                        Button(intent: PlayPauseIntent()) {
                            ZStack {
                                Circle()
                                    .fill(Color.svMustard.opacity(0.24))
                                    .frame(width: 58, height: 58)
                                Image(systemName: state.phase == "paused" ? "play.fill" : "pause.fill")
                                    .font(.system(size: 24, weight: .bold))
                                    .foregroundColor(Color.svMustard)
                            }
                        }
                        .buttonStyle(.plain)
                        .accessibilityLabel(state.phase == "paused" ? "Play" : "Pause")
                    }

                    Spacer()

                    // Forward 10 s
                    if #available(iOS 17.0, *) {
                        Button(intent: SkipForwardIntent()) {
                            Image(systemName: "goforward.10")
                                .font(.system(size: 20, weight: .semibold))
                                .foregroundColor(Color.svOffWhite)
                                .frame(width: 44, height: 44)
                        }
                        .buttonStyle(.plain)
                        .accessibilityLabel("Forward 10 seconds")
                    }

                    Spacer()

                    Text(formatRemainingAudioTime(state.currentTime, state.duration))
                        .font(SarvamFonts.dmSans(size: 14, weight: .regular))
                        .monospacedDigit()
                        .foregroundColor(Color.svOffWhite.opacity(0.6))
                }
                .padding(.horizontal, 12)
            }
            .padding(.bottom, 8)
        } else if state.phase == "ready" {
            // Ready Island Details & Action Buttons
            VStack(alignment: .leading, spacing: 10) {
                Text(state.displayTitle)
                    .font(SarvamFonts.fraunces(size: 16, weight: .semibold))
                    .foregroundColor(Color.svOffWhite)
                    .privacySensitive()

                Text("Explained in \(state.languageLabel), with voice")
                    .font(SarvamFonts.dmSans(size: 13, weight: .regular))
                    .foregroundColor(Color.svOffWhite.opacity(0.75))

                HStack(spacing: 12) {
                    // Open button (44 pt tall, mustard, ink text)
                    Link(destination: URL(string: "sarvam://doc/\(state.docId)")!) {
                        HStack(spacing: 6) {
                            Text("Open")
                                .font(SarvamFonts.dmSans(size: 15, weight: .bold))
                            Image(systemName: "arrow.right")
                                .font(.system(size: 13, weight: .bold))
                        }
                        .foregroundColor(Color.svInk)
                        .frame(maxWidth: .infinity)
                        .frame(height: 44)
                        .background(Color.svMustard)
                        .clipShape(Capsule())
                    }
                    .accessibilityLabel("Open document result")

                    // Listen button (44 pt tall, dark #2B2B2B, off-white text, play icon)
                    if state.allowListen {
                        Link(destination: URL(string: "sarvam://listen/\(state.docId)")!) {
                            HStack(spacing: 6) {
                                Image(systemName: "play.fill")
                                    .font(.system(size: 12, weight: .bold))
                                Text("Listen")
                                    .font(SarvamFonts.dmSans(size: 15, weight: .bold))
                            }
                            .foregroundColor(Color.svOffWhite)
                            .frame(maxWidth: .infinity)
                            .frame(height: 44)
                            .background(Color.svDarkBtn)
                            .clipShape(Capsule())
                        }
                        .accessibilityLabel("Listen to document")
                    }
                }
            }
            .padding(.horizontal, 10)
            .padding(.bottom, 8)
        } else {
            // Scanning Island Details
            VStack(alignment: .leading, spacing: 8) {
                Text(state.displayTitle)
                    .font(SarvamFonts.fraunces(size: 16, weight: .semibold))
                    .foregroundColor(Color.svOffWhite)
                    .privacySensitive()

                Text(state.stage)
                    .font(SarvamFonts.dmSans(size: 13, weight: .regular))
                    .foregroundColor(Color.svOffWhite.opacity(0.8))

                ThreeSegmentProgressBar(progress: state.progress)
                    .padding(.top, 4)
            }
            .padding(.horizontal, 10)
            .padding(.bottom, 8)
        }
    }
}

// MARK: - LOCK SCREEN PRESENTATIONS
struct LockScreenLiveActivityView: View {
    let state: SarvamActivityAttributes.ContentState

    var body: some View {
        Group {
            if state.phase == "listening" || state.phase == "paused" {
                LockScreenListenView(state: state)
            } else if state.phase == "ready" {
                LockScreenReadyView(state: state)
            } else {
                LockScreenScanningView(state: state)
            }
        }
    }
}

// MARK: - Lock Screen Scanning View (Teal Card #224F48)
struct LockScreenScanningView: View {
    let state: SarvamActivityAttributes.ContentState

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            // Top Row: Wordmark + Mint Pill
            HStack {
                WordmarkView(dotColor: .svCoral)
                Spacer()
                Text("Processing securely")
                    .font(SarvamFonts.dmSans(size: 12, weight: .bold))
                    .foregroundColor(Color.svMintText)
                    .padding(.horizontal, 10)
                    .padding(.vertical, 4)
                    .background(Color.svMintPill)
                    .clipShape(Capsule())
            }

            // Middle Row: Title & Subtitle vs Large Percentage
            HStack(alignment: .bottom) {
                VStack(alignment: .leading, spacing: 4) {
                    Text(state.displayTitle)
                        .font(SarvamFonts.fraunces(size: 26, weight: .bold))
                        .foregroundColor(Color.svOffWhite)
                        .lineLimit(1)
                        .privacySensitive()

                    Text(state.fileCount == 1 ? "1 photo" : "\(state.fileCount) photos")
                        .font(SarvamFonts.dmSans(size: 13, weight: .regular))
                        .foregroundColor(Color.svOffWhite.opacity(0.82))
                }

                Spacer()

                Text("\(state.progress)%")
                    .font(SarvamFonts.fraunces(size: 44, weight: .bold))
                    .monospacedDigit()
                    .foregroundColor(Color.svMustard)
            }

            // 3-Segment Progress Bar
            ThreeSegmentProgressBar(progress: state.progress)

            // Bottom Row: Stage Text vs Time Left
            HStack {
                Text(state.stage)
                    .font(SarvamFonts.dmSans(size: 13, weight: .medium))
                    .foregroundColor(Color.svMustard)
                Spacer()
                Text("Usually under a minute")
                    .font(SarvamFonts.dmSans(size: 13, weight: .regular))
                    .foregroundColor(Color.svOffWhite.opacity(0.8))
            }
        }
        .padding(18)
        .background(Color.svTealCard)
        .overlay(
            RoundedRectangle(cornerRadius: 22)
                .stroke(Color.svCardStroke, lineWidth: 1)
        )
        .clipShape(RoundedRectangle(cornerRadius: 22))
    }
}

// MARK: - Lock Screen Ready View (Gold Card #E9B44C)
struct LockScreenReadyView: View {
    let state: SarvamActivityAttributes.ContentState

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            // Top Row: Wordmark with dark-red full stop + Language Chip
            HStack {
                HStack(spacing: 0) {
                    Text("Sarvam")
                        .font(SarvamFonts.fraunces(size: 17, weight: .bold))
                        .foregroundColor(Color.svInk)
                    Text(".")
                        .font(SarvamFonts.fraunces(size: 17, weight: .bold))
                        .foregroundColor(Color.svCoral)
                }
                Spacer()
                Text(state.languageLabel)
                    .font(SarvamFonts.indic(size: 12, weight: .bold))
                    .foregroundColor(Color.svInk)
                    .padding(.horizontal, 10)
                    .padding(.vertical, 4)
                    .background(Color.clear)
                    .overlay(
                        Capsule().stroke(Color.svInk, lineWidth: 1.5)
                    )
            }

            // Ready Headline & Subtitle with Check Disc
            HStack(alignment: .center) {
                VStack(alignment: .leading, spacing: 3) {
                    Text("Your document is ready")
                        .font(SarvamFonts.fraunces(size: 22, weight: .bold))
                        .foregroundColor(Color.svInk)

                    Text(state.displayFileName)
                        .font(SarvamFonts.dmSans(size: 13, weight: .regular))
                        .foregroundColor(Color.svInk.opacity(0.75))
                        .privacySensitive()
                }

                Spacer()

                ZStack {
                    Circle()
                        .fill(Color.svInk)
                        .frame(width: 38, height: 38)
                    Image(systemName: "checkmark")
                        .font(.system(size: 18, weight: .bold))
                        .foregroundColor(Color.svMustard)
                }
            }

            // Buttons Row (44 pt tall)
            HStack(spacing: 12) {
                Link(destination: URL(string: "sarvam://doc/\(state.docId)")!) {
                    HStack(spacing: 6) {
                        Text("Open")
                            .font(SarvamFonts.dmSans(size: 15, weight: .bold))
                        Image(systemName: "arrow.right")
                            .font(.system(size: 13, weight: .bold))
                    }
                    .foregroundColor(Color.svOffWhite)
                    .frame(maxWidth: .infinity)
                    .frame(height: 44)
                    .background(Color.svInk)
                    .clipShape(Capsule())
                }
                .accessibilityLabel("Open result")

                if state.allowListen {
                    Link(destination: URL(string: "sarvam://listen/\(state.docId)")!) {
                        HStack(spacing: 6) {
                            Image(systemName: "play.fill")
                                .font(.system(size: 12, weight: .bold))
                            Text("Listen")
                                .font(SarvamFonts.dmSans(size: 15, weight: .bold))
                        }
                        .foregroundColor(Color.svInk)
                        .frame(maxWidth: .infinity)
                        .frame(height: 44)
                        .background(Color.clear)
                        .overlay(
                            Capsule().stroke(Color.svInk, lineWidth: 1.5)
                        )
                    }
                    .accessibilityLabel("Listen")
                }
            }
            .padding(.top, 4)
        }
        .padding(18)
        .background(Color.svMustard)
        .clipShape(RoundedRectangle(cornerRadius: 22))
    }
}

// MARK: - Lock Screen Listen View (Teal Card #224F48)
struct LockScreenListenView: View {
    let state: SarvamActivityAttributes.ContentState

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            // Top Row: Wordmark + Language/Voice Pill
            HStack {
                WordmarkView(dotColor: .svCoral)
                Spacer()
                Text(state.languageLabel)
                    .font(SarvamFonts.indic(size: 12, weight: .bold))
                    .foregroundColor(Color.svMintText)
                    .padding(.horizontal, 10)
                    .padding(.vertical, 4)
                    .background(Color.svMintPill)
                    .clipShape(Capsule())
            }

            // Title
            Text(state.displayTitle)
                .font(SarvamFonts.fraunces(size: 26, weight: .bold))
                .foregroundColor(Color.svOffWhite)
                .lineLimit(1)
                .privacySensitive()

            // 31-Tick Dynamic Ruler
            TickRulerView(currentTime: state.currentTime, duration: state.duration)

            // Controls Row
            HStack {
                Text(formatAudioTime(state.currentTime))
                    .font(SarvamFonts.dmSans(size: 16, weight: .bold))
                    .monospacedDigit()
                    .foregroundColor(Color.svMustard)

                Spacer()

                // Back 10 s
                if #available(iOS 17.0, *) {
                    Button(intent: SkipBackwardIntent()) {
                        Image(systemName: "gobackward.10")
                            .font(.system(size: 22, weight: .semibold))
                            .foregroundColor(Color.svOffWhite)
                            .frame(width: 44, height: 44)
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel("Back 10 seconds")
                }

                Spacer()

                // Play / Pause button: 54 pt solid mustard with ink icon
                if #available(iOS 17.0, *) {
                    Button(intent: PlayPauseIntent()) {
                        ZStack {
                            Circle()
                                .fill(Color.svMustard)
                                .frame(width: 54, height: 54)
                            Image(systemName: state.phase == "paused" ? "play.fill" : "pause.fill")
                                .font(.system(size: 22, weight: .bold))
                                .foregroundColor(Color.svInk)
                        }
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel(state.phase == "paused" ? "Play" : "Pause")
                }

                Spacer()

                // Forward 10 s
                if #available(iOS 17.0, *) {
                    Button(intent: SkipForwardIntent()) {
                        Image(systemName: "goforward.10")
                            .font(.system(size: 22, weight: .semibold))
                            .foregroundColor(Color.svOffWhite)
                            .frame(width: 44, height: 44)
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel("Forward 10 seconds")
                }

                Spacer()

                Text(formatRemainingAudioTime(state.currentTime, state.duration))
                    .font(SarvamFonts.dmSans(size: 15, weight: .regular))
                    .monospacedDigit()
                    .foregroundColor(Color.svOffWhite.opacity(0.6))
            }
            .padding(.horizontal, 4)
        }
        .padding(18)
        .background(Color.svTealCard)
        .overlay(
            RoundedRectangle(cornerRadius: 22)
                .stroke(Color.svCardStroke, lineWidth: 1)
        )
        .clipShape(RoundedRectangle(cornerRadius: 22))
    }
}
