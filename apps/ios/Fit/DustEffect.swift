import SwiftUI

/// Both passes share the same clock so the outgoing dust overlaps the incoming dust.
struct ScanReveal: Equatable {
    let startedAt: Date
    let reduceMotion: Bool
    let inkRegions: [CGRect]

    var duration: TimeInterval { reduceMotion ? 0.35 : 34 / 24 }
    static let margin: CGFloat = 48

    static func prepareShader() async {
        let shader = Pass.outgoing.shader(elapsed: 0, margin: margin, dark: false)
        try? await shader.compile(as: .layerEffect)
    }

    enum Pass {
        case outgoing
        case incoming

        var firstFrame: Double { self == .outgoing ? 0 : 12 }
        var lastFrame: Double { self == .outgoing ? 30 : 34 }
        var frontStart: Double { self == .outgoing ? 1 / 24 : 21 / 24 }
        var frontDuration: Double { 12 / 24 }
        var particleLifetime: Double { self == .outgoing ? 17 / 24 : 21 / 24 }

        func shader(elapsed: TimeInterval, margin: CGFloat, dark: Bool) -> Shader {
            ShaderLibrary.scanDust(
                .boundingRect, .float(Float(elapsed)), .float(Float(margin)),
                .float(Float(frontStart)), .float(Float(frontDuration)),
                .float(Float(particleLifetime)), .float(self == .incoming ? -1 : 1),
                .float(dark ? 1 : 0)
            )
        }
    }
}

private struct DustEffect: ViewModifier {
    let reveal: ScanReveal?
    let date: Date
    let pass: ScanReveal.Pass

    @Environment(\.colorScheme) private var colorScheme

    func body(content: Content) -> some View {
        let elapsed = reveal.map { date.timeIntervalSince($0.startedAt) }
        let frame = (elapsed ?? 0) * 24
        let active = reveal?.reduceMotion == false && frame < pass.lastFrame
            && (pass == .outgoing || frame > pass.firstFrame)
        let margin = active ? ScanReveal.margin : 0

        content
            .padding(margin)
            .layerEffect(
                pass.shader(elapsed: elapsed ?? 0, margin: margin, dark: colorScheme == .dark),
                maxSampleOffset: CGSize(width: margin, height: margin),
                isEnabled: active
            )
            .padding(-margin)
            .opacity(opacity(at: elapsed))
    }

    private func opacity(at elapsed: TimeInterval?) -> Double {
        guard let reveal, let elapsed else { return 1 }
        if reveal.reduceMotion {
            let progress = min(max(elapsed / reveal.duration, 0), 1)
            return pass == .outgoing ? 1 - progress : progress
        }
        let frame = elapsed * 24
        switch pass {
        case .outgoing: return frame < pass.lastFrame ? 1 : 0
        case .incoming: return min(max((frame - pass.firstFrame) / 5, 0), 1)
        }
    }
}

extension View {
    func scanDust(_ pass: ScanReveal.Pass, reveal: ScanReveal?, at date: Date) -> some View {
        modifier(DustEffect(reveal: reveal, date: date, pass: pass))
    }
}
