import Foundation

// Swift mirror of the shared API contract (packages/shared/src/contract.ts, ported by lane 1 from
// fm/t0-foundation lib/contract.ts plus the deltas in docs/team-prompts/README.md section 7).
// Field names and enums match the contract exactly so MockAPI and LiveAPI are interchangeable.
// Fields marked PROPOSED are optional additions shared with the web prototype (apps/web/src/data/types.ts);
// they are not in the contract yet and decode as nil from the real API.

enum Vibe: String, Codable, CaseIterable, Identifiable, Sendable {
    case bar, club, chill, culture
    var id: String { rawValue }
}

enum SpotKind: String, Codable, CaseIterable, Identifiable, Sendable {
    case bar, pub, nightclub, biergarten, cafe, venue
    var id: String { rawValue }
}

enum HangoutLanguage: String, Codable, CaseIterable, Identifiable, Sendable {
    case de, en, es, fr, it, tr, any
    var id: String { rawValue }
    /// Languages a person can speak (everything except the "any language" hangout setting).
    static var spoken: [HangoutLanguage] { allCases.filter { $0 != .any } }
}

enum HangoutStatus: String, Codable, Sendable { case open, cancelled, hidden }
enum MemberRole: String, Codable, Sendable { case host, member }
enum MessageKind: String, Codable, Sendable { case text, arrived }
enum ReportTarget: String, Codable, Sendable { case hangout, message, member }
enum ReportReason: String, Codable, CaseIterable, Identifiable, Sendable {
    case harassment, spam, unsafe, inappropriate, other
    var id: String { rawValue }
}

enum ContractLimits {
    static let minGroupSize = 3
    static let maxGroupSize = 8
    static let nicknameMax = 24
    static let aboutMax = 140
    static let messageMax = 500
}

struct City: Codable, Hashable, Identifiable, Sendable {
    let slug: String
    let name: String
    let nameEn: String?
    let countryCode: String
    /// IANA zone; "tonight" is computed in this zone.
    let timezone: String
    let sortOrder: Int
    /// Map centring (contract delta); nullable.
    let lat: Double?
    let lng: Double?

    var id: String { slug }
    /// English display name.
    var displayName: String { nameEn ?? name }
    var timeZone: TimeZone { TimeZone(identifier: timezone) ?? .current }
}

/// GET /api/cities item: City plus tonight's counters.
struct CityListItem: Codable, Hashable, Identifiable, Sendable {
    let slug: String
    let name: String
    let nameEn: String?
    let countryCode: String
    let timezone: String
    let sortOrder: Int
    let lat: Double?
    let lng: Double?
    let openHangouts: Int
    let peopleTonight: Int

    var id: String { slug }
    var city: City {
        City(slug: slug, name: name, nameEn: nameEn, countryCode: countryCode, timezone: timezone,
             sortOrder: sortOrder, lat: lat, lng: lng)
    }

    init(city: City, openHangouts: Int, peopleTonight: Int) {
        slug = city.slug
        name = city.name
        nameEn = city.nameEn
        countryCode = city.countryCode
        timezone = city.timezone
        sortOrder = city.sortOrder
        lat = city.lat
        lng = city.lng
        self.openHangouts = openHangouts
        self.peopleTonight = peopleTonight
    }
}

/// A curated, public meeting spot (also the row shape of data/spots exports after lane 3's mapping).
struct Spot: Codable, Hashable, Identifiable, Sendable {
    /// Stable OSM id, e.g. osm-node-966975630.
    let id: String
    let citySlug: String
    let name: String
    let kind: SpotKind
    let vibes: [Vibe]
    let descriptionDe: String?
    let descriptionEn: String?
    let address: String?
    /// District shown on spot cards, e.g. "Kreuzberg" (OSM addr:suburb).
    let neighborhood: String?
    let lat: Double
    let lng: Double
    let openingHours: String?
    let website: String?
    /// Data provenance, e.g. "osm" (requires the ODbL attribution).
    let source: String
}

/// The spot fields a city list carries with each hangout.
struct SpotRef: Codable, Hashable, Sendable {
    let id: String
    let name: String
    let kind: SpotKind
    let address: String?
    /// PROPOSED: the district, so city lists can show it without a second request.
    var neighborhood: String?
}

struct MemberPreview: Codable, Hashable, Sendable {
    let nickname: String
}

/// A hangout as listed on a city page (HangoutSchema extended with spot, counts and preview).
struct HangoutSummary: Codable, Hashable, Identifiable, Sendable {
    let id: String
    let citySlug: String
    let spotId: String
    let startsAt: Date
    let vibe: Vibe
    let maxSize: Int
    let language: HangoutLanguage
    let status: HangoutStatus
    let expiresAt: Date
    let createdAt: Date
    let spot: SpotRef
    let memberCount: Int
    let spotsLeft: Int
    /// First members by join time, at most 5 (avatar stack).
    var memberPreview: [MemberPreview]?
    /// PROPOSED: a short headline written by the host.
    var title: String?
    /// PROPOSED: one or two lines from the host about the plan.
    var note: String?
}

