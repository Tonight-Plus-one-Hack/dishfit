import Foundation
import Observation
import SwiftUI

enum AppTab: Hashable {
    case tonight, spots, you
}

enum Route: Hashable {
    case hangout(String)
    case spot(String)
}

/// App-wide state: the API, the on-device profile and this device's memberships.
@Observable
final class AppModel {
    let api: PlusOneAPI
    /// The app's notion of "now"; fixed with `-PlusOneNow <ISO 8601>` for deterministic screenshots.
    let now: () -> Date

    var profile: Profile {
        didSet { if profile != oldValue { save() } }
    }

    private(set) var memberships: [String: Membership] = [:]
    var selectedTab: AppTab = .tonight
    var tonightPath: [Route] = []
    var spotsPath: [Route] = []
    var youPath: [Route] = []
    /// A hangout the person just joined from somewhere else (onboarding result); shows the confirmation.
    var justJoined: JoinedHangout?

    private let defaults: UserDefaults
    static let profileKey = "plusone.profile.v1"

    init(api: PlusOneAPI, now: @escaping () -> Date, defaults: UserDefaults = .standard) {
        self.api = api
        self.now = now
        self.defaults = defaults
        if let data = defaults.data(forKey: Self.profileKey), let saved = try? JSONDecoder().decode(Profile.self, from: data) {
            profile = saved
        } else {
            profile = Profile()
        }
    }

    /// Builds the model from launch arguments (used by UI tests and screenshot runs).
    static func live(arguments: [String] = ProcessInfo.processInfo.arguments) -> AppModel {
        let defaults = UserDefaults.standard
        if arguments.contains("-PlusOneResetState") {
            defaults.removeObject(forKey: profileKey)
            defaults.removeObject(forKey: MockAPI.stateKey)
        }
        let fixedNow = arguments.firstIndex(of: "-PlusOneNow").flatMap { index in
            arguments.indices.contains(index + 1) ? ContractCoding.parseDate(arguments[index + 1]) : nil
        }
        let launched = Date()
        // A fixed "now" still ticks forward from launch, so countdowns and expiry behave.
        let now: () -> Date = fixedNow.map { fixed in { fixed.addingTimeInterval(Date().timeIntervalSince(launched)) } } ?? Date.init
        let model = AppModel(api: APIConfiguration.makeAPI(arguments: arguments, clock: now), now: now, defaults: defaults)
        if arguments.contains("-PlusOneDemoProfile") {
            model.profile = Profile(
                nickname: "Robin", adultConfirmedAt: now(), citySlug: "berlin", vibes: [.chill, .culture],
                availableFrom: .evening, availableFromNight: model.clock(for: TimeZone(identifier: "Europe/Berlin")!).nightKey,
                groupSize: .small, languages: [.en, .de], savedSpotIDs: ["osm-node-1814188786"], onboardingCompleted: true
            )
        }
        return model
    }

    func clock(for timeZone: TimeZone) -> TonightClock {
        TonightClock(timeZone: timeZone, now: now())
    }

    // MARK: - Memberships

    func refreshMemberships() async {
        guard let response = try? await api.me() else { return }
        memberships = Dictionary(response.memberships.map { ($0.hangoutId, $0) }, uniquingKeysWith: { first, _ in first })
    }

    func isMember(_ hangoutID: String) -> Bool { memberships[hangoutID] != nil }

    @discardableResult
    func join(_ hangout: HangoutSummary, nickname: String? = nil, about: String? = nil, timeZone: TimeZone) async throws -> JoinHangoutResponse {
        let profileToSend = JoinProfile(nickname: nickname ?? profile.nickname, about: about ?? profile.aboutLine)
        let response = try await api.join(hangoutID: hangout.id, profile: profileToSend)
        memberships[hangout.id] = Membership(hangoutId: hangout.id, memberId: response.member.id, role: response.member.role)
        await Reminders.scheduleStart(for: response.hangout, timeZone: timeZone)
        return response
    }

    func create(_ request: CreateHangoutRequest, timeZone: TimeZone) async throws -> CreateHangoutResponse {
        let response = try await api.createHangout(request)
        memberships[response.hangout.id] = Membership(hangoutId: response.hangout.id, memberId: response.member.id, role: .host)
        await Reminders.scheduleStart(for: response.hangout, timeZone: timeZone)
        return response
    }

    func leave(_ hangoutID: String) async throws {
        try await api.leave(hangoutID: hangoutID)
        memberships[hangoutID] = nil
        Reminders.cancel(hangoutID: hangoutID)
    }

    // MARK: - Links

    /// Opens the web's share paths in the app: /h/:id, /c/:slug, /c/:slug/spots (docs/team-prompts section 7.1),
    /// from `plusone://h/<id>` today and from https share links once universal links are set up.
    func handle(_ url: URL) {
        let parts = DeepLink.parts(of: url)
        guard profile.onboardingCompleted else { return }
        switch parts.first {
        case "h" where parts.count >= 2:
            selectedTab = .tonight
            tonightPath = [.hangout(parts[1])]
        case "c" where parts.count >= 2:
            profile.citySlug = parts[1]
            if parts.count >= 3, parts[2] == "spots" {
                selectedTab = .spots
                spotsPath = []
            } else {
                selectedTab = .tonight
                tonightPath = []
            }
        case "s" where parts.count >= 2:
            selectedTab = .spots
            spotsPath = [.spot(parts[1])]
        case "you":
            selectedTab = .you
        default:
            selectedTab = .tonight
        }
    }

    // MARK: - Profile

    func isSaved(_ spotID: String) -> Bool { profile.savedSpotIDs.contains(spotID) }

    func toggleSaved(_ spotID: String) {
        if let index = profile.savedSpotIDs.firstIndex(of: spotID) {
            profile.savedSpotIDs.remove(at: index)
        } else {
            profile.savedSpotIDs.append(spotID)
        }
    }

    /// Deletes everything this app stored on the device and starts over at onboarding.
    func deleteLocalData() async {
        for hangoutID in memberships.keys { try? await api.leave(hangoutID: hangoutID) }
        Reminders.cancelAll()
        memberships = [:]
        defaults.removeObject(forKey: MockAPI.stateKey)
        tonightPath = []
        spotsPath = []
        youPath = []
        selectedTab = .tonight
        profile = Profile()
    }

    private func save() {
        if let data = try? JSONEncoder().encode(profile) { defaults.set(data, forKey: Self.profileKey) }
    }
}

enum DeepLink {
    /// Path segments for both `plusone://h/123` (host "h") and `https://example.com/h/123`.
    static func parts(of url: URL) -> [String] {
        var parts = url.pathComponents.filter { $0 != "/" }
        if url.scheme == "plusone", let host = url.host(), !host.isEmpty { parts.insert(host, at: 0) }
        return parts
    }
}

struct JoinedHangout: Identifiable, Equatable {
    let hangout: HangoutSummary
    let member: Member
    let timeZone: TimeZone
    var id: String { hangout.id }
}
