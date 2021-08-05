const fs = require('fs');
const core = require('@actions/core');
const { Octokit } = require('@octokit/core');
const filesize = require('filesize');
const tar = require('tar');

const downloadFile = require('../src/download-file');
const downloadRepository = require('../src/download-repository');

jest.mock('@actions/core');
jest.mock('@actions/http-client');
jest.mock('@actions/io');
jest.mock('@octokit/core');
jest.mock('tar');
jest.mock('../src/download-file');

// Test parameters.
const repository = 'owner/repo';
const branch = 'develop';
const headSha = 'f0b00fd201c7ddf14e1572a10d5fb4577c4bd6a2';
const githubToken = '12345';
const downloadDir = '/path/to/download';
const url = 'https://foo.bar';
const size = 123456789;
const tarName = 'repo.tar.gz';
const sourceDir = '/path/to/download/repo';
const errorStatusCode = 500;
const errorMessage = 'Oops!';

const resolveHeadSha = () => Promise.resolve({
    status: 200,
    data: {
        object: {
            sha: headSha,
        },
    },
});

const resolveRepositoryDownloadUrl = () => Promise.resolve({
    status: 200,
    url,
});

// Base environment object, we will take care not to modify it.
const env = {
    CC: 'gcc-10',
    CXX: 'g++-10',
    FC: 'gfortran-10',
    CMAKE_VERSION: '3.21.1',
};

