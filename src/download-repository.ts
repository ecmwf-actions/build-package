import fs from "fs";
import path from "path";
import * as core from "@actions/core";
import { mkdirP } from "@actions/io";
import { Octokit } from "@octokit/core";
import { filesize } from "filesize";
import * as tar from "tar";

import downloadFile from "./download-file";
import { extendDependencies } from "./env-functions";
import { isError } from "./helper-functions";

import { EnvironmentVariables } from "./types/env-functions";

/**
 * Downloads a Github repository state and extracts it to a directory with supplied name.
 *
 * @param {string} repository Github repository owner and name.
 * @param {string} packageName Name of the package.
 * @param {string} branch Branch (or tag) name. Make sure to supply tags in their verbose form: `refs/tags/tag-name`.
 * @param {string} githubToken Github access token, with `repo` and `actions:read` scopes.
 * @param {string} downloadDir Directory where the repository will be downloaded.
 * @param {EnvironmentVariables} env Local environment object.
 * @returns {Promise<boolean>} Whether the download and extraction was successful.
 */
const downloadRepository = async (
    repository: string,
    packageName: string,
    branch: string,
    githubToken: string,
    downloadDir: string,
    env: EnvironmentVariables,
): Promise<boolean> => {
    core.startGroup(`Download ${packageName} Repository`);

    const [owner, repo] = repository.split("/");

    core.info(`==> Repository: ${owner}/${repo}`);

    let ref;
    let headSha;

    const octokit = new Octokit({
        auth: githubToken,
    });

    if (/^[0-9a-f]{40}$/i.test(branch)) {
        // We've been given a commit hash instead of a branch or tag.
        core.info(`==> Hash: ${branch}`);
        headSha = branch;
        ref = headSha;
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
                },
            );

            if (
                isError(
                    response.status != 200,
                    `Wrong response code while fetching repository HEAD for ${repo}: ${response.status}`,
                )
            )
                return false;

            headSha = response.data.object.sha;
        } catch (error) {
            if (error instanceof Error)
                isError(
                    true,
                    `Error getting repository HEAD for ${repo}: ${error.message}`,
                );
            return false;
        }
    }

    let url;

    try {
        const response = await octokit.request(
            "GET /repos/{owner}/{repo}/tarball/{ref}",
            {
                owner,
                repo,
                ref,
            },
        );

        if (
            isError(
                response.status === 302 || response.status !== 200,
                `Wrong response code while fetching repository download URL for ${repo}: ${response.status}`,
            )
        )
            return false;

        url = response.url;
    } catch (error) {
        if (error instanceof Error)
            isError(
                true,
                `Error getting repository download URL for ${repo}: ${error.message}`,
            );
        return false;
    }

    core.info(`==> URL: ${url}`);

    const tarName = `${repo}.tar.gz`;

    try {
        await downloadFile(url, tarName);
    } catch (error) {
        if (error instanceof Error)
            isError(
                true,
                `Error downloading repository archive for ${repo}: ${error.message}`,
            );
        return false;
    }

    const stats = fs.statSync(tarName);

    if (
        isError(
            !stats.size,
            `Error determining size of repository archive for ${repo}`,
        )
    )
        return false;

    const size = filesize(stats.size);

    core.info(`==> Downloaded: ${tarName} (${size})`);

    // Create source directory.
    const sourceDir = path.join(downloadDir, packageName);
    await mkdirP(sourceDir);

    try {
        await tar.x({
            C: sourceDir,
            file: tarName,
            strip: 1,
        });
    } catch (error) {
        if (error instanceof Error)
            isError(
                true,
                `Error extracting repository archive for ${repo}: ${error.message}`,
            );
        return false;
    }

    core.info(`==> Extracted ${tarName} to ${sourceDir}`);

    fs.unlinkSync(tarName);

    await extendDependencies(env, packageName, headSha);

    core.endGroup();

    return true;
};

export default downloadRepository;
