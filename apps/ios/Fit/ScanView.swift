import PhotosUI
import SwiftUI

/// Photograph a menu, send it to the Worker's scan route, and reveal the recognised dishes.
struct ScanView: View {
    private enum Stage {
        case empty
        case ready(MenuPhoto)
        case reading(MenuPhoto)
        case result(MenuPhoto, MenuScan)
        case failed(MenuPhoto, String)

        var photo: MenuPhoto? {
            switch self {
            case .empty: nil
            case .ready(let photo), .reading(let photo), .result(let photo, _), .failed(let photo, _): photo
            }
        }
    }

    private let worker = Worker()
    private let hasCamera = UIImagePickerController.isSourceTypeAvailable(.camera)

    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var stage = Stage.empty
    @State private var reading: Task<Void, Never>?
    @State private var scanReveal: ScanReveal?
    @State private var inkRegions: [CGRect] = []
    @State private var pickerItem: PhotosPickerItem?
    @State private var showCamera = false
    @State private var photoError: String?
    @State private var shattered = 0
    @State private var landed = 0

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                ScreenHeader(eyebrow: "Speisekarte", title: "Scannen") {
                    if case .result = stage {
                        Button("Neue Karte", systemImage: "arrow.counterclockwise", action: reset)
                            .labelStyle(.iconOnly)
                            .font(.body.weight(.semibold))
                            .foregroundStyle(Palette.ink)
                            .frame(width: 44, height: 44)
                            .glassEffect(.regular.interactive(), in: .circle)
                            .accessibilityIdentifier("scanAgain")
                    }
                }
                stageView
                actions
            }
            .page()
            .padding(.top, 8)
            .padding(.bottom, 32)
        }
        .scrollDisabled(isReading || scanReveal != nil)
        .background(Palette.canvas.ignoresSafeArea())
        .toolbar(.hidden, for: .navigationBar)
        .sensoryFeedback(.impact(weight: .light, intensity: 0.7), trigger: shattered)
        .sensoryFeedback(.success, trigger: landed)
        .fullScreenCover(isPresented: $showCamera) {
            MenuCamera { image in
                showCamera = false
                if let image { use { try MenuPhoto(capture: image) } }
            }
            .ignoresSafeArea()
        }
        .onChange(of: pickerItem) { _, item in
            guard let item else { return }
            Task {
                let data = try? await item.loadTransferable(type: Data.self)
                pickerItem = nil
                if let data { use { try MenuPhoto(data: data) } } else { photoError = Worker.Failure.image.localizedDescription }
            }
        }
        .task {
            guard DemoScript.scan, case .empty = stage else { return }
            guard (try? await Task.sleep(for: .seconds(1.5))) != nil, case .empty = stage else { return }
            useExample()
            guard (try? await Task.sleep(for: .seconds(1.8))) != nil else { return }
            if case .ready(let photo) = stage { read(photo) }
        }
        .task(id: reduceMotion) {
            if !reduceMotion { await ScanReveal.prepareShader() }
        }
        .task(id: stage.photo?.id) {
            guard let photo = stage.photo, !reduceMotion else { return }
            let regions = await photo.inkRegions()
            guard !Task.isCancelled, stage.photo?.id == photo.id else { return }
            inkRegions = regions
        }
        .task(id: scanReveal) {
            guard let reveal = scanReveal else { return }
            let remaining = reveal.startedAt.addingTimeInterval(reveal.duration).timeIntervalSinceNow
            guard (try? await Task.sleep(for: .seconds(max(0, remaining)))) != nil,
                  scanReveal == reveal, !Task.isCancelled else { return }
            scanReveal = nil
            if !reveal.reduceMotion { landed += 1 }
        }
        .alert("Foto nicht lesbar", isPresented: Binding(get: { photoError != nil }, set: { if !$0 { photoError = nil } })) {
            Button("OK", role: .cancel) {}
        } message: {
            Text(photoError ?? "")
        }
    }

    private var isReading: Bool {
        if case .reading = stage { true } else { false }
    }

    // MARK: Stage

    @ViewBuilder
    private var stageView: some View {
        TimelineView(.animation(paused: scanReveal == nil)) { clock in
            ZStack(alignment: .top) {
                if case .result(_, let scan) = stage {
                    ScanResults(scan: scan, reveal: scanReveal, date: clock.date)
                        .allowsHitTesting(scanReveal == nil)
                        .accessibilityHidden(scanReveal != nil)
                }
                if let photo = stage.photo, !hasResults || scanReveal != nil {
                    if let reveal = scanReveal, !reveal.reduceMotion {
                        let frame = clock.date.timeIntervalSince(reveal.startedAt) * 24
                        let photoFade = min(max(frame / 4, 0), 1)
                        let paperFade = reveal.inkRegions.isEmpty ? 0 : 1 - min(max((frame - 17) / 8, 0), 1)
                        Color.clear
                            .aspectRatio(3 / 4, contentMode: .fit)
                            .background(.white.opacity(paperFade), in: .rect(cornerRadius: 28))
                            .accessibilityHidden(true)
                            .zIndex(-1)
                        MenuInk(photo: photo, regions: reveal.inkRegions)
                            .scanDust(.outgoing, reveal: reveal, at: clock.date)
                            .accessibilityHidden(true)
                            .zIndex(1)
                        if photoFade < 1 {
                            MenuPhotoCard(photo: photo, scanning: false)
                                .opacity(1 - photoFade)
                                .accessibilityHidden(true)
                                .zIndex(2)
                        }
                    } else {
                        MenuPhotoCard(photo: photo, scanning: isReading)
                            .scanDust(.outgoing, reveal: scanReveal, at: clock.date)
                            .accessibilityHidden(scanReveal != nil)
                            .zIndex(1)
                    }
                } else if stage.photo == nil {
                    emptyCard
                }
            }
        }
        if case .failed(_, let message) = stage {
            Label(message, systemImage: "exclamationmark.triangle.fill")
                .font(.subheadline)
                .foregroundStyle(Palette.ink)
                .symbolRenderingMode(.multicolor)
                .padding(14)
                .frame(maxWidth: .infinity, alignment: .leading)
                .fitCard(radius: 18)
                .accessibilityIdentifier("scanError")
        }
    }

    private var emptyCard: some View {
        Color.clear
            .aspectRatio(3 / 4, contentMode: .fit)
            .overlay {
                VStack(spacing: 14) {
                    Image("ClayEmptyNoMenu")
                        .resizable()
                        .scaledToFit()
                        .frame(width: 150, height: 150)
                        .accessibilityHidden(true)
                    Text("Fotografiere die Karte")
                        .font(.title3.bold())
                        .tracking(-0.4)
                        .foregroundStyle(Palette.ink)
                    Text("Wir lesen jedes Gericht und schätzen Kalorien und Makros. Das Foto wird nicht gespeichert.")
                        .font(.subheadline)
                        .foregroundStyle(Palette.muted)
                        .multilineTextAlignment(.center)
                        .frame(maxWidth: 280)
                }
                .padding(24)
            }
            .background(Palette.surface, in: .rect(cornerRadius: 28))
            .overlay { ViewfinderCorners(color: Palette.rule).padding(14) }
    }

    // MARK: Actions

    @ViewBuilder
    private var actions: some View {
        switch stage {
        case .empty:
            VStack(spacing: 10) {
                if hasCamera {
                    Button("Foto aufnehmen", systemImage: "camera.fill") { showCamera = true }
                        .buttonStyle(PrimaryButtonStyle())
                } else {
                    Button("Beispielkarte verwenden", systemImage: "menucard.fill", action: useExample)
                        .buttonStyle(PrimaryButtonStyle())
                        .accessibilityIdentifier("useExample")
                }
                HStack(spacing: 10) {
                    PhotosPicker(selection: $pickerItem, matching: .images) {
                        Label("Aus Fotos", systemImage: "photo.on.rectangle")
                    }
                    .buttonStyle(SecondaryButtonStyle())
                    if hasCamera {
                        Button("Beispiel", systemImage: "menucard", action: useExample)
                            .buttonStyle(SecondaryButtonStyle())
                    }
                }
            }
        case .ready(let photo), .failed(let photo, _):
            VStack(spacing: 10) {
                Button(isFailed ? "Erneut versuchen" : "Karte lesen",
                       systemImage: isFailed ? "arrow.clockwise" : "sparkles") { read(photo) }
                    .buttonStyle(PrimaryButtonStyle())
                    .accessibilityIdentifier("readMenu")
                otherPhotoMenu
            }
        case .reading:
            VStack(spacing: 10) {
                Button {} label: {
                    HStack(spacing: 10) {
                        ProgressView().tint(Palette.ctaInk)
                        Text("Liest die Karte …")
                    }
                }
                .buttonStyle(PrimaryButtonStyle())
                .allowsHitTesting(false)
                .accessibilityLabel("Liest die Karte")
                Button("Abbrechen", role: .cancel, action: cancelReading)
                    .buttonStyle(SecondaryButtonStyle())
            }
        case .result:
            EmptyView()
        }
    }

    private var isFailed: Bool {
        if case .failed = stage { true } else { false }
    }

    private var hasResults: Bool {
        if case .result = stage { true } else { false }
    }

    private var otherPhotoMenu: some View {
        Menu {
            if hasCamera {
                Button("Foto aufnehmen", systemImage: "camera") { showCamera = true }
            }
            Button("Beispielkarte", systemImage: "menucard", action: useExample)
        } label: {
            Label("Anderes Foto", systemImage: "photo.on.rectangle")
        } primaryAction: {
            if hasCamera { showCamera = true } else { stage = .empty }
        }
        .buttonStyle(SecondaryButtonStyle())
    }

    // MARK: Flow

    private func use(_ make: () throws -> MenuPhoto) {
        do {
            let photo = try make()
            scanReveal = nil
            inkRegions = []
            withAnimation(.smooth(duration: 0.35)) { stage = .ready(photo) }
        } catch {
            photoError = error.localizedDescription
        }
    }

    private func useExample() {
        use { try MenuPhoto.bundled() }
    }

    private func read(_ photo: MenuPhoto) {
        reading?.cancel()
        withAnimation(.smooth(duration: 0.3)) { stage = .reading(photo) }
        reading = Task {
            do {
                // A fast answer still gets a beat of the beam, so the change reads as cause and effect.
                async let pause: Void = Task.sleep(for: .seconds(1.2))
                let scan = try await worker.scanMenu(photo.jpeg)
                try await pause
                try Task.checkCancellation()
                reveal(scan, from: photo)
            } catch {
                guard !Task.isCancelled else { return }
                withAnimation(.smooth(duration: 0.3)) {
                    stage = .failed(photo, error.localizedDescription)
                }
            }
        }
    }

    private func cancelReading() {
        reading?.cancel()
        reading = nil
        if let photo = stage.photo {
            withAnimation(.smooth(duration: 0.3)) { stage = .ready(photo) }
        }
    }

    private func reveal(_ scan: MenuScan, from photo: MenuPhoto) {
        scanReveal = ScanReveal(startedAt: .now, reduceMotion: reduceMotion, inkRegions: inkRegions)
        stage = .result(photo, scan)
        shattered += 1
    }

    private func reset() {
        reading?.cancel()
        scanReveal = nil
        withAnimation(.smooth(duration: 0.35)) {
            stage = .empty
        }
    }
}

