const {
  withAndroidManifest,
  withDangerousMod,
  withMainApplication,
  AndroidConfig,
} = require("@expo/config-plugins");
const fs = require("fs");
const path = require("path");

const PERMISSIONS = [
  "android.permission.RECORD_AUDIO",
  "android.permission.SYSTEM_ALERT_WINDOW",
  "android.permission.FOREGROUND_SERVICE",
  "android.permission.FOREGROUND_SERVICE_MICROPHONE",
  "android.permission.POST_NOTIFICATIONS",
];

function withPermissions(config) {
  return withAndroidManifest(config, (config) => {
    const manifest = config.modResults;
    PERMISSIONS.forEach((perm) => {
      AndroidConfig.Permissions.ensurePermission(manifest, perm);
    });

    const app = manifest.manifest.application[0];
    app.service = app.service || [];
    const already = app.service.some(
      (s) => s["$"]["android:name"] === ".convo.ConvoForegroundService"
    );
    if (!already) {
      app.service.push({
        $: {
          "android:name": ".convo.ConvoForegroundService",
          "android:exported": "false",
          "android:foregroundServiceType": "microphone",
        },
      });
    }
    return config;
  });
}

function withCopiedNativeSources(config) {
  return withDangerousMod(config, [
    "android",
    async (config) => {
      const pkg = config.android.package;
      const pkgPath = pkg.replace(/\./g, "/");
      const srcDir = path.join(
        config.modRequest.platformProjectRoot,
        "app/src/main/java",
        pkgPath,
        "convo"
      );
      fs.mkdirSync(srcDir, { recursive: true });

      const nativeDir = path.join(__dirname, "native");
      const files = [
        "AstralConvoModule.kt",
        "AstralConvoPackage.kt",
        "ConvoForegroundService.kt",
      ];
      files.forEach((file) => {
        const raw = fs.readFileSync(path.join(nativeDir, file), "utf8");
        const rewritten = raw.replace(/__PACKAGE__/g, pkg);
        fs.writeFileSync(path.join(srcDir, file), rewritten, "utf8");
      });

      // Notification small icon — must be a white/transparent silhouette.
      // Reuses the project's existing monochrome adaptive-icon asset.
      const monoSrc = path.join(
        config.modRequest.projectRoot,
        "assets/images/android-icon-monochrome.png"
      );
      const drawableDir = path.join(
        config.modRequest.platformProjectRoot,
        "app/src/main/res/drawable"
      );
      fs.mkdirSync(drawableDir, { recursive: true });
      if (fs.existsSync(monoSrc)) {
        fs.copyFileSync(monoSrc, path.join(drawableDir, "notification_icon.png"));
      }

      // Notification large icon — full-color app icon, gives the notification
      // a branded look instead of a bare system-style small icon.
      const largeSrc = path.join(
        config.modRequest.projectRoot,
        "assets/images/icon.png"
      );
      if (fs.existsSync(largeSrc)) {
        fs.copyFileSync(largeSrc, path.join(drawableDir, "notification_large_icon.png"));
      }

      return config;
    },
  ]);
}

function withPackageRegistration(config) {
  return withMainApplication(config, (config) => {
    const pkg = config.android.package;
    let contents = config.modResults.contents;
    const importLine = `import ${pkg}.convo.AstralConvoPackage`;

    if (!contents.includes(importLine)) {
      contents = contents.replace(
        /(package .*\n)/,
        `$1\n${importLine}\n`
      );
    }
    if (!contents.includes("AstralConvoPackage()")) {
      // Matches the standard Expo/RN template's PackageList usage.
      contents = contents.replace(
        /(val packages = PackageList\(this\)\.packages)/,
        `$1\n          packages.add(AstralConvoPackage())`
      );
    }
    config.modResults.contents = contents;
    return config;
  });
}

module.exports = function withAstralConvoNative(config) {
  config = withPermissions(config);
  config = withCopiedNativeSources(config);
  config = withPackageRegistration(config);
  return config;
};
