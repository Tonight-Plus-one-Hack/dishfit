import SwiftUI

struct TodayView: View {
    let showDiscover: () -> Void
    let showScan: () -> Void

    @Environment(Diary.self) private var diary
    @State private var showGoals = false
    @State private var pendingRemoval: Meal?

    var body: some View {
        TimelineView(.everyMinute) { timeline in
            let date = timeline.date
            let meals = diary.meals(on: date)
            let total = meals.reduce(Macros.zero) { $0.adding($1.macros) }
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    ScreenHeader(eyebrow: date.formatted(berlinDate), title: "Dein Tag") {
                        streakBadge(diary.streak(through: date))
                    }
                    weekStrip(date)
                    energy(total)
                    MacroRingTiles(macros: total, targets: diary.goals)
                    journal(meals)
                }
                .page()
                .padding(.top, 8)
                .padding(.bottom, 32)
            }
        }
        .background(Palette.canvas.ignoresSafeArea())
        .toolbar(.hidden, for: .navigationBar)
        .sheet(isPresented: $showGoals) {
            GoalEditor(goals: diary.goals, onSave: diary.updateGoals)
                .presentationDetents([.medium])
        }
        .alert("Eintrag löschen?", isPresented: Binding(
            get: { pendingRemoval != nil }, set: { if !$0 { pendingRemoval = nil } }
        ), presenting: pendingRemoval) { meal in
            Button("Löschen", role: .destructive) { withAnimation(.smooth) { diary.remove(meal.id) } }
            Button("Abbrechen", role: .cancel) {}
        } message: { meal in
            Text(meal.name)
        }
    }

    private var berlinDate: Date.FormatStyle {
        var format = Date.FormatStyle().weekday(.wide).day().month(.wide).locale(.german)
        format.timeZone = Diary.calendar.timeZone
        return format
    }

    private func streakBadge(_ streak: Int) -> some View {
        HStack(spacing: 5) {
            Image("MacroKcal").resizable().scaledToFit().frame(width: 16, height: 16)
            Text(String(streak))
                .font(.headline.monospacedDigit())
                .foregroundStyle(Palette.ink)
        }
        .padding(.horizontal, 13)
        .frame(height: 38)
        .glassEffect(.regular, in: .capsule)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(streak == 1 ? "1 Tag in Folge" : "\(streak) Tage in Folge")
    }

    private func weekStrip(_ date: Date) -> some View {
        HStack(spacing: 0) {
            ForEach(diary.week(containing: date), id: \.self) { day in
                let calendar = Diary.calendar
                let today = calendar.isDate(day, inSameDayAs: date)
                let future = day > date && !today
                let logged = !diary.meals(on: day).isEmpty
                let weekday = calendar.component(.weekday, from: day) - 1
                VStack(spacing: 8) {
                    Text(calendar.shortStandaloneWeekdaySymbols(locale: .german)[weekday])
                        .font(.caption.weight(today ? .bold : .medium))
                        .foregroundStyle(today ? Palette.ink : Palette.muted)
                    Text(String(calendar.component(.day, from: day)))
                        .font(.subheadline.weight(.semibold).monospacedDigit())
                        .foregroundStyle(logged ? Palette.ctaInk : future ? Palette.muted : Palette.ink)
                        .frame(width: 36, height: 36)
                        .background {
                            if logged {
                                Circle().fill(Palette.cta)
                            } else if today {
                                Circle().strokeBorder(Palette.accent, lineWidth: 2)
                            } else {
                                Circle().strokeBorder(Palette.rule, style: StrokeStyle(lineWidth: 1.5, dash: [3, 3]))
                            }
                        }
                }
                .padding(.vertical, 10)
                .frame(maxWidth: .infinity)
                .background {
                    if today {
                        RoundedRectangle(cornerRadius: 16).fill(Palette.surface)
                            .shadow(color: .black.opacity(0.06), radius: 8, y: 3)
                    }
                }
                .accessibilityElement(children: .ignore)
                .accessibilityLabel(day.formatted(berlinDate))
                .accessibilityValue(logged ? "Mahlzeit erfasst" : "Keine Mahlzeit erfasst")
                .accessibilityAddTraits(today ? .isSelected : [])
            }
        }
    }

    private func energy(_ total: Macros) -> some View {
        Button {
            showGoals = true
        } label: {
            HStack(spacing: 16) {
                VStack(alignment: .leading, spacing: 6) {
                    HStack(alignment: .firstTextBaseline, spacing: 4) {
                        Text(total.kcal.fitNumber)
                            .font(.system(size: 46, weight: .bold).monospacedDigit())
                            .tracking(-1.5)
                            .contentTransition(.numericText(value: total.kcal))
                        Text("/ \(diary.goals.kcal.fitNumber)")
                            .font(.title3.weight(.medium).monospacedDigit())
                            .foregroundStyle(Palette.muted)
                    }
                    .foregroundStyle(Palette.ink)
                    Label {
                        Text("Kalorien gegessen")
                    } icon: {
                        Image("MacroKcal").resizable().scaledToFit().frame(width: 15, height: 15)
                    }
                    .font(.subheadline)
                    .foregroundStyle(Palette.muted)
                    let left = diary.goals.kcal - total.kcal
                    Text(left >= 0 ? "Noch \(left.fitNumber) kcal frei" : "\(abs(left).fitNumber) kcal über dem Ziel")
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(Palette.ink)
                        .padding(.top, 6)
                }
                Spacer(minLength: 0)
                ZStack {
                    ProgressRing(progress: total.kcal / max(diary.goals.kcal, 1), color: Palette.kcal, lineWidth: 10)
                    Image("MacroKcal").resizable().scaledToFit().frame(width: 30, height: 30)
                }
                .frame(width: 100, height: 100)
            }
            .padding(18)
            .fitCard(radius: 24)
        }
        .buttonStyle(PressableStyle())
        .accessibilityElement(children: .combine)
        .accessibilityHint("Tagesziele bearbeiten")
        .accessibilityIdentifier("todayEnergy")
    }

    private func journal(_ meals: [Meal]) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            SectionTitle(title: "Mahlzeiten", detail: meals.isEmpty ? nil : (meals.count == 1 ? "1 heute" : "\(meals.count) heute"))
                .padding(.top, 8)
            if meals.isEmpty {
                VStack(spacing: 14) {
                    HStack(spacing: 14) {
                        ArtTile(art: .bowl)
                            .frame(width: 60, height: 60)
                            .clipShape(.rect(cornerRadius: 16))
                        VStack(alignment: .leading, spacing: 4) {
                            Text("Noch nichts eingetragen")
                                .font(.headline)
                                .foregroundStyle(Palette.ink)
                            Text("Wähle ein Gericht oder scanne eine Speisekarte.")
                                .font(.footnote)
                                .foregroundStyle(Palette.muted)
                        }
                        Spacer(minLength: 0)
                    }
                    HStack(spacing: 10) {
                        Button("Entdecken", systemImage: "map", action: showDiscover)
                            .buttonStyle(SecondaryButtonStyle())
                        Button("Karte scannen", systemImage: "viewfinder", action: showScan)
                            .buttonStyle(SecondaryButtonStyle())
                    }
                }
                .padding(14)
                .fitCard(radius: 22)
            } else {
                ForEach(meals) { meal in
                    HStack(spacing: 12) {
                        ArtTile(art: FoodArt(category: nil, name: meal.name))
                            .frame(width: 52, height: 52)
                            .clipShape(.rect(cornerRadius: 14))
                        VStack(alignment: .leading, spacing: 4) {
                            Text(meal.name)
                                .font(.headline)
                                .foregroundStyle(Palette.ink)
                                .lineLimit(1)
                            HStack(spacing: 6) {
                                Text("\(meal.macros.kcal.fitNumber) kcal")
                                    .font(.footnote.weight(.semibold).monospacedDigit())
                                    .foregroundStyle(Palette.ink)
                                Text("· \(meal.place.isEmpty ? meal.date.formatted(date: .omitted, time: .shortened) : meal.place)")
                                    .font(.footnote)
                                    .foregroundStyle(Palette.muted)
                                    .lineLimit(1)
                            }
                            MacroInline(macros: meal.macros)
                        }
                        Spacer(minLength: 0)
                        Menu {
                            Button("Eintrag löschen", systemImage: "trash", role: .destructive) { pendingRemoval = meal }
                        } label: {
                            Image(systemName: "ellipsis")
                                .font(.body.weight(.semibold))
                                .foregroundStyle(Palette.muted)
                                .frame(width: 44, height: 44)
                        }
                        .accessibilityLabel("Optionen für \(meal.name)")
                    }
                    .padding(10)
                    .fitCard(radius: 20)
                    .transition(.blurReplace)
                }
            }
        }
    }
}

