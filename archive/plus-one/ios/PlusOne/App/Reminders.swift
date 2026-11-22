import Foundation
import UserNotifications

/// Local reminders only: 30 minutes before a joined hangout starts. Group updates ("someone joined") need push
/// from the Worker, which is a later step; the permission screen asks once for both.
enum Reminders {
    static let leadTime: TimeInterval = 30 * 60

    static func requestAuthorization() async -> Bool {
        (try? await UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound, .badge])) ?? false
    }

    static func isAuthorized() async -> Bool {
        let settings = await UNUserNotificationCenter.current().notificationSettings()
        return settings.authorizationStatus == .authorized || settings.authorizationStatus == .provisional
    }

    static func scheduleStart(for hangout: HangoutSummary, timeZone: TimeZone) async {
        guard await isAuthorized() else { return }
        let fireDate = hangout.startsAt.addingTimeInterval(-leadTime)
        guard fireDate > Date() else { return }
        let content = UNMutableNotificationContent()
        content.title = "Starting in 30 minutes"
        let time = TonightClock(timeZone: timeZone).time(hangout.startsAt)
        content.body = "\(hangout.spot.name) at \(time). Meet the group inside the venue."
        content.sound = .default
        let trigger = UNTimeIntervalNotificationTrigger(timeInterval: fireDate.timeIntervalSinceNow, repeats: false)
        let request = UNNotificationRequest(identifier: identifier(hangout.id), content: content, trigger: trigger)
        try? await UNUserNotificationCenter.current().add(request)
    }

    static func cancel(hangoutID: String) {
        UNUserNotificationCenter.current().removePendingNotificationRequests(withIdentifiers: [identifier(hangoutID)])
    }

    static func cancelAll() {
        UNUserNotificationCenter.current().removeAllPendingNotificationRequests()
    }

    private static func identifier(_ hangoutID: String) -> String { "hangout-start-\(hangoutID)" }
}
