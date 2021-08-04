const core = require('@actions/core');
const { restoreCache, saveCache } = require('@actions/cache');
const { Octokit } = require('@octokit/core');
const crypto = require('crypto');
const { promisify } = require('util')
const fastFolderSize = require('fast-folder-size');

const { version } = require('../package.json');
const { extendPaths } = require('./env-functions');
const { isError } = require('./helper-functions');

/**
 * Returns cache key for a package.
 *
 * @param {String} repository Github repository owner and name
 * @param {String} branch Branch name
 * @param {String} githubToken Github access token, with `repo` and `actions:read` scopes
 * @param {String} os Current OS platform
 * @param {String} compiler Current compiler family
 * @param {Object} env Local environment object.
 * @returns {String} Package cache key
 */
const getCacheKey = async (repository, branch, githubToken, os, compiler, env) => {
    core.startGroup(`Cache Key for ${repository}`);

    const [owner, repo] = repository.split('/');

    core.info(`==> Repository: ${owner}/${repo}`);
    core.info(`==> Branch: ${branch}`);

    const octokit = new Octokit({
        token: githubToken,
    });

    let sha;

    try {
        const response = await octokit.request('GET /repos/{owner}/{repo}/git/ref/{ref}', {
            owner,
            repo,
            ref: `heads/${branch}`,
        });

        isError(response.status != 200, `Wrong response code while fetching repository HEAD: ${response.status}`);

        sha = response.data.object.sha;
    }
    catch (error) {
        isError(true, `Error getting repository HEAD: ${error.message}`);
    }

    core.info(`==> sha: ${sha}`);

    const cacheKeyStr = `v=${version}::cmake=${env.CMAKE_VERSION}::${repo}=${sha}`;

    core.info(`==> cacheKeyStr: ${cacheKeyStr}`);

    const cacheKeySha = crypto.createHash('sha1').update(cacheKeyStr).digest('hex');

    core.info(`==> cacheKeySha: ${cacheKeySha}`);

    const cacheKey = `${os}-${compiler}-${repo}-${cacheKeySha}`;

    core.info(`==> cacheKey: ${cacheKey}`);

    core.endGroup();

    return cacheKey;
};

module.exports.getCacheKey = getCacheKey;

/**
 * Restores package from cache, if found.
 *
 * @param {String} repository Github repository owner and name
 * @param {String} branch Branch name
 * @param {String} githubToken Github access token, with `repo` and `actions:read` scopes
 * @param {String} repo Name of the package to download, will be used as the final extraction directory
 * @param {String} installDir Directory to restore to
 * @param {String} os Current OS platform
 * @param {String} compiler Current compiler family
 * @param {Object} env Local environment object.
 * @returns {Boolean} Whether the package cache was found
 */
module.exports.restoreCache = async (repository, branch, githubToken, installDir, os, compiler, env) => {
    const cacheKey = await getCacheKey(repository, branch, githubToken, os, compiler, env);

    core.startGroup(`Restore ${repository} Cache`);

    let cacheHit;

    try {
        cacheHit = Boolean(await restoreCache([installDir], cacheKey));
    }
    catch (error) {
        core.warning(error.message);
        cacheHit = false;
    }

    core.info(`==> cacheHit: ${cacheHit}`);

    // If we have cache, extend the environment path with install directory.
    if (cacheHit) await extendPaths(env, installDir);

    core.endGroup();

    return cacheHit;
};

/**
 * Saves target directory to cache.
 *
 * @param {String} repository Github repository owner and name
 * @param {String} branch Branch name
 * @param {String} githubToken Github access token, with `repo` and `actions:read` scopes
 * @param {String} targetDir Target directory to save
 * @param {String} os Current OS platform
 * @param {String} compiler Current compiler family
 * @param {Object} env Local environment object.
 * @returns {Boolean} Whether the package was cached successfully
 */
module.exports.saveCache = async (repository, branch, githubToken, targetDir, os, compiler, env) => {
    const cacheKey = await getCacheKey(repository, branch, githubToken, os, compiler, env);

    core.startGroup(`Save ${repository} Cache`);

    const fastFolderSizeAsync = promisify(fastFolderSize);

    const bytes = await fastFolderSizeAsync(targetDir);

    if (!bytes) {
        isError(true, 'Empty target dir, skipping saving cache');
        return false;
    }

    let isSaved;

    try {
        isSaved = Boolean(await saveCache([targetDir], cacheKey));
    }
    catch (error) {
        if (/^Unable to reserve cache with key/.test(error.message)) {
            core.warning(`Unable to reserve cache with key ${cacheKey}, another job may be creating this cache.`);
            isSaved = true;
        }
        else {
            isError(true, error.message);
            isSaved = false;
        }
    }

    core.info(`==> isSaved: ${isSaved}`);

    core.endGroup();

    return isSaved;
};
