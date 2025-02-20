import fs, { WriteStream } from "fs";
import { HttpClient } from "@actions/http-client";
import { describe, it, expect, vi } from "vitest";

import downloadFile from "../src/download-file";

vi.mock("@actions/http-client");

const url = "https://foo.bar";
const dest = "file.ext";

describe("downloadFile", () => {
    it("returns promise that resolves on success", async () => {
        expect.assertions(1);

        (HttpClient.prototype.constructor as vi.Mock).mockImplementationOnce(
            () => ({
                get: () =>
                    Promise.resolve({
                        message: {
                            pipe: () => ({
                                on: (event: string, cb: () => void) => {
                                    cb();

                                    return {
                                        on: () => {
                                            // noop
                                        },
                                    };
                                },
                            }),
                        },
                    }),
            }),
        );

        const createWriteStream = vi.spyOn(fs, "createWriteStream");
        createWriteStream.mockImplementationOnce(
            (path: string): WriteStream => {
                if (path === dest)
                    return {
                        close: (cb: () => void) => cb(),
                    } as WriteStream;
                return new WriteStream();
            },
        );

        await expect(downloadFile(url, dest)).resolves.toBe(true);
    });

    it("returns promise that rejects on failure", async () => {
        expect.assertions(1);

        const errorMessage = "Oops!";

        (HttpClient.prototype.constructor as vi.Mock).mockImplementationOnce(
            () => ({
                get: () =>
                    Promise.resolve({
                        message: {
                            pipe: () => ({
                                on: () => {
                                    return {
                                        on: (
                                            event: string,
                                            cb: (error: Error) => void,
                                        ) => cb(new Error(errorMessage)),
                                    };
                                },
                            }),
                        },
                    }),
            }),
        );

        const createWriteStream = vi.spyOn(fs, "createWriteStream");
        createWriteStream.mockImplementationOnce(
            (path: string): WriteStream => {
                if (path === dest)
                    return {
                        close: (cb: () => void) => cb(),
                    } as WriteStream;
                return new WriteStream();
            },
        );

        await expect(downloadFile(url, dest)).rejects.toBe(errorMessage);
    });

    it("catches failed request", async () => {
        expect.assertions(1);

        const errorMessage = "Oops!";

        (HttpClient.prototype.constructor as vi.Mock).mockImplementationOnce(
            () => ({
                get: () => Promise.reject(new Error(errorMessage)),
            }),
        );

        await expect(downloadFile(url, dest)).rejects.toBe(errorMessage);
    });
});
