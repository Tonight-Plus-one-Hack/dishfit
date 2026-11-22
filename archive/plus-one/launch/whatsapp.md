# WhatsApp share texts

Drafts only.
Nothing is sent until the captain says go.

Every link carries `utm_source=whatsapp` so we can count what WhatsApp brings in.
Use `utm_medium=share` for texts people forward themselves and `utm_medium=group` for texts we post into groups.
The app's link preview (OG image) does most of the work, so the text stays short.

## 1. City page

### DE

Heute Abend in {CITY} und keine Lust, allein rauszugehen?
Auf Plus One siehst du, wer heute noch unterwegs sein will, und kannst einer kleinen Runde (3 bis 8 Leute) in einer Bar oder einem Club beitreten.
Ohne Konto, in 20 Sekunden.
{APP_URL}/{CITY_SLUG}?utm_source=whatsapp&utm_medium=share&utm_campaign=city-{CITY_SLUG}

### EN

Out in {CITY} tonight and don't want to go alone?
Plus One shows who else wants to head out tonight, and you can join a small group (3 to 8 people) at a bar or club.
No account, takes 20 seconds.
{APP_URL}/{CITY_SLUG}?utm_source=whatsapp&utm_medium=share&utm_campaign=city-{CITY_SLUG}

## 2. Hangout that needs 3 more people

### DE

Wir sind heute um {TIME} im {SPOT} und haben noch {OPEN} Plätze frei.
Stimmung: {VIBE}.
Kleine Runde, öffentlicher Ort, jeder zahlt selbst.
Komm mit: {HANGOUT_URL}?utm_source=whatsapp&utm_medium=share&utm_campaign=hangout-fill

### EN

We're meeting at {SPOT} at {TIME} tonight and have {OPEN} spots left.
Vibe: {VIBE}.
Small group, public place, everyone pays for themselves.
Join us: {HANGOUT_URL}?utm_source=whatsapp&utm_medium=share&utm_campaign=hangout-fill

### Short version (for a status or a second nudge)

DE: Noch {OPEN} Plätze heute {TIME} im {SPOT}: {HANGOUT_URL}?utm_source=whatsapp&utm_medium=share&utm_campaign=hangout-fill

EN: {OPEN} spots left tonight, {TIME} at {SPOT}: {HANGOUT_URL}?utm_source=whatsapp&utm_medium=share&utm_campaign=hangout-fill

## 3. Bring a friend

### DE

Ich gehe heute Abend mit ein paar Leuten, die ich noch nicht kenne, ins {SPOT}.
Hast du Lust mitzukommen?
Zu zweit ist der Anfang leichter, und es ist noch ein Platz frei.
{HANGOUT_URL}?utm_source=whatsapp&utm_medium=share&utm_campaign=bring-a-friend

### EN

I'm going to {SPOT} tonight with a few people I haven't met yet.
Want to come along?
It's easier with two of us, and there's still a spot open.
{HANGOUT_URL}?utm_source=whatsapp&utm_medium=share&utm_campaign=bring-a-friend

## 4. Team and hackathon attendees

Use `utm_source=team` for anything sent to our own contacts and to the hackathon crowd.
Set `utm_campaign=hackathon-room` for the event group and `utm_campaign=team-network` for friends and colleagues.

### For the event group (EN, the room is mostly English-speaking)

Hi all, we built Plus One today: pick a city, see who's going out tonight, join a small group at a public spot.
After dinner we're starting a real hangout from the app, and you're invited.
Join here: {HANGOUT_URL}?utm_source=team&utm_medium=group&utm_campaign=hackathon-room
If you want to start your own for later tonight, that works too: {APP_URL}/{CITY_SLUG}?utm_source=team&utm_medium=group&utm_campaign=hackathon-room

### For the event group (DE)

Hallo zusammen, wir haben heute Plus One gebaut: Stadt wählen, sehen wer heute rausgeht, einer kleinen Runde an einem öffentlichen Ort beitreten.
Nach dem Dinner starten wir eine echte Runde über die App, und ihr seid eingeladen.
Hier beitreten: {HANGOUT_URL}?utm_source=team&utm_medium=group&utm_campaign=hackathon-room
Wer lieber selbst eine Runde für später startet: {APP_URL}/{CITY_SLUG}?utm_source=team&utm_medium=group&utm_campaign=hackathon-room

### For our own friends and colleagues (DE)

Hey, wir sind gerade auf einem Hackathon in Berlin und haben bis Sonntag Zeit, echte Leute auf unsere App zu bringen.
Plus One hilft Leuten, die heute Abend allein in einer Stadt sind, eine kleine Runde zum Ausgehen zu finden.
Wenn du heute oder morgen unterwegs bist, schau mal rein oder schick es jemandem, der neu in der Stadt ist.
{APP_URL}?utm_source=team&utm_medium=share&utm_campaign=team-network

### For our own friends and colleagues (EN)

Hey, we're at a hackathon in Berlin and have until Sunday to get real people onto our app.
Plus One helps people who are on their own in a city tonight find a small group to go out with.
If you're out tonight or tomorrow, take a look, or send it to someone who just moved to a new city.
{APP_URL}?utm_source=team&utm_medium=share&utm_campaign=team-network

## 5. Story card

For Instagram Stories, use `brand/assets/story-template.svg` (1080 x 1920).
Change the city, time and invite text, export it, then add the hangout link with Instagram's link sticker.
Tag the link with `utm_source=team` for our own stories, or leave it to the person sharing.

### EN

Going out with 5 new people tonight.
{TIME} at {SPOT}, {CITY}.
{OPEN} seats left.

### DE

Heute Abend mit 5 neuen Leuten unterwegs.
{TIME} im {SPOT}, {CITY}.
Noch {OPEN} Plätze frei.

Change "5" to the real number of people in the group.

## Notes

- Fill `{OPEN}` with the real number at send time; never round it up.
- Only share hangouts that are actually open and at a spot from the curated list.
- Do not post into groups whose rules forbid promotion; ask an admin first (see `outreach.md`).
