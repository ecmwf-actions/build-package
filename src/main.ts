import * as path from "path";
import * as core from "@actions/core";

import { setupEnv } from "./env-functions";
import { restoreCache, saveCache } from "./cache-functions";
import downloadArtifact from "./download-artifact";
import uploadArtifact from "./upload-artifact";
import downloadRepository from "./download-repository";
import buildPackage from "./build-package";

import { CmakeOptionsLookup } from "./types/main";
import { loadTree } from "./tree";

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
        const workspace = core.getInput("workspace", { required: true });
        const repositoryInput = core.getInput("repository", { required: true });
        const shaInput = core.getInput("sha", { required: true });
        const cmake = core.getBooleanInput("cmake", { required: true });
        const ecbundle = core.getBooleanInput("ecbundle", { required: true });
        const cmakeOptions = core.getInput("cmake_options", {
            required: false,
        });
        const ctestOptions = core.getInput("ctest_options", {
            required: false,
        });
        const selfBuild = core.getBooleanInput("self_build", {
            required: true,
        });
        const selfTest = core.getBooleanInput("self_test", { required: true });
        const selfCoverage = core.getBooleanInput("self_coverage", {
            required: true,
        });
        const dependencies = core.getMultilineInput("dependencies", {
            required: false,
        });
        const dependencyBranchDefault = core.getInput("dependency_branch", {
            required: true,
        });
        const dependencyCmakeOptionLines =
            core.getMultilineInput("dependency_cmake_options", {
                required: false,
            }) || [];
        const forceBuild = core.getBooleanInput("force_build", {
            required: true,
        });
        const cacheSuffix =
            core.getInput("cache_suffix", { required: false }) || "";
        const recreateCache = core.getBooleanInput("recreate_cache", {
            required: true,
        });
        const saveCacheInput = core.getBooleanInput("save_cache", {
            required: true,
        });
        const os = core.getInput("os", { required: true });
        const compiler = core.getInput("compiler", { required: false });
        const compilerCc = core.getInput("compiler_cc", { required: false });
        const compilerCxx = core.getInput("compiler_cxx", { required: false });
        const compilerFc = core.getInput("compiler_fc", { required: false });
        const toolchain_file = core.getInput("toolchain_file", {
            required: false,
        });
        const githubToken = core.getInput("github_token", { required: true });
        const installDir = core.getInput("install_dir", { required: true });
        const downloadDir = core.getInput("download_dir", { required: true });
        const parallelismFactor = core.getInput("parallelism_factor", {
            required: false,
        });
        const cpackGenerator = core.getInput("cpack_generator", {
            required: false,
        });
        const cpackOptions = core.getInput("cpack_options", {
            required: false,
        });

        const supportedGenerators = ["DEB", "RPM"];
        if (
            cpackGenerator &&
            !supportedGenerators.includes(cpackGenerator.toUpperCase())
        ) {
            return Promise.reject(
                `Invalid or unsupported cpack generator: ${cpackGenerator}`
            );
        }

        const dependencyCmakeOptionsLookup: CmakeOptionsLookup = {};
        for (const dependencyCmakeOptionLine of dependencyCmakeOptionLines) {
            let packageName;
            let options = "";
            [packageName, options] =
                dependencyCmakeOptionLine.split(/:\s?(.+)/);
            if (!packageName || !options)
                return Promise.reject(
                    `Unexpected CMake option, must be in 'packageName: option' format: ${dependencyCmakeOptionLine}`
                );
            if (packageName.includes("/")) {
                [, packageName] = packageName.split("/");
            }
            dependencyCmakeOptionsLookup[packageName] = options.replace(
                /^['"]|['"]$/g,
                ""
            );
        }

        const env = await setupEnv(os, compilerCc, compilerCxx, compilerFc);

        if (!env) return Promise.reject("Error setting up build environment");

        const dependencyTree = loadTree();
        if (!dependencyTree)
            return Promise.reject("Error Loading dependency tree");

        for (const dependency of dependencies) {
            const [dependencyRepository, dependencyBranchSpecific] =
                dependency.split("@");
            let packageName, ownerRepo;
            if (dependencyRepository.includes(":")) {
                [packageName, ownerRepo] = dependencyRepository.split(":");
            } else {
                ownerRepo = dependencyRepository;
            }
            const [owner, repo] = ownerRepo.split("/");
            if (!packageName) {
                packageName = repo;
            }
            const dependencyCmakeOptions =
                dependencyCmakeOptionsLookup[packageName];

            if (!owner || !repo)
                return Promise.reject(
                    `Unexpected dependency name, must be in '[packageName:]owner/repo[@branch]' format: ${dependency}`
                );

            const dependencyBranch =
                dependencyBranchSpecific || dependencyBranchDefault;

            // If the build is not forced, first try to download an artifact.
            if (!forceBuild && repo !== "ecbundle") {
                const isArtifactDownloaded = await downloadArtifact(
                    dependencyRepository,
                    packageName,
                    dependencyBranch,
                    githubToken,
                    downloadDir,
                    path.join(installDir, packageName),
                    os,
                    compiler,
                    env,
                    dependencyTree,
                    cacheSuffix,
                    dependencyCmakeOptions
                );

                if (isArtifactDownloaded) continue;
            }

            // Check if we already cached the build of this package.
            //   Skip this part if we were told to always recreate cache.
            if (!recreateCache && repo !== "ecbundle") {
                const cacheHit = await restoreCache(
                    dependencyRepository,
                    dependencyBranch,
                    packageName,
                    githubToken,
                    path.join(installDir, packageName),
                    os,
                    compiler,
                    cacheSuffix,
                    env,
                    dependencyTree,
                    dependencyCmakeOptions
                );

                if (cacheHit) continue;
            }

            // Download the latest repository state.
            const isRepositoryDownloaded = await downloadRepository(
                dependencyRepository,
                packageName,
                dependencyBranch,
                githubToken,
                downloadDir,
                env
            );

            if (!isRepositoryDownloaded)
                return Promise.reject("Error downloading repository");

            // Build the package locally. We don't run any tests or code coverage in this case.
            const isBuilt = await buildPackage(
                dependencyRepository,
                packageName,
                path.join(downloadDir, packageName),
                path.join(installDir, packageName),
                cmake,
                ecbundle,
                dependencyCmakeOptions,
                null,
                false,
                false,
                os,
                compiler,
                env,
                parallelismFactor,
                githubToken,
                undefined,
                undefined,
                toolchain_file
            );

            if (!isBuilt) return Promise.reject("Error building dependency");

            if (saveCacheInput && repo !== "ecbundle") {
                // Save built package to the cache.
                await saveCache(
                    dependencyRepository,
                    packageName,
                    dependencyBranch,
                    githubToken,
                    path.join(installDir, packageName),
                    os,
                    compiler,
                    cacheSuffix,
                    env,
                    dependencyTree,
                    dependencyCmakeOptions
                );
            }
        }

        if (selfBuild) {
            let name, subdir;
            let repository = repositoryInput;
            let repositoryBranchSpecific = "";
            if (repository.includes(":")) {
                [name, repository] = repository.split(":");
            }

            [repository, repositoryBranchSpecific] = repository.split("@");

            const [owner, repo] = repository.split("/", 2);

            const numSlashes = repository.match(/\//g)?.length;
            if (numSlashes && numSlashes > 1) {
                subdir = repository.replace(`${owner}/${repo}/`, "");
            } else {
                subdir = ".";
            }

            if (!name) {
                name = repo;
            }

            const sha = repositoryBranchSpecific || shaInput;

            let cacheHit;

            // Check if we already cached the build of this package.
            // Skip this part if we were told to always recreate cache.
            // Skip if creating a package was requested
            if (!recreateCache && !cpackGenerator) {
                cacheHit = await restoreCache(
                    repository,
                    sha,
                    name,
                    githubToken,
                    path.join(installDir, name),
                    os,
                    compiler,
                    cacheSuffix,
                    env,
                    dependencyTree,
                    cmakeOptions,
                    dependencyCmakeOptionsLookup
                );
            }

            if (recreateCache || !cacheHit) {
                // Build the currently checked out repository.
                const isBuilt = await buildPackage(
                    repository,
                    name,
                    path.join(workspace, subdir),
                    path.join(installDir, name),
                    cmake,
                    ecbundle,
                    cmakeOptions,
                    ctestOptions,
                    selfTest,
                    selfCoverage,
                    os,
                    compiler,
                    env,
                    parallelismFactor,
                    githubToken,
                    cpackGenerator,
                    cpackOptions,
                    toolchain_file
                );

                if (!isBuilt) return Promise.reject("Error building package");

                if (saveCacheInput) {
                    // Save built package to the cache.
                    await saveCache(
                        repository,
                        name,
                        sha,
                        githubToken,
                        path.join(installDir, name),
                        os,
                        compiler,
                        cacheSuffix,
                        env,
                        dependencyTree,
                        cmakeOptions,
                        dependencyCmakeOptionsLookup
                    );

                    // Upload build artifact.
                    await uploadArtifact(
                        repository,
                        name,
                        sha,
                        path.join(installDir, name),
                        env.DEPENDENCIES as DependenciesObject,
                        os,
                        compiler,
                        env,
                        dependencyTree,
                        githubToken,
                        cacheSuffix,
                        cmakeOptions,
                        dependencyCmakeOptionsLookup
                    );
                }

                // Upload coverage artifact.
                if (selfCoverage && env.COVERAGE_DIR)
                    await uploadArtifact(
                        `coverage-${name}`,
                        `coverage-${name}`, // This has to be different from the name of the package, otherwise the artifact will be overwritten.
                        sha,
                        env.COVERAGE_DIR as string,
                        null,
                        os,
                        compiler,
                        env,
                        dependencyTree,
                        githubToken,
                        cacheSuffix,
                        cmakeOptions,
                        dependencyCmakeOptionsLookup
                    );
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
        if (cpackGenerator && env.PACKAGE_PATH) {
            outputs.package_path = env.PACKAGE_PATH as string;
        }

        return Promise.resolve(outputs);
    } catch (error) {
        if (error instanceof Error) return Promise.reject(error.message);
        return Promise.reject();
    }
};

export default main;
