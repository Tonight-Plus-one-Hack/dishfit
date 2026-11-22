import Foundation
import Observation
import SwiftUI

enum OnboardingStep: Int, CaseIterable, Identifiable {
    case welcome, city, name, age, mood, time, size, languages, safety, notifications, matching, result

    var id: Int { rawValue }

    /// Steps that show the progress bar and back button.
    static let questions: [OnboardingStep] = [.city, .name, .age, .mood, .time, .size, .languages, .safety, .notifications]

    var analyticsName: String { String(describing: self) }
}

/// Onboarding state. Answers live in a draft profile until the person finishes, then move to `AppModel.profile`.
@Observable
final class OnboardingModel {
    var step: OnboardingStep = .welcome
    /// Direction of the last move, for the slide transition.
    private(set) var forward = true
    var draft: Profile
    /// Picked on the age screen; never stored or sent.
    var birthYear: Int
    var confirmedBirthdayThisYear = false

    var cities: [CityListItem] = []
    var tonight: CityTonightResponse?
    var spots: [Spot] = []
    var matches: [HangoutMatch] = []
    var loadError: String?

    let now: () -> Date

    init(now: @escaping () -> Date, initialStep: OnboardingStep = .welcome, prefilled: Bool = false) {
        self.now = now
        let year = Calendar.current.component(.year, from: now())
        birthYear = year - 24
        draft = Profile()
        step = initialStep
        if prefilled {
            draft.nickname = "Robin"
            draft.citySlug = "berlin"
            draft.vibes = [.chill, .culture]
            draft.availableFrom = .evening
            draft.groupSize = .small
            draft.languages = [.en, .de]
            birthYear = 1999
        }
    }

    var progress: Double {
        guard let index = OnboardingStep.questions.firstIndex(of: step) else { return step.rawValue > OnboardingStep.notifications.rawValue ? 1 : 0 }
        return Double(index + 1) / Double(OnboardingStep.questions.count + 1)
    }

    var showsChrome: Bool { OnboardingStep.questions.contains(step) }

    var selectedCity: CityListItem? { cities.first { $0.slug == draft.citySlug } }

    var ageResult: AgeGate.Result { AgeGate.evaluate(birthYear: birthYear, now: now()) }

    var canContinue: Bool {
        switch step {
        case .city: selectedCity != nil
        case .name: !trimmedNickname.isEmpty && trimmedNickname.count <= ContractLimits.nicknameMax
        case .age: ageResult == .adult || (ageResult == .needsBirthdayConfirmation && confirmedBirthdayThisYear)
        case .mood: !draft.vibes.isEmpty
        case .languages: !draft.languages.isEmpty
        default: true
        }
    }

    var trimmedNickname: String { draft.nickname.trimmingCharacters(in: .whitespacesAndNewlines) }

    var bestMatch: HangoutMatch? { matches.first }

    func move(to next: OnboardingStep) {
        forward = next.rawValue > step.rawValue
        // Let the outgoing view render with the new direction before it leaves.
        Task { @MainActor in
            withAnimation(Motion.step) { self.step = next }
        }
    }

    func advance() {
        guard canContinue, let next = OnboardingStep(rawValue: step.rawValue + 1) else { return }
        if step == .name { draft.nickname = trimmedNickname }
        if step == .age { draft.adultConfirmedAt = now() }
        move(to: next)
    }

    func back() {
        guard let previous = OnboardingStep(rawValue: step.rawValue - 1) else { return }
        move(to: previous)
    }

    func toggle(_ vibe: Vibe) {
        if let index = draft.vibes.firstIndex(of: vibe) { draft.vibes.remove(at: index) } else { draft.vibes.append(vibe) }
    }

    func toggle(_ language: HangoutLanguage) {
        if let index = draft.languages.firstIndex(of: language) {
            draft.languages.remove(at: index)
        } else {
            draft.languages.append(language)
        }
    }

    /// Preselects the languages the phone is set to, so most people only confirm.
    func preselectLanguages() {
        guard draft.languages.isEmpty else { return }
        let codes = Locale.preferredLanguages.compactMap { Locale(identifier: $0).language.languageCode?.identifier }
        let matches = HangoutLanguage.spoken.filter { codes.contains($0.rawValue) }
        draft.languages = matches.isEmpty ? [.en] : matches
    }

    // MARK: - Data

    func loadCities(api: PlusOneAPI) async {
        guard cities.isEmpty else { return }
        do {
            cities = try await api.cities().cities
            loadError = nil
        } catch {
            loadError = error.localizedDescription
        }
    }

    /// Loads tonight in the chosen city and ranks it with the answers so far.
    func findMatches(api: PlusOneAPI) async {
        do {
            async let tonightResponse = api.cityTonight(slug: draft.citySlug)
            async let spotsResponse = api.spots(citySlug: draft.citySlug, vibe: nil, kind: nil)
            let (tonight, spots) = try await (tonightResponse, spotsResponse)
            self.tonight = tonight
            self.spots = spots.spots
            var profile = draft
            profile.availableFromNight = TonightClock(timeZone: tonight.city.timeZone, now: now()).nightKey
            draft = profile
            matches = Matcher.rank(tonight.hangouts, for: profile, clock: TonightClock(timeZone: tonight.city.timeZone, now: now()))
            loadError = nil
        } catch {
            loadError = error.localizedDescription
        }
    }
}
