import Foundation

// Display copy for contract enums, shared with the web prototype (apps/web/src/components/labels.ts).

extension Vibe {
    var label: String {
        switch self {
        case .chill: "Chill drinks"
        case .bar: "Bar night"
        case .club: "Dancing"
        case .culture: "Live music"
        }
    }

    var blurb: String {
        switch self {
        case .chill: "A drink, easy company"
        case .bar: "Good bars, good talks"
        case .club: "Warm up, then dance"
        case .culture: "Bands, jazz, culture"
        }
    }

    var symbol: String {
        switch self {
        case .chill: "wineglass"
        case .bar: "bubble.left.and.bubble.right"
        case .club: "sparkles"
        case .culture: "music.note"
        }
    }

    /// The `about` line a member shows to their group (web join flow).
    var aboutLine: String {
        switch self {
        case .chill: "Up for chill drinks"
        case .bar: "Here for good talks"
        case .club: "Ready to dance later"
        case .culture: "Here for the music"
        }
    }
}

extension SpotKind {
    var label: String {
        switch self {
        case .bar: "Bar"
        case .pub: "Pub"
        case .nightclub: "Club"
        case .biergarten: "Beer garden"
        case .cafe: "Café"
        case .venue: "Venue"
        }
    }

    var plural: String {
        switch self {
        case .bar: "Bars"
        case .pub: "Pubs"
        case .nightclub: "Clubs"
        case .biergarten: "Beer gardens"
        case .cafe: "Cafés"
        case .venue: "Venues"
        }
    }

    /// Original artwork per kind (apps/web/src/assets/img, same blue-hour style).
    var artwork: String {
        switch self {
        case .bar, .cafe: "Spot-bar"
        case .pub: "Spot-pub"
        case .nightclub, .venue: "Spot-nightclub"
        case .biergarten: "Spot-biergarten"
        }
    }
}

extension HangoutLanguage {
    var label: String {
        switch self {
        case .de: "German"
        case .en: "English"
        case .es: "Spanish"
        case .fr: "French"
        case .it: "Italian"
        case .tr: "Turkish"
        case .any: "Any language"
        }
    }

    /// The language's own name, shown first in the language picker.
    var endonym: String {
        switch self {
        case .de: "Deutsch"
        case .en: "English"
        case .es: "Español"
        case .fr: "Français"
        case .it: "Italiano"
        case .tr: "Türkçe"
        case .any: "Any"
        }
    }
}

extension HangoutSummary {
    /// The host's headline when there is one, otherwise a plain description of the plan.
    var displayTitle: String { title ?? "\(vibe.label) at \(spot.name)" }

    /// Neighborhood when mapped, otherwise the street without its number.
    var place: String { SpotPlace.format(neighborhood: spot.neighborhood, address: spot.address) }

    var names: [String] { memberPreview?.map(\.nickname) ?? [] }
}

extension Spot {
    var place: String { SpotPlace.format(neighborhood: neighborhood, address: address) }
    var summary: String? { descriptionEn ?? descriptionDe }
}

enum SpotPlace {
    static func format(neighborhood: String?, address: String?) -> String {
        if let neighborhood { return neighborhood }
        guard let address else { return "" }
        return address.replacingOccurrences(of: #"\s+\d+[a-zA-Z-]*$"#, with: "", options: .regularExpression)
    }
}

enum CityCopy {
    /// Presentation copy the API does not carry (web: src/data/cityMeta.ts).
    static func blurb(_ slug: String) -> String {
        switch slug {
        case "berlin": "Kiez bars, beer gardens and clubs that open when other cities close. Most hangouts start in Kreuzberg, Neukölln and Prenzlauer Berg."
        case "hamburg": "Harbour air, St. Pauli music bars and beach clubs on the Elbe."
        case "munich": "Beer gardens under chestnut trees and late bars around Gärtnerplatz."
        case "cologne": "Kölsch in small glasses, Ehrenfeld clubs and the friendliest bar counters in Germany."
        case "amsterdam": "Brown cafés on the canals, jazz on Leidseplein and terraces until late."
        case "barcelona": "Dinner at ten, vermouth bars in El Born and dancing after midnight."
        case "lisbon": "Bairro Alto street bars, miradouros at sunset and jazz in the old town."
        case "prague": "Pivnice with long tables, jazz cellars and beer gardens above the river."
        default: "Small groups meeting at public spots tonight."
        }
    }

    static func country(_ code: String) -> String {
        Locale(identifier: "en_GB").localizedString(forRegionCode: code) ?? code
    }

    static func artwork(_ slug: String) -> String { "City-\(slug)" }
}

enum Pluralize {
    static func seats(_ count: Int) -> String { count == 1 ? "1 seat left" : "\(count) seats left" }
    static func going(_ count: Int) -> String { "\(count) going" }
    static func hangouts(_ count: Int) -> String { count == 1 ? "1 hangout" : "\(count) hangouts" }
}
