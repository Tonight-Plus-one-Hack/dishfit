import SwiftUI

/// City "tonight" page (Luma structure): artwork, the city, live counters, a best match, vibe filters and a
/// timeline of open hangouts with time, spot, avatars and "x going".
struct TonightView: View {
    @Environment(AppModel.self) private var model
    @State private var data: CityTonightResponse?
    @State private var spotCount = 0
    @State private var error: String?
    @State private var filter: Vibe?
    @State private var showCityPicker = false
    @State private var showStart = false
    @Namespace private var chipHighlight

    var body: some View {
        VStack(spacing: 0) {
            BrandTopBar {
                Button {
                    showCityPicker = true
                } label: {
                    HStack(spacing: 6) {
                        Text(data?.city.displayName ?? " ")
                        Image(systemName: "chevron.down").font(.system(size: 10, weight: .semibold))
                    }
                }
                .buttonStyle(QuietButtonStyle())
                .accessibilityLabel("City: \(data?.city.displayName ?? ""). Change city")
                .accessibilityIdentifier("tonight.cityPicker")
            }
            ScrollView {
                if let data {
                    content(data)
                } else if let error {
                    ErrorStateView(message: error) { Task { await load() } }
                } else {
                    LoadingView()
                }
            }
            .refreshable { await load() }
        }
        .background(Palette.canvas)
        .toolbar(.hidden, for: .navigationBar)
        .task(id: model.profile.citySlug) { await load() }
        .sheet(isPresented: $showCityPicker) {
            CityPickerSheet()
                .presentationDetents([.large])
                .presentationCornerRadius(Radius.media)
        }
        .sheet(isPresented: $showStart, onDismiss: { Task { await load() } }) {
            if let data { StartHangoutSheet(city: data.city) }
        }
    }

    private func load() async {
        do {
            async let tonight = model.api.cityTonight(slug: model.profile.citySlug)
            async let spots = model.api.spots(citySlug: model.profile.citySlug, vibe: nil, kind: nil)
            let (tonightResponse, spotsResponse) = try await (tonight, spots)
            withAnimation(Motion.reveal) {
                data = tonightResponse
                spotCount = spotsResponse.spots.count
                error = nil
            }
            await model.refreshMemberships()
        } catch {
            self.error = error.localizedDescription
        }
    }

    @ViewBuilder
    private func content(_ data: CityTonightResponse) -> some View {
        let clock = model.clock(for: data.city.timeZone)
        let matches = Matcher.rank(data.hangouts, for: model.profile, clock: clock)
        let mine = data.hangouts.filter { model.isMember($0.id) }
        let visible = data.hangouts.filter { filter == nil || $0.vibe == filter }

        VStack(alignment: .leading, spacing: 0) {
            CityHero(city: data.city, people: data.peopleTonight)
                .padding(.top, Space.md)
                .plusReveal(trigger: .appear)

            VStack(alignment: .leading, spacing: Space.xs) {
                Text("Tonight in").type(.feature, size: 22).foregroundStyle(Palette.muted)
                Text(data.city.displayName).type(.hero).foregroundStyle(Palette.ink)
                    .accessibilityAddTraits(.isHeader)
                Label("\(clock.clock) \(clock.zoneAbbreviation) · \(clock.weekday)", systemImage: "clock")
                    .type(.label)
                    .foregroundStyle(Palette.muted)
                    .padding(.top, 2)
            }
            .padding(.top, Space.xl)
            .plusReveal(delay: PlusMotion.sequence[1], trigger: .appear)

            Text(CityCopy.blurb(data.city.slug))
                .type(.body)
                .foregroundStyle(Palette.ink)
                .fixedSize(horizontal: false, vertical: true)
                .padding(.top, Space.lg)
                .plusReveal(delay: PlusMotion.sequence[2], trigger: .appear)

            HStack(alignment: .firstTextBaseline, spacing: Space.xl) {
                stat(data.hangouts.count, "hangouts")
                stat(data.peopleTonight, "going")
                stat(spotCount, "spots")
            }
            .padding(.top, Space.lg)
            .plusReveal(delay: PlusMotion.sequence[3], trigger: .appear)

            Rule().padding(.vertical, Space.xl)

            if !mine.isEmpty {
                sectionTitle("Your plans tonight")
                VStack(spacing: Space.sm) {
                    ForEach(mine) { hangout in
                        NavigationLink(value: Route.hangout(hangout.id)) {
                            HangoutCard(hangout: hangout, clock: clock, isMine: true)
                        }
                        .buttonStyle(PressableStyle())
                    }
                }
                .padding(.bottom, Space.xxl)
            }

            if let best = matches.first(where: { !model.isMember($0.hangout.id) }) {
                sectionTitle("Best for you", subtitle: best.reasons.prefix(3).joined(separator: " · "))
                NavigationLink(value: Route.hangout(best.hangout.id)) {
                    HangoutCard(hangout: best.hangout, clock: clock, highlight: true)
                }
                .buttonStyle(PressableStyle())
                .accessibilityIdentifier("tonight.bestMatch")
                .padding(.bottom, Space.xxl)
            }

            sectionTitle("All hangouts", subtitle: "\(Pluralize.hangouts(data.hangouts.count)) open, sorted by time")
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: Space.xs) {
                    Chip(title: "Everything", count: data.hangouts.count, isSelected: filter == nil) {
                        withAnimation(Motion.glide) { filter = nil }
                    }
                    ForEach(Vibe.allCases) { vibe in
                        let count = data.hangouts.filter { $0.vibe == vibe }.count
                        if count > 0 {
                            Chip(title: vibe.label, count: count, isSelected: filter == vibe) {
                                withAnimation(Motion.glide) { filter = filter == vibe ? nil : vibe }
                            }
                            .accessibilityIdentifier("tonight.filter.\(vibe.rawValue)")
                        }
                    }
                }
                .padding(.horizontal, Space.page)
            }
            .padding(.horizontal, -Space.page)
            .padding(.bottom, Space.lg)
            .sensoryFeedback(.selection, trigger: filter)

