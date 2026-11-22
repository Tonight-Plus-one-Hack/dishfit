import Foundation
import Testing
@testable import PlusOne

@Suite("TonightClock")
struct TonightClockTests {
    let berlin = TimeZone(identifier: "Europe/Berlin")!

    @Test func eveningNightEndsTomorrowAtSix() {
        let clock = TonightClock(timeZone: berlin, now: ContractCoding.parseDate("2026-11-21T18:00:00+01:00")!)
        #expect(clock.nightEnd == ContractCoding.parseDate("2026-11-22T06:00:00+01:00"))
        #expect(clock.nightKey == "2026-11-21")
        #expect(clock.at("19:30") == ContractCoding.parseDate("2026-11-21T19:30:00+01:00"))
        #expect(clock.at("01:00") == ContractCoding.parseDate("2026-11-22T01:00:00+01:00"))
    }

    @Test func afterMidnightTheNightEndsTodayAtSix() {
        let clock = TonightClock(timeZone: berlin, now: ContractCoding.parseDate("2026-11-22T01:30:00+01:00")!)
        #expect(clock.nightEnd == ContractCoding.parseDate("2026-11-22T06:00:00+01:00"))
        #expect(clock.nightKey == "2026-11-21")
        #expect(clock.at("21:00") == ContractCoding.parseDate("2026-11-21T21:00:00+01:00"))
    }

    @Test func formatsInTheCityZone() {
        let lisbon = TonightClock(timeZone: TimeZone(identifier: "Europe/Lisbon")!,
                                  now: ContractCoding.parseDate("2026-11-21T18:00:00+01:00")!)
        #expect(lisbon.clock == "17:00")
    }

    @Test func nightParts() {
        #expect(NightPart(hour: 18) == .early)
        #expect(NightPart(hour: 21) == .later)
        #expect(NightPart(hour: 23) == .late)
        #expect(NightPart(hour: 1) == .late)
    }
}

@Suite("AgeGate")
struct AgeGateTests {
    let now = ContractCoding.parseDate("2026-11-21T18:00:00+01:00")!

    @Test func neutralBirthYearCheck() {
        #expect(AgeGate.evaluate(birthYear: 1999, now: now) == .adult)
        #expect(AgeGate.evaluate(birthYear: 2008, now: now) == .needsBirthdayConfirmation)
        #expect(AgeGate.evaluate(birthYear: 2010, now: now) == .minor)
    }
}

@Suite("Matcher")
struct MatcherTests {
    let clock = TonightClock(timeZone: TimeZone(identifier: "Europe/Berlin")!,
                             now: ContractCoding.parseDate("2026-11-21T18:00:00+01:00")!)

    func hangout(_ id: String, vibe: Vibe, language: HangoutLanguage, at time: String, size: Int = 6, members: Int = 3) -> HangoutSummary {
        HangoutSummary(id: id, citySlug: "berlin", spotId: "osm-node-1", startsAt: clock.at(time), vibe: vibe, maxSize: size,
                       language: language, status: .open, expiresAt: clock.nightEnd, createdAt: clock.now,
                       spot: SpotRef(id: "osm-node-1", name: "Bar", kind: .bar, address: nil, neighborhood: "Mitte"),
                       memberCount: members, spotsLeft: size - members, memberPreview: nil, title: nil, note: nil)
    }

    var profile: Profile {
        var profile = Profile()
        profile.vibes = [.chill]
        profile.languages = [.en]
        profile.availableFrom = .evening
        profile.availableFromNight = clock.nightKey
        profile.groupSize = .small
        return profile
    }

    @Test func prefersMoodLanguageTimeAndSize() throws {
        let ranked = Matcher.rank([
            hangout("club", vibe: .club, language: .en, at: "23:00", size: 8),
            hangout("chill", vibe: .chill, language: .en, at: "19:00", size: 4),
            hangout("any", vibe: .chill, language: .any, at: "21:30", size: 8),
        ], for: profile, clock: clock)
        #expect(ranked.map(\.hangout.id) == ["chill", "any", "club"])
        let best = try #require(ranked.first)
        #expect(best.reasons == ["Chill drinks", "English", "Starts 19:00", "Small group"])
    }

    @Test func neverSuggestsUnspokenLanguagesOrFullGroups() {
        let ranked = Matcher.rank([
            hangout("de", vibe: .chill, language: .de, at: "19:00"),
            hangout("full", vibe: .chill, language: .en, at: "19:00", size: 4, members: 4),
        ], for: profile, clock: clock)
        #expect(ranked.isEmpty)
    }

    @Test func staleStartTimeFallsBackToNow() {
        var stale = profile
        stale.availableFrom = .late
        stale.availableFromNight = "2026-11-20"
        #expect(stale.availableFrom(tonightKey: clock.nightKey) == .now)
    }
}

@Suite("Contract coding")
struct ContractCodingTests {
    @Test func decodesWorkerTimestampsWithAndWithoutFractions() throws {
        let json = """
        {"id":"8f1f6e25-56ab-425d-8d08-b6f16f0bcf55","citySlug":"berlin","spotId":"osm-node-1","startsAt":"2026-11-21T18:00:00.000Z",
         "vibe":"bar","maxSize":6,"language":"en","status":"open","expiresAt":"2026-11-22T05:00:00Z",
         "createdAt":"2026-11-21T13:00:00+01:00","spot":{"id":"osm-node-1","name":"Bijou Bar","kind":"bar","address":"Monbijouplatz 1"},
         "memberCount":4,"spotsLeft":2,"memberPreview":[{"nickname":"Mara"}]}
        """
        let hangout = try ContractCoding.decoder().decode(HangoutSummary.self, from: Data(json.utf8))
        #expect(hangout.startsAt == ContractCoding.parseDate("2026-11-21T19:00:00+01:00"))
        #expect(hangout.spot.neighborhood == nil)
        #expect(hangout.title == nil)
        #expect(hangout.names == ["Mara"])
    }

    @Test func joinProfileAlwaysConfirmsAge() throws {
        let data = try ContractCoding.encoder().encode(JoinProfile(nickname: "Robin", about: nil))
        let object = try #require(try JSONSerialization.jsonObject(with: data) as? [String: Any])
        #expect(object["ageConfirmed"] as? Bool == true)
        #expect(object["nickname"] as? String == "Robin")
        #expect(object["about"] == nil)
    }

    @Test func spotPlaceFallsBackToStreet() {
        #expect(SpotPlace.format(neighborhood: nil, address: "Skalitzer Straße 41") == "Skalitzer Straße")
        #expect(SpotPlace.format(neighborhood: "Mitte", address: "Monbijouplatz 1") == "Mitte")
    }

    @Test func deepLinksUseTheWebPaths() throws {
        #expect(DeepLink.parts(of: try #require(URL(string: "plusone://h/abc"))) == ["h", "abc"])
        #expect(DeepLink.parts(of: try #require(URL(string: "https://plusone.example/c/berlin/spots"))) == ["c", "berlin", "spots"])
    }
}
