import SwiftUI

// MARK: - Welcome

/// Hook: one promise, one button (playbook onboarding step 1), on the landing hero's choreography
/// (motion-spec 1 to 5): the header drops in, the headline blurs in per character, then the line, the action,
/// the art and the strip follow at 1.5 s, 1.7 s, 2.0 s and 2.2 s.
struct WelcomeStep: View {
    let model: OnboardingModel

    var body: some View {
        VStack(spacing: 0) {
            Wordmark(height: 26)
                .padding(.top, Space.xs)
                .plusNavDrop()

            hero
                .padding(.top, Space.lg)
                .padding(.horizontal, Space.xs)
                .plusReveal(y: PlusMotion.Distance.heroArtY, delay: PlusMotion.HeroDelay.art, trigger: .appear)

            VStack(spacing: Space.sm) {
                RevealText(text: "Meet a small group tonight", style: .hero, size: 36, alignment: .center,
                           delay: PlusMotion.HeroDelay.headline)
                Text("Pick a city, join three to eight people at a public bar or beer garden, and just show up.")
                    .type(.lede)
                    .foregroundStyle(Palette.muted)
                    .multilineTextAlignment(.center)
                    .fixedSize(horizontal: false, vertical: true)
                    .plusReveal(delay: PlusMotion.HeroDelay.lede, trigger: .appear)
            }
            .padding(.horizontal, Space.xl)
            .padding(.top, Space.xl)

            Spacer(minLength: Space.md)

            VStack(spacing: Space.sm) {
                BrandButton("Get started") { model.advance() }
                    .accessibilityIdentifier("onboarding.start")
                Text("18+ only · No account · No phone number")
                    .type(.label)
                    .foregroundStyle(Palette.muted)
            }
            .padding(.horizontal, Space.page + 4)
            .padding(.bottom, Space.xs)
            .plusReveal(delay: PlusMotion.HeroDelay.action, trigger: .appear)
        }
    }

    private var hero: some View {
        GeometryReader { proxy in
            ZStack(alignment: .topLeading) {
                Image("Hero")
                    .resizable()
                    .scaledToFill()
                    .frame(width: proxy.size.width, height: proxy.size.height)
                    .clipped()
                    .overlay(alignment: .top) {
                        LinearGradient(colors: [Palette.canvas, Palette.canvas.opacity(0)], startPoint: .top, endPoint: .bottom)
                            .frame(height: proxy.size.height * 0.28)
                    }
                RegistrationMarks()
                    .opacity(0.7)
                ArrivingSeat()
                    .frame(width: 58, height: 58)
                    .position(x: proxy.size.width * 0.86, y: proxy.size.height * 0.36)
                    .plusReveal(y: 0, scale: 0.4, delay: PlusMotion.HeroDelay.strip, trigger: .appear)
                LiveBadge(text: "3 going · room for one more")
                    .padding(Space.md)
                    .padding(.top, proxy.size.height * 0.2)
                    .plusReveal(y: PlusMotion.Distance.revealYSmall, delay: PlusMotion.HeroDelay.strip, trigger: .appear)
            }
            .clipShape(UnevenRoundedRectangle(bottomLeadingRadius: Radius.media, bottomTrailingRadius: Radius.media, style: .continuous))
        }
        .accessibilityHidden(true)
    }
}

/// The dashed circle on the landing art: the seat that is still free, slowly turning.
private struct ArrivingSeat: View {
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        Circle()
            .strokeBorder(Palette.white.opacity(0.9), style: StrokeStyle(lineWidth: 1.5, dash: [4, 4]))
            .phaseAnimator([0.0, 1.0]) { view, phase in
                view.rotationEffect(.degrees(reduceMotion ? 0 : phase * 90))
            } animation: { _ in .linear(duration: 6) }
    }
}

