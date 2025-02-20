import process from "process";
import fs from "fs";
import { Buffer } from "buffer";
import * as core from "@actions/core";
import { Octokit } from "@octokit/core";
import AdmZip from "adm-zip";
import { filesize } from "filesize";
import tar from "tar";
import { describe, it, expect, vi } from "vitest";

import downloadArtifact from "../src/download-artifact";
import { EnvironmentVariables } from "../src/types/env-functions";
import { getCacheKeyHash } from "../src/cache-functions";

vi.mock("@actions/core");
vi.mock("@actions/io");
vi.mock("@octokit/core");
vi.mock("adm-zip");
vi.mock("tar");

const getArtifactName = (
    repo: string,
    os: string,
    compiler: string,
    cacheSuffix: string,
    env: EnvironmentVariables,
    cmakeOptions: string,
    headSha: string,
) => {
    const cacheKeySha = getCacheKeyHash(
        repo,
        cacheSuffix,
        env,
        {},
        cmakeOptions,
        headSha,
    );
    return `${os}-${compiler}-${repo}-${cacheKeySha}`;
};

// Base environment object, we will take care not to modify it.
const env = {
    CC: "gcc-12",
    CXX: "g++-12",
    FC: "gfortran-12",
    CMAKE_VERSION: "3.31.5",
};

// Test parameters.
const repository = "owner/repo";
const packageName = "repo";
const repo = "repo";
const branch = "develop";
const githubToken = "12345";
const downloadDir = "/path/to/download/repo";
const installDir = "/path/to/install/repo";
const os = "ubuntu-24.04";
const compiler = "gnu-12";
const headSha = "f0b00fd201c7ddf14e1572a10d5fb4577c4bd6a2";
const cmakeOptions =
    "-DENABLE_MPI=OFF -DENABLE_TF_LITE=ON -DTENSORFLOWLITE_PATH=$TENSORFLOW_PATH -DTENSORFLOWLITE_ROOT=$TFLITE_PATH -DENABLE_ONNX=ON -DONNX_ROOT=$ONNXRUNTIME_PATH -DENABLE_TENSORRT=OFF";
const cacheSuffix = "";
const artifactName = getArtifactName(
    repo,
    os,
    compiler,
    cacheSuffix,
    env,
    cmakeOptions,
    headSha,
);
const artifactId = 987654321;
const artifactSize = 68168435;
const artifactPath = `${downloadDir}/${artifactName}`;
const tarPath = `${artifactPath}/${artifactName}.tar`;
const dependenciesPath = `${artifactPath}/${artifactName}-dependencies.json`;
const errorStatusCode = 500;
const errorObject = new Error("Oops!");
const emptyObject = {};

