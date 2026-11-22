import SwiftUI

/// Goal bubbles (Cal AI goals, Tolan playfulness): four floating moods that pop in, drift, and bounce when tapped.
/// Each mood is a contract vibe, so the answer maps straight onto Hangout.vibe and Spot.vibes.
struct MoodStep: View {
    @Bindable var model: OnboardingModel

    var body: some View {
        QuestionScaffold(title: "What are you in the mood for?",
                         subtitle: "Pick as many as you like. We use this to find your group.") {
            MoodBubbles(selected: model.draft.vibes) { vibe in model.toggle(vibe) }
                .frame(height: 340)
                .frame(maxWidth: .infinity)
        } footer: {
            ContinueButton(model: model)
        }
    }
}

struct MoodBubbles: View {
    let selected: [Vibe]
    let toggle: (Vibe) -> Void

    @State private var appeared = false
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    /// Organic cluster around the centre: (vibe, diameter, x, y, drift phase).
    private let layout: [(vibe: Vibe, size: CGFloat, x: CGFloat, y: CGFloat, phase: Double)] = [
        (.chill, 152, -78, -84, 0.0),
        (.bar, 136, 84, -58, 1.7),
        (.club, 140, -70, 86, 3.1),
        (.culture, 128, 88, 96, 4.4),
    ]

    var body: some View {
        TimelineView(.animation(minimumInterval: 1 / 60, paused: reduceMotion)) { context in
            let time = context.date.timeIntervalSinceReferenceDate
            ZStack {
                ForEach(Array(layout.enumerated()), id: \.element.vibe) { index, item in
                    MoodBubble(vibe: item.vibe, size: item.size, isSelected: selected.contains(item.vibe)) {
                        toggle(item.vibe)
                    }
                    .offset(x: item.x, y: item.y)
                    .offset(x: reduceMotion ? 0 : cos(time * 0.7 + item.phase) * 3,
                            y: reduceMotion ? 0 : sin(time * 0.9 + item.phase) * 6)
                    .scaleEffect(appeared ? 1 : 0.3)
                    .opacity(appeared ? 1 : 0)
                    .animation(Motion.pop.delay(0.15 + Double(index) * 0.08), value: appeared)
                }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
        }
        .onAppear { appeared = true }
    }
}

private struct MoodBubble: View {
    let vibe: Vibe
    let size: CGFloat
    let isSelected: Bool
    let action: () -> Void

    @State private var taps = 0

    var body: some View {
        Button {
            taps += 1
            withAnimation(Motion.pop) { action() }
        } label: {
            VStack(spacing: 6) {
                Image(systemName: vibe.symbol)
                    .font(.system(size: size * 0.15, weight: .regular))
                    .symbolEffect(.bounce, value: taps)
                Text(vibe.label)
                    .type(.cardTitle, size: size > 140 ? 17 : 16)
                    .multilineTextAlignment(.center)
                Text(vibe.blurb)
                    .type(.label, size: 11)
                    .foregroundStyle(isSelected ? Palette.nightMuted : Palette.muted)
                    .multilineTextAlignment(.center)
                    .frame(maxWidth: size * 0.72)
            }
            .foregroundStyle(isSelected ? Palette.canvas : Palette.ink)
            .frame(width: size, height: size)
            .background {
                Circle()
                    .fill(isSelected ? AnyShapeStyle(Palette.night) : AnyShapeStyle(
                        RadialGradient(colors: [Palette.white, Avatar.fill(for: vibe.rawValue)], center: .topLeading,
                                       startRadius: 0, endRadius: size)
                    ))
            }
            .overlay(Circle().strokeBorder(isSelected ? Palette.night : Palette.line, lineWidth: Hairline.width))
            .overlay(alignment: .topTrailing) {
                if isSelected {
                    Image(systemName: "checkmark")
                        .font(.system(size: 11, weight: .bold))
                        .foregroundStyle(Palette.night)
                        .frame(width: 24, height: 24)
                        .background(Palette.periwinkle, in: Circle())
                        .overlay(Circle().strokeBorder(Palette.canvas, lineWidth: 2))
                        .offset(x: -size * 0.08, y: size * 0.08)
                        .transition(.scale.combined(with: .opacity))
                }
            }
            .contentShape(Circle())
            .keyframeAnimator(initialValue: 1.0, trigger: taps) { content, scale in
                content.scaleEffect(scale)
            } keyframes: { _ in
                SpringKeyframe(0.9, duration: 0.09)
                SpringKeyframe(1.07, duration: 0.22, spring: .bouncy)
                SpringKeyframe(1.0, duration: 0.3)
            }
        }
        .buttonStyle(.plain)
        .sensoryFeedback(.impact(weight: .medium), trigger: taps)
        .accessibilityLabel(vibe.label)
        .accessibilityHint(vibe.blurb)
        .accessibilityAddTraits(isSelected ? .isSelected : [])
        .accessibilityIdentifier("mood.\(vibe.rawValue)")
    }
}