/// Faint registration crosshairs over the hero (brand/assets/registration.svg motif).
private struct RegistrationMarks: View {
    var body: some View {
        GeometryReader { proxy in
            let points: [CGPoint] = [
                CGPoint(x: 0.12, y: 0.42), CGPoint(x: 0.34, y: 0.42), CGPoint(x: 0.56, y: 0.42), CGPoint(x: 0.78, y: 0.42),
                CGPoint(x: 0.2, y: 0.72), CGPoint(x: 0.64, y: 0.72),
            ]
            ForEach(Array(points.enumerated()), id: \.offset) { _, point in
                Image(systemName: "plus")
                    .font(.system(size: 11, weight: .ultraLight))
                    .foregroundStyle(Palette.white.opacity(0.75))
                    .position(x: proxy.size.width * point.x, y: proxy.size.height * point.y)
            }
            Rectangle()
                .fill(Palette.white.opacity(0.35))
                .frame(height: 1)
                .position(x: proxy.size.width / 2, y: proxy.size.height * 0.9)
            Rectangle()
                .fill(Palette.white.opacity(0.25))
                .frame(width: proxy.size.width * 0.7, height: 1)
                .position(x: proxy.size.width / 2, y: proxy.size.height * 0.94)
        }
    }
}

// MARK: - City

struct CityStep: View {
    @Bindable var model: OnboardingModel
    @Namespace private var highlight

    var body: some View {
        QuestionScaffold(title: "Where are you going out tonight?",
                         subtitle: "We only use the city you pick. No location access, ever.") {
            VStack(spacing: Space.xs) {
                if model.cities.isEmpty {
                    ForEach(0..<6, id: \.self) { _ in
                        RoundedRectangle(cornerRadius: Radius.card).fill(Palette.hover).frame(height: 76)
                    }
                    if let error = model.loadError {
                        Text(error).type(.body).foregroundStyle(Palette.muted)
                    }
                }
                ForEach(Array(model.cities.enumerated()), id: \.element.id) { index, city in
                    cityRow(city)
                        .transition(.opacity.combined(with: .offset(y: 12)))
                        .animation(Motion.step.delay(Double(index) * 0.04), value: model.cities.count)
                }
            }
        } footer: {
            ContinueButton(model: model)
        }
    }

    private func cityRow(_ city: CityListItem) -> some View {
        let selected = model.draft.citySlug == city.slug
        return Button {
            withAnimation(Motion.glide) { model.draft.citySlug = city.slug }
        } label: {
            HStack(spacing: Space.md) {
                Image(CityCopy.artwork(city.slug))
                    .resizable()
                    .scaledToFill()
                    .frame(width: 52, height: 52)
                    .clipShape(RoundedRectangle(cornerRadius: Radius.control + 2, style: .continuous))
                VStack(alignment: .leading, spacing: 3) {
                    Text(city.city.displayName)
                        .type(.cardTitle)
                        .foregroundStyle(selected ? Palette.canvas : Palette.ink)
                    Text("\(CityCopy.country(city.countryCode)) · \(Pluralize.going(city.peopleTonight)) tonight")
                        .type(.label)
                        .foregroundStyle(selected ? Palette.nightMuted : Palette.muted)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                Image(systemName: selected ? "checkmark.circle.fill" : "circle")
                    .font(.system(size: 20, weight: .regular))
                    .foregroundStyle(selected ? Palette.canvas : Palette.line)
                    .contentTransition(.symbolEffect(.replace))
            }
            .padding(Space.sm)
            .background {
                ZStack {
                    RoundedRectangle(cornerRadius: Radius.card, style: .continuous)
                        .fill(Palette.surface)
                        .overlay(RoundedRectangle(cornerRadius: Radius.card, style: .continuous)
                            .strokeBorder(Palette.line, lineWidth: Hairline.width))
                    if selected {
                        RoundedRectangle(cornerRadius: Radius.card, style: .continuous)
                            .fill(Palette.night)
                            .matchedGeometryEffect(id: "city.highlight", in: highlight)
                    }
                }
            }
            .contentShape(Rectangle())
        }
        .buttonStyle(PressableStyle())
        .sensoryFeedback(.selection, trigger: selected) { _, new in new }
        .accessibilityIdentifier("city.\(city.slug)")
        .accessibilityAddTraits(selected ? .isSelected : [])
    }
}

// MARK: - Name

struct NameStep: View {
    @Bindable var model: OnboardingModel
    @FocusState private var focused: Bool

