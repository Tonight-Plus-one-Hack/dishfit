import SwiftUI

// MARK: - Matching

/// "Building your plan" moment (Cal AI): a counting percentage, the symbol assembling, and checklist lines that
/// name the person's own answers. It waits for the real data, never less than `Motion.matchingDuration`.
struct MatchingStep: View {
    let model: OnboardingModel
    @State private var percent = 0
    @State private var assembled = false

    private var lines: [String] {
        let city = model.selectedCity?.city.displayName ?? "your city"
        let count = model.selectedCity?.openHangouts ?? 0
        let moods = model.draft.vibes.map(\.label).joined(separator: ", ")
        let languages = model.draft.languages.map(\.label).joined(separator: " or ")
        return [
            "Looking at \(Pluralize.hangouts(count)) in \(city) tonight",
            "Matching your mood: \(moods)",
            "Groups in \(languages)",
            model.draft.availableFrom == .now ? "Starting soon" : "Starting \(model.draft.availableFrom.title.lowercased())",
        ]
    }

    var body: some View {
        VStack(spacing: 0) {
            Spacer(minLength: Space.xxl)
            BrandMark(color: Palette.ink, assembled: assembled)
                .frame(width: 72, height: 72)
                .phaseAnimator([0.0, 1.0]) { view, phase in
                    view.rotationEffect(.degrees(phase * 8 - 4))
                } animation: { _ in .easeInOut(duration: 1.2) }
                .padding(.bottom, Space.xl)

            Text("\(percent)%")
                .type(.hero, size: 64)
                .monospacedDigit()
                .contentTransition(.numericText(value: Double(percent)))
                .foregroundStyle(Palette.ink)
            RevealText(text: "Finding your group", style: .section, alignment: .center)
                .padding(.top, Space.xs)

            ThinProgressBar(progress: Double(percent) / 100)
                .padding(.horizontal, Space.xxxl)
                .padding(.top, Space.xl)

            VStack(alignment: .leading, spacing: Space.md) {
                ForEach(Array(lines.enumerated()), id: \.offset) { index, line in
                    let done = percent >= (index + 1) * 24
                    HStack(spacing: Space.sm) {
                        Image(systemName: done ? "checkmark.circle.fill" : "circle.dotted")
                            .font(.system(size: 18))
                            .foregroundStyle(done ? Palette.ink : Palette.line)
                            .contentTransition(.symbolEffect(.replace))
                        Text(line)
                            .type(.body)
                            .foregroundStyle(done ? Palette.ink : Palette.muted)
                    }
                    .opacity(percent >= index * 24 ? 1 : 0)
                    .offset(y: percent >= index * 24 ? 0 : 8)
                    .animation(Motion.reveal, value: percent >= index * 24)
                    .animation(Motion.pop, value: done)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.horizontal, Space.xxxl)
            .padding(.top, Space.xxl)
            Spacer()
        }
        .sensoryFeedback(.success, trigger: percent == 100) { _, done in done }
        .task { await run() }
    }

    private func run() async {
        assembled = true
        let start = Date()
        let duration = Motion.matchingDuration
        while percent < 100 {
            try? await Task.sleep(for: .milliseconds(28))
            let elapsed = Date().timeIntervalSince(start)
            // Ease out towards 100, but hold at 96 until the data is in.
            var target = Int((1 - pow(1 - min(1, elapsed / duration), 2.2)) * 100)
            if model.tonight == nil && model.loadError == nil { target = min(target, 96) }
            if target != percent {
                withAnimation(.linear(duration: 0.08)) { percent = target }
            }
        }
        try? await Task.sleep(for: .milliseconds(450))
        model.move(to: .result)
    }
}

// MARK: - Result

/// The aha moment: "Your hangout tonight", one card with the reasons it fits.
struct ResultStep: View {
    let model: OnboardingModel
    @Environment(AppModel.self) private var app
    @State private var joining = false
    @State private var error: String?

