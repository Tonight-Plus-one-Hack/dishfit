import SwiftUI

/// The web app's tokens (apps/web/src/styles/tokens.css), with dark counterparts.
enum Palette {
    static let canvas = adaptive(light: 0xF5F5F8, dark: 0x0C0C0E)
    static let surface = adaptive(light: 0xFFFFFF, dark: 0x18191B)
    static let ink = adaptive(light: 0x1C2024, dark: 0xEDEEF0)
    static let muted = adaptive(light: 0x60646C, dark: 0xAFB3BA)
    static let rule = adaptive(light: 0xE8E8EC, dark: 0x2B2D31)
    static let track = adaptive(light: 0xEEEEF3, dark: 0x2A2C31)
    static let cta = adaptive(light: 0x111113, dark: 0xEDEEF0)
    static let ctaInk = adaptive(light: 0xFCFCFD, dark: 0x111113)
    static let accent = adaptive(light: 0x4B5FE0, dark: 0x8E9CFF)
    static let accentSoft = adaptive(light: 0xEEF0FE, dark: 0x23264A)
    static let accentSoftInk = adaptive(light: 0x3A3F9A, dark: 0xC5CBFF)
    static let scoreTop = adaptive(light: 0x1F7A45, dark: 0x5CC48A)
    static let protein = fixed(0xEF5B4C)
    static let carbs = fixed(0xF5A524)
    static let fat = fixed(0x3D9DF6)
    static let kcal = fixed(0xFF7A1F)
    static let brandStops = [fixed(0x355EDA), fixed(0x6F7CF0), fixed(0x9C90FE)]
    static let brand = LinearGradient(colors: brandStops, startPoint: .topLeading, endPoint: .bottomTrailing)
    static let artWash = LinearGradient(
        colors: [adaptive(light: 0xF3F3FE, dark: 0x1D1F38), adaptive(light: 0xDCDCFD, dark: 0x2B2E5A)],
        startPoint: .topLeading, endPoint: .bottomTrailing
    )

    private static func fixed(_ hex: UInt32) -> Color { Color(uiColor: uiColor(hex)) }

    private static func adaptive(light: UInt32, dark: UInt32) -> Color {
        Color(uiColor: UIColor { traits in
            uiColor(traits.userInterfaceStyle == .dark ? dark : light)
        })
    }

    private nonisolated static func uiColor(_ hex: UInt32) -> UIColor {
        UIColor(red: Double((hex >> 16) & 255) / 255, green: Double((hex >> 8) & 255) / 255,
                blue: Double(hex & 255) / 255, alpha: 1)
    }
}

/// Screen title block: a quiet eyebrow, a tight bold title, optional trailing control.
struct ScreenHeader<Trailing: View>: View {
    let eyebrow: String
    let title: String
    @ViewBuilder var trailing: Trailing

    var body: some View {
        HStack(alignment: .bottom, spacing: 12) {
            VStack(alignment: .leading, spacing: 4) {
                Text(eyebrow)
                    .font(.subheadline)
                    .foregroundStyle(Palette.muted)
                Text(title)
                    .font(.largeTitle.bold())
                    .tracking(-0.9)
                    .foregroundStyle(Palette.ink)
                    .accessibilityAddTraits(.isHeader)
            }
            Spacer(minLength: 0)
            trailing
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

extension ScreenHeader where Trailing == EmptyView {
    init(eyebrow: String, title: String) {
        self.init(eyebrow: eyebrow, title: title) { EmptyView() }
    }
}

struct SectionTitle: View {
    let title: String
    var detail: String?

    var body: some View {
        HStack(alignment: .firstTextBaseline) {
            Text(title)
                .font(.title3.bold())
                .tracking(-0.4)
                .foregroundStyle(Palette.ink)
                .accessibilityAddTraits(.isHeader)
            Spacer(minLength: 8)
            if let detail {
                Text(detail)
                    .font(.footnote)
                    .foregroundStyle(Palette.muted)
            }
        }
    }
}

/// Black pill, the web's `--cta`.
struct PrimaryButtonStyle: ButtonStyle {
    @Environment(\.isEnabled) private var isEnabled

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.body.weight(.semibold))
            .foregroundStyle(Palette.ctaInk)
            .frame(maxWidth: .infinity, minHeight: 54)
            .padding(.horizontal, 16)
            .background(Palette.cta.opacity(isEnabled ? 1 : 0.35), in: .capsule)
            .scaleEffect(configuration.isPressed ? 0.97 : 1)
            .animation(.spring(duration: 0.25, bounce: 0), value: configuration.isPressed)
    }
}

/// White pill with a hairline, for the second choice next to a primary action.
struct SecondaryButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.subheadline.weight(.semibold))
            .foregroundStyle(Palette.ink)
            .frame(maxWidth: .infinity, minHeight: 48)
            .padding(.horizontal, 14)
            .background(Palette.surface, in: .capsule)
            .overlay(Capsule().strokeBorder(Palette.rule))
            .scaleEffect(configuration.isPressed ? 0.97 : 1)
            .animation(.spring(duration: 0.25, bounce: 0), value: configuration.isPressed)
    }
}

