import SwiftUI

/// The Plus One symbol drawn natively from brand/source/mark.svg (viewBox 32 x 32): three seats and a fourth arriving.
/// Each piece is its own shape so screens can animate the group assembling.
nonisolated struct BrandMarkPiece: Shape {
    enum Piece: Int, CaseIterable { case top, left, bottom, arriving }

    let piece: Piece

    func path(in rect: CGRect) -> Path {
        let scale = min(rect.width, rect.height) / 32
        let origin = CGPoint(x: rect.midX - 16 * scale, y: rect.midY - 16 * scale)
        func pt(_ x: CGFloat, _ y: CGFloat) -> CGPoint { CGPoint(x: origin.x + x * scale, y: origin.y + y * scale) }

        var path = Path()
        switch piece {
        case .top:
            path.move(to: pt(11.10, 6.20))
            path.addLine(to: pt(16.00, 2.40))
            path.addCurve(to: pt(20.90, 2.40), control1: pt(17.50, 1.20), control2: pt(19.40, 1.30))
            path.addLine(to: pt(24.70, 5.40))
            path.addCurve(to: pt(24.80, 10.90), control1: pt(26.80, 7.10), control2: pt(26.80, 9.10))
            path.addCurve(to: pt(11.60, 11.70), control1: pt(20.80, 14.50), control2: pt(16.00, 14.80))
            path.addCurve(to: pt(11.10, 6.20), control1: pt(9.10, 9.90), control2: pt(8.90, 8.00))
        case .left:
            path.move(to: pt(5.10, 12.60))
            path.addCurve(to: pt(9.80, 12.10), control1: pt(6.50, 10.80), control2: pt(8.20, 10.60))
            path.addCurve(to: pt(10.40, 24.40), control1: pt(13.80, 15.90), control2: pt(14.10, 20.20))
            path.addCurve(to: pt(5.10, 24.50), control1: pt(8.70, 26.40), control2: pt(6.80, 26.50))
            path.addLine(to: pt(2.90, 21.60))
            path.addCurve(to: pt(3.00, 14.60), control1: pt(1.10, 19.30), control2: pt(1.30, 16.90))
            path.addLine(to: pt(5.10, 12.60))
        case .bottom:
            path.move(to: pt(12.00, 24.40))
            path.addCurve(to: pt(23.30, 20.20), control1: pt(14.40, 21.40), control2: pt(18.50, 19.70))
            path.addCurve(to: pt(24.70, 19.10), control1: pt(24.30, 20.30), control2: pt(24.70, 20.00))
            path.addCurve(to: pt(25.80, 18.60), control1: pt(24.70, 18.40), control2: pt(25.30, 18.20))
            path.addLine(to: pt(28.00, 20.60))
            path.addCurve(to: pt(27.80, 26.60), control1: pt(30.00, 22.50), control2: pt(29.90, 24.60))
            path.addLine(to: pt(23.20, 29.70))
            path.addCurve(to: pt(12.70, 28.90), control1: pt(19.30, 31.90), control2: pt(16.10, 31.20))
            path.addCurve(to: pt(12.00, 24.40), control1: pt(10.90, 27.70), control2: pt(10.60, 26.20))
        case .arriving:
            path.addEllipse(in: CGRect(origin: pt(28.4 - 2.8, 14 - 2.8), size: CGSize(width: 5.6 * scale, height: 5.6 * scale)))
        }
        path.closeSubpath()
        return path
    }
}

/// The full symbol, optionally assembling: the three seats settle in, then the fourth arrives with a bounce.
struct BrandMark: View {
    var color: Color = Palette.ink
    var assembled = true

    var body: some View {
        ZStack {
            ForEach(BrandMarkPiece.Piece.allCases, id: \.rawValue) { piece in
                BrandMarkPiece(piece: piece)
                    .fill(color)
                    .scaleEffect(assembled ? 1 : (piece == .arriving ? 0.2 : 0.7))
                    .offset(assembled ? .zero : Self.scatter(piece))
                    .opacity(assembled ? 1 : 0)
                    .animation(
                        piece == .arriving ? Motion.pop.delay(0.32) : Motion.step.delay(Double(piece.rawValue) * 0.06),
                        value: assembled
                    )
            }
        }
        .aspectRatio(1, contentMode: .fit)
        .accessibilityElement()
        .accessibilityLabel("Plus One")
    }

    private static func scatter(_ piece: BrandMarkPiece.Piece) -> CGSize {
        switch piece {
        case .top: CGSize(width: 0, height: -14)
        case .left: CGSize(width: -14, height: 0)
        case .bottom: CGSize(width: 0, height: 14)
        case .arriving: CGSize(width: 22, height: -6)
        }
    }
}

/// Symbol plus wordmark, from the asset catalog (vector).
struct Wordmark: View {
    var light = false
    var height: CGFloat = 24

    var body: some View {
        Image(light ? "LogoLight" : "LogoPrimary")
            .resizable()
            .scaledToFit()
            .frame(height: height)
            .accessibilityLabel("Plus One")
    }
}
