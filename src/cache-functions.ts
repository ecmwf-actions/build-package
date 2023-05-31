import * as core from "@actions/core";
import {
    restoreCache as aRestoreCache,
    saveCache as aSaveCache,
} from "@actions/cache";
import { Octokit } from "@octokit/core";
import crypto from "crypto";
import { promisify } from "util";
import fastFolderSize from "fast-folder-size";

import { version } from "../package.json";
import { extendPaths, extendDependencies } from "./env-functions";
import { isError } from "./helper-functions";
import { parseOptions } from "./build-package";

import { EnvironmentVariables } from "./types/env-functions";
import { CmakeOptionsLookup } from "./types/main";
import { getDependenciesFromTree } from "./tree";

/**
 * Returns cache key hash
 *
 * @param {string} repo Github repository name
 * @param {string} cacheSuffix A string which will be appended to the cache key.
 * @param {EnvironmentVariables} env Local environment object.
 * @param {string|undefined} cmakeOptions Build options string which is added to cache key hash
 * @param {string|undefined} sha Github repository commit SHA
 * @param {CmakeOptionsLookup} dependencyCmakeOptionsLookup List of CMake options for each dependency.
 * @returns {string} Cache key hash
 */
export const getCacheKeyHash = (
    repo: string,
    cacheSuffix: string,
    env: EnvironmentVariables,
    dependencyTree: DependencyTree,
    cmakeOptions: string | undefined,
    sha: string | undefined,
    dependencyCmakeOptionsLookup: CmakeOptionsLookup = {}
): string => {
    const buildOptions = [];
    if (cmakeOptions) {
        buildOptions.push(...parseOptions(cmakeOptions));
        buildOptions.sort();
    }

    let cacheKeyStr = `v=${version}${cacheSuffix}::cmake=${
        env.CMAKE_VERSION
    }::options=${buildOptions.join()}::${repo}=${sha}`;

    const treeDeps = getDependenciesFromTree(repo, dependencyTree, null);

    for (const [dependency, dependencySha] of Object.entries(
        env.DEPENDENCIES || {}
    ).sort((a, b) => (a[0] > b[0] ? 1 : -1))) {
        const [, dependencyRepo] = dependency.split("/");
        if (
            !treeDeps.includes(dependencyRepo) &&
            dependencyRepo in dependencyTree
        ) {
            continue;
        }
        if (dependencyRepo === repo) continue;
        cacheKeyStr += `::${dependencyRepo}=${dependencySha}`;

        // sort and append dependency cmake options to respective deps
        if (dependencyCmakeOptionsLookup[dependencyRepo]) {
            const dependencyCmakeOptions = [];
            dependencyCmakeOptions.push(
                ...parseOptions(dependencyCmakeOptionsLookup[dependencyRepo])
            );
            dependencyCmakeOptions.sort();
            cacheKeyStr += `::${dependencyRepo}-options=${dependencyCmakeOptions.join()}`;
        }
    }

    core.info(`==> cacheKeyStr: ${cacheKeyStr}`);

    const cacheKeySha = crypto
        .createHash("sha1")
        .update(cacheKeyStr)
        .digest("hex");

    return cacheKeySha;
};

/**
 * Returns cache key for a package.
 *
 * @param {string} repository Github repository owner and name.
 * @param {string} branch Branch (or tag) name. Make sure to supply tags in their verbose form: `refs/tags/tag-name`.
 * @param {string} githubToken Github access token, with `repo` and `actions:read` scopes.
 * @param {string} os Current OS platform.
 * @param {string} compiler Current compiler family.
 * @param {string} cacheSuffix A string which will be appended to the cache key.
 * @param {EnvironmentVariables} env Local environment object.
 * @param {string|undefined} cmakeOptions Build options string which is added to cache key hash
 * @param {CmakeOptionsLookup} [dependencyCmakeOptionsLookup] List of CMake options for each dependency.
 * @returns {Promise<CacheObject>} An object with package cache key and head SHA used to calculate it.
 */
