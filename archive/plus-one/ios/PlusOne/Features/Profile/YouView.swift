import SwiftUI

/// The person's own space: tonight's preferences, plans, saved spots, safety, privacy and data deletion.
struct YouView: View {
    @Environment(AppModel.self) private var model
    @State private var editing: EditField?
    @State private var confirmDelete = false
    @State private var showPrivacy = false
    @State private var notificationsOn = false
    @State private var savedSpots: [Spot] = []
    @State private var plans: [HangoutSummary] = []
    @State private var timeZone: TimeZone = .current

    enum EditField: String, Identifiable {
        case nickname, mood, time, size, languages
        var id: String { rawValue }
    }

    var body: some View {
        VStack(spacing: 0) {
            BrandTopBar { EmptyView() }
            ScrollView {
                VStack(alignment: .leading, spacing: Space.xxl) {
                    header
                    tonightSection
                    if !plans.isEmpty { plansSection }
                    savedSection
                    safetySection
                    privacySection
                    aboutSection
                }
                .padding(.horizontal, Space.page)
                .padding(.vertical, Space.xl)
            }
        }
        .background(Palette.canvas)
        .toolbar(.hidden, for: .navigationBar)
        .task(id: model.memberships.count) { await load() }
        .task(id: model.profile.savedSpotIDs) { await load() }
        .sheet(item: $editing) { field in
            EditPreferenceSheet(field: field)
                .presentationDetents([.medium, .large])
                .presentationCornerRadius(Radius.media)
        }
        .sheet(isPresented: $showPrivacy) { PrivacySheet() }
        .confirmationDialog("Delete everything Plus One stored?", isPresented: $confirmDelete, titleVisibility: .visible) {
            Button("Delete my data", role: .destructive) { Task { await model.deleteLocalData() } }
        } message: {
            Text("This removes your name, preferences and saved spots from this phone and leaves your hangouts. You start over at the welcome screen.")
        }
    }

    private func load() async {
        notificationsOn = await Reminders.isAuthorized()
        guard let spots = try? await model.api.spots(citySlug: model.profile.citySlug, vibe: nil, kind: nil),
              let tonight = try? await model.api.cityTonight(slug: model.profile.citySlug) else { return }
        timeZone = tonight.city.timeZone
        savedSpots = spots.spots.filter { model.isSaved($0.id) }
        plans = tonight.hangouts.filter { model.isMember($0.id) }
    }

    private var header: some View {
        HStack(spacing: Space.md) {
            Avatar(name: model.profile.nickname.isEmpty ? "?" : model.profile.nickname, size: 64, ring: Palette.line)
            VStack(alignment: .leading, spacing: 4) {
                Text(model.profile.nickname).type(.title, size: 28).foregroundStyle(Palette.ink)
                HStack(spacing: 6) {
                    Image(systemName: "checkmark.seal").font(.system(size: 12))
                    Text("18+ confirmed · \(model.profile.citySlug.capitalized)")
                }
                .type(.label)
                .foregroundStyle(Palette.muted)
            }
            Spacer()
            Button("Edit") { editing = .nickname }
                .buttonStyle(QuietButtonStyle())
                .accessibilityLabel("Edit name")
        }
    }

    private var tonightSection: some View {
        let clock = model.clock(for: timeZone)
        return section("Tonight") {
            row("Free from", model.profile.availableFrom(tonightKey: clock.nightKey).title, symbol: "clock") { editing = .time }
            row("Mood", model.profile.vibes.map(\.label).joined(separator: ", "), symbol: "sparkles") { editing = .mood }
            row("Group size", model.profile.groupSize.title, symbol: "person.3") { editing = .size }
            row("Languages", model.profile.languages.map(\.label).joined(separator: ", "), symbol: "globe") { editing = .languages }
        }
    }

    private var plansSection: some View {
        section("Your plans") {
            ForEach(plans) { hangout in
                NavigationLink(value: Route.hangout(hangout.id)) {
                    HangoutCard(hangout: hangout, clock: model.clock(for: timeZone), isMine: true)
                }
                .buttonStyle(PressableStyle())
            }
        }
    }

