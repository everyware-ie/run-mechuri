import ExpoModulesCore
import UIKit

// FRD: docs/specs/frd/export-and-share.md §3
// 구현 노트: docs/product/features/export-and-share.md "인스타그램 스토리 공유 착수" 절
//
// 인스타그램 스토리 공유는 Graph API 호출이 아니라 pasteboard 방식이다 — 결과물을
// UIPasteboard에 정해진 UTI 키로 얹어두고 `instagram-stories://share` URL 스킴을
// 열면, 인스타그램 앱이 그 pasteboard를 읽어 스토리 편집 화면을 띄운다. 사용자가
// 실제로 게시했는지는 콜백으로 알 수 없다(§3-3 — 그래서 JS 쪽은 URL을 연 시점
// 자체를 "공유했다"로 본다).

// TODO(JiEung2): Meta for Developers 앱 등록이 끝나면 실제 App ID로 교체.
// 값이 비어 있는 동안은 shareToStory가 항상 notConfigured를 던지고, JS는 이걸
// "인스타그램이 없습니다"(§3-2)와 같은 저장 안내 경로로 처리한다 — 실패 UI를
// 따로 만들지 않기 위한 의도적 선택.
private let facebookAppID: String? = nil

enum InstagramStoryShareError: Error, LocalizedError {
  case notConfigured
  case videoNotFound
  case instagramNotInstalled

  var errorDescription: String? {
    switch self {
    case .notConfigured:
      return "인스타그램 공유가 아직 설정되지 않았습니다"
    case .videoNotFound:
      return "공유할 영상을 찾을 수 없습니다"
    case .instagramNotInstalled:
      return "인스타그램이 설치되어 있지 않습니다"
    }
  }
}

public class InstagramStoryShareModule: Module {
  public func definition() -> ModuleDefinition {
    Name("InstagramStoryShare")

    // §3-2: 미설치 안내는 JS가 Linking.canOpenURL로도 먼저 확인하지만, 그 사이
    // 사용자가 인스타그램을 지울 수도 있으니 공유 직전에도 한 번 더 확인한다.
    Function("canShare") { () -> Bool in
      guard let url = URL(string: "instagram-stories://share") else { return false }
      return UIApplication.shared.canOpenURL(url)
    }

    // §3-1: 결과물(mp4) 전체를 스토리 배경 영상으로 얹는다(스티커가 아니다 —
    // 원클릭 취지에 맞게 사용자가 배경을 또 고르지 않도록).
    AsyncFunction("shareToStory") { (videoPath: String) async throws -> Void in
      guard let appID = facebookAppID else {
        throw InstagramStoryShareError.notConfigured
      }
      guard let shareURL = URL(string: "instagram-stories://share"),
        UIApplication.shared.canOpenURL(shareURL)
      else {
        throw InstagramStoryShareError.instagramNotInstalled
      }

      let fileURL = URL(fileURLWithPath: videoPath)
      guard let videoData = try? Data(contentsOf: fileURL) else {
        throw InstagramStoryShareError.videoNotFound
      }

      let pasteboardItems: [String: Any] = [
        "com.instagram.sharedSticker.backgroundVideo": videoData,
        "com.instagram.sharedSticker.appID": appID,
      ]
      // 인스타그램 쪽 pasteboard는 짧게만 유지한다 — 화면을 벗어나도 계속 남아있으면
      // 다른 앱이 우리 결과물을 읽어갈 수 있어 5분 뒤 만료로 둔다.
      UIPasteboard.general.setItems(
        [pasteboardItems],
        options: [.expirationDate: Date().addingTimeInterval(5 * 60)]
      )

      await MainActor.run {
        UIApplication.shared.open(shareURL)
      }
    }
  }
}
