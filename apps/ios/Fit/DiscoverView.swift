import MapKit
import SwiftUI

struct DiscoverView: View {
    let coordinate: CLLocationCoordinate2D?
    let kiez: String
    let showLocation: () -> Void

    private enum Ranking: CaseIterable {
        case health, protein, light

        var label: LocalizedStringResource {
            switch self {
            case .health: "Health Score"
            case .protein: "Protein"
            case .light: "Wenig kcal"
            }
        }
    }

    private let worker = Worker()
    @State private var dishes: [Dish] = []
    @State private var restaurants: [Restaurant] = []
    @State private var loadError = false
    @State private var loaded = false
    @State private var ranking = Ranking.health
    @State private var selectedRestaurant: Restaurant.ID?
    @State private var camera: MapCameraPosition = .automatic
    @State private var path: [String] = []
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    private var scope: DiscoveryScope {
        if coordinate != nil { return .berlin }
        return kiez.isEmpty ? .central : .kiez(kiez)
    }

    private var distances: [Restaurant.ID: Double] {
        guard let coordinate else { return [:] }
        return Dictionary(uniqueKeysWithValues: mapPlaces.compactMap { place in
            place.coordinate.map { (place.id, distanceBetween(coordinate, $0)) }
        })
    }

    private func rankedDishes(distances: [Restaurant.ID: Double]) -> [Dish] {
        let filtered = dishes.filter { selectedRestaurant == nil || $0.restaurant?.id == selectedRestaurant }
        return filtered.sorted { first, second in
            if coordinate != nil {
                let a = distanceBand(first, distances: distances)
                let b = distanceBand(second, distances: distances)
                if a != b { return a < b }
            }
            return switch ranking {
            case .health: (first.healthScore ?? 0) > (second.healthScore ?? 0)
            case .protein: first.nutrition.proteinG.value > second.nutrition.proteinG.value
            case .light: first.nutrition.kcal.value < second.nutrition.kcal.value
            }
        }
    }

    private func distanceBand(_ dish: Dish, distances: [Restaurant.ID: Double]) -> Int {
        guard let id = dish.restaurant?.id, let distance = distances[id] else { return .max }
        return Int(distance / 1_000)
    }

    private var mapPlaces: [Restaurant] {
        var ids = Set<Restaurant.ID>()
        let catalog = Dictionary(restaurants.map { ($0.id, $0) }, uniquingKeysWith: { first, _ in first })
        return dishes.compactMap { dish in
            guard let summary = dish.restaurant, ids.insert(summary.id).inserted else { return nil }
            return catalog[summary.id] ?? summary
        }
        .filter { $0.coordinate != nil }
    }

    var body: some View {
        NavigationStack(path: $path) { content }
    }

