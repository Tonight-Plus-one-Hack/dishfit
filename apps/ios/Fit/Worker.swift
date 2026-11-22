import Foundation
import MapKit

struct NutrientRange: Codable {
    let value: Double
    let min: Double
    let max: Double
}

struct Macros: Codable {
    var kcal: Double
    var protein: Double
    var carbs: Double
    var fat: Double

    static let zero = Self(kcal: 0, protein: 0, carbs: 0, fat: 0)

    func adding(_ other: Self) -> Self {
        Self(kcal: kcal + other.kcal, protein: protein + other.protein,
             carbs: carbs + other.carbs, fat: fat + other.fat)
    }
}

struct Nutrition: Decodable {
    let kcal, proteinG, carbsG, fatG: NutrientRange
    let source: String
    let method: String

    var macros: Macros {
        Macros(kcal: kcal.value, protein: proteinG.value, carbs: carbsG.value, fat: fatG.value)
    }
}

struct Restaurant: Decodable, Identifiable {
    struct Location: Decodable {
        let lat: Double
        let lng: Double
    }

    let id: String
    let name: String
    let kiez: String
    let location: Location?

    var coordinate: CLLocationCoordinate2D? {
        guard let location else { return nil }
        let coordinate = CLLocationCoordinate2D(latitude: location.lat, longitude: location.lng)
        return CLLocationCoordinate2DIsValid(coordinate) ? coordinate : nil
    }
}

struct DiscoveryKiez: Decodable, Identifiable, Sendable {
    let slug: String
    let name: String
    let restaurantCount: Int

    var id: String { slug }

    static let central = [
        Self(slug: "mitte", name: "Mitte", restaurantCount: 0),
        Self(slug: "kreuzberg", name: "Kreuzberg", restaurantCount: 0),
        Self(slug: "prenzlauer-berg", name: "Prenzlauer Berg", restaurantCount: 0),
        Self(slug: "friedrichshain", name: "Friedrichshain", restaurantCount: 0),
        Self(slug: "neukoelln", name: "Neukölln", restaurantCount: 0),
    ]
}

enum DiscoveryScope: Equatable {
    case central, berlin, kiez(String)

    var query: [URLQueryItem] {
        switch self {
        case .central:
            // A fixed public map origin for the default catalogue.
            [URLQueryItem(name: "lat", value: "52.516"), URLQueryItem(name: "lng", value: "13.402"), URLQueryItem(name: "radiusM", value: "4000")]
        case .berlin: []
        case let .kiez(slug): [URLQueryItem(name: "kiez", value: slug)]
        }
    }
}

struct Dish: Decodable, Identifiable {
    struct Artwork: Decodable {
        let key: String
    }

    let id: String
    let name: String
    let description: String?
    let category: String?
    let priceCents: Int?
    let healthScore: Double?
    let nutrition: Nutrition
    let image: Artwork?
    let restaurant: Restaurant?

    var displayName: String {
        name == name.uppercased() ? name.capitalized(with: .german) : name
    }
}

struct DishDetail: Decodable {
    let dish: Dish
    let restaurant: Restaurant
}

struct MenuReading: Decodable {
    let restaurantName: String?
    let dishes: [MenuDish]
}

struct MenuDish: Decodable {
    struct Estimate: Decodable {
        struct Range: Decodable {
            let value, low, high: Double
        }

        let kcal, protein, carbs, fat: Range
    }

    let name: String
    let description: String?
    let priceEur: Double?
    let nutrients: Estimate

    var macros: Macros {
        Macros(kcal: nutrients.kcal.value, protein: nutrients.protein.value,
               carbs: nutrients.carbs.value, fat: nutrients.fat.value)
    }

    /// Grams of protein per 100 kcal: how the scan ranks a menu.
    var proteinDensity: Double {
        nutrients.protein.value * 100 / max(nutrients.kcal.value, 1)
    }
}

struct MenuScan: Decodable {
    let mode: String
    let menu: MenuReading
}

struct Confirmations: Decodable {
    struct Vote: Decodable { let verdict: String }

    let yes: Int
    let no: Int
    let mine: Vote?
}

struct Worker {
    enum Failure: LocalizedError {
        /// A non-2xx answer, with the Worker's own German message when it sent one.
        case response(Int, String?)
        case noDishes
        case image

        var errorDescription: String? {
            switch self {
            case .response(_, let message?): message
            case .response(429, nil): "Zu viele Anfragen. Versuch es später noch einmal."
            case .response(422, nil): "Die Speisekarte war nicht lesbar. Versuch ein schärferes Foto."
            case .response(503, nil): "Menüscans sind gerade nicht verfügbar."
            case .response: "Der Server konnte die Anfrage gerade nicht beantworten."
            case .noDishes: "Auf dem Foto wurden keine Gerichte gefunden."
            case .image: "Das Foto konnte nicht verarbeitet werden."
            }
        }
    }

    private struct ErrorBody: Decodable {
        struct Detail: Decodable { let message: String? }
        let error: Detail
    }

    private let baseURL: URL

    static let defaultBaseURL = URL(string: "https://wohin.batubln.workers.dev")!

