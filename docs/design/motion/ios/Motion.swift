// Plus One motion system for SwiftUI.
//
// Values mirror docs/design/motion/motion.json. Springs are the solved physical parameters
// (mass 1) of the measured reference springs, so `interpolatingSpring` replays the same curve
// as the web variants. See docs/design/motion/motion-spec.md for every animation's trigger,
// properties, timing and the reference frame captures.
//
// Requires iOS 17 / macOS 14. The per-character headline reveal uses TextRenderer on iOS 18 /
// macOS 15 and falls back to a whole-line fade-and-rise on older systems.

import SwiftUI

// MARK: - Tokens

public enum PlusMotion {
    /// Duration-based reference spring, solved to stiffness and damping (mass 1).
    public struct Spring: Sendable {
        public let stiffness: Double
        public let damping: Double
        /// Settling duration the web uses for this spring, in seconds.
        public let duration: Double

        public var animation: Animation {
            .interpolatingSpring(mass: 1, stiffness: stiffness, damping: damping, initialVelocity: 0)
        }

        /// Closed-form progress at time `t` (seconds). Matches framer-motion's spring generator.
        public func progress(at t: Double) -> Double {
            guard t > 0 else { return 0 }
            let w0 = stiffness.squareRoot()
            let zeta = damping / (2 * stiffness.squareRoot())
            if zeta < 1 {
                let wd = w0 * (1 - zeta * zeta).squareRoot()
                return 1 - exp(-zeta * w0 * t) * ((zeta * w0 / wd) * sin(wd * t) + cos(wd * t))
            }
            return 1 - exp(-w0 * t) * (1 + w0 * t)
        }
    }

    /// Fade-and-slide reveals: hero art, sections, cards, headings. Framer: duration 1 s, bounce 0.2.
    public static let appear = Spring(stiffness: 80.9, damping: 14.39, duration: 1)
    /// Per-character headline reveal. Framer: duration 0.5 s, bounce 0.
    public static let text = Spring(stiffness: 341.02, damping: 36.93, duration: 0.5)
    /// Per-character section heading and label reveal. Framer: duration 0.4 s, bounce 0.
    public static let textQuick = Spring(stiffness: 532.85, damping: 46.17, duration: 0.4)
    /// Header drop-in on first appearance. Framer: duration 2 s, bounce 0.2.
    public static let nav = Spring(stiffness: 20.22, damping: 7.2, duration: 2)
    /// Closing call-to-action backdrop zoom. Framer: duration 3 s, bounce 0.2.
    public static let zoom = Spring(stiffness: 8.99, damping: 4.8, duration: 3)
    /// Component state changes (nav items, menu toggles). Framer: duration 0.4 s, bounce 0.2.
    public static let state = Spring(stiffness: 505.61, damping: 35.98, duration: 0.4)
    /// Pointer follow (overdamped).
    public static let magnetic = Spring(stiffness: 440, damping: 100, duration: 0.6)
    /// Scroll-driven logo rotation smoothing.
    public static let scrollRotate = Spring(stiffness: 500, damping: 60, duration: 0.4)

    /// Rolling label characters: 300 ms, cubic-bezier(0.25, 0.74, 0.22, 0.99).
    public static let rollChar = Animation.timingCurve(0.25, 0.74, 0.22, 0.99, duration: 0.3)
    /// Rolling label rows: 500 ms, same curve.
    public static let rollRow = Animation.timingCurve(0.25, 0.74, 0.22, 0.99, duration: 0.5)
    /// Press scale: 200 ms ease-out, cubic-bezier(0, 0, 0.58, 1).
    public static let press = Animation.timingCurve(0, 0, 0.58, 1, duration: 0.2)

    public enum Stagger {
        /// Display headline characters.
        public static let headline = 0.025
        public static let quick = 0.020
        public static let label = 0.015
        public static let wide = 0.050
        /// Rolling label characters.
        public static let roll = 0.030
    }

    /// Hero choreography, seconds after first appearance.
    public enum HeroDelay {
        public static let nav = 0.0
        public static let headline = 0.0
        public static let lede = 1.5
        public static let action = 1.7
        public static let art = 2.0
        public static let strip = 2.2
    }

