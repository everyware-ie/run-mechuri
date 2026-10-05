const base = require('./app.json').expo;
module.exports = () => {
  const config = JSON.parse(JSON.stringify(base));
  const internal = process.env.RUNARY_INTERNAL_TRACKING === '1';
  config.extra = { ...config.extra, internalTracking: internal };
  config.ios.infoPlist.RunaryInternalTracking = internal;
  if (internal) {
    config.ios.infoPlist.NSLocationWhenInUseUsageDescription = '러닝 중 위치와 시각을 기기에 저장해 경로와 거리를 측정합니다. 화면 잠금과 다른 앱 사용 중에도 측정을 이어갑니다.';
    config.ios.infoPlist.NSMotionUsageDescription = '러닝 중 걸음 수와 케이던스를 측정합니다.';
    config.ios.infoPlist.NSHealthUpdateUsageDescription = '워치에서 심박 측정을 위한 운동 세션을 실행합니다. 완성한 운동은 건강 앱에 중복 저장하지 않습니다.';
    config.ios.infoPlist.UIBackgroundModes = [...new Set([...config.ios.infoPlist.UIBackgroundModes, 'location'])];
    config.plugins.push('./plugins/with-run-tracking.cjs');
    config.extra.eas.build = { ...config.extra.eas.build, experimental: { ios: { appExtensions: [{ targetName: 'RunaryWatch', bundleIdentifier: `${config.ios.bundleIdentifier}.watch`, entitlements: { 'com.apple.developer.healthkit': true } }] } } };
  }
  return config;
};
