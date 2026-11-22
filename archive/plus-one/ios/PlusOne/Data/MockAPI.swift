import Foundation

/// Demo backend on bundled data, following the contract's business rules (group size 3 to 8, idempotent join,
/// capacity, curated spots only, tonight-only start times, at most 3 hosted groups per device).
///
/// Spots and cities are real OpenStreetMap venues exported by apps/ios/scripts/export-mock-data.py.
/// Every hangout, nickname and line is invented demo data (the same seeds as the web prototype); nothing here
/// claims those venues host these plans. The device's own joins and hangouts survive relaunches for the night.
final class MockAPI: PlusOneAPI {
    var isDemo: Bool { true }

    private let clock: () -> Date
    private let latency: Duration
    private let defaults: UserDefaults
    private let cityList: [City]
    private let spotList: [Spot]
    private var store: [String: StoredHangout] = [:]
    private var state: PersistedState

    static let stateKey = "plusone.mock.v1"

    init(clock: @escaping () -> Date = Date.init, latency: Duration = .milliseconds(240),
         bundle: Bundle = .main, defaults: UserDefaults = .standard) {
        self.clock = clock
        self.latency = latency
        self.defaults = defaults
        let decoder = ContractCoding.decoder()
        cityList = Self.load([City].self, "cities", bundle: bundle, decoder: decoder).sorted { $0.sortOrder < $1.sortOrder }
        spotList = Self.load([Spot].self, "spots", bundle: bundle, decoder: decoder)
        let seeds = Self.load(SeedFile.self, "hangout-seeds", bundle: bundle, decoder: decoder)
        state = PersistedState(nightKey: "", memberships: [:], created: [])
        buildSeedHangouts(seeds)
        restoreState()
    }

    // MARK: - Reads

    func cities() async throws -> ListCitiesResponse {
        try await pause()
        let items = cityList.map { city in
            let open = openHangouts(in: city.slug)
            return CityListItem(city: city, openHangouts: open.count, peopleTonight: open.reduce(0) { $0 + $1.members.count })
        }
        return ListCitiesResponse(cities: items)
    }

    func cityTonight(slug: String) async throws -> CityTonightResponse {
        try await pause()
        guard let city = cityList.first(where: { $0.slug == slug }) else { throw notFound("City not found.") }
        let open = openHangouts(in: slug).sorted { $0.startsAt < $1.startsAt }
        return CityTonightResponse(city: city, hangouts: open.map(summary), peopleTonight: open.reduce(0) { $0 + $1.members.count })
    }

    func spots(citySlug: String, vibe: Vibe?, kind: SpotKind?) async throws -> ListSpotsResponse {
        try await pause()
        guard let city = cityList.first(where: { $0.slug == citySlug }) else { throw notFound("City not found.") }
        let spots = spotList.filter { spot in
            spot.citySlug == citySlug && (vibe.map { spot.vibes.contains($0) } ?? true) && (kind.map { spot.kind == $0 } ?? true)
        }
        return ListSpotsResponse(city: city, spots: spots)
    }

    func spot(id: String) async throws -> SpotResponse {
        try await pause()
        guard let spot = spotList.first(where: { $0.id == id }) else { throw notFound("Spot not found.") }
        return SpotResponse(spot: spot)
    }

    func hangout(id: String) async throws -> HangoutDetail {
        try await pause()
        guard let stored = store[id], isOpen(stored), let spot = spotList.first(where: { $0.id == stored.spotId }) else {
            throw notFound("This hangout is over or no longer available.")
        }
        let viewer = state.memberships[id]
        let members = stored.members.sorted { $0.joinedAt < $1.joinedAt }.map { member in
            viewer == nil ? Member(id: member.id, hangoutId: member.hangoutId, nickname: member.nickname, about: nil,
                                   role: member.role, arrivedAt: member.arrivedAt, joinedAt: member.joinedAt) : member
        }
        return HangoutDetail(hangout: summary(stored), spot: spot, members: members, viewerMemberId: viewer?.id)
    }

