const fs = require('fs');
const path = require('path');
const core = require('@actions/core');
const { mkdirP } = require('@actions/io');
const { Octokit } = require('@octokit/core');
const filesize = require('filesize');
const tar = require('tar');

const downloadFile = require('./download-file');
const { extendDependencies } = require('./env-functions');
const { isError } = require('./helper-functions');

/**
 * Downloads a Github repository state and extracts it to a directory with supplied name.
 *
 * @param {String} repository Github repository owner and name.
 * @param {String} branch Branch name.
 * @param {String} githubToken Github access token, with `repo` and `actions:read` scopes.
 * @param {String} downloadDir Directory where the repository will be downloaded.
 * @param {Object} env Local environment object.
 * @returns {Boolean} Whether the download and extraction was successful.
 */
module.exports = async (repository, branch, githubToken, downloadDir, env) => {
    core.startGroup(`Download ${repository} Repository`);

    const [owner, repo] = repository.split('/');

    core.info(`==> Repository: ${owner}/${repo}`);

    branch = branch.replace(/^refs\/heads\//, '');

    core.info(`==> Branch: ${branch}`);

    const octokit = new Octokit({
        auth: githubToken,
    });

    let headSha;

    try {
        const response = await octokit.request('GET /repos/{owner}/{repo}/git/ref/{ref}', {
            owner,
            repo,
            ref: `heads/${branch}`,
        });

        if (isError(response.status != 200, `Wrong response code while fetching repository HEAD: ${response.status}`))
            return false;

        headSha = response.data.object.sha;
    }
    catch (error) {
        isError(true, `Error getting repository HEAD: ${error.message}`);
        return false;
    }

    let url;

    try {
        const response = await octokit.request('GET /repos/{owner}/{repo}/tarball/{ref}', {
            owner,
            repo,
            ref: branch,
        });

        if (isError(response.status != 200, `Wrong response code while fetching repository download URL: ${response.status}`))
            return false;

        url = response.url;
    }
    catch (error) {
        isError(true, `Error getting repository download URL: ${error.message}`);
        return false;
    }

    core.info(`==> URL: ${url}`);

    const tarName = `${repo}.tar.gz`;

    try {
        await downloadFile(url, tarName);
    }
    catch (error) {
        isError(true, `Error downloading repository archive: ${error.message}`);
        return false;
    }

    const stats = fs.statSync(tarName);

    if (isError(!stats.size, 'Error determining size of repository archive')) return false;

    const size = filesize(stats.size);

    core.info(`==> Downloaded: ${tarName} (${size})`);

    // Create source directory.
    const sourceDir = path.join(downloadDir, repo);
    await mkdirP(sourceDir);

    try {
        await tar.x({
            C: sourceDir,
            file: tarName,
            strip: 1,
        });
    }
    catch (error) {
        isError(true, `Error extracting repository archive: ${error.message}`);
        return false;
    }

    core.info(`==> Extracted ${tarName} to ${sourceDir}`);

    fs.unlinkSync(tarName);

    await extendDependencies(env, repository, headSha);

    core.endGroup();

    return true;
};
