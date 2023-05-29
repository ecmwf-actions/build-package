import process from 'process';
import fs from 'fs';
import path from 'path';
import * as core from '@actions/core';
import * as exec from '@actions/exec';
import { mkdirP } from '@actions/io';

import buildPackage from '../src/build-package';
import { EnvironmentVariables } from '../src/types/env-functions';

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
const ctestOptions = null;
const test = true;
const codeCoverage = true;
const os = 'ubuntu-20.04';
const macOs = 'macos-10.15';
const compiler = 'gnu-10';
const errorObject = new Error('spawn /bin/sh ENOENT');
const emptyObject = {};
const parallelismFactor = '2';

// Base environment object, we will take care not to modify it.
const env: EnvironmentVariables = {
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

        (exec.exec as jest.Mock).mockResolvedValue(0);

        const isBuilt = await buildPackage(repository, sourceDir, installDir, cmake, cmakeOptions, ctestOptions, test, codeCoverage, os, compiler, testEnv, parallelismFactor);

        expect(isBuilt).toBe(true);
    });

    it('returns false on failure', async () => {
        expect.assertions(1);

        const testEnv = {
            ...env,
        };

        (exec.exec as jest.Mock).mockResolvedValue(1);

        const isBuilt = await buildPackage(repository, sourceDir, installDir, cmake, cmakeOptions, ctestOptions, test, codeCoverage, os, compiler, testEnv, parallelismFactor);

        expect(isBuilt).toBe(false);
    });

    it('supports cmake switch', async () => {
        expect.assertions(3);

        const testEnv = {
            ...env,
        };

        (exec.exec as jest.Mock).mockResolvedValue(0);

        const isBuilt = await buildPackage(repository, sourceDir, installDir, !cmake, cmakeOptions, ctestOptions, test, codeCoverage, os, compiler, testEnv, parallelismFactor);

        expect(isBuilt).toBe(true);
        expect(core.info).toHaveBeenCalledWith('==> configurePath: cmake');
        expect(core.info).toHaveBeenCalledWith(`==> configureOptions: -DCMAKE_INSTALL_PREFIX=${installDir},-DCMAKE_C_FLAGS='--coverage',-DCMAKE_CXX_FLAGS='--coverage',-DCMAKE_Fortran_FLAGS='--coverage'`);
    });

    it('determines correct ecbuild path', async () => {
        expect.assertions(6);

        const testEnv1 = {
            ...env,
        };

        (exec.exec as jest.Mock).mockResolvedValue(0);

        let isBuilt = await buildPackage(repository, sourceDir, installDir, cmake, cmakeOptions, ctestOptions, test, !codeCoverage, os, compiler, testEnv1, parallelismFactor);

        expect(isBuilt).toBe(true);
        expect(core.info).toHaveBeenCalledWith('==> configurePath: ecbuild');
        expect(core.info).toHaveBeenCalledWith(`==> configureOptions: --prefix=${installDir}`);

        (core.info as jest.Mock).mockReset();

        const testEnv2 = {
            ...env,
        };

        isBuilt = await buildPackage('ecmwf/ecbuild', sourceDir, installDir, cmake, cmakeOptions, ctestOptions, test, !codeCoverage, os, compiler, testEnv2, parallelismFactor);

        expect(isBuilt).toBe(true);
        expect(core.info).toHaveBeenCalledWith(`==> configurePath: ${sourceDir}/bin/ecbuild`);
        expect(core.info).toHaveBeenCalledWith(`==> configureOptions: --prefix=${installDir}`);
    });

    it('supports cmake options', async () => {
        expect.assertions(6);

        const testCmakeOptions = [
            '-DOPT1=ON',
            '-DOPT2=OFF',
            '-DOPT3="A string with spaces"',
            "OPT4='Hello, world!'",
            'OPT5=foo',
        ];

        const cmakeOptions = testCmakeOptions.join(' ');

        const testEnv1 = {
            ...env,
        };

        (exec.exec as jest.Mock).mockResolvedValue(0);

        let isBuilt = await buildPackage(repository, sourceDir, installDir, !cmake, cmakeOptions, ctestOptions, test, !codeCoverage, os, compiler, testEnv1, parallelismFactor);

        expect(isBuilt).toBe(true);
        expect(core.info).toHaveBeenCalledWith('==> configurePath: cmake');
        expect(core.info).toHaveBeenCalledWith(`==> configureOptions: -DCMAKE_INSTALL_PREFIX=${installDir},${testCmakeOptions}`);

        (core.info as jest.Mock).mockReset();

        const testEnv2 = {
            ...env,
        };

        isBuilt = await buildPackage(repository, sourceDir, installDir, cmake, cmakeOptions, ctestOptions, test, !codeCoverage, os, compiler, testEnv2, parallelismFactor);

        expect(isBuilt).toBe(true);
        expect(core.info).toHaveBeenCalledWith('==> configurePath: ecbuild');
        expect(core.info).toHaveBeenCalledWith(`==> configureOptions: --prefix=${installDir},${testCmakeOptions}`);
    });

    it('supports ctest options', async () => {
        expect.assertions(4);

        const testCtestOptions = [
            '-R',
            '<include-regex>',
            '-E',
            '<exclude-regex>',
        ];

        const ctestOptions = testCtestOptions.join(' ');

        const testEnv1 = {
            ...env,
        };

        (exec.exec as jest.Mock).mockResolvedValue(0);

        let isBuilt = await buildPackage(repository, sourceDir, installDir, !cmake, cmakeOptions, ctestOptions, test, !codeCoverage, os, compiler, testEnv1, parallelismFactor);

        expect(isBuilt).toBe(true);
        expect(core.info).toHaveBeenCalledWith(`==> testOptions: ${testCtestOptions}`);

        (core.info as jest.Mock).mockReset();

        const testEnv2 = {
            ...env,
        };

        isBuilt = await buildPackage(repository, sourceDir, installDir, cmake, cmakeOptions, ctestOptions, test, !codeCoverage, os, compiler, testEnv2, parallelismFactor);

        expect(isBuilt).toBe(true);
        expect(core.info).toHaveBeenCalledWith(`==> testOptions: ${testCtestOptions}`);
    });

    it('creates build subdirectory in source directory', async () => {
        expect.assertions(4);

        const testEnv = {
            ...env,
        };

        (exec.exec as jest.Mock).mockResolvedValue(0);

        const isBuilt = await buildPackage(repository, sourceDir, installDir, cmake, cmakeOptions, ctestOptions, test, codeCoverage, os, compiler, testEnv, parallelismFactor);

        expect(isBuilt).toBe(true);
        expect(core.info).toHaveBeenCalledWith(`==> srcDir: ${sourceDir}`);
        expect(core.info).toHaveBeenCalledWith(`==> buildDir: ${buildDir}`);
        expect(mkdirP).toHaveBeenCalledWith(buildDir);
    });

    it('reads cmake options from a magic path', async () => {
        expect.assertions(3);

        const testEnv = {
            ...env,
        };

        const testCmakeOptions = [
            '-DENABLE_FORTRAN=ON',
            'CMAKE_BUILD_TYPE=Debug',
            'CMAKE_VERBOSE_MAKEFILE=ON',
        ];

        const cmakeOptionsFile = path.join(sourceDir, '.github', '.cmake-options');
        const cmakeOptionsFileContent = testCmakeOptions.join(' ');

        (exec.exec as jest.Mock).mockResolvedValue(0);

        const existsSync = jest.spyOn(fs, 'existsSync');
        existsSync.mockImplementation((path) => {
            if (path === cmakeOptionsFile) return true;
            return false;
        });

        const readFileSync = jest.spyOn(fs, 'readFileSync');
        readFileSync.mockImplementation((path) => {
            if (path === cmakeOptionsFile) return cmakeOptionsFileContent;
            return '';
        });

        const isBuilt = await buildPackage(repository, sourceDir, installDir, cmake, cmakeOptions, ctestOptions, test, !codeCoverage, os, compiler, testEnv, parallelismFactor);

        expect(isBuilt).toBe(true);
        expect(core.info).toHaveBeenCalledWith(`==> Found ${cmakeOptionsFile}: ${cmakeOptionsFileContent}`);
        expect(core.info).toHaveBeenCalledWith(`==> configureOptions: --prefix=${installDir},${testCmakeOptions}`);
    });

    it('supports backwards compatible magic path for cmake options', async () => {
        expect.assertions(4);

        const testEnv = {
            ...env,
        };

        const testDeprecatedCmakeOptions = [
            '-DENABLE_FORTRAN=ON',
            'CMAKE_BUILD_TYPE=Debug',
            'CMAKE_VERBOSE_MAKEFILE=ON',
        ];

        const deprecatedCmakeOptionsFile = path.join(sourceDir, '.github', '.compiler-flags');
        const deprecatedCmakeOptionsFileContent = testDeprecatedCmakeOptions.join(' ');

        (exec.exec as jest.Mock).mockResolvedValue(0);

        const existsSync = jest.spyOn(fs, 'existsSync');
        existsSync.mockImplementation((path) => {
            if (path === deprecatedCmakeOptionsFile) return true;
            return false;
        });

        const readFileSync = jest.spyOn(fs, 'readFileSync');
        readFileSync.mockImplementation((path) => {
            if (path === deprecatedCmakeOptionsFile) return deprecatedCmakeOptionsFileContent;
            return '';
        });

        const isBuilt = await buildPackage(repository, sourceDir, installDir, cmake, cmakeOptions, ctestOptions, test, !codeCoverage, os, compiler, testEnv, parallelismFactor);

        expect(isBuilt).toBe(true);
        expect(core.info).toHaveBeenCalledWith(`==> Found ${deprecatedCmakeOptionsFile}: ${deprecatedCmakeOptionsFileContent}`);
        expect(core.warning).toHaveBeenCalledWith('Magic file path `.github/.compiler-flags` has been deprecated, please migrate to `.github/.cmake-options`');
        expect(core.info).toHaveBeenCalledWith(`==> configureOptions: --prefix=${installDir},${testDeprecatedCmakeOptions}`);
    });

    it('expands shell variables in all arguments', async () => {
        expect.assertions(4);

        const testCmakeOptions = [
            '-DEXPANDED_OPT1=$VAR1',
            '-DEXPANDED_OPT2=${VAR2}',
            '-DEXPANDED_OPT3="A string with $VAR3 and $VAR4"',
            '-DEXPANDED_OPT4="A string with double $VAR5 and $VAR5"',
            '-DEXPANDED_OPT5=$MY_VAR',
            '-DEXPANDED_OPT6=${MY_VAR}',
        ];

        const cmakeOptions = testCmakeOptions.join(' ');

        const testEnv1 = {
            ...env,
            'VAR1': 'val1',
            'VAR2': 'val2',
            'VAR3': 'val3',
            'VAR4': 'val4',
            'VAR5': 'val5',
            'MY_VAR': 'my-val',
        };

        const expandedTestCmakeOptions = [
            `-DEXPANDED_OPT1=${testEnv1.VAR1}`,
            `-DEXPANDED_OPT2=${testEnv1.VAR2}`,
            `-DEXPANDED_OPT3="A string with ${testEnv1.VAR3} and ${testEnv1.VAR4}"`,
            `-DEXPANDED_OPT4="A string with double ${testEnv1.VAR5} and ${testEnv1.VAR5}"`,
            `-DEXPANDED_OPT5=${testEnv1.MY_VAR}`,
            `-DEXPANDED_OPT6=${testEnv1.MY_VAR}`,
        ];

        const testCtestOptions = [
            '-R',
            '$VAR1',
            '-E',
            '$VAR2',
        ];

        const ctestOptions = testCtestOptions.join(' ');

        const expandedTestCtestOptions = [
            '-R',
            testEnv1.VAR1,
            '-E',
            testEnv1.VAR2,
        ];

        (exec.exec as jest.Mock).mockResolvedValue(0);

        const isBuilt = await buildPackage(repository, sourceDir, installDir, cmake, cmakeOptions, ctestOptions, test, !codeCoverage, os, compiler, testEnv1, parallelismFactor);

        expect(isBuilt).toBe(true);
        expect(core.info).toHaveBeenCalledWith(`==> configureOptions: --prefix=${installDir},${testCmakeOptions}`);
        expect(core.info).toHaveBeenCalledWith(`==> Expanded shell variables in configureOptions: --prefix=${installDir},${expandedTestCmakeOptions}`);
        expect(core.info).toHaveBeenCalledWith(`==> Expanded shell variables in testOptions: ${expandedTestCtestOptions}`);
    });

    it('catches errors when installing lcov', async () => {
        expect.assertions(1);

        const testEnv = {
            ...env,
        };

        (exec.exec as jest.Mock).mockImplementation((command, args) => {
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

        const isBuilt = await buildPackage(repository, sourceDir, installDir, cmake, cmakeOptions, ctestOptions, test, codeCoverage, os, compiler, testEnv, parallelismFactor);

        expect(isBuilt).toBe(false);
    });

    it('adds code coverage compiler flags on supported platform', async () => {
        expect.assertions(3);

        const testEnv = {
            ...env,
        };

        (exec.exec as jest.Mock).mockResolvedValue(0);

        const isBuilt = await buildPackage(repository, sourceDir, installDir, cmake, cmakeOptions, ctestOptions, test, codeCoverage, os, compiler, testEnv, parallelismFactor);

        expect(isBuilt).toBe(true);
        expect(core.info).toHaveBeenCalledWith('==> Code coverage collection enabled, installing lcov...');
        expect(core.info).toHaveBeenCalledWith(`==> configureOptions: --prefix=${installDir},-DCMAKE_C_FLAGS='--coverage',-DCMAKE_CXX_FLAGS='--coverage',-DCMAKE_Fortran_FLAGS='--coverage'`);
    });

    it('warns if code coverage in unsupported on current platforms', async () => {
        expect.assertions(2);

        const testEnv = {
            ...env,
        };

        (exec.exec as jest.Mock).mockResolvedValue(0);

        const isBuilt = await buildPackage(repository, sourceDir, installDir, cmake, cmakeOptions, ctestOptions, test, codeCoverage, macOs, compiler, testEnv, parallelismFactor);

        expect(isBuilt).toBe(true);
        expect(core.info).toHaveBeenCalledWith(`Skipping code coverage collection on unsupported platform: ${compiler}@${macOs}`);
    });

    it('extends current environment with additional variables', async () => {
        expect.assertions(5);

        const testEnv = {
            ...env,
        };

        (exec.exec as jest.Mock).mockResolvedValue(0);

        const isBuilt = await buildPackage(repository, sourceDir, installDir, cmake, cmakeOptions, ctestOptions, test, codeCoverage, os, compiler, testEnv, parallelismFactor);

        expect(isBuilt).toBe(true);

        (core.info as jest.Mock).mock.calls.forEach((call) => {
            const arg = call[0];
            if (!/^==> options\.env:/.test(arg)) return;

            ['CC', 'CXX', 'FC', 'CMAKE_VERSION'].forEach((envKey) => {
                expect(arg).toContain(`"${envKey}": "${env[envKey]}"`);
            });
        });
    });

    it('allows overriding of default options via current environment variables', async () => {
        expect.assertions(12);

        const testEnv: EnvironmentVariables = {
            ...env,
            'CTEST_OUTPUT_ON_FAILURE': '0',
            'CMAKE_BUILD_PARALLEL_LEVEL': '1',
            'CTEST_PARALLEL_LEVEL': '1',
        };

        const options = {
            cwd: buildDir,
            env: {
                ...process.env,
                ...testEnv,
            },
        };

        (exec.exec as jest.Mock).mockResolvedValue(0);

        const isBuilt = await buildPackage(repository, sourceDir, installDir, cmake, cmakeOptions, ctestOptions, test, codeCoverage, os, compiler, testEnv, parallelismFactor);

        expect(isBuilt).toBe(true);
        expect(exec.exec).toHaveBeenCalledWith('env', ['ecbuild', `--prefix=${installDir}`, "-DCMAKE_C_FLAGS='--coverage'", "-DCMAKE_CXX_FLAGS='--coverage'", "-DCMAKE_Fortran_FLAGS='--coverage'", sourceDir], options);
        expect(exec.exec).toHaveBeenCalledWith('env', ['cmake', '--build', '.'], options);
        expect(exec.exec).toHaveBeenCalledWith('env', ['ctest'], options);
        expect(exec.exec).toHaveBeenCalledWith('env', ['lcov', '--capture', '--directory', buildDir, '--output-file', coverageFile], options);
        expect(exec.exec).toHaveBeenCalledWith('env', ['lcov', '--remove', coverageFile, '--output-file', coverageFile, '/usr/*', `${path.dirname(installDir)}/*`, `${buildDir}/*`], options);
        expect(exec.exec).toHaveBeenCalledWith('env', ['lcov', '--list', coverageFile], options);
        expect(exec.exec).toHaveBeenCalledWith('env', ['genhtml', coverageFile, '--output-directory', coverageDir], options);
        expect(exec.exec).toHaveBeenCalledWith('env', ['cmake', '--install', '.'], options);

        (core.info as jest.Mock).mock.calls.forEach((call) => {
            const arg = call[0];
            if (!/^==> options\.env:/.test(arg)) return;

            ['CTEST_OUTPUT_ON_FAILURE', 'CMAKE_BUILD_PARALLEL_LEVEL', 'CTEST_PARALLEL_LEVEL'].forEach((envKey) => {
                expect(arg).toContain(`"${envKey}": "${testEnv[envKey]}"`);
            });
        });
    });

    it('creates install directory', async () => {
        expect.assertions(2);

        const testEnv = {
            ...env,
        };

        (exec.exec as jest.Mock).mockResolvedValue(0);

        const isBuilt = await buildPackage(repository, sourceDir, installDir, cmake, cmakeOptions, ctestOptions, test, codeCoverage, os, compiler, testEnv, parallelismFactor);

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
            env: {
                'CTEST_OUTPUT_ON_FAILURE': '1',
                'CMAKE_BUILD_PARALLEL_LEVEL': '2',
                'CTEST_PARALLEL_LEVEL': '2',
                ...process.env,
                ...testEnv,
            },
        };

        (exec.exec as jest.Mock).mockResolvedValue(0);

        const isBuilt = await buildPackage(repository, sourceDir, installDir, cmake, cmakeOptions, ctestOptions, test, codeCoverage, os, compiler, testEnv, parallelismFactor);

        expect(isBuilt).toBe(true);
        expect(exec.exec).toHaveBeenCalledWith('env', ['ecbuild', `--prefix=${installDir}`, "-DCMAKE_C_FLAGS='--coverage'", "-DCMAKE_CXX_FLAGS='--coverage'", "-DCMAKE_Fortran_FLAGS='--coverage'", sourceDir], options);
        expect(exec.exec).toHaveBeenCalledWith('env', ['cmake', '--build', '.'], options);
        expect(exec.exec).toHaveBeenCalledWith('env', ['ctest'], options);
        expect(exec.exec).toHaveBeenCalledWith('env', ['lcov', '--capture', '--directory', buildDir, '--output-file', coverageFile], options);
        expect(exec.exec).toHaveBeenCalledWith('env', ['lcov', '--remove', coverageFile, '--output-file', coverageFile, '/usr/*', `${path.dirname(installDir)}/*`, `${buildDir}/*`], options);
        expect(exec.exec).toHaveBeenCalledWith('env', ['lcov', '--list', coverageFile], options);
        expect(exec.exec).toHaveBeenCalledWith('env', ['genhtml', coverageFile, '--output-directory', coverageDir], options);
        expect(exec.exec).toHaveBeenCalledWith('env', ['cmake', '--install', '.'], options);
    });

    it('runs configure, build, test and install commands', async () => {
        expect.assertions(9);

        const testEnv = {
            ...env,
        };

        const options = {
            cwd: buildDir,
            env: {
                'CTEST_OUTPUT_ON_FAILURE': '1',
                'CMAKE_BUILD_PARALLEL_LEVEL': '2',
                'CTEST_PARALLEL_LEVEL': '2',
                ...process.env,
                ...testEnv,
            },
        };

        (exec.exec as jest.Mock).mockResolvedValue(0);

        const isBuilt = await buildPackage(repository, sourceDir, installDir, cmake, cmakeOptions, ctestOptions, test, !codeCoverage, os, compiler, testEnv, parallelismFactor);

        expect(isBuilt).toBe(true);
        expect(exec.exec).toHaveBeenCalledWith('env', ['ecbuild', `--prefix=${installDir}`, sourceDir], options);
        expect(exec.exec).toHaveBeenCalledWith('env', ['cmake', '--build', '.'], options);
        expect(exec.exec).toHaveBeenCalledWith('env', ['ctest'], options);
        expect(exec.exec).not.toHaveBeenCalledWith('env', ['lcov', '--capture', '--directory', buildDir, '--output-file', coverageFile], options);
        expect(exec.exec).not.toHaveBeenCalledWith('env', ['lcov', '--remove', coverageFile, '--output-file', coverageFile, '/usr/*', `${path.dirname(installDir)}/*`, `${buildDir}/*`], options);
        expect(exec.exec).not.toHaveBeenCalledWith('env', ['lcov', '--list', coverageFile], options);
        expect(exec.exec).not.toHaveBeenCalledWith('env', ['genhtml', coverageFile, '--output-directory', coverageDir], options);
        expect(exec.exec).toHaveBeenCalledWith('env', ['cmake', '--install', '.'], options);
    });

    it('runs configure, build and install commands', async () => {
        expect.assertions(9);

        const testEnv = {
            ...env,
        };

        const options = {
            cwd: buildDir,
            env: {
                'CMAKE_BUILD_PARALLEL_LEVEL': '2',
                ...process.env,
                ...testEnv,
            },
        };

        (exec.exec as jest.Mock).mockResolvedValue(0);

        const isBuilt = await buildPackage(repository, sourceDir, installDir, cmake, cmakeOptions, ctestOptions, !test, !codeCoverage, os, compiler, testEnv, parallelismFactor);

        expect(isBuilt).toBe(true);
        expect(exec.exec).toHaveBeenCalledWith('env', ['ecbuild', `--prefix=${installDir}`, sourceDir], options);
        expect(exec.exec).toHaveBeenCalledWith('env', ['cmake', '--build', '.'], options);
        expect(exec.exec).not.toHaveBeenCalledWith('env', ['ctest'], options);
        expect(exec.exec).not.toHaveBeenCalledWith('env', ['lcov', '--capture', '--directory', buildDir, '--output-file', coverageFile], options);
        expect(exec.exec).not.toHaveBeenCalledWith('env', ['lcov', '--remove', coverageFile, '--output-file', coverageFile, '/usr/*', `${path.dirname(installDir)}/*`, `${buildDir}/*`], options);
        expect(exec.exec).not.toHaveBeenCalledWith('env', ['lcov', '--list', coverageFile], options);
        expect(exec.exec).not.toHaveBeenCalledWith('env', ['genhtml', coverageFile, '--output-directory', coverageDir], options);
        expect(exec.exec).toHaveBeenCalledWith('env', ['cmake', '--install', '.'], options);
    });

    it('returns false if configure command failed', async () => {
        expect.assertions(1);

        const testEnv = {
            ...env,
        };

        (exec.exec as jest.Mock).mockImplementation((command, args) => {
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

        const isBuilt = await buildPackage(repository, sourceDir, installDir, cmake, cmakeOptions, ctestOptions, !test, !codeCoverage, os, compiler, testEnv, parallelismFactor);

        expect(isBuilt).toBe(false);
    });

    it('returns false if build command failed', async () => {
        expect.assertions(1);

        const testEnv = {
            ...env,
        };

        (exec.exec as jest.Mock).mockImplementation((command, args) => {
            if (
                command === 'env'
                && args[0] === 'cmake'
                && args[1] === '--build'
                && args[2] === '.'
            ) {
                return Promise.resolve(1);
            }

            return Promise.resolve(0);
        });

        const isBuilt = await buildPackage(repository, sourceDir, installDir, cmake, cmakeOptions, ctestOptions, !test, !codeCoverage, os, compiler, testEnv, parallelismFactor);

        expect(isBuilt).toBe(false);
    });

    it('returns false if test command failed', async () => {
        expect.assertions(1);

        const testEnv = {
            ...env,
        };

        (exec.exec as jest.Mock).mockImplementation((command, args) => {
            if (
                command === 'env'
                && args[0] === 'ctest'
            ) {
                return Promise.resolve(1);
            }

            return Promise.resolve(0);
        });

        const isBuilt = await buildPackage(repository, sourceDir, installDir, cmake, cmakeOptions, ctestOptions, test, codeCoverage, os, compiler, testEnv, parallelismFactor);

        expect(isBuilt).toBe(false);
    });

    it('returns false if code coverage collection command failed', async () => {
        expect.assertions(1);

        const testEnv = {
            ...env,
        };

        (exec.exec as jest.Mock).mockImplementation((command, args) => {
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

        const isBuilt = await buildPackage(repository, sourceDir, installDir, cmake, cmakeOptions, ctestOptions, test, codeCoverage, os, compiler, testEnv, parallelismFactor);

        expect(isBuilt).toBe(false);
    });

    it('returns false if code coverage cleanup command failed', async () => {
        expect.assertions(1);

        const testEnv = {
            ...env,
        };

        (exec.exec as jest.Mock).mockImplementation((command, args) => {
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

        const isBuilt = await buildPackage(repository, sourceDir, installDir, cmake, cmakeOptions, ctestOptions, test, codeCoverage, os, compiler, testEnv, parallelismFactor);

        expect(isBuilt).toBe(false);
    });

    it('returns false if code coverage report listing command failed', async () => {
        expect.assertions(1);

        const testEnv = {
            ...env,
        };

        (exec.exec as jest.Mock).mockImplementation((command, args) => {
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

        const isBuilt = await buildPackage(repository, sourceDir, installDir, cmake, cmakeOptions, ctestOptions, test, codeCoverage, os, compiler, testEnv, parallelismFactor);

        expect(isBuilt).toBe(false);
    });

    it('returns false if code coverage report generation command failed', async () => {
        expect.assertions(1);

        const testEnv = {
            ...env,
        };

        (exec.exec as jest.Mock).mockImplementation((command, args) => {
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

        const isBuilt = await buildPackage(repository, sourceDir, installDir, cmake, cmakeOptions, ctestOptions, test, codeCoverage, os, compiler, testEnv, parallelismFactor);

        expect(isBuilt).toBe(false);
    });

    it('returns false if install command failed', async () => {
        expect.assertions(1);

        const testEnv = {
            ...env,
        };

        (exec.exec as jest.Mock).mockImplementation((command, args) => {
            if (
                command === 'env'
                && args[0] === 'cmake'
                && args[1] === '--install'
                && args[2] === '.'
            ) {
                return Promise.resolve(1);
            }

            return Promise.resolve(0);
        });

        const isBuilt = await buildPackage(repository, sourceDir, installDir, cmake, cmakeOptions, ctestOptions, test, codeCoverage, os, compiler, testEnv, parallelismFactor);

        expect(isBuilt).toBe(false);
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
            LIB_PATH: `${installDir}/lib:${installDir}/lib64`,
            [`${repo}_DIR`]: installDir,
            [`${repo.toUpperCase()}_DIR`]: installDir,
            [`${repo.toUpperCase()}_PATH`]: installDir,
        };

        (exec.exec as jest.Mock).mockResolvedValue(0);

        const isBuilt = await buildPackage(repository, sourceDir, installDir, cmake, cmakeOptions, ctestOptions, test, !codeCoverage, os, compiler, testEnv, parallelismFactor);

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
            LIB_PATH: `${installDir}/lib:${installDir}/lib64`,
            [`${repo}_DIR`]: installDir,
            [`${repo.toUpperCase()}_DIR`]: installDir,
            [`${repo.toUpperCase()}_PATH`]: installDir,
            COVERAGE_FILE: coverageFile,
            COVERAGE_DIR: coverageDir,
        };

        (exec.exec as jest.Mock).mockResolvedValue(0);

        const isBuilt = await buildPackage(repository, sourceDir, installDir, cmake, cmakeOptions, ctestOptions, test, codeCoverage, os, compiler, testEnv, parallelismFactor);

        expect(isBuilt).toBe(true);
        expect(testEnv).toStrictEqual(expectedEnv);
    });

    it.each`
        error
        ${errorObject}
        ${emptyObject}
    `('returns false if command throws an error ($error)', async ({ error }) => {
        expect.assertions(1);

        const testEnv = {
            ...env,
        };

        (exec.exec as jest.Mock).mockImplementationOnce(() => {
            throw error;
        });

        const isBuilt = await buildPackage(repository, sourceDir, installDir, cmake, cmakeOptions, ctestOptions, test, codeCoverage, os, compiler, testEnv, parallelismFactor);

        expect(isBuilt).toBe(false);
    });
});
