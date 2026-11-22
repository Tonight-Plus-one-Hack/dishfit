import Foundation

/// "Tonight" in a city's own time zone: a night runs until the next 06:00 local time, when hangouts expire
/// (docs/team-prompts section 6; ported from apps/web/src/lib/time.ts and lane 1's time logic).
struct TonightClock {
    let timeZone: TimeZone
    let now: Date

    init(timeZone: TimeZone, now: Date = Date()) {
        self.timeZone = timeZone
        self.now = now
    }

    var calendar: Calendar {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = timeZone
        calendar.locale = Locale(identifier: "en_GB")
        return calendar
    }

    /// Local calendar day the current night belongs to (before 06:00 it is still yesterday's night).
    var nightDay: DateComponents {
        let hour = calendar.component(.hour, from: now)
        let day = hour < 6 ? calendar.date(byAdding: .day, value: -1, to: now)! : now
        return calendar.dateComponents([.year, .month, .day], from: day)
    }

    /// Stable key for the current night, e.g. "2026-11-21".
    var nightKey: String {
        let day = nightDay
        return String(format: "%04d-%02d-%02d", day.year ?? 0, day.month ?? 0, day.day ?? 0)
    }

    /// The instant for wall-clock `hhmm` tonight; times before 06:00 fall after midnight.
    func at(_ hhmm: String) -> Date {
        let parts = hhmm.split(separator: ":").compactMap { Int($0) }
        return at(hour: parts.first ?? 0, minute: parts.count > 1 ? parts[1] : 0)
    }

    func at(hour: Int, minute: Int = 0) -> Date {
        var components = nightDay
        components.hour = hour
        components.minute = minute
        let base = calendar.date(from: components)!
        return hour < 6 ? calendar.date(byAdding: .day, value: 1, to: base)! : base
    }

    /// End of the current night: the next 06:00 local time.
    var nightEnd: Date { at(hour: 6) > now ? at(hour: 6) : calendar.date(byAdding: .day, value: 1, to: at(hour: 6))! }

    func time(_ date: Date) -> String {
        date.formatted(Date.FormatStyle(date: .omitted, time: .shortened, locale: Locale(identifier: "en_GB"), timeZone: timeZone))
    }

    var clock: String { time(now) }

    var zoneAbbreviation: String { timeZone.abbreviation(for: now) ?? timeZone.identifier }

    var weekday: String {
        now.formatted(Date.FormatStyle(locale: Locale(identifier: "en_GB"), timeZone: timeZone).weekday(.wide))
    }

    func weekdayShort(_ date: Date) -> String {
        date.formatted(Date.FormatStyle(locale: Locale(identifier: "en_GB"), timeZone: timeZone).weekday(.abbreviated)).uppercased()
    }

    func dayOfMonth(_ date: Date) -> Int { calendar.component(.day, from: date) }

    func hour(_ date: Date) -> Int { calendar.component(.hour, from: date) }

    /// "Tonight, 19:00", or "Started 19:00" once it has begun.
    func whenLabel(_ startsAt: Date) -> String {
        startsAt <= now ? "Started \(time(startsAt))" : "Tonight, \(time(startsAt))"
    }
}

/// Time-of-night buckets for the city timeline (web: Early evening, Later, Late night).
enum NightPart: Int, CaseIterable, Identifiable {
    case early, later, late

    var id: Int { rawValue }

    init(hour: Int) {
        switch hour {
        case 6..<21: self = .early
        case 21..<23: self = .later
        default: self = .late
        }
    }

    var title: String {
        switch self {
        case .early: "Early evening"
        case .later: "Later tonight"
        case .late: "Late night"
        }
    }
}
