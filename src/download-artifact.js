const fs = require('fs');
const path = require('path');
const { Buffer } = require('buffer');
const core = require('@actions/core');
const { mkdirP } = require('@actions/io');
const { Octokit } = require('@octokit/core');
const AdmZip = require('adm-zip');
const filesize = require('filesize');
const tar = require('tar');

const { extendPaths } = require('./env-functions');
const { isError } = require('./helper-functions');

/**
 * Downloads and extracts package artifact.
 *
 * @param {String} repository Github repository owner and name
 * @param {String} branch Branch name
 * @param {String} githubToken Github access token, with `repo` and `actions:read` scopes
 * @param {String} downloadDir Directory where the artifact will be downloaded.
 * @param {String} installDir Directory where to extract the artifact
 * @param {String} os Current OS platform
 * @param {String} compiler Current compiler family
 * @param {Object} env Local environment variables
 * @returns {Boolean} Whether the download and extraction was successful
 */
module.exports = async (repository, branch, githubToken, downloadDir, installDir, os, compiler, env) => {
    core.startGroup(`Download ${repository} Artifact`);

    const workflow = 'ci.yml';
    const workflowConclusion = 'completed,success';
    const [owner, repo] = repository.split('/');

    core.info(`==> Workflow: ${workflow}`);
    core.info(`==> Repository: ${owner}/${repo}`);
    core.info(`==> Conclusion: ${workflowConclusion}`);

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

    core.info(`==> headSha: ${headSha}`);

    let runId;

    try {
        const response = await octokit.request('GET /repos/{owner}/{repo}/actions/workflows/{workflow_id}/runs', {
            owner,
            repo,
            branch,
            workflow_id: workflow,
            status: workflowConclusion,
        });

        if (isError(response.status != 200, `Wrong response code while fetching workflow runs: ${response.status}`))
            return false;

        if (isError(!response.data.workflow_runs.length, 'No workflow runs found')) return false;

        const lastRun = response.data.workflow_runs.shift();
        runId = lastRun.id;
    }
    catch (error) {
        isError(true, `Error fetching workflow runs: ${error.message}`);
        return false;
    }

    core.info(`==> RunID: ${runId}`);

    let artifacts;

    try {
        const response = await octokit.request('GET /repos/{owner}/{repo}/actions/runs/{run_id}/artifacts', {
            owner,
            repo,
            run_id: runId,
        });

        if (isError(response.status != 200, `Wrong response code while fetching workflow run artifacts: ${response.status}`))
            return false;

        artifacts = response.data.artifacts;
    }
    catch (error) {
        isError(true, `Error fetching workflow run artifacts: ${error.message}`);
        return false;
    }

    core.info(`==> Artifacts: ${artifacts.length}`);

    let artifactName;

    // Ecbuild has a different artifact name, as it is not actually built.
    if (repo === 'ecbuild') artifactName = `ecbuild-${os}-cmake-${env.CMAKE_VERSION}`;
    else artifactName = `${repo}-${os}-${compiler}`;

    // Consider only artifacts with expected name and built against latest HEAD.
    artifacts = artifacts.filter((artifact) => artifact.name === artifactName && artifact.head_sha === headSha );

    if (isError(!artifacts.length, `No suitable artifact found: ${artifactName} (${headSha})`)) return false;

    const artifact = artifacts.shift();

    core.info(`==> artifactName: ${artifactName}`);
    core.info(`==> headSha: ${headSha}`);
    core.info(`==> artifactId: ${artifact.id}`);

    let zip;

    try {
        const response = await octokit.request('GET /repos/{owner}/{repo}/actions/artifacts/{artifact_id}/{archive_format}', {
            owner,
            repo,
            artifact_id: artifact.id,
            archive_format: 'zip',
        });

        if (isError(response.status != 200, `Wrong response code while downloading workflow run artifact: ${response.status}`))
            return false;

        zip = response.data;
    }
    catch (error) {
        isError(true, `Error downloading workflow run artifact: ${error.message}`);
        return false;
    }

    const size = filesize(artifact.size_in_bytes);

    core.info(`==> Downloaded: ${artifact.name}.zip (${size})`);

    const artifactPath = path.resolve(path.join(downloadDir, artifact.name));

    await mkdirP(artifactPath);

    const adm = new AdmZip(Buffer.from(zip));

    adm.getEntries().forEach((entry) => {
        const action = entry.isDirectory ? 'creating' : 'inflating';
        const filepath = `${artifactPath}/${entry.entryName}`;

        core.info(`  ${action}: ${filepath}`);
    })

    adm.extractAllTo(artifactPath, true);

    core.info(`==> Extracted artifact ZIP archive to ${artifactPath}`);

    const tarName = path.join(artifactPath, `${artifactName}.tar`);

    mkdirP(installDir);

    try {
        await tar.x({
            C: installDir,
            file: tarName,
        });
    }
    catch (error) {
        isError(true, `Error extracting artifact TAR: ${error.message}`);
        return false;
    }

    core.info(`==> Extracted artifact TAR to ${installDir}`);

    fs.unlinkSync(tarName);

    await extendPaths(env, installDir);

    core.endGroup();

    return true;
};
