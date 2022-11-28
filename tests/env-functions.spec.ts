import process from 'process';
import * as core from '@actions/core';
import * as exec from '@actions/exec';
import { setupEnv, extendPaths, extendDependencies } from '../src/env-functions';

jest.mock('@actions/core');
jest.mock('@actions/exec');

const os = 'ubuntu-20.04';
const compilerCc = 'gcc-10';
const compilerCxx = 'g++-10';
const compilerFc = 'gfortran-10';
const cmakeVersion1 = '3.21.1';
const cmakeVersion2 = '3.21.5';

const macOs = 'macos-10.15';
const macOsCompilerCc = null;
const macOsCompilerCxx = null;
const macOsOpenSslPath = '/usr/local/opt/openssl@1.1\n';  // NB: newline char

const installDir1 = '/path/to/install/package1';
const installDir2 = '/path/to/install/package2';
const installDir3 = '/path/to/install/package3';

const repo1 = 'package1';
const repo2 = 'package2';
const repo3 = 'PACKAGE3';

const env = {};

const errorObject = new Error('Oops!');
const emptyObject = {};

describe('setupEnv', () => {
    it('returns compiler and cmake version environment variables', async () => {
        expect.assertions(1);

        (exec.exec as jest.Mock).mockImplementation((command, args, options) => {
            return new Promise((resolve) => {
                if (args[0] === 'cmake') {
                    options.listeners.stdout(`{"version":{"string":"${cmakeVersion1}"}}`);
                }
                resolve(0);
            });
        });

        const env = await setupEnv(os, compilerCc, compilerCxx, compilerFc);

        expect(env).toStrictEqual({
            CC: compilerCc,
            CXX: compilerCxx,
            FC: compilerFc,
            CMAKE_VERSION: cmakeVersion1,
        });
    });


    it('works around failed cmake command', async () => {
        expect.assertions(1);

        (exec.exec as jest.Mock).mockResolvedValueOnce(1);

        const env = await setupEnv(os, compilerCc, compilerCxx, compilerFc);

        expect(env).toStrictEqual({
            CC: compilerCc,
            CXX: compilerCxx,
            FC: compilerFc,
        });
    });

    it.each`
        error
        ${errorObject}
        ${emptyObject}
    `('works around JSON parsing errors in cmake command ($error)', async ({ error }) => {
        expect.assertions(1);

        jest.spyOn(JSON, 'parse').mockImplementationOnce(() => {
            throw error;
        });

        const env = await setupEnv(os, compilerCc, compilerCxx, compilerFc);

        expect(env).toStrictEqual({
            CC: compilerCc,
            CXX: compilerCxx,
            FC: compilerFc,
        });
    });

    it('works around empty version key in cmake command', async () => {
        expect.assertions(1);

        (exec.exec as jest.Mock).mockImplementation((command, args, options) => {
            if (args[0] === 'cmake') {
                options.listeners.stdout('{"version":{"string":""}}');
            }

            return Promise.resolve(0);
        });

        const env = await setupEnv(os, compilerCc, compilerCxx, compilerFc);

        expect(env).toStrictEqual({
            CC: compilerCc,
            CXX: compilerCxx,
            FC: compilerFc,
        });
    });

    it('returns OpenSSL environment variables on macOS', async () => {
        expect.assertions(1);

        (exec.exec as jest.Mock).mockImplementation((command, args, options) => {
            switch (args[0]) {
            case 'cmake':
                options.listeners.stdout(`{"version":{"string":"${cmakeVersion2}"}}`);
                break;
            case 'brew':
                options.listeners.stdout(macOsOpenSslPath);
                break;
            default:
            }

            return Promise.resolve(0);
        });

        const env = await setupEnv(macOs, macOsCompilerCc, macOsCompilerCxx, compilerFc);

        const macOsOpenSslPathSanitized = macOsOpenSslPath.replace(/\n$/, '');

        expect(env).toStrictEqual({
            CC: macOsCompilerCc,
            CXX: macOsCompilerCxx,
            FC: compilerFc,
            CMAKE_VERSION: cmakeVersion2,
            OPENSSL_ROOT_DIR: macOsOpenSslPathSanitized,
            OPENSSL_INCLUDE_DIR: `${macOsOpenSslPathSanitized}/include`,
        });
    });

    it('works around failed brew command on macOS', async () => {
        expect.assertions(1);

        (exec.exec as jest.Mock).mockImplementation((command, args, options) => {
            switch (args[0]) {
            case 'cmake':
                options.listeners.stdout(`{"version":{"string":"${cmakeVersion2}"}}`);
                break;
            case 'brew':
                return Promise.resolve(1);
            default:
            }

            return Promise.resolve(0);
        });

        const env = await setupEnv(macOs, macOsCompilerCc, macOsCompilerCxx, compilerFc);

        expect(env).toStrictEqual({
            CC: macOsCompilerCc,
            CXX: macOsCompilerCxx,
            FC: compilerFc,
            CMAKE_VERSION: cmakeVersion2,
        });
    });

    it('works around empty output of brew command on macOS', async () => {
        expect.assertions(1);

        (exec.exec as jest.Mock).mockImplementation((command, args, options) => {
            switch (args[0]) {
            case 'cmake':
                options.listeners.stdout(`{"version":{"string":"${cmakeVersion2}"}}`);
                break;
            case 'brew':
                options.listeners.stdout('');
                break;
            default:
            }

            return Promise.resolve(0);
        });

        const env = await setupEnv(macOs, macOsCompilerCc, macOsCompilerCxx, compilerFc);

        expect(env).toStrictEqual({
            CC: macOsCompilerCc,
            CXX: macOsCompilerCxx,
            FC: compilerFc,
            CMAKE_VERSION: cmakeVersion2,
        });
    });
});

