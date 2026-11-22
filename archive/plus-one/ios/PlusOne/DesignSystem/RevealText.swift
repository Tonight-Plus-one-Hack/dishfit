import SwiftUI

/// Brand headline with the spec's per-character blur reveal (motion-spec 2 and 8): blur 10 to 0, opacity, 10 pt rise.
/// Display styles use the `text` spring with a 25 ms stagger; smaller headings use `textQuick` with 15 ms.
/// Static under Reduce Motion (PlusCharReveal handles that).
struct RevealText: View {
    let text: String
    var style: TypeStyle = .title
    var size: CGFloat?
    var color: Color = Palette.ink
    var alignment: TextAlignment = .leading
    /// Delay before the first character starts.
    var delay: Double = 0

    private var isDisplay: Bool { style == .hero || style == .title }

    var body: some View {
        PlusCharReveal(text,
                       startDelay: delay,
                       stagger: isDisplay ? PlusMotion.Stagger.headline : PlusMotion.Stagger.label,
                       spring: isDisplay ? PlusMotion.text : PlusMotion.textQuick)
            .type(style, size: size)
            .foregroundStyle(color)
            .multilineTextAlignment(alignment)
            .fixedSize(horizontal: false, vertical: true)
            .accessibilityElement()
            .accessibilityLabel(text)
    }
}
