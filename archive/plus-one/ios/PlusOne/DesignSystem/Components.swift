import SwiftUI

// MARK: - Buttons

/// Full-width action. `.primary` is the night fill from the brand CTA, `.secondary` the quiet bordered surface.
/// Pressing scales to 0.98 on the spec's `press` curve; with a `rollTitle` the label rolls like the reference
/// buttons (motion-spec 9), otherwise the whole label row rolls on the same timing.
struct BrandButtonStyle: ButtonStyle {
    enum Kind { case primary, secondary, onDark }

    var kind: Kind = .primary
    var height: CGFloat = 54
    /// The plain title, for the per-character rolling label.
    var rollTitle: String?
    @Environment(\.isEnabled) private var isEnabled
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    func makeBody(configuration: Configuration) -> some View {
        let active = configuration.isPressed && !reduceMotion
        Group {
            if let rollTitle {
                PlusRollingText(rollTitle, active: active)
            } else {
                RowRoll(label: configuration.label, active: active)
            }
        }
        .type(.button)
        .lineLimit(1)
        .frame(maxWidth: .infinity, minHeight: height)
        .padding(.horizontal, Space.md)
        .foregroundStyle(foreground)
        .background(background, in: RoundedRectangle(cornerRadius: Radius.control, style: .continuous))
        .overlay {
            if kind == .secondary {
                RoundedRectangle(cornerRadius: Radius.control, style: .continuous)
                    .strokeBorder(Palette.line, lineWidth: Hairline.width)
            }
        }
        .contentShape(Rectangle())
        .scaleEffect(active ? PlusMotion.Distance.pressScale : 1)
        .animation(Motion.press, value: active)
        .animation(Motion.interaction, value: isEnabled)
    }

    private var foreground: Color {
        switch kind {
        case .primary: isEnabled ? Palette.canvas : Palette.mutedDecorative
        case .secondary: Palette.ink
        case .onDark: Palette.night
        }
    }

    private var background: Color {
        switch kind {
        case .primary: isEnabled ? Palette.night : Palette.hover
        case .secondary: Palette.surface
        case .onDark: Palette.nightInk
        }
    }
}

/// The rolling label for labels that are not plain text (spinners, icons): the row slides 110 % on `rollRow`.
private struct RowRoll<Label: View>: View {
    let label: Label
    let active: Bool

    var body: some View {
        label.hidden().overlay {
            GeometryReader { proxy in
                let travel = proxy.size.height * PlusMotion.Distance.rollRowFraction
                ZStack {
                    label.offset(y: active ? -travel : 0).opacity(active ? 0 : 1)
                    label.offset(y: active ? 0 : travel).opacity(active ? 1 : 0)
                }
                .frame(width: proxy.size.width, height: proxy.size.height)
                .animation(PlusMotion.rollRow, value: active)
            }
            .clipped()
        }
    }
}

extension ButtonStyle where Self == BrandButtonStyle {
    static var brandPrimary: BrandButtonStyle { BrandButtonStyle(kind: .primary) }
    static var brandSecondary: BrandButtonStyle { BrandButtonStyle(kind: .secondary) }
    static func brand(_ kind: BrandButtonStyle.Kind, height: CGFloat = 54) -> BrandButtonStyle {
        BrandButtonStyle(kind: kind, height: height)
    }
}

/// A brand button with a plain title, so its label rolls per character on press.
struct BrandButton: View {
    let title: String
    var kind: BrandButtonStyle.Kind = .primary
    var height: CGFloat = 54
    let action: () -> Void

    init(_ title: String, kind: BrandButtonStyle.Kind = .primary, height: CGFloat = 54, action: @escaping () -> Void) {
        self.title = title
        self.kind = kind
        self.height = height
        self.action = action
    }

    var body: some View {
        Button(title, action: action)
            .buttonStyle(BrandButtonStyle(kind: kind, height: height, rollTitle: title))
    }
}

/// Small bordered action used in top bars ("Share", city switcher).
struct QuietButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .type(.button, size: 13)
            .foregroundStyle(Palette.ink)
            .padding(.horizontal, Space.sm)
            .frame(minHeight: 36)
            .background(configuration.isPressed ? Palette.hover : Palette.surface,
                        in: RoundedRectangle(cornerRadius: Radius.control, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: Radius.control, style: .continuous)
                .strokeBorder(Palette.line, lineWidth: Hairline.width))
            .contentShape(Rectangle())
            .animation(Motion.interaction, value: configuration.isPressed)
    }
}

