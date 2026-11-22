# Launch drafts

Everything in this folder is a draft.
Nothing here has been posted, sent, scheduled or paid for.
Posting, messaging people and spending the 150 EUR all wait for the captain's go.

The product is Plus One: pick a city, see who is heading out tonight, and join or start a small group (3 to 8 people) at a public spot.
Travelers new in town get a hand-off to Hotels.com, Vrbo, Expedia and Layla.
The source of truth is `docs/plan.md`, and every visual follows the brand kit in `brand/`.

## Files

- `whatsapp.md`: share texts (DE and EN) for a city page, a hangout that needs more people, bring-a-friend, the hackathon crowd, and the story card.
- `ads.md`: three Meta Reels/Stories concepts, budget split, UTM scheme and how to measure cost per joined user.
- `qr-poster.md`: poster copy for hostels, bars and events (EN and DE) and how to print it.
- `make-qr.mjs`: zero-dependency QR generator (SVG and PNG) with UTM tagging, in the brand ink color by default.
- `outreach.md`: message templates for ESN/Erasmus groups, hostel receptions and hackathon attendees.
- `safety-copy.md`: safety hints and community rules for the app.
- `demo-script.md`: 2 minute semifinal and 4 minute final demo scripts.
- `growth-checklist.md`: Saturday 18:00 to Sunday 15:00, hour by hour, for a team of four.

## Placeholders

Every draft uses the same placeholders so they can be filled in one pass once the app is live.

| Placeholder | Meaning | Example |
| --- | --- | --- |
| `{APP_URL}` | Live base URL, no trailing slash | `https://plusone.example` |
| `{CITY}` | City name as shown in the app | `Berlin` |
| `{CITY_SLUG}` | City path segment | `berlin` |
| `{HANGOUT_URL}` | Link to one hangout | `{APP_URL}/berlin/h/abc123` |
| `{SPOT}` | Spot name from the curated list | a bar name from the Berlin list |
| `{TIME}` | Start time | `21:00` |
| `{OPEN}` | Free places left | `3` |
| `{VIBE}` | Bar, Club, Chill or Culture (DE: Kultur) | `Bar` |
| `{NAME}` | First name of the person we write to (for example a group admin) | |
| `{GROUP}` | Name of the group or organisation | |
| `{SENDER_NAME}` | Team member sending the message | |
| `{HOSTEL_ID}` | `utm_content` id of one hostel | `hostel-1` |

`demo-script.md` has its own stage placeholders (`{USERS}`, `{HANGOUTS}`, `{JOINED_LIVE}` and others), filled from `/numbers` right before presenting.

## UTM scheme (short version)

`utm_source` is always one of `meta`, `whatsapp`, `qr`, `esn`, `team`, `ph`.
The full scheme lives in `ads.md`.
Generate tagged QR codes with:

```sh
node launch/make-qr.mjs "{APP_URL}/{CITY_SLUG}" --source qr --medium poster --campaign launch-berlin --content hostel-1 --ecc Q --out /tmp/qr-hostel-1
```

Write generated QR files outside the repo (or to a gitignored folder); they are build output, not source.