/// The original photo is clipped to the text lines before the shader samples its ink.
private struct MenuInk: View {
    let photo: MenuPhoto
    let regions: [CGRect]

    var body: some View {
        Color.clear
            .aspectRatio(3 / 4, contentMode: .fit)
            .overlay {
                GeometryReader { geometry in
                    let size = geometry.size
                    let image = photo.image.size
                    let scale = max(size.width / image.width, size.height / image.height)
                    let width = image.width * scale
                    let height = image.height * scale
                    Image(uiImage: photo.image)
                        .resizable()
                        .frame(width: width, height: height)
                        .position(x: size.width / 2, y: size.height / 2)
                        .mask {
                            Path { path in
                                for region in regions {
                                    let bounds = CGRect(
                                        x: (size.width - width) / 2 + region.minX * width,
                                        y: (size.height - height) / 2 + region.minY * height,
                                        width: region.width * width,
                                        height: region.height * height
                                    )
                                    path.addRect(bounds.insetBy(dx: -1, dy: -1))
                                }
                            }
                            .fill(.white)
                        }
                }
            }
            .clipShape(.rect(cornerRadius: 28))
    }
}

/// The photographed menu in a viewfinder frame; while reading, a soft beam sweeps over it.
private struct MenuPhotoCard: View {
    let photo: MenuPhoto
    let scanning: Bool

