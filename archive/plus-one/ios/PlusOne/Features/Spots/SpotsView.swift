import MapKit
import SwiftUI

/// Spots (Resy structure): map with pins on top, filter chips, large cards with name, type, neighborhood and a
/// save heart. Curated from OpenStreetMap: no paid placements and no ratings.
struct SpotsView: View {
    @Environment(AppModel.self) private var model
    @State private var response: ListSpotsResponse?
    @State private var tonight: [HangoutSummary] = []
    @State private var error: String?
    @State private var kind: SpotKind?
    @State private var selectedID: String?
    @State private var camera: MapCameraPosition = .automatic
    @State private var savedOnly = false

    var body: some View {
        VStack(spacing: 0) {
            BrandTopBar {
                Button {
                    model.selectedTab = .tonight
                } label: {
                    Text("Tonight's plans")
                }
                .buttonStyle(QuietButtonStyle())
            }
            if let response {
                content(response)
            } else if let error {
                ErrorStateView(message: error) { Task { await load() } }
                Spacer()
            } else {
                LoadingView()
                Spacer()
            }
        }
        .background(Palette.canvas)
        .toolbar(.hidden, for: .navigationBar)
        .task(id: model.profile.citySlug) { await load() }
    }

    private var filtered: [Spot] {
        (response?.spots ?? []).filter { spot in
            (kind == nil || spot.kind == kind) && (!savedOnly || model.isSaved(spot.id))
        }
    }

    private func load() async {
        do {
            async let spots = model.api.spots(citySlug: model.profile.citySlug, vibe: nil, kind: nil)
            async let city = model.api.cityTonight(slug: model.profile.citySlug)
            let (spotsResponse, cityResponse) = try await (spots, city)
            response = spotsResponse
            tonight = cityResponse.hangouts
            selectedID = nil
            camera = .region(region(for: spotsResponse.spots, city: spotsResponse.city))
            error = nil
        } catch {
            self.error = error.localizedDescription
        }
    }

    private func region(for spots: [Spot], city: City) -> MKCoordinateRegion {
        guard !spots.isEmpty else {
            return MKCoordinateRegion(center: CLLocationCoordinate2D(latitude: city.lat ?? 52.52, longitude: city.lng ?? 13.405),
                                      span: MKCoordinateSpan(latitudeDelta: 0.12, longitudeDelta: 0.12))
        }
        let lats = spots.map(\.lat), lngs = spots.map(\.lng)
        let center = CLLocationCoordinate2D(latitude: (lats.min()! + lats.max()!) / 2, longitude: (lngs.min()! + lngs.max()!) / 2)
        let span = MKCoordinateSpan(latitudeDelta: (lats.max()! - lats.min()!) * 1.25 + 0.01,
                                    longitudeDelta: (lngs.max()! - lngs.min()!) * 1.25 + 0.01)
        return MKCoordinateRegion(center: center, span: span)
    }

