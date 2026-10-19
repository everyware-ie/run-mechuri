const assert = require('node:assert/strict');
const path = require('node:path');
const xcode = require('xcode');
const configure = require('../app.config');
const { addWatchTarget } = require('../plugins/with-run-tracking.cjs');
const { addLiveActivityTarget } = require('../plugins/with-run-live-activity.cjs');
const prior = process.env.RUNARY_INTERNAL_TRACKING;
try {
  process.env.RUNARY_INTERNAL_TRACKING = '1';
  const internal = configure();
  assert.equal(internal.ios.infoPlist.RunaryInternalTracking, true);
  assert.ok(internal.ios.infoPlist.UIBackgroundModes.includes('location'));
  assert.equal(internal.ios.infoPlist.NSSupportsLiveActivities, true);
  assert.ok(internal.ios.infoPlist.CFBundleURLTypes.some(type => type.CFBundleURLSchemes.includes('frontend')));
  assert.equal(internal.extra.eas.build.experimental.ios.appExtensions[1].targetName, 'RunaryLiveActivity');
  assert.equal(internal.extra.eas.build.experimental.ios.appExtensions[1].bundleIdentifier, `${internal.ios.bundleIdentifier}.liveactivity`);
  assert.equal(internal.extra.eas.build.experimental.ios.appExtensions[0].targetName, 'RunaryWatch');
  assert.deepEqual(internal.extra.eas.build.experimental.ios.appExtensions[0].entitlements, { 'com.apple.developer.healthkit': true });
  assert.ok(internal.ios.infoPlist.NSHealthUpdateUsageDescription.includes('새 기록을 쓰거나 기존 기록을 수정하지 않습니다'));
  delete process.env.RUNARY_INTERNAL_TRACKING;
  const publicConfig = configure();
  assert.equal(publicConfig.ios.infoPlist.RunaryInternalTracking, false);
  assert.ok(!publicConfig.ios.infoPlist.UIBackgroundModes.includes('location'));
  assert.ok(!publicConfig.plugins.includes('./plugins/with-run-tracking.cjs'));
  assert.ok(!publicConfig.plugins.includes('./plugins/with-run-live-activity.cjs'));
  assert.equal(publicConfig.ios.infoPlist.NSSupportsLiveActivities, undefined);
  assert.ok(!publicConfig.extra.eas.build?.experimental?.ios?.appExtensions?.length);
  // Exercise target generation from a copy, never mutate the actual project.
  const project = xcode.project(path.resolve(__dirname, '../ios/Runary.xcodeproj/project.pbxproj'));
  project.parseSync();
  const objects = project.hash.project.objects;
  const watchTargets = () => Object.entries(objects.PBXNativeTarget).filter(([, target]) => typeof target === 'object' && String(target.name).replaceAll('"', '') === 'RunaryWatch');
  for (const [targetID] of watchTargets()) {
    delete objects.PBXNativeTarget[targetID]; delete objects.PBXNativeTarget[targetID + '_comment'];
    project.getFirstProject().firstProject.targets = project.getFirstProject().firstProject.targets.filter(target => target.value !== targetID);
  }
  internal.ios.buildNumber = '321';
  addWatchTarget(project, internal);
  const [targetID, target] = watchTargets()[0];
  assert.equal(watchTargets().length, 1);
  assert.ok(project.hasFile('RunaryWatch/TrackingWatchDisplay.swift'));
  assert.ok(project.hasFile('RunaryWatch/TrackingWatchHealth.swift'));
  assert.ok(project.hasFile('RunaryWatch/WatchHealthReader.swift'));
  assert.ok(project.getFirstTarget().firstTarget.dependencies.some(dependency => objects.PBXTargetDependency[dependency.value].target === targetID));
  const group = Object.values(objects.PBXGroup).filter(value => typeof value === 'object' && value.name === 'RunaryWatch').at(-1);
  assert.ok(group && !Object.hasOwn(group, 'path'));
  for (const config of objects.XCConfigurationList[target.buildConfigurationList].buildConfigurations) {
    assert.equal(objects.XCBuildConfiguration[config.value].buildSettings.CURRENT_PROJECT_VERSION, '321');
  }
  const count = project.getFirstProject().firstProject.targets.length;
  addWatchTarget(project, internal);
  assert.equal(project.getFirstProject().firstProject.targets.length, count);
  const liveTargets = () => Object.entries(objects.PBXNativeTarget).filter(([, value]) => typeof value === 'object' && String(value.name).replaceAll('"', '') === 'RunaryLiveActivity');
  for (const [id] of liveTargets()) {
    delete objects.PBXNativeTarget[id]; delete objects.PBXNativeTarget[id + '_comment'];
    project.getFirstProject().firstProject.targets = project.getFirstProject().firstProject.targets.filter(target => target.value !== id);
  }
  addLiveActivityTarget(project, internal);
  const [liveID, live] = liveTargets()[0];
  assert.equal(liveTargets().length, 1);
  const sourcePhase = live.buildPhases.map(phase => objects.PBXSourcesBuildPhase[phase.value]).find(Boolean);
  const filenames = sourcePhase.files.map(item => objects.PBXBuildFile[item.value].fileRef_comment);
  assert.equal(filenames.length, 4);
  assert.ok(filenames.every(file => !/TrackingManager|Expo|TrackingStore|Watch/.test(file)));
  assert.ok(project.hasFile('RunaryLiveHost/RunaryRunIntent.swift'));
  assert.ok(project.getFirstTarget().firstTarget.dependencies.some(dependency => objects.PBXTargetDependency[dependency.value].target === liveID));
  const embedded = Object.values(objects.PBXBuildFile).filter(file => typeof file === 'object' && file.fileRef === live.productReference);
  assert.equal(embedded.length, 1);
  assert.ok(embedded[0].settings.ATTRIBUTES.includes('RemoveHeadersOnCopy'));
  for (const entry of objects.XCConfigurationList[live.buildConfigurationList].buildConfigurations) {
    const settings = objects.XCBuildConfiguration[entry.value].buildSettings;
    assert.equal(settings.CURRENT_PROJECT_VERSION, '321');
    assert.equal(settings.IPHONEOS_DEPLOYMENT_TARGET, '16.4');
    assert.equal(settings.APPLICATION_EXTENSION_API_ONLY, 'YES');
    assert.equal(settings.SKIP_INSTALL, 'YES');
    assert.ok(settings.SWIFT_ACTIVE_COMPILATION_CONDITIONS.includes('RUNARY_WIDGET_EXTENSION'));
  }
  const afterLive = project.getFirstProject().firstProject.targets.length;
  addLiveActivityTarget(project, internal);
  assert.equal(project.getFirstProject().firstProject.targets.length, afterLive);
  assert.equal(liveTargets().length, 1);
  console.log('Tracking public/internal gates, Watch and Live Activity target generation passed');
} finally {
  if (prior == null) delete process.env.RUNARY_INTERNAL_TRACKING;
  else process.env.RUNARY_INTERNAL_TRACKING = prior;
}