    /// Delay steps used for staggered reveals within a section, seconds.
    public static let sequence: [Double] = [0, 0.2, 0.3, 0.4, 0.5, 0.9, 1.0, 1.1, 1.2, 1.3, 1.4, 1.45, 1.5, 1.6]

    public enum Distance {
        public static let heroArtY: CGFloat = 90
        public static let revealY: CGFloat = 30
        public static let revealYSmall: CGFloat = 20
        public static let revealX: CGFloat = 10
        public static let labelY: CGFloat = 10
        public static let charY: CGFloat = 10
        public static let charBlur: CGFloat = 10
        public static let navY: CGFloat = -80
        public static let rollCharY: CGFloat = 10
        public static let rollRowFraction: CGFloat = 1.1
        public static let zoomFromScale: CGFloat = 2.5
        public static let pressScale: CGFloat = 0.98
        public static let magnetic: CGFloat = 24
        public static let magneticLayer: CGFloat = 10
        public static let magneticHoverArea: CGFloat = 49
        public static let scrollRotateDegreesPerPoint: Double = 0.5
    }

    /// Opacity used for "hidden" states (the reference never animates from exactly 0 for text).
    public static let hiddenOpacity = 0.001
}

// MARK: - Fade and slide reveal

public enum PlusRevealTrigger: Sendable {
    /// Plays once when the view first appears (hero, header).
    case appear
    /// Plays when the given fraction of the view is visible in its scroll view (iOS 18+).
    /// Falls back to `.appear` on older systems.
    case inView(threshold: Double = 0.5, once: Bool = true)
}

struct PlusRevealModifier: ViewModifier {
    var x: CGFloat
    var y: CGFloat
    var scale: CGFloat
    var delay: Double
    var spring: PlusMotion.Spring
    var trigger: PlusRevealTrigger

    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var shown = false

    func body(content: Content) -> some View {
        let hidden = !shown && !reduceMotion
        let animated = content
            .opacity(hidden ? 0 : 1)
            .scaleEffect(hidden ? scale : 1)
            .offset(x: hidden ? x : 0, y: hidden ? y : 0)
        switch trigger {
        case .appear:
            animated.onAppear { show(true) }
        case let .inView(threshold, once):
            if #available(iOS 18, macOS 15, *) {
                animated.onScrollVisibilityChange(threshold: threshold) { visible in
                    if visible { show(true) } else if !once { show(false) }
                }
            } else {
                animated.onAppear { show(true) }
            }
        }
    }

    private func show(_ value: Bool) {
        guard shown != value else { return }
        withAnimation(spring.animation.delay(value ? delay : 0)) { shown = value }
    }
}

public extension View {
    /// Fade in while travelling from (x, y) and `scale` to rest. Defaults: 30 pt rise, appear spring.
    func plusReveal(
        x: CGFloat = 0,
        y: CGFloat = PlusMotion.Distance.revealY,
        scale: CGFloat = 1,
        delay: Double = 0,
        spring: PlusMotion.Spring = PlusMotion.appear,
        trigger: PlusRevealTrigger = .inView()
    ) -> some View {
        modifier(PlusRevealModifier(x: x, y: y, scale: scale, delay: delay, spring: spring, trigger: trigger))
    }

    /// Header drop-in: 80 pt from above on the 2 s nav spring.
    func plusNavDrop() -> some View {
        plusReveal(y: PlusMotion.Distance.navY, spring: PlusMotion.nav, trigger: .appear)
    }

    /// Eyebrow label: 10 pt rise that replays every time it re-enters view.
    func plusLabelReveal(delay: Double = 0.3) -> some View {
        plusReveal(y: PlusMotion.Distance.labelY, delay: delay, trigger: .inView(threshold: 0.5, once: false))
    }

    /// Closing call-to-action backdrop: scale 2.5 to 1 with fade on the 3 s zoom spring.
    func plusZoomIn() -> some View {
        plusReveal(y: 0, scale: PlusMotion.Distance.zoomFromScale, spring: PlusMotion.zoom, trigger: .inView(threshold: 0))
    }
}

// MARK: - Per-character blur reveal