describe('downloadRepository', () => {
    it('returns true on success', async () => {
        expect.assertions(6);

        const testEnv = {
            ...env,
        };

        Octokit.prototype.constructor.mockImplementation((options) => {
            if (!options.auth) throw Error(`Octokit authentication missing, did you pass the auth key?`);

            return {
                request: (route) => {
                    switch (route) {
                    case 'GET /repos/{owner}/{repo}/git/ref/{ref}':
                        return resolveHeadSha();
                    case 'GET /repos/{owner}/{repo}/tarball/{ref}':
                        return resolveRepositoryDownloadUrl();
                    }
                },
            };
        });

        downloadFile.mockImplementation(() => Promise.resolve());

        const statSync = jest.spyOn(fs, 'statSync');
        statSync.mockImplementation(() => ({
            size,
        }));

        const unlinkSync = jest.spyOn(fs, 'unlinkSync');
        unlinkSync.mockImplementation(() => {
            return true;
        });

        const isRepositoryDownloaded = await downloadRepository(repository, branch, githubToken, downloadDir, testEnv);

        expect(isRepositoryDownloaded).toBe(true);
        expect(core.info).toHaveBeenCalledWith(`==> Repository: ${repository}`);
        expect(core.info).toHaveBeenCalledWith(`==> Branch: ${branch}`);
        expect(core.info).toHaveBeenCalledWith(`==> URL: ${url}`);
        expect(core.info).toHaveBeenCalledWith(`==> Downloaded: ${tarName} (${filesize(size)})`);
        expect(core.info).toHaveBeenCalledWith(`==> Extracted ${tarName} to ${sourceDir}`);

        Octokit.prototype.constructor.mockReset();
        downloadFile.mockReset();
        statSync.mockReset();
        unlinkSync.mockReset();
    });

    it('returns false if request for repository HEAD errors out', async () => {
        expect.assertions(2);

        const testEnv = {
            ...env,
        };

        Octokit.prototype.constructor.mockImplementation(() => ({
            request: (route) => {
                switch (route) {
                case 'GET /repos/{owner}/{repo}/git/ref/{ref}':
                    return Promise.resolve({
                        status: errorStatusCode,
                    });
                }
            },
        }));

        const isRepositoryDownloaded = await downloadRepository(repository, branch, githubToken, downloadDir, testEnv);

        expect(isRepositoryDownloaded).toBe(false);
        expect(core.warning).toHaveBeenCalledWith(`Wrong response code while fetching repository HEAD: ${errorStatusCode}`);

        Octokit.prototype.constructor.mockReset();
    });

    it('returns false if request for repository HEAD fails', async () => {
        expect.assertions(2);

        const testEnv = {
            ...env,
        };

        Octokit.prototype.constructor.mockImplementation(() => ({
            request: (route) => {
                switch (route) {
                case 'GET /repos/{owner}/{repo}/git/ref/{ref}':
                    throw new Error(errorMessage);
                }
            },
        }));

        const isRepositoryDownloaded = await downloadRepository(repository, branch, githubToken, downloadDir, testEnv);

        expect(isRepositoryDownloaded).toBe(false);
        expect(core.warning).toHaveBeenCalledWith(`Error getting repository HEAD: ${errorMessage}`);

        Octokit.prototype.constructor.mockReset();
    });

    it('returns false if request for repository download URL errors out', async () => {
        expect.assertions(2);

        const testEnv = {
            ...env,
        };

        Octokit.prototype.constructor.mockImplementation(() => ({
            request: (route) => {
                switch (route) {
                case 'GET /repos/{owner}/{repo}/git/ref/{ref}':
                    return resolveHeadSha();
                case 'GET /repos/{owner}/{repo}/tarball/{ref}':
                    return Promise.resolve({
                        status: errorStatusCode,
                    });
                }
            },
        }));

        const isRepositoryDownloaded = await downloadRepository(repository, branch, githubToken, downloadDir, testEnv);

        expect(isRepositoryDownloaded).toBe(false);
        expect(core.warning).toHaveBeenCalledWith(`Wrong response code while fetching repository download URL: ${errorStatusCode}`);

        Octokit.prototype.constructor.mockReset();
    });

    it('returns false if request for repository download URL fails', async () => {
        expect.assertions(2);

        const testEnv = {
            ...env,
        };

        Octokit.prototype.constructor.mockImplementation(() => ({
            request: (route) => {
                switch (route) {
                case 'GET /repos/{owner}/{repo}/git/ref/{ref}':
                    return resolveHeadSha();
                case 'GET /repos/{owner}/{repo}/tarball/{ref}':
                    throw new Error(errorMessage);
                }
            },
        }));

        const isRepositoryDownloaded = await downloadRepository(repository, branch, githubToken, downloadDir, testEnv);

        expect(isRepositoryDownloaded).toBe(false);
        expect(core.warning).toHaveBeenCalledWith(`Error getting repository download URL: ${errorMessage}`);

        Octokit.prototype.constructor.mockReset();
    });

    it('returns false if download fails', async () => {
        expect.assertions(2);

        const testEnv = {
            ...env,
        };

        Octokit.prototype.constructor.mockImplementation(() => ({
            request: (route) => {
                switch (route) {
                case 'GET /repos/{owner}/{repo}/git/ref/{ref}':
                    return resolveHeadSha();
                case 'GET /repos/{owner}/{repo}/tarball/{ref}':
                    return resolveRepositoryDownloadUrl();
                }
            },
        }));

        downloadFile.mockImplementation(() => {
            throw Error(errorMessage);
        });

        const isRepositoryDownloaded = await downloadRepository(repository, branch, githubToken, downloadDir, testEnv);

        expect(isRepositoryDownloaded).toBe(false);
        expect(core.warning).toHaveBeenCalledWith(`Error downloading repository archive: ${errorMessage}`);

        Octokit.prototype.constructor.mockReset();
        downloadFile.mockReset();
    });

    it('returns false if determining archive size errors out', async () => {
        expect.assertions(2);

        const testEnv = {
            ...env,
        };

        Octokit.prototype.constructor.mockImplementation(() => ({
            request: (route) => {
                switch (route) {
                case 'GET /repos/{owner}/{repo}/git/ref/{ref}':
                    return resolveHeadSha();
                case 'GET /repos/{owner}/{repo}/tarball/{ref}':
                    return resolveRepositoryDownloadUrl();
                }
            },
        }));

        downloadFile.mockImplementation(() => Promise.resolve());

        const statSync = jest.spyOn(fs, 'statSync');
        statSync.mockImplementation(() => ({
            size: 0,
        }));

        const isRepositoryDownloaded = await downloadRepository(repository, branch, githubToken, downloadDir, testEnv);

        expect(isRepositoryDownloaded).toBe(false);
        expect(core.warning).toHaveBeenCalledWith('Error determining size of repository archive');

        Octokit.prototype.constructor.mockReset();
        downloadFile.mockReset();
        statSync.mockReset();
    });

    it('returns false if extracting repository archive fails', async () => {
        expect.assertions(2);

        const testEnv = {
            ...env,
        };

        Octokit.prototype.constructor.mockImplementation(() => ({
            request: (route) => {
                switch (route) {
                case 'GET /repos/{owner}/{repo}/git/ref/{ref}':
                    return resolveHeadSha();
                case 'GET /repos/{owner}/{repo}/tarball/{ref}':
                    return resolveRepositoryDownloadUrl();
                }
            },
        }));

        downloadFile.mockImplementation(() => Promise.resolve());

        const statSync = jest.spyOn(fs, 'statSync');
        statSync.mockImplementation(() => ({
            size,
        }));

        tar.x.mockImplementation(() => {
            throw new Error(errorMessage);
        });

        const isRepositoryDownloaded = await downloadRepository(repository, branch, githubToken, downloadDir, testEnv);

        expect(isRepositoryDownloaded).toBe(false);
        expect(core.warning).toHaveBeenCalledWith(`Error extracting repository archive: ${errorMessage}`);

        Octokit.prototype.constructor.mockReset();
        downloadFile.mockReset();
        statSync.mockReset();
        tar.x.mockReset();
    });

    it('extends environment object with install paths and dependency', async () => {
        expect.assertions(2);

        const testEnv = {
            ...env,
        };

        const expectedEnv = {
            ...testEnv,
            DEPENDENCIES: {
                [repository]: headSha,
            },
        };

        Octokit.prototype.constructor.mockImplementation(() => ({
            request: (route) => {
                switch (route) {
                case 'GET /repos/{owner}/{repo}/git/ref/{ref}':
                    return resolveHeadSha();
                case 'GET /repos/{owner}/{repo}/tarball/{ref}':
                    return resolveRepositoryDownloadUrl();
                }
            },
        }));

        downloadFile.mockImplementation(() => Promise.resolve());

        const statSync = jest.spyOn(fs, 'statSync');
        statSync.mockImplementation(() => ({
            size,
        }));

        const unlinkSync = jest.spyOn(fs, 'unlinkSync');
        unlinkSync.mockImplementation(() => {
            return true;
        });

        const isRepositoryDownloaded = await downloadRepository(repository, branch, githubToken, downloadDir, testEnv);

        expect(isRepositoryDownloaded).toBe(true);
        expect(testEnv).toStrictEqual(expectedEnv);

        Octokit.prototype.constructor.mockReset();
        downloadFile.mockReset();
        statSync.mockReset();
        unlinkSync.mockReset();
    });
});
