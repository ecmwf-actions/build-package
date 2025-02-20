import fs from "fs";
import path from "path";
import * as core from "@actions/core";
import * as artifact from "@actions/artifact";
import * as tar from "tar";
import { filesize } from "filesize";

import { isError } from "./helper-functions";
import { getCacheKey } from "./cache-functions";

import { EnvironmentVariables } from "./types/env-functions";
import { CmakeOptionsLookup } from "./types/main";

/**
 * Archives and uploads package artifact.
 *
 * @param {string} repository Github repository owner and name to upload artifact for.
 * @param {string} packageName Name of the package.
 * @param {string} sha Github repository commit SHA.
 * @param {string} targetDir Target directory to upload as artifact.
 * @param {DependenciesObject} dependencies Dependencies object.
 * @param {string} os Current OS platform.
 * @param {string|null} compiler Current compiler family.
 * @param {EnvironmentVariables} env Local environment object.
 * @param {string} githubToken Github access token, with `repo` and `actions:read` scopes.
 * @param {string} cacheSuffix A string which will be appended to the cache key.
 * @param {string|undefined} cmakeOptions Build options string which is added to cache key hash
 * @param {CmakeOptionsLookup} dependencyCmakeOptionsLookup List of CMake options for each dependency.
 * @returns {Promise<boolean>} Whether the archiving and upload was successful.
 */
const uploadArtifact = async (
    repository: string,
    packageName: string,
    sha: string,
    targetDir: string,
    dependencies: DependenciesObject,
    os: string,
    compiler: string | null,
    env: EnvironmentVariables,
    dependencyTree: DependencyTree,
    githubToken: string,
    cacheSuffix: string,
    cmakeOptions: string | undefined,
    dependencyCmakeOptionsLookup: CmakeOptionsLookup = {},
): Promise<boolean> => {
    core.startGroup(`Upload ${packageName} Artifact`);

    const [owner] = repository.split("/");
    let [, repo] = repository.split("/");
    if (!repo) repo = owner;

    let artifactName;

    // Ecbuild has a different artifact name, as it is not actually built.
    if (packageName === "ecbuild") {
        artifactName = `ecbuild-${os}-cmake-${env.CMAKE_VERSION}-${sha}`;
    } else {
        const { cacheKey } = await getCacheKey(
            repository,
            sha,
            packageName,
            githubToken,
            os,
            compiler || "",
            cacheSuffix,
            env,
            dependencyTree,
            cmakeOptions,
            dependencyCmakeOptionsLookup,
        );
        artifactName = cacheKey;
    }
    const tarName = `${artifactName}.tar`;
    const rootDirectory = path.dirname(targetDir);
    const tarPath = path.join(rootDirectory, tarName);

    // First, we create an artifact TAR, in order to preserve file permissions.
    try {
        await tar.c(
            {
                C: targetDir,
                file: tarPath,
                gzip: true,
            },
            ["."],
        );
    } catch (error) {
        if (error instanceof Error)
            isError(
                true,
                `Error creating artifact TAR for ${packageName}: ${error.message}`,
            );
        return false;
    }

    const stats = fs.statSync(tarPath);

    if (
        isError(
            !stats.size,
            `Error determining size of artifact TAR for ${packageName}`,
        )
    )
        return false;

    const size = filesize(stats.size);

    core.info(`==> Created artifact TAR: ${tarPath} (${size})`);

    const uploadPaths = [tarPath];

    // Then, we output list of dependencies if they exist.
    if (dependencies) {
        const dependenciesName = `${artifactName}-dependencies.json`;
        const dependenciesPath = path.join(rootDirectory, dependenciesName);
        const dependenciesJson = JSON.stringify(dependencies);

        try {
            fs.writeFileSync(dependenciesPath, dependenciesJson);
        } catch (error) {
            if (error instanceof Error)
                isError(
                    true,
                    `Error writing dependencies file for ${packageName}: ${error.message}`,
                );
            return false;
        }

        core.info(`==> Created dependencies file: ${dependenciesPath}`);

        uploadPaths.push(dependenciesPath);
    }

    const artifactClient = new artifact.DefaultArtifactClient();

    let uploadResult;

    // Then, we try to upload the artifact. The artifact client will compress it further (i.e. as a ZIP).
    try {
        uploadResult = await artifactClient.uploadArtifact(
            artifactName,
            uploadPaths,
            rootDirectory,
        );
    } catch (error) {
        if (error instanceof Error)
            isError(
                true,
                `Error uploading artifact for ${packageName}: ${error.message}`,
            );
        return false;
    }

    if (isError(!uploadResult, `Error uploading artifact for ${packageName}`))
        return false;

    core.info(
        `==> Uploaded artifact: ${artifactName} (${filesize(
            uploadResult?.size || 0,
        )})`,
    );

    fs.unlinkSync(tarPath);

    core.endGroup();

    return true;
};

export default uploadArtifact;
