import SwiftUI

@main
struct PlusOneApp: App {
    @State private var model = AppModel.live()

    var body: some Scene {
        WindowGroup {
            RootView()
                .environment(model)
                .tint(Palette.ink)
                .preferredColorScheme(.light)
        }
    }
}

struct RootView: View {
    @Environment(AppModel.self) private var model

    var body: some View {
        ZStack {
            Palette.canvas.ignoresSafeArea()
            if model.profile.onboardingCompleted {
                MainTabView()
                    .transition(.opacity.combined(with: .scale(scale: 1.02)))
            } else {
                OnboardingFlow(now: model.now)
                    .transition(.opacity)
            }
        }
        .animation(Motion.step, value: model.profile.onboardingCompleted)
        .onOpenURL { model.handle($0) }
        .sheet(item: Binding(get: { model.justJoined }, set: { model.justJoined = $0 })) { joined in
            JoinedView(joined: joined)
        }
    }
}