    /// The base comes from the `FIT_API_BASE_URL` environment variable (handy in the simulator),
    /// then the `FitAPIBaseURL` Info.plist key (build setting `FIT_API_BASE_URL`), then production.
    init(bundle: Bundle = .main, environment: [String: String] = ProcessInfo.processInfo.environment) {
        let candidates = [environment["FIT_API_BASE_URL"], bundle.object(forInfoDictionaryKey: "FitAPIBaseURL") as? String]
        baseURL = candidates.lazy.compactMap { $0.flatMap(Self.acceptable) }.first ?? Self.defaultBaseURL
    }

    /// HTTPS anywhere; plain HTTP only for a Worker running on this Mac.
    static func acceptable(_ text: String) -> URL? {
        guard let url = URL(string: text.trimmingCharacters(in: .whitespaces)), let host = url.host() else { return nil }
        let local = host == "localhost" || host == "127.0.0.1"
        return url.scheme == "https" || (url.scheme == "http" && local) ? url : nil
    }

    private func url(_ path: String) -> URL {
        baseURL.appending(path: path)
    }

    private func read<Value: Decodable>(_ request: URLRequest) async throws -> Value {
        let (data, response) = try await URLSession.shared.data(for: request)
        guard let http = response as? HTTPURLResponse else { throw Failure.response(0, nil) }
        guard (200..<300).contains(http.statusCode) else {
            let message = try? JSONDecoder().decode(ErrorBody.self, from: data).error.message
            throw Failure.response(http.statusCode, message?.isEmpty == false ? message : nil)
        }
        return try JSONDecoder().decode(Value.self, from: data)
    }

    func kieze() async throws -> [DiscoveryKiez] {
        struct Response: Decodable { let kieze: [DiscoveryKiez] }
        let response: Response = try await read(URLRequest(url: url("api/kieze")))
        return response.kieze.filter { $0.restaurantCount > 0 }
    }

    func dishes(scope: DiscoveryScope) async throws -> [Dish] {
        if scope == .berlin {
            // Fetch the same public districts for every Berlin location so no request reveals where the user is.
            let kieze = try await kieze()
            var dishes: [Dish] = []
            for start in stride(from: 0, to: kieze.count, by: 4) {
                let batch = kieze[start..<min(start + 4, kieze.count)]
                let rows = try await withThrowingTaskGroup(of: [Dish].self) { group in
                    for kiez in batch {
                        group.addTask { try await rankedDishes(scope: .kiez(kiez.slug)) }
                    }
                    return try await group.reduce(into: []) { $0 += $1 }
                }
                dishes += rows
            }
            return dishes
        }
        return try await rankedDishes(scope: scope)
    }

    private func rankedDishes(scope: DiscoveryScope) async throws -> [Dish] {
        struct Response: Decodable { let dishes: [Dish] }

        let address = url("api/dishes/top").appending(queryItems: [
            URLQueryItem(name: "sort", value: "health"),
            URLQueryItem(name: "limit", value: "24"),
        ] + scope.query)
        let response: Response = try await read(URLRequest(url: address))
        return response.dishes
    }

    func restaurants(scope: DiscoveryScope) async throws -> [Restaurant] {
        struct Response: Decodable { let restaurants: [Restaurant] }

        let address = url("api/restaurants").appending(queryItems: scope.query)
        let response: Response = try await read(URLRequest(url: address))
        return response.restaurants
    }

    func detail(_ id: String) async throws -> DishDetail {
        try await read(URLRequest(url: url("api/dishes").appending(component: id)))
    }

    func confirmations(_ id: String) async throws -> Confirmations {
        try await read(URLRequest(url: url("api/dishes").appending(component: id).appending(path: "confirmations")))
    }

    func imageURL(_ artwork: Dish.Artwork) -> URL? {
        let parts = artwork.key.split(separator: "/", omittingEmptySubsequences: false)
        guard parts.count == 2, parts[0] == "ai", !parts[1].isEmpty else { return nil }
        return url("api/images/ai").appending(component: String(parts[1]))
    }

    func scanMenu(_ jpeg: Data) async throws -> MenuScan {
        struct Response: Decodable { let scan: MenuScan }

        let boundary = "Fit-" + UUID().uuidString
        var body = Data("""
        --\(boundary)\r
        Content-Disposition: form-data; name="kind"\r
        \r
        menu\r
        --\(boundary)\r
        Content-Disposition: form-data; name="photo"; filename="menu.jpg"\r
        Content-Type: image/jpeg\r
        \r

        """.utf8)
        body.append(jpeg)
        body.append(Data("\r\n--\(boundary)--\r\n".utf8))

        var request = URLRequest(url: url("api/scans"), timeoutInterval: 45)
        request.httpMethod = "POST"
        request.setValue("multipart/form-data; boundary=\(boundary)", forHTTPHeaderField: "Content-Type")
        request.httpBody = body
        let response: Response = try await read(request)
        guard !response.scan.menu.dishes.isEmpty else { throw Failure.noDishes }
        return response.scan
    }
}

extension Locale {
    static let german = Locale(identifier: "de_DE")
}

extension BinaryFloatingPoint {
    var fitNumber: String {
        Double(self).formatted(.number.precision(.fractionLength(0)).locale(.german))
    }

    var fitPrice: String {
        Double(self).formatted(.currency(code: "EUR").locale(.german))
    }
}
