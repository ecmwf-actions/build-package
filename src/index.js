const core = require('@actions/core');
const main = require('./main');

/**
 * A Github action that builds an ecbuild/CMake-based project, optionally pulling in its dependencies, running tests and
 * collecting code coverage.
 *
 * Inputs:
 *   @param {String} workspace The location of currently checked out source repository.
 *   @param {String} repository The current repository name. Repository names should follow the standard Github
 *     `owner/name` format.
 *   @param {Boolean} cmake Whether to use CMake for build configuration, instead of ecbuild.
 *   @param {MultilineString} cmake_options The list of ecbuild/CMake options to be passed during the build c
 *     configuration phase. Use the form of `owner/name: "-DCMAKE_VAR=1"` to define options for the package or its
 *     dependencies. If the package is not listed, it will be configured with default options only.
 *   @param {Boolean} self_build Whether to build from currently checked out repository or not.
 *   @param {Boolean} self_test Whether to run tests from currently checked out repository or not.
 *   @param {Boolean} self_coverage Whether to collect code coverage from currently checked out repository or not.
 *     Note that `test` input must be set to true for this to work. Currently supported only on Ubuntu 20.04 platform.
 *   @param {MultilineString} dependencies The list of dependency repositories to build from, in correct order.
 *     Repository names should follow the standard Github `owner/name` format. To specify different branch name per
 *     repository, use `owner/name@branch_name` format.
 *   @param {String} dependency_branch The default branch name for dependency repositories. Will be ignored if the
 *     branch name is specified per repository, see `dependencies` input.
 *   @param {Boolean} force_build Whether to always build dependencies from latest repository states or not. Otherwise,
 *     the action will first try to download a build artifact if it exists.
 *   @param {String} os Current OS platform.
 *   @param {String} compiler Current compiler family.
 *   @param {String} compiler_cc Current C compiler alias.
 *   @param {String} compiler_cxx Current C++ compiler alias.
 *   @param {String} compiler_fc Current Fortran compiler alias.
 *   @param {String} github_token Github access token, with `repo` and `actions:read` scopes.
 *   @param {String} install_dir Directory where the dependencies and current package will be installed. Each
 *     dependency will be installed in its own subdirectory.
 *   @param {String} download_dir Directory where the dependency repositories and artifacts will be downloaded.
 *
 * Outputs:
 *   @param {String} bin_paths Binary paths of all installed packages, delimited by colons (:).
 *   @param {String} include_path Include paths of all installed packages, delimited by colons (:).
 *   @param {String} install_path Install paths of all installed packages, delimited by colons (:).
 *   @param {String} lib_path Library paths of all installed packages, delimited by colons (:).
 *   @param {String} coverage_file Absolute path to code coverage file, if collected.
 */
main.call()
    .then((outputs) => {
        core.startGroup('Set Outputs');

        core.info(`==> bin_path: ${outputs.bin_path}`)
        core.info(`==> include_path: ${outputs.include_path}`);
        core.info(`==> install_path: ${outputs.install_path}`);
        core.info(`==> lib_path: ${outputs.lib_path}`);

        if (outputs.coverage_file) {
            core.info(`==> coverage_file: ${outputs.coverage_file}`);
        }

        core.setOutput('bin_path', outputs.bin_path);
        core.setOutput('include_path', outputs.include_path);
        core.setOutput('install_path', outputs.install_path);
        core.setOutput('lib_path', outputs.lib_path);

        if (outputs.coverage_file) {
            core.setOutput('coverage_file', outputs.coverage_file);
        }

        core.endGroup();
    }).catch((failureMessage) => {
        core.setFailed(failureMessage);
    });
