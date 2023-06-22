import * as core from "@actions/core";
import main from "./main";

/**
 * A Github action that builds an ecbuild/CMake-based project, optionally pulling in its dependencies, running tests and
 * collecting code coverage.
 *
 * Inputs:
 *   @param {string} workspace The location of currently checked out source repository.
 *   @param {string} repository The currently checked out source repository name. Repository names should follow the
 *     standard Github `owner/name@ref` format. `@ref` is optional, takes precedence over `sha` input.
 *   @param {string} sha The currently checked out source repository commit SHA.
 *   @param {boolean} cmake Whether to use CMake for build configuration, instead of ecbuild.
 *   @param {string} cmake_options The list of ecbuild/CMake options to be passed during the current
 *     repository build configuration phase. Use the form of `-DCMAKE_VAR=1 -DCMAKE_ANOTHER_VAR=0` to define multiple
 *     options. If left empty, the repository will be configured with default options only.
 *   @param {string} ctest_options The list of ctest options to be passed to the test command for the current
 *     repository. Use the form of `-R <include-regex> -E <exclude-regex>` to define multiple options. If left empty,
 *     the repository will be tested with default options only.
 *   @param {boolean} self_build Whether to build from currently checked out repository or not.
 *   @param {boolean} self_test Whether to run tests from currently checked out repository or not.
 *   @param {boolean} self_coverage Whether to collect code coverage from currently checked out repository or not.
 *     Note that `test` input must be set to true for this to work. Currently supported only on Ubuntu 20.04 platform.
 *   @param {string} dependencies The list of dependency repositories to build from, in correct order. Repository names
 *     should follow the standard Github `owner/name` format. To specify different branch name per repository, use
 *     `owner/name@branch_name` format. To specify specific tag name per repository, use
 *     `owner/name@refs/tags/tag_name` format.
 *   @param {string} dependency_branch The default branch (or tag) name for dependency repositories. Will be ignored if
 *     the branch (or tag) name is specified per repository, see `dependencies` input. To specify specific tag name,
 *     use `refs/tags/tag_name` format.
 *   @param {string} dependency_cmake_options The list of ecbuild/CMake options to be passed during the dependency
 *     build configuration phase. Use the form of `owner/name: "-DCMAKE_VAR=1"` to define options for the package or
 *     its dependencies. If the package is not listed, it will be configured with default options only.
 *   @param {boolean} force_build Whether to always build dependencies from latest repository states or not. Otherwise,
 *     the action will first try to download a build artifact if it exists.
 *   @param {string} cache_suffix A string which will be appended to the cache key. To invalidate the build cache,
 *     simply change its value.
 *   @param {boolean} recreate_cache Whether to skip restoring builds from cache and recreate them instead.
 *   @param {boolean} save_cache Whether to save builds to cache and upload build artifacts.
 *   @param {string} os Current OS platform.
 *   @param {string} compiler Current compiler family.
 *   @param {string} compiler_cc Current C compiler alias.
 *   @param {string} compiler_cxx Current C++ compiler alias.
 *   @param {string} compiler_fc Current Fortran compiler alias.
 *   @param {string} toolchain_file Path to toolchain file.
 *   @param {string} github_token Github access token, with `repo` and `actions:read` scopes.
 *   @param {string} install_dir Directory where the dependencies and current package will be installed. Each
 *     dependency will be installed in its own subdirectory.
 *   @param {string} download_dir Directory where the dependency repositories and artifacts will be downloaded.
 *   @param {string} parallelism_factor Number of threads build job will utilise on the runner.
 *   @param {string} cpack_generator Type of generator to use when packaging.
 *   @param {string} cpack_options List of options for cpack.
 * Outputs:
 *   @param {String} bin_paths Binary paths of all installed packages, delimited by colons (:).
 *   @param {String} include_path Include paths of all installed packages, delimited by colons (:).
 *   @param {String} install_path Install paths of all installed packages, delimited by colons (:).
 *   @param {String} lib_path Library paths of all installed packages, delimited by colons (:).
 *   @param {String} coverage_file Absolute path to code coverage file, if collected.
 *   @param {String} package_path Absolute path to generated package.
 */
// eslint-disable-next-line jest/require-hook
main()
    .then((outputs: ActionOutputs) => {
        core.startGroup("Set Outputs");

        core.info(`==> bin_path: ${outputs.bin_path}`);
        core.info(`==> include_path: ${outputs.include_path}`);
        core.info(`==> install_path: ${outputs.install_path}`);
        core.info(`==> lib_path: ${outputs.lib_path}`);

        if (outputs.coverage_file) {
            core.info(`==> coverage_file: ${outputs.coverage_file}`);
        }

        if (outputs.package_path) {
            core.info(`==> package_path: ${outputs.package_path}`);
        }

        core.setOutput("bin_path", outputs.bin_path);
        core.setOutput("include_path", outputs.include_path);
        core.setOutput("install_path", outputs.install_path);
        core.setOutput("lib_path", outputs.lib_path);

        if (outputs.coverage_file) {
            core.setOutput("coverage_file", outputs.coverage_file);
        }
        if (outputs.package_path) {
            core.setOutput("package_path", outputs.package_path);
        }
        core.endGroup();
    })
    .catch((failureMessage: string) => {
        core.setFailed(failureMessage);
    });