    var body: some View {
        Color.clear
            .aspectRatio(3 / 4, contentMode: .fit)
            .overlay {
                Image(uiImage: photo.image)
                    .resizable()
                    .scaledToFill()
                    .accessibilityHidden(true)
            }
            .overlay {
                if scanning {
                    ScanBeam().transition(.opacity)
                }
            }
            .clipShape(.rect(cornerRadius: 28))
            .overlay { ViewfinderCorners(color: .white).padding(14).shadow(color: .black.opacity(0.25), radius: 4) }
            .overlay(alignment: .topLeading) {
                if photo.isExample {
                    Text("Beispielkarte")
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(Palette.ink)
                        .padding(.horizontal, 10)
                        .padding(.vertical, 6)
                        .glassEffect(.regular, in: .capsule)
                        .padding(20)
                }
            }
            .fitCard(radius: 28)
            .accessibilityElement(children: .ignore)
            .accessibilityLabel(photo.isExample ? "Beispiel-Speisekarte" : "Foto der Speisekarte")
            .accessibilityIdentifier("menuPhoto")
    }
}

/// A band of brand light that travels down and back up the photo.
private struct ScanBeam: View {
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var low = false

    var body: some View {
        GeometryReader { proxy in
            let band = proxy.size.height * 0.28
            ZStack(alignment: .top) {
                Color.black.opacity(0.10)
                VStack(spacing: 0) {
                    LinearGradient(colors: [.clear, Palette.brandStops[1].opacity(0.38)], startPoint: .top, endPoint: .bottom)
                        .frame(height: band)
                    Rectangle()
                        .fill(.white)
                        .frame(height: 2)
                        .shadow(color: Palette.brandStops[2], radius: 6)
                }
                .offset(y: low ? proxy.size.height - band : -band * 0.6)
            }
        }
        .allowsHitTesting(false)
        .onAppear {
            guard !reduceMotion else { return }
            withAnimation(.easeInOut(duration: 1.7).repeatForever(autoreverses: true)) { low = true }
        }
    }
}