export const getCacheKey = async (
    repository: string,
    branch: string,
    githubToken: string,
    os: string,
    compiler: string,
    cacheSuffix: string,
    env: EnvironmentVariables,
    dependencyTree: DependencyTree,
    cmakeOptions: string | undefined,
    dependencyCmakeOptionsLookup: CmakeOptionsLookup = {}
): Promise<CacheObject> => {
    core.startGroup(`Cache Key for ${repository}`);

    const [owner, repo] = repository.split("/");

    core.info(`==> Repository: ${owner}/${repo}`);

    let ref;
    const result: { cacheKey?: string; headSha?: string } = {};

    const octokit = new Octokit({
        auth: githubToken,
    });

    if (/^[0-9a-f]{40}$/i.test(branch)) {
        // We've been given a commit hash instead of a branch or tag.
        core.info(`==> Hash: ${branch}`);
        result.headSha = branch;
    } else {
        if (/^refs\/tags\//.test(branch)) {
            branch = branch.replace(/^refs\/tags\//, "");
            ref = `tags/${branch}`;
        } else {
            branch = branch.replace(/^refs\/heads\//, "");
            ref = `heads/${branch}`;
        }

        core.info(`==> Branch: ${branch}`);
        core.info(`==> Ref: ${ref}`);

        try {
            const response = await octokit.request(
                "GET /repos/{owner}/{repo}/git/ref/{ref}",
                {
                    owner,
                    repo,
                    ref,
                }
            );

            isError(
                response.status != 200,
                `Wrong response code while fetching repository HEAD for ${repo}: ${response.status}`
            );

            result.headSha = response.data.object.sha;
        } catch (error) {
            if (error instanceof Error)
                isError(
                    true,
                    `Error getting repository HEAD for ${repo}: ${error.message}`
                );
        }
    }

    core.info(`==> result.headSha: ${result.headSha}`);

    const cacheKeySha = getCacheKeyHash(
        repo,
        cacheSuffix,
        env,
        dependencyTree,
        cmakeOptions,
        result.headSha,
        dependencyCmakeOptionsLookup
    );

    core.info(`==> cacheKeySha: ${cacheKeySha}`);

    result.cacheKey = `${os}-${compiler}-${repo}-${cacheKeySha}`;

    core.info(`==> result.cacheKey: ${result.cacheKey}`);

    core.endGroup();

    return result as CacheObject;
};

/**
 * Restores package from cache, if found.
 *
 * @param {string} repository Github repository owner and name.
 * @param {string} branch Branch (or tag) name. Make sure to supply tags in their verbose form: `refs/tags/tag-name`.
 * @param {string} githubToken Github access token, with `repo` and `actions:read` scopes.
 * @param {string} repo Name of the package to download, will be used as the final extraction directory.
 * @param {string} installDir Directory to restore to.
 * @param {string} os Current OS platform.
 * @param {string} compiler Current compiler family.
 * @param {string} cacheSuffix A string which will be appended to the cache key.
 * @param {EnvironmentVariables} env Local environment object.
 * @param {string|undefined} cmakeOptions Build options string which is added to cache key hash
 * @param {CmakeOptionsLookup} [dependencyCmakeOptionsLookup] List of CMake options for each dependency.
 * @returns {Promise<boolean>} Whether the package cache was found.
 */
export const restoreCache = async (
    repository: string,
    branch: string,
    githubToken: string,
    installDir: string,
    os: string,
    compiler: string,
    cacheSuffix: string,
    env: EnvironmentVariables,
    dependencyTree: DependencyTree,
    cmakeOptions: string | undefined,
    dependencyCmakeOptionsLookup: CmakeOptionsLookup = {}
): Promise<boolean> => {
    const { cacheKey, headSha } = await getCacheKey(
        repository,
        branch,
        githubToken,
        os,
        compiler,
        cacheSuffix,
        env,
        dependencyTree,
        cmakeOptions,
        dependencyCmakeOptionsLookup
    );

    core.startGroup(`Restore ${repository} Cache`);

    let cacheHit;

    try {
        cacheHit = Boolean(await aRestoreCache([installDir], cacheKey));
    } catch (error) {
        if (error instanceof Error)
            isError(
                true,
                `Error restoring cache for ${repository}: ${error.message}`
            );
        return false;
    }

    core.info(`==> cacheHit: ${cacheHit}`);

    // If we have cache, extend the environment.
    if (cacheHit) {
        const [, repo] = repository.split("/");
        await extendPaths(env, installDir, repo);
        await extendDependencies(env, repository, headSha);
    }

    core.endGroup();

    return cacheHit;
};

/**
 * Saves target directory to cache.
 *
 * @param {string} repository Github repository owner and name.
 * @param {string} branch Branch (or tag) name. Make sure to supply tags in their verbose form: `refs/tags/tag-name`.
 * @param {string} githubToken Github access token, with `repo` and `actions:read` scopes.
 * @param {string} targetDir Target directory to save.
 * @param {string} os Current OS platform.
 * @param {string} compiler Current compiler family.
 * @param {string} cacheSuffix A string which will be appended to the cache key.
 * @param {EnvironmentVariables} env Local environment object.
 * @param {string|undefined} cmakeOptions Build options string which is added to cache key hash
 * @param {CmakeOptionsLookup} [dependencyCmakeOptionsLookup] List of CMake options for each dependency.
 * @returns {Promise<boolean>} Whether the package was cached successfully.
 */
export const saveCache = async (
    repository: string,
    branch: string,
    githubToken: string,
    targetDir: string,
    os: string,
    compiler: string,
    cacheSuffix: string,
    env: EnvironmentVariables,
    dependencyTree: DependencyTree,
    cmakeOptions: string | undefined,
    dependencyCmakeOptionsLookup: CmakeOptionsLookup = {}
): Promise<boolean> => {
    const { cacheKey } = await getCacheKey(
        repository,
        branch,
        githubToken,
        os,
        compiler,
        cacheSuffix,
        env,
        dependencyTree,
        cmakeOptions,
        dependencyCmakeOptionsLookup
    );

    core.startGroup(`Save ${repository} Cache`);

    const fastFolderSizeAsync = promisify(fastFolderSize);

    const bytes = await fastFolderSizeAsync(targetDir);

    if (!bytes) {
        isError(
            true,
            `Empty target dir, skipping saving cache for ${repository}`
        );
        return false;
    }

    let isSaved;

    try {
        isSaved = Boolean(await aSaveCache([targetDir], cacheKey));
    } catch (error) {
        if (error instanceof Error)
            isError(
                true,
                `Error saving cache for ${repository}: ${error.message}`
            );
        return false;
    }

    core.info(`==> isSaved: ${isSaved}`);

    core.endGroup();

    return isSaved;
};
