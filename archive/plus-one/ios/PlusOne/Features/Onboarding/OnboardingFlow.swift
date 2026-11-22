import SwiftUI

/// One question per screen, a thin progress bar, big serif headlines and a full-width action (Cal AI structure),
/// with spring transitions, bubbles and a permission preview (Tolan motion), in the Plus One brand.
struct OnboardingFlow: View {
    @Environment(AppModel.self) private var app
    @State private var model: OnboardingModel

    init(now: @escaping () -> Date) {
        let arguments = ProcessInfo.processInfo.arguments
        let start = arguments.firstIndex(of: "-PlusOneOnboardingStep")
            .flatMap { arguments.indices.contains($0 + 1) ? arguments[$0 + 1] : nil }
            .flatMap { name in OnboardingStep.allCases.first { $0.analyticsName == name } } ?? .welcome
        _model = State(initialValue: OnboardingModel(now: now, initialStep: start, prefilled: start != .welcome))
    }

    var body: some View {
        VStack(spacing: 0) {
            if model.showsChrome {
                topBar
                    .transition(.opacity)
            }
            ZStack {
                stepView(model.step)
                    .id(model.step)
                    .transition(stepTransition)
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
        }
        .background(Palette.canvas.ignoresSafeArea())
        .animation(Motion.step, value: model.showsChrome)
        .task { await model.loadCities(api: app.api) }
        .task(id: model.step) {
            if model.step == .matching || model.step == .result, model.tonight == nil {
                await model.findMatches(api: app.api)
            }
        }
    }

    private var topBar: some View {
        HStack(spacing: Space.sm) {
            Button {
                model.back()
            } label: {
                Image(systemName: "chevron.left")
                    .font(.system(size: 17, weight: .medium))
                    .foregroundStyle(Palette.ink)
                    .frame(width: 44, height: 44)
                    .contentShape(Rectangle())
            }
            .accessibilityLabel("Back")
            .accessibilityIdentifier("onboarding.back")
            ThinProgressBar(progress: model.progress)
                .padding(.trailing, Space.sm)
        }
        .padding(.horizontal, Space.xs)
        .frame(height: 52)
    }

    private var stepTransition: AnyTransition {
        let distance: CGFloat = 56
        return .asymmetric(
            insertion: .offset(x: model.forward ? distance : -distance)
                .combined(with: .opacity)
                .combined(with: .scale(scale: 0.98, anchor: model.forward ? .trailing : .leading)),
            removal: .offset(x: model.forward ? -distance : distance)
                .combined(with: .opacity)
        )
    }

    @ViewBuilder
    private func stepView(_ step: OnboardingStep) -> some View {
        switch step {
        case .welcome: WelcomeStep(model: model)
        case .city: CityStep(model: model)
        case .name: NameStep(model: model)
        case .age: AgeStep(model: model)
        case .mood: MoodStep(model: model)
        case .time: TimeStep(model: model)
        case .size: SizeStep(model: model)
        case .languages: LanguagesStep(model: model)
        case .safety: SafetyStep(model: model)
        case .notifications: NotificationsStep(model: model)
        case .matching: MatchingStep(model: model)
        case .result: ResultStep(model: model)
        }
    }
}

// MARK: - Scaffold

/// Title, subtitle, content and a pinned action area for a question screen.
struct QuestionScaffold<Content: View, Footer: View>: View {
    let title: String
    var subtitle: String?
    @ViewBuilder var content: Content
    @ViewBuilder var footer: Footer

    var body: some View {
        VStack(spacing: 0) {
            ScrollView {
                VStack(alignment: .leading, spacing: 0) {
                    VStack(alignment: .leading, spacing: Space.sm) {
                        RevealText(text: title, style: .title)
                            .accessibilityAddTraits(.isHeader)
                        if let subtitle {
                            Text(subtitle)
                                .type(.lede)
                                .foregroundStyle(Palette.muted)
                                .fixedSize(horizontal: false, vertical: true)
                        }
                    }
                    .padding(.top, Space.md)
                    .padding(.bottom, Space.xxl)
                    content
                }
                .padding(.horizontal, Space.page + 4)
                .padding(.bottom, Space.xl)
            }
            .scrollBounceBehavior(.basedOnSize)
            .scrollDismissesKeyboard(.interactively)
            VStack(spacing: Space.sm) { footer }
                .padding(.horizontal, Space.page + 4)
                .padding(.top, Space.sm)
                .padding(.bottom, Space.xs)
                .background(Palette.canvas)
        }
    }
}

/// The standard footer: a Continue button that wakes up when the answer is valid.
struct ContinueButton: View {
    let model: OnboardingModel
    var title = "Continue"

    var body: some View {
        Button(title) { model.advance() }
            .buttonStyle(BrandButtonStyle(kind: .primary, rollTitle: title))
            .disabled(!model.canContinue)
            .sensoryFeedback(.impact(weight: .light), trigger: model.step) { _, _ in true }
            .accessibilityIdentifier("onboarding.continue")
    }
}

/// A large single-select option (web join flow rows): icon square, title, subtitle; selected inverts to night
/// with the highlight gliding between rows.
struct OptionRow<Trailing: View>: View {
    let title: String
    var subtitle: String?
    var systemImage: String?
    let isSelected: Bool
    var namespace: Namespace.ID?
    var highlightID = "option.highlight"
    let action: () -> Void
    @ViewBuilder var trailing: Trailing

    var body: some View {
        Button(action: action) {
            HStack(spacing: Space.md) {
                if let systemImage {
                    IconBadge(systemImage: systemImage, size: 40, inverted: isSelected)
                }
                VStack(alignment: .leading, spacing: 2) {
                    Text(title)
                        .type(.cardTitle)
                        .foregroundStyle(isSelected ? Palette.canvas : Palette.ink)
                    if let subtitle {
                        Text(subtitle)
                            .type(.body)
                            .foregroundStyle(isSelected ? Palette.nightMuted : Palette.muted)
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                trailing
            }
            .padding(.horizontal, Space.md)
            .padding(.vertical, 14)
            .frame(minHeight: 72)
            .background {
                ZStack {
                    RoundedRectangle(cornerRadius: Radius.card, style: .continuous)
                        .fill(Palette.surface)
                        .overlay(RoundedRectangle(cornerRadius: Radius.card, style: .continuous)
                            .strokeBorder(Palette.line, lineWidth: Hairline.width))
                    if isSelected {
                        if let namespace {
                            RoundedRectangle(cornerRadius: Radius.card, style: .continuous)
                                .fill(Palette.night)
                                .matchedGeometryEffect(id: highlightID, in: namespace)
                        } else {
                            RoundedRectangle(cornerRadius: Radius.card, style: .continuous).fill(Palette.night)
                        }
                    }
                }
            }
            .contentShape(RoundedRectangle(cornerRadius: Radius.card, style: .continuous))
        }
        .buttonStyle(PressableStyle())
        .accessibilityAddTraits(isSelected ? .isSelected : [])
    }
}

extension OptionRow where Trailing == EmptyView {
    init(title: String, subtitle: String? = nil, systemImage: String? = nil, isSelected: Bool,
         namespace: Namespace.ID? = nil, highlightID: String = "option.highlight", action: @escaping () -> Void) {
        self.init(title: title, subtitle: subtitle, systemImage: systemImage, isSelected: isSelected,
                  namespace: namespace, highlightID: highlightID, action: action) { EmptyView() }
    }
}