struct ViewfinderCorners: View {
    let color: Color

    var body: some View {
        GeometryReader { proxy in
            let arm: CGFloat = 26
            let w = proxy.size.width
            let h = proxy.size.height
            Path { path in
                path.move(to: CGPoint(x: 0, y: arm)); path.addLine(to: .zero); path.addLine(to: CGPoint(x: arm, y: 0))
                path.move(to: CGPoint(x: w - arm, y: 0)); path.addLine(to: CGPoint(x: w, y: 0)); path.addLine(to: CGPoint(x: w, y: arm))
                path.move(to: CGPoint(x: w, y: h - arm)); path.addLine(to: CGPoint(x: w, y: h)); path.addLine(to: CGPoint(x: w - arm, y: h))
                path.move(to: CGPoint(x: arm, y: h)); path.addLine(to: CGPoint(x: 0, y: h)); path.addLine(to: CGPoint(x: 0, y: h - arm))
            }
            .stroke(color, style: StrokeStyle(lineWidth: 3.5, lineCap: .round, lineJoin: .round))
        }
        .allowsHitTesting(false)
        .accessibilityHidden(true)
    }
}

/// What the scan found, best protein per kcal first.
private struct ScanResults: View {
    let scan: MenuScan
    let reveal: ScanReveal?
    let date: Date

    private var place: String { scan.menu.restaurantName ?? "Gescannte Karte" }
    // Bound the height of each shader layer for long menus and large Dynamic Type sizes.
    private let dishesPerLayer = 6

