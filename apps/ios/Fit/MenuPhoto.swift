import ImageIO
import SwiftUI
import UniformTypeIdentifiers
import Vision

struct MenuPhoto {
    let id = UUID()
    let image: UIImage
    let jpeg: Data
    var isExample = false

    init(data: Data, isExample: Bool = false) throws {
        let options = [
            kCGImageSourceCreateThumbnailFromImageAlways: true as Any,
            kCGImageSourceCreateThumbnailWithTransform: true as Any,
            kCGImageSourceThumbnailMaxPixelSize: 1_760 as Any
        ]
        guard let source = CGImageSourceCreateWithData(data as CFData, nil),
              let thumbnail = CGImageSourceCreateThumbnailAtIndex(source, 0, options as CFDictionary)
        else { throw Worker.Failure.image }

        image = UIImage(cgImage: thumbnail)
        jpeg = try Self.encode(image)
        self.isExample = isExample
    }

    init(capture: UIImage) throws {
        let size = capture.size
        guard size.width > 0, size.height > 0 else { throw Worker.Failure.image }
        let scale = min(1, 1_760 / max(size.width, size.height))
        let target = CGSize(width: size.width * scale, height: size.height * scale)
        let format = UIGraphicsImageRendererFormat()
        format.scale = 1
        format.opaque = true
        image = UIGraphicsImageRenderer(size: target, format: format).image { _ in
            capture.draw(in: CGRect(origin: .zero, size: target))
        }
        jpeg = try Self.encode(image)
    }

    static func bundled() throws -> Self {
        guard let url = Bundle.main.url(forResource: "ExampleMenu", withExtension: "jpg") else {
            throw Worker.Failure.image
        }
        return try Self(data: Data(contentsOf: url), isExample: true)
    }

    /// The reveal uses the positions of the printed text. The scan itself still reads the original JPEG.
    func inkRegions() async -> [CGRect] {
        var request = RecognizeTextRequest()
        request.usesLanguageCorrection = false
        request.automaticallyDetectsLanguage = true
        request.minimumTextHeightFraction = 0.006
        guard let regions = try? await request.perform(on: jpeg) else { return [] }
        return regions.map { $0.boundingBox.verticallyFlipped().cgRect }
    }

    private static func encode(_ image: UIImage) throws -> Data {
        for quality in [0.84, 0.66, 0.45] {
            if let data = image.jpegData(compressionQuality: quality), data.count <= 4 * 1_024 * 1_024 {
                return data
            }
        }
        throw Worker.Failure.image
    }
}

struct MenuCamera: UIViewControllerRepresentable {
    let finish: (UIImage?) -> Void

    func makeUIViewController(context: Context) -> UIImagePickerController {
        let camera = UIImagePickerController()
        camera.sourceType = .camera
        camera.mediaTypes = [UTType.image.identifier]
        camera.delegate = context.coordinator
        return camera
    }

    func updateUIViewController(_ controller: UIImagePickerController, context: Context) {}

    func makeCoordinator() -> Coordinator { Coordinator(finish: finish) }

    final class Coordinator: NSObject, UIImagePickerControllerDelegate, UINavigationControllerDelegate {
        let finish: (UIImage?) -> Void

        init(finish: @escaping (UIImage?) -> Void) { self.finish = finish }

        func imagePickerControllerDidCancel(_ picker: UIImagePickerController) { finish(nil) }

        func imagePickerController(_ picker: UIImagePickerController,
                                   didFinishPickingMediaWithInfo info: [UIImagePickerController.InfoKey: Any]) {
            finish(info[.originalImage] as? UIImage)
        }
    }
}