    var body: some View {
        VStack(spacing: 0) {
            ScrollView {
                VStack(alignment: .leading, spacing: Space.md) {
                    VStack(alignment: .leading, spacing: Space.xs) {
                        Eyebrow(text: model.bestMatch == nil ? "Nothing open for you yet" : "Picked from your answers")
                        RevealText(text: "Your hangout tonight", style: .title)
                    }
                    .padding(.top, Space.xl)
                    .padding(.bottom, Space.xs)

                    if let match = model.bestMatch, let tonight = model.tonight {
                        ResultCard(match: match, clock: TonightClock(timeZone: tonight.city.timeZone, now: model.now()))
                    } else if let spot = Matcher.suggestedSpot(from: model.spots, for: model.draft) {
                        StartFirstCard(spot: spot)
                    } else if let error = model.loadError {
                        Text(error).type(.body).foregroundStyle(Palette.muted)
                    }
                    if let error {
                        Text(error).type(.body).foregroundStyle(Palette.ink)
                            .padding(Space.sm)
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .cardSurface(fill: Palette.surface)
                    }
                }
                .padding(.horizontal, Space.page + 4)
                .padding(.bottom, Space.xl)
            }
            VStack(spacing: Space.sm) {
                if model.bestMatch != nil {
                    Button {
                        Task { await joinBest() }
                    } label: {
                        if joining { ProgressView().tint(Palette.canvas) } else { Text("Join this hangout") }
                    }
                    .buttonStyle(.brandPrimary)
                    .disabled(joining)
                    .accessibilityIdentifier("result.join")
                }
                BrandButton("See everything tonight", kind: model.bestMatch == nil ? .primary : .secondary) { finish() }
                    .accessibilityIdentifier("result.browse")
            }
            .padding(.horizontal, Space.page + 4)
            .padding(.top, Space.sm)
            .padding(.bottom, Space.xs)
        }
    }

    private func finish() {
        var profile = model.draft
        profile.onboardingCompleted = true
        app.profile = profile
        app.selectedTab = .tonight
    }

    private func joinBest() async {
        guard let match = model.bestMatch, let tonight = model.tonight else { return }
        joining = true
        defer { joining = false }
        app.profile = model.draft
        do {
            let response = try await app.join(match.hangout, timeZone: tonight.city.timeZone)
            app.tonightPath = [.hangout(match.hangout.id)]
            finish()
            try? await Task.sleep(for: .milliseconds(500))
            app.justJoined = JoinedHangout(hangout: response.hangout, member: response.member, timeZone: tonight.city.timeZone)
        } catch {
            self.error = error.localizedDescription
        }
    }
}

private struct ResultCard: View {
    let match: HangoutMatch
    let clock: TonightClock
    @State private var shown = false

    private var hangout: HangoutSummary { match.hangout }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            ZStack(alignment: .topLeading) {
                Image(hangout.spot.kind.artwork)
                    .resizable()
                    .scaledToFill()
                    .frame(height: 176)
                    .frame(maxWidth: .infinity)
                    .clipped()
                HStack(spacing: 6) {
                    Image(systemName: "sparkle")
                        .font(.system(size: 10, weight: .semibold))
                    Text("Best match")
                }
                .type(.label)
                .foregroundStyle(Palette.canvas)
                .padding(.horizontal, 8)
                .frame(height: 26)
                .background(Palette.night.opacity(0.85), in: RoundedRectangle(cornerRadius: Radius.control, style: .continuous))
                .padding(Space.sm)
            }