    private var content: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                ScreenHeader(eyebrow: Date.now.greeting, title: "Was isst du heute?")
                map
                if let id = selectedRestaurant, let place = mapPlaces.first(where: { $0.id == id }) {
                    Button {
                        withAnimation(.smooth(duration: 0.3)) { selectedRestaurant = nil }
                    } label: {
                        HStack(spacing: 8) {
                            Image(systemName: "fork.knife")
                            Text(place.name).lineLimit(1)
                            if let distance = distances[id] { Text(discoveryDistance(distance)) }
                            Image(systemName: "xmark").font(.caption.weight(.bold))
                        }
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(Palette.ctaInk)
                        .padding(.horizontal, 14)
                        .frame(minHeight: 40)
                        .background(Palette.cta, in: .capsule)
                    }
                    .buttonStyle(PressableStyle())
                    .accessibilityHint("Zeigt wieder alle Gerichte")
                    .transition(.blurReplace)
                }
                rankingList
            }
            .page()
            .padding(.top, 8)
            .padding(.bottom, 32)
        }
        .background(Palette.canvas.ignoresSafeArea())
        .toolbar(.hidden, for: .navigationBar)
        .navigationDestination(for: String.self) { id in
            if let dish = dishes.first(where: { $0.id == id }) {
                DishView(initialDish: dish, worker: worker, origin: coordinate)
            }
        }
        .task(id: scope) {
            if coordinate != nil { centreOnLocation() }
            if !loaded { await load(scope: scope) }
            if DemoScript.dish, path.isEmpty, let first = rankedDishes(distances: distances).first {
                try? await Task.sleep(for: .seconds(1.2))
                path = [first.id]
            }
        }
        .refreshable { await load(scope: scope) }
    }

    private var map: some View {
        Map(position: $camera, interactionModes: [.pan, .zoom], selection: $selectedRestaurant) {
            if let coordinate {
                Annotation("Dein Standort", coordinate: coordinate) {
                    Circle()
                        .fill(.blue)
                        .frame(width: 16, height: 16)
                        .overlay(Circle().strokeBorder(.white, lineWidth: 2))
                }
                .annotationTitles(.hidden)
            }
            ForEach(mapPlaces) { place in
                if let coordinate = place.coordinate {
                    Marker(place.name, systemImage: "fork.knife", coordinate: coordinate)
                        .tint(Palette.accent)
                        .tag(place.id)
                }
            }
        }
        .mapStyle(.standard(elevation: .flat, pointsOfInterest: .excludingAll, showsTraffic: false))
        .mapControls {}
        .frame(height: 260)
        .overlay(alignment: .topTrailing) {
            Button {
                if coordinate == nil { showLocation() }
                else { centreOnLocation() }
            } label: {
                Image(systemName: "scope")
                    .font(.body.weight(.semibold))
                    .foregroundStyle(Palette.ink)
                    .frame(width: 44, height: 44)
            }
            .glassEffect(.regular.interactive(), in: .circle)
            .padding(10)
            .accessibilityLabel(coordinate == nil ? Text("In meiner Nähe") : Text("Zu meinem Standort"))
            .accessibilityIdentifier("locateDiscoverMap")
        }
        .overlay(alignment: .topLeading) {
            if !mapPlaces.isEmpty {
                Text("\(mapPlaces.count) Restaurants")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(Palette.ink)
                    .padding(.horizontal, 10)
                    .padding(.vertical, 6)
                    .glassEffect(.regular, in: .capsule)
                    .padding(10)
            }
        }
        .clipShape(.rect(cornerRadius: 24))
        .fitCard(radius: 24)
    }

    private func centreOnLocation() {
        guard let coordinate else { return }
        withAnimation(reduceMotion ? nil : .smooth(duration: 0.4)) {
            selectedRestaurant = nil
            camera = .region(MKCoordinateRegion(center: coordinate, latitudinalMeters: 3_000, longitudinalMeters: 3_000))
        }
    }

    private var rankingList: some View {
        let distances = distances
        let rankedDishes = rankedDishes(distances: distances)
        return VStack(alignment: .leading, spacing: 12) {
            HStack(alignment: .center, spacing: 8) {
                VStack(alignment: .leading, spacing: 2) {
                    Text("Die besten Gerichte in Berlin")
                        .font(.title3.bold())
                        .tracking(-0.4)
                        .foregroundStyle(Palette.ink)
                        .accessibilityAddTraits(.isHeader)
                    if loaded, !dishes.isEmpty {
                        let goal = String(localized: ranking.label)
                        Text(coordinate == nil
                             ? LocalizedStringKey("\(rankedDishes.count) Gerichte · nach \(goal)")
                             : LocalizedStringKey("\(rankedDishes.count) Gerichte · nach 1-km-Stufen, dann nach \(goal)"))
                            .font(.footnote)
                            .foregroundStyle(Palette.muted)
                    }
                }
                Spacer(minLength: 0)
                Menu {
                    Picker("Sortierung", selection: $ranking.animation(.smooth(duration: 0.35))) {
                        ForEach(Ranking.allCases, id: \.self) { Text($0.label).tag($0) }
                    }
                } label: {
                    Image(systemName: "arrow.up.arrow.down")
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(Palette.ink)
                        .frame(width: 44, height: 44)
                        .background(Palette.surface, in: .circle)
                        .overlay(Circle().strokeBorder(Palette.rule))
                }
                .accessibilityLabel("Sortieren")
                .accessibilityValue(Text(ranking.label))
            }
            if loadError && dishes.isEmpty {
                ContentUnavailableView {
                    Label("Gerichte nicht geladen", systemImage: "wifi.slash")
                } description: {
                    Text("Prüfe die Verbindung und versuch es noch einmal.")
                } actions: {
                    Button("Erneut versuchen") { Task { await load(scope: scope) } }
                        .buttonStyle(SecondaryButtonStyle())
                        .frame(maxWidth: 220)
                }
                .fitCard()
            } else if !loaded {
                ForEach(0..<4, id: \.self) { _ in
                    DishRow.placeholder
                }
            } else if rankedDishes.isEmpty {
                ContentUnavailableView("Keine Gerichte gefunden", systemImage: "fork.knife")
                    .fitCard()
            } else {
                LazyVStack(spacing: 10) {
                    ForEach(Array(rankedDishes.enumerated()), id: \.element.id) { index, dish in
                        NavigationLink(value: dish.id) {
                            DishRow(dish: dish, rank: index + 1, distance: dish.restaurant.flatMap { distances[$0.id] })
                        }
                        .buttonStyle(PressableStyle())
                        .accessibilityIdentifier("catalogDish-\(index + 1)")
                    }
                }
            }
        }
    }

    private func load(scope: DiscoveryScope) async {
        async let catalogTask = worker.restaurants(scope: scope)
        do {
            let fresh = try await worker.dishes(scope: scope)
            guard !Task.isCancelled else { return }
            withAnimation(.smooth(duration: 0.35)) {
                dishes = fresh
                loaded = true
                loadError = false
            }
        } catch {
            if !Task.isCancelled {
                loaded = true
                loadError = true
            }
        }
        if let catalog = try? await catalogTask, !Task.isCancelled {
            restaurants = catalog
        }
    }
}