describe('extendPaths', () => {
    it('populates empty environment object w/ PATH', async () => {
        expect.assertions(2);

        extendPaths(env, installDir1, repo1);

        expect(env).toStrictEqual({
            PATH: `${installDir1}/bin:${process.env.PATH}`,
            BIN_PATH: `${installDir1}/bin`,
            INCLUDE_PATH: `${installDir1}/include`,
            INSTALL_PATH: installDir1,
            LIB_PATH: `${installDir1}/lib`,
            [`${repo1}_DIR`]: installDir1,
            [`${repo1.toUpperCase()}_DIR`]: installDir1,
            [`${repo1.toUpperCase()}_PATH`]: installDir1,
        });

        expect(core.info).toHaveBeenCalledWith(`==> Extended local PATH variable to include ${installDir1}/bin`);
    });

    it('extends existing environment object', async () => {
        expect.assertions(2);

        extendPaths(env, installDir2, repo2);

        expect(env).toStrictEqual({
            PATH: `${installDir2}/bin:${installDir1}/bin:${process.env.PATH}`,
            BIN_PATH: `${installDir2}/bin:${installDir1}/bin`,
            INCLUDE_PATH: `${installDir2}/include:${installDir1}/include`,
            INSTALL_PATH: `${installDir2}:${installDir1}`,
            LIB_PATH: `${installDir2}/lib:${installDir1}/lib`,
            [`${repo1}_DIR`]: installDir1,
            [`${repo1.toUpperCase()}_DIR`]: installDir1,
            [`${repo1.toUpperCase()}_PATH`]: installDir1,
            [`${repo2}_DIR`]: installDir2,
            [`${repo2.toUpperCase()}_DIR`]: installDir2,
            [`${repo2.toUpperCase()}_PATH`]: installDir2,
        });

        expect(core.info).toHaveBeenCalledWith(`==> Extended local PATH variable to include ${installDir2}/bin`);
    });

    it('extends empty environment object w/o PATH', async () => {
        expect.assertions(2);

        const newEnv = {};

        process.env.PATH = '';

        extendPaths(newEnv, installDir3, repo3);

        expect(newEnv).toStrictEqual({
            PATH: `${installDir3}/bin`,
            BIN_PATH: `${installDir3}/bin`,
            INCLUDE_PATH: `${installDir3}/include`,
            INSTALL_PATH: installDir3,
            LIB_PATH: `${installDir3}/lib`,
            [`${repo3}_DIR`]: installDir3,
            [`${repo3.toUpperCase()}_DIR`]: installDir3,
            [`${repo3.toUpperCase()}_PATH`]: installDir3,
        });

        expect(core.info).toHaveBeenCalledWith(`==> Extended local PATH variable to include ${installDir3}/bin`);
    });

    it('ignores missing environment object', async () => {
        expect.assertions(2);

        const testEnv = null;

        extendPaths(testEnv, installDir1, repo1);

        expect(testEnv).toBeNull();
        expect(core.info).not.toHaveBeenCalledWith(`==> Extended local PATH variable to include ${installDir1}/bin`);
    });
});

describe('extendDependencies', () => {
    it('populates empty environment object', async () => {
        expect.assertions(2);

        const testEnv = {};

        const repository = 'owner/repo1';
        const sha = 'f0b00fd201c7ddf14e1572a10d5fb4577c4bd6a2';

        const expectedEnv = {
            DEPENDENCIES: {
                [repository]: sha,
            },
        };

        extendDependencies(testEnv, repository, sha);

        expect(testEnv).toStrictEqual(expectedEnv);
        expect(core.info).toHaveBeenCalledWith(`==> Extended list of dependencies to include ${repository}: ${sha}`);
    });

    it('populates existing environment object', async () => {
        expect.assertions(2);

        const testEnv = {
            DEPENDENCIES: {
                'owner/repo1': 'f0b00fd201c7ddf14e1572a10d5fb4577c4bd6a2',
            },
        };

        const repository = 'owner/repo2';
        const sha = '2fd4e1c67a2d28fced849ee1bb76e7391b93eb12';

        const expectedEnv = {
            DEPENDENCIES: {
                ...testEnv.DEPENDENCIES,
                [repository]: sha,
            },
        };

        extendDependencies(testEnv, repository, sha);

        expect(testEnv).toStrictEqual(expectedEnv);
        expect(core.info).toHaveBeenCalledWith(`==> Extended list of dependencies to include ${repository}: ${sha}`);
    });

    it('ignores missing environment object', async () => {
        expect.assertions(2);

        const testEnv = null;

        const repository = 'owner/repo2';
        const sha = '2fd4e1c67a2d28fced849ee1bb76e7391b93eb12';

        extendDependencies(testEnv, repository, sha);

        expect(testEnv).toBeNull();
        expect(core.info).not.toHaveBeenCalledWith(`==> Extended list of dependencies to include ${repository}: ${sha}`);
    });
});