    @ViewBuilder
    private func content(_ response: ListSpotsResponse) -> some View {
        ScrollViewReader { proxy in
            VStack(spacing: 0) {
                map(response)
                    .frame(height: 280)
                    .overlay(alignment: .bottom) { Rule() }
                ScrollView {
                    VStack(alignment: .leading, spacing: 0) {
                        Text("Spots in \(response.city.displayName)")
                            .type(.title, size: 28)
                            .foregroundStyle(Palette.ink)
                            .padding(.top, Space.xl)
                            .accessibilityAddTraits(.isHeader)
                        Text("Public places where hangouts meet. Curated from OpenStreetMap, no paid placements and no star ratings.")
                            .type(.body)
                            .foregroundStyle(Palette.muted)
                            .fixedSize(horizontal: false, vertical: true)
                            .padding(.top, Space.xs)

                        chips(response.spots)
                            .padding(.vertical, Space.lg)

                        LazyVStack(spacing: Space.xl) {
                            ForEach(filtered) { spot in
                                SpotCard(spot: spot,
                                         hangoutsTonight: tonight.filter { $0.spotId == spot.id }.count,
                                         isSelected: selectedID == spot.id,
                                         isSaved: model.isSaved(spot.id),
                                         toggleSaved: { model.toggleSaved(spot.id) },
                                         locate: { select(spot) })
                                    .id(spot.id)
                                    .plusReveal(trigger: .inView(threshold: 0))
                            }
                            if filtered.isEmpty {
                                Text(savedOnly ? "Tap the heart on a spot to save it here." : "No spots of this kind in this city yet.")
                                    .type(.body)
                                    .foregroundStyle(Palette.muted)
                                    .padding(.vertical, Space.xl)
                            }
                        }

                        OSMAttribution()
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, Space.xl)
                    }
                    .padding(.horizontal, Space.page)
                }
                .onChange(of: selectedID) { _, id in
                    guard let id else { return }
                    withAnimation(Motion.glide) { proxy.scrollTo(id, anchor: .top) }
                }
            }
        }
    }

    private func select(_ spot: Spot) {
        selectedID = spot.id
        withAnimation(Motion.mapEase) {
            camera = .region(MKCoordinateRegion(center: CLLocationCoordinate2D(latitude: spot.lat, longitude: spot.lng),
                                                span: MKCoordinateSpan(latitudeDelta: 0.02, longitudeDelta: 0.02)))
        }
    }

    private func map(_ response: ListSpotsResponse) -> some View {
        Map(position: $camera, selection: $selectedID) {
            ForEach(filtered) { spot in
                Annotation(spot.name, coordinate: CLLocationCoordinate2D(latitude: spot.lat, longitude: spot.lng), anchor: .center) {
                    SpotPin(isSelected: selectedID == spot.id, name: spot.name)
                }
                .annotationTitles(.hidden)
                .tag(spot.id)
            }
        }
        .mapStyle(.standard(elevation: .flat, pointsOfInterest: .excludingAll, showsTraffic: false))
        .mapControls { MapCompass() }
        .onChange(of: selectedID) { _, id in
            if let id, let spot = response.spots.first(where: { $0.id == id }) {
                withAnimation(Motion.mapEase) {
                    camera = .region(MKCoordinateRegion(center: CLLocationCoordinate2D(latitude: spot.lat, longitude: spot.lng),
                                                        span: MKCoordinateSpan(latitudeDelta: 0.03, longitudeDelta: 0.03)))
                }
            }
        }
        .sensoryFeedback(.selection, trigger: selectedID)
        .accessibilityLabel("Map of spots in \(response.city.displayName)")
    }

    private func chips(_ spots: [Spot]) -> some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: Space.xs) {
                Chip(title: "All", count: spots.count, isSelected: kind == nil && !savedOnly) {
                    withAnimation(Motion.glide) { kind = nil; savedOnly = false }
                }
                ForEach(SpotKind.allCases) { option in
                    let count = spots.filter { $0.kind == option }.count
                    if count > 0 {
                        Chip(title: option.plural, count: count, isSelected: kind == option) {
                            withAnimation(Motion.glide) { kind = kind == option ? nil : option; savedOnly = false }
                        }
                        .accessibilityIdentifier("spots.filter.\(option.rawValue)")
                    }
                }
                Chip(title: "Saved", count: spots.filter { model.isSaved($0.id) }.count, systemImage: "heart",
                     isSelected: savedOnly) {
                    withAnimation(Motion.glide) { savedOnly.toggle(); kind = nil }
                }
            }
            .padding(.horizontal, Space.page)
        }
        .padding(.horizontal, -Space.page)
        .sensoryFeedback(.selection, trigger: kind)
    }
}

/// Black dot pin; the selected one grows and shows its name.
private struct SpotPin: View {
    let isSelected: Bool
    let name: String

