# 90-second backup demo video: shot list

Play this if the live demo fails on stage.
Record on Sunday morning against the live production app, on a phone (portrait 9:16) or a phone-sized browser window, with real data only.
Do not stage fake hangouts or fake people: use real hangouts, or a test hangout the team clearly labels as the team's own.
Hide notifications, battery-saving banners and anything personal before recording.

## Setup

- Device: phone screen recording, or browser at 390x844 recorded with the OS screen recorder.
- Second device or second browser profile logged in as a different nickname, for the "someone joins" moment in shot 6.
- Voice-over recorded separately (quiet room), English, calm pace; captions burned in, because the hall will be loud.
- Music: none, or a quiet royalty-free bed under the voice.
- Brand: open on `brand/assets/logo-reveal.mp4` (4.2 s, silent), end on the static lockup `brand/assets/logo-primary.svg`, captions in Geist on the canvas color `#fcfcfd` (tokens in `docs/design/tokens.json`).
- Export 1080x1920 MP4, plus a 1920x1080 version with the phone centered on `#fcfcfd`, in case the projector is landscape only.

## Shots

| # | Time | Screen | Action | Voice-over / caption |
| --- | --- | --- | --- | --- |
| 1 | 0:00-0:06 | Plus One logo reveal film (`brand/assets/logo-reveal.mp4`) | Plays once | "New in a city, and nobody to go out with tonight?" |
| 2 | 0:06-0:16 | Home page, city list | Scroll the cities slowly, tap Berlin | "Pick a city, like on Luma." |
| 3 | 0:16-0:30 | Berlin city page, tonight's open hangouts | Pause on the "N people going out tonight" counter, scroll the list (time, spot, vibe, seats left) | "See who is going out tonight: small groups at public spots, with seats left." |
| 4 | 0:30-0:42 | Hangout detail, then the join flow (one question per screen) | Tap a hangout, enter a nickname, pick a mood, confirm 18+ | "Join with a nickname. No account, no profile to swipe." |
| 5 | 0:42-0:54 | Hangout page after joining | Show members, safety tips, send one message in the group chat | "You are in the group. Safety tips are on every hangout." |
| 6 | 0:54-1:02 | Same hangout on the second device | A second person joins; seat count goes down on the first device | "Every hangout needs people, so you share it until it fills." |
| 7 | 1:02-1:10 | Report and block on a message | Open the menu on a message, show Report and Block (do not submit a real report) | "Report and block on every message. Groups only, public spots only, no location tracking." |
| 8 | 1:10-1:18 | Spots map, then the start-a-hangout form | Pan the Berlin spots map, pick a spot, time, vibe, size; stop before publishing unless it is a real hangout | "Or pick one of the best public spots and start your own in twenty seconds." |
| 9 | 1:18-1:25 | "New in town?" Layla / Expedia section | Tap the Layla button, show the hand-off opening | "New in town? Plan the rest of the trip with Layla, stays on Expedia." |
| 10 | 1:25-1:30 | End card: Plus One lockup, QR and live link (same as slide 1) | Static | "Plus One. Join tonight." |

## Checklist before recording

- [ ] Live link and QR on the end card match `numbers.json` `live_url`.
- [ ] Every screen shows real data or clearly labeled team test data.
- [ ] No real person's nickname or message appears without their OK; blur if needed.
- [ ] No em dash or typos in captions.
- [ ] Video is under 90 s and plays offline from the presenting laptop (copy it locally, do not rely on hall Wi-Fi).
