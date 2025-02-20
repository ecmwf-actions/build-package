import fs from "fs";
import path from "path";
import * as core from "@actions/core";
import * as artifact from "@actions/artifact";
import { filesize } from "filesize";
import tar from "tar";
import { describe, it, expect, vi } from "vitest";

import uploadArtifact from "../src/upload-artifact";
import { getCacheKeyHash } from "../src/cache-functions";
import { EnvironmentVariables } from "../src/types/env-functions";

vi.mock("@actions/core");
vi.mock("@actions/artifact");
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

const dependencies = {
    "owner/repo1": "de9f2c7fd25e1b3afad3e85a0bd17d9b100db4b3",
    "owner/repo2": "2fd4e1c67a2d28fced849ee1bb76e7391b93eb12",
};

// Base environment object, we will take care not to modify it.
const env = {
    CC: "gcc-12",
    CXX: "g++-12",
    FC: "gfortran-12",
    CMAKE_VERSION: "3.31.5",
    DEPENDENCIES: dependencies,
};

// Test parameters.
const repository = "owner/repo";
const repo = "repo";
const packageName = "repo";
const githubToken = "12345";
const installDir = "/path/to/install/repo";
const os = "ubuntu-24.04";
const compiler = "gnu-12";
const size = 68168435;
const sha = "f0b00fd201c7ddf14e1572a10d5fb4577c4bd6a2";
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
    sha,
);
const tarName = `${artifactName}.tar`;
const rootDirectory = path.dirname(installDir);
const tarPath = path.join(rootDirectory, tarName);
const dependenciesName = `${artifactName}-dependencies.json`;
const dependenciesPath = path.join(rootDirectory, dependenciesName);
const errorObject = new Error("Oops!");
const emptyObject = {};

const uploadResult = () =>
    Promise.resolve({
        artifactName,
        size,
        failedItems: [],
    });

