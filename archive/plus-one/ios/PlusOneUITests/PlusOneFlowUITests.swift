import XCTest

/// End-to-end walk through the app as a first-time user: onboarding, the result card, joining, the hangout page,
/// Tonight, the city picker, starting a hangout, Spots, a spot page and You.
/// Set `TEST_RUNNER_PLUSONE_SHOTS_DIR` to save a PNG of every screen (apps/ios/scripts/capture.sh does this).
final class PlusOneFlowUITests: XCTestCase {
    private var app: XCUIApplication!
    private var shotIndex = 0

    override func setUp() {
        continueAfterFailure = false
        app = XCUIApplication()
        app.launchArguments = ["-PlusOneResetState", "-PlusOneNoLatency", "-PlusOneNow", "2026-11-21T18:00:00+01:00"]
        addUIInterruptionMonitor(withDescription: "Notifications") { alert in
            let allow = alert.buttons["Allow"]
            guard allow.exists else { return false }
            allow.tap()
            return true
        }
    }

    func testFirstNightFlow() throws {
        app.launch()

        // Welcome: the hero choreography finishes at about 3 s.
        let start = app.buttons["onboarding.start"]
        XCTAssertTrue(start.waitForExistence(timeout: 10))
        pause(3.4)
        shot("onboarding-01-welcome")
        start.tap()

        // City
        let berlin = app.buttons["city.berlin"]
        XCTAssertTrue(berlin.waitForExistence(timeout: 5))
        pause(1.0)
        berlin.tap()
        pause(1.2)
        shot("onboarding-02-city")
        tapContinue()

        // Name
        let field = app.textFields["onboarding.nickname"]
        XCTAssertTrue(field.waitForExistence(timeout: 5))
        pause(0.8)
        dismissKeyboardTip()
        field.tap()
        field.typeText("Robin")
        pause(0.8)
        shot("onboarding-03-name")
        tapContinue()

        // Age: neutral birth-year wheel
        let wheel = app.pickerWheels.firstMatch
        XCTAssertTrue(wheel.waitForExistence(timeout: 5))
        pause(0.6)
        wheel.adjust(toPickerWheelValue: "1999")
        pause(1.0)
        shot("onboarding-04-age")
        tapContinue()

        // Mood bubbles
        let chill = app.buttons["mood.chill"]
        XCTAssertTrue(chill.waitForExistence(timeout: 5))
        pause(1.2)
        chill.tap()
        pause(0.5)
        app.buttons["mood.culture"].tap()
        pause(1.2)
        shot("onboarding-05-mood")
        tapContinue()

        // Time
        let evening = app.buttons["time.evening"]
        XCTAssertTrue(evening.waitForExistence(timeout: 5))
        pause(0.8)
        evening.tap()
        pause(1.0)
        shot("onboarding-06-time")
        tapContinue()

        // Group size
        let small = app.buttons["size.small"]
        XCTAssertTrue(small.waitForExistence(timeout: 5))
        pause(0.8)
        small.tap()
        pause(1.0)
        shot("onboarding-07-size")
        tapContinue()

        // Languages: the phone's language is preselected; add German
        let german = app.buttons["language.de"]
        XCTAssertTrue(german.waitForExistence(timeout: 5))
        pause(0.8)
        if !german.isSelected { german.tap() }
        if !app.buttons["language.en"].isSelected { app.buttons["language.en"].tap() }
        pause(1.0)
        shot("onboarding-08-languages")
        tapContinue()

        // Safety and social proof
        pause(2.2)
        shot("onboarding-09-safety")
        tapContinue()

        // Notifications permission with preview
        let allow = app.buttons["onboarding.allowNotifications"]
        XCTAssertTrue(allow.waitForExistence(timeout: 5))
        pause(1.8)
        shot("onboarding-10-notifications")
        allow.tap()
        pause(1.0)
        app.tap() // lets the interruption monitor answer the system alert
        let springboardAllow = XCUIApplication(bundleIdentifier: "com.apple.springboard").buttons["Allow"]
        if springboardAllow.waitForExistence(timeout: 2) { springboardAllow.tap() }

        // Matching
        pause(1.3)
        shot("onboarding-11-matching")

        // Result card
        let join = app.buttons["result.join"]
        XCTAssertTrue(join.waitForExistence(timeout: 10))
        pause(1.8)
        shot("onboarding-12-result")
        join.tap()

        // Joined confirmation
        let open = app.buttons["joined.open"]
        XCTAssertTrue(open.waitForExistence(timeout: 10))
        pause(2.2)
        shot("app-01-joined")
        open.tap()

        // Hangout page
        pause(1.6)
        shot("app-02-hangout")
        app.swipeUp()
        pause(1.0)
        shot("app-03-hangout-people")

        // Back to Tonight
        app.navigationBars.buttons.element(boundBy: 0).tap()
        pause(2.4)
        shot("app-04-tonight")
        app.swipeUp()
        pause(1.4)
        shot("app-05-tonight-best")
        app.swipeUp()
        pause(1.4)
        shot("app-06-tonight-timeline")

        // Join sheet on another hangout
        let cards = app.buttons.matching(identifier: "hangout.card")
        let other = cards.allElementsBoundByIndex.first { $0.isHittable && !$0.label.contains("You're going") && !$0.label.contains("Full") }
        if let other {
            other.tap()
            let joinButton = app.buttons["hangout.join"]
            if joinButton.waitForExistence(timeout: 5) {
                pause(1.4)
                shot("app-07-hangout-visitor")
                joinButton.tap()
                XCTAssertTrue(app.buttons["join.confirm"].waitForExistence(timeout: 5))
                pause(1.0)
                shot("app-08-join-sheet")
                app.swipeDown(velocity: .fast)
                pause(0.8)
            }
            app.navigationBars.buttons.element(boundBy: 0).tap()
            pause(0.8)
        }

        // Start a hangout
        for _ in 0..<4 where !app.buttons["tonight.start"].isHittable { app.swipeUp() }
        if app.buttons["tonight.start"].isHittable {
            app.buttons["tonight.start"].tap()
            pause(1.6)
            shot("app-09-start-hangout")
            app.buttons["Cancel"].tap()
            pause(0.8)
        }

        // City picker
        app.buttons["tonight.cityPicker"].tap()
        XCTAssertTrue(app.buttons["cityPicker.berlin"].waitForExistence(timeout: 5))
        pause(1.2)
        shot("app-10-city-picker")
        app.buttons["cityPicker.berlin"].tap()
        pause(0.8)

        // Spots
        app.tabBars.buttons["Spots"].tap()
        pause(2.6)
        shot("app-11-spots")
        app.swipeUp()
        pause(1.4)
        shot("app-12-spots-cards")
        let clubs = app.buttons["spots.filter.nightclub"]
        if clubs.waitForExistence(timeout: 3), clubs.isHittable {
            clubs.tap()
            pause(1.4)
            shot("app-13-spots-clubs")
        }
        let spotCard = app.descendants(matching: .any).matching(identifier: "spot.card").firstMatch
        if spotCard.waitForExistence(timeout: 3) {
            spotCard.images.firstMatch.tap()
            pause(1.6)
            shot("app-14-spot")
            app.navigationBars.buttons.element(boundBy: 0).tap()
            pause(0.6)
        }

        // You
        app.tabBars.buttons["You"].tap()
        pause(1.6)
        shot("app-15-you")
        app.swipeUp()
        pause(1.0)
        shot("app-16-you-privacy")
    }

