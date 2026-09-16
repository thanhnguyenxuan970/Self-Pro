const { readFileSync } = jest.requireActual<{
  readFileSync(path: string, encoding: string): string;
}>('fs');

const read = (relativePath: string) => readFileSync(`${process.cwd()}/${relativePath}`, 'utf8');

describe('Android adaptive release contract', () => {
  test('limits QA cleartext transport to the emulator host without weakening release', () => {
    const network = read('android/app/src/qa/res/xml/network_security_config_qa.xml');
    expect(network).toContain('<base-config cleartextTrafficPermitted="false" />');
    expect(network.match(/<domain includeSubdomains="false">[^<]+<\/domain>/g))
      .toEqual(['<domain includeSubdomains="false">10.0.2.2</domain>']);
    const manifest = read('android/app/src/qa/AndroidManifest.xml');
    expect(manifest).toContain('@xml/network_security_config_qa');
    expect(read('android/app/src/main/AndroidManifest.xml')).not.toContain('network_security_config_qa');
    const gradle = read('android/app/build.gradle');
    const qa = gradle.match(/qa \{([\s\S]*?)\n        \}/)?.[1];
    expect(qa).toContain('initWith release');
    expect(qa).toContain('signingConfig signingConfigs.release');
    expect(qa).toContain('minifyEnabled false');
    expect(qa).toContain('shrinkResources false');
    expect(read('android/gradle.properties')).toContain('android.enableMinifyInReleaseBuilds=true');
  });

  test('does not ship app-owned portrait or legacy window restrictions', () => {
    const appConfig = JSON.parse(read('app.json')) as {
      expo?: {
        orientation?: string;
        ios?: { infoPlist?: { UISupportedInterfaceOrientations?: string[] } };
        android?: { versionCode?: number };
      };
    };
    expect(appConfig.expo?.orientation).toBeUndefined();
    expect(appConfig.expo?.ios?.infoPlist?.UISupportedInterfaceOrientations).toEqual([
      'UIInterfaceOrientationPortrait',
      'UIInterfaceOrientationPortraitUpsideDown',
    ]);

    const buildGradle = read('android/app/build.gradle');
    const buildVersionCode = buildGradle.match(/versionCode\s+(\d+)/)?.[1];
    expect(buildVersionCode).toBe(String(appConfig.expo?.android?.versionCode));

    const manifest = read('android/app/src/main/AndroidManifest.xml');
    expect(manifest).not.toMatch(/android:screenOrientation\s*=/);
    expect(manifest).toMatch(/android:enableOnBackInvokedCallback\s*=\s*"true"/);

    const styles = read('android/app/src/main/res/values/styles.xml');
    expect(styles).not.toMatch(/android:(statusBarColor|navigationBarColor)/);

    const rootNavigator = read('src/navigation/RootNavigator.tsx');
    const statusBar = rootNavigator.match(/<StatusBar[\s\S]*?\/>/)?.[0] ?? '';
    expect(statusBar).not.toMatch(/backgroundColor=|translucent/);

    const mainActivity = read('android/app/src/main/java/com/habitring/app/MainActivity.kt');
    expect(mainActivity).not.toMatch(/override fun onBackPressed\s*\(/);
    expect(mainActivity).not.toMatch(/^\s*onBackPressed\(\)\s*$/m);
  });
});
