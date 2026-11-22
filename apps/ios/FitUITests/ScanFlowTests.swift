import XCTest

/// Drives the app the way a guest does, against the live Worker.
final class ScanFlowTests: XCTestCase {
    override func setUp() {
        continueAfterFailure = false
    }

    @MainActor
    func testDiscoverListsRankedDishes() {
        let app = XCUIApplication()
        app.launch()
        skipLocationIfShown(app)
        XCTAssertTrue(app.buttons["catalogDish-1"].waitForExistence(timeout: 20))
    }

    @MainActor
    func testExampleMenuScanTurnsIntoDishes() {
        let app = XCUIApplication()
        app.launch()
        skipLocationIfShown(app)
        app.tabBars.buttons["Scannen"].tap()
        app.buttons["useExample"].tap()
        app.buttons["readMenu"].tap()
        XCTAssertTrue(app.otherElements["scanDish-1"].waitForExistence(timeout: 60), "no dishes after the scan")
        XCTAssertTrue(app.buttons["scanAgain"].exists)
    }

    @MainActor
    private func skipLocationIfShown(_ app: XCUIApplication) {
        let later = app.buttons["skipDiscoveryLocation"]
        if later.exists { later.tap() }
    }
}
