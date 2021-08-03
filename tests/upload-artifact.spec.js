const fs = require('fs');
const path = require('path');
const core = require('@actions/core');
const artifact = require('@actions/artifact');
const filesize = require('filesize');
const tar = require('tar');

const uploadArtifact = require('../src/upload-artifact');

jest.mock('@actions/core');
jest.mock('@actions/artifact');
jest.mock('tar');

// Test parameters.
const repository = 'owner/repo';
const repo = 'repo';
const installDir = '/path/to/install/repo';
const os = 'ubuntu-20.04';
const compiler = 'gnu-10';
const size = 68168435;
const artifactName = `${repo}-${os}-${compiler}`;
const tarName = `${artifactName}.tar`;
const rootDirectory = path.dirname(installDir);
const tarPath = path.join(rootDirectory, tarName);
const errorMessage = 'Oops!';

// Base environment object, we will take care not to modify it.
const env = {
    CC: 'gcc-10',
    CXX: 'g++-10',
    FC: 'gfortran-10',
    CMAKE_VERSION: '3.21.1',
};

const uploadResult = () => Promise.resolve({
    artifactName,
    size,
    failedItems: [],
});

describe('uploadArtifact', () => {
    it('returns true on success', async () => {
        expect.assertions(3);

        const testEnv = {
            ...env,
        };

        artifact.create.mockImplementation(() => ({
            uploadArtifact: uploadResult,
        }));

        const statSync = jest.spyOn(fs, 'statSync');
        statSync.mockImplementation(() => ({
            size,
        }));

        const unlinkSync = jest.spyOn(fs, 'unlinkSync');
        unlinkSync.mockImplementation(() => {
            return true;
        });

        const isUploaded = await uploadArtifact(repository, installDir, os, compiler, testEnv);

        expect(isUploaded).toBe(true);
        expect(core.info).toHaveBeenCalledWith(`==> Created artifact TAR: ${tarPath} (${filesize(size)})`);
        expect(core.info).toHaveBeenCalledWith(`==> Uploaded artifact: ${artifactName} (${filesize(size)})`);

        artifact.create.mockReset();
        statSync.mockReset();
        unlinkSync.mockReset();
    });

    it('supports invalid repository name', async () => {
        expect.assertions(2);

        const testEnv = {
            ...env,
        };

        const coverageArtifactName = `coverage-${repo}-${os}-${compiler}`;

        artifact.create.mockImplementation(() => ({
            uploadArtifact: () => Promise.resolve({
                artifactName: coverageArtifactName,
                size,
                failedItems: [],
            }),
        }));

        const statSync = jest.spyOn(fs, 'statSync');
        statSync.mockImplementation(() => ({
            size,
        }));

        const unlinkSync = jest.spyOn(fs, 'unlinkSync');
        unlinkSync.mockImplementation(() => {
            return true;
        });

        const isUploaded = await uploadArtifact(`coverage-${repo}`, installDir, os, compiler, testEnv);

        expect(isUploaded).toBe(true);
        expect(core.info).toHaveBeenCalledWith(`==> Uploaded artifact: ${coverageArtifactName} (${filesize(size)})`);

        artifact.create.mockReset();
        statSync.mockReset();
        unlinkSync.mockReset();
    });

    it('constructs a different artifact name in case of ecbuild', async () => {
        expect.assertions(2);

        const testEnv = {
            ...env,
        };

        const ecbuildArtifactName = `ecbuild-${os}-cmake-${testEnv.CMAKE_VERSION}`;

        artifact.create.mockImplementation(() => ({
            uploadArtifact: () => Promise.resolve({
                artifactName: ecbuildArtifactName,
                size,
                failedItems: [],
            }),
        }));

        const statSync = jest.spyOn(fs, 'statSync');
        statSync.mockImplementation(() => ({
            size,
        }));

        const unlinkSync = jest.spyOn(fs, 'unlinkSync');
        unlinkSync.mockImplementation(() => {
            return true;
        });

        const isUploaded = await uploadArtifact('ecmwf/ecbuild', installDir, os, null, testEnv);

        expect(isUploaded).toBe(true);
        expect(core.info).toHaveBeenCalledWith(`==> Uploaded artifact: ${ecbuildArtifactName} (${filesize(size)})`);

        artifact.create.mockReset();
        statSync.mockReset();
        unlinkSync.mockReset();
    });

    it('returns false if creating artifact TAR fails', async () => {
        expect.assertions(2);

        const testEnv = {
            ...env,
        };

        tar.c.mockImplementation(() => {
            throw new Error(errorMessage);
        });

        const isUploaded = await uploadArtifact(repository, installDir, os, compiler, testEnv);

        expect(isUploaded).toBe(false);
        expect(core.warning).toHaveBeenCalledWith(`Error creating artifact TAR: ${errorMessage}`);

        tar.c.mockReset();
    });

    it('returns false if determining archive size errors out', async () => {
        expect.assertions(2);

        const testEnv = {
            ...env,
        };

        artifact.create.mockImplementation(() => ({
            uploadArtifact: uploadResult,
        }));

        const statSync = jest.spyOn(fs, 'statSync');
        statSync.mockImplementation(() => ({
            size: 0,
        }));

        const isUploaded = await uploadArtifact(repository, installDir, os, compiler, testEnv);

        expect(isUploaded).toBe(false);
        expect(core.warning).toHaveBeenCalledWith('Error determining size of artifact TAR');

        artifact.create.mockReset();
        statSync.mockReset();
    });

    it('returns false if artifact item upload has some failures', async () => {
        expect.assertions(2);

        const testEnv = {
            ...env,
        };

        artifact.create.mockImplementation(() => ({
            uploadArtifact: () => Promise.resolve({
                artifactName,
                size,
                failedItems: [
                    artifactName,
                ],
            }),
        }));

        const statSync = jest.spyOn(fs, 'statSync');
        statSync.mockImplementation(() => ({
            size,
        }));

        const isUploaded = await uploadArtifact(repository, installDir, os, compiler, testEnv);

        expect(isUploaded).toBe(false);
        expect(core.warning).toHaveBeenCalledWith(`Error uploading artifact: ${artifactName}`);

        artifact.create.mockReset();
        statSync.mockReset();
    });

    it('returns false if artifact item upload returns empty result', async () => {
        expect.assertions(2);

        const testEnv = {
            ...env,
        };

        artifact.create.mockImplementation(() => ({
            uploadArtifact: () => Promise.resolve(),
        }));

        const statSync = jest.spyOn(fs, 'statSync');
        statSync.mockImplementation(() => ({
            size,
        }));

        const isUploaded = await uploadArtifact(repository, installDir, os, compiler, testEnv);

        expect(isUploaded).toBe(false);
        expect(core.warning).toHaveBeenCalledWith('Error uploading artifact');

        artifact.create.mockReset();
        statSync.mockReset();
    });

    it('returns false if artifact item upload fails', async () => {
        expect.assertions(2);

        const testEnv = {
            ...env,
        };

        artifact.create.mockImplementation(() => ({
            uploadArtifact: () => Promise.reject(new Error(errorMessage)),
        }));

        const statSync = jest.spyOn(fs, 'statSync');
        statSync.mockImplementation(() => ({
            size,
        }));

        const isUploaded = await uploadArtifact(repository, installDir, os, compiler, testEnv);

        expect(isUploaded).toBe(false);
        expect(core.warning).toHaveBeenCalledWith(`Error uploading artifact: ${errorMessage}`);

        artifact.create.mockReset();
        statSync.mockReset();
    });
});