            Timeline(hangouts: visible, clock: clock, isMine: model.isMember)

            StartCard { showStart = true }
                .padding(.top, Space.xxl)
                .plusReveal(trigger: .inView(threshold: 0))

            OSMAttribution()
                .frame(maxWidth: .infinity)
                .padding(.vertical, Space.xl)
        }
        .padding(.horizontal, Space.page)
    }

    private func stat(_ value: Int, _ label: String) -> some View {
        HStack(alignment: .firstTextBaseline, spacing: 5) {
            Text("\(value)").type(.stat).foregroundStyle(Palette.ink)
                .contentTransition(.numericText(value: Double(value)))
            Text(label).type(.label).foregroundStyle(Palette.muted)
        }
    }

    private func sectionTitle(_ title: String, subtitle: String? = nil) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(title).type(.cardTitle, size: 20).foregroundStyle(Palette.ink)
            if let subtitle {
                Text(subtitle).type(.body).foregroundStyle(Palette.muted)
            }
        }
        .padding(.bottom, Space.md)
        .accessibilityAddTraits(.isHeader)
    }
}

/// City artwork with the live counter badge.
struct CityHero: View {
    let city: City
    let people: Int

    var body: some View {
        Image(CityCopy.artwork(city.slug))
            .resizable()
            .scaledToFill()
            .frame(height: 196)
            .frame(maxWidth: .infinity)
            .clipShape(RoundedRectangle(cornerRadius: Radius.media, style: .continuous))
            .overlay(alignment: .bottomLeading) {
                LiveBadge(text: "\(people) going out tonight")
                    .padding(Space.sm)
            }
            .accessibilityElement()
            .accessibilityLabel("\(people) people going out in \(city.displayName) tonight")
    }
}

/// Hangouts grouped by part of the night, on a dotted rail (web city page).
private struct Timeline: View {
    let hangouts: [HangoutSummary]
    let clock: TonightClock
    let isMine: (String) -> Bool

