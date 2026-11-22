import SwiftUI

@main
struct FitApp: App {
    @State private var diary = Diary()

    var body: some Scene {
        WindowGroup {
            FitTabs()
                .onAppear {
                    if DemoScript.meals { diary.addSampleMeals() }
                }
                .environment(diary)
                .tint(Palette.accent)
        }
    }
}

enum FitTab: Hashable {
    case discover, scan, today
}

struct FitTabs: View {
    @State private var selection: FitTab = DemoScript.tab ?? .discover
    @State private var location = DiscoveryLocation()
    @State private var showingLocation = false
    @State private var kieze: [DiscoveryKiez] = []
    @AppStorage("dishfit.location.choice.v1") private var locationChoice = ""
    @AppStorage("dishfit.location.kiez.v1") private var homeKiez = ""

    var body: some View {
        Group {
            if showingLocation || (locationChoice.isEmpty && DemoScript.tab == nil) {
                LocationExplainer(state: location.state, kieze: kieze.isEmpty ? DiscoveryKiez.central : kieze, request: location.request, dismiss: dismissLocation) { kiez in
                    homeKiez = kiez.slug
                    dismissLocation()
                }
                .task(id: needsKieze) {
                    guard needsKieze, kieze.isEmpty else { return }
                    kieze = (try? await Worker().kieze()) ?? []
                }
            } else {
                tabs
            }
        }
        .onChange(of: location.coordinate != nil) { _, available in
            if available {
                locationChoice = "allowed"
                showingLocation = false
            }
        }
    }

    private var needsKieze: Bool {
        if case .chooseKiez = location.state { return true }
        return false
    }

    private func dismissLocation() {
        locationChoice = needsKieze ? "manual" : "later"
        showingLocation = false
        location.finish()
    }

    private var tabs: some View {
        TabView(selection: $selection) {
            Tab("Entdecken", systemImage: "fork.knife", value: .discover) {
                DiscoverView(coordinate: location.coordinate, kiez: homeKiez) {
                    location.finish()
                    showingLocation = true
                }
            }
            Tab("Scannen", systemImage: "camera.viewfinder", value: .scan) {
                NavigationStack { ScanView() }
            }
            Tab("Heute", systemImage: "calendar", value: .today) {
                NavigationStack {
                    TodayView(showDiscover: { selection = .discover }, showScan: { selection = .scan })
                }
            }
        }
        .tint(Palette.ink)
    }
}
