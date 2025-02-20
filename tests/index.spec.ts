import * as core from "@actions/core";
import { describe, it, expect, vi, beforeEach } from "vitest";
import main from "../src/main";

vi.mock("@actions/core");
vi.mock("../src/main");

const outputs: ActionOutputs = {
    bin_path: "/path/to/install/repo2/bin:/path/to/install/repo2/bin",
    include_path:
        "/path/to/install/repo2/include:/path/to/install/repo2/include",
    install_path: "/path/to/install/repo2:/path/to/install/repo2",
    lib_path: "/path/to/install/repo2/lib:/path/to/install/repo2/lib",
};

describe("entry", () => {
    beforeEach(() => {
        vi.resetModules();
        vi.clearAllMocks();
    });

    it("sets path outputs and logs values", async () => {
        expect.assertions(8);

        (main as vi.Mock).mockResolvedValueOnce(outputs);

        await import("../src/index");

        Object.keys(outputs).forEach((outputName) => {
            const outputValue = outputs[outputName as keyof ActionOutputs];

            expect(core.setOutput).toHaveBeenCalledWith(
                outputName,
                outputValue
            );
            expect(core.info).toHaveBeenCalledWith(
                `==> ${outputName}: ${outputValue}`
            );
        });
    });

    it("sets outputs with coverage file and logs values", async () => {
        expect.assertions(10);

        const outputsWithCoverageFile = {
            ...outputs,
            coverage_file: "/path/to/repo/build/coverage.info",
        };

        (main as vi.Mock).mockResolvedValueOnce(outputsWithCoverageFile);

        await import("../src/index");

        Object.keys(outputsWithCoverageFile).forEach((outputName) => {
            const outputValue =
                outputsWithCoverageFile[outputName as keyof ActionOutputs];

            expect(core.setOutput).toHaveBeenCalledWith(
                outputName,
                outputValue
            );
            expect(core.info).toHaveBeenCalledWith(
                `==> ${outputName}: ${outputValue}`
            );
        });
    });

    it("sets failure on errors", async () => {
        expect.assertions(1);

        const errorMessage = "Oops!";

        (main as vi.Mock).mockRejectedValueOnce(errorMessage);

        (core.setFailed as vi.Mock).mockImplementation(
            (failureMessage: string) => {
                expect(failureMessage).toBe(errorMessage);
            }
        );

        await import("../src/index");
    });
});