describe("uploadArtifact", () => {
    it("returns true on success", async () => {
        expect.assertions(4);

        const testEnv = {
            ...env,
        };

        (artifact.create as vi.Mock).mockImplementationOnce(() => ({
            uploadArtifact: uploadResult,
        }));

        const statSync = vi.spyOn(fs, "statSync");
        (statSync as vi.Mock).mockImplementationOnce(() => ({
            size,
        }));

        const writeFileSync = vi.spyOn(fs, "writeFileSync");
        writeFileSync.mockImplementationOnce((path: string) => {
            if (path === dependenciesPath) return true;
        });

        const unlinkSync = vi.spyOn(fs, "unlinkSync");
        unlinkSync.mockImplementationOnce(() => {
            return true;
        });

        const isUploaded = await uploadArtifact(
            repository,
            packageName,
            sha,
            installDir,
            dependencies,
            os,
            compiler,
            testEnv,
            {},
            githubToken,
            cacheSuffix,
            cmakeOptions,
        );

        expect(isUploaded).toBe(true);
        expect(core.info).toHaveBeenCalledWith(
            `==> Created artifact TAR: ${tarPath} (${filesize(size)})`,
        );
        expect(core.info).toHaveBeenCalledWith(
            `==> Created dependencies file: ${dependenciesPath}`,
        );
        expect(core.info).toHaveBeenCalledWith(
            `==> Uploaded artifact: ${artifactName} (${filesize(size)})`,
        );
    });

    it("supports invalid repository name", async () => {
        expect.assertions(2);

        const testEnv = {
            ...env,
        };

        const coverageArtifactName = `coverage-${repo}-${os}-${compiler}`;

        (artifact.create as vi.Mock).mockImplementationOnce(() => ({
            uploadArtifact: () =>
                Promise.resolve({
                    artifactName: coverageArtifactName,
                    size,
                    failedItems: [],
                }),
        }));

        const statSync = vi.spyOn(fs, "statSync");
        (statSync as vi.Mock).mockImplementationOnce(() => ({
            size,
        }));

        const unlinkSync = vi.spyOn(fs, "unlinkSync");
        unlinkSync.mockImplementationOnce(() => {
            return true;
        });

        const isUploaded = await uploadArtifact(
            `coverage-${packageName}`,
            packageName,
            sha,
            installDir,
            null,
            os,
            compiler,
            testEnv,
            {},
            githubToken,
            cacheSuffix,
            cmakeOptions,
        );

        expect(isUploaded).toBe(true);
        expect(core.info).toHaveBeenCalledWith(
            `==> Uploaded artifact: ${coverageArtifactName} (${filesize(size)})`,
        );
    });

    it("constructs a different artifact name in case of ecbuild", async () => {
        expect.assertions(2);

        const testEnv = {
            ...env,
        };

        const ecbuildArtifactName = `ecbuild-${os}-cmake-${testEnv.CMAKE_VERSION}-${sha}`;

        (artifact.create as vi.Mock).mockImplementationOnce(() => ({
            uploadArtifact: () =>
                Promise.resolve({
                    artifactName: ecbuildArtifactName,
                    size,
                    failedItems: [],
                }),
        }));

        const statSync = vi.spyOn(fs, "statSync");
        (statSync as vi.Mock).mockImplementationOnce(() => ({
            size,
        }));

        const writeFileSync = vi.spyOn(fs, "writeFileSync");
        writeFileSync.mockImplementationOnce((path: string) => {
            if (path === dependenciesPath) return true;
        });

        const unlinkSync = vi.spyOn(fs, "unlinkSync");
        unlinkSync.mockImplementationOnce(() => {
            return true;
        });

        const isUploaded = await uploadArtifact(
            "ecmwf/ecbuild",
            "ecbuild",
            sha,
            installDir,
            {},
            os,
            null,
            testEnv,
            {},
            githubToken,
            cacheSuffix,
            cmakeOptions,
        );

        expect(isUploaded).toBe(true);
        expect(core.info).toHaveBeenCalledWith(
            `==> Uploaded artifact: ${ecbuildArtifactName} (${filesize(size)})`,
        );
    });

    it.each`
        error
        ${errorObject}
        ${emptyObject}
    `(
        "returns false if creating artifact TAR fails ($error)",
        async ({ error }) => {
            expect.hasAssertions();

            const testEnv = {
                ...env,
            };

            (tar.c as vi.Mock).mockImplementationOnce(() => {
                throw error;
            });

            const isUploaded = await uploadArtifact(
                repository,
                packageName,
                sha,
                installDir,
                dependencies,
                os,
                compiler,
                testEnv,
                {},
                githubToken,
                cacheSuffix,
                cmakeOptions,
            );

            expect(isUploaded).toBe(false);

            if (!(error instanceof Error)) return;
            expect(core.warning).toHaveBeenCalledWith(
                `Error creating artifact TAR for ${repo}: ${error.message}`,
            );
        },
    );

    it("returns false if determining archive size errors out", async () => {
        expect.assertions(2);

        const testEnv = {
            ...env,
        };

        (artifact.create as vi.Mock).mockImplementation(() => ({
            uploadArtifact: uploadResult,
        }));

        const statSync = vi.spyOn(fs, "statSync");
        (statSync as vi.Mock).mockImplementationOnce(() => ({
            size: 0,
        }));

        const isUploaded = await uploadArtifact(
            repository,
            packageName,
            sha,
            installDir,
            dependencies,
            os,
            compiler,
            testEnv,
            {},
            githubToken,
            cacheSuffix,
            cmakeOptions,
        );

        expect(isUploaded).toBe(false);
        expect(core.warning).toHaveBeenCalledWith(
            `Error determining size of artifact TAR for ${repo}`,
        );
    });

    it.each`
        error
        ${errorObject}
        ${emptyObject}
    `(
        "returns false if writing dependencies file errors out ($error)",
        async ({ error }) => {
            expect.hasAssertions();

            const testEnv = {
                ...env,
            };

            (artifact.create as vi.Mock).mockImplementationOnce(() => ({
                uploadArtifact: uploadResult,
            }));

            const statSync = vi.spyOn(fs, "statSync");
            (statSync as vi.Mock).mockImplementationOnce(() => ({
                size,
            }));

            const writeFileSync = vi.spyOn(fs, "writeFileSync");
            writeFileSync.mockImplementationOnce((path: string) => {
                if (path === dependenciesPath) throw error;
            });

            const unlinkSync = vi.spyOn(fs, "unlinkSync");
            unlinkSync.mockImplementationOnce(() => {
                return true;
            });

            const isUploaded = await uploadArtifact(
                repository,
                packageName,
                sha,
                installDir,
                dependencies,
                os,
                compiler,
                testEnv,
                {},
                githubToken,
                cacheSuffix,
                cmakeOptions,
            );

            expect(isUploaded).toBe(false);

            (artifact.create as vi.Mock).mockReset();

            if (!(error instanceof Error)) return;
            expect(core.warning).toHaveBeenCalledWith(
                `Error writing dependencies file for ${repo}: ${error.message}`,
            );
        },
    );

    it("returns false if artifact item upload has some failures", async () => {
        expect.assertions(2);

        const testEnv = {
            ...env,
        };

        (artifact.create as vi.Mock).mockImplementationOnce(() => ({
            uploadArtifact: () =>
                Promise.resolve({
                    artifactName,
                    size,
                    failedItems: [artifactName],
                }),
        }));

        const statSync = vi.spyOn(fs, "statSync");
        (statSync as vi.Mock).mockImplementationOnce(() => ({
            size,
        }));

        const writeFileSync = vi.spyOn(fs, "writeFileSync");
        writeFileSync.mockImplementationOnce((path: string) => {
            if (path === dependenciesPath) return true;
        });

        const isUploaded = await uploadArtifact(
            repository,
            packageName,
            sha,
            installDir,
            dependencies,
            os,
            compiler,
            testEnv,
            {},
            githubToken,
            cacheSuffix,
            cmakeOptions,
        );

        expect(isUploaded).toBe(false);
        expect(core.warning).toHaveBeenCalledWith(
            `Error uploading artifact for ${repo}: ${artifactName}`,
        );
    });

    it("returns false if artifact item upload returns empty result", async () => {
        expect.assertions(2);

        const testEnv = {
            ...env,
        };

        (artifact.create as vi.Mock).mockImplementationOnce(() => ({
            uploadArtifact: () => Promise.resolve(),
        }));

        const statSync = vi.spyOn(fs, "statSync");
        (statSync as vi.Mock).mockImplementationOnce(() => ({
            size,
        }));

        const writeFileSync = vi.spyOn(fs, "writeFileSync");
        writeFileSync.mockImplementationOnce((path: string) => {
            if (path === dependenciesPath) return true;
        });

        const isUploaded = await uploadArtifact(
            repository,
            packageName,
            sha,
            installDir,
            dependencies,
            os,
            compiler,
            testEnv,
            {},
            githubToken,
            cacheSuffix,
            cmakeOptions,
        );

        expect(isUploaded).toBe(false);
        expect(core.warning).toHaveBeenCalledWith(
            `Error uploading artifact for ${repo}`,
        );
    });

    it.each`
        error
        ${errorObject}
        ${emptyObject}
    `(
        "returns false if artifact item upload fails ($error)",
        async ({ error }) => {
            expect.hasAssertions();

            const testEnv = {
                ...env,
            };

            (artifact.create as vi.Mock).mockImplementationOnce(() => ({
                uploadArtifact: () => Promise.reject(error),
            }));

            const statSync = vi.spyOn(fs, "statSync");
            (statSync as vi.Mock).mockImplementationOnce(() => ({
                size,
            }));

            const writeFileSync = vi.spyOn(fs, "writeFileSync");
            writeFileSync.mockImplementationOnce((path: string) => {
                if (path === dependenciesPath) return true;
            });

            const isUploaded = await uploadArtifact(
                repository,
                packageName,
                sha,
                installDir,
                dependencies,
                os,
                compiler,
                testEnv,
                {},
                githubToken,
                cacheSuffix,
                cmakeOptions,
            );

            expect(isUploaded).toBe(false);

            if (!(error instanceof Error)) return;
            expect(core.warning).toHaveBeenCalledWith(
                `Error uploading artifact for ${repo}: ${error.message}`,
            );
        },
    );
});
