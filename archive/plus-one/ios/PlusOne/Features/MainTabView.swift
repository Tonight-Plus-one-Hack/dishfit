import SwiftUI

struct MainTabView: View {
    @Environment(AppModel.self) private var model

    var body: some View {
        @Bindable var model = model
        TabView(selection: $model.selectedTab) {
            Tab("Tonight", systemImage: "moon.stars", value: AppTab.tonight) {
                NavigationStack(path: $model.tonightPath) {
                    TonightView()
                        .navigationDestination(for: Route.self) { RouteView(route: $0) }
                }
            }
            .accessibilityIdentifier("tab.tonight")
            Tab("Spots", systemImage: "map", value: AppTab.spots) {
                NavigationStack(path: $model.spotsPath) {
                    SpotsView()
                        .navigationDestination(for: Route.self) { RouteView(route: $0) }
                }
            }
            .accessibilityIdentifier("tab.spots")
            Tab("You", systemImage: "person.crop.circle", value: AppTab.you) {
                NavigationStack(path: $model.youPath) {
                    YouView()
                        .navigationDestination(for: Route.self) { RouteView(route: $0) }
                }
            }
            .accessibilityIdentifier("tab.you")
        }
        .tint(Palette.ink)
        .task { await model.refreshMemberships() }
    }
}

struct RouteView: View {
    let route: Route

    var body: some View {
        switch route {
        case let .hangout(id): HangoutDetailView(hangoutID: id)
        case let .spot(id): SpotDetailView(spotID: id)
        }
    }
}

/// The brand top bar: wordmark left, one quiet action right.
struct BrandTopBar<Trailing: View>: View {
    @ViewBuilder var trailing: Trailing

    var body: some View {
        HStack {
            Wordmark(height: 22)
            Spacer()
            trailing
        }
        .padding(.horizontal, Space.page)
        .plusNavDrop()
        .frame(height: 56)
        .background(Palette.canvas)
        .overlay(alignment: .bottom) { Rule() }
    }
}

/// Spot data attribution required by the ODbL wherever spots appear (data/spots/ATTRIBUTION.md).
struct OSMAttribution: View {
    var body: some View {
        Link(destination: URL(string: "https://www.openstreetmap.org/copyright")!) {
            Text("Spot data © OpenStreetMap contributors")
                .type(.label)
                .foregroundStyle(Palette.muted)
                .underline()
        }
        .accessibilityHint("Opens the OpenStreetMap copyright page")
    }
}

/// Loading and error states shared by screens.
struct LoadingView: View {
    var body: some View {
        VStack(spacing: Space.md) {
            BrandMark(color: Palette.line)
                .frame(width: 36, height: 36)
                .phaseAnimator([0.4, 1.0]) { view, phase in view.opacity(phase) } animation: { _ in .easeInOut(duration: 0.8) }
        }
        .frame(maxWidth: .infinity, minHeight: 240)
        .accessibilityLabel("Loading")
    }
}

struct ErrorStateView: View {
    let message: String
    let retry: () -> Void

    var body: some View {
        VStack(spacing: Space.md) {
            Text(message)
                .type(.body)
                .foregroundStyle(Palette.muted)
                .multilineTextAlignment(.center)
            Button("Try again", action: retry)
                .buttonStyle(QuietButtonStyle())
        }
        .frame(maxWidth: .infinity, minHeight: 240)
        .padding(.horizontal, Space.xl)
    }
}
