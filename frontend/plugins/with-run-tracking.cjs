const fs = require('fs');
const path = require('path');
const { withDangerousMod, withXcodeProject } = require('@expo/config-plugins');

const WATCH = 'RunaryWatch';
function withRunTracking(config) {
  if (process.env.RUNARY_INTERNAL_TRACKING !== '1') return config;
  config = withDangerousMod(config, ['ios', async mod => {
    const directory = path.join(mod.modRequest.platformProjectRoot, WATCH);
    fs.mkdirSync(directory, { recursive: true });
    fs.copyFileSync(path.join(mod.modRequest.projectRoot, 'watch/RunaryWatchApp.swift'), path.join(directory, 'RunaryWatchApp.swift'));
    const plist = require('@expo/plist').default;
    fs.writeFileSync(path.join(directory, 'Info.plist'), plist.build({
      CFBundleDisplayName: 'Runary', CFBundleIdentifier: '$(PRODUCT_BUNDLE_IDENTIFIER)',
      CFBundleName: '$(PRODUCT_NAME)', CFBundleExecutable: '$(EXECUTABLE_NAME)',
      CFBundlePackageType: 'APPL', CFBundleShortVersionString: config.version || '1.0.0',
      CFBundleVersion: config.ios.buildNumber || '1', WKApplication: true,
      WKCompanionAppBundleIdentifier: config.ios.bundleIdentifier,
      WKRunsIndependentlyOfCompanionApp: false, WKBackgroundModes: ['workout-processing'],
      NSHealthShareUsageDescription: '러닝 중 워치의 심박수를 확인하고 Runary 기록에 보관합니다.',
      NSHealthUpdateUsageDescription: '심박 측정을 위한 운동 세션을 실행합니다. 완성한 운동은 건강 앱에 중복 저장하지 않습니다.',
    }));
    fs.writeFileSync(path.join(directory, 'RunaryWatch.entitlements'), plist.build({ 'com.apple.developer.healthkit': true }));
    const assets = path.join(directory, 'Assets.xcassets');
    const icon = path.join(assets, 'AppIcon.appiconset');
    fs.mkdirSync(icon, { recursive: true });
    const info = { version: 1, author: 'runary' };
    fs.writeFileSync(path.join(assets, 'Contents.json'), JSON.stringify({ info }));
    fs.writeFileSync(path.join(icon, 'Contents.json'), JSON.stringify({ info, images: [{ filename: 'icon.png', idiom: 'universal', platform: 'watchos', size: '1024x1024' }] }));
    fs.copyFileSync(path.resolve(mod.modRequest.projectRoot, config.ios.icon || config.icon), path.join(icon, 'icon.png'));
    return mod;
  }]);
  return withXcodeProject(config, mod => { addWatchTarget(mod.modResults, config); return mod; });
}
function addWatchTarget(project, config) {
    const existing = Object.values(project.pbxNativeTargetSection()).some(t => typeof t === 'object' && String(t.name).replaceAll('"', '') === WATCH);
    if (existing) return;
    const target = project.addTarget(WATCH, 'application', WATCH, `${config.ios.bundleIdentifier}.watch`);
    project.addBuildPhase([`${WATCH}/RunaryWatchApp.swift`], 'PBXSourcesBuildPhase', 'Sources', target.uuid);
    project.addBuildPhase([`${WATCH}/Assets.xcassets`], 'PBXResourcesBuildPhase', 'Resources', target.uuid);
    project.addBuildPhase([], 'PBXFrameworksBuildPhase', 'Frameworks', target.uuid);
    const group = project.addPbxGroup([`${WATCH}/RunaryWatchApp.swift`, `${WATCH}/Info.plist`, `${WATCH}/RunaryWatch.entitlements`], WATCH);
    delete project.hash.project.objects.PBXGroup[group.uuid].path;
    project.hash.project.objects.PBXTargetDependency ||= {};
    project.hash.project.objects.PBXContainerItemProxy ||= {};
    project.addToPbxGroup(group.uuid, project.getFirstProject().firstProject.mainGroup);
    project.addTargetDependency(project.getFirstTarget().uuid, [target.uuid]);
    const phase = project.addBuildPhase([`${WATCH}.app`], 'PBXCopyFilesBuildPhase', 'Embed Watch Content', project.getFirstTarget().uuid, 'watch2_app', '"$(CONTENTS_FOLDER_PATH)/Watch"');
    // xcode's generic application copy must refer to the target product, not a
    // new source-tree reference. Frameworks use destination 16 for Watch content.
    const objects = project.hash.project.objects;
    for (const item of phase.buildPhase.files) {
      const file = objects.PBXBuildFile[item.value];
      file.fileRef = target.pbxNativeTarget.productReference;
      file.settings = { ATTRIBUTES: ['RemoveHeadersOnCopy'] };
    }
    const list = objects.XCConfigurationList[target.pbxNativeTarget.buildConfigurationList];
    for (const entry of list.buildConfigurations) {
      const settings = objects.XCBuildConfiguration[entry.value].buildSettings;
      Object.assign(settings, {
        SDKROOT: 'watchos', SUPPORTED_PLATFORMS: '"watchos watchsimulator"',
        WATCHOS_DEPLOYMENT_TARGET: '10.0', TARGETED_DEVICE_FAMILY: '4', SWIFT_VERSION: '5.0',
        INFOPLIST_FILE: `${WATCH}/Info.plist`, CODE_SIGN_ENTITLEMENTS: `${WATCH}/RunaryWatch.entitlements`,
        CODE_SIGN_STYLE: 'Automatic', DEVELOPMENT_TEAM: config.ios.appleTeamId,
        CURRENT_PROJECT_VERSION: config.ios.buildNumber || '1', MARKETING_VERSION: config.version || '1.0.0',
        ENABLE_USER_SCRIPT_SANDBOXING: 'NO', GENERATE_INFOPLIST_FILE: 'NO', ASSETCATALOG_COMPILER_APPICON_NAME: 'AppIcon',
      });
      if (entry.comment === 'Release') settings.SWIFT_OPTIMIZATION_LEVEL = '"-O"';
    }
}
module.exports = withRunTracking;
module.exports.addWatchTarget = addWatchTarget;
