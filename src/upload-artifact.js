const fs = require('fs');
const path = require('path');
const core = require('@actions/core');
const artifact = require('@actions/artifact');
const tar = require('tar');
const filesize = require('filesize');

const { isError } = require('./helper-functions');

/**
 * Archives and uploads package artifact.
 *
 * @param {String} repository Github repository owner and name to upload artifact for.
 * @param {String} sha Github repository commit SHA.
 * @param {String} targetDir Target directory to upload as artifact.
 * @param {Object} dependencies Dependencies object.
 * @param {String} os Current OS platform.
 * @param {String} compiler Current compiler family.
 * @param {Object} env Local environment object.
 * @returns {Boolean} Whether the archiving and upload was successful.
 */
module.exports = async (repository, sha, targetDir, dependencies, os, compiler, env) => {
    core.startGroup(`Upload ${repository} Artifact`);

    let [owner, repo] = repository.split('/');
    if (!repo) repo = owner;

    let artifactName;

    // Ecbuild has a different artifact name, as it is not actually built.
    if (repo === 'ecbuild') artifactName = `ecbuild-${os}-cmake-${env.CMAKE_VERSION}-${sha}`;
    else artifactName = `${repo}-${os}-${compiler}-${sha}`;

    const tarName = `${artifactName}.tar`;
    const rootDirectory = path.dirname(targetDir);
    const tarPath = path.join(rootDirectory, tarName);

    // First, we create an artifact TAR, in order to preserve file permissions.
    try {
        await tar.c(
            {
                C: targetDir,
                file: tarPath,
            },
            [
                '.',
            ]
        );
    }
    catch (error) {
        isError(true, `Error creating artifact TAR for ${repo}: ${error.message}`);
        return false;
    }

    const stats = fs.statSync(tarPath);

    if (isError(!stats.size, `Error determining size of artifact TAR for ${repo}`)) return false;

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
        }
        catch (error) {
            isError(true, `Error writing dependencies file for ${repo}: ${error.message}`);
            return false;
        }

        core.info(`==> Created dependencies file: ${dependenciesPath}`);

        uploadPaths.push(dependenciesPath);
    }

    const artifactClient = artifact.create();

    let uploadResult;

    // Then, we try to upload the artifact. The artifact client will compress it further (i.e. as a ZIP).
    try {
        uploadResult = await artifactClient.uploadArtifact(artifactName, uploadPaths, rootDirectory, {
            continueOnError: true,
        });
    }
    catch (error) {
        isError(true, `Error uploading artifact for ${repo}: ${error.message}`);
        return false;
    }

    if (isError(!uploadResult, `Error uploading artifact for ${repo}`)) return false;

    if (
        isError(
            uploadResult
            && uploadResult.failedItems
            && uploadResult.failedItems.length,
            `Error uploading artifact for ${repo}: ${uploadResult.failedItems}`
        )
    ) {
        return false;
    }

    core.info(`==> Uploaded artifact: ${uploadResult.artifactName} (${filesize(uploadResult.size)})`);

    fs.unlinkSync(tarPath);

    core.endGroup();

    return true;
};