    // MARK: - Helpers

    private func tapContinue() {
        let button = app.buttons["onboarding.continue"]
        XCTAssertTrue(button.waitForExistence(timeout: 5))
        XCTAssertTrue(button.isEnabled)
        button.tap()
        pause(0.5)
    }

    /// The simulator's one-time keyboard tip covers the bottom of the screen on first use.
    private func dismissKeyboardTip() {
        let tip = app.buttons.matching(NSPredicate(format: "label == 'Continue' AND identifier != 'onboarding.continue'")).firstMatch
        if tip.waitForExistence(timeout: 1.5) { tip.tap() }
    }

    private func pause(_ seconds: Double) {
        RunLoop.current.run(until: Date().addingTimeInterval(seconds))
    }

    private func shot(_ name: String) {
        let screenshot = XCUIScreen.main.screenshot()
        let attachment = XCTAttachment(screenshot: screenshot)
        attachment.name = name
        attachment.lifetime = .keepAlways
        add(attachment)
        guard let dir = ProcessInfo.processInfo.environment["PLUSONE_SHOTS_DIR"], !dir.isEmpty else { return }
        shotIndex += 1
        let url = URL(fileURLWithPath: dir).appendingPathComponent("\(name).png")
        try? FileManager.default.createDirectory(atPath: dir, withIntermediateDirectories: true)
        try? screenshot.pngRepresentation.write(to: url)
    }
}
