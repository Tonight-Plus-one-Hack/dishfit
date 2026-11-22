import SwiftUI

/// The hangout page: artwork, title, when and where, "Room for you" with the seat meter, who is going,
/// the host's note, safety hints and report. A sticky bar keeps the join action in reach.
struct HangoutDetailView: View {
    let hangoutID: String
    @Environment(AppModel.self) private var model
    @State private var detail: HangoutDetail?
    @State private var city: City?
    @State private var error: String?
    @State private var showJoin = false
    @State private var showReport = false
    @State private var confirmLeave = false
    @State private var share: ShareLinksResponse?

    var body: some View {
        Group {
            if let detail, let city {
                content(detail, clock: model.clock(for: city.timeZone))
            } else if let error {
                ErrorStateView(message: error) { Task { await load() } }
            } else {
                LoadingView()
            }
        }
        .background(Palette.canvas)
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                if let share, let url = URL(string: share.url) {
                    ShareLink(item: url, message: Text(share.text)) {
                        Image(systemName: "square.and.arrow.up")
                    }
                    .accessibilityLabel("Share this hangout")
                }
            }
        }
        .task { await load() }
        .onChange(of: model.memberships) { Task { await load() } }
        .sheet(isPresented: $showJoin) {
            if let detail, let city {
                JoinSheet(hangout: detail.hangout, city: city) { _ in Task { await load() } }
                    .presentationDetents([.medium, .large])
                    .presentationCornerRadius(Radius.media)
            }
        }
        .confirmationDialog("Report this hangout", isPresented: $showReport, titleVisibility: .visible) {
            ForEach(ReportReason.allCases) { reason in
                Button(reason.label) { Task { await report(reason) } }
            }
        } message: {
            Text("The team reviews every report the same night. A hangout is hidden after 3 reports.")
        }
        .confirmationDialog("Leave this hangout?", isPresented: $confirmLeave, titleVisibility: .visible) {
            Button("Leave hangout", role: .destructive) {
                Task {
                    try? await model.leave(hangoutID)
                    await load()
                }
            }
        } message: {
            Text("No explanation needed. Your seat opens up for someone else.")
        }
    }

    private func load() async {
        do {
            let detail = try await model.api.hangout(id: hangoutID)
            let cities = try await model.api.cities().cities
            self.city = cities.first { $0.slug == detail.hangout.citySlug }?.city
            withAnimation(Motion.reveal) { self.detail = detail }
            share = try? await model.api.shareLinks(hangoutID: hangoutID)
            error = nil
        } catch {
            self.error = error.localizedDescription
        }
    }

    private func report(_ reason: ReportReason) async {
        try? await model.api.report(ReportRequest(targetType: .hangout, targetId: hangoutID, hangoutId: hangoutID, reason: reason))
    }

    @ViewBuilder
    private func content(_ detail: HangoutDetail, clock: TonightClock) -> some View {
        let hangout = detail.hangout
        let isMember = detail.viewerMemberId != nil
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                Image(detail.spot.kind.artwork)
                    .resizable()
                    .scaledToFill()
                    .frame(height: 220)
                    .frame(maxWidth: .infinity)
                    .clipShape(RoundedRectangle(cornerRadius: Radius.media, style: .continuous))
                    .overlay(alignment: .topLeading) {
                        Tag(text: detail.spot.kind.label, tone: .outline).padding(Space.sm)
                    }
                    .padding(.top, Space.xs)
                    .plusReveal(trigger: .appear)

                if model.api.isDemo {
                    HStack(spacing: 6) {
                        Circle().fill(Palette.periwinkle).frame(width: 6, height: 6)
                        Text("Demo hangout").type(.label).foregroundStyle(Palette.muted)
                    }
                    .padding(.top, Space.lg)
                }

                Text(hangout.displayTitle)
                    .type(.title, size: 28)
                    .foregroundStyle(Palette.ink)
                    .fixedSize(horizontal: false, vertical: true)
                    .padding(.top, Space.sm)
                    .accessibilityAddTraits(.isHeader)

                VStack(alignment: .leading, spacing: Space.md) {
                    HStack(spacing: Space.md) {
                        DateBadge(weekday: clock.weekdayShort(hangout.startsAt), day: clock.dayOfMonth(hangout.startsAt))
                        VStack(alignment: .leading, spacing: 2) {
                            Text(clock.whenLabel(hangout.startsAt)).type(.cardTitle).foregroundStyle(Palette.ink)
                            Text("About 3 hours, leave anytime").type(.body).foregroundStyle(Palette.muted)
                        }
                    }
                    NavigationLink(value: Route.spot(detail.spot.id)) {
                        HStack(spacing: Space.md) {
                            IconBadge(systemImage: "mappin.and.ellipse", size: 44)
                            VStack(alignment: .leading, spacing: 2) {
                                Text(detail.spot.name).type(.cardTitle).foregroundStyle(Palette.ink)
                                Text([detail.spot.address, detail.spot.neighborhood, city?.displayName].compactMap { $0 }.joined(separator: ", "))
                                    .type(.body)
                                    .foregroundStyle(Palette.muted)
                                    .multilineTextAlignment(.leading)
                            }
                            Spacer()
                            Image(systemName: "chevron.right").font(.system(size: 13, weight: .semibold)).foregroundStyle(Palette.mutedDecorative)
                        }
                    }
                    .buttonStyle(PressableStyle())
                }
                .padding(.top, Space.xl)

                roomCard(hangout, isMember: isMember)
                    .padding(.top, Space.xl)
                    .plusReveal(delay: PlusMotion.sequence[1], trigger: .appear)

                if let note = hangout.note {
                    VStack(alignment: .leading, spacing: Space.xs) {
                        Eyebrow(text: "From the host")
                        Text(note).type(.lede).foregroundStyle(Palette.ink)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                    .padding(.top, Space.xl)
                }

                HStack(spacing: Space.xs) {
                    Tag(text: hangout.vibe.label, tone: .outline)
                    Tag(text: hangout.language.label, tone: .outline)
                    Tag(text: "Up to \(hangout.maxSize)", tone: .outline)
                }
                .padding(.top, Space.lg)

                Rule().padding(.vertical, Space.xl)

                VStack(alignment: .leading, spacing: Space.md) {
                    Text("Who's going").type(.cardTitle, size: 20).foregroundStyle(Palette.ink)
                    if !isMember {
                        Text("Nicknames only. What people wrote about themselves is visible once you join.")
                            .type(.body).foregroundStyle(Palette.muted)
                    }
                    ForEach(detail.members) { member in
                        MemberRow(member: member, isYou: member.id == detail.viewerMemberId)
                    }
                    ForEach(0..<hangout.spotsLeft, id: \.self) { index in
                        HStack(spacing: Space.sm) {
                            Circle()
                                .strokeBorder(Palette.line, style: StrokeStyle(lineWidth: 1, dash: [3, 3]))
                                .frame(width: 36, height: 36)
                            Text(index == 0 && !isMember ? "Your seat" : "Open seat")
                                .type(.body)
                                .foregroundStyle(Palette.muted)
                        }
                    }
                }

                Rule().padding(.vertical, Space.xl)

                VStack(alignment: .leading, spacing: Space.lg) {
                    Text("Before you go").type(.cardTitle, size: 20).foregroundStyle(Palette.ink)
                    ForEach(SafetyHint.allCases) { hint in
                        HStack(alignment: .top, spacing: Space.md) {
                            IconBadge(systemImage: hint.symbol, size: 36)
                            VStack(alignment: .leading, spacing: 2) {
                                Text(hint.title).type(.cardTitle).foregroundStyle(Palette.ink)
                                Text(hint.body).type(.body).foregroundStyle(Palette.muted)
                                    .fixedSize(horizontal: false, vertical: true)
                            }
                        }
                    }
                    HStack(spacing: Space.lg) {
                        Button("Report this hangout") { showReport = true }
                        if isMember {
                            Button("Leave hangout") { confirmLeave = true }
                                .accessibilityIdentifier("hangout.leave")
                        }
                    }
                    .type(.button, size: 13)
                    .foregroundStyle(Palette.muted)
                    .padding(.top, Space.xs)
                }
                .padding(.bottom, Space.xxl)
            }
            .padding(.horizontal, Space.page)
        }
        .safeAreaInset(edge: .bottom) { stickyBar(hangout, clock: clock, isMember: isMember) }
    }

    private func roomCard(_ hangout: HangoutSummary, isMember: Bool) -> some View {
        VStack(alignment: .leading, spacing: Space.sm) {
            HStack {
                Text(isMember ? "You're in" : (hangout.spotsLeft > 0 ? "Room for you" : "This one is full"))
                    .type(.cardTitle, size: 19)
                    .foregroundStyle(Palette.ink)
                Spacer()
                Tag(text: Pluralize.seats(hangout.spotsLeft))
            }
            Text("\(Pluralize.going(hangout.memberCount)), up to \(hangout.maxSize). \(isMember ? "See you there." : "Your nickname is all it takes, no account needed.")")
                .type(.body)
                .foregroundStyle(Palette.muted)
            SeatMeter(taken: hangout.memberCount, total: hangout.maxSize, highlightNext: !isMember && hangout.spotsLeft > 0)
                .padding(.vertical, Space.xs)
            if !isMember && hangout.spotsLeft > 0 {
                BrandButton("Join this hangout") { showJoin = true }
                    .accessibilityIdentifier("hangout.join")
            }
        }
        .padding(Space.lg)
        .cardSurface(fill: Palette.white)
    }

    private func stickyBar(_ hangout: HangoutSummary, clock: TonightClock, isMember: Bool) -> some View {
        HStack(spacing: Space.md) {
            VStack(alignment: .leading, spacing: 2) {
                Text("\(clock.time(hangout.startsAt)) · \(hangout.spot.name)")
                    .type(.cardTitle, size: 16)
                    .foregroundStyle(Palette.ink)
                    .lineLimit(1)
                Text(isMember ? "You're going" : Pluralize.seats(hangout.spotsLeft))
                    .type(.label)
                    .foregroundStyle(Palette.muted)
            }
            Spacer()
            if isMember {
                if let share, let url = URL(string: share.url) {
                    ShareLink(item: url, message: Text(share.text)) {
                        Label("Invite", systemImage: "person.badge.plus")
                    }
                    .buttonStyle(.brand(.secondary, height: 46))
                    .frame(width: 128)
                }
            } else if hangout.spotsLeft > 0 {
                BrandButton("Join", kind: .primary, height: 46) { showJoin = true }
                    .frame(width: 112)
            }
        }
        .padding(.horizontal, Space.page)
        .padding(.vertical, Space.sm)
        .background(Palette.canvas)
        .overlay(alignment: .top) { Rule() }
    }
}