    var body: some View {
        VStack(spacing: 4) {
            Circle()
                .fill(Palette.night)
                .frame(width: isSelected ? 22 : 14, height: isSelected ? 22 : 14)
                .overlay(Circle().strokeBorder(Palette.white, lineWidth: isSelected ? 3 : 2))
                .overlay {
                    if isSelected { Circle().fill(Palette.periwinkle).frame(width: 6, height: 6) }
                }
            if isSelected {
                Text(name)
                    .type(.label)
                    .foregroundStyle(Palette.ink)
                    .padding(.horizontal, 6)
                    .padding(.vertical, 2)
                    .background(Palette.white, in: RoundedRectangle(cornerRadius: Radius.control))
                    .overlay(RoundedRectangle(cornerRadius: Radius.control).strokeBorder(Palette.line, lineWidth: 1))
                    .fixedSize()
                    .transition(.scale(scale: 0.6, anchor: .top).combined(with: .opacity))
            }
        }
        .animation(Motion.pop, value: isSelected)
    }
}

/// Large spot card (Resy): artwork with a save heart, name, type and neighborhood, OSM description and hours.
struct SpotCard: View {
    let spot: Spot
    var hangoutsTonight = 0
    var isSelected = false
    let isSaved: Bool
    let toggleSaved: () -> Void
    var locate: (() -> Void)?

    var body: some View {
        VStack(alignment: .leading, spacing: Space.sm) {
            NavigationLink(value: Route.spot(spot.id)) {
                Image(spot.kind.artwork)
                    .resizable()
                    .scaledToFill()
                    .frame(height: 210)
                    .frame(maxWidth: .infinity)
                    .clipShape(RoundedRectangle(cornerRadius: Radius.media, style: .continuous))
                    .overlay {
                        RoundedRectangle(cornerRadius: Radius.media, style: .continuous)
                            .strokeBorder(isSelected ? Palette.ink : .clear, lineWidth: 2)
                    }
            }
            .buttonStyle(PressableStyle())
            .overlay(alignment: .topTrailing) {
                SaveHeart(isSaved: isSaved, action: toggleSaved).padding(Space.sm)
            }
            .overlay(alignment: .bottomLeading) {
                if hangoutsTonight > 0 {
                    LiveBadge(text: hangoutsTonight == 1 ? "1 hangout tonight" : "\(hangoutsTonight) hangouts tonight")
                        .padding(Space.sm)
                }
            }

            HStack(alignment: .top) {
                VStack(alignment: .leading, spacing: 3) {
                    Text(spot.name).type(.cardTitle, size: 20).foregroundStyle(Palette.ink)
                    Text([spot.kind.label, spot.place].filter { !$0.isEmpty }.joined(separator: " · "))
                        .type(.label)
                        .foregroundStyle(Palette.muted)
                }
                Spacer()
                if let locate {
                    Button(action: locate) {
                        Image(systemName: "scope")
                            .font(.system(size: 15))
                            .foregroundStyle(Palette.ink)
                            .frame(width: 36, height: 36)
                            .cardSurface(fill: Palette.surface, radius: Radius.control)
                    }
                    .accessibilityLabel("Show \(spot.name) on the map")
                }
            }
            if let summary = spot.summary {
                Text(summary).type(.body).foregroundStyle(Palette.ink)
                    .fixedSize(horizontal: false, vertical: true)
            }
            if let hours = spot.openingHours {
                Label(hours, systemImage: "clock")
                    .type(.label)
                    .foregroundStyle(Palette.muted)
                    .lineLimit(1)
            }
        }
        .accessibilityIdentifier("spot.card")
    }
}

struct SaveHeart: View {
    let isSaved: Bool
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Image(systemName: isSaved ? "heart.fill" : "heart")
                .font(.system(size: 16, weight: .medium))
                .foregroundStyle(Palette.ink)
                .contentTransition(.symbolEffect(.replace))
                .symbolEffect(.bounce, value: isSaved)
                .frame(width: 40, height: 40)
                .background(Palette.white, in: Circle())
                .overlay(Circle().strokeBorder(Palette.line, lineWidth: 1))
        }
        .sensoryFeedback(.impact(weight: .light), trigger: isSaved)
        .accessibilityLabel(isSaved ? "Saved" : "Save spot")
        .accessibilityAddTraits(isSaved ? .isSelected : [])
    }
}