/// Presses scale slightly; used for tappable cards.
struct PressableStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .scaleEffect(configuration.isPressed ? PlusMotion.Distance.pressScale : 1)
            .animation(Motion.press, value: configuration.isPressed)
    }
}

// MARK: - Chips and tags

/// Filter chip (Resy-style): selected chips invert to night.
struct Chip: View {
    let title: String
    var count: Int?
    var systemImage: String?
    let isSelected: Bool
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: 6) {
                if let systemImage {
                    Image(systemName: systemImage).font(.system(size: 12, weight: .medium))
                }
                Text(title)
                if let count {
                    Text("\(count)")
                        .foregroundStyle(isSelected ? Palette.nightMuted : Palette.muted)
                }
            }
            .type(.button, size: 13)
            .foregroundStyle(isSelected ? Palette.canvas : Palette.ink)
            .padding(.horizontal, Space.sm)
            .frame(height: 36)
            .background(isSelected ? Palette.night : Palette.white,
                        in: RoundedRectangle(cornerRadius: Radius.control, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: Radius.control, style: .continuous)
                .strokeBorder(isSelected ? Palette.night : Palette.line, lineWidth: Hairline.width))
            .contentShape(Rectangle())
        }
        .buttonStyle(PressableStyle())
        .animation(Motion.interaction, value: isSelected)
        .accessibilityAddTraits(isSelected ? .isSelected : [])
    }
}

/// Mono metadata tag on a soft surface, e.g. "2 seats left".
struct Tag: View {
    let text: String
    var tone: Tone = .soft

    enum Tone { case soft, dark, outline }

    var body: some View {
        Text(text)
            .type(.label)
            .foregroundStyle(tone == .dark ? Palette.canvas : Palette.ink)
            .padding(.horizontal, 8)
            .padding(.vertical, 4)
            .background(background, in: RoundedRectangle(cornerRadius: Radius.control, style: .continuous))
            .overlay {
                if tone == .outline {
                    RoundedRectangle(cornerRadius: Radius.control, style: .continuous)
                        .strokeBorder(Palette.line, lineWidth: Hairline.width)
                }
            }
    }

    private var background: Color {
        switch tone {
        case .soft: Palette.hover
        case .dark: Palette.night
        case .outline: Palette.white
        }
    }
}

/// Small square icon badge with an inset (Thayon results card badge).
struct IconBadge: View {
    let systemImage: String
    var size: CGFloat = 40
    var inverted = false

    var body: some View {
        Image(systemName: systemImage)
            .font(.system(size: size * 0.38, weight: .regular))
            .foregroundStyle(inverted ? Palette.canvas : Palette.ink)
            .frame(width: size, height: size)
            .background(inverted ? Palette.nightSurface : Palette.white,
                        in: RoundedRectangle(cornerRadius: Radius.control, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: Radius.control, style: .continuous)
                .strokeBorder(inverted ? Palette.nightLine : Palette.line, lineWidth: Hairline.width))
    }
}

// MARK: - People

/// Initial-letter avatar. No photos: nobody browses private profiles (docs/plan.md, safety).
struct Avatar: View {
    let name: String
    var size: CGFloat = 26
    var ring: Color = Palette.white

    var body: some View {
        Text(String(name.prefix(1)).uppercased())
            .font(.custom("GeistMono-Medium", size: size * 0.42))
            .foregroundStyle(Palette.ink)
            .frame(width: size, height: size)
            .background(Self.fill(for: name), in: Circle())
            .overlay(Circle().strokeBorder(ring, lineWidth: max(1.5, size * 0.07)))
            .accessibilityHidden(true)
    }

    static func fill(for name: String) -> Color {
        let hash = name.unicodeScalars.reduce(0) { ($0 &* 31 &+ Int($1.value)) & 0xFFFF }
        return Palette.avatarFills[hash % Palette.avatarFills.count]
    }
}

/// Luma-style stack: first few initials overlapping, then "+N".
struct AvatarStack: View {
    let names: [String]
    let total: Int
    var size: CGFloat = 24
    var maxShown = 3

