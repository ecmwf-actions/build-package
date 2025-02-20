import fs from "fs";
import * as core from "@actions/core";
import { Octokit } from "@octokit/core";
import { filesize } from "filesize";
import tar from "tar";
import { describe, it, expect, vi } from "vitest";

import downloadFile from "../src/download-file";
import downloadRepository from "../src/download-repository";

vi.mock("@actions/core");
vi.mock("@actions/http-client");
vi.mock("@actions/io");
vi.mock("@octokit/core");
vi.mock("tar");
vi.mock("../src/download-file");

// Test parameters.
const repository = "owner/repo";
const packageName = "repo";
const repo = "repo";
const branch = "develop";
const headSha = "f0b00fd201c7ddf14e1572a10d5fb4577c4bd6a2";
const githubToken = "12345";
const downloadDir = "/path/to/download";
const url = "https://foo.bar";
const size = 123456789;
const tarName = "repo.tar.gz";
const sourceDir = "/path/to/download/repo";
const errorStatusCode = 500;
const errorObject = new Error("Oops!");
const emptyObject = {};

const resolveHeadSha = () =>
    Promise.resolve({
        status: 200,
        data: {
            object: {
                sha: headSha,
            },
        },
    });

const resolveRepositoryDownloadUrl = () =>
    Promise.resolve({
        status: 200,
        url,
    });

// Base environment object, we will take care not to modify it.
const env = {
    CC: "gcc-10",
    CXX: "g++-10",
    FC: "gfortran-10",
    CMAKE_VERSION: "3.21.1",
};