            VStack(alignment: .leading, spacing: Space.sm) {
                HStack(spacing: 6) {
                    Text(clock.time(hangout.startsAt)).type(.time).foregroundStyle(Palette.ink)
                    Text("·").foregroundStyle(Palette.mutedDecorative)
                    Text(hangout.vibe.label).type(.label).foregroundStyle(Palette.muted)
                }
                Text(hangout.displayTitle)
                    .type(.feature, size: 22)
                    .foregroundStyle(Palette.ink)
                    .fixedSize(horizontal: false, vertical: true)
                Label {
                    Text("\(hangout.spot.name), \(hangout.place)")
                } icon: {
                    Image(systemName: "mappin")
                }
                .type(.body)
                .foregroundStyle(Palette.muted)
                HStack(spacing: Space.xs) {
                    AvatarStack(names: hangout.names, total: hangout.memberCount)
                    Text(Pluralize.going(hangout.memberCount)).type(.body).foregroundStyle(Palette.ink)
                    Spacer()
                    Tag(text: Pluralize.seats(hangout.spotsLeft))
                }
                Rule().padding(.vertical, Space.xxs)
                Eyebrow(text: "Why it fits")
                FlowLayout(spacing: 6, rowSpacing: 6) {
                    ForEach(Array(match.reasons.enumerated()), id: \.offset) { index, reason in
                        HStack(spacing: 5) {
                            Image(systemName: "checkmark").font(.system(size: 10, weight: .bold))
                            Text(reason)
                        }
                        .type(.label)
                        .foregroundStyle(Palette.ink)
                        .padding(.horizontal, 8)
                        .frame(height: 26)
                        .background(Palette.hover, in: RoundedRectangle(cornerRadius: Radius.control, style: .continuous))
                        .scaleEffect(shown ? 1 : 0.6)
                        .opacity(shown ? 1 : 0)
                        .animation(Motion.pop.delay(0.55 + Double(index) * 0.07), value: shown)
                    }
                }
            }
            .padding(Space.md)
        }
        .cardSurface(radius: Radius.media)
        .clipShape(RoundedRectangle(cornerRadius: Radius.media, style: .continuous))
        .keyframeAnimator(initialValue: CardFrame(), trigger: shown) { content, frame in
            content
                .scaleEffect(frame.scale)
                .rotationEffect(.degrees(frame.rotation))
                .offset(y: frame.y)
                .opacity(frame.opacity)
        } keyframes: { _ in
            KeyframeTrack(\.y) {
                LinearKeyframe(60, duration: 0.15)
                SpringKeyframe(-6, duration: 0.35, spring: .snappy)
                SpringKeyframe(0, duration: 0.35)
            }
            KeyframeTrack(\.scale) {
                LinearKeyframe(0.9, duration: 0.15)
                SpringKeyframe(1.02, duration: 0.35, spring: .bouncy)
                SpringKeyframe(1, duration: 0.3)
            }
            KeyframeTrack(\.rotation) {
                LinearKeyframe(-3, duration: 0.15)
                SpringKeyframe(1, duration: 0.35)
                SpringKeyframe(0, duration: 0.3)
            }
            KeyframeTrack(\.opacity) {
                LinearKeyframe(0, duration: 0.15)
                LinearKeyframe(1, duration: 0.2)
            }
        }
        .onAppear { shown = true }
        .accessibilityElement(children: .combine)
        .accessibilityIdentifier("result.card")
    }
}

private struct CardFrame {
    var y: CGFloat = 60
    var scale: CGFloat = 0.9
    var rotation: Double = -3
    var opacity: Double = 0
}

/// When nothing fits yet: suggest starting the first group at a spot that matches the mood.
private struct StartFirstCard: View {
    let spot: Spot

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            Image(spot.kind.artwork)
                .resizable()
                .scaledToFill()
                .frame(height: 160)
                .frame(maxWidth: .infinity)
                .clipped()
            VStack(alignment: .leading, spacing: Space.xs) {
                Text("Be the first tonight").type(.feature, size: 22).foregroundStyle(Palette.ink)
                Text("No open group fits all your answers yet. \(spot.name) in \(spot.place) suits your mood; start a hangout there from the Tonight tab and others can join.")
                    .type(.body)
                    .foregroundStyle(Palette.muted)
                    .fixedSize(horizontal: false, vertical: true)
            }
            .padding(Space.md)
        }
        .cardSurface(radius: Radius.media)
        .clipShape(RoundedRectangle(cornerRadius: Radius.media, style: .continuous))
    }
}
