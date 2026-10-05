const assert = require('node:assert/strict');
const path = require('node:path');
const xcode = require('xcode');
const configure = require('../app.config');
const { addWatchTarget } = require('../plugins/with-run-tracking.cjs');
const prior = process.env.RUNARY_INTERNAL_TRACKING;
try {
  process.env.RUNARY_INTERNAL_TRACKING = '1';
  const internal = configure();
  assert.equal(internal.ios.infoPlist.RunaryInternalTracking, true);
  assert.ok(internal.ios.infoPlist.UIBackgroundModes.includes('location'));
  assert.equal(internal.extra.eas.build.experimental.ios.appExtensions[0].targetName, 'RunaryWatch');
  delete process.env.RUNARY_INTERNAL_TRACKING;
  const publicConfig = configure();
  assert.equal(publicConfig.ios.infoPlist.RunaryInternalTracking, false);
  assert.ok(!publicConfig.ios.infoPlist.UIBackgroundModes.includes('location'));
  assert.ok(!publicConfig.plugins.includes('./plugins/with-run-tracking.cjs'));
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
  assert.ok(project.getFirstTarget().firstTarget.dependencies.some(dependency => objects.PBXTargetDependency[dependency.value].target === targetID));
  const group = Object.values(objects.PBXGroup).filter(value => typeof value === 'object' && value.name === 'RunaryWatch').at(-1);
  assert.ok(group && !Object.hasOwn(group, 'path'));
  for (const config of objects.XCConfigurationList[target.buildConfigurationList].buildConfigurations) {
    assert.equal(objects.XCBuildConfiguration[config.value].buildSettings.CURRENT_PROJECT_VERSION, '321');
  }
  const count = project.getFirstProject().firstProject.targets.length;
  addWatchTarget(project, internal);
  assert.equal(project.getFirstProject().firstProject.targets.length, count);
  console.log('Tracking public/internal gates and Watch target generation passed');
} finally {
  if (prior == null) delete process.env.RUNARY_INTERNAL_TRACKING;
  else process.env.RUNARY_INTERNAL_TRACKING = prior;
}