struct DishRow: View {
    let dish: Dish
    let rank: Int
    var distance: Double? = nil

    var body: some View {
        HStack(spacing: 12) {
            ArtTile(art: FoodArt(category: dish.category, name: dish.name))
                .frame(width: 72, height: 72)
                .clipShape(.rect(cornerRadius: 16))
                .overlay(alignment: .topLeading) {
                    Text(String(rank))
                        .font(.caption2.weight(.bold).monospacedDigit())
                        .foregroundStyle(.white)
                        .frame(minWidth: 20, minHeight: 20)
                        .background(Palette.cta, in: .circle)
                        .padding(5)
                        .accessibilityHidden(true)
                }
            VStack(alignment: .leading, spacing: 4) {
                Text(dish.displayName)
                    .font(.headline)
                    .tracking(-0.2)
                    .foregroundStyle(Palette.ink)
                    .lineLimit(2)
                    .multilineTextAlignment(.leading)
                if let restaurant = dish.restaurant {
                    Text("\(restaurant.name) · \(restaurant.kiezName)")
                        .font(.footnote)
                        .foregroundStyle(Palette.muted)
                        .lineLimit(1)
                }
                if let distance {
                    Text(discoveryDistance(distance))
                        .font(.footnote)
                        .foregroundStyle(Palette.muted)
                }
                HStack(spacing: 6) {
                    Chip(text: "\(dish.nutrition.proteinG.value.fitNumber) g Protein", tone: .accent)
                    Chip(text: "\(dish.nutrition.kcal.value.fitNumber) kcal", tone: .plain)
                    if let cents = dish.priceCents {
                        Text((Double(cents) / 100).fitPrice)
                            .font(.caption.weight(.semibold).monospacedDigit())
                            .foregroundStyle(Palette.muted)
                            .lineLimit(1)
                            .fixedSize()
                            .padding(.leading, 2)
                    }
                }
                .padding(.top, 2)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            if let score = dish.healthScore {
                ScoreBadge(score: score)
                    .frame(maxHeight: .infinity, alignment: .top)
            }
        }
        .padding(10)
        .frame(maxWidth: .infinity, alignment: .leading)
        .fitCard(radius: 22)
        .accessibilityElement(children: .combine)
    }

    static var placeholder: some View {
        HStack(spacing: 12) {
            RoundedRectangle(cornerRadius: 16).fill(Palette.track).frame(width: 72, height: 72)
            VStack(alignment: .leading, spacing: 8) {
                Capsule().fill(Palette.track).frame(width: 170, height: 13)
                Capsule().fill(Palette.track).frame(width: 110, height: 10)
                Capsule().fill(Palette.track).frame(width: 140, height: 18)
            }
            Spacer(minLength: 0)
        }
        .padding(10)
        .fitCard(radius: 22)
        .accessibilityHidden(true)
    }
}

struct Chip: View {
    enum Tone { case accent, plain }

    let text: String
    let tone: Tone

    var body: some View {
        Text(text)
            .font(.caption.weight(.medium).monospacedDigit())
            .foregroundStyle(tone == .accent ? Palette.accentSoftInk : Palette.ink)
            .padding(.horizontal, 8)
            .padding(.vertical, 4)
            .background(tone == .accent ? Palette.accentSoft : Palette.track, in: .rect(cornerRadius: 8))
            .lineLimit(1)
            .fixedSize()
    }
}

extension Restaurant {
    /// "prenzlauer-berg" -> "Prenzlauer Berg".
    var kiezName: String {
        kiez.split(separator: "-").map { $0.prefix(1).uppercased() + $0.dropFirst() }.joined(separator: " ")
    }
}

extension Date {
    var greeting: String {
        let hour = Diary.calendar.component(.hour, from: self)
        return switch hour {
        case 5..<11: "Guten Morgen"
        case 11..<17: "Guten Tag"
        default: "Guten Abend"
        }
    }
}
