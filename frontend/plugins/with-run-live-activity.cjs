const fs = require('node:fs');
const path = require('node:path');
const { withDangerousMod, withXcodeProject } = require('@expo/config-plugins');

const WIDGET = 'RunaryLiveActivity';
const HOST = 'RunaryLiveHost';
const sources = ['RunaryLiveWidget.swift', 'RunaryRunIntent.swift', 'RunaryLiveAttributes.swift', 'RunaryLiveState.swift'];

function withRunLiveActivity(config) {
  if (process.env.RUNARY_INTERNAL_TRACKING !== '1') return config;
  config = withDangerousMod(config, ['ios', async mod => {
    const root = mod.modRequest.projectRoot;
    const directory = path.join(mod.modRequest.platformProjectRoot, WIDGET);
    const host = path.join(mod.modRequest.platformProjectRoot, HOST);
    fs.mkdirSync(directory, { recursive: true }); fs.mkdirSync(host, { recursive: true });
    for (const name of sources) {
      const source = name === 'RunaryLiveWidget.swift' || name === 'RunaryRunIntent.swift' ? 'live-activity' : 'modules/run-tracking/ios';
      fs.copyFileSync(path.join(root, source, name), path.join(directory, name));
    }
    fs.copyFileSync(path.join(root, 'live-activity/RunaryRunIntent.swift'), path.join(host, 'RunaryRunIntent.swift'));
    const plist = require('@expo/plist').default;
    fs.writeFileSync(path.join(directory, 'Info.plist'), plist.build({
      CFBundleDisplayName: 'Runary', CFBundleIdentifier: '$(PRODUCT_BUNDLE_IDENTIFIER)',
      CFBundleName: '$(PRODUCT_NAME)', CFBundleExecutable: '$(EXECUTABLE_NAME)',
      CFBundlePackageType: 'XPC!', CFBundleShortVersionString: config.version || '1.0.0',
      CFBundleVersion: config.ios.buildNumber || '1',
      NSExtension: { NSExtensionPointIdentifier: 'com.apple.widgetkit-extension' },
    }));
    return mod;
  }]);
  return withXcodeProject(config, mod => { addLiveActivityTarget(mod.modResults, config); return mod; });
}

function addLiveActivityTarget(project, config) {
  const objects = project.hash.project.objects;
  const existing = Object.entries(project.pbxNativeTargetSection()).find(([, t]) => typeof t === 'object' && String(t.name).replaceAll('"', '') === WIDGET);
  const target = existing ? { uuid: existing[0], pbxNativeTarget: existing[1] } : project.addTarget(WIDGET, 'app_extension', WIDGET, `${config.ios.bundleIdentifier}.liveactivity`);
  if (!existing) {
    project.addBuildPhase(sources.map(name => `${WIDGET}/${name}`), 'PBXSourcesBuildPhase', 'Sources', target.uuid);
    project.addBuildPhase([], 'PBXResourcesBuildPhase', 'Resources', target.uuid);
    project.addBuildPhase([], 'PBXFrameworksBuildPhase', 'Frameworks', target.uuid);
    const group = project.addPbxGroup([...sources, 'Info.plist'].map(name => `${WIDGET}/${name}`), WIDGET);
    delete objects.PBXGroup[group.uuid].path;
    project.addToPbxGroup(group.uuid, project.getFirstProject().firstProject.mainGroup);
    // xcode.addTarget embeds and adds the target dependency. Mark the product
    // for installation, preserving its real .appex product reference.
    for (const file of Object.values(objects.PBXBuildFile)) {
      if (typeof file === 'object' && file.fileRef === target.pbxNativeTarget.productReference) file.settings = { ATTRIBUTES: ['RemoveHeadersOnCopy'] };
    }
  }
  const hostFile = `${HOST}/RunaryRunIntent.swift`;
  if (!project.hasFile(hostFile)) {
    const group = project.addPbxGroup([], HOST);
    delete objects.PBXGroup[group.uuid].path;
    project.addToPbxGroup(group.uuid, project.getFirstProject().firstProject.mainGroup);
    project.addSourceFile(hostFile, { target: project.getFirstTarget().uuid }, group.uuid);
  }
  for (const entry of objects.XCConfigurationList[target.pbxNativeTarget.buildConfigurationList].buildConfigurations) {
    Object.assign(objects.XCBuildConfiguration[entry.value].buildSettings, {
      SDKROOT: 'iphoneos', SUPPORTED_PLATFORMS: '"iphoneos iphonesimulator"',
      IPHONEOS_DEPLOYMENT_TARGET: '16.4', TARGETED_DEVICE_FAMILY: '"1,2"', SWIFT_VERSION: '5.0',
      SWIFT_ACTIVE_COMPILATION_CONDITIONS: '"$(inherited) RUNARY_WIDGET_EXTENSION"',
      INFOPLIST_FILE: `${WIDGET}/Info.plist`, GENERATE_INFOPLIST_FILE: 'NO',
      CODE_SIGN_STYLE: 'Automatic', DEVELOPMENT_TEAM: config.ios.appleTeamId,
      CURRENT_PROJECT_VERSION: config.ios.buildNumber || '1', MARKETING_VERSION: config.version || '1.0.0',
      APPLICATION_EXTENSION_API_ONLY: 'YES', SKIP_INSTALL: 'YES',
      ENABLE_USER_SCRIPT_SANDBOXING: 'NO', SWIFT_EMIT_LOC_STRINGS: 'YES',
    });
  }
}
module.exports = withRunLiveActivity;
module.exports.addLiveActivityTarget = addLiveActivityTarget;