    var body: some View {
        let dishes = scan.menu.dishes.sorted { $0.proteinDensity > $1.proteinDensity }
        VStack(alignment: .leading, spacing: 10) {
            ForEach(Array(stride(from: 0, to: max(1, dishes.count), by: dishesPerLayer)), id: \.self) { start in
                let end = min(start + dishesPerLayer, dishes.count)
                VStack(alignment: .leading, spacing: 10) {
                    if start == 0 { summary(count: dishes.count) }
                    ForEach(start..<end, id: \.self) { index in
                        ScanDishRow(dish: dishes[index], place: place, best: index == 0)
                            .accessibilityElement(children: .contain)
                            .accessibilityIdentifier("scanDish-\(index + 1)")
                    }
                    if end == dishes.count { estimateNote }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .scanDust(.incoming, reveal: reveal, at: date)
            }
        }
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("scanResults")
    }

    private func summary(count: Int) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(place)
                .font(.title2.bold())
                .tracking(-0.6)
                .foregroundStyle(Palette.ink)
            Text("\(count) Gerichte erkannt · nach Protein pro kcal")
                .font(.subheadline)
                .foregroundStyle(Palette.muted)
        }
        .padding(.horizontal, 4)
        .padding(.bottom, 4)
    }

    private var estimateNote: some View {
        Label("KI-Schätzung aus dem Foto. Portionen und Rezepte können abweichen.", systemImage: "info.circle")
            .font(.footnote)
            .foregroundStyle(Palette.muted)
            .padding(.horizontal, 4)
            .padding(.top, 6)
    }
}

private struct ScanDishRow: View {
    let dish: MenuDish
    let place: String
    let best: Bool

    @Environment(Diary.self) private var diary
    @State private var added = false

    var body: some View {
        HStack(alignment: .center, spacing: 12) {
            ArtTile(art: FoodArt(category: nil, name: dish.name))
                .frame(width: 60, height: 60)
                .clipShape(.rect(cornerRadius: 16))
            VStack(alignment: .leading, spacing: 5) {
                HStack(spacing: 6) {
                    Text(dish.name)
                        .font(.headline)
                        .tracking(-0.2)
                        .foregroundStyle(Palette.ink)
                        .lineLimit(1)
                    if best {
                        Text("Beste Wahl")
                            .font(.caption2.weight(.bold))
                            .foregroundStyle(Palette.accentSoftInk)
                            .padding(.horizontal, 7)
                            .padding(.vertical, 3)
                            .background(Palette.accentSoft, in: .capsule)
                            .fixedSize()
                    }
                }
                HStack(spacing: 4) {
                    Image("MacroKcal").resizable().scaledToFit().frame(width: 13, height: 13)
                    Text("\(dish.nutrients.kcal.value.fitNumber) kcal")
                        .font(.subheadline.weight(.bold).monospacedDigit())
                        .foregroundStyle(Palette.ink)
                    if let price = dish.priceEur {
                        Text("· \(price.fitPrice)")
                            .font(.subheadline)
                            .foregroundStyle(Palette.muted)
                    }
                }
                MacroInline(macros: dish.macros)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            Button {
                diary.add(name: dish.name, place: place, macros: dish.macros)
                withAnimation(.spring(duration: 0.3, bounce: 0.3)) { added = true }
            } label: {
                Image(systemName: added ? "checkmark" : "plus")
                    .font(.body.weight(.bold))
                    .contentTransition(.symbolEffect(.replace))
                    .foregroundStyle(added ? Palette.ink : Palette.ctaInk)
                    .frame(width: 40, height: 40)
                    .background(added ? Palette.track : Palette.cta, in: .circle)
                    .frame(width: 44, height: 44)
            }
            .buttonStyle(PressableStyle())
            .disabled(added)
            .sensoryFeedback(.success, trigger: added)
            .accessibilityLabel(added ? "\(dish.name) ist in Heute eingetragen" : "\(dish.name) zu Heute hinzufügen")
        }
        .padding(12)
        .fitCard(radius: 22)
    }
}
