import Foundation

/// Debug-only launch arguments that walk the app on their own, so the simulator can be
/// screenshotted and recorded without touch automation:
///
///     xcrun simctl launch <device> de.wohin.dishfit -FitTab scan -FitDemo scan
///
/// - `-FitTab discover|scan|today` picks the first tab.
/// - `-FitDemo scan` loads the example menu and starts reading it.
/// - `-FitDemo dish` opens the top dish once the list has loaded.
/// - `-FitDemoMeals YES` logs two sample meals when today is still empty.
enum DemoScript {
    #if DEBUG
    private static let defaults = UserDefaults.standard
    static var tab: FitTab? {
        switch defaults.string(forKey: "FitTab") {
        case "scan": .scan
        case "today": .today
        case "discover": .discover
        default: nil
        }
    }
    static var scan: Bool { defaults.string(forKey: "FitDemo") == "scan" }
    static var dish: Bool { defaults.string(forKey: "FitDemo") == "dish" }
    static var meals: Bool { defaults.bool(forKey: "FitDemoMeals") }
    #else
    static let tab: FitTab? = nil
    static let scan = false
    static let dish = false
    static let meals = false
    #endif
}
