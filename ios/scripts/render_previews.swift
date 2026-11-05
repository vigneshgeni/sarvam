import SwiftUI
import AppKit
import CoreText

// Register custom bundled fonts
func registerCustomFonts() {
    let fontPaths = [
        "/Users/vigneshwaran/Projects/sarvam/ios/App/SarvamWidgetExtension/Fonts/Fraunces.ttf",
        "/Users/vigneshwaran/Projects/sarvam/ios/App/SarvamWidgetExtension/Fonts/DMSans.ttf",
        "/Users/vigneshwaran/Projects/sarvam/ios/App/SarvamWidgetExtension/Fonts/NotoSansTamil.ttf"
    ]
    for path in fontPaths {
        let url = URL(fileURLWithPath: path) as CFURL
        var error: Unmanaged<CFError>?
        CTFontManagerRegisterFontsForURL(url, .process, &error)
    }
}
_ = registerCustomFonts()

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

struct StateSnapshot {
    var phase: String = "scanning"
    var title: String = "image.jpg"
    var fileName: String? = "image.jpg"
    var fileCount: Int = 1
    var progress: Int = 62
    var stage: String = "Checking against the document"
    var secondsRemaining: Int = 15
    var language: String = "en"
    var languageLabel: String = "English"
    var voiceGender: String = "female"
    var currentTime: Double = 45
    var duration: Double = 90
    var allowListen: Bool = true
    var showDocumentName: Bool = false

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

// 3-Segment Progress Bar
struct ThreeSegmentProgressBar: View {
    let progress: Int

