import * as core from '@actions/core';
import main from '../src/main';

jest.mock('@actions/core');
jest.mock('../src/main');

const outputs: ActionOutputs = {
    bin_path: '/path/to/install/repo2/bin:/path/to/install/repo2/bin',
    include_path: '/path/to/install/repo2/include:/path/to/install/repo2/include',
    install_path: '/path/to/install/repo2:/path/to/install/repo2',
    lib_path: '/path/to/install/repo2/lib:/path/to/install/repo2/lib',
};

describe('entry', () => {
    it('sets path outputs and logs values', async () => {
        expect.assertions(8);

        (main as jest.Mock).mockResolvedValueOnce(outputs);

        await jest.isolateModules(() => require('../src/index'));

        Object.keys(outputs).forEach((outputName) => {
            const outputValue = outputs[outputName as keyof ActionOutputs];

            expect(core.setOutput).toHaveBeenCalledWith(outputName, outputValue);
            expect(core.info).toHaveBeenCalledWith(`==> ${outputName}: ${outputValue}`);
        });
    });

    it('sets outputs with coverage file and logs values', async () => {
        expect.assertions(10);

        const outputsWithCoverageFile = {
            ...outputs,
            coverage_file: '/path/to/repo/build/coverage.info',
        };

        (main as jest.Mock).mockResolvedValueOnce(outputsWithCoverageFile);

        await jest.isolateModules(() => require('../src/index'));

        Object.keys(outputsWithCoverageFile).forEach((outputName) => {
            const outputValue = outputsWithCoverageFile[outputName as keyof ActionOutputs];

            expect(core.setOutput).toHaveBeenCalledWith(outputName, outputValue);
            expect(core.info).toHaveBeenCalledWith(`==> ${outputName}: ${outputValue}`);
        });
    });

    it('sets failure on errors', async () => {
        expect.assertions(1);

        const errorMessage = 'Oops!';

        (main as jest.Mock).mockRejectedValueOnce(errorMessage);

        // For some reason, checking toHaveBeenCalledWith() on this mock function does not work, possibly because of
        //   some race condition at play. Instead, we mock its implementation and check if it's called with correct
        //   parameter.
        (core.setFailed as jest.Mock).mockImplementation((failureMessage) => {
            expect(failureMessage).toBe(errorMessage);
        });

        await jest.isolateModules(() => require('../src/index'));
    });
});
