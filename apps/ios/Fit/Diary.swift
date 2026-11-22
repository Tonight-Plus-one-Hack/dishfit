import Foundation
import Observation

struct Meal: Codable, Identifiable {
    let id: UUID
    let date: Date
    let name: String
    let place: String
    let macros: Macros
}

@Observable
final class Diary {
    private struct Saved: Codable {
        /// The web app's defaults before a guest sets their own goal.
        var goals = Macros(kcal: 2_200, protein: 110, carbs: 248, fat: 73)
        var meals: [Meal] = []
    }

    private let defaults: UserDefaults
    private var saved: Saved
    private static let key = "fit.diary.v1"

    init(defaults: UserDefaults = .standard) {
        self.defaults = defaults
        saved = defaults.data(forKey: Self.key)
            .flatMap { try? JSONDecoder().decode(Saved.self, from: $0) } ?? Saved()
    }

    var goals: Macros { saved.goals }

    static var calendar: Calendar {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(identifier: "Europe/Berlin") ?? .current
        calendar.firstWeekday = 2
        return calendar
    }

    func meals(on date: Date) -> [Meal] {
        saved.meals.filter { Self.calendar.isDate($0.date, inSameDayAs: date) }
            .sorted { $0.date > $1.date }
    }

    func week(containing date: Date) -> [Date] {
        let calendar = Self.calendar
        guard let start = calendar.dateInterval(of: .weekOfYear, for: date)?.start else { return [] }
        return (0..<7).compactMap { calendar.date(byAdding: .day, value: $0, to: start) }
    }

    func streak(through date: Date) -> Int {
        let calendar = Self.calendar
        let logged = Set(saved.meals.map { calendar.startOfDay(for: $0.date) })
        let today = calendar.startOfDay(for: date)
        var day = logged.contains(today) ? today : calendar.date(byAdding: .day, value: -1, to: today)
        var count = 0
        while let current = day, logged.contains(current) {
            count += 1
            day = calendar.date(byAdding: .day, value: -1, to: current)
        }
        return count
    }

    func add(name: String, place: String, macros: Macros) {
        saved.meals.append(Meal(id: UUID(), date: .now, name: name, place: place, macros: macros))
        persist()
    }

    /// Two plausible lunch and breakfast entries for screenshots, only when today is empty.
    func addSampleMeals() {
        guard meals(on: .now).isEmpty else { return }
        let morning = Self.calendar.date(bySettingHour: 8, minute: 40, second: 0, of: .now) ?? .now
        let noon = Self.calendar.date(bySettingHour: 12, minute: 15, second: 0, of: .now) ?? .now
        saved.meals.append(Meal(id: UUID(), date: morning, name: "Skyr mit Beeren", place: "Zuhause",
                                macros: Macros(kcal: 310, protein: 28, carbs: 38, fat: 4)))
        saved.meals.append(Meal(id: UUID(), date: noon, name: "Chicken Dhansek", place: "Sadhu",
                                macros: Macros(kcal: 591, protein: 61, carbs: 38, fat: 21)))
        persist()
    }

    func remove(_ id: Meal.ID) {
        saved.meals.removeAll { $0.id == id }
        persist()
    }

    func updateGoals(_ goals: Macros) {
        saved.goals = goals
        persist()
    }

    private func persist() {
        if let data = try? JSONEncoder().encode(saved) {
            defaults.set(data, forKey: Self.key)
        }
    }
}