    var body: some View {
        GeometryReader { proxy in
            let totalWidth = proxy.size.width
            let spacing: CGFloat = 4
            let availableWidth = max(0, totalWidth - (spacing * 2))
            let seg1Width = availableWidth * 0.40
            let seg2Width = availableWidth * 0.40
            let seg3Width = availableWidth * 0.20

            let p = Double(max(0, min(100, progress)))
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

// 26 pt Progress Ring
struct ProgressRingView: View {
    let progress: Int
    let size: CGFloat

    var body: some View {
        let p = Double(max(0, min(100, progress))) / 100.0
        ZStack {
            Circle()
                .stroke(Color.svTrackGrey, lineWidth: 3.5)
                .frame(width: size, height: size)

            Circle()
                .trim(from: 0.0, to: CGFloat(p))
                .stroke(Color.svMustard, style: StrokeStyle(lineWidth: 3.5, lineCap: .round))
                .rotationEffect(.degrees(-90))
                .frame(width: size, height: size)

            Circle()
                .fill(Color.svCoral)
                .frame(width: 5, height: 5)
        }
    }
}

// 31-Tick Dynamic Ruler
struct TickRulerView: View {
    let currentTime: Double
    let duration: Double

    private let tickCount = 31

    var body: some View {
        let dur = duration > 0 ? duration : 90.0
        let currentRatio = max(0.0, min(1.0, currentTime / dur))
        let currentIdx = Int(round(currentRatio * Double(tickCount - 1)))

        VStack(spacing: 4) {
            HStack {
                Spacer()
                Text("0:30")
                    .font(SarvamFonts.dmSans(size: 11, weight: .medium))
                    .foregroundColor(Color.svOffWhite.opacity(0.6))
                Spacer()
                Text("1:00")
                    .font(SarvamFonts.dmSans(size: 11, weight: .medium))
                    .foregroundColor(Color.svOffWhite.opacity(0.6))
                Spacer()
            }
            .frame(height: 12)

            HStack(alignment: .center, spacing: 3.8) {
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

// Wordmark View
struct WordmarkView: View {
    var dotColor: Color = .svCoral

    var body: some View {
        HStack(spacing: 0) {
            Text("Sarvam")
                .font(SarvamFonts.fraunces(size: 18, weight: .bold))
                .foregroundColor(.svOffWhite)
            Text(".")
                .font(SarvamFonts.fraunces(size: 18, weight: .bold))
                .foregroundColor(dotColor)
        }
    }
}

// Lock Screen Scanning View
struct RenderLockScreenScanningView: View {
    let state: StateSnapshot

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
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

            HStack(alignment: .bottom) {
                VStack(alignment: .leading, spacing: 4) {
                    Text(state.displayTitle)
                        .font(SarvamFonts.fraunces(size: 26, weight: .bold))
                        .foregroundColor(Color.svOffWhite)
                        .lineLimit(1)

                    Text(state.fileCount == 1 ? "1 photo" : "\(state.fileCount) photos")
                        .font(SarvamFonts.dmSans(size: 13, weight: .regular))
                        .foregroundColor(Color.svOffWhite.opacity(0.82))
                }

                Spacer()

                HStack(alignment: .firstTextBaseline, spacing: 2) {
                    Text("\(state.progress)")
                        .font(SarvamFonts.fraunces(size: 46, weight: .bold))
                        .foregroundColor(Color.svMustard)
                    Text("%")
                        .font(SarvamFonts.fraunces(size: 24, weight: .bold))
                        .foregroundColor(Color.svMustard)
                }
            }

            ThreeSegmentProgressBar(progress: state.progress)

            HStack {
                Text(state.stage)
                    .font(SarvamFonts.dmSans(size: 13, weight: .medium))
                    .foregroundColor(Color.svMustard)
                Spacer()
                Text("About \(state.secondsRemaining) s left")
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
        .frame(width: 361)
    }
}

// Lock Screen Ready View
struct RenderLockScreenReadyView: View {
    let state: StateSnapshot

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                HStack(spacing: 0) {
                    Text("Sarvam")
                        .font(SarvamFonts.fraunces(size: 18, weight: .bold))
                        .foregroundColor(Color.svInk)
                    Text(".")
                        .font(SarvamFonts.fraunces(size: 18, weight: .bold))
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

            HStack(alignment: .center) {
                VStack(alignment: .leading, spacing: 3) {
                    Text("Your document is ready")
                        .font(SarvamFonts.fraunces(size: 22, weight: .bold))
                        .foregroundColor(Color.svInk)

                    Text(state.displayFileName)
                        .font(SarvamFonts.dmSans(size: 13, weight: .regular))
                        .foregroundColor(Color.svInk.opacity(0.75))
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

            HStack(spacing: 12) {
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

                if state.allowListen {
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
            }
            .padding(.top, 4)
        }
        .padding(18)
        .background(Color.svMustard)
        .clipShape(RoundedRectangle(cornerRadius: 22))
        .frame(width: 361)
    }
}

// Lock Screen Listen View
struct RenderLockScreenListenView: View {
    let state: StateSnapshot

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
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

            Text(state.displayTitle)
                .font(SarvamFonts.fraunces(size: 26, weight: .bold))
                .foregroundColor(Color.svOffWhite)
                .lineLimit(1)

            TickRulerView(currentTime: state.currentTime, duration: state.duration)

            HStack {
                Text(formatAudioTime(state.currentTime))
                    .font(SarvamFonts.dmSans(size: 16, weight: .bold))
                    .monospacedDigit()
                    .foregroundColor(Color.svMustard)

                Spacer()

                Image(systemName: "gobackward.10")
                    .font(.system(size: 22, weight: .semibold))
                    .foregroundColor(Color.svOffWhite)
                    .frame(width: 44, height: 44)

                Spacer()

                ZStack {
                    Circle()
                        .fill(Color.svMustard)
                        .frame(width: 54, height: 54)
                    Image(systemName: state.phase == "paused" ? "play.fill" : "pause.fill")
                        .font(.system(size: 22, weight: .bold))
                        .foregroundColor(Color.svInk)
                }

                Spacer()

                Image(systemName: "goforward.10")
                    .font(.system(size: 22, weight: .semibold))
                    .foregroundColor(Color.svOffWhite)
                    .frame(width: 44, height: 44)

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
        .frame(width: 361)
    }
}

// Dynamic Island Expanded - Scanning
struct RenderExpandedScanningIsland: View {
    let state: StateSnapshot

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                ProgressRingView(progress: state.progress, size: 26)
                Spacer()
                HStack(alignment: .firstTextBaseline, spacing: 2) {
                    Text("\(state.progress)")
                        .font(SarvamFonts.fraunces(size: 28, weight: .bold))
                        .foregroundColor(Color.svMustard)
                    Text("%")
                        .font(SarvamFonts.fraunces(size: 16, weight: .bold))
                        .foregroundColor(Color.svMustard)
                }
            }

            VStack(alignment: .leading, spacing: 4) {
                Text(state.displayTitle)
                    .font(SarvamFonts.fraunces(size: 16, weight: .semibold))
                    .foregroundColor(Color.svOffWhite)

                Text(state.stage)
                    .font(SarvamFonts.dmSans(size: 13, weight: .regular))
                    .foregroundColor(Color.svOffWhite.opacity(0.8))

                ThreeSegmentProgressBar(progress: state.progress)
                    .padding(.top, 4)
            }
        }
        .padding(16)
        .frame(width: 361)
        .background(Color.black)
        .clipShape(RoundedRectangle(cornerRadius: 44))
        .overlay(
            RoundedRectangle(cornerRadius: 44)
                .stroke(Color.white.opacity(0.12), lineWidth: 1)
        )
    }
}

// Dynamic Island Expanded - Ready
struct RenderExpandedReadyIsland: View {
    let state: StateSnapshot

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
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
                Spacer()
            }

            VStack(alignment: .leading, spacing: 4) {
                Text(state.displayTitle)
                    .font(SarvamFonts.fraunces(size: 16, weight: .semibold))
                    .foregroundColor(Color.svOffWhite)

                Text("Explained in \(state.languageLabel), with voice")
                    .font(SarvamFonts.dmSans(size: 13, weight: .regular))
                    .foregroundColor(Color.svOffWhite.opacity(0.75))
            }

            HStack(spacing: 12) {
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

                if state.allowListen {
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
            }
        }
        .padding(16)
        .frame(width: 361)
        .background(Color.black)
        .clipShape(RoundedRectangle(cornerRadius: 44))
        .overlay(
            RoundedRectangle(cornerRadius: 44)
                .stroke(Color.white.opacity(0.12), lineWidth: 1)
        )
    }
}

// Dynamic Island Expanded - Listen
struct RenderExpandedListenIsland: View {
    let state: StateSnapshot

    var body: some View {
        VStack(spacing: 12) {
            HStack {
                HStack(spacing: 8) {
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
                }

                Spacer()

                Text(state.languageLabel)
                    .font(SarvamFonts.indic(size: 13, weight: .medium))
                    .foregroundColor(Color.svOffWhite.opacity(0.65))
            }

            TickRulerView(currentTime: state.currentTime, duration: state.duration)

            HStack {
                Text(formatAudioTime(state.currentTime))
                    .font(SarvamFonts.dmSans(size: 15, weight: .semibold))
                    .monospacedDigit()
                    .foregroundColor(Color.svMustard)

                Spacer()

                Image(systemName: "gobackward.10")
                    .font(.system(size: 20, weight: .semibold))
                    .foregroundColor(Color.svOffWhite)
                    .frame(width: 44, height: 44)

                Spacer()

                ZStack {
                    Circle()
                        .fill(Color.svMustard.opacity(0.24))
                        .frame(width: 58, height: 58)
                    Image(systemName: state.phase == "paused" ? "play.fill" : "pause.fill")
                        .font(.system(size: 24, weight: .bold))
                        .foregroundColor(Color.svMustard)
                }

                Spacer()

                Image(systemName: "goforward.10")
                    .font(.system(size: 20, weight: .semibold))
                    .foregroundColor(Color.svOffWhite)
                    .frame(width: 44, height: 44)

                Spacer()

                Text(formatRemainingAudioTime(state.currentTime, state.duration))
                    .font(SarvamFonts.dmSans(size: 14, weight: .regular))
                    .monospacedDigit()
                    .foregroundColor(Color.svOffWhite.opacity(0.6))
            }
            .padding(.horizontal, 8)
        }
        .padding(16)
        .frame(width: 361)
        .background(Color.black)
        .clipShape(RoundedRectangle(cornerRadius: 44))
        .overlay(
            RoundedRectangle(cornerRadius: 44)
                .stroke(Color.white.opacity(0.12), lineWidth: 1)
        )
    }
}

// Full Lock Screen Mockup Context
struct FullLockScreenMockup<Content: View>: View {
    let content: Content
    let timeText: String

    init(timeText: String = "6:54", @ViewBuilder content: () -> Content) {
        self.timeText = timeText
        self.content = content()
    }

    var body: some View {
        ZStack {
            // Dark Wallpaper
            Color(red: 18/255, green: 20/255, blue: 19/255)
                .ignoresSafeArea()

            // Subtle wallpaper circles
            Circle()
                .fill(Color.white.opacity(0.03))
                .frame(width: 450, height: 450)
                .offset(x: -60, y: 40)

            VStack {
                // Top Status Bar
                HStack {
                    Text("9:41")
                        .font(.system(size: 16, weight: .semibold))
                        .foregroundColor(.white)
                    Spacer()
                    HStack(spacing: 6) {
                        Image(systemName: "cellularbars")
                        Image(systemName: "wifi")
                        Image(systemName: "battery.100")
                    }
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundColor(.white)
                }
                .padding(.horizontal, 32)
                .padding(.top, 14)

                // Date & Clock
                VStack(spacing: 2) {
                    Text("Wednesday 4 November")
                        .font(.system(size: 19, weight: .medium))
                        .foregroundColor(Color.white.opacity(0.7))

                    Text(timeText)
                        .font(.system(size: 84, weight: .bold))
                        .foregroundColor(Color.white.opacity(0.85))
                }
                .padding(.top, 30)

                Spacer()

                // Live Activity Card
                content
                    .padding(.horizontal, 16)
                    .padding(.bottom, 36)

                // Flashlight & Camera shortcut circles
                HStack {
                    ZStack {
                        Circle()
                            .fill(Color.white.opacity(0.15))
                            .frame(width: 50, height: 50)
                        Image(systemName: "flashlight.off.fill")
                            .font(.system(size: 18))
                            .foregroundColor(.white)
                    }
                    Spacer()
                    ZStack {
                        Circle()
                            .fill(Color.white.opacity(0.15))
                            .frame(width: 50, height: 50)
                        Image(systemName: "camera.fill")
                            .font(.system(size: 18))
                            .foregroundColor(.white)
                    }
                }
                .padding(.horizontal, 48)
                .padding(.bottom, 20)

                // Home Indicator
                Capsule()
                    .fill(Color.white.opacity(0.6))
                    .frame(width: 140, height: 5)
                    .padding(.bottom, 8)
            }
        }
        .frame(width: 393, height: 852)
        .clipShape(RoundedRectangle(cornerRadius: 54))
    }
}

// RENDER FUNCTION
@MainActor
func saveView<V: View>(_ view: V, to path: String, scale: CGFloat = 3.0) {
    let renderer = ImageRenderer(content: view)
    renderer.scale = scale
    if let nsImage = renderer.nsImage,
       let tiff = nsImage.tiffRepresentation,
       let rep = NSBitmapImageRep(data: tiff),
       let png = rep.representation(using: .png, properties: [:]) {
        try? png.write(to: URL(fileURLWithPath: path))
        print("Exported: \(path)")
    } else {
        print("Failed to export: \(path)")
    }
}

// MAIN EXECUTION
DispatchQueue.main.async {
    let baseDir = "/Users/vigneshwaran/Projects/sarvam/docs/live-activity/screens"

    // 1. Lock Screen Scanning Card
    let scanState = StateSnapshot(
        phase: "scanning",
        title: "image.jpg",
        fileName: "image.jpg",
        fileCount: 1,
        progress: 62,
        stage: "Checking against the document",
        secondsRemaining: 15
    )
    saveView(RenderLockScreenScanningView(state: scanState), to: "\(baseDir)/phase1-scan-lock.png")

    // 2. Lock Screen Ready Card
    let readyState = StateSnapshot(
        phase: "ready",
        title: "image.jpg",
        fileName: "image.jpg · 1 photo",
        fileCount: 1,
        progress: 100,
        stage: "Ready",
        secondsRemaining: 0,
        language: "en",
        languageLabel: "English",
        allowListen: true
    )
    saveView(RenderLockScreenReadyView(state: readyState), to: "\(baseDir)/phase1-ready-lock.png")

    // 3. Lock Screen Listen Card (English)
    let listenEnState = StateSnapshot(
        phase: "listening",
        title: "Laboratory Report",
        progress: 50,
        stage: "Listening",
        language: "en",
        languageLabel: "English",
        voiceGender: "female",
        currentTime: 45,
        duration: 90,
        allowListen: true
    )
    saveView(RenderLockScreenListenView(state: listenEnState), to: "\(baseDir)/phase1-listen-en-lock.png")

    // 4. Lock Screen Listen Card (Tamil)
    let listenTaState = StateSnapshot(
        phase: "listening",
        title: "Laboratory Report",
        progress: 50,
        stage: "Listening",
        language: "ta",
        languageLabel: "தமிழ் · Female",
        voiceGender: "female",
        currentTime: 45,
        duration: 90,
        allowListen: true
    )
    saveView(RenderLockScreenListenView(state: listenTaState), to: "\(baseDir)/phase1-listen-ta-lock.png")

    // 5. Lock Screen Listen Card (Paused)
    var listenPausedState = listenTaState
    listenPausedState.phase = "paused"
    saveView(RenderLockScreenListenView(state: listenPausedState), to: "\(baseDir)/phase1-listen-paused-lock.png")

    // 6. Dynamic Island Expanded - Scanning
    saveView(RenderExpandedScanningIsland(state: scanState), to: "\(baseDir)/phase1-scan-island-expanded.png")

    // 7. Dynamic Island Expanded - Ready
    saveView(RenderExpandedReadyIsland(state: readyState), to: "\(baseDir)/phase1-ready-island-expanded.png")

    // 8. Dynamic Island Expanded - Listen (English)
    saveView(RenderExpandedListenIsland(state: listenEnState), to: "\(baseDir)/phase1-listen-en-island-expanded.png")

    // 9. Dynamic Island Expanded - Listen (Tamil)
    saveView(RenderExpandedListenIsland(state: listenTaState), to: "\(baseDir)/phase1-listen-ta-island-expanded.png")

    // 10. Full Lock Screen Context - Scanning
    let fullLockScan = FullLockScreenMockup(timeText: "6:54") {
        RenderLockScreenScanningView(state: scanState)
    }
    saveView(fullLockScan, to: "\(baseDir)/phase1-scan-full-lockscreen.png", scale: 2.0)

    // 11. Full Lock Screen Context - Ready
    let fullLockReady = FullLockScreenMockup(timeText: "6:55") {
        RenderLockScreenReadyView(state: readyState)
    }
    saveView(fullLockReady, to: "\(baseDir)/phase1-ready-full-lockscreen.png", scale: 2.0)

    // 12. Full Lock Screen Context - Listen (Tamil)
    let fullLockListen = FullLockScreenMockup(timeText: "6:58") {
        RenderLockScreenListenView(state: listenTaState)
    }
    saveView(fullLockListen, to: "\(baseDir)/phase1-listen-ta-full-lockscreen.png", scale: 2.0)

    print("All renders completed successfully!")
    exit(0)
}

dispatchMain()
