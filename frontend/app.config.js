const base = require('./app.json').expo;
module.exports = () => {
  const config = JSON.parse(JSON.stringify(base));
  const internal = process.env.RUNARY_INTERNAL_TRACKING === '1';
  config.extra = { ...config.extra, internalTracking: internal };
  config.ios.infoPlist.RunaryInternalTracking = internal;
  if (internal) {
    config.ios.infoPlist.NSSupportsLiveActivities = true;
    config.ios.infoPlist.CFBundleURLTypes.push({ CFBundleURLSchemes: ['frontend'] });
    config.ios.infoPlist.NSLocationWhenInUseUsageDescription = '러닝 중 위치와 시각을 기기에 저장해 경로와 거리를 측정합니다. 화면 잠금과 다른 앱 사용 중에도 측정을 이어갑니다.';
    config.ios.infoPlist.NSHealthShareUsageDescription = '건강 앱의 러닝 기록과 심박을 읽어 경로를 그리고 러닝 중과 종료 후 심박을 확인합니다.';
    config.ios.infoPlist.NSMotionUsageDescription = '러닝 중 걸음 수와 케이던스를 측정합니다.';
    config.ios.infoPlist.NSHealthUpdateUsageDescription = '러닝 기록과 심박 확인을 위한 건강 데이터 연동에 사용합니다. 건강 데이터에 새 기록을 쓰거나 기존 기록을 수정하지 않습니다.';
    config.ios.infoPlist.UIBackgroundModes = [...new Set([...config.ios.infoPlist.UIBackgroundModes, 'location'])];
    config.plugins.push('./plugins/with-run-tracking.cjs');
    config.plugins.push('./plugins/with-run-live-activity.cjs');
    config.extra.eas.build = { ...config.extra.eas.build, experimental: { ios: { appExtensions: [
      { targetName: 'RunaryWatch', bundleIdentifier: `${config.ios.bundleIdentifier}.watch`, entitlements: { 'com.apple.developer.healthkit': true } },
      { targetName: 'RunaryLiveActivity', bundleIdentifier: `${config.ios.bundleIdentifier}.liveactivity`, entitlements: {} },
    ] } } };
  }
  return config;
};
