import SwiftUI

/// Shown after joining and on every hangout (docs/plan.md safety rules; web src/data/safety.ts).
enum SafetyHint: CaseIterable, Identifiable {
    case inside, friend, leave, report

    var id: Self { self }

    var symbol: String {
        switch self {
        case .inside: "mappin.and.ellipse"
        case .friend: "bubble.left"
        case .leave: "rectangle.portrait.and.arrow.right"
        case .report: "exclamationmark.triangle"
        }
    }

    var title: String {
        switch self {
        case .inside: "Meet inside the venue"
        case .friend: "Tell a friend"
        case .leave: "Leave whenever you want"
        case .report: "Report anything off"
        }
    }

    var body: String {
        switch self {
        case .inside: "Find the group at the spot itself, not on a corner outside."
        case .friend: "Share the plan with someone you trust before you head out."
        case .leave: "No explanation needed. One tap removes you from the group."
        case .report: "Report or block from any hangout. We follow up the same night."
        }
    }
}

// MARK: - Safety and social proof

/// Social proof partway through (playbook onboarding step 3), framed as how every hangout works.
struct SafetyStep: View {
    let model: OnboardingModel
    @Environment(AppModel.self) private var app
    @State private var shownCount = 0
    @State private var appeared = false

    private var people: Int { model.selectedCity?.peopleTonight ?? 0 }
    private var cityName: String { model.selectedCity?.city.displayName ?? "your city" }

    private let rules: [(symbol: String, title: String, body: String)] = [
        ("building.2", "Public spots only", "Bars, pubs and beer gardens from a curated list. No private addresses."),
        ("person.3", "Groups of 3 to 8", "Never one-on-one, and nobody browses private profiles."),
        ("hand.raised", "Leave, report or block anytime", "One tap, no explanation needed."),
        ("location.slash", "No location tracking", "You pick the city. No phone number, no account."),
    ]

    var body: some View {
        QuestionScaffold(title: "You won't be the only new face", subtitle: nil) {
            VStack(alignment: .leading, spacing: Space.xl) {
                HStack(alignment: .center, spacing: Space.md) {
                    Text("\(shownCount)")
                        .type(.hero, size: 56)
                        .monospacedDigit()
                        .contentTransition(.numericText(value: Double(shownCount)))
                        .foregroundStyle(Palette.ink)
                    VStack(alignment: .leading, spacing: 6) {
                        AvatarStack(names: ["Mara", "Jonas", "Aylin", "Theo"], total: max(people, 4), size: 26, maxShown: 4)
                        Text("people going out in \(cityName) tonight")
                            .type(.body)
                            .foregroundStyle(Palette.muted)
                    }
                }
                .padding(Space.md)
                .frame(maxWidth: .infinity, alignment: .leading)
                .cardSurface(fill: Palette.surface)

                VStack(alignment: .leading, spacing: Space.lg) {
                    ForEach(Array(rules.enumerated()), id: \.offset) { index, rule in
                        HStack(alignment: .top, spacing: Space.md) {
                            IconBadge(systemImage: rule.symbol, size: 36)
                            VStack(alignment: .leading, spacing: 2) {
                                Text(rule.title).type(.cardTitle).foregroundStyle(Palette.ink)
                                Text(rule.body).type(.body).foregroundStyle(Palette.muted)
                                    .fixedSize(horizontal: false, vertical: true)
                            }
                        }
                        .opacity(appeared ? 1 : 0)
                        .offset(y: appeared ? 0 : 14)
                        .animation(Motion.reveal.delay(0.35 + Double(index) * 0.09), value: appeared)
                    }
                }
            }
        } footer: {
            ContinueButton(model: model, title: "Sounds good")
        }
        .task {
            appeared = true
            try? await Task.sleep(for: .milliseconds(250))
            withAnimation(.spring(duration: 1.1, bounce: 0)) { shownCount = people }
        }
    }
}

// MARK: - Notifications

/// Permission with a preview of exactly what will arrive (Tolan), asked only after the person has context.
struct NotificationsStep: View {
    let model: OnboardingModel
    @State private var appeared = false
    @State private var asking = false