    var body: some View {
        let groups = Dictionary(grouping: hangouts) { NightPart(hour: clock.hour($0.startsAt)) }
        VStack(alignment: .leading, spacing: 0) {
            if hangouts.isEmpty {
                Text("No hangouts with this vibe yet tonight. Start one and others can join.")
                    .type(.body)
                    .foregroundStyle(Palette.muted)
                    .padding(.vertical, Space.lg)
            }
            ForEach(NightPart.allCases) { part in
                if let items = groups[part]?.sorted(by: { $0.startsAt < $1.startsAt }), !items.isEmpty {
                    HStack(alignment: .firstTextBaseline, spacing: Space.sm) {
                        Circle().fill(Palette.ink).frame(width: 9, height: 9)
                        Text(part.title).type(.cardTitle).foregroundStyle(Palette.ink)
                        Text("from \(clock.time(items[0].startsAt))").type(.body).foregroundStyle(Palette.muted)
                    }
                    .padding(.bottom, Space.sm)
                    VStack(spacing: Space.sm) {
                        ForEach(items) { hangout in
                            NavigationLink(value: Route.hangout(hangout.id)) {
                                HangoutCard(hangout: hangout, clock: clock, isMine: isMine(hangout.id))
                            }
                            .buttonStyle(PressableStyle())
                            .plusReveal(y: PlusMotion.Distance.revealYSmall, trigger: .inView(threshold: 0))
                        }
                    }
                    .padding(.leading, Space.lg)
                    .overlay(alignment: .leading) {
                        Rectangle()
                            .fill(.clear)
                            .frame(width: 1)
                            .overlay(Line().stroke(Palette.line, style: StrokeStyle(lineWidth: 1, dash: [3, 3])))
                            .padding(.leading, 4)
                    }
                    .padding(.bottom, Space.xl)
                }
            }
        }
        .animation(Motion.glide, value: hangouts.map(\.id))
    }
}

nonisolated private struct Line: Shape {
    func path(in rect: CGRect) -> Path {
        var path = Path()
        path.move(to: CGPoint(x: rect.midX, y: rect.minY))
        path.addLine(to: CGPoint(x: rect.midX, y: rect.maxY))
        return path
    }
}

/// The card on city pages: time and vibe, title, spot, avatars with "x going", seats, artwork thumbnail.
struct HangoutCard: View {
    let hangout: HangoutSummary
    let clock: TonightClock
    var isMine = false
    var highlight = false

    var body: some View {
        HStack(alignment: .top, spacing: Space.md) {
            VStack(alignment: .leading, spacing: 6) {
                HStack(spacing: 6) {
                    Text(clock.time(hangout.startsAt)).type(.time).foregroundStyle(Palette.ink)
                    Text(hangout.vibe.label).type(.label).foregroundStyle(Palette.muted)
                }
                Text(hangout.displayTitle)
                    .type(.cardTitle, size: 18)
                    .foregroundStyle(Palette.ink)
                    .multilineTextAlignment(.leading)
                    .lineLimit(2)
                    .fixedSize(horizontal: false, vertical: true)
                Text("\(hangout.spot.name), \(hangout.place)")
                    .type(.body)
                    .foregroundStyle(Palette.muted)
                    .lineLimit(1)
                HStack(spacing: Space.xs) {
                    AvatarStack(names: hangout.names, total: hangout.memberCount, size: 22)
                    Text(Pluralize.going(hangout.memberCount)).type(.small).foregroundStyle(Palette.ink)
                    Spacer(minLength: 0)
                    if isMine {
                        Tag(text: "You're going", tone: .dark)
                    } else {
                        Tag(text: hangout.spotsLeft == 0 ? "Full" : Pluralize.seats(hangout.spotsLeft))
                    }
                }
                .padding(.top, 4)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            Image(hangout.spot.kind.artwork)
                .resizable()
                .scaledToFill()
                .frame(width: 76, height: 76)
                .clipShape(RoundedRectangle(cornerRadius: Radius.card, style: .continuous))
        }
        .padding(Space.md)
        .cardSurface(fill: Palette.white, stroke: highlight ? Palette.ink : Palette.line)
        .contentShape(Rectangle())
        .accessibilityElement(children: .combine)
        .accessibilityIdentifier("hangout.card")
    }
}

/// "Nothing fits? Start your own" (MVP: start a hangout in about 20 seconds).
private struct StartCard: View {
    let action: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: Space.sm) {
            BrandMark(color: Palette.nightInk)
                .frame(width: 28, height: 28)
            Text("Nothing fits? Start your own.")
                .type(.feature, size: 22)
                .foregroundStyle(Palette.nightInk)
            Text("Pick a curated spot, a time tonight and a vibe. You need two more people and the group happens.")
                .type(.body)
                .foregroundStyle(Palette.nightMuted)
                .fixedSize(horizontal: false, vertical: true)
            BrandButton("Start a hangout", kind: .onDark, height: 46, action: action)
                .padding(.top, Space.xs)
                .accessibilityIdentifier("tonight.start")
        }
        .padding(Space.lg)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Palette.night, in: RoundedRectangle(cornerRadius: Radius.media, style: .continuous))
    }
}