    private var savedSection: some View {
        section("Saved spots") {
            if savedSpots.isEmpty {
                Text("Tap the heart on a spot to keep it here.")
                    .type(.body)
                    .foregroundStyle(Palette.muted)
            }
            ForEach(savedSpots) { spot in
                NavigationLink(value: Route.spot(spot.id)) {
                    HStack(spacing: Space.md) {
                        Image(spot.kind.artwork)
                            .resizable()
                            .scaledToFill()
                            .frame(width: 52, height: 52)
                            .clipShape(RoundedRectangle(cornerRadius: Radius.control + 2, style: .continuous))
                        VStack(alignment: .leading, spacing: 2) {
                            Text(spot.name).type(.cardTitle).foregroundStyle(Palette.ink)
                            Text("\(spot.kind.label) · \(spot.place)").type(.label).foregroundStyle(Palette.muted)
                        }
                        Spacer()
                        Image(systemName: "chevron.right").font(.system(size: 13, weight: .semibold)).foregroundStyle(Palette.mutedDecorative)
                    }
                }
                .buttonStyle(PressableStyle())
            }
        }
    }

    private var safetySection: some View {
        section("Safety") {
            ForEach(SafetyHint.allCases) { hint in
                HStack(alignment: .top, spacing: Space.md) {
                    IconBadge(systemImage: hint.symbol, size: 36)
                    VStack(alignment: .leading, spacing: 2) {
                        Text(hint.title).type(.cardTitle).foregroundStyle(Palette.ink)
                        Text(hint.body).type(.body).foregroundStyle(Palette.muted)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                }
            }
        }
    }

    private var privacySection: some View {
        section("Privacy") {
            row("Notifications", notificationsOn ? "On" : "Off", symbol: "bell") {
                Task {
                    if await Reminders.requestAuthorization() == false, let url = URL(string: UIApplication.openSettingsURLString) {
                        await UIApplication.shared.open(url)
                    }
                    notificationsOn = await Reminders.isAuthorized()
                }
            }
            row("What we store", "Only what you told us", symbol: "lock") { showPrivacy = true }
            Button(role: .destructive) {
                confirmDelete = true
            } label: {
                HStack(spacing: Space.md) {
                    IconBadge(systemImage: "trash", size: 36)
                    Text("Delete my data").type(.cardTitle)
                    Spacer()
                }
                .foregroundStyle(Palette.ink)
            }
            .accessibilityIdentifier("you.delete")
        }
    }

    private var aboutSection: some View {
        VStack(alignment: .leading, spacing: Space.xs) {
            Wordmark(height: 20)
            Text("Version \(Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "1.0")\(model.api.isDemo ? " · demo data" : "")")
                .type(.label)
                .foregroundStyle(Palette.muted)
            OSMAttribution()
            Text("Fonts: Geist, Geist Mono, Source Serif 4 (SIL Open Font License)")
                .type(.label)
                .foregroundStyle(Palette.muted)
        }
    }

    private func section(_ title: String, @ViewBuilder content: () -> some View) -> some View {
        VStack(alignment: .leading, spacing: Space.md) {
            Text(title).type(.cardTitle, size: 20).foregroundStyle(Palette.ink).accessibilityAddTraits(.isHeader)
            content()
        }
    }

    private func row(_ title: String, _ value: String, symbol: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            HStack(spacing: Space.md) {
                IconBadge(systemImage: symbol, size: 36)
                VStack(alignment: .leading, spacing: 1) {
                    Text(title).type(.label).foregroundStyle(Palette.muted)
                    Text(value.isEmpty ? "Not set" : value).type(.cardTitle, size: 16).foregroundStyle(Palette.ink)
                        .multilineTextAlignment(.leading)
                }
                Spacer()
                Image(systemName: "chevron.right").font(.system(size: 13, weight: .semibold)).foregroundStyle(Palette.mutedDecorative)
            }
            .contentShape(Rectangle())
        }
        .buttonStyle(PressableStyle())
    }
}

/// Edits one onboarding answer in place, reusing the onboarding controls.
private struct EditPreferenceSheet: View {
    let field: YouView.EditField
    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss
    @Namespace private var highlight
    @State private var nickname = ""

