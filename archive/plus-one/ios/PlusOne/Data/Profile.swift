import Foundation

/// What the person told us in onboarding. Stored only on this device (UserDefaults); the API receives the nickname,
/// an optional about line and `ageConfirmed: true` when they join, nothing else. See apps/ios/README.md for why
/// each field exists and what was left out.
struct Profile: Codable, Equatable {
    /// Shown on hangouts they join (contract: JoinProfile.nickname, 1 to 24 characters).
    var nickname = ""
    /// Set once the neutral birth-year check passed. The year itself is never stored or sent.
    var adultConfirmedAt: Date?
    /// The chosen city. Never detected: no location permission (docs/plan.md, safety).
    var citySlug = "berlin"
    /// Maps to Hangout.vibe and Spot.vibes.
    var vibes: [Vibe] = []
    /// From when they are free; only valid for the night it was set (see `availableFromNight`).
    var availableFrom: AvailableFrom = .now
    var availableFromNight: String?
    /// Preferred group size; matched against Hangout.maxSize.
    var groupSize: GroupSizePreference = .any
    /// Languages they are happy to speak; matched against Hangout.language.
    var languages: [HangoutLanguage] = []
    /// Spots they saved with the heart (device only).
    var savedSpotIDs: [String] = []
    var onboardingCompleted = false

    var isAdult: Bool { adultConfirmedAt != nil }

    /// Today's start-time preference, or `.now` when it was set on an earlier night.
    func availableFrom(tonightKey: String) -> AvailableFrom {
        availableFromNight == tonightKey ? availableFrom : .now
    }

    /// The about line sent with a join: their first mood, phrased for the group.
    var aboutLine: String? { vibes.first?.aboutLine }
}

enum AvailableFrom: String, Codable, CaseIterable, Identifiable {
    case now, evening, night, late

    var id: String { rawValue }

    /// Local hour the preference starts at; nil means "whatever starts next".
    var hour: Int? {
        switch self {
        case .now: nil
        case .evening: 19
        case .night: 21
        case .late: 23
        }
    }

    var title: String {
        switch self {
        case .now: "Right now"
        case .evening: "From 19:00"
        case .night: "From 21:00"
        case .late: "23:00 or later"
        }
    }

    var subtitle: String {
        switch self {
        case .now: "Whatever starts next"
        case .evening: "After work, an early round"
        case .night: "The classic night out"
        case .late: "Late bars and clubs"
        }
    }

    var symbol: String {
        switch self {
        case .now: "bolt"
        case .evening: "sunset"
        case .night: "moon"
        case .late: "moon.stars"
        }
    }
}

enum GroupSizePreference: String, Codable, CaseIterable, Identifiable {
    case small, medium, big, any

    var id: String { rawValue }

    var range: ClosedRange<Int> {
        switch self {
        case .small: 3...4
        case .medium: 5...6
        case .big: 7...8
        case .any: ContractLimits.minGroupSize...ContractLimits.maxGroupSize
        }
    }

    var title: String {
        switch self {
        case .small: "Small, 3 to 4"
        case .medium: "Medium, 5 to 6"
        case .big: "Big, 7 to 8"
        case .any: "No preference"
        }
    }

    var subtitle: String {
        switch self {
        case .small: "Easy to talk to everyone"
        case .medium: "A full table, still one conversation"
        case .big: "More energy, more new faces"
        case .any: "Show me every size"
        }
    }

    /// Seats drawn in the option row.
    var seats: Int {
        switch self {
        case .small: 4
        case .medium: 6
        case .big: 8
        case .any: 0
        }
    }

    /// Default size when this person starts a hangout.
    var hostDefault: Int {
        switch self {
        case .small: 4
        case .medium: 6
        case .big: 8
        case .any: 6
        }
    }
}

/// Neutral age gate: the person picks a birth year (no pre-filled "yes"), the app decides 18+ locally.
enum AgeGate {
    enum Result: Equatable { case adult, minor, needsBirthdayConfirmation }

    static func evaluate(birthYear: Int, now: Date = Date(), calendar: Calendar = .current) -> Result {
        let year = calendar.component(.year, from: now)
        let age = year - birthYear
        if age > 18 { return .adult }
        if age == 18 { return .needsBirthdayConfirmation }
        return .minor
    }
}
