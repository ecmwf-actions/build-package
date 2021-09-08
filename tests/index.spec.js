const core = require('@actions/core');
const main = require('../src/main');

jest.mock('@actions/core');
jest.mock('../src/main');

const outputs = {
    bin_path: '/path/to/install/repo2/bin:/path/to/install/repo2/bin',
    include_path: '/path/to/install/repo2/include:/path/to/install/repo2/include',
    install_path: '/path/to/install/repo2:/path/to/install/repo2',
    lib_path: '/path/to/install/repo2/lib:/path/to/install/repo2/lib',
};

// The test works with jest<=26.6.3. Since jest@27, the `isolateModules()` function does not work correctly with mocks.
// Until this is fixed, the jest version will be pinned.
//   More information in this issue: https://github.com/facebook/jest/issues/11666
describe('entry', () => {
    it('sets path outputs and logs values', async () => {
        expect.assertions(8);

        main.mockImplementation(() => Promise.resolve(outputs));

        await jest.isolateModules(() => require('../src/index'));

        Object.keys(outputs).forEach((outputName) => {
            const outputValue = outputs[outputName];

            expect(core.setOutput).toHaveBeenCalledWith(outputName, outputValue);
            expect(core.info).toHaveBeenCalledWith(`==> ${outputName}: ${outputValue}`);
        });

        main.mockReset();
    });

    it('sets outputs with coverage file and logs values', async () => {
        expect.assertions(10);

        const outputsWithCoverageFile = {
            ...outputs,
            coverage_file: '/path/to/repo/build/coverage.info',
        };

        main.mockImplementation(() => Promise.resolve(outputsWithCoverageFile));

        await jest.isolateModules(() => require('../src/index'));

        Object.keys(outputsWithCoverageFile).forEach((outputName) => {
            const outputValue = outputsWithCoverageFile[outputName];

            expect(core.setOutput).toHaveBeenCalledWith(outputName, outputValue);
            expect(core.info).toHaveBeenCalledWith(`==> ${outputName}: ${outputValue}`);
        });

        main.mockReset();
    });

    it('sets failure on errors', async () => {
        expect.assertions(1);

        const errorMessage = 'Oops!';

        main.mockImplementation(() => Promise.reject(errorMessage));

        // For some reason, checking toHaveBeenCalledWith() on this mock function does not work, possibly because of
        //   some race condition at play. Instead, we mock its implementation and check if it's called with correct
        //   parameter.
        core.setFailed.mockImplementation((failureMessage) => {
            expect(failureMessage).toBe(errorMessage);
        });

        await jest.isolateModules(() => require('../src/index'));

        main.mockReset();
    });
});