const resolveWorkflowRunArtifacts = (
    targetArtifactName: string,
): Promise<Record<string, unknown>> =>
    Promise.resolve({
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

const resolveHeadSha = () =>
    Promise.resolve({
        status: 200,
        data: {
            object: {
                sha: headSha,
            },
        },
    });

const resolveArtifactDownload = () =>
    Promise.resolve({
        status: 200,
        data: Buffer.allocUnsafe(4096),
    });

const getEntries = () => [
    {
        isDirectory: true,
        entryName: "dir",
    },
    {
        isDirectory: false,
        entryName: "dir/file1",
    },
    {
        isDirectory: false,
        entryName: "dir/file2",
    },
    {
        isDirectory: true,
        entryName: "dir/subdir",
    },
    {
        isDirectory: false,
        entryName: "dir/subdir/file3",
    },
    {
        isDirectory: false,
        entryName: "file4",
    },
];

const extractAllTo = vi.fn();

describe("downloadArtifact", () => {
    it("returns true on success", async () => {
        expect.assertions(18);

        const testEnv = {
            ...env,
        };

        (Octokit.prototype.constructor as vi.Mock).mockImplementation(
            (options: { auth: string }) => {
                if (!options.auth)
                    throw Error(
                        `Octokit authentication missing, did you pass the auth key?`,
                    );

                return {
                    request: (route: string) => {
                        switch (route) {
                            case "GET /repos/{owner}/{repo}/actions/artifacts":
                                return resolveWorkflowRunArtifacts(
                                    artifactName,
                                );
                            case "GET /repos/{owner}/{repo}/git/ref/{ref}":
                                return resolveHeadSha();
                            case "GET /repos/{owner}/{repo}/actions/artifacts/{artifact_id}/{archive_format}":
                                return resolveArtifactDownload();
                        }
                    },
                };
            },
        );

        (AdmZip.prototype.constructor as vi.Mock).mockImplementationOnce(
            () => ({
                getEntries,
                extractAllTo,
            }),
        );

        const existsSync = vi.spyOn(fs, "existsSync");
        existsSync.mockImplementationOnce((path: string) => {
            if (path === dependenciesPath) return false;
            return true;
        });

        const unlinkSync = vi.spyOn(fs, "unlinkSync");
        unlinkSync.mockImplementationOnce(() => true);

        const isArtifactDownloaded = await downloadArtifact(
            repository,
            packageName,
            branch,
            githubToken,
            downloadDir,
            installDir,
            os,
            compiler,
            testEnv,
            {},
            cacheSuffix,
            cmakeOptions,
        );

        expect(isArtifactDownloaded).toBe(true);
        expect(core.info).toHaveBeenCalledWith(`==> Repository: ${repository}`);
        expect(core.info).toHaveBeenCalledWith(`==> Branch: ${branch}`);
        expect(core.info).toHaveBeenCalledWith("==> Artifacts: 3");
        expect(core.info).toHaveBeenCalledWith(`==> headSha: ${headSha}`);
        expect(core.info).toHaveBeenCalledWith(
            `==> artifactName: ${artifactName}`,
        );
        expect(core.info).toHaveBeenCalledWith(`==> artifactId: ${artifactId}`);
        expect(core.info).toHaveBeenCalledWith(
            `==> Downloaded: ${artifactName}.zip (${filesize(artifactSize)})`,
        );
        expect(core.info).toHaveBeenCalledWith(
            `==> Extracted artifact ZIP archive to ${artifactPath}`,
        );
        expect(core.info).toHaveBeenCalledWith(
            `==> Extracted artifact TAR to ${installDir}`,
        );
        expect(extractAllTo).toHaveBeenCalledWith(artifactPath, true);
        expect(unlinkSync).toHaveBeenCalledWith(tarPath);

        getEntries().forEach((entry) => {
            const action = entry.isDirectory ? "creating" : "inflating";
            const filepath = `${artifactPath}/${entry.entryName}`;

            expect(core.info).toHaveBeenCalledWith(`  ${action}: ${filepath}`);
        });
    });

    it("returns true if dependencies match", async () => {
        expect.assertions(2);

        const dependency1 = "owner/repo1";
        const dependency1Sha = "de9f2c7fd25e1b3afad3e85a0bd17d9b100db4b3";
        const dependency2 = "owner/repo2";
        const dependency2Sha = "2fd4e1c67a2d28fced849ee1bb76e7391b93eb12";

        const testEnv = {
            ...env,
            DEPENDENCIES: {
                [dependency1]: dependency1Sha,
                [dependency2]: dependency2Sha,
            },
        };

        const artifactName = getArtifactName(
            repo,
            os,
            compiler,
            cacheSuffix,
            testEnv,
            cmakeOptions,
            headSha,
        );
        const artifactPath = `${downloadDir}/${artifactName}`;
        const dependenciesPath = `${artifactPath}/${artifactName}-dependencies.json`;

        (Octokit.prototype.constructor as vi.Mock).mockImplementation(() => ({
            request: (route: string) => {
                switch (route) {
                    case "GET /repos/{owner}/{repo}/actions/artifacts":
                        return resolveWorkflowRunArtifacts(artifactName);
                    case "GET /repos/{owner}/{repo}/git/ref/{ref}":
                        return resolveHeadSha();
                    case "GET /repos/{owner}/{repo}/actions/artifacts/{artifact_id}/{archive_format}":
                        return resolveArtifactDownload();
                }
            },
        }));

        (AdmZip.prototype.constructor as vi.Mock).mockImplementationOnce(
            () => ({
                getEntries,
                extractAllTo,
            }),
        );

        const existsSync = vi.spyOn(fs, "existsSync");
        existsSync.mockImplementationOnce((path) => {
            if (path === dependenciesPath) return true;
            return false;
        });

        const readFileSync = vi.spyOn(fs, "readFileSync");
        readFileSync.mockImplementationOnce((path) => {
            if (path === dependenciesPath)
                return JSON.stringify({
                    [dependency1]: dependency1Sha,
                    [dependency2]: dependency2Sha,
                });
            return "";
        });

        const unlinkSync = vi.spyOn(fs, "unlinkSync");
        unlinkSync.mockImplementation(() => true);

        const isArtifactDownloaded = await downloadArtifact(
            repository,
            packageName,
            branch,
            githubToken,
            downloadDir,
            installDir,
            os,
            compiler,
            testEnv,
            {},
            cacheSuffix,
            cmakeOptions,
        );

        expect(isArtifactDownloaded).toBe(true);
        expect(core.info).toHaveBeenCalledWith(`==> Found ${dependenciesPath}`);
    });

    it("looks for differently named artifact in case of ecbuild", async () => {
        expect.assertions(2);

        const testEnv = {
            ...env,
        };

        const ecbuildArtifactName = `ecbuild-${os}-cmake-${testEnv.CMAKE_VERSION}-${headSha}`;

        (Octokit.prototype.constructor as vi.Mock).mockImplementation(() => ({
            request: (route: string) => {
                switch (route) {
                    case "GET /repos/{owner}/{repo}/actions/artifacts":
                        return resolveWorkflowRunArtifacts(ecbuildArtifactName);
                    case "GET /repos/{owner}/{repo}/git/ref/{ref}":
                        return resolveHeadSha();
                    case "GET /repos/{owner}/{repo}/actions/artifacts/{artifact_id}/{archive_format}":
                        return resolveArtifactDownload();
                }
            },
        }));

        (AdmZip.prototype.constructor as vi.Mock).mockImplementationOnce(
            () => ({
                getEntries,
                extractAllTo,
            }),
        );

        const unlinkSync = vi.spyOn(fs, "unlinkSync");
        unlinkSync.mockImplementationOnce(() => true);

        const isArtifactDownloaded = await downloadArtifact(
            "ecmwf/ecbuild",
            "ecbuild",
            branch,
            githubToken,
            downloadDir,
            installDir,
            os,
            compiler,
            testEnv,
            {},
            cacheSuffix,
            cmakeOptions,
        );

        expect(isArtifactDownloaded).toBe(true);
        expect(core.info).toHaveBeenCalledWith(
            `==> artifactName: ${ecbuildArtifactName}`,
        );
    });

    it("returns false if request for workflow artifacts errors out", async () => {
        expect.assertions(2);

        const testEnv = {
            ...env,
        };

        (Octokit.prototype.constructor as vi.Mock).mockImplementation(() => ({
            request: (route: string) => {
                switch (route) {
                    case "GET /repos/{owner}/{repo}/actions/artifacts":
                        return Promise.resolve({
                            status: errorStatusCode,
                        });
                    case "GET /repos/{owner}/{repo}/git/ref/{ref}":
                        return resolveHeadSha();
                }
            },
        }));

        const isArtifactDownloaded = await downloadArtifact(
            repository,
            packageName,
            branch,
            githubToken,
            downloadDir,
            installDir,
            os,
            compiler,
            testEnv,
            {},
            cacheSuffix,
            cmakeOptions,
        );

        expect(isArtifactDownloaded).toBe(false);
        expect(core.warning).toHaveBeenCalledWith(
            `Wrong response code while fetching artifacts for ${repo}: ${errorStatusCode}`,
        );
    });

    it.each`
        error
        ${errorObject}
        ${emptyObject}
    `(
        "returns false if request for workflow artifacts fails ($error)",
        async ({ error }) => {
            expect.hasAssertions();

            const testEnv = {
                ...env,
            };

            (Octokit.prototype.constructor as vi.Mock).mockImplementation(
                () => ({
                    request: (route: string) => {
                        switch (route) {
                            case "GET /repos/{owner}/{repo}/actions/artifacts":
                                throw error;
                            case "GET /repos/{owner}/{repo}/git/ref/{ref}":
                                return resolveHeadSha();
                        }
                    },
                }),
            );

            const isArtifactDownloaded = await downloadArtifact(
                repository,
                packageName,
                branch,
                githubToken,
                downloadDir,
                installDir,
                os,
                compiler,
                testEnv,
                {},
                cacheSuffix,
                cmakeOptions,
            );

            expect(isArtifactDownloaded).toBe(false);

            if (!(error instanceof Error)) return;
            expect(core.warning).toHaveBeenCalledWith(
                `Error fetching artifacts for ${repo}: ${error.message}`,
            );
        },
    );

    it("returns false if no workflow artifacts are found", async () => {
        expect.assertions(2);

        const testEnv = {
            ...env,
        };

        (Octokit.prototype.constructor as vi.Mock).mockImplementation(() => ({
            request: (route: string) => {
                switch (route) {
                    case "GET /repos/{owner}/{repo}/actions/artifacts":
                        return Promise.resolve({
                            status: 200,
                            data: {
                                artifacts: [],
                            },
                        });
                    case "GET /repos/{owner}/{repo}/git/ref/{ref}":
                        return resolveHeadSha();
                }
            },
        }));

        const isArtifactDownloaded = await downloadArtifact(
            repository,
            packageName,
            branch,
            githubToken,
            downloadDir,
            installDir,
            os,
            compiler,
            testEnv,
            {},
            cacheSuffix,
            cmakeOptions,
        );

        expect(isArtifactDownloaded).toBe(false);
        expect(core.warning).toHaveBeenCalledWith(
            `No workflow artifacts found for ${repo}`,
        );
    });

    it("returns false if repository HEAD state does not match", async () => {
        expect.assertions(2);

        const newSha = "da39a3ee5e6b4b0d3255bfef95601890afd80709";

        const testEnv = {
            ...env,
        };

        (Octokit.prototype.constructor as vi.Mock).mockImplementation(() => ({
            request: (route: string) => {
                switch (route) {
                    case "GET /repos/{owner}/{repo}/actions/artifacts":
                        return resolveWorkflowRunArtifacts(artifactName);
                    case "GET /repos/{owner}/{repo}/git/ref/{ref}":
                        return Promise.resolve({
                            status: 200,
                            data: {
                                object: {
                                    sha: newSha,
                                },
                            },
                        });
                    case "GET /repos/{owner}/{repo}/actions/artifacts/{artifact_id}/{archive_format}":
                        return resolveArtifactDownload();
                }
            },
        }));

        (AdmZip.prototype.constructor as vi.Mock).mockImplementationOnce(
            () => ({
                getEntries,
                extractAllTo,
            }),
        );

        const unlinkSync = vi.spyOn(fs, "unlinkSync");
        unlinkSync.mockImplementationOnce(() => true);

        const isArtifactDownloaded = await downloadArtifact(
            repository,
            packageName,
            branch,
            githubToken,
            downloadDir,
            installDir,
            os,
            compiler,
            testEnv,
            {},
            cacheSuffix,
            cmakeOptions,
        );

        expect(isArtifactDownloaded).toBe(false);
        expect(core.warning).toHaveBeenCalledWith(
            `No suitable artifact found: ${getArtifactName(
                repo,
                os,
                compiler,
                cacheSuffix,
                env,
                cmakeOptions,
                newSha,
            )}`,
        );
    });

    it("returns false if no artifacts with expected name were found", async () => {
        expect.assertions(2);

        const testEnv = {
            ...env,
        };

        (Octokit.prototype.constructor as vi.Mock).mockImplementation(() => ({
            request: (route: string) => {
                switch (route) {
                    case "GET /repos/{owner}/{repo}/actions/artifacts":
                        return resolveWorkflowRunArtifacts(artifactName);
                    case "GET /repos/{owner}/{repo}/git/ref/{ref}":
                        return resolveHeadSha();
                }
            },
        }));

        (AdmZip.prototype.constructor as vi.Mock).mockImplementationOnce(
            () => ({
                getEntries,
                extractAllTo,
            }),
        );

        const unlinkSync = vi.spyOn(fs, "unlinkSync");
        unlinkSync.mockImplementationOnce(() => true);

        const isArtifactDownloaded = await downloadArtifact(
            "ecmwf/ecbuild",
            "ecbuild",
            branch,
            githubToken,
            downloadDir,
            installDir,
            os,
            compiler,
            testEnv,
            {},
            cacheSuffix,
            cmakeOptions,
        );

        expect(isArtifactDownloaded).toBe(false);
        expect(core.warning).toHaveBeenCalledWith(
            `No suitable artifact found: ecbuild-${os}-cmake-${testEnv.CMAKE_VERSION}-${headSha}`,
        );
    });

    it("returns false if request for repository HEAD runs errors out", async () => {
        expect.assertions(2);

        const testEnv = {
            ...env,
        };

        (Octokit.prototype.constructor as vi.Mock).mockImplementation(() => ({
            request: (route: string) => {
                switch (route) {
                    case "GET /repos/{owner}/{repo}/actions/artifacts":
                        return resolveWorkflowRunArtifacts(artifactName);
                    case "GET /repos/{owner}/{repo}/git/ref/{ref}":
                        return Promise.resolve({
                            status: errorStatusCode,
                        });
                }
            },
        }));

        const isArtifactDownloaded = await downloadArtifact(
            repository,
            packageName,
            branch,
            githubToken,
            downloadDir,
            installDir,
            os,
            compiler,
            testEnv,
            {},
            cacheSuffix,
            cmakeOptions,
        );

        expect(isArtifactDownloaded).toBe(false);
        expect(core.warning).toHaveBeenCalledWith(
            `Wrong response code while fetching repository HEAD for ${repo}: ${errorStatusCode}`,
        );
    });

    it.each`
        error
        ${errorObject}
        ${emptyObject}
    `(
        "returns false if request for repository HEAD fails ($error)",
        async ({ error }) => {
            expect.hasAssertions();

            const testEnv = {
                ...env,
            };

            (Octokit.prototype.constructor as vi.Mock).mockImplementation(
                () => ({
                    request: (route: string) => {
                        switch (route) {
                            case "GET /repos/{owner}/{repo}/actions/artifacts":
                                return resolveWorkflowRunArtifacts(
                                    artifactName,
                                );
                            case "GET /repos/{owner}/{repo}/git/ref/{ref}":
                                throw error;
                        }
                    },
                }),
            );

            const isArtifactDownloaded = await downloadArtifact(
                repository,
                packageName,
                branch,
                githubToken,
                downloadDir,
                installDir,
                os,
                compiler,
                testEnv,
                {},
                cacheSuffix,
                cmakeOptions,
            );

            expect(isArtifactDownloaded).toBe(false);

            if (!(error instanceof Error)) return;
            expect(core.warning).toHaveBeenCalledWith(
                `Error getting repository HEAD for ${repo}: ${error.message}`,
            );
        },
    );

    it.each`
        error
        ${errorObject}
        ${emptyObject}
    `(
        "returns false if extracting artifact TAR fails ($error)",
        async ({ error }) => {
            expect.hasAssertions();

            const testEnv = {
                ...env,
            };

            (Octokit.prototype.constructor as vi.Mock).mockImplementation(
                () => ({
                    request: (route: string) => {
                        switch (route) {
                            case "GET /repos/{owner}/{repo}/actions/artifacts":
                                return resolveWorkflowRunArtifacts(
                                    artifactName,
                                );
                            case "GET /repos/{owner}/{repo}/git/ref/{ref}":
                                return resolveHeadSha();
                            case "GET /repos/{owner}/{repo}/actions/artifacts/{artifact_id}/{archive_format}":
                                return resolveArtifactDownload();
                        }
                    },
                }),
            );

            (AdmZip.prototype.constructor as vi.Mock).mockImplementationOnce(
                () => ({
                    getEntries,
                    extractAllTo,
                }),
            );

            (tar.x as vi.Mock).mockImplementationOnce(() => {
                throw error;
            });

            const isArtifactDownloaded = await downloadArtifact(
                repository,
                packageName,
                branch,
                githubToken,
                downloadDir,
                installDir,
                os,
                compiler,
                testEnv,
                {},
                cacheSuffix,
                cmakeOptions,
            );

            expect(isArtifactDownloaded).toBe(false);

            if (!(error instanceof Error)) return;
            expect(core.warning).toHaveBeenCalledWith(
                `Error extracting artifact TAR for ${repo}: ${error.message}`,
            );
        },
    );

    it("returns false if dependencies do not match", async () => {
        expect.assertions(3);

        const dependency1 = "owner/repo1";
        const dependency1Sha = "de9f2c7fd25e1b3afad3e85a0bd17d9b100db4b3";
        const dependency2 = "owner/repo2";
        const dependency2OldSha = "2fd4e1c67a2d28fced849ee1bb76e7391b93eb12";
        const dependency2NewSha = "da39a3ee5e6b4b0d3255bfef95601890afd80709";

        const testEnv = {
            ...env,
            DEPENDENCIES: {
                [dependency1]: dependency1Sha,
                [dependency2]: dependency2NewSha,
            },
        };

        const artifactName = getArtifactName(
            repo,
            os,
            compiler,
            cacheSuffix,
            testEnv,
            cmakeOptions,
            headSha,
        );
        const artifactPath = `${downloadDir}/${artifactName}`;
        const dependenciesPath = `${artifactPath}/${artifactName}-dependencies.json`;

        (Octokit.prototype.constructor as vi.Mock).mockImplementation(() => ({
            request: (route: string) => {
                switch (route) {
                    case "GET /repos/{owner}/{repo}/actions/artifacts":
                        return resolveWorkflowRunArtifacts(artifactName);
                    case "GET /repos/{owner}/{repo}/git/ref/{ref}":
                        return resolveHeadSha();
                    case "GET /repos/{owner}/{repo}/actions/artifacts/{artifact_id}/{archive_format}":
                        return resolveArtifactDownload();
                }
            },
        }));

        (AdmZip.prototype.constructor as vi.Mock).mockImplementationOnce(
            () => ({
                getEntries,
                extractAllTo,
            }),
        );

        const existsSync = vi.spyOn(fs, "existsSync");
        existsSync.mockImplementationOnce((path) => {
            if (path === dependenciesPath) return true;
            return false;
        });

        const readFileSync = vi.spyOn(fs, "readFileSync");
        readFileSync.mockImplementationOnce((path) => {
            if (path === dependenciesPath)
                return JSON.stringify({
                    [dependency1]: dependency1Sha,
                    [dependency2]: dependency2OldSha,
                });
            return "";
        });

        const unlinkSync = vi.spyOn(fs, "unlinkSync");
        unlinkSync.mockImplementation(() => true);

        const isArtifactDownloaded = await downloadArtifact(
            repository,
            packageName,
            branch,
            githubToken,
            downloadDir,
            installDir,
            os,
            compiler,
            testEnv,
            {},
            cacheSuffix,
            cmakeOptions,
        );

        expect(isArtifactDownloaded).toBe(false);
        expect(core.info).toHaveBeenCalledWith(`==> Found ${dependenciesPath}`);
        expect(core.warning).toHaveBeenCalledWith(
            `Error matching dependency ${dependency2} for ${repo}: ${dependency2NewSha} !== ${dependency2OldSha}`,
        );
    });

    it("extends environment object with install paths and dependency", async () => {
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
            LIB_PATH: `${installDir}/lib:${installDir}/lib64`,
            [`${repo}_DIR`]: installDir,
            [`${repo.toUpperCase()}_DIR`]: installDir,
            [`${repo.toUpperCase()}_PATH`]: installDir,
            DEPENDENCIES: {
                [packageName]: headSha,
            },
        };

        (Octokit.prototype.constructor as vi.Mock).mockImplementation(() => ({
            request: (route: string) => {
                switch (route) {
                    case "GET /repos/{owner}/{repo}/actions/artifacts":
                        return resolveWorkflowRunArtifacts(artifactName);
                    case "GET /repos/{owner}/{repo}/git/ref/{ref}":
                        return resolveHeadSha();
                    case "GET /repos/{owner}/{repo}/actions/artifacts/{artifact_id}/{archive_format}":
                        return resolveArtifactDownload();
                }
            },
        }));

        (AdmZip.prototype.constructor as vi.Mock).mockImplementationOnce(
            () => ({
                getEntries,
                extractAllTo,
            }),
        );

        const unlinkSync = vi.spyOn(fs, "unlinkSync");
        unlinkSync.mockImplementationOnce(() => true);

        const isArtifactDownloaded = await downloadArtifact(
            repository,
            packageName,
            branch,
            githubToken,
            downloadDir,
            installDir,
            os,
            compiler,
            testEnv,
            {},
            cacheSuffix,
            cmakeOptions,
        );

        expect(isArtifactDownloaded).toBe(true);
        expect(testEnv).toStrictEqual(expectedEnv);
    });
});
