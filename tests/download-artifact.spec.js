const process = require('process');
const fs = require('fs');
const { Buffer } = require('buffer');
const core = require('@actions/core');
const { Octokit } = require('@octokit/core');
const AdmZip = require('adm-zip');
const filesize = require('filesize');
const tar = require('tar');

const downloadArtifact = require('../src/download-artifact');

jest.mock('@actions/core');
jest.mock('@actions/io');
jest.mock('@octokit/core');
jest.mock('adm-zip');
jest.mock('tar');

// Test parameters.
const repository = 'owner/repo';
const repo = 'repo';
const branch = 'develop';
const githubToken = '12345';
const downloadDir = '/path/to/download/repo';
const installDir = '/path/to/install/repo';
const os = 'ubuntu-20.04';
const compiler = 'gnu-10';
const runId = 123456789;
const headSha = 'f0b00fd201c7ddf14e1572a10d5fb4577c4bd6a2';
const artifactName = `${repo}-${os}-${compiler}-${headSha}`;
const artifactId = 987654321;
const artifactSize = 68168435;
const artifactPath = `${downloadDir}/${artifactName}`;
const tarPath = `${artifactPath}/${artifactName}.tar`;
const dependenciesPath = `${artifactPath}/${artifactName}-dependencies.json`;
const errorStatusCode = 500;
const errorMessage = 'Oops!';

const resolveWorkflowRuns = () => Promise.resolve({
    status: 200,
    data: {
        workflow_runs: [
            {
                id: runId,
                head_sha: headSha,
                status: 'completed',
                conclusion: 'success',
            },
        ],
    },
});

const resolveWorkflowRunArtifacts = (targetArtifactName) => Promise.resolve({
    status: 200,
    data: {
        artifacts: [
            {
                name: `${repo}-macos-10.15-clang-12`,
                id: 987654320,
                size_in_bytes: 41651984,
            },
            {
                name: targetArtifactName,
                id: artifactId,
                size_in_bytes: artifactSize,
            },
            {
                name: `${repo}-ubuntu-18.04-gnu-9`,
                id: 987654322,
                size_in_bytes: 716551654,
            },
        ],
    },
});

const resolveHeadSha = () => Promise.resolve({
    status: 200,
    data: {
        object: {
            sha: headSha,
        },
    },
});

const resolveArtifactDownload = () => Promise.resolve({
    status: 200,
    data: Buffer.allocUnsafe(4096),
});

const getEntries = () => ([
    {
        isDirectory: true,
        entryName: 'dir',
    },
    {
        isDirectory: false,
        entryName: 'dir/file1',
    },
    {
        isDirectory: false,
        entryName: 'dir/file2',
    },
    {
        isDirectory: true,
        entryName: 'dir/subdir',
    },
    {
        isDirectory: false,
        entryName: 'dir/subdir/file3',
    },
    {
        isDirectory: false,
        entryName: 'file4',
    },
]);

const extractAllTo = jest.fn();

// Base environment object, we will take care not to modify it.
const env = {
    CC: 'gcc-10',
    CXX: 'g++-10',
    FC: 'gfortran-10',
    CMAKE_VERSION: '3.21.1',
};

