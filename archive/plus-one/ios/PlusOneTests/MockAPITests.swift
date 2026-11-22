import Foundation
import Testing
@testable import PlusOne

/// Business rules of the demo backend, mirroring lane 1's hangout tests (docs/team-prompts, Task B).
@Suite("MockAPI")
struct MockAPITests {
    /// Saturday 21 November 2026, 18:00 in Berlin.
    static let evening = ContractCoding.parseDate("2026-11-21T18:00:00+01:00")!

    func makeAPI(now: Date = evening) -> MockAPI {
        let defaults = UserDefaults(suiteName: "plusone.tests.\(UUID().uuidString)")!
        return MockAPI(clock: { now }, latency: .zero, bundle: Bundle(for: AppModel.self), defaults: defaults)
    }

    @Test func listsEightCitiesWithLiveCounts() async throws {
        let cities = try await makeAPI().cities().cities
        #expect(cities.map(\.slug) == ["berlin", "hamburg", "munich", "cologne", "amsterdam", "barcelona", "lisbon", "prague"])
        let berlin = try #require(cities.first)
        #expect(berlin.openHangouts == 9)
        #expect(berlin.peopleTonight == 38)
        #expect(berlin.nameEn == "Berlin")
    }

    @Test func cityTonightIsSortedAndCountsMembers() async throws {
        let tonight = try await makeAPI().cityTonight(slug: "berlin")
        #expect(tonight.hangouts.map(\.startsAt) == tonight.hangouts.map(\.startsAt).sorted())
        #expect(tonight.peopleTonight == tonight.hangouts.reduce(0) { $0 + $1.memberCount })
        for hangout in tonight.hangouts {
            #expect(hangout.spotsLeft == hangout.maxSize - hangout.memberCount)
            #expect((hangout.memberPreview?.count ?? 0) <= 5)
            #expect((3...8).contains(hangout.maxSize))
        }
    }

    @Test func spotsAreCuratedOpenStreetMapVenues() async throws {
        let spots = try await makeAPI().spots(citySlug: "berlin", vibe: nil, kind: nil).spots
        #expect(spots.count == 32)
        #expect(spots.allSatisfy { $0.id.hasPrefix("osm-") && $0.source == "osm" && $0.citySlug == "berlin" })
        let clubs = try await makeAPI().spots(citySlug: "berlin", vibe: nil, kind: .nightclub).spots
        #expect(clubs.count == 6)
        let chill = try await makeAPI().spots(citySlug: "berlin", vibe: .chill, kind: nil).spots
        #expect(chill.allSatisfy { $0.vibes.contains(.chill) })
    }

    @Test func idsMatchTheWebPrototype() {
        #expect(MockAPI.demoUUID("berlin-bijou-first-night") == "8f1f6e25-56ab-425d-8d08-b6f16f0bcf55")
        #expect(MockAPI.demoUUID("berlin-bijou-first-night:1") == "539d3ab4-a299-4359-b67d-4450fee88691")
    }

    @Test func joinIsIdempotentPerDevice() async throws {
        let api = makeAPI()
        let hangout = try #require(try await api.cityTonight(slug: "berlin").hangouts.first { $0.spotsLeft > 0 })
        let first = try await api.join(hangoutID: hangout.id, profile: JoinProfile(nickname: "Robin"))
        let second = try await api.join(hangoutID: hangout.id, profile: JoinProfile(nickname: "Robin"))
        #expect(first.member.id == second.member.id)
        #expect(second.hangout.memberCount == hangout.memberCount + 1)
        let me = try await api.me()
        #expect(me.memberships.map(\.hangoutId) == [hangout.id])
    }

    @Test func aboutLinesAreVisibleToMembersOnly() async throws {
        let api = makeAPI()
        let hangout = try #require(try await api.cityTonight(slug: "berlin").hangouts.first { $0.spotsLeft > 0 })
        let before = try await api.hangout(id: hangout.id)
        #expect(before.viewerMemberId == nil)
        #expect(before.members.allSatisfy { $0.about == nil })
        _ = try await api.join(hangoutID: hangout.id, profile: JoinProfile(nickname: "Robin", about: "Here for good talks"))
        let after = try await api.hangout(id: hangout.id)
        #expect(after.viewerMemberId != nil)
        #expect(after.members.contains { $0.about != nil })
    }

