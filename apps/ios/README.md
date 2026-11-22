# DishFit for iOS

A native SwiftUI app (iOS 26+) for the same product as `apps/web`: healthy dishes in Berlin on a map, a dish detail with macro rings, a "Dein Tag" diary, and a menu scan.
It talks to the existing Worker API and has no third-party dependencies.

## Run

Open `Fit.xcodeproj` in Xcode 27 and run the `Fit` scheme on an iPhone simulator, or:

```sh
xcodebuild -project apps/ios/Fit.xcodeproj -scheme Fit \
  -destination 'platform=iOS Simulator,name=iPhone 17' build
```

Simulator builds run without a signing team.

## API

The base URL defaults to `https://wohin.batubln.workers.dev`.
Override it with the `FIT_API_BASE_URL` build setting (written into Info.plist as `FitAPIBaseURL`) or, at run time, the `FIT_API_BASE_URL` environment variable in the scheme.
Plain `http` is accepted only for `localhost` / `127.0.0.1`, so `http://localhost:8787` reaches a local `wrangler dev`.

Routes used: `GET /api/kieze`, `GET /api/dishes/top`, `GET /api/restaurants`, `GET /api/dishes/:id`, `GET /api/dishes/:id/confirmations`, `GET /api/images/ai/:file`, `POST /api/scans` (multipart `kind=menu`, `photo`).

## Location

Discover explains location use before requesting iOS When In Use permission. Coordinates stay in memory and are used on the device to centre the map and calculate straight-line distances. Discovery fetches the same public Berlin catalogue for any device position. The app remembers the permission-flow choice and the manually selected neighbourhood in UserDefaults. Apple Maps loads the visible map area.

## Menu scan

The camera takes a photo (on the simulator, "Beispielkarte verwenden" loads the bundled `ExampleMenu.jpg`, or pick one from Photos).
The photo goes to `POST /api/scans`; the Worker's rate limits and daily AI budget apply, and its German error messages are shown as they come.
When the reading arrives, the photo fades to a clean sheet and its printed ink breaks into particles from left to right. The recognised dishes, ranked by protein per kcal, resolve from particles along the same direction.
A shared timeline in `Fit/DustEffect.swift` drives both passes of the Metal layer shader (`Fit/Dust.metal`).
Vision locates the printed lines on-device for the animation while the scan uses the original photo.
With Reduce Motion on, the photo and dishes crossfade.

For a repeatable simulator demo, start the local Worker with `SCAN_AI_MODE=mock` and use its URL as `FIT_API_BASE_URL`. The mock returns sample dishes without calling a model provider.

## Layout

- `Fit/FitApp.swift` - tabs: Entdecken, Scannen, Heute.
- `Fit/Worker.swift` - API client and models.
- `Fit/Diary.swift` - local diary and daily goals (UserDefaults).
- `Fit/Design.swift` - tokens from `apps/web/src/styles/tokens.css`, cards, buttons, rings, clay art.
- `Fit/AppIcon.icon` and `Fit/Assets.xcassets` - layered DishFit icon, launch screen artwork, clay-3D icon set A and macro icons.
- `FitUITests` - discovery and example-menu journeys against the configured Worker.
