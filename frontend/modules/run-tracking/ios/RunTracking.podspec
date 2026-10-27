Pod::Spec.new do |s|
  s.name = 'RunTracking'
  s.version = '1.0.0'
  s.summary = 'Runary 내부 러닝 측정'
  s.description = 'Core Location·Core Motion·건강 앱 심박 읽기·워치 지표 표시'
  s.author = 'team-mechuri'
  s.homepage = 'https://docs.expo.dev/modules/'
  s.platforms = { :ios => '16.4' }
  s.source = { git: '' }
  s.static_framework = true
  s.dependency 'ExpoModulesCore'
  s.pod_target_xcconfig = { 'DEFINES_MODULE' => 'YES', 'SWIFT_VERSION' => '5.0' }
  s.source_files = '**/*.swift'
  s.frameworks = 'CoreLocation', 'CoreMotion', 'HealthKit', 'WatchConnectivity', 'ActivityKit'
end
