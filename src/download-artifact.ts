import fs from 'fs';
import path from 'path';
import { Buffer } from 'buffer';
import * as core from '@actions/core';
import { mkdirP } from '@actions/io';
import { Octokit } from '@octokit/core';
import AdmZip from 'adm-zip';
import filesize from 'filesize';
import tar from 'tar';

import { extendPaths, extendDependencies } from './env-functions';
import { isError } from './helper-functions';
import { EnvironmentVariables } from './types/env-functions';

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
 * @param {Object} env Local environment object.
 * @returns {Boolean} Whether the download and extraction was successful
 */
const downloadArtifact = async (repository: string, branch: string, githubToken: string, downloadDir: string, installDir: string, os: string, compiler: string, env: EnvironmentVariables) => {
    core.startGroup(`Download ${repository} Artifact`);

    const workflow = 'ci.yml';
    const [owner, repo] = repository.split('/');

    core.info(`==> Workflow: ${workflow}`);
    core.info(`==> Repository: ${owner}/${repo}`);

    branch = branch.replace(/^refs\/heads\//, '');

    core.info(`==> Branch: ${branch}`);

    const octokit = new Octokit({
        auth: githubToken,
    });

    let workflowRuns;

    try {
        // NB: Filtering for "status === completed,success" is not working as expected at the moment. Therefore, we
        //   aim to fetch all available workflow runs and filter them locally later.
        //   https://docs.github.com/en/rest/reference/actions#list-workflow-runs
        const response = await octokit.request('GET /repos/{owner}/{repo}/actions/workflows/{workflow_id}/runs', {
            owner,
            repo,
            branch,
            workflow_id: workflow,
        });

        if (isError(response.status != 200, `Wrong response code while fetching workflow runs for ${repo}: ${response.status}`))
            return false;

        if (isError(!response.data.workflow_runs.length, `No workflow runs found for ${repo}`)) return false;

        workflowRuns = response.data.workflow_runs;
    }
    catch (error) {
        if (error instanceof Error) isError(true, `Error fetching workflow runs for ${repo}: ${error.message}`);
        return false;
    }

    core.info(`==> workflowRuns: ${workflowRuns.length}`);

    // Consider only workflow runs that:
    // - have status "completed"
    // - have conclusion "success"
    workflowRuns = workflowRuns.filter((workflowRun) => workflowRun.status === 'completed' && workflowRun.conclusion === 'success');

    if (isError(!workflowRuns.length, `No completed successful workflow runs found for ${repo}`)) return false;

    const lastRun = workflowRuns.shift();
    const runId = lastRun?.id;

    core.info(`==> RunID: ${runId}`);

    let artifacts;

    try {
        const response = await octokit.request('GET /repos/{owner}/{repo}/actions/runs/{run_id}/artifacts', {
            owner,
            repo,
            run_id: runId as number,
        });

        if (isError(response.status != 200, `Wrong response code while fetching workflow run artifacts for ${repo}: ${response.status}`))
            return false;

        artifacts = response.data.artifacts;
    }
    catch (error) {
        if (error instanceof Error) isError(true, `Error fetching workflow run artifacts for ${repo}: ${error.message}`);
        return false;
    }

    core.info(`==> Artifacts: ${artifacts.length}`);

    if (!artifacts.length) {
        isError(true, `No workflow artifacts found for ${repo}`);
        return false;
    }

    let headSha;

    try {
        const response = await octokit.request('GET /repos/{owner}/{repo}/git/ref/{ref}', {
            owner,
            repo,
            ref: `heads/${branch}`,
        });

        if (isError(response.status != 200, `Wrong response code while fetching repository HEAD for ${repo}: ${response.status}`))
            return false;

        headSha = response.data.object.sha;
    }
    catch (error) {
        if (error instanceof Error) isError(true, `Error getting repository HEAD for ${repo}: ${error.message}`);
        return false;
    }

    core.info(`==> headSha: ${headSha}`);

    let artifactName: string;

    // Ecbuild has a different artifact name, as it is not actually built.
    if (repo === 'ecbuild') artifactName = `ecbuild-${os}-cmake-${env.CMAKE_VERSION}-${headSha}`;
    else artifactName = `${repo}-${os}-${compiler}-${headSha}`;

    // Consider only artifacts with expected name.
    artifacts = artifacts.filter((artifact) => artifact.name === artifactName);

    if (isError(!artifacts.length, `No suitable artifact found: ${artifactName}`)) return false;

    const artifact = artifacts.shift();

    core.info(`==> artifactName: ${artifactName}`);
    core.info(`==> artifactId: ${artifact?.id}`);

    let zip: string;

    try {
        const response = await octokit.request('GET /repos/{owner}/{repo}/actions/artifacts/{artifact_id}/{archive_format}', {
            owner,
            repo,
            artifact_id: artifact?.id as number,
            archive_format: 'zip',
        });

        if (isError(response.status === 302 || response.status !== 200, `Wrong response code while downloading workflow run artifact for ${repo}: ${response.status}`))
            return false;

        zip = response.data as string;
    }
    catch (error) {
        if (error instanceof Error) isError(true, `Error downloading workflow run artifact for ${repo}: ${error.message}`);
        return false;
    }

    const size = filesize(artifact?.size_in_bytes as number);

    core.info(`==> Downloaded: ${artifact?.name}.zip (${size})`);

    const artifactPath = path.resolve(path.join(downloadDir, artifact?.name as string));

    await mkdirP(artifactPath);

    const adm = new AdmZip(Buffer.from(zip));

    adm.getEntries().forEach((entry) => {
        const action = entry.isDirectory ? 'creating' : 'inflating';
        const filepath = `${artifactPath}/${entry.entryName}`;

        core.info(`  ${action}: ${filepath}`);
    })

    adm.extractAllTo(artifactPath, true);

    core.info(`==> Extracted artifact ZIP archive to ${artifactPath}`);

    const tarPath = path.join(artifactPath, `${artifactName}.tar`);
    const dependenciesPath = path.join(artifactPath, `${artifactName}-dependencies.json`);

    // Check artifact compatibility by going through its dependencies and verifying against current ones.
    if (fs.existsSync(dependenciesPath)) {
        const dependenciesContent = fs.readFileSync(dependenciesPath).toString();

        core.info(`==> Found ${dependenciesPath}`);

        const dependencies = JSON.parse(dependenciesContent);

        for (const [dependency, dependencySha] of Object.entries(dependencies)) {
            if (
                env.DEPENDENCIES
                && env.DEPENDENCIES[dependency]
                && env.DEPENDENCIES[dependency] !== dependencySha
            ) {
                fs.unlinkSync(tarPath);
                fs.unlinkSync(dependenciesPath);

                isError(true, `Error matching dependency ${dependency} for ${repo}: ${env.DEPENDENCIES[dependency]} !== ${dependencySha}`);

                return false;
            }
        }

        fs.unlinkSync(dependenciesPath);
    }

    mkdirP(installDir);

    try {
        await tar.x({
            C: installDir,
            file: tarPath,
        });
    }
    catch (error) {
        if (error instanceof Error) isError(true, `Error extracting artifact TAR for ${repo}: ${error.message}`);
        return false;
    }

    core.info(`==> Extracted artifact TAR to ${installDir}`);

    fs.unlinkSync(tarPath);

    await extendPaths(env, installDir, repo);

    await extendDependencies(env, repository, headSha);

    core.endGroup();

    return true;
};

export default downloadArtifact;
