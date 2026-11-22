import SwiftUI

/// One-tap join: the nickname and 18+ check come from onboarding, the about line from their mood.
struct JoinSheet: View {
    let hangout: HangoutSummary
    let city: City
    var onJoined: (JoinHangoutResponse) -> Void = { _ in }

    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss
    @State private var nickname = ""
    @State private var about: Vibe?
    @State private var joining = false
    @State private var error: String?

    var body: some View {
        VStack(alignment: .leading, spacing: Space.lg) {
            HStack(spacing: Space.sm) {
                Image(hangout.spot.kind.artwork)
                    .resizable()
                    .scaledToFill()
                    .frame(width: 44, height: 44)
                    .clipShape(RoundedRectangle(cornerRadius: Radius.control + 2, style: .continuous))
                VStack(alignment: .leading, spacing: 2) {
                    Text(hangout.displayTitle).type(.cardTitle, size: 16).foregroundStyle(Palette.ink).lineLimit(1)
                    Text("\(model.clock(for: city.timeZone).time(hangout.startsAt)) · \(hangout.spot.name)")
                        .type(.label).foregroundStyle(Palette.muted)
                }
            }
            .padding(Space.sm)
            .frame(maxWidth: .infinity, alignment: .leading)
            .cardSurface(fill: Palette.surface)

            Text("Join as").type(.title, size: 26).foregroundStyle(Palette.ink)

            VStack(alignment: .leading, spacing: Space.xs) {
                HStack(spacing: Space.sm) {
                    Avatar(name: nickname.isEmpty ? "?" : nickname, size: 40, ring: Palette.line)
                    TextField("Nickname", text: $nickname)
                        .font(.custom("Geist-Medium", size: 20, relativeTo: .title3))
                        .textInputAutocapitalization(.words)
                        .autocorrectionDisabled()
                        .onChange(of: nickname) { _, value in
                            if value.count > ContractLimits.nicknameMax { nickname = String(value.prefix(ContractLimits.nicknameMax)) }
                        }
                        .accessibilityIdentifier("join.nickname")
                }
                Rule()
            }

            VStack(alignment: .leading, spacing: Space.xs) {
                Eyebrow(text: "Tell the group (only members see this)")
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: Space.xs) {
                        ForEach(Vibe.allCases) { vibe in
                            Chip(title: vibe.aboutLine, isSelected: about == vibe) {
                                withAnimation(Motion.interaction) { about = about == vibe ? nil : vibe }
                            }
                        }
                    }
                }
            }

            HStack(spacing: Space.xs) {
                Image(systemName: "checkmark.shield").font(.system(size: 13))
                Text("18+ confirmed · Public spot · Leave anytime")
            }
            .type(.label)
            .foregroundStyle(Palette.muted)

            if let error {
                Text(error).type(.body).foregroundStyle(Palette.ink)
            }

            Spacer(minLength: 0)

            Button {
                Task { await join() }
            } label: {
                if joining { ProgressView().tint(Palette.canvas) } else { Text("Join this hangout") }
            }
            .buttonStyle(.brandPrimary)
            .disabled(joining || nickname.trimmingCharacters(in: .whitespaces).isEmpty)
            .accessibilityIdentifier("join.confirm")
        }
        .padding(.horizontal, Space.page + 4)
        .padding(.top, Space.xl)
        .padding(.bottom, Space.xs)
        .background(Palette.canvas)
        .onAppear {
            nickname = model.profile.nickname
            about = model.profile.vibes.first
        }
    }

    private func join() async {
        joining = true
        defer { joining = false }
        do {
            let trimmed = nickname.trimmingCharacters(in: .whitespacesAndNewlines)
            let response = try await model.join(hangout, nickname: trimmed, about: about?.aboutLine, timeZone: city.timeZone)
            if model.profile.nickname.isEmpty { model.profile.nickname = trimmed }
            onJoined(response)
            dismiss()
            try? await Task.sleep(for: .milliseconds(350))
            model.justJoined = JoinedHangout(hangout: response.hangout, member: response.member, timeZone: city.timeZone)
        } catch {
            self.error = error.localizedDescription
        }
    }
}

/// Confirmation after joining: a checkmark that pops, the plan in one line, the safety hints and two actions.
struct JoinedView: View {
    let joined: JoinedHangout
    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss
    @State private var popped = false
    @State private var share: ShareLinksResponse?

    var body: some View {
        let clock = model.clock(for: joined.timeZone)
        ScrollView {
            VStack(alignment: .leading, spacing: Space.lg) {
                Image(systemName: "checkmark")
                    .font(.system(size: 26, weight: .semibold))
                    .foregroundStyle(Palette.canvas)
                    .frame(width: 60, height: 60)
                    .background(Palette.night, in: Circle())
                    .keyframeAnimator(initialValue: 0.0, trigger: popped) { content, scale in
                        content.scaleEffect(scale)
                    } keyframes: { _ in
                        SpringKeyframe(0.0, duration: 0.05)
                        SpringKeyframe(1.18, duration: 0.28, spring: .bouncy)
                        SpringKeyframe(1.0, duration: 0.3)
                    }
                    .padding(.top, Space.xxl)

                VStack(alignment: .leading, spacing: Space.xs) {
                    RevealText(text: "You're in, \(joined.member.nickname)", style: .title, delay: 0.15)
                    Text("See you at \(joined.hangout.spot.name) in \(joined.hangout.place) at \(clock.time(joined.hangout.startsAt)).")
                        .type(.lede)
                        .foregroundStyle(Palette.muted)
                }

                VStack(alignment: .leading, spacing: Space.lg) {
                    ForEach(Array(SafetyHint.allCases.enumerated()), id: \.element) { index, hint in
                        HStack(alignment: .top, spacing: Space.md) {
                            IconBadge(systemImage: hint.symbol, size: 36)
                            VStack(alignment: .leading, spacing: 2) {
                                Text(hint.title).type(.cardTitle).foregroundStyle(Palette.ink)
                                Text(hint.body).type(.body).foregroundStyle(Palette.muted)
                                    .fixedSize(horizontal: false, vertical: true)
                            }
                        }
                        .opacity(popped ? 1 : 0)
                        .offset(y: popped ? 0 : 10)
                        .animation(Motion.reveal.delay(Motion.joinPause * 0.4 + Double(index) * 0.08), value: popped)
                    }
                }
                .padding(Space.lg)
                .cardSurface(fill: Palette.surface)
            }
            .padding(.horizontal, Space.page + 4)
        }
        .safeAreaInset(edge: .bottom) {
            VStack(spacing: Space.sm) {
                Button("Open hangout") {
                    model.selectedTab = .tonight
                    if model.tonightPath.last != .hangout(joined.hangout.id) { model.tonightPath.append(.hangout(joined.hangout.id)) }
                    dismiss()
                }
                .buttonStyle(BrandButtonStyle(kind: .primary, rollTitle: "Open hangout"))
                .accessibilityIdentifier("joined.open")
                if let share, let url = URL(string: share.url) {
                    ShareLink(item: url, message: Text(share.text)) {
                        Label("Invite a friend", systemImage: "square.and.arrow.up")
                    }
                    .buttonStyle(.brandSecondary)
                }
            }
            .padding(.horizontal, Space.page + 4)
            .padding(.top, Space.sm)
            .background(Palette.canvas)
        }
        .background(Palette.canvas)
        .presentationCornerRadius(Radius.media)
        .sensoryFeedback(.success, trigger: popped) { _, new in new }
        .task {
            popped = true
            share = try? await model.api.shareLinks(hangoutID: joined.hangout.id)
        }
    }
}
