Pod::Spec.new do |s|
  s.name           = 'HealthKitBridge'
  s.version        = '1.0.0'
  s.summary        = 'HealthKit 실외 러닝 워크아웃과 경로 좌표 읽기'
  s.description    = 'FRD: docs/specs/frd/run-record-selection.md 구현용 로컬 네이티브 브릿지'
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
