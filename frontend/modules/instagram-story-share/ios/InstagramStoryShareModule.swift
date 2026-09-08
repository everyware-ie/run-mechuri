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

// Meta for Developers 앱 등록 완료(2026-09-08). app.json의 infoPlist
// FacebookAppID와 같은 값이어야 한다.
private let facebookAppID: String? = "1057312323881185"

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
    //
    // 실기기 진단(2026-09-08): 번들 ID 등록·Instagram 테스터 초대·수락까지 다 했는데도
    // "이 앱은 현재 스토리에 공유하는 기능을 지원하지 않습니다"가 계속 떴다 — 계정
    // 설정 문제가 아니라 backgroundVideo 키 자체가 이 경로로는 안 먹히는 것으로 의심된다.
    // backgroundImage(정적 이미지)는 Meta가 오랫동안 확실히 지원해온 경로라, 배경 사진을
    // 같이 실어 보내 최소한 그쪽은 뜨는지 확인하고 실패해도 폴백이 되게 한다.
    AsyncFunction("shareToStory") { (videoPath: String, backgroundImagePath: String?) async throws -> Void in
      guard let appID = facebookAppID else {
        throw InstagramStoryShareError.notConfigured
      }
      // 실기기 4차 실패(2026-09-08): FacebookAppID·fb<ID> URL 스킴을 Info.plist에 추가해도
      // "이 앱은 현재 스토리에 공유하는 기능을 지원하지 않습니다"가 그대로였다. 웹 검색으로
      // 찾은 사례(Duna-Pocket 블로그)에 따르면 `instagram-stories://share` URL 자체에
      // `source_application` 쿼리로 App ID를 실어 보내야 한다 — pasteboard의
      // `com.instagram.sharedSticker.appID`와는 별개로, 인스타그램이 호출자를 식별하는
      // 통로가 하나 더 있는 것으로 보인다. **재검증 필요.**
      guard let shareURL = URL(string: "instagram-stories://share?source_application=\(appID)"),
        UIApplication.shared.canOpenURL(shareURL)
      else {
        throw InstagramStoryShareError.instagramNotInstalled
      }

      // RouteRenderer.renderClip이 돌려주는 outputPath는 순수 경로가 아니라
      // outputURL.absoluteString("file:///...")이다. URL(fileURLWithPath:)에
      // 그대로 넣으면 "file://" 자체를 경로의 일부로 오인해 깨진 경로가 되고
      // Data(contentsOf:)가 항상 실패한다 — 그게 "공유할 영상을 찾을 수 없습니다"로
      // 이어져 실기기에서 매번 실패로 보였다(2026-09-08).
      guard let fileURL = URL(string: videoPath),
        let videoData = try? Data(contentsOf: fileURL)
      else {
        throw InstagramStoryShareError.videoNotFound
      }

      var pasteboardItems: [String: Any] = [
        "com.instagram.sharedSticker.backgroundVideo": videoData,
        "com.instagram.sharedSticker.appID": appID,
      ]
      // backgroundImagePath는 "file:///..." 또는 순수 로컬 경로 둘 다 올 수 있다
      // (background-selection.tsx가 documentDirectory 경로를 그대로 넘긴다) — 스킴이
      // 없으면 fileURLWithPath로, 있으면 그대로 파싱한다.
      if let bgPath = backgroundImagePath {
        let bgURL = bgPath.contains("://") ? URL(string: bgPath) : URL(fileURLWithPath: bgPath)
        if let bgURL, let bgData = try? Data(contentsOf: bgURL) {
          pasteboardItems["com.instagram.sharedSticker.backgroundImage"] = bgData
        }
      }
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
