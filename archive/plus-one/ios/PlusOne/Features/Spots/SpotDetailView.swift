import MapKit
import SwiftUI

struct SpotDetailView: View {
    let spotID: String
    @Environment(AppModel.self) private var model
    @State private var spot: Spot?
    @State private var city: City?
    @State private var hangouts: [HangoutSummary] = []
    @State private var error: String?
    @State private var showStart = false

    var body: some View {
        Group {
            if let spot, let city {
                content(spot, city: city)
            } else if let error {
                ErrorStateView(message: error) { Task { await load() } }
            } else {
                LoadingView()
            }
        }
        .background(Palette.canvas)
        .navigationBarTitleDisplayMode(.inline)
        .task { await load() }
        .sheet(isPresented: $showStart, onDismiss: { Task { await load() } }) {
            if let city, let spot { StartHangoutSheet(city: city, preselectedSpotID: spot.id) }
        }
    }

    private func load() async {
        do {
            let spot = try await model.api.spot(id: spotID).spot
            let tonight = try await model.api.cityTonight(slug: spot.citySlug)
            self.spot = spot
            city = tonight.city
            hangouts = tonight.hangouts.filter { $0.spotId == spot.id }
            error = nil
        } catch {
            self.error = error.localizedDescription
        }
    }

    private func content(_ spot: Spot, city: City) -> some View {
        let clock = model.clock(for: city.timeZone)
        return ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                Image(spot.kind.artwork)
                    .resizable()
                    .scaledToFill()
                    .frame(height: 240)
                    .frame(maxWidth: .infinity)
                    .clipShape(RoundedRectangle(cornerRadius: Radius.media, style: .continuous))
                    .overlay(alignment: .topTrailing) {
                        SaveHeart(isSaved: model.isSaved(spot.id)) { model.toggleSaved(spot.id) }.padding(Space.sm)
                    }
                    .padding(.top, Space.xs)

                Text(spot.name)
                    .type(.title, size: 30)
                    .foregroundStyle(Palette.ink)
                    .padding(.top, Space.lg)
                    .accessibilityAddTraits(.isHeader)
                Text([spot.kind.label, spot.place, city.displayName].filter { !$0.isEmpty }.joined(separator: " · "))
                    .type(.label)
                    .foregroundStyle(Palette.muted)
                    .padding(.top, Space.xxs)

                if let summary = spot.summary {
                    Text(summary).type(.lede).foregroundStyle(Palette.ink)
                        .fixedSize(horizontal: false, vertical: true)
                        .padding(.top, Space.md)
                }

                FlowLayout(spacing: 6, rowSpacing: 6) {
                    ForEach(spot.vibes) { vibe in Tag(text: vibe.label, tone: .outline) }
                }
                .padding(.top, Space.md)

                VStack(alignment: .leading, spacing: Space.md) {
                    if let address = spot.address {
                        infoRow("mappin.and.ellipse", "Address", address)
                    }
                    if let hours = spot.openingHours {
                        infoRow("clock", "Opening hours (from OpenStreetMap)", hours)
                    }
                    if let website = spot.website, let url = URL(string: website) {
                        Link(destination: url) {
                            infoRow("globe", "Website", url.host() ?? website)
                        }
                    }
                }
                .padding(.top, Space.xl)

                Map(initialPosition: .region(MKCoordinateRegion(
                    center: CLLocationCoordinate2D(latitude: spot.lat, longitude: spot.lng),
                    span: MKCoordinateSpan(latitudeDelta: 0.008, longitudeDelta: 0.008)
                )), interactionModes: []) {
                    Annotation(spot.name, coordinate: CLLocationCoordinate2D(latitude: spot.lat, longitude: spot.lng)) {
                        Circle().fill(Palette.night).frame(width: 18, height: 18)
                            .overlay(Circle().strokeBorder(Palette.white, lineWidth: 3))
                    }
                    .annotationTitles(.hidden)
                }
                .mapStyle(.standard(pointsOfInterest: .excludingAll))
                .frame(height: 160)
                .clipShape(RoundedRectangle(cornerRadius: Radius.card, style: .continuous))
                .overlay(RoundedRectangle(cornerRadius: Radius.card, style: .continuous).strokeBorder(Palette.line, lineWidth: 1))
                .padding(.top, Space.xl)

                Rule().padding(.vertical, Space.xl)

                Text(hangouts.isEmpty ? "No hangout here yet tonight" : "Tonight at \(spot.name)")
                    .type(.cardTitle, size: 20)
                    .foregroundStyle(Palette.ink)
                    .padding(.bottom, Space.md)
                VStack(spacing: Space.sm) {
                    ForEach(hangouts) { hangout in
                        NavigationLink(value: Route.hangout(hangout.id)) {
                            HangoutCard(hangout: hangout, clock: clock, isMine: model.isMember(hangout.id))
                        }
                        .buttonStyle(PressableStyle())
                    }
                }
                BrandButton("Start a hangout here", kind: hangouts.isEmpty ? .primary : .secondary) { showStart = true }
                    .padding(.top, Space.md)

                OSMAttribution()
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, Space.xl)
            }
            .padding(.horizontal, Space.page)
        }
    }

    private func infoRow(_ symbol: String, _ title: String, _ value: String) -> some View {
        HStack(alignment: .top, spacing: Space.md) {
            IconBadge(systemImage: symbol, size: 36)
            VStack(alignment: .leading, spacing: 2) {
                Text(title).type(.label).foregroundStyle(Palette.muted)
                Text(value).type(.body).foregroundStyle(Palette.ink).multilineTextAlignment(.leading)
            }
            Spacer(minLength: 0)
        }
    }
}
