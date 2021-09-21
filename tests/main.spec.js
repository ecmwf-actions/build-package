const core = require('@actions/core');

const main = require('../src/main');

const { setupEnv } = require('../src/env-functions');
const { restoreCache, saveCache } = require('../src/cache-functions');
const downloadArtifact = require('../src/download-artifact');
const uploadArtifact = require('../src/upload-artifact');
const downloadRepository = require('../src/download-repository');
const buildPackage = require('../src/build-package');

jest.mock('@actions/core');
jest.mock('../src/env-functions');
jest.mock('../src/cache-functions');
jest.mock('../src/download-artifact');
jest.mock('../src/upload-artifact');
jest.mock('../src/download-repository');
jest.mock('../src/build-package');

const inputs = {
    workspace: '/path/to/work/repo/repo',
    repository: 'owner/repo',
    cmake: false,
    cmake_options: null,
    self_build: true,
    self_test: true,
    self_coverage: true,
    dependencies: [
        'owner/repo1',
        'owner/repo2',
        'owner/repo3',
    ],
    dependency_branch: 'develop',
    force_build: false,
    cache_suffix: null,
    recreate_cache: false,
    os: 'ubuntu-20.04',
    compiler: 'gnu-10',
    compiler_cc: 'gcc-10',
    compiler_cxx: 'g++-10',
    compiler_fc: 'gfortran-10',
    github_token: '***',
    install_dir: '/path/to/install',
    download_dir: '/path/to/download',
};

const outputs = {
    bin_path: '/path/to/install/repo2/bin:/path/to/install/repo2/bin',
    include_path: '/path/to/install/repo2/include:/path/to/install/repo2/include',
    install_path: '/path/to/install/repo2:/path/to/install/repo2',
    lib_path: '/path/to/install/repo2/lib:/path/to/install/repo2/lib',
    coverage_file: '/path/to/work/repo/repo/build/coverage.info',
};

const env = {
    BIN_PATH: outputs.bin_path,
    INCLUDE_PATH: outputs.include_path,
    INSTALL_PATH: outputs.install_path,
    LIB_PATH: outputs.lib_path,
    COVERAGE_FILE: outputs.coverage_file,
    COVERAGE_DIR: '/path/to/work/repo/repo/build/coverage',
};

