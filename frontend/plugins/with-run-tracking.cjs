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
    fs.copyFileSync(path.join(mod.modRequest.projectRoot, 'modules/run-tracking/ios/TrackingWatchDisplay.swift'), path.join(directory, 'TrackingWatchDisplay.swift'));
    fs.copyFileSync(path.join(mod.modRequest.projectRoot, 'modules/run-tracking/ios/TrackingWatchHealth.swift'), path.join(directory, 'TrackingWatchHealth.swift'));
    fs.copyFileSync(path.join(mod.modRequest.projectRoot, 'watch/WatchHealthReader.swift'), path.join(directory, 'WatchHealthReader.swift'));
    const plist = require('@expo/plist').default;
    fs.writeFileSync(path.join(directory, 'Info.plist'), plist.build({
      CFBundleDisplayName: 'Runary', CFBundleIdentifier: '$(PRODUCT_BUNDLE_IDENTIFIER)',
      CFBundleName: '$(PRODUCT_NAME)', CFBundleExecutable: '$(EXECUTABLE_NAME)',
      CFBundlePackageType: 'APPL', CFBundleShortVersionString: config.version || '1.0.0',
      CFBundleVersion: config.ios.buildNumber || '1', WKApplication: true,
      WKCompanionAppBundleIdentifier: config.ios.bundleIdentifier,
      WKRunsIndependentlyOfCompanionApp: false,
      NSHealthShareUsageDescription: '워치 건강 저장소의 심박을 읽어 같은 아이폰 러닝 기록에 전달합니다.',
      NSHealthUpdateUsageDescription: '러닝 중 심박 확인을 위한 건강 데이터 연동에 사용합니다. 건강 데이터에 새 기록을 쓰거나 기존 기록을 수정하지 않습니다.',
    }));
    fs.writeFileSync(path.join(directory, 'RunaryWatch.entitlements'), plist.build({ 'com.apple.developer.healthkit': true }));
    const assets = path.join(directory, 'Assets.xcassets');
    const icon = path.join(assets, 'AppIcon.appiconset');
    fs.mkdirSync(icon, { recursive: true });
    const info = { version: 1, author: 'runary' };
    fs.writeFileSync(path.join(assets, 'Contents.json'), JSON.stringify({ info }));
    fs.writeFileSync(path.join(icon, 'Contents.json'), JSON.stringify({ info, images: [{ filename: 'icon.png', idiom: 'universal', platform: 'watchos', size: '1024x1024' }] }));
    const { generateImageAsync } = require('@expo/image-utils');
    const image = await generateImageAsync({ projectRoot: mod.modRequest.projectRoot, cacheType: 'runary-watch-icon' }, {
      src: path.resolve(mod.modRequest.projectRoot, config.ios.icon || config.icon),
      width: 1024, height: 1024, resizeMode: 'cover', removeTransparency: true, backgroundColor: '#F0EAE3',
    });
    fs.writeFileSync(path.join(icon, 'icon.png'), image.source);
    return mod;
  }]);
  return withXcodeProject(config, mod => { addWatchTarget(mod.modResults, config); return mod; });
}
function addWatchTarget(project, config) {
    const existing = Object.entries(project.pbxNativeTargetSection()).find(([, t]) => typeof t === 'object' && String(t.name).replaceAll('"', '') === WATCH);
    if (existing) {
      for (const name of ['TrackingWatchDisplay.swift', 'TrackingWatchHealth.swift', 'WatchHealthReader.swift']) {
        const filename = `${WATCH}/${name}`;
        if (project.hasFile(filename)) continue;
        const group = Object.entries(project.hash.project.objects.PBXGroup).find(([, g]) => typeof g === 'object' && g.name === WATCH);
        project.addSourceFile(filename, { target: existing[0] }, group?.[0]);
      }
      return;
    }
    const target = project.addTarget(WATCH, 'application', WATCH, `${config.ios.bundleIdentifier}.watch`);
    project.addBuildPhase(['RunaryWatchApp.swift', 'TrackingWatchDisplay.swift', 'TrackingWatchHealth.swift', 'WatchHealthReader.swift'].map(name => `${WATCH}/${name}`), 'PBXSourcesBuildPhase', 'Sources', target.uuid);
    project.addBuildPhase([`${WATCH}/Assets.xcassets`], 'PBXResourcesBuildPhase', 'Resources', target.uuid);
    project.addBuildPhase([], 'PBXFrameworksBuildPhase', 'Frameworks', target.uuid);
    const group = project.addPbxGroup(['RunaryWatchApp.swift', 'TrackingWatchDisplay.swift', 'TrackingWatchHealth.swift', 'WatchHealthReader.swift', 'Info.plist', 'RunaryWatch.entitlements'].map(name => `${WATCH}/${name}`), WATCH);
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