    func me() async throws -> MeResponse {
        try await pause()
        let memberships = state.memberships.values
            .filter { member in store[member.hangoutId].map(isOpen) ?? false }
            .map { Membership(hangoutId: $0.hangoutId, memberId: $0.id, role: $0.role) }
        return MeResponse(memberships: memberships)
    }

    func shareLinks(hangoutID: String) async throws -> ShareLinksResponse {
        try await pause()
        guard let stored = store[hangoutID] else { throw notFound("Hangout not found.") }
        let url = "https://plusone.example/h/\(hangoutID)"
        let spot = spotList.first { $0.id == stored.spotId }?.name ?? "a public spot"
        let left = stored.maxSize - stored.members.count
        let text = "Join me tonight at \(spot). \(left) \(left == 1 ? "seat" : "seats") left on Plus One."
        let whatsapp = "https://wa.me/?text=" + (text + " " + url).addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed)!
        return ShareLinksResponse(url: url, text: text, whatsappUrl: whatsapp)
    }

    // MARK: - Writes

    func join(hangoutID: String, profile: JoinHangoutRequest) async throws -> JoinHangoutResponse {
        try await pause()
        guard var stored = store[hangoutID] else { throw notFound("This hangout is over or no longer available.") }
        if let existing = state.memberships[hangoutID] {
            return JoinHangoutResponse(hangout: summary(stored), member: existing)
        }
        let nickname = try validNickname(profile)
        guard isOpen(stored) else {
            throw APIError.server(status: 409, code: .hangoutClosed, message: "This hangout has ended.")
        }
        guard stored.members.count < stored.maxSize else {
            throw APIError.server(status: 409, code: .hangoutFull, message: "This hangout just filled up.")
        }
        let member = Member(id: UUID().uuidString.lowercased(), hangoutId: hangoutID, nickname: nickname,
                            about: profile.about?.trimmingCharacters(in: .whitespacesAndNewlines).nilIfEmpty,
                            role: .member, arrivedAt: nil, joinedAt: clock())
        stored.members.append(member)
        store[hangoutID] = stored
        state.memberships[hangoutID] = member
        persist()
        return JoinHangoutResponse(hangout: summary(stored), member: member)
    }

    func createHangout(_ request: CreateHangoutRequest) async throws -> CreateHangoutResponse {
        try await pause()
        let now = clock()
        guard let city = cityList.first(where: { $0.slug == request.citySlug }) else { throw notFound("City not found.") }
        guard let spot = spotList.first(where: { $0.id == request.spotId && $0.citySlug == city.slug }) else {
            throw badRequest("The spot must be a curated spot of this city.")
        }
        guard (ContractLimits.minGroupSize...ContractLimits.maxGroupSize).contains(request.maxSize) else {
            throw badRequest("Groups have 3 to 8 seats.")
        }
        let nickname = try validNickname(request.host)
        let tonight = TonightClock(timeZone: city.timeZone, now: now)
        guard request.startsAt >= now.addingTimeInterval(-30 * 60) else { throw badRequest("That time has already passed.") }
        guard request.startsAt < tonight.nightEnd else { throw badRequest("Pick a time tonight, before 06:00.") }
        let hosted = state.memberships.values.filter { $0.role == .host && (store[$0.hangoutId].map(isOpen) ?? false) }
        guard hosted.count < 3 else {
            throw APIError.server(status: 429, code: .rateLimited, message: "You already host 3 open groups tonight.")
        }
        let id = UUID().uuidString.lowercased()
        let host = Member(id: UUID().uuidString.lowercased(), hangoutId: id, nickname: nickname,
                          about: request.host.about?.nilIfEmpty, role: .host, arrivedAt: nil, joinedAt: now)
        let stored = StoredHangout(id: id, citySlug: city.slug, spotId: spot.id, startsAt: request.startsAt, vibe: request.vibe,
                                   maxSize: request.maxSize, language: request.language, status: .open,
                                   expiresAt: tonight.nightEnd, createdAt: now, title: nil, note: nil, members: [host])
        store[id] = stored
        state.memberships[id] = host
        state.created.append(stored)
        persist()
        return CreateHangoutResponse(hangout: summary(stored), member: host)
    }

    func leave(hangoutID: String) async throws {
        try await pause()
        guard let member = state.memberships.removeValue(forKey: hangoutID), var stored = store[hangoutID] else { return }
        stored.members.removeAll { $0.id == member.id }
        if member.role == .host, stored.members.isEmpty { stored.status = .cancelled }
        store[hangoutID] = stored
        if let index = state.created.firstIndex(where: { $0.id == hangoutID }) { state.created[index] = stored }
        persist()
    }

    func report(_ request: ReportRequest) async throws { try await pause() }

    func block(_ request: BlockRequest) async throws { try await pause() }

    // MARK: - Demo data

    private func buildSeedHangouts(_ seeds: SeedFile) {
        let now = clock()
        for seed in seeds.hangouts {
            guard let city = cityList.first(where: { $0.slug == seed.city }),
                  let spot = spotList.first(where: { $0.citySlug == seed.city && $0.name == seed.spot }) else {
                assertionFailure("Demo hangout \(seed.key) points at an unknown city or spot")
                continue
            }
            let tonight = TonightClock(timeZone: city.timeZone, now: now)
            let id = Self.demoUUID(seed.key)
            let startsAt = tonight.at(seed.time)
            let createdAt = startsAt.addingTimeInterval(-5 * 3600)
            let members = seed.members.enumerated().map { index, n in
                Member(id: Self.demoUUID("\(seed.key):\(n)"), hangoutId: id,
                       nickname: seeds.nicknames[(n - 1) % seeds.nicknames.count],
                       about: seeds.aboutLines[(n + index) % seeds.aboutLines.count],
                       role: index == 0 ? .host : .member, arrivedAt: nil,
                       joinedAt: createdAt.addingTimeInterval(Double(index) * 17 * 60))
            }
            store[id] = StoredHangout(id: id, citySlug: city.slug, spotId: spot.id, startsAt: startsAt, vibe: seed.vibe,
                                      maxSize: seed.maxSize, language: seed.language, status: .open,
                                      expiresAt: tonight.nightEnd, createdAt: createdAt, title: seed.title,
                                      note: seed.note, members: members)
        }
    }

    private func restoreState() {
        let nightKey = TonightClock(timeZone: cityList.first?.timeZone ?? .current, now: clock()).nightKey
        if let data = defaults.data(forKey: Self.stateKey),
           let saved = try? ContractCoding.decoder().decode(PersistedState.self, from: data),
           saved.nightKey == nightKey {
            state = saved
        } else {
            state = PersistedState(nightKey: nightKey, memberships: [:], created: [])
        }
        for hangout in state.created { store[hangout.id] = hangout }
        for (hangoutID, member) in state.memberships where member.role == .member {
            guard var stored = store[hangoutID], !stored.members.contains(where: { $0.id == member.id }) else { continue }
            stored.members.append(member)
            store[hangoutID] = stored
        }
    }

    private func persist() {
        if let data = try? ContractCoding.encoder().encode(state) { defaults.set(data, forKey: Self.stateKey) }
    }

    // MARK: - Helpers

    private func pause() async throws {
        if latency > .zero { try await Task.sleep(for: latency) }
    }

    private func openHangouts(in citySlug: String) -> [StoredHangout] {
        store.values.filter { $0.citySlug == citySlug && isOpen($0) }
    }

    private func isOpen(_ hangout: StoredHangout) -> Bool {
        hangout.status == .open && hangout.expiresAt > clock()
    }

    private func summary(_ stored: StoredHangout) -> HangoutSummary {
        let spot = spotList.first { $0.id == stored.spotId }
        let members = stored.members.sorted { $0.joinedAt < $1.joinedAt }
        return HangoutSummary(
            id: stored.id, citySlug: stored.citySlug, spotId: stored.spotId, startsAt: stored.startsAt, vibe: stored.vibe,
            maxSize: stored.maxSize, language: stored.language, status: stored.status, expiresAt: stored.expiresAt,
            createdAt: stored.createdAt,
            spot: SpotRef(id: stored.spotId, name: spot?.name ?? "", kind: spot?.kind ?? .bar, address: spot?.address,
                          neighborhood: spot?.neighborhood),
            memberCount: members.count, spotsLeft: max(0, stored.maxSize - members.count),
            memberPreview: members.prefix(5).map { MemberPreview(nickname: $0.nickname) },
            title: stored.title, note: stored.note
        )
    }

    private func validNickname(_ profile: JoinProfile) throws -> String {
        guard profile.ageConfirmed else { throw badRequest("Please confirm you are 18 or older.") }
        let nickname = profile.nickname.trimmingCharacters(in: .whitespacesAndNewlines)
        guard (1...ContractLimits.nicknameMax).contains(nickname.count) else {
            throw badRequest("Pick a nickname with 1 to 24 characters.")
        }
        return nickname
    }

    private func notFound(_ message: String) -> APIError { .server(status: 404, code: .notFound, message: message) }
    private func badRequest(_ message: String) -> APIError { .server(status: 400, code: .badRequest, message: message) }

    private static func load<T: Decodable>(_ type: T.Type, _ name: String, bundle: Bundle, decoder: JSONDecoder) -> T {
        guard let url = bundle.url(forResource: name, withExtension: "json"),
              let data = try? Data(contentsOf: url),
              let value = try? decoder.decode(T.self, from: data) else {
            fatalError("Bundled mock data \(name).json is missing or invalid")
        }
        return value
    }

    /// Deterministic UUID-shaped ids, the same algorithm as the web prototype's demoUuid, so links match.
    static func demoUUID(_ key: String) -> String {
        var hex = ""
        var h: UInt32 = 2_166_136_261
        var round: UInt32 = 0
        let units = Array(key.utf16)
        while hex.count < 32 {
            for unit in units {
                h ^= UInt32(unit) &+ round
                h = h &* 16_777_619
            }
            hex += String(format: "%08x", h)
            round += 1
        }
        var chars = Array(hex.prefix(32))
        chars[12] = "4"
        let variant = Int(String(chars[16]), radix: 16)! % 4
        chars[16] = Array("89ab")[variant]
        let s = String(chars)
        func part(_ from: Int, _ to: Int) -> Substring {
            s[s.index(s.startIndex, offsetBy: from)..<s.index(s.startIndex, offsetBy: to)]
        }
        return "\(part(0, 8))-\(part(8, 12))-\(part(12, 16))-\(part(16, 20))-\(part(20, 32))"
    }
}

private struct StoredHangout: Codable {
    let id: String
    let citySlug: String
    let spotId: String
    let startsAt: Date
    let vibe: Vibe
    let maxSize: Int
    let language: HangoutLanguage
    var status: HangoutStatus
    let expiresAt: Date
    let createdAt: Date
    let title: String?
    let note: String?
    var members: [Member]
}

private struct PersistedState: Codable {
    var nightKey: String
    var memberships: [String: Member]
    var created: [StoredHangout]
}

private struct SeedFile: Decodable {
    struct Seed: Decodable {
        let city: String
        let key: String
        let spot: String
        let title: String
        let time: String
        let maxSize: Int
        let members: [Int]
        let vibe: Vibe
        let language: HangoutLanguage
        let note: String
    }

    let nicknames: [String]
    let aboutLines: [String]
    let hangouts: [Seed]
}

extension String {
    var nilIfEmpty: String? { isEmpty ? nil : self }
}
