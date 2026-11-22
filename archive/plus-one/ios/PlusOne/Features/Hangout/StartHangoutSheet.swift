import SwiftUI

/// Start a hangout in about 20 seconds (MVP item 4): a curated spot, a time tonight, a vibe, a size and a language.
struct StartHangoutSheet: View {
    let city: City
    var preselectedSpotID: String?

    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss
    @State private var spots: [Spot] = []
    @State private var spotID: String?
    @State private var startsAt: Date?
    @State private var vibe: Vibe = .chill
    @State private var maxSize = 6
    @State private var language: HangoutLanguage = .en
    @State private var creating = false
    @State private var error: String?
    @State private var search = ""

    private var clock: TonightClock { model.clock(for: city.timeZone) }

    /// Half-hour slots from the next half hour until 02:00.
    private var slots: [Date] {
        let now = clock.now
        var slots: [Date] = []
        var cursor = clock.at(hour: 17)
        let end = clock.at(hour: 2)
        while cursor <= end {
            if cursor > now.addingTimeInterval(15 * 60) { slots.append(cursor) }
            cursor = cursor.addingTimeInterval(30 * 60)
        }
        return slots
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: Space.xl) {
                    section("Where", "Only curated public spots. No private addresses.") {
                        VStack(spacing: Space.xs) {
                            ForEach(filteredSpots.prefix(30)) { spot in
                                let selected = spotID == spot.id
                                Button {
                                    withAnimation(Motion.interaction) {
                                        spotID = spot.id
                                        if let first = spot.vibes.first { vibe = first }
                                    }
                                } label: {
                                    HStack(spacing: Space.sm) {
                                        Image(spot.kind.artwork).resizable().scaledToFill()
                                            .frame(width: 40, height: 40)
                                            .clipShape(RoundedRectangle(cornerRadius: Radius.control + 2, style: .continuous))
                                        VStack(alignment: .leading, spacing: 1) {
                                            Text(spot.name).type(.cardTitle, size: 16)
                                            Text("\(spot.kind.label) · \(spot.place)").type(.label)
                                                .foregroundStyle(selected ? Palette.nightMuted : Palette.muted)
                                        }
                                        Spacer()
                                        if selected { Image(systemName: "checkmark").font(.system(size: 14, weight: .semibold)) }
                                    }
                                    .foregroundStyle(selected ? Palette.canvas : Palette.ink)
                                    .padding(Space.xs)
                                    .background(selected ? Palette.night : Palette.white,
                                                in: RoundedRectangle(cornerRadius: Radius.card, style: .continuous))
                                    .overlay(RoundedRectangle(cornerRadius: Radius.card, style: .continuous)
                                        .strokeBorder(selected ? Palette.night : Palette.line, lineWidth: 1))
                                }
                                .buttonStyle(PressableStyle())
                            }
                        }
                    }

                    section("When", "Tonight, in \(city.displayName) time.") {
                        ScrollView(.horizontal, showsIndicators: false) {
                            HStack(spacing: Space.xs) {
                                ForEach(slots, id: \.self) { slot in
                                    Chip(title: clock.time(slot), isSelected: startsAt == slot) { startsAt = slot }
                                }
                            }
                            .padding(.horizontal, Space.page + 4)
                        }
                        .padding(.horizontal, -(Space.page + 4))
                    }

                    section("Vibe", nil) {
                        FlowLayout(spacing: Space.xs, rowSpacing: Space.xs) {
                            ForEach(Vibe.allCases) { option in
                                Chip(title: option.label, systemImage: option.symbol, isSelected: vibe == option) { vibe = option }
                            }
                        }
                    }

                    section("Seats", "\(maxSize) people including you. Never fewer than 3.") {
                        HStack(spacing: Space.md) {
                            SeatMeter(taken: 1, total: maxSize, highlightNext: true)
                                .animation(Motion.glide, value: maxSize)
                            Stepper("Seats", value: $maxSize, in: ContractLimits.minGroupSize...ContractLimits.maxGroupSize)
                                .labelsHidden()
                        }
                    }

                    section("Language", nil) {
                        FlowLayout(spacing: Space.xs, rowSpacing: Space.xs) {
                            ForEach(HangoutLanguage.allCases) { option in
                                Chip(title: option.label, isSelected: language == option) { language = option }
                            }
                        }
                    }

                    if let error {
                        Text(error).type(.body).foregroundStyle(Palette.ink)
                    }
                }
                .padding(.horizontal, Space.page + 4)
                .padding(.vertical, Space.lg)
            }
            .searchable(text: $search, prompt: "Search spots")
            .safeAreaInset(edge: .bottom) {
                Button {
                    Task { await create() }
                } label: {
                    if creating { ProgressView().tint(Palette.canvas) } else { Text("Start hangout") }
                }
                .buttonStyle(.brandPrimary)
                .disabled(spotID == nil || startsAt == nil || creating)
                .padding(.horizontal, Space.page + 4)
                .padding(.top, Space.sm)
                .background(Palette.canvas)
            }
            .background(Palette.canvas)
            .navigationTitle("Start a hangout")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) { Button("Cancel") { dismiss() } }
            }
        }
        .task {
            spots = (try? await model.api.spots(citySlug: city.slug, vibe: nil, kind: nil).spots) ?? []
            spotID = preselectedSpotID
            maxSize = model.profile.groupSize.hostDefault
            language = model.profile.languages.first ?? .en
            vibe = model.profile.vibes.first ?? .chill
            startsAt = slots.first
        }
    }

    private var filteredSpots: [Spot] {
        let query = search.trimmingCharacters(in: .whitespaces).lowercased()
        let list = query.isEmpty ? spots : spots.filter { $0.name.lowercased().contains(query) || $0.place.lowercased().contains(query) }
        guard let spotID, let selected = list.first(where: { $0.id == spotID }) else { return list }
        return [selected] + list.filter { $0.id != spotID }
    }

    private func section(_ title: String, _ subtitle: String?, @ViewBuilder content: () -> some View) -> some View {
        VStack(alignment: .leading, spacing: Space.sm) {
            VStack(alignment: .leading, spacing: 2) {
                Text(title).type(.cardTitle, size: 20).foregroundStyle(Palette.ink)
                if let subtitle { Text(subtitle).type(.body).foregroundStyle(Palette.muted) }
            }
            content()
        }
    }

    private func create() async {
        guard let spotID, let startsAt else { return }
        creating = true
        defer { creating = false }
        do {
            let request = CreateHangoutRequest(citySlug: city.slug, spotId: spotID, startsAt: startsAt, vibe: vibe,
                                               maxSize: maxSize, language: language,
                                               host: JoinProfile(nickname: model.profile.nickname, about: model.profile.aboutLine))
            let response = try await model.create(request, timeZone: city.timeZone)
            dismiss()
            model.selectedTab = .tonight
            model.tonightPath = [.hangout(response.hangout.id)]
        } catch {
            self.error = error.localizedDescription
        }
    }
}