private struct DateBadge: View {
    let weekday: String
    let day: Int

    var body: some View {
        VStack(spacing: 0) {
            Text(weekday)
                .type(.label, size: 10)
                .foregroundStyle(Palette.muted)
                .frame(maxWidth: .infinity)
                .frame(height: 18)
                .background(Palette.surface)
            Rule()
            Text("\(day)")
                .type(.cardTitle, size: 18)
                .foregroundStyle(Palette.ink)
                .frame(maxWidth: .infinity, maxHeight: .infinity)
        }
        .frame(width: 44, height: 44)
        .clipShape(RoundedRectangle(cornerRadius: Radius.control + 2, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: Radius.control + 2, style: .continuous).strokeBorder(Palette.line, lineWidth: 1))
        .accessibilityHidden(true)
    }
}

private struct MemberRow: View {
    let member: Member
    let isYou: Bool

    var body: some View {
        HStack(spacing: Space.sm) {
            Avatar(name: member.nickname, size: 36, ring: Palette.line)
            VStack(alignment: .leading, spacing: 1) {
                HStack(spacing: 6) {
                    Text(isYou ? "\(member.nickname) (you)" : member.nickname).type(.cardTitle, size: 16).foregroundStyle(Palette.ink)
                    if member.role == .host { Tag(text: "Host") }
                }
                if let about = member.about {
                    Text(about).type(.body).foregroundStyle(Palette.muted)
                }
            }
            Spacer()
        }
        .accessibilityElement(children: .combine)
    }
}

extension ReportReason {
    var label: String {
        switch self {
        case .harassment: "Harassment"
        case .spam: "Spam or scam"
        case .unsafe: "Feels unsafe"
        case .inappropriate: "Inappropriate"
        case .other: "Something else"
        }
    }
}