    var body: some View {
        @Bindable var model = model
        VStack(alignment: .leading, spacing: Space.lg) {
            Text(title).type(.title, size: 26).foregroundStyle(Palette.ink).padding(.top, Space.xl)
            ScrollView {
                switch field {
                case .nickname:
                    VStack(alignment: .leading, spacing: Space.xs) {
                        TextField("Your name", text: $nickname)
                            .font(.custom("Geist-Medium", size: 24, relativeTo: .title))
                            .textInputAutocapitalization(.words)
                            .autocorrectionDisabled()
                        Rule()
                    }
                case .mood:
                    MoodBubbles(selected: model.profile.vibes) { vibe in
                        if let index = model.profile.vibes.firstIndex(of: vibe) {
                            if model.profile.vibes.count > 1 { model.profile.vibes.remove(at: index) }
                        } else {
                            model.profile.vibes.append(vibe)
                        }
                    }
                    .frame(height: 340)
                case .time:
                    VStack(spacing: Space.xs) {
                        ForEach(AvailableFrom.allCases) { option in
                            OptionRow(title: option.title, subtitle: option.subtitle, systemImage: option.symbol,
                                      isSelected: model.profile.availableFrom == option, namespace: highlight) {
                                withAnimation(Motion.glide) {
                                    model.profile.availableFrom = option
                                    model.profile.availableFromNight = model.clock(for: TimeZone(identifier: "Europe/Berlin")!).nightKey
                                }
                            }
                        }
                    }
                case .size:
                    VStack(spacing: Space.xs) {
                        ForEach(GroupSizePreference.allCases) { option in
                            OptionRow(title: option.title, subtitle: option.subtitle,
                                      isSelected: model.profile.groupSize == option, namespace: highlight) {
                                withAnimation(Motion.glide) { model.profile.groupSize = option }
                            }
                        }
                    }
                case .languages:
                    FlowLayout(spacing: Space.xs, rowSpacing: Space.xs) {
                        ForEach(HangoutLanguage.spoken) { language in
                            let selected = model.profile.languages.contains(language)
                            Chip(title: language.endonym, isSelected: selected) {
                                if let index = model.profile.languages.firstIndex(of: language) {
                                    if model.profile.languages.count > 1 { model.profile.languages.remove(at: index) }
                                } else {
                                    model.profile.languages.append(language)
                                }
                            }
                        }
                    }
                }
            }
            Button("Done") {
                if field == .nickname {
                    let trimmed = nickname.trimmingCharacters(in: .whitespacesAndNewlines)
                    if !trimmed.isEmpty { model.profile.nickname = String(trimmed.prefix(ContractLimits.nicknameMax)) }
                }
                dismiss()
            }
            .buttonStyle(BrandButtonStyle(kind: .primary, rollTitle: "Done"))
        }
        .padding(.horizontal, Space.page + 4)
        .padding(.bottom, Space.xs)
        .background(Palette.canvas)
        .onAppear { nickname = model.profile.nickname }
    }

    private var title: String {
        switch field {
        case .nickname: "Your name"
        case .mood: "Your mood"
        case .time: "Free from"
        case .size: "Group size"
        case .languages: "Languages"
        }
    }
}

/// Plain-language privacy summary (full texts for the App Store live in apps/ios/AppStore/privacy.md).
struct PrivacySheet: View {
    @Environment(\.dismiss) private var dismiss

    private let items: [(String, String)] = [
        ("On this phone only", "Your name, mood, time, group size, languages and saved spots. Your birth year is never stored; we only keep that you confirmed 18+."),
        ("Sent when you join or host", "Your nickname, an optional line for your group and the 18+ confirmation. A random device id in a cookie keeps your seat; there is no account."),
        ("Never collected", "Your location, contacts, photos, phone number or email. No ads and no tracking across apps."),
        ("Delete anytime", "\"Delete my data\" in the You tab clears this phone and leaves your hangouts. Hangouts and chats expire at 06:00 the next morning."),
    ]

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: Space.xl) {
                    ForEach(items, id: \.0) { item in
                        VStack(alignment: .leading, spacing: Space.xs) {
                            Text(item.0).type(.cardTitle, size: 18).foregroundStyle(Palette.ink)
                            Text(item.1).type(.body).foregroundStyle(Palette.muted)
                                .fixedSize(horizontal: false, vertical: true)
                        }
                    }
                }
                .padding(Space.page + 4)
            }
            .background(Palette.canvas)
            .navigationTitle("What we store")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) { Button("Done") { dismiss() } }
            }
        }
    }
}