/// Headline whose characters blur in one after another: blur 10 to 0, opacity, 10 pt rise.
public struct PlusCharReveal: View {
    let text: String
    let startDelay: Double
    let stagger: Double
    let spring: PlusMotion.Spring

    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var elapsed: Double = 0

    public init(_ text: String, startDelay: Double = 0, stagger: Double = PlusMotion.Stagger.headline, spring: PlusMotion.Spring = PlusMotion.text) {
        self.text = text
        self.startDelay = startDelay
        self.stagger = stagger
        self.spring = spring
    }

    private var total: Double { startDelay + Double(text.count) * stagger + spring.duration }

    public var body: some View {
        if reduceMotion {
            Text(text)
        } else if #available(iOS 18, macOS 15, *) {
            Text(text)
                .textRenderer(CharRevealRenderer(elapsed: elapsed, startDelay: startDelay, stagger: stagger, spring: spring))
                .onAppear { withAnimation(.linear(duration: total)) { elapsed = total } }
        } else {
            Text(text).plusReveal(y: PlusMotion.Distance.charY, delay: startDelay, spring: spring, trigger: .appear)
        }
    }
}

@available(iOS 18, macOS 15, *)
struct CharRevealRenderer: TextRenderer, Animatable {
    var elapsed: Double
    let startDelay: Double
    let stagger: Double
    let spring: PlusMotion.Spring

    var animatableData: Double {
        get { elapsed }
        set { elapsed = newValue }
    }

    func draw(layout: Text.Layout, in context: inout GraphicsContext) {
        var index = 0
        for line in layout {
            for run in line {
                for glyph in run {
                    let local = elapsed - startDelay - Double(index) * stagger
                    let p = min(max(spring.progress(at: local), 0), 1.2)
                    var ctx = context
                    ctx.opacity = max(PlusMotion.hiddenOpacity, min(1, p))
                    let blur = PlusMotion.Distance.charBlur * max(0, 1 - p)
                    if blur > 0.05 { ctx.addFilter(.blur(radius: blur)) }
                    ctx.translateBy(x: 0, y: PlusMotion.Distance.charY * (1 - p))
                    ctx.draw(glyph)
                    index += 1
                }
            }
        }
    }
}

// MARK: - Rolling label button

/// Button whose label rolls up on pointer hover or press: the row slides 110 %, characters fade
/// and travel 10 pt with a 30 ms stagger, and the button scales to 0.98.
public struct PlusRollButton: View {
    let title: String
    let action: () -> Void
    var background: Color
    var foreground: Color

    public init(
        _ title: String,
        background: Color = Color(red: 0.067, green: 0.067, blue: 0.075),
        foreground: Color = Color(red: 0.929, green: 0.933, blue: 0.941),
        action: @escaping () -> Void
    ) {
        self.title = title
        self.background = background
        self.foreground = foreground
        self.action = action
    }

    public var body: some View {
        Button(action: action) { Text(title) }
            .buttonStyle(Style(title: title, background: background, foreground: foreground))
    }

    private struct Style: ButtonStyle {
        let title: String
        let background: Color
        let foreground: Color
        func makeBody(configuration: Configuration) -> some View {
            StyledLabel(title: title, pressed: configuration.isPressed, background: background, foreground: foreground)
        }
    }

    private struct StyledLabel: View {
        let title: String
        let pressed: Bool
        let background: Color
        let foreground: Color
        @State private var hovering = false
        @Environment(\.accessibilityReduceMotion) private var reduceMotion

        var body: some View {
            let active = (hovering || pressed) && !reduceMotion
            PlusRollingText(title, active: active)
                .font(.system(size: 12.8, weight: .medium, design: .monospaced))
                .foregroundStyle(foreground)
                .padding(.horizontal, 24)
                .padding(.vertical, 10)
                .background(background, in: RoundedRectangle(cornerRadius: 4))
                .scaleEffect(active ? PlusMotion.Distance.pressScale : 1)
                .animation(PlusMotion.press, value: active)
                .onHover { hovering = $0 }
        }
    }
}

/// Two stacked rows of characters that swap when `active` changes (the rolling label itself).
public struct PlusRollingText: View {
    let text: String
    let active: Bool

    public init(_ text: String, active: Bool) {
        self.text = text
        self.active = active
    }

