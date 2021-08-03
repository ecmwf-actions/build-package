const process = require('process');
const exec = require('@actions/exec');
const { setupEnv, extendPaths } = require('../src/env-functions');

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

const env = {};

describe('setupEnv', () => {
    it('returns compiler and cmake version environment variables', async () => {
        expect.assertions(1);

        exec.exec.mockImplementation((command, args, options) => {
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

        exec.exec.mockImplementation(() => Promise.resolve(1));

        const env = await setupEnv(os, compilerCc, compilerCxx, compilerFc);

        expect(env).toStrictEqual({
            CC: compilerCc,
            CXX: compilerCxx,
            FC: compilerFc,
        });
    });

    it('works around JSON parsing errors in cmake command', async () => {
        expect.assertions(1);

        exec.exec.mockImplementation((command, args, options) => {
            if (args[0] === 'cmake') {
                options.listeners.stdout('Oops!');
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

    it('works around empty version key in cmake command', async () => {
        expect.assertions(1);

        exec.exec.mockImplementation((command, args, options) => {
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

        exec.exec.mockImplementation((command, args, options) => {
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

        exec.exec.mockImplementation((command, args, options) => {
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

        exec.exec.mockImplementation((command, args, options) => {
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
        expect.assertions(1);

        extendPaths(env, installDir1);

        expect(env).toStrictEqual({
            PATH: `${installDir1}/bin:${process.env.PATH}`,
            BIN_PATH: `${installDir1}/bin`,
            INCLUDE_PATH: `${installDir1}/include`,
            INSTALL_PATH: installDir1,
            LIB_PATH: `${installDir1}/lib`,
        });
    });

    it('extends existing environment object', async () => {
        expect.assertions(1);

        extendPaths(env, installDir2);

        expect(env).toStrictEqual({
            PATH: `${installDir2}/bin:${installDir1}/bin:${process.env.PATH}`,
            BIN_PATH: `${installDir2}/bin:${installDir1}/bin`,
            INCLUDE_PATH: `${installDir2}/include:${installDir1}/include`,
            INSTALL_PATH: `${installDir2}:${installDir1}`,
            LIB_PATH: `${installDir2}/lib:${installDir1}/lib`,
        });
    });

    it('extends empty environment object w/o PATH', async () => {
        expect.assertions(1);

        const newEnv = {};

        process.env.PATH = '';

        extendPaths(newEnv, installDir3);

        expect(newEnv).toStrictEqual({
            PATH: `${installDir3}/bin`,
            BIN_PATH: `${installDir3}/bin`,
            INCLUDE_PATH: `${installDir3}/include`,
            INSTALL_PATH: installDir3,
            LIB_PATH: `${installDir3}/lib`,
        });
    });
});
