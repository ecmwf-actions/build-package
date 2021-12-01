import fs from 'fs';
import path from 'path';
import * as core from '@actions/core';
import * as artifact from '@actions/artifact';
import filesize from 'filesize';
import tar from 'tar';

import uploadArtifact from '../src/upload-artifact';

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
const sha = 'f0b00fd201c7ddf14e1572a10d5fb4577c4bd6a2';
const artifactName = `${repo}-${os}-${compiler}-${sha}`;
const tarName = `${artifactName}.tar`;
const rootDirectory = path.dirname(installDir);
const tarPath = path.join(rootDirectory, tarName);
const dependenciesName = `${artifactName}-dependencies.json`;
const dependenciesPath = path.join(rootDirectory, dependenciesName);
const errorObject = new Error('Oops!');
const emptyObject = {};

const dependencies = {
    'owner/repo1': 'de9f2c7fd25e1b3afad3e85a0bd17d9b100db4b3',
    'owner/repo2': '2fd4e1c67a2d28fced849ee1bb76e7391b93eb12',
};

// Base environment object, we will take care not to modify it.
const env = {
    CC: 'gcc-10',
    CXX: 'g++-10',
    FC: 'gfortran-10',
    CMAKE_VERSION: '3.21.1',
    DEPENDENCIES: dependencies,
};

const uploadResult = () => Promise.resolve({
    artifactName,
    size,
    failedItems: [],
});

describe('uploadArtifact', () => {
    it('returns true on success', async () => {
        expect.assertions(4);

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

        const writeFileSync = jest.spyOn(fs, 'writeFileSync');
        writeFileSync.mockImplementation((path) => {
            if (path === dependenciesPath) return true;
        });

        const unlinkSync = jest.spyOn(fs, 'unlinkSync');
        unlinkSync.mockImplementation(() => {
            return true;
        });

        const isUploaded = await uploadArtifact(repository, sha, installDir, dependencies, os, compiler, testEnv);

        expect(isUploaded).toBe(true);
        expect(core.info).toHaveBeenCalledWith(`==> Created artifact TAR: ${tarPath} (${filesize(size)})`);
        expect(core.info).toHaveBeenCalledWith(`==> Created dependencies file: ${dependenciesPath}`);
        expect(core.info).toHaveBeenCalledWith(`==> Uploaded artifact: ${artifactName} (${filesize(size)})`);

        artifact.create.mockReset();
        statSync.mockReset();
        writeFileSync.mockReset();
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

        const isUploaded = await uploadArtifact(`coverage-${repo}`, sha, installDir, null, os, compiler, testEnv);

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

        const ecbuildArtifactName = `ecbuild-${os}-cmake-${testEnv.CMAKE_VERSION}-${sha}`;

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

        const writeFileSync = jest.spyOn(fs, 'writeFileSync');
        writeFileSync.mockImplementation((path) => {
            if (path === dependenciesPath) return true;
        });

        const unlinkSync = jest.spyOn(fs, 'unlinkSync');
        unlinkSync.mockImplementation(() => {
            return true;
        });

        const isUploaded = await uploadArtifact('ecmwf/ecbuild', sha, installDir, {}, os, null, testEnv);

        expect(isUploaded).toBe(true);
        expect(core.info).toHaveBeenCalledWith(`==> Uploaded artifact: ${ecbuildArtifactName} (${filesize(size)})`);

        artifact.create.mockReset();
        statSync.mockReset();
        writeFileSync.mockReset();
        unlinkSync.mockReset();
    });

    it.each`
        error
        ${errorObject}
        ${emptyObject}
    `('returns false if creating artifact TAR fails', async ({ error }) => {
        expect.hasAssertions();

        const testEnv = {
            ...env,
        };

        tar.c.mockImplementation(() => {
            throw error;
        });

        const isUploaded = await uploadArtifact(repository, sha, installDir, dependencies, os, compiler, testEnv);

        expect(isUploaded).toBe(false);

        tar.c.mockReset();

        if (!(error instanceof Error)) return;
        expect(core.warning).toHaveBeenCalledWith(`Error creating artifact TAR for ${repo}: ${error.message}`);
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

        const isUploaded = await uploadArtifact(repository, sha, installDir, dependencies, os, compiler, testEnv);

        expect(isUploaded).toBe(false);
        expect(core.warning).toHaveBeenCalledWith(`Error determining size of artifact TAR for ${repo}`);

        artifact.create.mockReset();
        statSync.mockReset();
    });

    it.each`
        error
        ${errorObject}
        ${emptyObject}
    `('returns false if writing dependencies file errors out', async ({ error }) => {
        expect.hasAssertions();

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

        const writeFileSync = jest.spyOn(fs, 'writeFileSync');
        writeFileSync.mockImplementation((path) => {
            if (path === dependenciesPath) throw error;
        });

        const unlinkSync = jest.spyOn(fs, 'unlinkSync');
        unlinkSync.mockImplementation(() => {
            return true;
        });

        const isUploaded = await uploadArtifact(repository, sha, installDir, dependencies, os, compiler, testEnv);

        expect(isUploaded).toBe(false);

        artifact.create.mockReset();
        statSync.mockReset();
        writeFileSync.mockReset();
        unlinkSync.mockReset();

        if (!(error instanceof Error)) return;
        expect(core.warning).toHaveBeenCalledWith(`Error writing dependencies file for ${repo}: ${error.message}`);
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

        const writeFileSync = jest.spyOn(fs, 'writeFileSync');
        writeFileSync.mockImplementation((path) => {
            if (path === dependenciesPath) return true;
        });

        const isUploaded = await uploadArtifact(repository, sha, installDir, dependencies, os, compiler, testEnv);

        expect(isUploaded).toBe(false);
        expect(core.warning).toHaveBeenCalledWith(`Error uploading artifact for ${repo}: ${artifactName}`);

        artifact.create.mockReset();
        statSync.mockReset();
        writeFileSync.mockReset();
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

        const writeFileSync = jest.spyOn(fs, 'writeFileSync');
        writeFileSync.mockImplementation((path) => {
            if (path === dependenciesPath) return true;
        });

        const isUploaded = await uploadArtifact(repository, sha, installDir, dependencies, os, compiler, testEnv);

        expect(isUploaded).toBe(false);
        expect(core.warning).toHaveBeenCalledWith(`Error uploading artifact for ${repo}`);

        artifact.create.mockReset();
        statSync.mockReset();
        writeFileSync.mockReset();
    });

    it.each`
        error
        ${errorObject}
        ${emptyObject}
    `('returns false if artifact item upload fails', async ({ error }) => {
        expect.hasAssertions();

        const testEnv = {
            ...env,
        };

        artifact.create.mockImplementation(() => ({
            uploadArtifact: () => Promise.reject(error),
        }));

        const statSync = jest.spyOn(fs, 'statSync');
        statSync.mockImplementation(() => ({
            size,
        }));

        const writeFileSync = jest.spyOn(fs, 'writeFileSync');
        writeFileSync.mockImplementation((path) => {
            if (path === dependenciesPath) return true;
        });

        const isUploaded = await uploadArtifact(repository, sha, installDir, dependencies, os, compiler, testEnv);

        expect(isUploaded).toBe(false);

        artifact.create.mockReset();
        statSync.mockReset();
        writeFileSync.mockReset();

        if (!(error instanceof Error)) return;
        expect(core.warning).toHaveBeenCalledWith(`Error uploading artifact for ${repo}: ${error.message}`);
    });
});