    @Test func rejectsJoinWithoutAgeConfirmationAndBadNicknames() async throws {
        let api = makeAPI()
        let hangout = try #require(try await api.cityTonight(slug: "berlin").hangouts.first)
        let blank = JoinProfile(nickname: "   ")
        await #expect(throws: APIError.self) { try await api.join(hangoutID: hangout.id, profile: blank) }
        let tooLong = JoinProfile(nickname: String(repeating: "a", count: 25))
        do {
            _ = try await api.join(hangoutID: hangout.id, profile: tooLong)
            Issue.record("expected bad_request")
        } catch let error as APIError {
            #expect(error.code == .badRequest)
        }
    }

    @Test func fullHangoutReturnsHangoutFull() async throws {
        let api = makeAPI()
        // "Craft beer, slow start" seeds 6 members into 6 seats.
        let full = try #require(try await api.cityTonight(slug: "berlin").hangouts.first { $0.spotsLeft == 0 })
        do {
            _ = try await api.join(hangoutID: full.id, profile: JoinProfile(nickname: "Robin"))
            Issue.record("expected hangout_full")
        } catch let error as APIError {
            #expect(error.code == .hangoutFull)
        }
    }

    @Test func hangoutsExpireAtSixInTheMorning() async throws {
        let api = makeAPI()
        let hangout = try #require(try await api.cityTonight(slug: "berlin").hangouts.first)
        #expect(hangout.expiresAt == ContractCoding.parseDate("2026-11-22T06:00:00+01:00"))
        let afterNight = makeAPI(now: ContractCoding.parseDate("2026-11-22T06:30:00+01:00")!)
        // A new night builds new seeds; nothing from the previous night is listed as open past 06:00.
        let next = try await afterNight.cityTonight(slug: "berlin")
        #expect(next.hangouts.allSatisfy { $0.expiresAt > ContractCoding.parseDate("2026-11-22T06:30:00+01:00")! })
    }

    @Test func createValidatesSpotTimeAndHostLimit() async throws {
        let api = makeAPI()
        let berlinSpot = try #require(try await api.spots(citySlug: "berlin", vibe: nil, kind: nil).spots.first)
        let hamburgSpot = try #require(try await api.spots(citySlug: "hamburg", vibe: nil, kind: nil).spots.first)
        let clock = TonightClock(timeZone: TimeZone(identifier: "Europe/Berlin")!, now: Self.evening)
        func request(spot: Spot, at time: Date) -> CreateHangoutRequest {
            CreateHangoutRequest(citySlug: "berlin", spotId: spot.id, startsAt: time, vibe: .chill, maxSize: 4,
                                 language: .en, host: JoinProfile(nickname: "Robin"))
        }

        await #expect(throws: APIError.self) { try await api.createHangout(request(spot: hamburgSpot, at: clock.at("20:00"))) }
        await #expect(throws: APIError.self) { try await api.createHangout(request(spot: berlinSpot, at: clock.at("16:00"))) }
        await #expect(throws: APIError.self) {
            try await api.createHangout(request(spot: berlinSpot, at: clock.nightEnd.addingTimeInterval(60)))
        }

        for hour in ["20:00", "21:00", "22:00"] {
            let created = try await api.createHangout(request(spot: berlinSpot, at: clock.at(hour)))
            #expect(created.member.role == .host)
            #expect(created.hangout.expiresAt == clock.nightEnd)
        }
        do {
            _ = try await api.createHangout(request(spot: berlinSpot, at: clock.at("23:00")))
            Issue.record("expected rate_limited")
        } catch let error as APIError {
            #expect(error.code == .rateLimited)
        }
    }

    @Test func hostLeavingAloneCancelsTheHangout() async throws {
        let api = makeAPI()
        let spot = try #require(try await api.spots(citySlug: "berlin", vibe: nil, kind: nil).spots.first)
        let clock = TonightClock(timeZone: TimeZone(identifier: "Europe/Berlin")!, now: Self.evening)
        let created = try await api.createHangout(CreateHangoutRequest(
            citySlug: "berlin", spotId: spot.id, startsAt: clock.at("21:00"), vibe: .bar, maxSize: 3, language: .any,
            host: JoinProfile(nickname: "Robin")))
        try await api.leave(hangoutID: created.hangout.id)
        await #expect(throws: APIError.self) { try await api.hangout(id: created.hangout.id) }
    }
}
