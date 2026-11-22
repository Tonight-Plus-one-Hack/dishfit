import SwiftUI

// Brand tokens from docs/design/tokens.json and brand/theme.css. Keep names in step with the CSS variables.

extension Color {
    init(hex: UInt32, opacity: Double = 1) {
        self.init(
            .sRGB,
            red: Double((hex >> 16) & 0xFF) / 255,
            green: Double((hex >> 8) & 0xFF) / 255,
            blue: Double(hex & 0xFF) / 255,
            opacity: opacity
        )
    }
}

enum Palette {
    static let canvas = Color(hex: 0xFCFCFD)
    static let white = Color(hex: 0xFFFFFF)
    static let surface = Color(hex: 0xF9F9FB)
    static let hover = Color(hex: 0xF0F0F3)
    static let ink = Color(hex: 0x1C2024)
    static let muted = Color(hex: 0x60646C)
    static let mutedDecorative = Color(hex: 0x8B8D98)
    static let line = Color(hex: 0xD9D9E0)
    static let lineSoft = Color(hex: 0xE8E8EC)
    static let night = Color(hex: 0x111113)
    static let nightSurface = Color(hex: 0x18191B)
    static let nightLine = Color(hex: 0x363A3F)
    static let nightMuted = Color(hex: 0xAFB3BA)
    static let nightInk = Color(hex: 0xEDEEF0)
    /// Artwork colors. Saturated blue-violet stays in imagery and small accents only.
    static let cobalt = Color(hex: 0x355EDA)
    static let periwinkle = Color(hex: 0x8391F7)
    static let violet = Color(hex: 0x9C90FE)
    /// The "live" dot on the landing badge (apps/web landing.css).
    static let live = Color(hex: 0x8FE3B0)
    /// Soft avatar fills, derived from the art palette at low saturation.
    static let avatarFills: [Color] = [
        Color(hex: 0xE4E7FD), Color(hex: 0xECE8FF), Color(hex: 0xE2EAF9), Color(hex: 0xEFEFF3), Color(hex: 0xE6E3FA),
    ]
}

enum Space {
    static let xxs: CGFloat = 4
    static let xs: CGFloat = 8
    static let sm: CGFloat = 12
    static let md: CGFloat = 16
    static let lg: CGFloat = 20
    static let xl: CGFloat = 24
    static let xxl: CGFloat = 32
    static let xxxl: CGFloat = 40
    static let huge: CGFloat = 48
    /// Horizontal page inset (tokens.layout.sectionInline.mobile).
    static let page: CGFloat = 16
}

enum Radius {
    static let control: CGFloat = 4
    static let card: CGFloat = 8
    static let media: CGFloat = 16
    static let pill: CGFloat = 48
}

enum Hairline {
    static let width: CGFloat = 1
}

// MARK: - Type

/// The brand type scale for a phone: Source Serif 4 for display, Geist for UI text, Geist Mono for labels and actions.
/// Sizes follow tokens.json (mobile sizes, nudged up where iOS reading distance needs it); tracking is in em.
enum TypeStyle {
    case hero, title, section, feature, cardTitle, lede, body, small, label, button, time, stat

    var fontName: String {
        switch self {
        case .hero, .title, .section: "SourceSerif4-Regular"
        case .feature: "SourceSerif4-Medium"
        case .cardTitle: "Geist-Medium"
        case .lede, .body, .small: "Geist-Regular"
        case .stat: "Geist-Medium"
        case .label, .button, .time: "GeistMono-Medium"
        }
    }

    var size: CGFloat {
        switch self {
        case .hero: 44
        case .title: 30
        case .section: 24
        case .feature: 20
        case .cardTitle: 17
        case .lede: 16
        case .body: 15
        case .small: 13
        case .label: 12
        case .button: 14
        case .time: 14
        case .stat: 24
        }
    }

    var tracking: CGFloat {
        switch self {
        case .hero, .title, .section, .feature: -0.04
        case .cardTitle, .lede: -0.02
        case .body, .small: -0.02
        case .label: -0.02
        case .button: -0.01
        case .time: -0.02
        case .stat: -0.04
        }
    }

    var lineHeight: CGFloat {
        switch self {
        case .hero, .title, .section: 1.1
        case .feature: 1.3
        default: 1.45
        }
    }

    var relativeTo: Font.TextStyle {
        switch self {
        case .hero: .largeTitle
        case .title: .title
        case .section: .title2
        case .feature: .title3
        case .cardTitle: .headline
        case .lede: .body
        case .body: .subheadline
        case .small: .footnote
        case .label, .time: .caption
        case .button: .callout
        case .stat: .title2
        }
    }
}

extension Font {
    static func brand(_ style: TypeStyle, size: CGFloat? = nil) -> Font {
        .custom(style.fontName, size: size ?? style.size, relativeTo: style.relativeTo)
    }
}

private struct TypeModifier: ViewModifier {
    let style: TypeStyle
    let size: CGFloat?

    func body(content: Content) -> some View {
        let points = size ?? style.size
        content
            .font(.brand(style, size: size))
            .tracking(style.tracking * points)
            .lineSpacing(max(0, (style.lineHeight - 1.2) * points))
    }
}

extension View {
    /// Applies a brand text style: face, size (Dynamic Type aware), tracking and leading.
    func type(_ style: TypeStyle, size: CGFloat? = nil) -> some View {
        modifier(TypeModifier(style: style, size: size))
    }
}

// MARK: - Surfaces

extension View {
    /// A bordered card: white fill, 1 pt rule, 8 pt corners, no shadow (Thayon surfaces).
    func cardSurface(fill: Color = Palette.white, radius: CGFloat = Radius.card, stroke: Color = Palette.line) -> some View {
        background(fill, in: RoundedRectangle(cornerRadius: radius, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: radius, style: .continuous)
                    .strokeBorder(stroke, lineWidth: Hairline.width)
            )
    }
}