    var body: some View {
        HStack(spacing: -size * 0.3) {
            ForEach(Array(names.prefix(maxShown).enumerated()), id: \.offset) { _, name in
                Avatar(name: name, size: size)
            }
            if total > min(names.count, maxShown) {
                Text("+\(total - min(names.count, maxShown))")
                    .font(.custom("GeistMono-Medium", size: size * 0.4))
                    .foregroundStyle(Palette.muted)
                    .frame(width: size, height: size)
                    .background(Palette.white, in: Circle())
                    .overlay(Circle().strokeBorder(Palette.line, lineWidth: 1))
            }
        }
        .accessibilityElement()
        .accessibilityLabel("\(total) going")
    }
}

/// Seats as segments: filled for taken, open for free (web "Room for you" meter).
struct SeatMeter: View {
    let taken: Int
    let total: Int
    var highlightNext = false

    var body: some View {
        HStack(spacing: 4) {
            ForEach(0..<total, id: \.self) { index in
                Capsule()
                    .fill(index < taken ? Palette.night : (highlightNext && index == taken ? Palette.periwinkle : Palette.lineSoft))
                    .frame(height: 5)
            }
        }
        .accessibilityElement()
        .accessibilityLabel("\(taken) of \(total) seats taken")
    }
}

// MARK: - Live badge

/// Night pill with a softly pulsing live dot, e.g. "3 going · room for one more".
struct LiveBadge: View {
    let text: String
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        HStack(spacing: 8) {
            ZStack {
                if !reduceMotion {
                    Circle()
                        .fill(Palette.live.opacity(0.35))
                        .phaseAnimator([false, true]) { view, phase in
                            view.scaleEffect(phase ? 2.4 : 1).opacity(phase ? 0 : 0.9)
                        } animation: { phase in
                            phase ? .easeOut(duration: 1.4) : .linear(duration: 0.01)
                        }
                }
                Circle().fill(Palette.live)
            }
            .frame(width: 7, height: 7)
            Text(text)
                .type(.label, size: 12)
                .foregroundStyle(Palette.nightInk)
        }
        .padding(.horizontal, 10)
        .frame(height: 28)
        .background(Palette.night.opacity(0.82), in: RoundedRectangle(cornerRadius: Radius.control, style: .continuous))
    }
}

// MARK: - Progress

/// Thin onboarding progress bar (Cal AI).
struct ThinProgressBar: View {
    let progress: Double

    var body: some View {
        GeometryReader { proxy in
            ZStack(alignment: .leading) {
                Capsule().fill(Palette.lineSoft)
                Capsule()
                    .fill(Palette.night)
                    .frame(width: max(4, proxy.size.width * progress))
            }
        }
        .frame(height: 4)
        .animation(Motion.glide, value: progress)
        .accessibilityElement()
        .accessibilityLabel("Progress")
        .accessibilityValue("\(Int(progress * 100)) percent")
    }
}

// MARK: - Layout

/// Wrapping row layout for chips.
struct FlowLayout: Layout {
    var spacing: CGFloat = 8
    var rowSpacing: CGFloat = 8

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let width = proposal.width ?? .infinity
        var x: CGFloat = 0, y: CGFloat = 0, rowHeight: CGFloat = 0, maxX: CGFloat = 0
        for subview in subviews {
            let size = subview.sizeThatFits(.unspecified)
            if x > 0, x + size.width > width {
                x = 0
                y += rowHeight + rowSpacing
                rowHeight = 0
            }
            x += size.width + spacing
            maxX = max(maxX, x - spacing)
            rowHeight = max(rowHeight, size.height)
        }
        return CGSize(width: min(maxX, width), height: y + rowHeight)
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        var x = bounds.minX, y = bounds.minY, rowHeight: CGFloat = 0
        for subview in subviews {
            let size = subview.sizeThatFits(.unspecified)
            if x > bounds.minX, x + size.width > bounds.maxX {
                x = bounds.minX
                y += rowHeight + rowSpacing
                rowHeight = 0
            }
            subview.place(at: CGPoint(x: x, y: y), proposal: ProposedViewSize(size))
            x += size.width + spacing
            rowHeight = max(rowHeight, size.height)
        }
    }
}

/// 1 pt rule.
struct Rule: View {
    var color: Color = Palette.line

    var body: some View {
        Rectangle().fill(color).frame(height: Hairline.width)
    }
}

/// Mono eyebrow label, e.g. "DISCOVER".
struct Eyebrow: View {
    let text: String
    var color: Color = Palette.muted

    var body: some View {
        Text(text).type(.label).foregroundStyle(color)
            .plusLabelReveal()
    }
}