    var body: some View {
        QuestionScaffold(title: "Know when your group fills up",
                         subtitle: "One ping when your group is complete and one 30 minutes before you meet. Nothing else.") {
            NotificationPreview(appeared: appeared, spotName: previewSpot, nickname: model.trimmedNickname, clock: clock)
        } footer: {
            Button {
                asking = true
                Task {
                    _ = await Reminders.requestAuthorization()
                    asking = false
                    model.advance()
                }
            } label: {
                if asking { ProgressView().tint(Palette.canvas) } else { Text("Allow notifications") }
            }
            .buttonStyle(.brandPrimary)
            .accessibilityIdentifier("onboarding.allowNotifications")
            Button("Not now") { model.advance() }
                .type(.button)
                .foregroundStyle(Palette.muted)
                .frame(maxWidth: .infinity, minHeight: 44)
                .accessibilityIdentifier("onboarding.notNow")
        }
        .onAppear { appeared = true }
    }

    private var previewSpot: String {
        model.draft.citySlug == "berlin" ? "Bijou Bar" : "your spot"
    }

    private var clock: TonightClock {
        TonightClock(timeZone: model.selectedCity?.city.timeZone ?? .current, now: model.now())
    }
}

private struct NotificationPreview: View {
    let appeared: Bool
    let spotName: String
    let nickname: String
    let clock: TonightClock

    var body: some View {
        ZStack(alignment: .top) {
            Color.clear
                .frame(maxWidth: .infinity)
                .frame(height: 336)
                .overlay {
                    Image("CTA")
                        .resizable()
                        .scaledToFill()
                }
                .clipped()
                .overlay(Palette.night.opacity(0.18))
            VStack(spacing: 4) {
                Text(clock.clock)
                    .font(.system(size: 56, weight: .semibold, design: .rounded))
                    .foregroundStyle(Palette.white.opacity(0.92))
                Text(clock.now.formatted(Date.FormatStyle(locale: Locale(identifier: "en_GB"), timeZone: clock.timeZone).weekday(.wide).day().month(.wide)))
                    .font(.system(size: 14, weight: .medium))
                    .foregroundStyle(Palette.white.opacity(0.85))
            }
            .padding(.top, Space.xl)
            VStack(spacing: Space.xs) {
                banner(title: "Your group is complete", body: "6 going to \(spotName) at 19:00. See you there, \(nickname.isEmpty ? "friend" : nickname).",
                       time: "now", delay: 0.35)
                banner(title: "Starting in 30 minutes", body: "\(spotName) at 19:00. Meet the group inside the venue.",
                       time: "18:30", delay: 0.6)
            }
            .padding(.horizontal, Space.sm)
            .padding(.top, 124)
        }
        .frame(height: 336)
        .clipShape(RoundedRectangle(cornerRadius: Radius.media, style: .continuous))
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Preview: a notification when your group is complete, and a reminder 30 minutes before you meet.")
    }

    private func banner(title: String, body: String, time: String, delay: Double) -> some View {
        HStack(alignment: .top, spacing: Space.sm) {
            Image("AppIconPreview")
                .resizable()
                .frame(width: 38, height: 38)
                .clipShape(RoundedRectangle(cornerRadius: 9, style: .continuous))
            VStack(alignment: .leading, spacing: 1) {
                HStack {
                    Text("Plus One").font(.system(size: 15, weight: .semibold))
                    Spacer()
                    Text(time).font(.system(size: 13)).foregroundStyle(.secondary)
                }
                Text(title).font(.system(size: 15, weight: .semibold))
                Text(body).font(.system(size: 15)).lineLimit(2).fixedSize(horizontal: false, vertical: true)
            }
        }
        .foregroundStyle(Palette.ink)
        .padding(Space.sm)
        .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
        .keyframeAnimator(initialValue: BannerFrame(), trigger: appeared) { content, frame in
            content
                .offset(y: frame.y)
                .scaleEffect(frame.scale)
                .opacity(frame.opacity)
        } keyframes: { _ in
            KeyframeTrack(\.y) {
                LinearKeyframe(-60, duration: delay)
                SpringKeyframe(6, duration: 0.32, spring: .snappy)
                SpringKeyframe(0, duration: 0.28)
            }
            KeyframeTrack(\.scale) {
                LinearKeyframe(0.92, duration: delay)
                SpringKeyframe(1.0, duration: 0.4, spring: .bouncy)
            }
            KeyframeTrack(\.opacity) {
                LinearKeyframe(0, duration: delay)
                LinearKeyframe(1, duration: 0.18)
            }
        }
    }
}

private struct BannerFrame {
    var y: CGFloat = -60
    var scale: CGFloat = 0.92
    var opacity: Double = 0
}
