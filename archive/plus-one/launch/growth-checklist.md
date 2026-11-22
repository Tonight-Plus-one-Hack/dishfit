# Growth checklist: Saturday 18:00 to Sunday 15:00

For a team of four.
Submission is Sunday 15:30: live link, 3 slides, real user numbers.
Every number marked "estimate" is a guess to plan with, not a result.

## Roles

- **Lead**: decisions, captain contact, numbers, demo, hosts the hackathon hangout.
- **Build**: keeps the app up on Cloudflare (Workers logs, D1), fixes what breaks, watches errors and reports.
- **Online**: WhatsApp, ESN and Erasmus groups, Meta ads, Product Hunt style posts.
- **Field**: hostels, bars, posters, QR codes, hosts groups in person.

## Gates (nothing below happens without these)

- The captain's go for deploying, posting, messaging people and spending the 150 EUR.
- The app is live and a full join works on a phone that has never seen it.
- Safety basics work: report, block, 18+ check, safety box on every group.

## Rules for the whole night

- Every link carries a UTM tag (`ads.md`).
- Only share groups that are really open, at curated public spots.
- Nobody on the team posts with fake accounts or joins groups under fake names to inflate numbers.
  Team members may start and join real groups they actually attend, and we exclude team devices from the reported count.
- Check the inbox and reports every hour; a report is handled before any growth task.

## Saturday

| Time | Lead | Build | Online | Field | Check |
| --- | --- | --- | --- | --- | --- |
| 18:00 | Confirm go for deploy and launch; agree on tonight's demo spot. | Final deploy checks, test join on 3 phones. | Fill placeholders in `whatsapp.md` and `outreach.md`; prepare ad creatives. | Print first 10 posters with QR codes, one `utm_content` each. | App live? Gates passed? |
| 19:00 | Create the hackathon group for after dinner (team joins first, so it starts at 2 to 3). | Watch errors; fix anything blocking join. | Submit Meta ads for review (after go); post in the hackathon chat (`utm_source=team`). | Hostel round 1: ask 3 to 5 hostels near the venue for poster permission. | Ads approved yet? |
| 20:00 | Table by table at dinner: invite people to the group with the QR. | Watch realtime chat and member counts under load. | DM 5 ESN or Erasmus admins (`outreach.md`). | Hostel round 1 continued; log each poster location. | Estimate: 10 to 25 joins from the room. |
| 20:30 | First numbers check. | | First ads check: spend, landing page views, joins by `utm_content`. | | Ads kill rule after 20 EUR per concept. |
| 21:00 | Lead the group to the spot. | Stay at the venue as on-call. | Share the city page with team networks (`utm_source=team`). | Join the group walk; take photos only with everyone's okay. | Hangout actually happening? |
| 22:00 | At the spot: encourage people to start the next group themselves. | Fix the top issue from the first real users. | Second ads check, rebalance budget. | Bars near the spot: ask to leave a small QR card at the bar. | Groups started by non-team users? |
| 23:00 | Collect feedback, write down 3 quotes (with permission). | Check reports and hidden content. | Reply to group admins who answered. | Second spot or group if the first is full. | Reports handled? |
| 23:30 | | | Third ads check, final Saturday call on the best concept. | | Best concept for Sunday chosen. |
| 00:00 | Saturday numbers snapshot (screenshot of `/numbers`). | Make sure groups expire at 06:00. | Ads stop (end of the 100 EUR window). | Head home. | Snapshot saved. |

## Night

| Time | Who | What |
| --- | --- | --- |
| 00:30 to 07:30 | Lead, Online, Field | Sleep. |
| 00:30 to 02:30 | Build | Fix the top 1 to 2 issues from Saturday, then sleep. Set error alerts to a phone if possible. |

Nobody stays up all night; Sunday's demo matters more than two extra night hours.

## Sunday

| Time | Lead | Build | Online | Field | Check |
| --- | --- | --- | --- | --- | --- |
| 08:00 | Read numbers, reports and feedback; pick 3 priorities. | Morning check: groups expired at 06:00, app healthy. | Re-cut the best ad concept for Sunday plans (brunch, flea market, afternoon walk). | Plan the Sunday route (hostels not yet visited, Mauerpark area). | Expiry worked? |
| 09:00 | Draft slide 3 (numbers) with placeholders. | Ship the top fix. | Start 1 to 2 real Sunday groups the team will actually attend, and share them. | Hostel round 2: 3 to 5 more hostels. | |
| 10:00 | Rehearse the 2 minute demo once. | Load test the join flow with the team's phones. | Sunday ads start (50 EUR, 10:00 to 14:00, best concept only). | Posters and QR cards round 2. | Ads running? |
| 11:00 | Rehearse the 4 minute demo once. | Freeze features; bug fixes only from now. | Post in ESN groups where admins said yes. | Host or join the Sunday group in person. | |
| 12:00 | Numbers check. | | Ads check, last budget decision. | | Estimate: Sunday adds fewer users than Saturday night. |
| 13:00 | Finish slides with the real numbers so far. | Create the demo group and QR for the stage (`demo-script.md`). | Reply to everyone who wrote back. | Back to the venue. | Slides complete? |
| 14:00 | Final numbers snapshot (screenshot `/numbers`, note the time). | Backup screen recording for the demo. | Ads stop. | Test the demo QR from the back of the room. | Snapshot saved. |
| 15:00 | Submit: live link, 3 slides, numbers with the time they were taken. | Stay on call. | | | Submitted before 15:30. |

## What to count and how

- **Cities active**: cities with at least one group started by a non-team user.
- **Joined users**: unique devices that joined or started at least one group, team and test devices excluded.
- **Groups started**: groups created, team-created groups listed separately.
- **Groups reaching 3+**: share of groups with at least 3 members.
- **Showed up**: members who tapped "I'm here".
- **Messages** sent, and **shares per user**.
- **Hand-off clicks** per brand (Hotels.com, Vrbo, Expedia, Layla).
- **By source**: all three, grouped by `utm_source`.
- **Cost per joined user (ads)**: Meta spend divided by joined users with `utm_source=meta` (see `ads.md`).

Always note the time a number was taken, and never mix Meta-reported clicks into our own user count.
