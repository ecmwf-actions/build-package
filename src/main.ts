import * as path from 'path';
import * as core from '@actions/core';

import { setupEnv } from './env-functions';
import { restoreCache, saveCache } from './cache-functions';
import downloadArtifact from './download-artifact';
import uploadArtifact from './upload-artifact';
import downloadRepository from './download-repository';
import buildPackage from './build-package';

import { CmakeOptionsLookup } from './types/main';

/**
 * First, the main function checks if a dependency build artifact can be found for current OS and compiler combination.
 * Otherwise, it will checkout dependency repository, build and install it. Dependency builds are automatically
 * cached, if successful.
 *
 * Then, the main function will build currently checked out repository, run tests, collect code coverage and create
 * artifacts for later use.
 *
 * @returns {Promise<ActionOutputs>} Outputs object on resolution, failure message on rejection.
 */
const main = async () => {
    try {
        const workspace = core.getInput('workspace', { required: true });
        const repository = core.getInput('repository', { required: true });
        const sha = core.getInput('sha', { required: true });
        const cmake = core.getBooleanInput('cmake', { required: true });
        const cmakeOptions = core.getInput('cmake_options', { required: false });
        const ctestOptions = core.getInput('ctest_options', { required: false });
        const selfBuild = core.getBooleanInput('self_build', { required: true });
        const selfTest = core.getBooleanInput('self_test', { required: true });
        const selfCoverage = core.getBooleanInput('self_coverage', { required: true });
        const dependencies = core.getMultilineInput('dependencies', { required: false });
        const dependencyBranchDefault = core.getInput('dependency_branch', { required: true });
        const dependencyCmakeOptionLines = core.getMultilineInput('dependency_cmake_options', { required: false }) || [];
        const forceBuild = core.getBooleanInput('force_build', { required: true });
        const cacheSuffix = core.getInput('cache_suffix', { required: false }) || '';
        const recreateCache = core.getBooleanInput('recreate_cache', { required: true });
        const os = core.getInput('os', { required: true });
        const compiler = core.getInput('compiler', { required: false });
        const compilerCc = core.getInput('compiler_cc', { required: false });
        const compilerCxx = core.getInput('compiler_cxx', { required: false });
        const compilerFc = core.getInput('compiler_fc', { required: false });
        const githubToken = core.getInput('github_token', { required: true });
        const installDir = core.getInput('install_dir', { required: true });
        const downloadDir = core.getInput('download_dir', { required: true });

        const dependencyCmakeOptionsLookup: CmakeOptionsLookup = {};
        for (const dependencyCmakeOptionLine of dependencyCmakeOptionLines) {
            const [repo, options] = dependencyCmakeOptionLine.split(/:\s?(.+)/);
            if (!repo || !options) return Promise.reject(`Unexpected CMake option, must be in 'owner/repo: option' format: ${dependencyCmakeOptionLine}`);
            dependencyCmakeOptionsLookup[repo] = options.replace(/^['"]|['"]$/g, '');
        }

        const env = await setupEnv(os, compilerCc, compilerCxx, compilerFc);

        if (!env) return Promise.reject('Error setting up build environment');

        for (const dependency of dependencies) {
            const [dependencyRepository, dependencyBranchSpecific] = dependency.split('@');
            const [owner, repo] = dependencyRepository.split('/');
            const dependencyCmakeOptions = dependencyCmakeOptionsLookup[dependencyRepository];

            if (!owner || !repo) return Promise.reject(`Unexpected dependency name, must be in 'owner/repo[@branch]' format: ${dependency}`);

            const dependencyBranch = dependencyBranchSpecific || dependencyBranchDefault;

            // If the build is not forced, first try to download an artifact.
            if (!forceBuild) {
                const isArtifactDownloaded = await downloadArtifact(dependencyRepository, dependencyBranch, githubToken, downloadDir, path.join(installDir, repo), os, compiler, env, cacheSuffix, dependencyCmakeOptions);

                if (isArtifactDownloaded) continue;
            }

            // Check if we already cached the build of this package.
            //   Skip this part if we were told to always recreate cache.
            if (!recreateCache) {
                const cacheHit = await restoreCache(dependencyRepository, dependencyBranch, githubToken, path.join(installDir, repo), os, compiler, cacheSuffix, env, dependencyCmakeOptions);

                if (cacheHit) continue;
            }

            // Download the latest repository state.
            const isRepositoryDownloaded = await downloadRepository(dependencyRepository, dependencyBranch, githubToken, downloadDir, env);

            if (!isRepositoryDownloaded) return Promise.reject('Error downloading repository');

            // Build the package locally. We don't run any tests or code coverage in this case.
            const isBuilt = await buildPackage(dependencyRepository, path.join(downloadDir, repo), path.join(installDir, repo), cmake, dependencyCmakeOptions, null, false, false, os, compiler, env);

            if (!isBuilt) return Promise.reject('Error building dependency');

            // Save built package to the cache.
            await saveCache(dependencyRepository, dependencyBranch, githubToken, path.join(installDir, repo), os, compiler, cacheSuffix, env, dependencyCmakeOptions);
        }

        if (selfBuild) {
            const [ , repo] = repository.split('/');
            let cacheHit;

            // Check if we already cached the build of this package.
            //   Skip this part if we were told to always recreate cache.
            if (!recreateCache) {
                cacheHit = await restoreCache(repository, sha, githubToken, path.join(installDir, repo), os, compiler, cacheSuffix, env, cmakeOptions);
            }

            if (recreateCache || !cacheHit) {
                // Build the currently checked out repository.
                const isBuilt = await buildPackage(repository, workspace, path.join(installDir, repo), cmake, cmakeOptions, ctestOptions, selfTest, selfCoverage, os, compiler, env);

                if (!isBuilt) return Promise.reject('Error building package');

                // Save built package to the cache.
                await saveCache(repository, sha, githubToken, path.join(installDir, repo), os, compiler, cacheSuffix, env, cmakeOptions);

                // Upload build artifact.
                await uploadArtifact(repository, sha, path.join(installDir, repo), env.DEPENDENCIES as DependenciesObject, os, compiler, env, githubToken, cacheSuffix, cmakeOptions);

                // Upload coverage artifact.
                if (selfCoverage && env.COVERAGE_DIR) await uploadArtifact(`coverage-${repo}`, sha, env.COVERAGE_DIR as string, null, os, compiler, env, githubToken, cacheSuffix, cmakeOptions);
            }

        }

        const outputs: ActionOutputs = {
            bin_path: env.BIN_PATH as string,
            include_path: env.INCLUDE_PATH as string,
            install_path: env.INSTALL_PATH as string,
            lib_path: env.LIB_PATH as string,
        };

        if (selfCoverage && env.COVERAGE_FILE) {
            outputs.coverage_file = env.COVERAGE_FILE as string;
        }

        return Promise.resolve(outputs);
    }
    catch (error) {
        if (error instanceof Error) return Promise.reject(error.message);
        return Promise.reject();
    }
};

export default main;
