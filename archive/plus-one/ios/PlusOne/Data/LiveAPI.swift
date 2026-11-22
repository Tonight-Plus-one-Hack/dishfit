import Foundation

/// HTTP client for the Cloudflare Worker (one `API` type with URLSession + Codable, per the playbook).
/// Identity is the Worker's httpOnly `wohin_device` cookie, which URLSession keeps in the shared cookie storage,
/// so no token handling is needed for the no-login MVP.
final class LiveAPI: PlusOneAPI {
    let baseURL: URL
    private let session: URLSession
    private let decoder = ContractCoding.decoder()
    private let encoder = ContractCoding.encoder()

    var isDemo: Bool { false }

    init(baseURL: URL, session: URLSession = LiveAPI.makeSession()) {
        self.baseURL = baseURL
        self.session = session
    }

    static func makeSession() -> URLSession {
        let configuration = URLSessionConfiguration.default
        configuration.httpCookieAcceptPolicy = .onlyFromMainDocumentDomain
        configuration.httpShouldSetCookies = true
        configuration.timeoutIntervalForRequest = 15
        configuration.waitsForConnectivity = false
        return URLSession(configuration: configuration)
    }

    func cities() async throws -> ListCitiesResponse {
        try await send("GET", "/api/cities")
    }

    func cityTonight(slug: String) async throws -> CityTonightResponse {
        try await send("GET", "/api/cities/\(slug.pathEscaped)")
    }

    func spots(citySlug: String, vibe: Vibe?, kind: SpotKind?) async throws -> ListSpotsResponse {
        var query: [URLQueryItem] = []
        if let vibe { query.append(URLQueryItem(name: "vibe", value: vibe.rawValue)) }
        if let kind { query.append(URLQueryItem(name: "kind", value: kind.rawValue)) }
        return try await send("GET", "/api/cities/\(citySlug.pathEscaped)/spots", query: query)
    }

    func spot(id: String) async throws -> SpotResponse {
        try await send("GET", "/api/spots/\(id.pathEscaped)")
    }

    func hangout(id: String) async throws -> HangoutDetail {
        try await send("GET", "/api/hangouts/\(id.pathEscaped)")
    }

    func join(hangoutID: String, profile: JoinHangoutRequest) async throws -> JoinHangoutResponse {
        try await send("POST", "/api/hangouts/\(hangoutID.pathEscaped)/join", body: profile)
    }

    func createHangout(_ request: CreateHangoutRequest) async throws -> CreateHangoutResponse {
        try await send("POST", "/api/hangouts", body: request)
    }

    func leave(hangoutID: String) async throws {
        let _: OkResponse = try await send("POST", "/api/hangouts/\(hangoutID.pathEscaped)/leave", body: [String: String]())
    }

    func me() async throws -> MeResponse {
        try await send("GET", "/api/me")
    }

    func report(_ request: ReportRequest) async throws {
        let _: OkResponse = try await send("POST", "/api/report", body: request)
    }

    func block(_ request: BlockRequest) async throws {
        let _: OkResponse = try await send("POST", "/api/block", body: request)
    }

    func shareLinks(hangoutID: String) async throws -> ShareLinksResponse {
        try await send("GET", "/api/share/hangout/\(hangoutID.pathEscaped)")
    }

    // MARK: - Transport

    func makeRequest(_ method: String, _ path: String, query: [URLQueryItem] = [], body: Data? = nil) -> URLRequest {
        var components = URLComponents(url: baseURL, resolvingAgainstBaseURL: false)!
        components.percentEncodedPath = components.percentEncodedPath.trimmingSuffix("/") + path
        components.queryItems = query.isEmpty ? nil : query
        var request = URLRequest(url: components.url!)
        request.httpMethod = method
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        if let body {
            request.httpBody = body
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        }
        return request
    }

    private func send<Response: Decodable>(_ method: String, _ path: String, query: [URLQueryItem] = []) async throws -> Response {
        try await perform(makeRequest(method, path, query: query))
    }

    private func send<Response: Decodable>(_ method: String, _ path: String, body: some Encodable) async throws -> Response {
        let data: Data
        do { data = try encoder.encode(body) } catch { throw APIError.decoding(String(describing: error)) }
        return try await perform(makeRequest(method, path, body: data))
    }

    private func perform<Response: Decodable>(_ request: URLRequest) async throws -> Response {
        let data: Data
        let response: URLResponse
        do {
            (data, response) = try await session.data(for: request)
        } catch {
            throw APIError.transport(error.localizedDescription)
        }
        let status = (response as? HTTPURLResponse)?.statusCode ?? 0
        guard (200..<300).contains(status) else {
            if let body = try? decoder.decode(ApiErrorBody.self, from: data) {
                throw APIError.server(status: status, code: body.error.code, message: body.error.message)
            }
            throw APIError.server(status: status, code: .internal, message: "Unexpected response (\(status)).")
        }
        do {
            return try decoder.decode(Response.self, from: data)
        } catch {
            throw APIError.decoding(String(describing: error))
        }
    }
}

private extension String {
    var pathEscaped: String {
        addingPercentEncoding(withAllowedCharacters: .urlPathAllowed.subtracting(CharacterSet(charactersIn: "/"))) ?? self
    }

    func trimmingSuffix(_ suffix: String) -> String {
        hasSuffix(suffix) ? String(dropLast(suffix.count)) : self
    }
}
