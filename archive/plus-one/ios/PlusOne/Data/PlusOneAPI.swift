import Foundation

/// The client side of the Worker API (docs/team-prompts/README.md, section 7.1). Screens only talk to this protocol;
/// `MockAPI` serves bundled data today and `LiveAPI` speaks HTTP to the Cloudflare Worker once it is deployed.
protocol PlusOneAPI: AnyObject, Sendable {
    /// True while the app runs on bundled demo data.
    var isDemo: Bool { get }

    func cities() async throws -> ListCitiesResponse
    func cityTonight(slug: String) async throws -> CityTonightResponse
    func spots(citySlug: String, vibe: Vibe?, kind: SpotKind?) async throws -> ListSpotsResponse
    func spot(id: String) async throws -> SpotResponse
    func hangout(id: String) async throws -> HangoutDetail
    func join(hangoutID: String, profile: JoinHangoutRequest) async throws -> JoinHangoutResponse
    func createHangout(_ request: CreateHangoutRequest) async throws -> CreateHangoutResponse
    /// Lane 1 stretch route: `POST /api/hangouts/:id/leave`.
    func leave(hangoutID: String) async throws
    func me() async throws -> MeResponse
    func report(_ request: ReportRequest) async throws
    func block(_ request: BlockRequest) async throws
    func shareLinks(hangoutID: String) async throws -> ShareLinksResponse
}

enum APIError: LocalizedError, Equatable {
    case server(status: Int, code: ApiErrorCode, message: String)
    case transport(String)
    case decoding(String)

    var code: ApiErrorCode? {
        if case let .server(_, code, _) = self { return code }
        return nil
    }

    var errorDescription: String? {
        switch self {
        case let .server(_, _, message): message
        case .transport: "Can't reach Plus One right now. Check your connection and try again."
        case .decoding: "Something went wrong on our side. Please try again."
        }
    }
}

/// Where the app gets its data. `PlusOneAPIBaseURL` in Info.plist comes from the `PLUS_ONE_API_BASE_URL` build
/// setting; empty means demo data. `-PlusOneAPIBaseURL https://...` on launch overrides it for testing.
enum APIConfiguration {
    static func makeAPI(arguments: [String] = ProcessInfo.processInfo.arguments,
                        bundle: Bundle = .main,
                        clock: @escaping () -> Date = Date.init) -> PlusOneAPI {
        if let url = baseURL(arguments: arguments, bundle: bundle) {
            return LiveAPI(baseURL: url)
        }
        return MockAPI(clock: clock, latency: arguments.contains("-PlusOneNoLatency") ? .zero : .milliseconds(240))
    }

    static func baseURL(arguments: [String], bundle: Bundle) -> URL? {
        if let index = arguments.firstIndex(of: "-PlusOneAPIBaseURL"), arguments.indices.contains(index + 1) {
            return URL(string: arguments[index + 1])
        }
        guard let raw = bundle.object(forInfoDictionaryKey: "PlusOneAPIBaseURL") as? String,
              !raw.trimmingCharacters(in: .whitespaces).isEmpty,
              let url = URL(string: raw), url.scheme == "https" || url.host == "localhost" else { return nil }
        return url
    }
}
