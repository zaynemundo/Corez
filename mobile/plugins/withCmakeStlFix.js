/**
 * Workaround for NDK r27's CMake toolchain on this project.
 *
 * NDK 27.1's legacy CMake toolchain does not consume ANDROID_STL=c++_shared:
 * `CMakeCache.txt` records `ANDROID_STL:UNINITIALIZED=c++_shared` and the
 * generated link line omits `-lc++_shared`, so every C++ module (worklets,
 * reanimated, screens, generated codegen modules) fails with hundreds of
 * undefined `std::__ndk1::*` symbols.
 *
 * Forcing the shared STL into CMAKE_CXX_STANDARD_LIBRARIES for every native
 * module fixes the link without patching node_modules. The block is injected
 * into android/build.gradle by this config plugin, so `expo prebuild` always
 * reproduces it.
 *
 * Reference: https://github.com/software-mansion/react-native-reanimated/issues/9444
 */
const { withDangerousMod } = require("expo/config-plugins");
const fs = require("node:fs");
const path = require("node:path");

const MARKER = "// CoreZ CMAKE STL WORKAROUND";
const BLOCK = `${MARKER}
// NDK r27's legacy CMake toolchain does not consume ANDROID_STL=c++_shared,
// which leaves every C++ module linking libc++ symbols without libc++_shared.
// Force the shared STL into the standard libraries for all native modules.
gradle.beforeProject { subproject ->
    subproject.afterEvaluate {
        def androidExt = subproject.extensions.findByName('android')
        if (androidExt != null) {
            try {
                androidExt.externalNativeBuild.cmake.arguments.add(
                    '-DCMAKE_CXX_STANDARD_LIBRARIES=-latomic;-lm;-lc++_shared'
                )
            } catch (Exception ignored) {
                // Modules without a CMake build ignore the argument.
            }
        }
    }
}
`;

module.exports = function withCmakeStlFix(config) {
  return withDangerousMod(config, [
    "android",
    async (cfg) => {
      const buildGradle = path.join(
        cfg.modRequest.platformProjectRoot,
        "build.gradle",
      );
      let contents = fs.readFileSync(buildGradle, "utf8");
      if (!contents.includes(MARKER)) {
        contents = `${contents.trimEnd()}\n\n${BLOCK}`;
        fs.writeFileSync(buildGradle, contents);
      }
      return cfg;
    },
  ]);
};
