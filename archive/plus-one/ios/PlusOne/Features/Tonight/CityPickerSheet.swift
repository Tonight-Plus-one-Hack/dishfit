import SwiftUI

/// Discover-style city picker (Luma): artwork, name, country and tonight's live counts.
struct CityPickerSheet: View {
    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss
    @State private var cities: [CityListItem] = []
    @State private var error: String?

    var body: some View {
        VStack(spacing: 0) {
            Capsule().fill(Palette.line).frame(width: 36, height: 5).padding(.top, Space.xs)
            ScrollView {
                VStack(spacing: Space.xs) {
                    Eyebrow(text: "Discover")
                        .padding(.top, Space.xl)
                    Text("Choose your city")
                        .type(.title)
                        .foregroundStyle(Palette.ink)
                    Text("Small groups are meeting tonight in \(cities.count) cities. Pick yours to see who is going out and where.")
                        .type(.body)
                        .foregroundStyle(Palette.muted)
                        .multilineTextAlignment(.center)
                        .padding(.horizontal, Space.md)
                        .padding(.bottom, Space.xl)

                    if cities.isEmpty {
                        if let error { ErrorStateView(message: error) { Task { await load() } } } else { LoadingView() }
                    }
                    ForEach(cities) { city in
                        row(city)
                    }
                }
                .padding(.horizontal, Space.page)
                .padding(.bottom, Space.xl)
            }
        }
        .background(Palette.canvas)
        .task { await load() }
    }

    private func load() async {
        do {
            let response = try await model.api.cities()
            withAnimation(Motion.reveal) { cities = response.cities }
        } catch {
            self.error = error.localizedDescription
        }
    }

    private func row(_ city: CityListItem) -> some View {
        let selected = city.slug == model.profile.citySlug
        return Button {
            model.profile.citySlug = city.slug
            model.tonightPath = []
            dismiss()
        } label: {
            HStack(spacing: Space.md) {
                Image(CityCopy.artwork(city.slug))
                    .resizable()
                    .scaledToFill()
                    .frame(width: 72, height: 72)
                    .clipShape(RoundedRectangle(cornerRadius: Radius.card, style: .continuous))
                VStack(alignment: .leading, spacing: 4) {
                    Text(city.city.displayName).type(.cardTitle, size: 19).foregroundStyle(Palette.ink)
                    Text(CityCopy.country(city.countryCode)).type(.body).foregroundStyle(Palette.muted)
                    Text("\(Pluralize.hangouts(city.openHangouts)) · \(Pluralize.going(city.peopleTonight))")
                        .type(.label)
                        .foregroundStyle(Palette.ink)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                if selected {
                    Image(systemName: "checkmark")
                        .font(.system(size: 15, weight: .semibold))
                        .foregroundStyle(Palette.ink)
                }
            }
            .padding(Space.sm)
            .cardSurface(fill: selected ? Palette.surface : Palette.white, stroke: selected ? Palette.ink : Palette.line)
            .contentShape(Rectangle())
        }
        .buttonStyle(PressableStyle())
        .accessibilityIdentifier("cityPicker.\(city.slug)")
        .accessibilityAddTraits(selected ? .isSelected : [])
    }
}