    var body: some View {
        QuestionScaffold(title: "What should the group call you?",
                         subtitle: "A first name or nickname is enough. It shows on the hangouts you join.") {
            VStack(alignment: .leading, spacing: Space.sm) {
                HStack(spacing: Space.md) {
                    Avatar(name: model.trimmedNickname.isEmpty ? "?" : model.trimmedNickname, size: 56, ring: Palette.line)
                        .scaleEffect(model.trimmedNickname.isEmpty ? 0.92 : 1)
                        .animation(Motion.pop, value: model.trimmedNickname.prefix(1))
                    TextField("", text: $model.draft.nickname, prompt: Text("Your name").foregroundStyle(Palette.mutedDecorative))
                        .font(.custom("Geist-Medium", size: 26, relativeTo: .title))
                        .tracking(-0.5)
                        .foregroundStyle(Palette.ink)
                        .textContentType(.givenName)
                        .textInputAutocapitalization(.words)
                        .autocorrectionDisabled()
                        .submitLabel(.continue)
                        .focused($focused)
                        .onSubmit { model.advance() }
                        .onChange(of: model.draft.nickname) { _, value in
                            if value.count > ContractLimits.nicknameMax {
                                model.draft.nickname = String(value.prefix(ContractLimits.nicknameMax))
                            }
                        }
                        .accessibilityIdentifier("onboarding.nickname")
                }
                Rule(color: focused ? Palette.ink : Palette.line)
                    .animation(Motion.interaction, value: focused)
                HStack {
                    Text("No account, no phone number.")
                    Spacer()
                    Text("\(model.draft.nickname.count)/\(ContractLimits.nicknameMax)")
                        .monospacedDigit()
                        .contentTransition(.numericText())
                        .animation(Motion.interaction, value: model.draft.nickname.count)
                }
                .type(.label)
                .foregroundStyle(Palette.muted)
            }
        } footer: {
            ContinueButton(model: model)
        }
        .task {
            try? await Task.sleep(for: .milliseconds(450))
            focused = true
        }
    }
}

// MARK: - Age

struct AgeStep: View {
    @Bindable var model: OnboardingModel

    private var years: [Int] {
        let current = Calendar.current.component(.year, from: model.now())
        return Array((current - 100)...current).reversed()
    }

    var body: some View {
        QuestionScaffold(title: "When were you born?",
                         subtitle: "Plus One is for adults. Your birth year stays on this phone; we only remember that you are 18 or older.") {
            VStack(spacing: Space.md) {
                Picker("Birth year", selection: $model.birthYear) {
                    ForEach(years, id: \.self) { year in
                        Text(String(year))
                            .font(.custom("Geist-Medium", size: 22))
                            .tag(year)
                    }
                }
                .pickerStyle(.wheel)
                .frame(height: 200)
                .sensoryFeedback(.selection, trigger: model.birthYear)
                .accessibilityIdentifier("onboarding.birthYear")

                switch model.ageResult {
                case .adult:
                    EmptyView()
                case .needsBirthdayConfirmation:
                    Button {
                        withAnimation(Motion.pop) { model.confirmedBirthdayThisYear.toggle() }
                    } label: {
                        HStack(spacing: Space.sm) {
                            Image(systemName: model.confirmedBirthdayThisYear ? "checkmark.square.fill" : "square")
                                .font(.system(size: 20))
                                .contentTransition(.symbolEffect(.replace))
                            Text("I have already had my 18th birthday")
                                .type(.body)
                            Spacer()
                        }
                        .foregroundStyle(Palette.ink)
                        .padding(Space.md)
                        .cardSurface(fill: Palette.surface)
                    }
                    .buttonStyle(PressableStyle())
                    .accessibilityIdentifier("onboarding.birthday")
                    .transition(.opacity.combined(with: .move(edge: .bottom)))
                case .minor:
                    HStack(alignment: .top, spacing: Space.sm) {
                        Image(systemName: "hand.raised")
                        Text("Sorry, Plus One is only for adults. Come back when you are 18.")
                            .type(.body)
                    }
                    .foregroundStyle(Palette.ink)
                    .padding(Space.md)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .cardSurface(fill: Palette.surface)
                    .transition(.opacity.combined(with: .move(edge: .bottom)))
                }
            }
            .animation(Motion.glide, value: model.ageResult)
        } footer: {
            ContinueButton(model: model)
        }
    }
}

// MARK: - Time

struct TimeStep: View {
    @Bindable var model: OnboardingModel
    @Namespace private var highlight