/// A member as other members see them. Never includes a device id.
struct Member: Codable, Hashable, Identifiable, Sendable {
    let id: String
    let hangoutId: String
    let nickname: String
    /// Visible to members of the same hangout only; null for everyone else.
    let about: String?
    let role: MemberRole
    let arrivedAt: Date?
    let joinedAt: Date
}

struct Message: Codable, Hashable, Identifiable, Sendable {
    let id: String
    let hangoutId: String
    let memberId: String
    let authorNickname: String
    let kind: MessageKind
    let body: String
    let createdAt: Date
}

// MARK: - Responses

struct ListCitiesResponse: Codable, Sendable { let cities: [CityListItem] }

struct CityTonightResponse: Codable, Sendable {
    let city: City
    let hangouts: [HangoutSummary]
    let peopleTonight: Int
}

struct ListSpotsResponse: Codable, Sendable {
    let city: City
    let spots: [Spot]
}

struct SpotResponse: Codable, Sendable { let spot: Spot }

struct HangoutDetail: Codable, Sendable {
    let hangout: HangoutSummary
    let spot: Spot
    /// Who is going, shown plainly like Luma.
    let members: [Member]
    /// The current device's membership, or nil for a visitor.
    let viewerMemberId: String?
}

struct JoinHangoutResponse: Codable, Sendable {
    let hangout: HangoutSummary
    let member: Member
}

typealias CreateHangoutResponse = JoinHangoutResponse

struct Membership: Codable, Hashable, Sendable {
    let hangoutId: String
    let memberId: String
    let role: MemberRole
}

struct MeResponse: Codable, Sendable { let memberships: [Membership] }

struct ShareLinksResponse: Codable, Sendable {
    let url: String
    let text: String
    let whatsappUrl: String
}

struct OkResponse: Codable, Sendable { let ok: Bool }

// MARK: - Requests

/// What a person enters to join or host. `ageConfirmed` is literally `true` in the contract.
struct JoinProfile: Codable, Hashable, Sendable {
    let nickname: String
    var about: String?
    let ageConfirmed: Bool

    init(nickname: String, about: String? = nil) {
        self.nickname = nickname
        self.about = about
        ageConfirmed = true
    }
}

typealias JoinHangoutRequest = JoinProfile

struct CreateHangoutRequest: Codable, Sendable {
    let citySlug: String
    /// Must be a curated spot of citySlug: no free-text places.
    let spotId: String
    let startsAt: Date
    let vibe: Vibe
    let maxSize: Int
    let language: HangoutLanguage
    let host: JoinProfile
}

struct ReportRequest: Codable, Sendable {
    let targetType: ReportTarget
    let targetId: String
    let hangoutId: String
    let reason: ReportReason
    var details: String?
}

struct BlockRequest: Codable, Sendable { let memberId: String }

// MARK: - Errors

enum ApiErrorCode: String, Codable, Sendable {
    case badRequest = "bad_request"
    case noDevice = "no_device"
    case forbidden
    case notFound = "not_found"
    case hangoutFull = "hangout_full"
    case hangoutClosed = "hangout_closed"
    case alreadyMember = "already_member"
    case rateLimited = "rate_limited"
    case contentRejected = "content_rejected"
    case notImplemented = "not_implemented"
    case `internal`
}

struct ApiErrorBody: Codable, Sendable {
    struct Detail: Codable, Sendable {
        let code: ApiErrorCode
        let message: String
    }

    let error: Detail
}

// MARK: - Coding

nonisolated enum ContractCoding {
    /// ISO 8601 with offset; the Worker sends `toISOString()` (fractional seconds, Z), tests may omit fractions.
    static func decoder() -> JSONDecoder {
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .custom { decoder in
            let container = try decoder.singleValueContainer()
            let raw = try container.decode(String.self)
            if let date = parseDate(raw) { return date }
            throw DecodingError.dataCorruptedError(in: container, debugDescription: "Not an ISO 8601 timestamp: \(raw)")
        }
        return decoder
    }

    static func encoder() -> JSONEncoder {
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .custom { date, encoder in
            var container = encoder.singleValueContainer()
            try container.encode(formatDate(date))
        }
        return encoder
    }

    static func parseDate(_ raw: String) -> Date? {
        if let date = try? Date(raw, strategy: Date.ISO8601FormatStyle(includingFractionalSeconds: true)) { return date }
        return try? Date(raw, strategy: Date.ISO8601FormatStyle())
    }

    static func formatDate(_ date: Date) -> String {
        date.formatted(Date.ISO8601FormatStyle(includingFractionalSeconds: true))
    }
}
