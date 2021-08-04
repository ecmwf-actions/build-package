const path = require('path');
const core = require('@actions/core');

const { setupEnv } = require('./env-functions');
const { restoreCache, saveCache } = require('./cache-functions');
const downloadArtifact = require('./download-artifact');
const uploadArtifact = require('./upload-artifact');
const downloadRepository = require('./download-repository');
const buildPackage = require('./build-package');

/**
 * First, the main function checks if a dependency build artifact can be found for current OS and compiler combination.
 * Otherwise, it will checkout dependency repository, build and install it. Dependency builds are automatically
 * cached, if successful.
 *
 * Then, the main function will build currently checked out repository, run tests, collect code coverage and create
 * artifacts for later use.
 *
 * @returns {Promise} Outputs object on resolution, failure message on rejection.
 */
module.exports = async () => {
    try {
        const workspace = core.getInput('workspace', { required: true });
        const repository = core.getInput('repository', { required: true });
        const cmake = core.getBooleanInput('cmake', { required: true });
        const selfBuild = core.getBooleanInput('self_build', { required: true });
        const selfTest = core.getBooleanInput('self_test', { required: true });
        const selfCoverage = core.getBooleanInput('self_coverage', { required: true });
        const dependencies = core.getMultilineInput('dependencies', { required: false });
        const dependencyBranchDefault = core.getInput('dependency_branch', { required: true });
        const forceBuild = core.getBooleanInput('force_build', { required: true });
        const cmakeOptionLines = core.getMultilineInput('cmake_options', { required: false }) || [];
        const os = core.getInput('os', { required: true });
        const compiler = core.getInput('compiler', { required: false });
        const compilerCc = core.getInput('compiler_cc', { required: false });
        const compilerCxx = core.getInput('compiler_cxx', { required: false });
        const compilerFc = core.getInput('compiler_fc', { required: false });
        const githubToken = core.getInput('github_token', { required: true });
        const installDir = core.getInput('install_dir', { required: true });
        const downloadDir = core.getInput('download_dir', { required: true });

        const cmakeOptionsLookup = {};
        for (const cmakeOptionLine of cmakeOptionLines) {
            const [repo, options] = cmakeOptionLine.split(/:\s?(.+)/);
            if (!repo || !options) return Promise.reject(`Unexpected CMake option, must be in 'owner/repo: option' format: ${cmakeOptionLine}`);
            cmakeOptionsLookup[repo] = options.replace(/^['"]|['"]$/g, '');
        }

        const env = await setupEnv(os, compilerCc, compilerCxx, compilerFc);

        if (!env) return Promise.reject('Error setting up build environment');

        for (const dependency of dependencies) {
            const [dependencyRepository, dependencyBranchSpecific] = dependency.split('@');
            const [owner, repo] = dependencyRepository.split('/');

            if (!owner || !repo) return Promise.reject(`Unexpected dependency name, must be in 'owner/repo[@branch]' format: ${dependency}`);

            const dependencyBranch = dependencyBranchSpecific || dependencyBranchDefault;

            // If the build is not forced, first try to download an artifact.
            if (!forceBuild) {
                const isArtifactDownloaded = await downloadArtifact(dependencyRepository, dependencyBranch, githubToken, downloadDir, path.join(installDir, repo), os, compiler, env);

                if (isArtifactDownloaded) continue;
            }

            // Check if we already cached the build of this package.
            const cacheHit = await restoreCache(dependencyRepository, dependencyBranch, githubToken, path.join(installDir, repo), os, compiler, env);

            if (cacheHit) continue;

            // Otherwise, download the latest repository state.
            const isRepositoryDownloaded = await downloadRepository(dependencyRepository, dependencyBranch, githubToken, downloadDir, env);

            if (!isRepositoryDownloaded) return Promise.reject('Error downloading repository');

            const cmakeOptions = cmakeOptionsLookup[dependencyRepository];

            // Then, build the package locally. We don't run any tests or code coverage in this case.
            const isBuilt = await buildPackage(dependencyRepository, path.join(downloadDir, repo), path.join(installDir, repo), cmake, cmakeOptions, false, false, os, compiler, env);

            if (!isBuilt) return Promise.reject('Error building dependency');

            // Save built package to the cache.
            await saveCache(dependencyRepository, dependencyBranch, githubToken, path.join(installDir, repo), os, compiler, env);
        }

        if (selfBuild) {
            const [ , repo] = repository.split('/');
            const cmakeOptions = cmakeOptionsLookup[repository];

            // Build the currently checked out repository.
            const isBuilt = await buildPackage(repository, workspace, path.join(installDir, repo), cmake, cmakeOptions, selfTest, selfCoverage, os, compiler, env);

            if (!isBuilt) return Promise.reject('Error building package');

            // Upload build artifact.
            await uploadArtifact(repository, path.join(installDir, repo), env.DEPENDENCIES, os, compiler, env);

            // Upload coverage artifact.
            if (selfCoverage && env.COVERAGE_DIR) await uploadArtifact(`coverage-${repo}`, env.COVERAGE_DIR, null, os, compiler, env);
        }

        const outputs = {
            bin_path: env.BIN_PATH,
            include_path: env.INCLUDE_PATH,
            install_path: env.INSTALL_PATH,
            lib_path: env.LIB_PATH,
        };

        if (selfCoverage && env.COVERAGE_FILE) {
            outputs.coverage_file = env.COVERAGE_FILE;
        }

        return Promise.resolve(outputs);
    }
    catch (error) {
        return Promise.reject(error.message);
    }
};
