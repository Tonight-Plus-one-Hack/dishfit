import CoreLocation
import SwiftUI

struct DishView: View {
    let initialDish: Dish
    let worker: Worker
    var origin: CLLocationCoordinate2D? = nil

    @Environment(Diary.self) private var diary
    @State private var detail: DishDetail?
    @State private var confirmations: Confirmations?
    @State private var logged = false

    private var dish: Dish { detail?.dish ?? initialDish }
    private var restaurant: Restaurant? { detail?.restaurant ?? initialDish.restaurant }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                artwork
                VStack(alignment: .leading, spacing: 6) {
                    HStack(alignment: .firstTextBaseline, spacing: 12) {
                        Text(dish.displayName)
                            .font(.title.bold())
                            .tracking(-0.7)
                            .foregroundStyle(Palette.ink)
                            .accessibilityAddTraits(.isHeader)
                        Spacer(minLength: 0)
                        if let cents = dish.priceCents {
                            Text((Double(cents) / 100).fitPrice)
                                .font(.title3.weight(.semibold).monospacedDigit())
                                .foregroundStyle(Palette.ink)
                        }
                    }
                    if let restaurant {
                        let distance = origin.flatMap { origin in restaurant.coordinate.map { distanceBetween(origin, $0) } }
                        let place = [restaurant.name, restaurant.kiezName, distance.map(discoveryDistance)].compactMap { $0 }.joined(separator: " · ")
                        Label(place, systemImage: "mappin")
                            .font(.subheadline)
                            .foregroundStyle(Palette.muted)
                    }
                    if let description = dish.description, !description.isEmpty {
                        Text(description)
                            .font(.subheadline)
                            .foregroundStyle(Palette.ink.opacity(0.85))
                            .padding(.top, 4)
                    }
                }
                energy
                MacroRingTiles(macros: dish.nutrition.macros, targets: nil)
                if let score = dish.healthScore {
                    scoreCard(score)
                }
                if !dish.nutrition.method.isEmpty {
                    DisclosureGroup {
                        Text(dish.nutrition.method)
                            .font(.subheadline)
                            .foregroundStyle(Palette.muted)
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .padding(.top, 8)
                    } label: {
                        Label("So wurden die Werte berechnet", systemImage: "function")
                            .font(.subheadline.weight(.semibold))
                            .foregroundStyle(Palette.ink)
                    }
                    .tint(Palette.muted)
                    .padding(16)
                    .fitCard(radius: 20)
                }
                if let confirmations, confirmations.yes + confirmations.no > 0 {
                    Label(confirmations.yes == 1 ? "1 Bestätigung aus der Community" : "\(confirmations.yes) Bestätigungen aus der Community",
                          systemImage: "person.2.fill")
                        .font(.footnote)
                        .foregroundStyle(Palette.muted)
                        .padding(.horizontal, 4)
                }
            }
            .page()
            .padding(.top, 4)
            .padding(.bottom, 24)
        }
        .background(Palette.canvas.ignoresSafeArea())
        .navigationTitle(dish.displayName)
        .navigationBarTitleDisplayMode(.inline)
        .toolbar(.hidden, for: .tabBar)
        .safeAreaInset(edge: .bottom, spacing: 0) {
            Button {
                diary.add(name: dish.displayName, place: restaurant?.name ?? "", macros: dish.nutrition.macros)
                withAnimation(.smooth(duration: 0.3)) { logged = true }
            } label: {
                Label(logged ? "In Heute eingetragen" : "Zu Heute hinzufügen", systemImage: logged ? "checkmark" : "plus")
                    .contentTransition(.symbolEffect(.replace))
            }
            .buttonStyle(PrimaryButtonStyle())
            .disabled(logged)
            .accessibilityIdentifier("logCatalogDish")
            .sensoryFeedback(.success, trigger: logged)
            .page()
            .padding(.vertical, 10)
        }
        .task(id: initialDish.id) {
            async let count = worker.confirmations(initialDish.id)
            detail = try? await worker.detail(initialDish.id)
            confirmations = try? await count
        }
    }

    /// The Worker's AI photo when it exists (labelled as such), otherwise the clay art.
    private var artwork: some View {
        Color.clear
            .frame(height: 250)
            .overlay {
                let clay = ArtTile(art: FoodArt(category: dish.category, name: dish.name), inset: 0.2)
                if let url = dish.image.flatMap(worker.imageURL) {
                    AsyncImage(url: url, transaction: Transaction(animation: .smooth(duration: 0.35))) { phase in
                        if let image = phase.image {
                            image.resizable().scaledToFill()
                                .accessibilityHidden(true)
                                .overlay(alignment: .bottomLeading) {
                                    Text("KI-Bild")
                                        .font(.caption2.weight(.semibold))
                                        .foregroundStyle(Palette.ink)
                                        .padding(.horizontal, 9)
                                        .padding(.vertical, 5)
                                        .glassEffect(.regular, in: .capsule)
                                        .padding(12)
                                }
                        } else {
                            clay
                        }
                    }
                } else {
                    clay
                }
            }
            .clipShape(.rect(cornerRadius: 26))
    }

    private var energy: some View {
        let share = dish.nutrition.kcal.value / max(diary.goals.kcal, 1)
        return HStack(spacing: 16) {
            VStack(alignment: .leading, spacing: 4) {
                HStack(alignment: .firstTextBaseline, spacing: 4) {
                    Text(dish.nutrition.kcal.value.fitNumber)
                        .font(.system(size: 44, weight: .bold).monospacedDigit())
                        .tracking(-1.5)
                    Text("kcal").font(.title3.weight(.semibold))
                }
                .foregroundStyle(Palette.ink)
                Text(dish.nutrition.source == "official"
                     ? "Angabe des Restaurants"
                     : "KI-Schätzung · \(dish.nutrition.kcal.min.fitNumber)–\(dish.nutrition.kcal.max.fitNumber) kcal")
                    .font(.footnote)
                    .foregroundStyle(Palette.muted)
                Text("\((share * 100).fitNumber) % deines Tagesziels")
                    .font(.footnote.weight(.semibold))
                    .foregroundStyle(Palette.ink)
                    .padding(.top, 4)
            }
            Spacer(minLength: 0)
            ZStack {
                ProgressRing(progress: share, color: Palette.kcal, lineWidth: 9)
                Image("MacroKcal").resizable().scaledToFit().frame(width: 28, height: 28)
            }
            .frame(width: 92, height: 92)
        }
        .padding(18)
        .fitCard(radius: 22)
        .accessibilityElement(children: .combine)
    }

    private func scoreCard(_ score: Double) -> some View {
        HStack(spacing: 14) {
            ScoreBadge(score: score, size: 52)
            VStack(alignment: .leading, spacing: 3) {
                Text("Health Score")
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(Palette.ink)
                Text(scoreLine(score))
                    .font(.footnote)
                    .foregroundStyle(Palette.muted)
            }
            Spacer(minLength: 0)
        }
        .padding(14)
        .fitCard(radius: 20)
    }

    private func scoreLine(_ score: Double) -> String {
        switch score {
        case 85...: "Viel Protein, ausgewogene Energie. Eine sehr gute Wahl."
        case 65..<85: "Solide Wahl mit gutem Verhältnis von Protein zu Kalorien."
        default: "Eher ein Genussgericht. Passt an Tagen mit Spielraum."
        }
    }
}