describe("downloadRepository", () => {
    it("returns true on success", async () => {
        expect.assertions(7);

        const testEnv = {
            ...env,
        };

        (Octokit.prototype.constructor as vi.Mock).mockImplementation(
            (options: { auth: string }) => {
                if (!options.auth)
                    throw Error(
                        `Octokit authentication missing, did you pass the auth key?`
                    );

                return {
                    request: (route: string) => {
                        switch (route) {
                            case "GET /repos/{owner}/{repo}/git/ref/{ref}":
                                return resolveHeadSha();
                            case "GET /repos/{owner}/{repo}/tarball/{ref}":
                                return resolveRepositoryDownloadUrl();
                        }
                    },
                };
            }
        );

        (downloadFile as vi.Mock).mockResolvedValueOnce(undefined);

        const statSync = vi.spyOn(fs, "statSync");
        (statSync as vi.Mock).mockImplementationOnce(() => ({
            size,
        }));

        const unlinkSync = vi.spyOn(fs, "unlinkSync");
        (unlinkSync as vi.Mock).mockImplementationOnce(() => {
            return true;
        });

        const isRepositoryDownloaded = await downloadRepository(
            repository,
            packageName,
            branch,
            githubToken,
            downloadDir,
            testEnv
        );

        expect(isRepositoryDownloaded).toBe(true);
        expect(core.info).toHaveBeenCalledWith(`==> Repository: ${repository}`);
        expect(core.info).toHaveBeenCalledWith(`==> Branch: ${branch}`);
        expect(core.info).toHaveBeenCalledWith(`==> Ref: heads/${branch}`);
        expect(core.info).toHaveBeenCalledWith(`==> URL: ${url}`);
        expect(core.info).toHaveBeenCalledWith(
            `==> Downloaded: ${tarName} (${filesize(size)})`
        );
        expect(core.info).toHaveBeenCalledWith(
            `==> Extracted ${tarName} to ${sourceDir}`
        );
    });

    it("supports tags", async () => {
        expect.assertions(3);

        const testEnv = {
            ...env,
        };

        const testTag = "1.0.0";
        const testBranch = `refs/tags/${testTag}`;

        (Octokit.prototype.constructor as vi.Mock).mockImplementation(() => ({
            request: (route: string) => {
                switch (route) {
                    case "GET /repos/{owner}/{repo}/git/ref/{ref}":
                        return resolveHeadSha();
                    case "GET /repos/{owner}/{repo}/tarball/{ref}":
                        return resolveRepositoryDownloadUrl();
                }
            },
        }));

        (downloadFile as vi.Mock).mockResolvedValueOnce(undefined);

        const statSync = vi.spyOn(fs, "statSync");
        (statSync as vi.Mock).mockImplementationOnce(() => ({
            size,
        }));

        const unlinkSync = vi.spyOn(fs, "unlinkSync");
        (unlinkSync as vi.Mock).mockImplementationOnce(() => {
            return true;
        });

        const isRepositoryDownloaded = await downloadRepository(
            repository,
            packageName,
            testBranch,
            githubToken,
            downloadDir,
            testEnv
        );

        expect(isRepositoryDownloaded).toBe(true);
        expect(core.info).toHaveBeenCalledWith(`==> Branch: ${testTag}`);
        expect(core.info).toHaveBeenCalledWith(`==> Ref: tags/${testTag}`);
    });

    it("returns false if request for repository HEAD errors out", async () => {
        expect.assertions(2);

        const testEnv = {
            ...env,
        };

        (Octokit.prototype.constructor as vi.Mock).mockImplementationOnce(
            () => ({
                request: (route: string) => {
                    switch (route) {
                        case "GET /repos/{owner}/{repo}/git/ref/{ref}":
                            return Promise.resolve({
                                status: errorStatusCode,
                            });
                    }
                },
            })
        );

        const isRepositoryDownloaded = await downloadRepository(
            repository,
            packageName,
            branch,
            githubToken,
            downloadDir,
            testEnv
        );

        expect(isRepositoryDownloaded).toBe(false);
        expect(core.warning).toHaveBeenCalledWith(
            `Wrong response code while fetching repository HEAD for ${repo}: ${errorStatusCode}`
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

            (Octokit.prototype.constructor as vi.Mock).mockImplementationOnce(
                () => ({
                    request: (route: string) => {
                        switch (route) {
                            case "GET /repos/{owner}/{repo}/git/ref/{ref}":
                                throw error;
                        }
                    },
                })
            );

            const isRepositoryDownloaded = await downloadRepository(
                repository,
                packageName,
                branch,
                githubToken,
                downloadDir,
                testEnv
            );

            expect(isRepositoryDownloaded).toBe(false);

            if (!(error instanceof Error)) return;
            expect(core.warning).toHaveBeenCalledWith(
                `Error getting repository HEAD for ${repo}: ${error.message}`
            );
        }
    );

    it("returns false if request for repository download URL errors out", async () => {
        expect.assertions(2);

        const testEnv = {
            ...env,
        };

        (Octokit.prototype.constructor as vi.Mock).mockImplementation(() => ({
            request: (route: string) => {
                switch (route) {
                    case "GET /repos/{owner}/{repo}/git/ref/{ref}":
                        return resolveHeadSha();
                    case "GET /repos/{owner}/{repo}/tarball/{ref}":
                        return Promise.resolve({
                            status: errorStatusCode,
                        });
                }
            },
        }));

        const isRepositoryDownloaded = await downloadRepository(
            repository,
            packageName,
            branch,
            githubToken,
            downloadDir,
            testEnv
        );

        expect(isRepositoryDownloaded).toBe(false);
        expect(core.warning).toHaveBeenCalledWith(
            `Wrong response code while fetching repository download URL for ${repo}: ${errorStatusCode}`
        );
    });

    it.each`
        error
        ${errorObject}
        ${emptyObject}
    `(
        "returns false if request for repository download URL fails ($error)",
        async ({ error }) => {
            expect.hasAssertions();

            const testEnv = {
                ...env,
            };

            (Octokit.prototype.constructor as vi.Mock).mockImplementation(
                () => ({
                    request: (route: string) => {
                        switch (route) {
                            case "GET /repos/{owner}/{repo}/git/ref/{ref}":
                                return resolveHeadSha();
                            case "GET /repos/{owner}/{repo}/tarball/{ref}":
                                throw error;
                        }
                    },
                })
            );

            const isRepositoryDownloaded = await downloadRepository(
                repository,
                packageName,
                branch,
                githubToken,
                downloadDir,
                testEnv
            );

            expect(isRepositoryDownloaded).toBe(false);

            if (!(error instanceof Error)) return;
            expect(core.warning).toHaveBeenCalledWith(
                `Error getting repository download URL for ${repo}: ${error.message}`
            );
        }
    );

    it.each`
        error
        ${errorObject}
        ${emptyObject}
    `("returns false if download fails ($error)", async ({ error }) => {
        expect.hasAssertions();

        const testEnv = {
            ...env,
        };

        (Octokit.prototype.constructor as vi.Mock).mockImplementation(() => ({
            request: (route: string) => {
                switch (route) {
                    case "GET /repos/{owner}/{repo}/git/ref/{ref}":
                        return resolveHeadSha();
                    case "GET /repos/{owner}/{repo}/tarball/{ref}":
                        return resolveRepositoryDownloadUrl();
                }
            },
        }));

        (downloadFile as vi.Mock).mockImplementationOnce(() => {
            throw error;
        });

        const isRepositoryDownloaded = await downloadRepository(
            repository,
            packageName,
            branch,
            githubToken,
            downloadDir,
            testEnv
        );

        expect(isRepositoryDownloaded).toBe(false);

        if (!(error instanceof Error)) return;
        expect(core.warning).toHaveBeenCalledWith(
            `Error downloading repository archive for ${repo}: ${error.message}`
        );
    });

    it("returns false if determining archive size errors out", async () => {
        expect.assertions(2);

        const testEnv = {
            ...env,
        };

        (Octokit.prototype.constructor as vi.Mock).mockImplementation(() => ({
            request: (route: string) => {
                switch (route) {
                    case "GET /repos/{owner}/{repo}/git/ref/{ref}":
                        return resolveHeadSha();
                    case "GET /repos/{owner}/{repo}/tarball/{ref}":
                        return resolveRepositoryDownloadUrl();
                }
            },
        }));

        (downloadFile as vi.Mock).mockResolvedValueOnce(undefined);

        const statSync = vi.spyOn(fs, "statSync");
        (statSync as vi.Mock).mockImplementationOnce(() => ({
            size: 0,
        }));

        const isRepositoryDownloaded = await downloadRepository(
            repository,
            packageName,
            branch,
            githubToken,
            downloadDir,
            testEnv
        );

        expect(isRepositoryDownloaded).toBe(false);
        expect(core.warning).toHaveBeenCalledWith(
            `Error determining size of repository archive for ${repo}`
        );
    });

    it.each`
        error
        ${errorObject}
        ${emptyObject}
    `(
        "returns false if extracting repository archive fails ($error)",
        async ({ error }) => {
            expect.hasAssertions();

            const testEnv = {
                ...env,
            };

            (Octokit.prototype.constructor as vi.Mock).mockImplementation(
                () => ({
                    request: (route: string) => {
                        switch (route) {
                            case "GET /repos/{owner}/{repo}/git/ref/{ref}":
                                return resolveHeadSha();
                            case "GET /repos/{owner}/{repo}/tarball/{ref}":
                                return resolveRepositoryDownloadUrl();
                        }
                    },
                })
            );

            (downloadFile as vi.Mock).mockResolvedValueOnce(undefined);

            const statSync = vi.spyOn(fs, "statSync");
            (statSync as vi.Mock).mockImplementationOnce(() => ({
                size,
            }));

            (tar.x as vi.Mock).mockImplementationOnce(() => {
                throw error;
            });

            const isRepositoryDownloaded = await downloadRepository(
                repository,
                packageName,
                branch,
                githubToken,
                downloadDir,
                testEnv
            );

            expect(isRepositoryDownloaded).toBe(false);

            if (!(error instanceof Error)) return;
            expect(core.warning).toHaveBeenCalledWith(
                `Error extracting repository archive for ${repo}: ${error.message}`
            );
        }
    );

    it("extends environment object with install paths and dependency", async () => {
        expect.assertions(2);

        const testEnv = {
            ...env,
        };

        const expectedEnv = {
            ...testEnv,
            DEPENDENCIES: {
                [packageName]: headSha,
            },
        };

        (Octokit.prototype.constructor as vi.Mock).mockImplementation(() => ({
            request: (route: string) => {
                switch (route) {
                    case "GET /repos/{owner}/{repo}/git/ref/{ref}":
                        return resolveHeadSha();
                    case "GET /repos/{owner}/{repo}/tarball/{ref}":
                        return resolveRepositoryDownloadUrl();
                }
            },
        }));

        (downloadFile as vi.Mock).mockResolvedValueOnce(undefined);

        const statSync = vi.spyOn(fs, "statSync");
        (statSync as vi.Mock).mockImplementationOnce(() => ({
            size,
        }));

        const unlinkSync = vi.spyOn(fs, "unlinkSync");
        (unlinkSync as vi.Mock).mockImplementationOnce(() => {
            return true;
        });

        const isRepositoryDownloaded = await downloadRepository(
            repository,
            packageName,
            branch,
            githubToken,
            downloadDir,
            testEnv
        );

        expect(isRepositoryDownloaded).toBe(true);
        expect(testEnv).toStrictEqual(expectedEnv);
    });
});