    public var body: some View {
        let chars = Array(text)
        Text(text).hidden().overlay {
            GeometryReader { geo in
                let h = geo.size.height * PlusMotion.Distance.rollRowFraction
                ZStack {
                    row(chars, incoming: false).offset(y: active ? -h : 0)
                    row(chars, incoming: true).offset(y: active ? 0 : h)
                }
                .frame(width: geo.size.width, height: geo.size.height)
                .animation(PlusMotion.rollRow, value: active)
            }
            .clipped()
        }
        .accessibilityLabel(text)
    }

    private func row(_ chars: [Character], incoming: Bool) -> some View {
        HStack(spacing: 0) {
            ForEach(Array(chars.enumerated()), id: \.offset) { i, c in
                let on = incoming ? active : !active
                Text(String(c))
                    .opacity(on ? 1 : 0)
                    .offset(y: on ? 0 : (incoming ? PlusMotion.Distance.rollCharY : -PlusMotion.Distance.rollCharY))
                    .animation(PlusMotion.rollChar.delay(Double(i) * PlusMotion.Stagger.roll), value: active)
            }
        }
    }
}

// MARK: - Magnetic hover

/// Follows the pointer (iPad trackpad, Mac) within the view plus a 49 pt margin, travelling up to
/// `distance` pt per unit of normalised offset on an overdamped spring. Static under touch, like the reference.
public struct PlusMagneticModifier: ViewModifier {
    var distance: CGFloat
    @State private var offset: CGSize = .zero
    @State private var size: CGSize = .zero
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    public func body(content: Content) -> some View {
        let area = PlusMotion.Distance.magneticHoverArea
        content
            .offset(offset)
            .padding(area)
            .contentShape(Rectangle())
            .onGeometryChange(for: CGSize.self) { $0.size } action: { size = $0 }
            .onContinuousHover { phase in
                guard !reduceMotion else { return }
                withAnimation(PlusMotion.magnetic.animation) {
                    if case let .active(p) = phase, size.width > 2 * area, size.height > 2 * area {
                        let halfW = size.width / 2 - area, halfH = size.height / 2 - area
                        offset = CGSize(width: (p.x - size.width / 2) / halfW * distance, height: (p.y - size.height / 2) / halfH * distance)
                    } else {
                        offset = .zero
                    }
                }
            }
            .padding(-area)
    }
}

public extension View {
    /// Magnetic pointer follow. Use `distance: PlusMotion.Distance.magneticLayer` extra on inner layers for depth.
    func plusMagnetic(distance: CGFloat = PlusMotion.Distance.magnetic) -> some View {
        modifier(PlusMagneticModifier(distance: distance))
    }

    /// Rotates 0.5 degrees per point scrolled, smoothed by the scroll-rotate spring (logo symbol).
    func plusScrollRotate(offset: CGFloat) -> some View {
        rotationEffect(.degrees(Double(offset) * PlusMotion.Distance.scrollRotateDegreesPerPoint))
            .animation(PlusMotion.scrollRotate.animation, value: offset)
    }
}

// MARK: - Preview

#Preview("Plus One motion") {
    ScrollView {
        VStack(spacing: 24) {
            PlusCharReveal("Alone tonight? Join a small group heading out to the best spots in your city")
                .font(.custom("Source Serif 4", size: 26))
                .multilineTextAlignment(.center)
            Text("Pick a city, see who is free tonight, and meet three to seven people at a public spot.")
                .font(.system(size: 14))
                .foregroundStyle(.secondary)
                .plusReveal(delay: PlusMotion.HeroDelay.lede, trigger: .appear)
            PlusRollButton("Find my group") {}
                .plusReveal(delay: PlusMotion.HeroDelay.action, trigger: .appear)
            RoundedRectangle(cornerRadius: 16)
                .fill(LinearGradient(colors: [Color(red: 0.51, green: 0.57, blue: 0.97), Color(red: 0.61, green: 0.56, blue: 1)], startPoint: .top, endPoint: .bottom))
                .frame(height: 440)
                .plusMagnetic()
                .plusReveal(y: PlusMotion.Distance.heroArtY, delay: PlusMotion.HeroDelay.art, trigger: .appear)
        }
        .padding(.top, 120)
        .padding(.horizontal, 16)
    }
}
