const process = require('process');
const fs = require('fs');
const path = require('path');
const core = require('@actions/core');
const exec = require('@actions/exec');
const { mkdirP } = require('@actions/io');

const buildPackage = require('../src/build-package');

jest.mock('@actions/core');
jest.mock('@actions/exec');
jest.mock('@actions/io');

// Test parameters.
const repository = 'owner/repo';
const repo = 'repo';
const sourceDir = '/path/to/source/repo';
const installDir = '/path/to/install/repo';
const buildDir = `${sourceDir}/build`;
const coverageFile = `${buildDir}/coverage.info`;
const coverageDir = `${buildDir}/coverage`;
const cmake = false;
const cmakeOptions = null;
const test = true;
const codeCoverage = true;
const os = 'ubuntu-20.04';
const macOs = 'macos-10.15';
const compiler = 'gnu-10';

// Base environment object, we will take care not to modify it.
const env = {
    CC: 'gcc-10',
    CXX: 'g++-10',
    FC: 'gfortran-10',
    CMAKE_VERSION: '3.21.1',
};

describe('buildPackage', () => {
    it('returns true on success', async () => {
        expect.assertions(1);

        const testEnv = {
            ...env,
        };

        const isBuilt = await buildPackage(repository, sourceDir, installDir, test, codeCoverage, cmake, cmakeOptions, os, compiler, testEnv);

        expect(isBuilt).toBe(true);
    });

    it('returns false on failure', async () => {
        expect.assertions(1);

        const testEnv = {
            ...env,
        };

        exec.exec.mockImplementation(() => Promise.resolve(1));

        const isBuilt = await buildPackage(repository, sourceDir, installDir, cmake, cmakeOptions, test, codeCoverage, os, compiler, testEnv);

        expect(isBuilt).toBe(false);

        exec.exec.mockReset();
    });

    it('supports cmake switch', async () => {
        expect.assertions(3);

        const testEnv = {
            ...env,
        };

        let isBuilt = await buildPackage(repository, sourceDir, installDir, !cmake, cmakeOptions, test, codeCoverage, os, compiler, testEnv);

        expect(isBuilt).toBe(true);
        expect(core.info).toHaveBeenCalledWith('==> configurePath: cmake');
        expect(core.info).toHaveBeenCalledWith(`==> configureOptions: -DCMAKE_INSTALL_PREFIX=${installDir}`);
    });

    it('determines correct ecbuild path', async () => {
        expect.assertions(6);

        const testEnv1 = {
            ...env,
        };

        let isBuilt = await buildPackage(repository, sourceDir, installDir, cmake, cmakeOptions, test, codeCoverage, os, compiler, testEnv1);

        expect(isBuilt).toBe(true);
        expect(core.info).toHaveBeenCalledWith('==> configurePath: ecbuild');
        expect(core.info).toHaveBeenCalledWith(`==> configureOptions: --prefix=${installDir}`);

        core.info.mockReset();

        const testEnv2 = {
            ...env,
        };

        isBuilt = await buildPackage('ecmwf/ecbuild', sourceDir, installDir, cmake, cmakeOptions, test, codeCoverage, os, compiler, testEnv2);

        expect(isBuilt).toBe(true);
        expect(core.info).toHaveBeenCalledWith(`==> configurePath: ${sourceDir}/bin/ecbuild`);
        expect(core.info).toHaveBeenCalledWith(`==> configureOptions: --prefix=${installDir}`);
    });

    it('supports cmake options', async () => {
        expect.assertions(6);

        const testCmakeOptions = '-DOPT1=ON -DOPT2=OFF';

        const testEnv1 = {
            ...env,
        };

        let isBuilt = await buildPackage(repository, sourceDir, installDir, !cmake, testCmakeOptions, test, codeCoverage, os, compiler, testEnv1);

        expect(isBuilt).toBe(true);
        expect(core.info).toHaveBeenCalledWith('==> configurePath: cmake');
        expect(core.info).toHaveBeenCalledWith(`==> configureOptions: -DCMAKE_INSTALL_PREFIX=${installDir},${testCmakeOptions}`);

        core.info.mockReset();

        const testEnv2 = {
            ...env,
        };

        isBuilt = await buildPackage(repository, sourceDir, installDir, cmake, testCmakeOptions, test, codeCoverage, os, compiler, testEnv2);

        expect(isBuilt).toBe(true);
        expect(core.info).toHaveBeenCalledWith('==> configurePath: ecbuild');
        expect(core.info).toHaveBeenCalledWith(`==> configureOptions: --prefix=${installDir},${testCmakeOptions}`);
    });

    it('creates build subdirectory in source directory', async () => {
        expect.assertions(4);

        const testEnv = {
            ...env,
        };

        const isBuilt = await buildPackage(repository, sourceDir, installDir, cmake, cmakeOptions, test, codeCoverage, os, compiler, testEnv);

        expect(isBuilt).toBe(true);
        expect(core.info).toHaveBeenCalledWith(`==> srcDir: ${sourceDir}`);
        expect(core.info).toHaveBeenCalledWith(`==> buildDir: ${buildDir}`);
        expect(mkdirP).toHaveBeenCalledWith(buildDir);
    });

    it('reads compiler flags from a magic path', async () => {
        expect.assertions(3);

        const testEnv = {
            ...env,
        };

        const compilerFlagsFile = path.join(sourceDir, '.github', '.compiler-flags');
        const compilerFlagsFileContent = '-DENABLE_FORTRAN=ON';

        const existsSync = jest.spyOn(fs, 'existsSync');
        existsSync.mockImplementation((path) => {
            if (path === compilerFlagsFile) return true;
        });

        const readFileSync = jest.spyOn(fs, 'readFileSync');
        readFileSync.mockImplementation((path) => {
            if (path === compilerFlagsFile) return compilerFlagsFileContent;
        });

        const isBuilt = await buildPackage(repository, sourceDir, installDir, cmake, cmakeOptions, test, !codeCoverage, os, compiler, testEnv);

        expect(isBuilt).toBe(true);
        expect(core.info).toHaveBeenCalledWith(`==> Found ${compilerFlagsFile}: ${compilerFlagsFileContent}`);
        expect(core.info).toHaveBeenCalledWith(`==> compilerFlags: ${compilerFlagsFileContent}`);

        existsSync.mockReset();
        readFileSync.mockReset();
    });

    it('catches errors when installing lcov', async () => {
        expect.assertions(1);

        const testEnv = {
            ...env,
        };

        exec.exec.mockImplementation((command, args) => {
            if (
                command === 'sudo'
                && args[0] === 'apt-get'
                && args[1] === '-y'
                && args[2] === '-q'
                && args[3] === 'install'
                && args[4] === 'lcov'
            ) {
                return Promise.resolve(1);
            }

            return Promise.resolve(0);
        });

        const isBuilt = await buildPackage(repository, sourceDir, installDir, cmake, cmakeOptions, test, codeCoverage, os, compiler, testEnv);

        expect(isBuilt).toBe(false);

        exec.exec.mockReset();
    });

    it('adds code coverage compiler flags on supported platform', async () => {
        expect.assertions(3);

        const testEnv = {
            ...env,
        };

        const isBuilt = await buildPackage(repository, sourceDir, installDir, cmake, cmakeOptions, test, codeCoverage, os, compiler, testEnv);

        expect(isBuilt).toBe(true);
        expect(core.info).toHaveBeenCalledWith('==> Code coverage collection enabled, installing lcov...');
        expect(core.info).toHaveBeenCalledWith("==> compilerFlags: -DCMAKE_C_FLAGS='--coverage' -DCMAKE_CXX_FLAGS='--coverage' -DCMAKE_Fortran_FLAGS='--coverage'");
    });

    it('warns if code coverage in unsupported on current platforms', async () => {
        expect.assertions(2);

        const testEnv = {
            ...env,
        };

        const isBuilt = await buildPackage(repository, sourceDir, installDir, cmake, cmakeOptions, test, codeCoverage, macOs, compiler, testEnv);

        expect(isBuilt).toBe(true);
        expect(core.info).toHaveBeenCalledWith(`Skipping code coverage collection on unsupported platform: ${compiler}@${macOs}`);
    });

    it('extends current environment with additional variables', async () => {
        expect.assertions(5);

        const testEnv = {
            ...env,
        };

        const isBuilt = await buildPackage(repository, sourceDir, installDir, cmake, cmakeOptions, test, codeCoverage, os, compiler, testEnv);

        expect(isBuilt).toBe(true);

        core.info.mock.calls.forEach((call) => {
            const arg = call[0];
            if (!/^==> options\.env:/.test(arg)) return;

            ['CC', 'CXX', 'FC', 'CMAKE_VERSION'].forEach((envKey) => {
                expect(arg).toContain(`"${envKey}": "${env[envKey]}"`);
            });
        });
    });

    it('creates install directory', async () => {
        expect.assertions(2);

        const testEnv = {
            ...env,
        };

        const isBuilt = await buildPackage(repository, sourceDir, installDir, cmake, cmakeOptions, test, codeCoverage, os, compiler, testEnv);

        expect(isBuilt).toBe(true);
        expect(mkdirP).toHaveBeenCalledWith(installDir);
    });

    it('runs configure, build, test, code coverage and install commands', async () => {
        expect.assertions(9);

        const testEnv = {
            ...env,
        };

        const options = {
            cwd: buildDir,
            shell: '/bin/bash -eux',
            env: {
                ...process.env,
                ...testEnv,
                'CTEST_OUTPUT_ON_FAILURE': '1',
            },
        };

        const isBuilt = await buildPackage(repository, sourceDir, installDir, cmake, cmakeOptions, test, codeCoverage, os, compiler, testEnv);

        expect(isBuilt).toBe(true);
        expect(exec.exec).toHaveBeenCalledWith('env', ['ecbuild', `--prefix=${installDir}`, "-DCMAKE_C_FLAGS='--coverage'", "-DCMAKE_CXX_FLAGS='--coverage'", "-DCMAKE_Fortran_FLAGS='--coverage'", sourceDir], options);
        expect(exec.exec).toHaveBeenCalledWith('env', ['make', '-j2'], options);
        expect(exec.exec).toHaveBeenCalledWith('env', ['make', 'test', '-j2'], options);
        expect(exec.exec).toHaveBeenCalledWith('env', ['lcov', '--capture', '--directory', buildDir, '--output-file', coverageFile], options);
        expect(exec.exec).toHaveBeenCalledWith('env', ['lcov', '--remove', coverageFile, '--output-file', coverageFile, '/usr/*', `${path.dirname(installDir)}/*`, `${buildDir}/*`], options);
        expect(exec.exec).toHaveBeenCalledWith('env', ['lcov', '--list', coverageFile], options);
        expect(exec.exec).toHaveBeenCalledWith('env', ['genhtml', coverageFile, '--output-directory', coverageDir], options);
        expect(exec.exec).toHaveBeenCalledWith('env', ['make', 'install'], options);
    });

    it('runs configure, build, test and install commands', async () => {
        expect.assertions(9);

        const testEnv = {
            ...env,
        };

        const options = {
            cwd: buildDir,
            shell: '/bin/bash -eux',
            env: {
                ...process.env,
                ...testEnv,
                'CTEST_OUTPUT_ON_FAILURE': '1',
            },
        };

        const isBuilt = await buildPackage(repository, sourceDir, installDir, cmake, cmakeOptions, test, !codeCoverage, os, compiler, testEnv);

        expect(isBuilt).toBe(true);
        expect(exec.exec).toHaveBeenCalledWith('env', ['ecbuild', `--prefix=${installDir}`, sourceDir], options);
        expect(exec.exec).toHaveBeenCalledWith('env', ['make', '-j2'], options);
        expect(exec.exec).toHaveBeenCalledWith('env', ['make', 'test', '-j2'], options);
        expect(exec.exec).not.toHaveBeenCalledWith('env', ['lcov', '--capture', '--directory', buildDir, '--output-file', coverageFile], options);
        expect(exec.exec).not.toHaveBeenCalledWith('env', ['lcov', '--remove', coverageFile, '--output-file', coverageFile, '/usr/*', `${path.dirname(installDir)}/*`, `${buildDir}/*`], options);
        expect(exec.exec).not.toHaveBeenCalledWith('env', ['lcov', '--list', coverageFile], options);
        expect(exec.exec).not.toHaveBeenCalledWith('env', ['genhtml', coverageFile, '--output-directory', coverageDir], options);
        expect(exec.exec).toHaveBeenCalledWith('env', ['make', 'install'], options);
    });

    it('runs configure, build and install commands', async () => {
        expect.assertions(9);

        const testEnv = {
            ...env,
        };

        const options = {
            cwd: buildDir,
            shell: '/bin/bash -eux',
            env: {
                ...process.env,
                ...testEnv,
            },
        };

        const isBuilt = await buildPackage(repository, sourceDir, installDir, cmake, cmakeOptions, !test, !codeCoverage, os, compiler, testEnv);

        expect(isBuilt).toBe(true);
        expect(exec.exec).toHaveBeenCalledWith('env', ['ecbuild', `--prefix=${installDir}`, sourceDir], options);
        expect(exec.exec).toHaveBeenCalledWith('env', ['make', '-j2'], options);
        expect(exec.exec).not.toHaveBeenCalledWith('env', ['make', 'test', '-j2'], options);
        expect(exec.exec).not.toHaveBeenCalledWith('env', ['lcov', '--capture', '--directory', buildDir, '--output-file', coverageFile], options);
        expect(exec.exec).not.toHaveBeenCalledWith('env', ['lcov', '--remove', coverageFile, '--output-file', coverageFile, '/usr/*', `${path.dirname(installDir)}/*`, `${buildDir}/*`], options);
        expect(exec.exec).not.toHaveBeenCalledWith('env', ['lcov', '--list', coverageFile], options);
        expect(exec.exec).not.toHaveBeenCalledWith('env', ['genhtml', coverageFile, '--output-directory', coverageDir], options);
        expect(exec.exec).toHaveBeenCalledWith('env', ['make', 'install'], options);
    });

    it('returns false if configure command failed', async () => {
        expect.assertions(1);

        const testEnv = {
            ...env,
        };

        exec.exec.mockImplementation((command, args) => {
            if (
                command === 'env'
                && args[0] === 'ecbuild'
                && args[1] === `--prefix=${installDir}`
                && args[2] === sourceDir
            ) {
                return Promise.resolve(1);
            }

            return Promise.resolve(0);
        });

        const isBuilt = await buildPackage(repository, sourceDir, installDir, cmake, cmakeOptions, !test, !codeCoverage, os, compiler, testEnv);

        expect(isBuilt).toBe(false);

        exec.exec.mockReset();
    });

    it('returns false if build command failed', async () => {
        expect.assertions(1);

        const testEnv = {
            ...env,
        };

        exec.exec.mockImplementation((command, args) => {
            if (
                command === 'env'
                && args[0] === 'make'
                && args[1] === '-j2'
            ) {
                return Promise.resolve(1);
            }

            return Promise.resolve(0);
        });

        const isBuilt = await buildPackage(repository, sourceDir, installDir, cmake, cmakeOptions, !test, !codeCoverage, os, compiler, testEnv);

        expect(isBuilt).toBe(false);

        exec.exec.mockReset();
    });

    it('returns false if test command failed', async () => {
        expect.assertions(1);

        const testEnv = {
            ...env,
        };

        exec.exec.mockImplementation((command, args) => {
            if (
                command === 'env'
                && args[0] === 'make'
                && args[1] === 'test'
            ) {
                return Promise.resolve(1);
            }

            return Promise.resolve(0);
        });

        const isBuilt = await buildPackage(repository, sourceDir, installDir, cmake, cmakeOptions, test, codeCoverage, os, compiler, testEnv);

        expect(isBuilt).toBe(false);

        exec.exec.mockReset();
    });

    it('returns false if code coverage collection command failed', async () => {
        expect.assertions(1);

        const testEnv = {
            ...env,
        };

        exec.exec.mockImplementation((command, args) => {
            if (
                command === 'env'
                && args[0] === 'lcov'
                && args[1] === '--capture'
                && args[2] === '--directory'
                && args[3] === buildDir
                && args[4] === '--output-file'
                && args[5] === coverageFile
            ) {
                return Promise.resolve(1);
            }

            return Promise.resolve(0);
        });

        const isBuilt = await buildPackage(repository, sourceDir, installDir, cmake, cmakeOptions, test, codeCoverage, os, compiler, testEnv);

        expect(isBuilt).toBe(false);

        exec.exec.mockReset();
    });

    it('returns false if code coverage cleanup command failed', async () => {
        expect.assertions(1);

        const testEnv = {
            ...env,
        };

        exec.exec.mockImplementation((command, args) => {
            if (
                command === 'env'
                && args[0] === 'lcov'
                && args[1] === '--remove'
                && args[2] === coverageFile
                && args[3] === '--output-file'
                && args[4] === coverageFile
                && args[5] === '/usr/*'
                && args[6] === `${path.dirname(installDir)}/*`
                && args[7] === `${buildDir}/*`
            ) {
                return Promise.resolve(1);
            }

            return Promise.resolve(0);
        });

        const isBuilt = await buildPackage(repository, sourceDir, installDir, cmake, cmakeOptions, test, codeCoverage, os, compiler, testEnv);

        expect(isBuilt).toBe(false);

        exec.exec.mockReset();
    });

    it('returns false if code coverage report listing command failed', async () => {
        expect.assertions(1);

        const testEnv = {
            ...env,
        };

        exec.exec.mockImplementation((command, args) => {
            if (
                command === 'env'
                && args[0] === 'lcov'
                && args[1] === '--list'
                && args[2] === coverageFile
            ) {
                return Promise.resolve(1);
            }

            return Promise.resolve(0);
        });

        const isBuilt = await buildPackage(repository, sourceDir, installDir, cmake, cmakeOptions, test, codeCoverage, os, compiler, testEnv);

        expect(isBuilt).toBe(false);

        exec.exec.mockReset();
    });

    it('returns false if code coverage report generation command failed', async () => {
        expect.assertions(1);

        const testEnv = {
            ...env,
        };

        exec.exec.mockImplementation((command, args) => {
            if (
                command === 'env'
                && args[0] === 'genhtml'
                && args[1] === coverageFile
                && args[2] === '--output-directory'
                && args[3] === coverageDir
            ) {
                return Promise.resolve(1);
            }

            return Promise.resolve(0);
        });

        const isBuilt = await buildPackage(repository, sourceDir, installDir, cmake, cmakeOptions, test, codeCoverage, os, compiler, testEnv);

        expect(isBuilt).toBe(false);

        exec.exec.mockReset();
    });

    it('returns false if install command failed', async () => {
        expect.assertions(1);

        const testEnv = {
            ...env,
        };

        exec.exec.mockImplementation((command, args) => {
            if (
                command === 'env'
                && args[0] === 'make'
                && args[1] === 'install'
            ) {
                return Promise.resolve(1);
            }

            return Promise.resolve(0);
        });

        const isBuilt = await buildPackage(repository, sourceDir, installDir, cmake, cmakeOptions, test, codeCoverage, os, compiler, testEnv);

        expect(isBuilt).toBe(false);

        exec.exec.mockReset();
    });

    it('extends environment object with install paths', async () => {
        expect.assertions(4);

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
            [`${repo}_DIR`]: installDir,
            [`${repo.toUpperCase()}_DIR`]: installDir,
            [`${repo.toUpperCase()}_PATH`]: installDir,
        };

        const isBuilt = await buildPackage(repository, sourceDir, installDir, cmake, cmakeOptions, test, !codeCoverage, os, compiler, testEnv);

        expect(isBuilt).toBe(true);
        expect(testEnv).toStrictEqual(expectedEnv);
        expect(testEnv).not.toHaveProperty('COVERAGE_FILE');
        expect(testEnv).not.toHaveProperty('COVERAGE_DIR');
    });

    it('extends environment object with code coverage paths', async () => {
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
            [`${repo}_DIR`]: installDir,
            [`${repo.toUpperCase()}_DIR`]: installDir,
            [`${repo.toUpperCase()}_PATH`]: installDir,
            COVERAGE_FILE: coverageFile,
            COVERAGE_DIR: coverageDir,
        };

        const isBuilt = await buildPackage(repository, sourceDir, installDir, cmake, cmakeOptions, test, codeCoverage, os, compiler, testEnv);

        expect(isBuilt).toBe(true);
        expect(testEnv).toStrictEqual(expectedEnv);
    });

    it('returns false if command throws an error', async () => {
        expect.assertions(1);

        const testEnv = {
            ...env,
        };

        exec.exec.mockImplementation(() => {
            throw Error('spawn /bin/sh ENOENT');
        });

        const isBuilt = await buildPackage(repository, sourceDir, installDir, cmake, cmakeOptions, test, codeCoverage, os, compiler, testEnv);

        expect(isBuilt).toBe(false);

        exec.exec.mockReset();
    });
});