/// Cards and rows shrink a touch under the finger instead of flashing.
struct PressableStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .scaleEffect(configuration.isPressed ? 0.98 : 1)
            .animation(.spring(duration: 0.25, bounce: 0), value: configuration.isPressed)
    }
}

private struct FitCard: ViewModifier {
    let radius: CGFloat
    @Environment(\.colorScheme) private var scheme

    func body(content: Content) -> some View {
        content
            .background(Palette.surface, in: .rect(cornerRadius: radius))
            .overlay {
                if scheme == .dark {
                    RoundedRectangle(cornerRadius: radius).strokeBorder(Palette.rule).allowsHitTesting(false)
                }
            }
            .shadow(color: Color(red: 20 / 255, green: 22 / 255, blue: 60 / 255).opacity(scheme == .dark ? 0 : 0.04),
                    radius: 1, y: 1)
            .shadow(color: Color(red: 20 / 255, green: 22 / 255, blue: 60 / 255).opacity(scheme == .dark ? 0 : 0.06),
                    radius: 10, y: 6)
    }
}

extension View {
    /// The web's `--soft-card`: white, 22 pt corners, a two-layer soft shadow.
    func fitCard(radius: CGFloat = 22) -> some View {
        modifier(FitCard(radius: radius))
    }

    /// Shared page frame: one readable column, 16 pt gutters like the web.
    func page() -> some View {
        frame(maxWidth: 560)
            .padding(.horizontal, 16)
            .frame(maxWidth: .infinity)
    }
}

/// Clay-3D art from the web's icon set A.
enum FoodArt: String {
    case bowl = "ClayCatBowl"
    case salad = "ClayCatSalad"
    case vegan = "ClayCatVegan"
    case asian = "ClayCatAsian"
    case burger = "ClayCatBurger"
    case pizza = "ClayCatPizza"
    case cafe = "ClayCatCafe"
    case bakery = "ClayCatBakery"

    init(category: String?, name: String) {
        let words = "\(category ?? "") \(name)".lowercased()
        func has(_ needles: String...) -> Bool { needles.contains { words.contains($0) } }
        self = if has("salat", "salad", "insalata") {
            .salad
        } else if has("pizza", "flammkuchen") {
            .pizza
        } else if has("burger", "sandwich", "wrap") {
            .burger
        } else if has("tofu", "linse", "vegan", "falafel", "hummus", "curry") {
            .vegan
        } else if has("sushi", "poke", "ramen", "udon", "miso", "pho", "bibimbap", "don", "thai", "wok") {
            .asian
        } else if has("kaffee", "coffee", "latte", "smoothie") {
            .cafe
        } else if has("brot", "croissant", "kuchen", "bagel") {
            .bakery
        } else {
            .bowl
        }
    }
}

/// The web dish card's artwork tile: soft lilac wash, a faint dot grid, clay art on top.
struct ArtTile: View {
    let art: FoodArt
    var inset: CGFloat = 0.14

    var body: some View {
        GeometryReader { proxy in
            let side = min(proxy.size.width, proxy.size.height)
            ZStack {
                Palette.artWash
                DotGrid().opacity(0.55)
                Image(art.rawValue)
                    .resizable()
                    .scaledToFit()
                    .padding(side * inset)
                    .shadow(color: .black.opacity(0.10), radius: side * 0.04, y: side * 0.03)
            }
            .frame(width: proxy.size.width, height: proxy.size.height)
        }
        .accessibilityHidden(true)
    }
}

private struct DotGrid: View {
    var body: some View {
        Canvas { context, size in
            let gap: CGFloat = 9
            var dots = Path()
            var y = gap / 2
            while y < size.height {
                var x = gap / 2
                while x < size.width {
                    dots.addEllipse(in: CGRect(x: x - 0.6, y: y - 0.6, width: 1.2, height: 1.2))
                    x += gap
                }
                y += gap
            }
            context.fill(dots, with: .color(Palette.accent.opacity(0.22)))
        }
    }
}

struct ProgressRing: View {
    let progress: Double
    let color: Color
    var lineWidth: CGFloat = 8