describe('main', () => {
    it('resolves the promise if dependency artifacts are found', async () => {
        expect.assertions(1);

        core.getInput.mockImplementation((inputName) => inputs[inputName]);
        core.getBooleanInput.mockImplementation((inputName) => inputs[inputName]);
        core.getMultilineInput.mockImplementation((inputName) => inputs[inputName]);

        setupEnv.mockResolvedValue(env);
        downloadArtifact.mockResolvedValue(true);
        buildPackage.mockResolvedValue(true);
        uploadArtifact.mockResolvedValue(true);

        await expect(main.call()).resolves.toStrictEqual(outputs);

        setupEnv.mockReset();
        downloadArtifact.mockReset();
        buildPackage.mockReset();
        uploadArtifact.mockReset();
        core.getInput.mockReset();
        core.getBooleanInput.mockReset();
        core.getMultilineInput.mockReset();
    });

    it('resolves the promise if dependency build is forced', async () => {
        expect.assertions(1);

        core.getInput.mockImplementation((inputName) => inputs[inputName]);
        core.getBooleanInput.mockImplementation((inputName) => {
            if (inputName === 'force_build') return true;
            return inputs[inputName];
        });
        core.getMultilineInput.mockImplementation((inputName) => inputs[inputName]);

        setupEnv.mockResolvedValue(env);
        restoreCache.mockResolvedValue(false);
        downloadRepository.mockResolvedValue(true);
        buildPackage.mockResolvedValue(true);
        saveCache.mockResolvedValue(true);
        uploadArtifact.mockResolvedValue(true);

        await expect(main.call()).resolves.toStrictEqual(outputs);

        setupEnv.mockReset();
        restoreCache.mockReset();
        downloadRepository.mockReset();
        buildPackage.mockReset();
        saveCache.mockReset();
        uploadArtifact.mockReset();
        core.getInput.mockReset();
        core.getBooleanInput.mockReset();
        core.getMultilineInput.mockReset();
    });

    it('resolves the promise if cached dependencies are found', async () => {
        expect.assertions(1);

        core.getInput.mockImplementation((inputName) => inputs[inputName]);
        core.getBooleanInput.mockImplementation((inputName) => inputs[inputName]);
        core.getMultilineInput.mockImplementation((inputName) => inputs[inputName]);

        setupEnv.mockResolvedValue(env);
        downloadArtifact.mockResolvedValue(false);
        restoreCache.mockResolvedValue(true);
        buildPackage.mockResolvedValue(true);
        uploadArtifact.mockResolvedValue(true);

        await expect(main.call()).resolves.toStrictEqual(outputs);

        setupEnv.mockReset();
        downloadArtifact.mockReset();
        restoreCache.mockReset();
        buildPackage.mockReset();
        uploadArtifact.mockReset();
        core.getInput.mockReset();
        core.getBooleanInput.mockReset();
        core.getMultilineInput.mockReset();
    });

    it('resolves the promise if restoring cache is being skipped', async () => {
        expect.assertions(1);

        core.getInput.mockImplementation((inputName) => inputs[inputName]);
        core.getBooleanInput.mockImplementation((inputName) => {
            if (inputName === 'recreate_cache') return true;
            return inputs[inputName];
        });
        core.getMultilineInput.mockImplementation((inputName) => inputs[inputName]);

        setupEnv.mockResolvedValue(env);
        downloadArtifact.mockResolvedValue(false);
        downloadRepository.mockResolvedValue(true);
        buildPackage.mockResolvedValue(true);
        saveCache.mockResolvedValue(true);
        uploadArtifact.mockResolvedValue(true);

        await expect(main.call()).resolves.toStrictEqual(outputs);

        setupEnv.mockReset();
        downloadArtifact.mockReset();
        downloadRepository.mockReset();
        buildPackage.mockReset();
        saveCache.mockReset();
        uploadArtifact.mockReset();
        core.getInput.mockReset();
        core.getBooleanInput.mockReset();
        core.getMultilineInput.mockReset();
    });

    it('resolves the promise if dependencies are built', async () => {
        expect.assertions(1);

        core.getInput.mockImplementation((inputName) => inputs[inputName]);
        core.getBooleanInput.mockImplementation((inputName) => inputs[inputName]);
        core.getMultilineInput.mockImplementation((inputName) => inputs[inputName]);

        setupEnv.mockResolvedValue(env);
        downloadArtifact.mockResolvedValue(false);
        restoreCache.mockResolvedValue(false);
        downloadRepository.mockResolvedValue(true);
        buildPackage.mockResolvedValue(true);
        saveCache.mockResolvedValue(true);
        uploadArtifact.mockResolvedValue(true);

        await expect(main.call()).resolves.toStrictEqual(outputs);

        setupEnv.mockReset();
        downloadArtifact.mockReset();
        restoreCache.mockReset();
        downloadRepository.mockReset();
        buildPackage.mockReset();
        saveCache.mockReset();
        uploadArtifact.mockReset();
        core.getInput.mockReset();
        core.getBooleanInput.mockReset();
        core.getMultilineInput.mockReset();
    });

    it('resolves the promise if cmake options are passed', async () => {
        expect.assertions(2);

        const cmakeOptions = [
            "owner/repo: '-DCMAKE_VAR=1 -DJSON_VAR={\"key\": \"value\"}'",
            'other/repo: "--DOPT1=ON -DOPT2=OFF"',
        ];

        const testCmakeOptions = cmakeOptions[0].split(/:\s?(.+)/)[1].replace(/^['"]|['"]$/g, '');

        const testEnv = {
            ...env,
        };

        core.getInput.mockImplementation((inputName) => inputs[inputName]);
        core.getBooleanInput.mockImplementation((inputName) => inputs[inputName]);
        core.getMultilineInput.mockImplementation((inputName) => {
            if (inputName === 'cmake_options') return cmakeOptions;
            return inputs[inputName];
        });

        setupEnv.mockResolvedValue(env);
        downloadArtifact.mockResolvedValue(true);
        buildPackage.mockResolvedValue(true);
        uploadArtifact.mockResolvedValue(true);

        await expect(main.call()).resolves.toStrictEqual(outputs);
        expect(buildPackage).toHaveBeenCalledWith(inputs.repository, inputs.workspace, `${inputs.install_dir}/repo`, inputs.cmake, testCmakeOptions, inputs.self_test, inputs.self_coverage, inputs.os, inputs.compiler, testEnv);

        setupEnv.mockReset();
        downloadArtifact.mockReset();
        buildPackage.mockReset();
        uploadArtifact.mockReset();
        core.getInput.mockReset();
        core.getBooleanInput.mockReset();
        core.getMultilineInput.mockReset();
    });

    it('resolves the promise if build is skipped', async () => {
        expect.assertions(1);

        core.getInput.mockImplementation((inputName) => inputs[inputName]);
        core.getBooleanInput.mockImplementation((inputName) => {
            if (inputName === 'self_build') return false;
            return inputs[inputName]
        });
        core.getMultilineInput.mockImplementation((inputName) => inputs[inputName]);

        setupEnv.mockResolvedValue(env);
        downloadArtifact.mockResolvedValue(true);
        buildPackage.mockResolvedValue(true);
        uploadArtifact.mockResolvedValue(true);

        await expect(main.call()).resolves.toStrictEqual(outputs);

        setupEnv.mockReset();
        downloadArtifact.mockReset();
        buildPackage.mockReset();
        uploadArtifact.mockReset();
        core.getInput.mockReset();
        core.getBooleanInput.mockReset();
        core.getMultilineInput.mockReset();
    });

    it('resolves the promise if code coverage is skipped', async () => {
        expect.assertions(1);

        const testEnv = {
            ...env,
        };

        delete testEnv.COVERAGE_FILE;
        delete testEnv.COVERAGE_DIR;

        const expectedOutputs = {
            ...outputs,
        };

        delete expectedOutputs.coverage_file;

        core.getInput.mockImplementation((inputName) => inputs[inputName]);
        core.getBooleanInput.mockImplementation((inputName) => {
            if (inputName === 'self_coverage') return false;
            return inputs[inputName]
        });
        core.getMultilineInput.mockImplementation((inputName) => inputs[inputName]);

        setupEnv.mockResolvedValue(testEnv);
        downloadArtifact.mockResolvedValue(true);
        buildPackage.mockResolvedValue(true);
        uploadArtifact.mockResolvedValue(true);

        await expect(main.call()).resolves.toStrictEqual(expectedOutputs);

        setupEnv.mockReset();
        downloadArtifact.mockReset();
        buildPackage.mockReset();
        uploadArtifact.mockReset();
        core.getInput.mockReset();
        core.getBooleanInput.mockReset();
        core.getMultilineInput.mockReset();
    });

    it('resolves the promise if saving built dependency to cache fails', async () => {
        expect.assertions(1);

        core.getInput.mockImplementation((inputName) => inputs[inputName]);
        core.getBooleanInput.mockImplementation((inputName) => inputs[inputName]);
        core.getMultilineInput.mockImplementation((inputName) => inputs[inputName]);

        setupEnv.mockResolvedValue(env);
        downloadArtifact.mockResolvedValue(false);
        restoreCache.mockResolvedValue(false);
        downloadRepository.mockResolvedValue(true);
        buildPackage.mockResolvedValue(true);
        saveCache.mockResolvedValue(false);
        uploadArtifact.mockResolvedValue(true);

        await expect(main.call()).resolves.toStrictEqual(outputs);

        setupEnv.mockReset();
        downloadArtifact.mockReset();
        restoreCache.mockReset();
        downloadRepository.mockReset();
        buildPackage.mockReset();
        saveCache.mockReset();
        uploadArtifact.mockReset();
        core.getInput.mockReset();
        core.getBooleanInput.mockReset();
        core.getMultilineInput.mockReset();
    });

    it('resolves the promise if package artifact upload fails', async () => {
        expect.assertions(1);

        core.getInput.mockImplementation((inputName) => inputs[inputName]);
        core.getBooleanInput.mockImplementation((inputName) => inputs[inputName]);
        core.getMultilineInput.mockImplementation((inputName) => inputs[inputName]);

        setupEnv.mockResolvedValue(env);
        downloadArtifact.mockResolvedValue(true);
        buildPackage.mockResolvedValue(true);
        uploadArtifact.mockResolvedValue(false);

        await expect(main.call()).resolves.toStrictEqual(outputs);

        setupEnv.mockReset();
        downloadArtifact.mockReset();
        buildPackage.mockReset();
        uploadArtifact.mockReset();
        core.getInput.mockReset();
        core.getBooleanInput.mockReset();
        core.getMultilineInput.mockReset();
    });

    it('resolves the promise if code coverage artifact upload fails', async () => {
        expect.assertions(1);

        core.getInput.mockImplementation((inputName) => inputs[inputName]);
        core.getBooleanInput.mockImplementation((inputName) => inputs[inputName]);
        core.getMultilineInput.mockImplementation((inputName) => inputs[inputName]);

        setupEnv.mockResolvedValue(env);
        downloadArtifact.mockResolvedValue(true);
        buildPackage.mockResolvedValue(true);
        uploadArtifact.mockImplementation((repository) => {
            if (repository === 'coverage-repo') return false;
            return true;
        });

        await expect(main.call()).resolves.toStrictEqual(outputs);

        setupEnv.mockReset();
        downloadArtifact.mockReset();
        buildPackage.mockReset();
        uploadArtifact.mockReset();
        core.getInput.mockReset();
        core.getBooleanInput.mockReset();
        core.getMultilineInput.mockReset();
    });

    it('rejects the promise if cmake options are not in expected format', async () => {
        expect.assertions(1);

        const cmakeOptions = [
            'owner/repo "-DCMAKE_VAR=1"',
        ];

        core.getInput.mockImplementation((inputName) => inputs[inputName]);
        core.getBooleanInput.mockImplementation((inputName) => inputs[inputName]);
        core.getMultilineInput.mockImplementation((inputName) => {
            if (inputName === 'cmake_options') return cmakeOptions;
            return inputs[inputName];
        });

        setupEnv.mockResolvedValue(env);

        await expect(main.call()).rejects.toBe(`Unexpected CMake option, must be in 'owner/repo: option' format: ${cmakeOptions[0]}`);

        setupEnv.mockReset();
        core.getInput.mockReset();
        core.getBooleanInput.mockReset();
        core.getMultilineInput.mockReset();
    });

    it('rejects the promise if environment setup errors out', async () => {
        expect.assertions(1);

        core.getInput.mockImplementation((inputName) => inputs[inputName]);
        core.getBooleanInput.mockImplementation((inputName) => inputs[inputName]);
        core.getMultilineInput.mockImplementation((inputName) => inputs[inputName]);

        setupEnv.mockImplementation(() => Promise.resolve());

        await expect(main.call()).rejects.toBe('Error setting up build environment');

        setupEnv.mockReset();
        core.getInput.mockReset();
        core.getBooleanInput.mockReset();
        core.getMultilineInput.mockReset();
    });

    it('rejects the promise if dependency name is in unexpected format', async () => {
        expect.assertions(1);

        const unexpectedDependencyName = 'owner-repo@branch';

        core.getInput.mockImplementation((inputName) => inputs[inputName]);
        core.getBooleanInput.mockImplementation((inputName) => inputs[inputName]);
        core.getMultilineInput.mockImplementation((inputName) => {
            if (inputName === 'dependencies') return [unexpectedDependencyName];
            return inputs[inputName];
        });

        setupEnv.mockResolvedValue(env);

        await expect(main.call()).rejects.toBe(`Unexpected dependency name, must be in 'owner/repo[@branch]' format: ${unexpectedDependencyName}`);

        setupEnv.mockReset();
        core.getInput.mockReset();
        core.getBooleanInput.mockReset();
        core.getMultilineInput.mockReset();
    });

    it('rejects the promise if dependency repository download fails', async () => {
        expect.assertions(1);

        core.getInput.mockImplementation((inputName) => inputs[inputName]);
        core.getBooleanInput.mockImplementation((inputName) => inputs[inputName]);
        core.getMultilineInput.mockImplementation((inputName) => inputs[inputName]);

        setupEnv.mockResolvedValue(env);
        downloadArtifact.mockResolvedValue(false);
        restoreCache.mockResolvedValue(false);
        downloadRepository.mockResolvedValue(false);

        await expect(main.call()).rejects.toBe('Error downloading repository');

        setupEnv.mockReset();
        downloadArtifact.mockReset();
        restoreCache.mockReset();
        downloadRepository.mockReset();
        core.getInput.mockReset();
        core.getBooleanInput.mockReset();
        core.getMultilineInput.mockReset();
    });

    it('rejects the promise if dependency is not built', async () => {
        expect.assertions(1);

        core.getInput.mockImplementation((inputName) => inputs[inputName]);
        core.getBooleanInput.mockImplementation((inputName) => inputs[inputName]);
        core.getMultilineInput.mockImplementation((inputName) => inputs[inputName]);

        setupEnv.mockResolvedValue(env);
        downloadArtifact.mockResolvedValue(false);
        restoreCache.mockResolvedValue(false);
        downloadRepository.mockResolvedValue(true);
        buildPackage.mockResolvedValue(false);

        await expect(main.call()).rejects.toBe('Error building dependency');

        setupEnv.mockReset();
        downloadArtifact.mockReset();
        restoreCache.mockReset();
        downloadRepository.mockReset();
        buildPackage.mockReset();
        core.getInput.mockReset();
        core.getBooleanInput.mockReset();
        core.getMultilineInput.mockReset();
    });

    it('rejects the promise if package build fails', async () => {
        expect.assertions(1);

        core.getInput.mockImplementation((inputName) => inputs[inputName]);
        core.getBooleanInput.mockImplementation((inputName) => inputs[inputName]);
        core.getMultilineInput.mockImplementation((inputName) => inputs[inputName]);

        setupEnv.mockResolvedValue(env);
        downloadArtifact.mockResolvedValue(true);
        buildPackage.mockImplementation((repository) => {
            if (repository === 'owner/repo') return false;
            return true
        });

        await expect(main.call()).rejects.toBe('Error building package');

        setupEnv.mockReset();
        downloadArtifact.mockReset();
        buildPackage.mockReset();
        core.getInput.mockReset();
        core.getBooleanInput.mockReset();
        core.getMultilineInput.mockReset();
    });

    it('rejects the promise if an error is thrown', async () => {
        expect.assertions(1);

        core.getInput.mockImplementation((inputName) => inputs[inputName]);
        core.getBooleanInput.mockImplementation((inputName) => inputs[inputName]);
        core.getMultilineInput.mockImplementation((inputName) => inputs[inputName]);

        const errorMessage = 'Oops!';

        setupEnv.mockImplementation(() => {
            throw Error(errorMessage);
        });

        await expect(main.call()).rejects.toBe(errorMessage);

        setupEnv.mockReset();
        core.getInput.mockReset();
        core.getBooleanInput.mockReset();
        core.getMultilineInput.mockReset();
    });
});
