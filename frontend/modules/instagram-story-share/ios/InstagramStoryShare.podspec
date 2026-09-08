Pod::Spec.new do |s|
  s.name           = 'InstagramStoryShare'
  s.version        = '1.0.0'
  s.summary        = '결과물 mp4를 인스타그램 스토리 배경으로 넘기는 pasteboard 공유 브릿지'
  s.description    = 'FRD: docs/specs/frd/export-and-share.md §3 구현용 로컬 네이티브 브릿지'
  s.author         = 'JiEung2'
  s.homepage       = 'https://docs.expo.dev/modules/'
  s.platforms      = {
    :ios => '16.4',
    :tvos => '16.4'
  }
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  # Swift/Objective-C compatibility
  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
  }

  s.source_files = "**/*.{h,m,mm,swift,hpp,cpp}"
end
