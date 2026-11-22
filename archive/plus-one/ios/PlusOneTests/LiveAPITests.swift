import Foundation
import Testing
@testable import PlusOne

/// LiveAPI against a stubbed URLSession: paths, bodies and the contract's error shape.
@Suite("LiveAPI", .serialized)
struct LiveAPITests {
    func makeAPI(status: Int, body: String) -> LiveAPI {
        StubProtocol.response = (status, Data(body.utf8))
        let configuration = URLSessionConfiguration.ephemeral
        configuration.protocolClasses = [StubProtocol.self]
        return LiveAPI(baseURL: URL(string: "https://staging.example.dev")!, session: URLSession(configuration: configuration))
    }

    @Test func buildsContractPaths() {
        let api = LiveAPI(baseURL: URL(string: "https://staging.example.dev/")!)
        let spots = api.makeRequest("GET", "/api/cities/berlin/spots", query: [URLQueryItem(name: "kind", value: "pub")])
        #expect(spots.url?.absoluteString == "https://staging.example.dev/api/cities/berlin/spots?kind=pub")
        let join = api.makeRequest("POST", "/api/hangouts/abc/join", body: Data("{}".utf8))
        #expect(join.httpMethod == "POST")
        #expect(join.value(forHTTPHeaderField: "Content-Type") == "application/json")
    }

    @Test func mapsErrorBodies() async throws {
        let api = makeAPI(status: 409, body: #"{"error":{"code":"hangout_full","message":"This hangout just filled up."}}"#)
        do {
            _ = try await api.join(hangoutID: "abc", profile: JoinProfile(nickname: "Robin"))
            Issue.record("expected an error")
        } catch let error as APIError {
            #expect(error == .server(status: 409, code: .hangoutFull, message: "This hangout just filled up."))
        }
        #expect(StubProtocol.lastRequest?.url?.path() == "/api/hangouts/abc/join")
    }

    @Test func decodesMe() async throws {
        let api = makeAPI(status: 200, body: #"{"memberships":[{"hangoutId":"h1","memberId":"m1","role":"host"}]}"#)
        let me = try await api.me()
        #expect(me.memberships == [Membership(hangoutId: "h1", memberId: "m1", role: .host)])
    }
}

nonisolated final class StubProtocol: URLProtocol, @unchecked Sendable {
    nonisolated(unsafe) static var response: (Int, Data) = (200, Data())
    nonisolated(unsafe) static var lastRequest: URLRequest?

    override class func canInit(with request: URLRequest) -> Bool { true }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }

    override func startLoading() {
        Self.lastRequest = request
        let (status, data) = Self.response
        let response = HTTPURLResponse(url: request.url!, statusCode: status, httpVersion: nil,
                                       headerFields: ["Content-Type": "application/json"])!
        client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
        client?.urlProtocol(self, didLoad: data)
        client?.urlProtocolDidFinishLoading(self)
    }

    override func stopLoading() {}
}