    var body: some View {
        QuestionScaffold(title: "From when are you free tonight?",
                         subtitle: "Hangouts that start around then come first.") {
            VStack(spacing: Space.xs) {
                ForEach(AvailableFrom.allCases) { option in
                    OptionRow(title: option.title, subtitle: option.subtitle, systemImage: option.symbol,
                              isSelected: model.draft.availableFrom == option, namespace: highlight) {
                        withAnimation(Motion.glide) { model.draft.availableFrom = option }
                    }
                    .sensoryFeedback(.selection, trigger: model.draft.availableFrom == option) { _, new in new }
                    .accessibilityIdentifier("time.\(option.rawValue)")
                }
            }
        } footer: {
            ContinueButton(model: model)
        }
    }
}

// MARK: - Group size

struct SizeStep: View {
    @Bindable var model: OnboardingModel
    @Namespace private var highlight

    var body: some View {
        QuestionScaffold(title: "How big should your group be?",
                         subtitle: "Every hangout has 3 to 8 seats. Never one-on-one.") {
            VStack(spacing: Space.xs) {
                ForEach(GroupSizePreference.allCases) { option in
                    let selected = model.draft.groupSize == option
                    OptionRow(title: option.title, subtitle: option.subtitle, isSelected: selected, namespace: highlight) {
                        withAnimation(Motion.glide) { model.draft.groupSize = option }
                    } trailing: {
                        SeatDots(count: option.seats, selected: selected)
                    }
                    .sensoryFeedback(.selection, trigger: selected) { _, new in new }
                    .accessibilityIdentifier("size.\(option.rawValue)")
                }
            }
        } footer: {
            ContinueButton(model: model)
        }
    }
}

/// Seats as dots in two rows; the last one is the free seat (the brand's arriving fourth).
private struct SeatDots: View {
    let count: Int
    let selected: Bool

    var body: some View {
        if count == 0 {
            Image(systemName: "infinity")
                .font(.system(size: 15, weight: .medium))
                .foregroundStyle(selected ? Palette.canvas : Palette.muted)
                .frame(width: 52)
        } else {
            let columns = Array(repeating: GridItem(.fixed(9), spacing: 4), count: Int(ceil(Double(count) / 2)))
            LazyVGrid(columns: columns, spacing: 4) {
                ForEach(0..<count, id: \.self) { index in
                    Circle()
                        .fill(index == count - 1 ? Palette.periwinkle : (selected ? Palette.canvas : Palette.ink))
                        .frame(width: 9, height: 9)
                        .scaleEffect(selected ? 1 : 0.85)
                        .animation(Motion.pop.delay(Double(index) * 0.03), value: selected)
                }
            }
            .frame(width: 52)
        }
    }
}

// MARK: - Languages

struct LanguagesStep: View {
    @Bindable var model: OnboardingModel

    var body: some View {
        QuestionScaffold(title: "Which languages are you happy to speak?",
                         subtitle: "We only suggest groups you can talk in. Pick all that apply.") {
            FlowLayout(spacing: Space.xs, rowSpacing: Space.xs) {
                ForEach(HangoutLanguage.spoken) { language in
                    languageChip(language)
                }
            }
        } footer: {
            ContinueButton(model: model)
        }
        .onAppear { model.preselectLanguages() }
    }

    private func languageChip(_ language: HangoutLanguage) -> some View {
        let selected = model.draft.languages.contains(language)
        return Button {
            withAnimation(Motion.pop) { model.toggle(language) }
        } label: {
            HStack(spacing: Space.xs) {
                Image(systemName: selected ? "checkmark" : "plus")
                    .font(.system(size: 13, weight: .semibold))
                    .contentTransition(.symbolEffect(.replace))
                    .frame(width: 16)
                VStack(alignment: .leading, spacing: 0) {
                    Text(language.endonym).type(.cardTitle)
                    if language.endonym != language.label {
                        Text(language.label)
                            .type(.label)
                            .foregroundStyle(selected ? Palette.nightMuted : Palette.muted)
                    }
                }
            }
            .foregroundStyle(selected ? Palette.canvas : Palette.ink)
            .padding(.leading, Space.sm)
            .padding(.trailing, Space.md)
            .frame(height: 56)
            .background(selected ? Palette.night : Palette.surface,
                        in: RoundedRectangle(cornerRadius: Radius.card, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: Radius.card, style: .continuous)
                .strokeBorder(selected ? Palette.night : Palette.line, lineWidth: Hairline.width))
            .scaleEffect(selected ? 1.0 : 0.98)
        }
        .buttonStyle(PressableStyle())
        .sensoryFeedback(.selection, trigger: selected)
        .accessibilityIdentifier("language.\(language.rawValue)")
        .accessibilityAddTraits(selected ? .isSelected : [])
    }
}