    var body: some View {
        ZStack {
            Circle().stroke(Palette.track, lineWidth: lineWidth)
            Circle()
                .trim(from: 0, to: min(1, max(0, progress)))
                .stroke(color, style: StrokeStyle(lineWidth: lineWidth, lineCap: .round))
                .rotationEffect(.degrees(-90))
                .opacity(progress > 0 ? 1 : 0)
        }
        .padding(lineWidth / 2)
        .accessibilityHidden(true)
    }
}

enum Macro: CaseIterable {
    case protein, carbs, fat

    var title: String {
        switch self {
        case .protein: "Protein"
        case .carbs: "Kohlenhydrate"
        case .fat: "Fett"
        }
    }

    var short: String {
        switch self {
        case .protein: "P"
        case .carbs: "K"
        case .fat: "F"
        }
    }

    var color: Color {
        switch self {
        case .protein: Palette.protein
        case .carbs: Palette.carbs
        case .fat: Palette.fat
        }
    }

    var icon: String {
        switch self {
        case .protein: "MacroProtein"
        case .carbs: "MacroCarbs"
        case .fat: "MacroFat"
        }
    }

    func grams(_ macros: Macros) -> Double {
        switch self {
        case .protein: macros.protein
        case .carbs: macros.carbs
        case .fat: macros.fat
        }
    }

    var kcalPerGram: Double { self == .fat ? 9 : 4 }
}

/// Three Cal-AI-style tiles: grams, target, a ring with the macro's icon in the middle.
struct MacroRingTiles: View {
    let macros: Macros
    /// Daily targets. Without them the ring shows each macro's share of the dish's energy.
    let targets: Macros?

    var body: some View {
        HStack(spacing: 10) {
            ForEach(Macro.allCases, id: \.self) { macro in
                tile(macro)
            }
        }
    }

    private func tile(_ macro: Macro) -> some View {
        let grams = macro.grams(macros)
        let energy = Macro.allCases.reduce(0) { $0 + $1.grams(macros) * $1.kcalPerGram }
        let progress = targets.map { grams / max(macro.grams($0), 1) } ?? grams * macro.kcalPerGram / max(energy, 1)
        return VStack(alignment: .leading, spacing: 2) {
            HStack(alignment: .firstTextBaseline, spacing: 2) {
                Text(grams.fitNumber)
                    .font(.title2.bold().monospacedDigit())
                    .contentTransition(.numericText(value: grams))
                Text("g").font(.footnote.weight(.semibold))
            }
            .foregroundStyle(Palette.ink)
            Text(targets.map { "von \(macro.grams($0).fitNumber) g" } ?? "\((progress * 100).fitNumber) % der kcal")
                .font(.caption)
                .foregroundStyle(Palette.muted)
                .lineLimit(1)
                .minimumScaleFactor(0.8)
            Text(macro.title)
                .font(.caption.weight(.semibold))
                .foregroundStyle(Palette.ink)
                .lineLimit(1)
                .minimumScaleFactor(0.7)
                .padding(.top, 6)
            ZStack {
                ProgressRing(progress: progress, color: macro.color, lineWidth: 7)
                Image(macro.icon)
                    .resizable()
                    .scaledToFit()
                    .frame(width: 20, height: 20)
            }
            .frame(width: 64, height: 64)
            .frame(maxWidth: .infinity)
            .padding(.top, 12)
        }
        .padding(12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .fitCard(radius: 20)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(macro.title)
        .accessibilityValue(targets.map { "\(grams.fitNumber) von \(macro.grams($0).fitNumber) Gramm" } ?? "\(grams.fitNumber) Gramm")
    }
}

/// A small inline macro row: colored dot, grams, letter.
struct MacroInline: View {
    let macros: Macros

    var body: some View {
        HStack(spacing: 10) {
            ForEach(Macro.allCases, id: \.self) { macro in
                HStack(spacing: 4) {
                    Circle().fill(macro.color).frame(width: 6, height: 6)
                    Text("\(macro.grams(macros).fitNumber) g")
                        .foregroundStyle(Palette.ink)
                    Text(macro.short).foregroundStyle(Palette.muted)
                }
            }
        }
        .font(.caption.weight(.medium).monospacedDigit())
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(Macro.allCases.map { "\(Int($0.grams(macros).rounded())) Gramm \($0.title)" }.joined(separator: ", "))
    }
}

/// The web's score ring: green arc around the health score.
struct ScoreBadge: View {
    let score: Double
    var size: CGFloat = 38

    var body: some View {
        ZStack {
            Circle().fill(Palette.surface)
            ProgressRing(progress: score / 100, color: Palette.scoreTop, lineWidth: size * 0.09)
            Text(score.fitNumber)
                .font(.system(size: size * 0.34, weight: .bold).monospacedDigit())
                .foregroundStyle(Palette.ink)
        }
        .frame(width: size, height: size)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Health Score \(score.fitNumber) von 100")
    }
}
