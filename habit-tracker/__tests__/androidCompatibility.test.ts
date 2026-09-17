const { readFileSync } = jest.requireActual<{
  readFileSync(path: string, encoding: string): string;
}>('fs');
import { APP_VERSION_CODE, APP_VERSION_NAME } from '../src/lib/authTelemetry';

const read = (relativePath: string) => readFileSync(`${process.cwd()}/${relativePath}`, 'utf8');

describe('Android adaptive release contract', () => {
  test('does not ship app-owned portrait or legacy window restrictions', () => {
    const appConfig = JSON.parse(read('app.json')) as {
      expo?: {
        orientation?: string;
        ios?: { infoPlist?: { UISupportedInterfaceOrientations?: string[] } };
        version?: string;
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
    const buildVersionName = buildGradle.match(/versionName\s+"([^"]+)"/)?.[1];
    expect(buildVersionCode).toBe(String(appConfig.expo?.android?.versionCode));
    expect(buildVersionName).toBe(appConfig.expo?.version);

    const packageVersion = (JSON.parse(read('package.json')) as { version?: string }).version;
    const lockfileVersion = (JSON.parse(read('package-lock.json')) as { version?: string }).version;
    expect(packageVersion).toBe(appConfig.expo?.version);
    expect(lockfileVersion).toBe(appConfig.expo?.version);
    expect(APP_VERSION_NAME).toBe(appConfig.expo?.version);
    expect(APP_VERSION_CODE).toBe(appConfig.expo?.android?.versionCode);

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