private extension Calendar {
    func shortStandaloneWeekdaySymbols(locale: Locale) -> [String] {
        var calendar = self
        calendar.locale = locale
        return calendar.shortStandaloneWeekdaySymbols.map { String($0.prefix(2)) }
    }
}

private struct GoalEditor: View {
    @State var goals: Macros
    let onSave: (Macros) -> Void
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    LabeledContent("Kalorien (kcal)") { field($goals.kcal, label: "Kalorien") }
                    LabeledContent("Protein (g)") { field($goals.protein, label: "Protein") }
                    LabeledContent("Kohlenhydrate (g)") { field($goals.carbs, label: "Kohlenhydrate") }
                    LabeledContent("Fett (g)") { field($goals.fat, label: "Fett") }
                } footer: {
                    Text("Richtwerte für einen Tag. Du kannst sie jederzeit ändern.")
                }
            }
            .navigationTitle("Tagesziele")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Abbrechen", systemImage: "xmark") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Sichern", systemImage: "checkmark") {
                        onSave(goals)
                        dismiss()
                    }
                    .disabled(![goals.kcal, goals.protein, goals.carbs, goals.fat].allSatisfy { $0 > 0 && $0 <= 10_000 })
                }
            }
        }
    }

    private func field(_ value: Binding<Double>, label: String) -> some View {
        TextField(label, value: value, format: .number.grouping(.never))
            .keyboardType(.numberPad)
            .multilineTextAlignment(.trailing)
            .accessibilityLabel(label)
    }
}
