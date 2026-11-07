/**
 * Workaround for NDK r27's CMake toolchain on this project.
 *
 * NDK 27.1's legacy CMake toolchain does not consume ANDROID_STL=c++_shared:
 * `CMakeCache.txt` records `ANDROID_STL:UNINITIALIZED=c++_shared` and the
 * generated link line omits `-lc++_shared`, so every C++ module and every
 * generated codegen CMakeLists fails with hundreds of undefined
 * `std::__ndk1::*` symbols.
 *
 * Passing CMAKE_CXX_STANDARD_LIBRARIES through Gradle was tried and does not
 * survive AGP's native build setup, so this plugin injects a Gradle task hook
 * that inserts `link_libraries(c++_shared)` into every reachable native
 * CMakeLists (module top-level files, generated codegen files, the app's
 * autolinked build and React Native's default-app-setup file) immediately
 * before each configureCMake task runs. That makes the shared STL explicit
 * without patching node_modules by hand, and `expo prebuild` always reproduces
 * the fix.
 *
 * A second, environment-level fix is also needed on this machine: the Ninja
 * bundled with SDK CMake 3.22.1 rejects object paths over 260 characters even
 * with Windows long paths enabled. scripts/mobile/build-apk-windows.ps1
 * upgrades that Ninja to 1.12+ before building.
 *
 * Reference: https://github.com/software-mansion/react-native-reanimated/issues/9444
 */
const { withDangerousMod } = require("expo/config-plugins");
const fs = require("node:fs");
const path = require("node:path");

const MARKER = "// CoreZ CMAKE STL WORKAROUND";
const BLOCK = `${MARKER}
// NDK r27's legacy CMake toolchain does not consume ANDROID_STL=c++_shared, so
// native modules and generated codegen CMakeLists link libc++ symbols without
// libc++_shared. Insert an explicit c++_shared link into every reachable
// CMakeLists immediately before each configureCMake task runs (the codegen
// files only exist by then).
def corezPatchCmakeFile(File f) {
    if (!f.exists()) return
    def text = f.text
    if (text.contains('COREZ_CXX_SHARED')) return
    def lines = text.readLines()
    int idx = lines.findIndexOf { it.trim().startsWith('project(') }
    if (idx < 0) return
    lines.add(idx + 1, 'link_libraries(c++_shared) # COREZ_CXX_SHARED')
    f.text = lines.join('\\n')
}
def corezPatchCmakeTrees() {
    def mobileDir = rootProject.projectDir.parentFile
    def candidates = []
    candidates << new File(rootProject.projectDir, 'app')
    candidates << new File(mobileDir, 'node_modules/react-native/ReactAndroid/cmake-utils/default-app-setup/CMakeLists.txt')
    def nodeModules = new File(mobileDir, 'node_modules')
    if (nodeModules.exists()) {
        nodeModules.listFiles()?.each { pkg ->
            if (!pkg.directory) return
            if (pkg.name.startsWith('@')) {
                pkg.listFiles()?.each { scoped -> if (scoped.directory) candidates << new File(scoped, 'android') }
            } else {
                candidates << new File(pkg, 'android')
            }
        }
    }
    candidates.unique().each { entry ->
        if (entry.file) {
            corezPatchCmakeFile(entry)
            return
        }
        if (!entry.exists()) return
        corezPatchCmakeFile(new File(entry, 'CMakeLists.txt'))
        def generated = new File(entry, 'build/generated')
        if (generated.exists()) {
            generated.eachFileRecurse { f -> if (f.name == 'CMakeLists.txt') corezPatchCmakeFile(f) }
        }
        corezPatchCmakeFile(new File(entry, 'src/main/jni/CMakeLists.txt'))
    }
}
gradle.taskGraph.whenReady { graph ->
    graph.allTasks.each { t ->
        if (t.name.startsWith('configureCMake')) {
            t.doFirst { corezPatchCmakeTrees() }
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
