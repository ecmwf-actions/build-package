import fs from "fs";
import path from "path";
import { Buffer } from "buffer";
import * as core from "@actions/core";
import { mkdirP } from "@actions/io";
import { Octokit } from "@octokit/core";
import AdmZip from "adm-zip";
import { filesize } from "filesize";
import * as tar from "tar";

import { extendPaths, extendDependencies } from "./env-functions";
import { isError } from "./helper-functions";

import { EnvironmentVariables } from "./types/env-functions";
import { getCacheKey } from "./cache-functions";
import { CmakeOptionsLookup } from "./types/main";

/**
 * Downloads and extracts package artifact.
 *
 * @param {string} repository Github repository owner and name.
 * @param {string} packageName Name of the package.
 * @param {string} branch Branch name.
 * @param {string} githubToken Github access token, with `repo` and `actions:read` scopes.
 * @param {string} downloadDir Directory where the artifact will be downloaded.
 * @param {string} installDir Directory where to extract the artifact.
 * @param {string} os Current OS platform.
 * @param {string} compiler Current compiler family.
 * @param {EnvironmentVariables} env Local environment object.
 * @param {string} cacheSuffix A string which will be appended to the cache key.
 * @param {string|undefined} cmakeOptions Build options string which is added to cache key hash
 * @param {CmakeOptionsLookup} dependencyCmakeOptionsLookup List of CMake options for each dependency.
 * @returns {Promise<boolean>} Whether the download and extraction was successful.
 */
const downloadArtifact = async (
    repository: string,
    packageName: string,
    branch: string,
    githubToken: string,
    downloadDir: string,
    installDir: string,
    os: string,
    compiler: string,
    env: EnvironmentVariables,
    dependencyTree: DependencyTree,
    cacheSuffix: string,
    cmakeOptions: string | undefined,
    dependencyCmakeOptionsLookup: CmakeOptionsLookup = {},
): Promise<boolean> => {
    core.startGroup(`Download ${packageName} Artifact`);

    const [owner, repo] = repository.split("/");

    core.info(`==> Repository: ${owner}/${repo}`);
    core.info(`==> Package name: ${packageName}`);

    branch = branch.replace(/^refs\/heads\//, "");

    core.info(`==> Branch: ${branch}`);

    const octokit = new Octokit({
        auth: githubToken,
    });

    let headSha;

    if (/^[0-9a-f]{40}$/i.test(branch)) {
        // We've been given a commit hash instead of a branch or tag.
        core.info(`==> Hash: ${branch}`);
        headSha = branch;
    } else {
        try {
            const response = await octokit.request(
                "GET /repos/{owner}/{repo}/git/ref/{ref}",
                {
                    owner,
                    repo,
                    ref: `heads/${branch}`,
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

    core.info(`==> headSha: ${headSha}`);

    let artifactName: string;

    // Ecbuild has a different artifact name, as it is not actually built.
    if (packageName === "ecbuild") {
        artifactName = `ecbuild-${os}-cmake-${env.CMAKE_VERSION}-${headSha}`;
    } else {
        const { cacheKey } = await getCacheKey(
            repository,
            headSha,
            packageName,
            githubToken,
            os,
            compiler,
            cacheSuffix,
            env,
            dependencyTree,
            cmakeOptions,
            dependencyCmakeOptionsLookup,
        );
        artifactName = cacheKey;
    }

    let artifacts;

    try {
        const response = await octokit.request(
            "GET /repos/{owner}/{repo}/actions/artifacts",
            {
                owner,
                repo,
                name: artifactName,
            },
        );

        if (
            isError(
                response.status != 200,
                `Wrong response code while fetching artifacts for ${packageName}: ${response.status}`,
            )
        )
            return false;

        artifacts = response.data.artifacts;
    } catch (error) {
        if (error instanceof Error)
            isError(
                true,
                `Error fetching artifacts for ${packageName}: ${error.message}`,
            );
        return false;
    }

    core.info(`==> Artifacts: ${artifacts.length}`);

    if (!artifacts.length) {
        isError(true, `No workflow artifacts found for ${packageName}`);
        return false;
    }

    // Consider only artifacts with expected name.
    artifacts = artifacts.filter((artifact) => artifact.name === artifactName);

    if (
        isError(
            !artifacts.length,
            `No suitable artifact found: ${artifactName}`,
        )
    )
        return false;

    const artifact = artifacts.shift();

    core.info(`==> artifactName: ${artifactName}`);
    core.info(`==> artifactId: ${artifact?.id}`);

    let zip: string;

    try {
        const response = await octokit.request(
            "GET /repos/{owner}/{repo}/actions/artifacts/{artifact_id}/{archive_format}",
            {
                owner,
                repo,
                artifact_id: artifact?.id as number,
                archive_format: "zip",
            },
        );

        if (
            isError(
                response.status === 302 || response.status !== 200,
                `Wrong response code while downloading workflow run artifact for ${packageName}: ${response.status}`,
            )
        )
            return false;

        zip = response.data as string;
    } catch (error) {
        if (error instanceof Error)
            isError(
                true,
                `Error downloading workflow run artifact for ${packageName}: ${error.message}`,
            );
        return false;
    }

    const size = filesize(artifact?.size_in_bytes as number);

    core.info(`==> Downloaded: ${artifact?.name}.zip (${size})`);

    const artifactPath = path.resolve(
        path.join(downloadDir, artifact?.name as string),
    );

    await mkdirP(artifactPath);

    const adm = new AdmZip(Buffer.from(zip));

    adm.getEntries().forEach((entry) => {
        const action = entry.isDirectory ? "creating" : "inflating";
        const filepath = `${artifactPath}/${entry.entryName}`;

        core.info(`  ${action}: ${filepath}`);
    });

    adm.extractAllTo(artifactPath, true);

    core.info(`==> Extracted artifact ZIP archive to ${artifactPath}`);

    const tarPath = path.join(artifactPath, `${artifactName}.tar`);
    const dependenciesPath = path.join(
        artifactPath,
        `${artifactName}-dependencies.json`,
    );

    // Check artifact compatibility by going through its dependencies and verifying against current ones.
    if (fs.existsSync(dependenciesPath)) {
        const dependenciesContent = fs
            .readFileSync(dependenciesPath)
            .toString();

        core.info(`==> Found ${dependenciesPath}`);

        const dependencies = JSON.parse(dependenciesContent);

        for (const [dependency, dependencySha] of Object.entries(
            dependencies,
        )) {
            if (
                env.DEPENDENCIES &&
                env.DEPENDENCIES[dependency as keyof DependenciesObject] &&
                env.DEPENDENCIES[dependency as keyof DependenciesObject] !==
                    dependencySha
            ) {
                fs.unlinkSync(tarPath);
                fs.unlinkSync(dependenciesPath);

                isError(
                    true,
                    `Error matching dependency ${dependency} for ${packageName}: ${
                        env.DEPENDENCIES[dependency as keyof DependenciesObject]
                    } !== ${dependencySha}`,
                );

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
    } catch (error) {
        if (error instanceof Error)
            isError(
                true,
                `Error extracting artifact TAR for ${packageName}: ${error.message}`,
            );
        return false;
    }

    core.info(`==> Extracted artifact TAR to ${installDir}`);

    fs.unlinkSync(tarPath);

    await extendPaths(env, installDir, repo);

    await extendDependencies(env, packageName, headSha);

    core.endGroup();

    return true;
};

export default downloadArtifact;