describe('downloadArtifact', () => {
    it('returns true on success', async () => {
        expect.assertions(21);

        const testEnv = {
            ...env,
        };

        Octokit.prototype.constructor.mockImplementation(() => ({
            request: (route) => {
                switch (route) {
                case 'GET /repos/{owner}/{repo}/actions/workflows/{workflow_id}/runs':
                    return resolveWorkflowRuns();
                case 'GET /repos/{owner}/{repo}/actions/runs/{run_id}/artifacts':
                    return resolveWorkflowRunArtifacts(artifactName);
                case 'GET /repos/{owner}/{repo}/git/ref/{ref}':
                    return resolveHeadSha();
                case 'GET /repos/{owner}/{repo}/actions/artifacts/{artifact_id}/{archive_format}':
                    return resolveArtifactDownload();
                }
            },
        }));

        AdmZip.prototype.constructor.mockImplementation(() => ({
            getEntries,
            extractAllTo,
        }));

        const existsSync = jest.spyOn(fs, 'existsSync');
        existsSync.mockImplementation((path) => {
            if (path === dependenciesPath) return false;
        });

        const unlinkSync = jest.spyOn(fs, 'unlinkSync');
        unlinkSync.mockImplementation(() => true);

        const isArtifactDownloaded = await downloadArtifact(repository, branch, githubToken, downloadDir, installDir, os, compiler, testEnv);

        expect(isArtifactDownloaded).toBe(true);
        expect(core.info).toHaveBeenCalledWith('==> Workflow: ci.yml');
        expect(core.info).toHaveBeenCalledWith(`==> Repository: ${repository}`);
        expect(core.info).toHaveBeenCalledWith(`==> Branch: ${branch}`);
        expect(core.info).toHaveBeenCalledWith('==> workflowRuns: 1');
        expect(core.info).toHaveBeenCalledWith(`==> RunID: ${runId}`);
        expect(core.info).toHaveBeenCalledWith('==> Artifacts: 3');
        expect(core.info).toHaveBeenCalledWith(`==> headSha: ${headSha}`);
        expect(core.info).toHaveBeenCalledWith(`==> artifactName: ${artifactName}`);
        expect(core.info).toHaveBeenCalledWith(`==> artifactId: ${artifactId}`);
        expect(core.info).toHaveBeenCalledWith(`==> Downloaded: ${artifactName}.zip (${filesize(artifactSize)})`);
        expect(core.info).toHaveBeenCalledWith(`==> Extracted artifact ZIP archive to ${artifactPath}`);
        expect(core.info).toHaveBeenCalledWith(`==> Extracted artifact TAR to ${installDir}`);
        expect(extractAllTo).toHaveBeenCalledWith(artifactPath, true);
        expect(unlinkSync).toHaveBeenCalledWith(tarPath);

        getEntries().forEach((entry) => {
            const action = entry.isDirectory ? 'creating' : 'inflating';
            const filepath = `${artifactPath}/${entry.entryName}`;

            expect(core.info).toHaveBeenCalledWith(`  ${action}: ${filepath}`);
        });

        Octokit.prototype.constructor.mockReset();
        AdmZip.prototype.constructor.mockReset();
        unlinkSync.mockReset();
    });

    it('returns true if dependencies match', async () => {
        expect.assertions(2);

        const dependency1 = 'owner/repo1';
        const dependency1Sha = 'de9f2c7fd25e1b3afad3e85a0bd17d9b100db4b3';
        const dependency2 = 'owner/repo2';
        const dependency2Sha = '2fd4e1c67a2d28fced849ee1bb76e7391b93eb12';

        const testEnv = {
            ...env,
            DEPENDENCIES: {
                [dependency1]: dependency1Sha,
                [dependency2]: dependency2Sha,
            },
        };

        Octokit.prototype.constructor.mockImplementation(() => ({
            request: (route) => {
                switch (route) {
                case 'GET /repos/{owner}/{repo}/actions/workflows/{workflow_id}/runs':
                    return resolveWorkflowRuns();
                case 'GET /repos/{owner}/{repo}/actions/runs/{run_id}/artifacts':
                    return resolveWorkflowRunArtifacts(artifactName);
                case 'GET /repos/{owner}/{repo}/git/ref/{ref}':
                    return resolveHeadSha();
                case 'GET /repos/{owner}/{repo}/actions/artifacts/{artifact_id}/{archive_format}':
                    return resolveArtifactDownload();
                }
            },
        }));

        AdmZip.prototype.constructor.mockImplementation(() => ({
            getEntries,
            extractAllTo,
        }));

        const existsSync = jest.spyOn(fs, 'existsSync');
        existsSync.mockImplementation((path) => {
            if (path === dependenciesPath) return true;
        });

        const readFileSync = jest.spyOn(fs, 'readFileSync');
        readFileSync.mockImplementation((path) => {
            if (path === dependenciesPath) return JSON.stringify({
                [dependency1]: dependency1Sha,
                [dependency2]: dependency2Sha,
            });
        });

        const unlinkSync = jest.spyOn(fs, 'unlinkSync');
        unlinkSync.mockImplementation(() => true);

        const isArtifactDownloaded = await downloadArtifact(repository, branch, githubToken, downloadDir, installDir, os, compiler, testEnv);

        expect(isArtifactDownloaded).toBe(true);
        expect(core.info).toHaveBeenCalledWith(`==> Found ${dependenciesPath}`);

        Octokit.prototype.constructor.mockReset();
        AdmZip.prototype.constructor.mockReset();
        existsSync.mockReset();
        readFileSync.mockReset();
        unlinkSync.mockReset();
    });

    it('looks for differently named artifact in case of ecbuild', async () => {
        expect.assertions(2);

        const testEnv = {
            ...env,
        };

        const ecbuildArtifactName = `ecbuild-${os}-cmake-${testEnv.CMAKE_VERSION}-${headSha}`;

        Octokit.prototype.constructor.mockImplementation(() => ({
            request: (route) => {
                switch (route) {
                case 'GET /repos/{owner}/{repo}/actions/workflows/{workflow_id}/runs':
                    return resolveWorkflowRuns();
                case 'GET /repos/{owner}/{repo}/actions/runs/{run_id}/artifacts':
                    return resolveWorkflowRunArtifacts(ecbuildArtifactName);
                case 'GET /repos/{owner}/{repo}/git/ref/{ref}':
                    return resolveHeadSha();
                case 'GET /repos/{owner}/{repo}/actions/artifacts/{artifact_id}/{archive_format}':
                    return resolveArtifactDownload();
                }
            },
        }));

        AdmZip.prototype.constructor.mockImplementation(() => ({
            getEntries,
            extractAllTo,
        }));

        const unlinkSync = jest.spyOn(fs, 'unlinkSync');
        unlinkSync.mockImplementation(() => true);

        const isArtifactDownloaded = await downloadArtifact('ecmwf/ecbuild', branch, githubToken, downloadDir, installDir, os, compiler, testEnv);

        expect(isArtifactDownloaded).toBe(true);
        expect(core.info).toHaveBeenCalledWith(`==> artifactName: ${ecbuildArtifactName}`);

        Octokit.prototype.constructor.mockReset();
        AdmZip.prototype.constructor.mockReset();
        unlinkSync.mockReset();
    });

    it('returns false if no completed workflow runs were found', async () => {
        expect.assertions(2);

        const testEnv = {
            ...env,
        };

        Octokit.prototype.constructor.mockImplementation(() => ({
            request: (route) => {
                switch (route) {
                case 'GET /repos/{owner}/{repo}/actions/workflows/{workflow_id}/runs':
                    return Promise.resolve({
                        status: 200,
                        data: {
                            workflow_runs: [
                                {
                                    id: runId,
                                    status: 'in_progress',
                                    conclusion: 'neutral',
                                },
                            ],
                        },
                    });
                }
            },
        }));

        AdmZip.prototype.constructor.mockImplementation(() => ({
            getEntries,
            extractAllTo,
        }));

        const unlinkSync = jest.spyOn(fs, 'unlinkSync');
        unlinkSync.mockImplementation(() => true);

        const isArtifactDownloaded = await downloadArtifact('ecmwf/ecbuild', branch, githubToken, downloadDir, installDir, os, compiler, testEnv);

        expect(isArtifactDownloaded).toBe(false);
        expect(core.warning).toHaveBeenCalledWith('No completed successful workflow runs found');

        Octokit.prototype.constructor.mockReset();
        AdmZip.prototype.constructor.mockReset();
        unlinkSync.mockReset();
    });

    it('returns false if no successful workflow runs were found', async () => {
        expect.assertions(2);

        const testEnv = {
            ...env,
        };

        Octokit.prototype.constructor.mockImplementation(() => ({
            request: (route) => {
                switch (route) {
                case 'GET /repos/{owner}/{repo}/actions/workflows/{workflow_id}/runs':
                    return Promise.resolve({
                        status: 200,
                        data: {
                            workflow_runs: [
                                {
                                    id: runId,
                                    status: 'completed',
                                    conclusion: 'failure',
                                },
                            ],
                        },
                    });
                }
            },
        }));

        AdmZip.prototype.constructor.mockImplementation(() => ({
            getEntries,
            extractAllTo,
        }));

        const unlinkSync = jest.spyOn(fs, 'unlinkSync');
        unlinkSync.mockImplementation(() => true);

        const isArtifactDownloaded = await downloadArtifact('ecmwf/ecbuild', branch, githubToken, downloadDir, installDir, os, compiler, testEnv);

        expect(isArtifactDownloaded).toBe(false);
        expect(core.warning).toHaveBeenCalledWith('No completed successful workflow runs found');

        Octokit.prototype.constructor.mockReset();
        AdmZip.prototype.constructor.mockReset();
        unlinkSync.mockReset();
    });

    it('returns false if request for workflow runs errors out', async () => {
        expect.assertions(2);

        const testEnv = {
            ...env,
        };

        Octokit.prototype.constructor.mockImplementation(() => ({
            request: (route) => {
                switch (route) {
                case 'GET /repos/{owner}/{repo}/actions/workflows/{workflow_id}/runs':
                    return Promise.resolve({
                        status: errorStatusCode,
                    });
                }
            },
        }));

        const isArtifactDownloaded = await downloadArtifact(repository, branch, githubToken, downloadDir, installDir, os, compiler, testEnv);

        expect(isArtifactDownloaded).toBe(false);
        expect(core.warning).toHaveBeenCalledWith(`Wrong response code while fetching workflow runs: ${errorStatusCode}`);

        Octokit.prototype.constructor.mockReset();
    });

    it('returns false if no workflow runs were found', async () => {
        expect.assertions(2);

        const testEnv = {
            ...env,
        };

        Octokit.prototype.constructor.mockImplementation(() => ({
            request: (route) => {
                switch (route) {
                case 'GET /repos/{owner}/{repo}/actions/workflows/{workflow_id}/runs':
                    return Promise.resolve({
                        status: 200,
                        data: {
                            workflow_runs: [],
                        },
                    });
                }
            },
        }));

        const isArtifactDownloaded = await downloadArtifact(repository, branch, githubToken, downloadDir, installDir, os, compiler, testEnv);

        expect(isArtifactDownloaded).toBe(false);
        expect(core.warning).toHaveBeenCalledWith('No workflow runs found');

        Octokit.prototype.constructor.mockReset();
    });

    it('returns false if request for workflow runs fails', async () => {
        expect.assertions(2);

        const testEnv = {
            ...env,
        };

        Octokit.prototype.constructor.mockImplementation(() => ({
            request: (route) => {
                switch (route) {
                case 'GET /repos/{owner}/{repo}/actions/workflows/{workflow_id}/runs':
                    throw Error(errorMessage);
                }
            },
        }));

        const isArtifactDownloaded = await downloadArtifact(repository, branch, githubToken, downloadDir, installDir, os, compiler, testEnv);

        expect(isArtifactDownloaded).toBe(false);
        expect(core.warning).toHaveBeenCalledWith(`Error fetching workflow runs: ${errorMessage}`);

        Octokit.prototype.constructor.mockReset();
    });

    it('returns false if request for workflow artifacts errors out', async () => {
        expect.assertions(2);

        const testEnv = {
            ...env,
        };

        Octokit.prototype.constructor.mockImplementation(() => ({
            request: (route) => {
                switch (route) {
                case 'GET /repos/{owner}/{repo}/actions/workflows/{workflow_id}/runs':
                    return resolveWorkflowRuns();
                case 'GET /repos/{owner}/{repo}/actions/runs/{run_id}/artifacts':
                    return Promise.resolve({
                        status: errorStatusCode,
                    });
                }
            },
        }));

        const isArtifactDownloaded = await downloadArtifact(repository, branch, githubToken, downloadDir, installDir, os, compiler, testEnv);

        expect(isArtifactDownloaded).toBe(false);
        expect(core.warning).toHaveBeenCalledWith(`Wrong response code while fetching workflow run artifacts: ${errorStatusCode}`);

        Octokit.prototype.constructor.mockReset();
    });

    it('returns false if request for workflow artifacts fails', async () => {
        expect.assertions(2);

        const testEnv = {
            ...env,
        };

        Octokit.prototype.constructor.mockImplementation(() => ({
            request: (route) => {
                switch (route) {
                case 'GET /repos/{owner}/{repo}/actions/workflows/{workflow_id}/runs':
                    return resolveWorkflowRuns();
                case 'GET /repos/{owner}/{repo}/actions/runs/{run_id}/artifacts':
                    throw Error(errorMessage);
                }
            },
        }));

        const isArtifactDownloaded = await downloadArtifact(repository, branch, githubToken, downloadDir, installDir, os, compiler, testEnv);

        expect(isArtifactDownloaded).toBe(false);
        expect(core.warning).toHaveBeenCalledWith(`Error fetching workflow run artifacts: ${errorMessage}`);

        Octokit.prototype.constructor.mockReset();
    });

    it('returns false if no workflow artifacts are found', async () => {
        expect.assertions(2);

        const testEnv = {
            ...env,
        };

        Octokit.prototype.constructor.mockImplementation(() => ({
            request: (route) => {
                switch (route) {
                case 'GET /repos/{owner}/{repo}/actions/workflows/{workflow_id}/runs':
                    return resolveWorkflowRuns();
                case 'GET /repos/{owner}/{repo}/actions/runs/{run_id}/artifacts':
                    return Promise.resolve({
                        status: 200,
                        data: {
                            artifacts: [],
                        },
                    });
                }
            },
        }));

        const isArtifactDownloaded = await downloadArtifact(repository, branch, githubToken, downloadDir, installDir, os, compiler, testEnv);

        expect(isArtifactDownloaded).toBe(false);
        expect(core.warning).toHaveBeenCalledWith('No workflow artifacts found');

        Octokit.prototype.constructor.mockReset();
    });

    it('returns false if repository HEAD state does not match', async () => {
        expect.assertions(2);

        const newSha = 'da39a3ee5e6b4b0d3255bfef95601890afd80709';

        const testEnv = {
            ...env,
        };

        Octokit.prototype.constructor.mockImplementation(() => ({
            request: (route) => {
                switch (route) {
                case 'GET /repos/{owner}/{repo}/actions/workflows/{workflow_id}/runs':
                    return resolveWorkflowRuns();
                case 'GET /repos/{owner}/{repo}/actions/runs/{run_id}/artifacts':
                    return resolveWorkflowRunArtifacts(artifactName);
                case 'GET /repos/{owner}/{repo}/git/ref/{ref}':
                    return Promise.resolve({
                        status: 200,
                        data: {
                            object: {
                                sha: newSha,
                            },
                        },
                    });
                case 'GET /repos/{owner}/{repo}/actions/artifacts/{artifact_id}/{archive_format}':
                    return resolveArtifactDownload();
                }
            },
        }));

        AdmZip.prototype.constructor.mockImplementation(() => ({
            getEntries,
            extractAllTo,
        }));

        const unlinkSync = jest.spyOn(fs, 'unlinkSync');
        unlinkSync.mockImplementation(() => true);

        const isArtifactDownloaded = await downloadArtifact(repository, branch, githubToken, downloadDir, installDir, os, compiler, testEnv);

        expect(isArtifactDownloaded).toBe(false);
        expect(core.warning).toHaveBeenCalledWith(`No suitable artifact found: ${repo}-${os}-${compiler}-${newSha}`);

        Octokit.prototype.constructor.mockReset();
        AdmZip.prototype.constructor.mockReset();
        unlinkSync.mockReset();
    });

    it('returns false if no artifacts with expected name were found', async () => {
        expect.assertions(2);

        const testEnv = {
            ...env,
        };

        Octokit.prototype.constructor.mockImplementation(() => ({
            request: (route) => {
                switch (route) {
                case 'GET /repos/{owner}/{repo}/actions/workflows/{workflow_id}/runs':
                    return resolveWorkflowRuns();
                case 'GET /repos/{owner}/{repo}/actions/runs/{run_id}/artifacts':
                    return resolveWorkflowRunArtifacts(artifactName);
                case 'GET /repos/{owner}/{repo}/git/ref/{ref}':
                    return resolveHeadSha();
                }
            },
        }));

        AdmZip.prototype.constructor.mockImplementation(() => ({
            getEntries,
            extractAllTo,
        }));

        const unlinkSync = jest.spyOn(fs, 'unlinkSync');
        unlinkSync.mockImplementation(() => true);

        const isArtifactDownloaded = await downloadArtifact('ecmwf/ecbuild', branch, githubToken, downloadDir, installDir, os, compiler, testEnv);

        expect(isArtifactDownloaded).toBe(false);
        expect(core.warning).toHaveBeenCalledWith(`No suitable artifact found: ecbuild-${os}-cmake-${testEnv.CMAKE_VERSION}-${headSha}`);

        Octokit.prototype.constructor.mockReset();
        AdmZip.prototype.constructor.mockReset();
        unlinkSync.mockReset();
    });

    it('returns false if request for repository HEAD runs errors out', async () => {
        expect.assertions(2);

        const testEnv = {
            ...env,
        };

        Octokit.prototype.constructor.mockImplementation(() => ({
            request: (route) => {
                switch (route) {
                case 'GET /repos/{owner}/{repo}/actions/workflows/{workflow_id}/runs':
                    return resolveWorkflowRuns();
                case 'GET /repos/{owner}/{repo}/actions/runs/{run_id}/artifacts':
                    return resolveWorkflowRunArtifacts(artifactName);
                case 'GET /repos/{owner}/{repo}/git/ref/{ref}':
                    return Promise.resolve({
                        status: errorStatusCode,
                    });
                }
            },
        }));

        const isArtifactDownloaded = await downloadArtifact(repository, branch, githubToken, downloadDir, installDir, os, compiler, testEnv);

        expect(isArtifactDownloaded).toBe(false);
        expect(core.warning).toHaveBeenCalledWith(`Wrong response code while fetching repository HEAD: ${errorStatusCode}`);

        Octokit.prototype.constructor.mockReset();
    });

    it('returns false if request for repository HEAD runs fails', async () => {
        expect.assertions(2);

        const testEnv = {
            ...env,
        };

        Octokit.prototype.constructor.mockImplementation(() => ({
            request: (route) => {
                switch (route) {
                case 'GET /repos/{owner}/{repo}/actions/workflows/{workflow_id}/runs':
                    return resolveWorkflowRuns();
                case 'GET /repos/{owner}/{repo}/actions/runs/{run_id}/artifacts':
                    return resolveWorkflowRunArtifacts(artifactName);
                case 'GET /repos/{owner}/{repo}/git/ref/{ref}':
                    throw Error(errorMessage);
                }
            },
        }));

        const isArtifactDownloaded = await downloadArtifact(repository, branch, githubToken, downloadDir, installDir, os, compiler, testEnv);

        expect(isArtifactDownloaded).toBe(false);
        expect(core.warning).toHaveBeenCalledWith(`Error getting repository HEAD: ${errorMessage}`);

        Octokit.prototype.constructor.mockReset();
    });

    it('returns false if request for downloading workflow run artifact errors out', async () => {
        expect.assertions(2);

        const testEnv = {
            ...env,
        };

        Octokit.prototype.constructor.mockImplementation(() => ({
            request: (route) => {
                switch (route) {
                case 'GET /repos/{owner}/{repo}/actions/workflows/{workflow_id}/runs':
                    return resolveWorkflowRuns();
                case 'GET /repos/{owner}/{repo}/actions/runs/{run_id}/artifacts':
                    return resolveWorkflowRunArtifacts(artifactName);
                case 'GET /repos/{owner}/{repo}/git/ref/{ref}':
                    return resolveHeadSha();
                case 'GET /repos/{owner}/{repo}/actions/artifacts/{artifact_id}/{archive_format}':
                    return Promise.resolve({
                        status: errorStatusCode,
                    });
                }
            },
        }));

        const isArtifactDownloaded = await downloadArtifact(repository, branch, githubToken, downloadDir, installDir, os, compiler, testEnv);

        expect(isArtifactDownloaded).toBe(false);
        expect(core.warning).toHaveBeenCalledWith(`Wrong response code while downloading workflow run artifact: ${errorStatusCode}`);

        Octokit.prototype.constructor.mockReset();
    });

    it('returns false if request for downloading workflow run artifact fails', async () => {
        expect.assertions(2);

        const testEnv = {
            ...env,
        };

        Octokit.prototype.constructor.mockImplementation(() => ({
            request: (route) => {
                switch (route) {
                case 'GET /repos/{owner}/{repo}/actions/workflows/{workflow_id}/runs':
                    return resolveWorkflowRuns();
                case 'GET /repos/{owner}/{repo}/actions/runs/{run_id}/artifacts':
                    return resolveWorkflowRunArtifacts(artifactName);
                case 'GET /repos/{owner}/{repo}/git/ref/{ref}':
                    return resolveHeadSha();
                case 'GET /repos/{owner}/{repo}/actions/artifacts/{artifact_id}/{archive_format}':
                    throw Error(errorMessage);
                }
            },
        }));

        const isArtifactDownloaded = await downloadArtifact(repository, branch, githubToken, downloadDir, installDir, os, compiler, testEnv);

        expect(isArtifactDownloaded).toBe(false);
        expect(core.warning).toHaveBeenCalledWith(`Error downloading workflow run artifact: ${errorMessage}`);

        Octokit.prototype.constructor.mockReset();
    });

    it('returns false if extracting artifact TAR fails', async () => {
        expect.assertions(2);

        const testEnv = {
            ...env,
        };

        Octokit.prototype.constructor.mockImplementation(() => ({
            request: (route) => {
                switch (route) {
                case 'GET /repos/{owner}/{repo}/actions/workflows/{workflow_id}/runs':
                    return resolveWorkflowRuns();
                case 'GET /repos/{owner}/{repo}/actions/runs/{run_id}/artifacts':
                    return resolveWorkflowRunArtifacts(artifactName);
                case 'GET /repos/{owner}/{repo}/git/ref/{ref}':
                    return resolveHeadSha();
                case 'GET /repos/{owner}/{repo}/actions/artifacts/{artifact_id}/{archive_format}':
                    return resolveArtifactDownload();
                }
            },
        }));

        AdmZip.prototype.constructor.mockImplementation(() => ({
            getEntries,
            extractAllTo,
        }));

        tar.x.mockImplementation(() => {
            throw new Error(errorMessage);
        });

        const isArtifactDownloaded = await downloadArtifact(repository, branch, githubToken, downloadDir, installDir, os, compiler, testEnv);

        expect(isArtifactDownloaded).toBe(false);
        expect(core.warning).toHaveBeenCalledWith(`Error extracting artifact TAR: ${errorMessage}`);

        Octokit.prototype.constructor.mockReset();
        AdmZip.prototype.constructor.mockReset();
        tar.x.mockReset();
    });

    it('returns false if dependencies do not match', async () => {
        expect.assertions(3);

        const dependency1 = 'owner/repo1';
        const dependency1Sha = 'de9f2c7fd25e1b3afad3e85a0bd17d9b100db4b3';
        const dependency2 = 'owner/repo2';
        const dependency2OldSha = '2fd4e1c67a2d28fced849ee1bb76e7391b93eb12';
        const dependency2NewSha = 'da39a3ee5e6b4b0d3255bfef95601890afd80709';

        const testEnv = {
            ...env,
            DEPENDENCIES: {
                [dependency1]: dependency1Sha,
                [dependency2]: dependency2NewSha,
            },
        };

        Octokit.prototype.constructor.mockImplementation(() => ({
            request: (route) => {
                switch (route) {
                case 'GET /repos/{owner}/{repo}/actions/workflows/{workflow_id}/runs':
                    return resolveWorkflowRuns();
                case 'GET /repos/{owner}/{repo}/actions/runs/{run_id}/artifacts':
                    return resolveWorkflowRunArtifacts(artifactName);
                case 'GET /repos/{owner}/{repo}/git/ref/{ref}':
                    return resolveHeadSha();
                case 'GET /repos/{owner}/{repo}/actions/artifacts/{artifact_id}/{archive_format}':
                    return resolveArtifactDownload();
                }
            },
        }));

        AdmZip.prototype.constructor.mockImplementation(() => ({
            getEntries,
            extractAllTo,
        }));

        const existsSync = jest.spyOn(fs, 'existsSync');
        existsSync.mockImplementation((path) => {
            if (path === dependenciesPath) return true;
        });

        const readFileSync = jest.spyOn(fs, 'readFileSync');
        readFileSync.mockImplementation((path) => {
            if (path === dependenciesPath) return JSON.stringify({
                [dependency1]: dependency1Sha,
                [dependency2]: dependency2OldSha,
            });
        });

        const unlinkSync = jest.spyOn(fs, 'unlinkSync');
        unlinkSync.mockImplementation(() => true);

        const isArtifactDownloaded = await downloadArtifact(repository, branch, githubToken, downloadDir, installDir, os, compiler, testEnv);

        expect(isArtifactDownloaded).toBe(false);
        expect(core.info).toHaveBeenCalledWith(`==> Found ${dependenciesPath}`);
        expect(core.warning).toHaveBeenCalledWith(`Error matching dependency ${dependency2}: ${dependency2NewSha} !== ${dependency2OldSha}`);

        Octokit.prototype.constructor.mockReset();
        AdmZip.prototype.constructor.mockReset();
        existsSync.mockReset();
        readFileSync.mockReset();
        unlinkSync.mockReset();
    });

    it('extends environment object with install paths and dependency', async () => {
        expect.assertions(2);

        const testEnv = {
            ...env,
        };

        const expectedEnv = {
            ...testEnv,
            PATH: `${installDir}/bin:${process.env.PATH}`,
            BIN_PATH: `${installDir}/bin`,
            INCLUDE_PATH: `${installDir}/include`,
            INSTALL_PATH: installDir,
            LIB_PATH: `${installDir}/lib`,
            DEPENDENCIES: {
                [repository]: headSha,
            },
        };

        Octokit.prototype.constructor.mockImplementation(() => ({
            request: (route) => {
                switch (route) {
                case 'GET /repos/{owner}/{repo}/actions/workflows/{workflow_id}/runs':
                    return resolveWorkflowRuns();
                case 'GET /repos/{owner}/{repo}/actions/runs/{run_id}/artifacts':
                    return resolveWorkflowRunArtifacts(artifactName);
                case 'GET /repos/{owner}/{repo}/git/ref/{ref}':
                    return resolveHeadSha();
                case 'GET /repos/{owner}/{repo}/actions/artifacts/{artifact_id}/{archive_format}':
                    return resolveArtifactDownload();
                }
            },
        }));

        AdmZip.prototype.constructor.mockImplementation(() => ({
            getEntries,
            extractAllTo,
        }));

        const unlinkSync = jest.spyOn(fs, 'unlinkSync');
        unlinkSync.mockImplementation(() => true);

        const isArtifactDownloaded = await downloadArtifact(repository, branch, githubToken, downloadDir, installDir, os, compiler, testEnv);

        expect(isArtifactDownloaded).toBe(true);
        expect(testEnv).toStrictEqual(expectedEnv);

        Octokit.prototype.constructor.mockReset();
        AdmZip.prototype.constructor.mockReset();
        unlinkSync.mockReset();
    });
});
