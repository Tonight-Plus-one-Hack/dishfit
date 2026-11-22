import Foundation

/// Ranks tonight's open hangouts for one person, on device, from the onboarding answers only.
/// Every signal maps to a contract field: vibe, language, startsAt, maxSize and spotsLeft.
struct HangoutMatch: Identifiable, Equatable {
    let hangout: HangoutSummary
    let score: Double
    /// Short, human reasons shown on the result card, e.g. "Chill drinks", "English", "Starts 19:00".
    let reasons: [String]

    var id: String { hangout.id }
}

enum Matcher {
    static func rank(_ hangouts: [HangoutSummary], for profile: Profile, clock: TonightClock) -> [HangoutMatch] {
        let from = profile.availableFrom(tonightKey: clock.nightKey)
        let fromDate = from.hour.map { max(clock.now, clock.at(hour: $0)) } ?? clock.now
        let spoken = Set(profile.languages)

        return hangouts.compactMap { hangout -> HangoutMatch? in
            guard hangout.status == .open, hangout.spotsLeft > 0, hangout.expiresAt > clock.now else { return nil }
            // Never suggest a group the person cannot talk in.
            if hangout.language != .any, !spoken.isEmpty, !spoken.contains(hangout.language) { return nil }

            var score = 0.0
            var reasons: [String] = []

            if profile.vibes.contains(hangout.vibe) {
                score += 3
                reasons.append(hangout.vibe.label)
            } else if profile.vibes.isEmpty {
                score += 1
            }

            if hangout.language == .any {
                score += 1.5
                reasons.append("Any language")
            } else if spoken.contains(hangout.language) {
                score += 2
                reasons.append(hangout.language.label)
            }

            let minutesAfterFrom = hangout.startsAt.timeIntervalSince(fromDate) / 60
            if minutesAfterFrom >= -20 {
                // Starting around the person's time is best; much later is still fine.
                score += minutesAfterFrom <= 120 ? 2 : 1
                reasons.append("Starts \(clock.time(hangout.startsAt))")
            } else if hangout.startsAt > clock.now.addingTimeInterval(-45 * 60) {
                score += 0.5
            } else {
                score -= 2
            }

            if profile.groupSize != .any, profile.groupSize.range.contains(hangout.maxSize) {
                score += 1
                reasons.append(profile.groupSize == .small ? "Small group" : "Up to \(hangout.maxSize)")
            }

            // A nearly full group is a better story than an empty one, but leave room for the person.
            if hangout.memberCount >= ContractLimits.minGroupSize - 1 { score += 0.5 }

            return HangoutMatch(hangout: hangout, score: score, reasons: reasons)
        }
        .sorted { lhs, rhs in
            lhs.score != rhs.score ? lhs.score > rhs.score : lhs.hangout.startsAt < rhs.hangout.startsAt
        }
    }

    /// A curated spot that fits the person's mood, for "start the first one" when nothing matches.
    static func suggestedSpot(from spots: [Spot], for profile: Profile) -> Spot? {
        spots.first { spot in profile.vibes.contains(where: spot.vibes.contains) } ?? spots.first
    }
}
