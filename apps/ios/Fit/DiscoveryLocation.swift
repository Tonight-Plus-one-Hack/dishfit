import CoreLocation
import SwiftUI

@Observable
@MainActor
final class DiscoveryLocation: NSObject, CLLocationManagerDelegate {
    enum State {
        case idle, requesting, available(CLLocationCoordinate2D), chooseKiez
    }

    private(set) var state = State.idle
    private var manager: CLLocationManager?
    private var timeout: Task<Void, Never>?

    var coordinate: CLLocationCoordinate2D? {
        if case let .available(coordinate) = state { return coordinate }
        return nil
    }

    func request() {
        guard manager == nil else { return }
        state = .requesting
        let manager = CLLocationManager()
        self.manager = manager
        manager.desiredAccuracy = kCLLocationAccuracyHundredMeters
        manager.delegate = self
        if manager.authorizationStatus == .notDetermined {
            manager.requestWhenInUseAuthorization()
        } else {
            handleAuthorization(manager)
        }
    }

    nonisolated func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
        MainActor.assumeIsolated { handleAuthorization(manager) }
    }

    private func handleAuthorization(_ manager: CLLocationManager) {
        guard self.manager === manager else { return }
        switch manager.authorizationStatus {
        case .notDetermined: break
        case .authorizedAlways, .authorizedWhenInUse:
            guard timeout == nil else { return }
            timeout = Task {
                try? await Task.sleep(for: .seconds(10))
                guard !Task.isCancelled else { return }
                finish(.chooseKiez)
            }
            manager.requestLocation()
        default: finish(.chooseKiez)
        }
    }

    nonisolated func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        MainActor.assumeIsolated {
            guard self.manager === manager else { return }
            guard let location = locations.last, location.horizontalAccuracy >= 0 else {
                finish(.chooseKiez)
                return
            }
            let coordinate = location.coordinate
            let inBerlin = BerlinBoundary.contains(latitude: coordinate.latitude, longitude: coordinate.longitude)
            finish(inBerlin ? .available(coordinate) : .chooseKiez)
        }
    }

    nonisolated func locationManager(_ manager: CLLocationManager, didFailWithError error: any Error) {
        MainActor.assumeIsolated {
            if self.manager === manager { finish(.chooseKiez) }
        }
    }

    func finish(_ state: State = .idle) {
        timeout?.cancel()
        timeout = nil
        manager?.delegate = nil
        manager = nil
        self.state = state
    }
}

func distanceBetween(_ first: CLLocationCoordinate2D, _ second: CLLocationCoordinate2D) -> Double {
    let radians = Double.pi / 180
    let latitude = (second.latitude - first.latitude) * radians
    let longitude = (second.longitude - first.longitude) * radians
    let h = pow(sin(latitude / 2), 2) + cos(first.latitude * radians) * cos(second.latitude * radians) * pow(sin(longitude / 2), 2)
    return 2 * 6_371_000 * asin(sqrt(min(1, h)))
}

func discoveryDistance(_ metres: Double) -> String {
    if metres < 1_000 {
        return "\(((metres / 10).rounded() * 10).formatted(.number.precision(.fractionLength(0)))) m"
    }
    return "\((metres / 1_000).formatted(.number.precision(.fractionLength(0...1)))) km"
}

struct LocationExplainer: View {
    let state: DiscoveryLocation.State
    let kieze: [DiscoveryKiez]
    let request: () -> Void
    let dismiss: () -> Void
    let pick: (DiscoveryKiez) -> Void

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                Image("ClayOnbLocation")
                    .resizable()
                    .scaledToFit()
                    .frame(width: 152, height: 152)
                    .accessibilityHidden(true)
                if case .chooseKiez = state {
                    title("Kiez wählen")
                    Text("Wähle einen Berliner Kiez, um dort Gerichte zu entdecken.")
                        .foregroundStyle(Palette.muted)
                    ForEach(kieze) { kiez in
                        Button(kiez.name) { pick(kiez) }
                            .buttonStyle(SecondaryButtonStyle())
                    }
                } else {
                    title("Zeig mir gesunde Gerichte in deiner Nähe")
                    Text("Finde passende Gerichte und sieh, wie weit die Restaurants entfernt sind. Dein Standort bleibt auf deinem Gerät.")
                        .foregroundStyle(Palette.muted)
                }
            }
            .page()
            .padding(.top, 24)
        }
        .safeAreaInset(edge: .bottom) {
            VStack(spacing: 8) {
                switch state {
                case .idle:
                    Button("Standort verwenden", action: request)
                        .buttonStyle(PrimaryButtonStyle())
                        .accessibilityIdentifier("useDiscoveryLocation")
                case .requesting:
                    ProgressView("Standort wird bestimmt…")
                        .frame(maxWidth: .infinity, minHeight: 54)
                default: EmptyView()
                }
                Button("Später", action: dismiss)
                    .buttonStyle(SecondaryButtonStyle())
                    .accessibilityIdentifier("skipDiscoveryLocation")
            }
            .page()
            .padding(.vertical, 12)
            .background(Palette.canvas)
        }
        .background(Palette.canvas.ignoresSafeArea())
    }

    private func title(_ key: LocalizedStringKey) -> some View {
        Text(key)
            .font(.largeTitle.bold())
            .tracking(-0.9)
            .foregroundStyle(Palette.ink)
            .accessibilityAddTraits(.isHeader)
    }
}
