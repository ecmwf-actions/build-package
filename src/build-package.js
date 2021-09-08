const process = require('process');
const fs = require('fs');
const path = require('path');
const core = require('@actions/core');
const exec = require('@actions/exec');
const { mkdirP } = require('@actions/io');

const { extendPaths } = require('./env-functions');
const { isError } = require('./helper-functions');

/**
 * Builds and installs a package from source. Optionally, runs tests and collects code coverage information.
 *
 * @param {String} repository Github repository owner and name.
 * @param {String} sourceDir Path to source directory.
 * @param {String} installDir Directory where to install the package.
 * @param {Boolean} cmake Whether to use CMake for build configuration, instead of ecbuild.
 * @param {String} cmakeOptions The list of ecbuild/CMake options to be passed during the build configuration phase.
 * @param {Boolean} test Whether to run tests or not.
 * @param {Boolean} codeCoverage Whether to collect code coverage or not. Note that tests must be run for this to work.
 *   Currently supported only on Ubuntu 20.04 platform with GNU 10 compiler.
 * @param {String} os Current OS platform.
 * @param {String} compiler Current compiler family.
 * @param {Object} env Local environment object.
 * @returns {Boolean} Whether the build and install process finished successfully.
 */
module.exports = async (repository, sourceDir, installDir, cmake, cmakeOptions, test, codeCoverage, os, compiler, env) => {
    core.startGroup(`Build ${repository}`);

    const [, repo] = repository.split('/');

    try {
        let configurePath;
        const configureOptions = [];

        if (cmake) {
            configurePath = 'cmake';
            configureOptions.push(`-DCMAKE_INSTALL_PREFIX=${installDir}`);
        }
        else if (repo === 'ecbuild') {
            configurePath = path.join(path.resolve(sourceDir), 'bin', 'ecbuild');
            configureOptions.push(`--prefix=${installDir}`);
        }
        else {
            configurePath = 'ecbuild';
            configureOptions.push(`--prefix=${installDir}`);
        }

        if (cmakeOptions) configureOptions.push(cmakeOptions);

        core.info(`==> configurePath: ${configurePath}`);
        core.info(`==> configureOptions: ${configureOptions}`);

        const srcDir = path.resolve(sourceDir);
        core.info(`==> srcDir: ${srcDir}`);

        const buildDir = path.join(srcDir, 'build');
        core.info(`==> buildDir: ${buildDir}`);

        await mkdirP(buildDir);

        const compilerFlags = [];

        const compilerFlagsFile = path.join(srcDir, '.github', '.compiler-flags');

        if (fs.existsSync(compilerFlagsFile)) {
            const compilerFlagsFileContent = fs.readFileSync(compilerFlagsFile).toString();

            core.info(`==> Found ${compilerFlagsFile}: ${compilerFlagsFileContent}`);

            compilerFlags.push(...compilerFlagsFileContent.split(' '));
        }

        // Currently, code coverage is supported only on Ubuntu 20.04 with GNU 10 compiler.
        const hasCodeCoverage = test && codeCoverage && os === 'ubuntu-20.04' && compiler === 'gnu-10';

        if (hasCodeCoverage) {
            core.info('==> Code coverage collection enabled, installing lcov...');

            let exitCode = await exec.exec('sudo', ['apt-get', '-y', '-q', 'update']);

            if (isError(exitCode, 'Error updating apt repositories')) return false;

            exitCode = await exec.exec('sudo', ['apt-get', '-y', '-q', 'install', 'lcov']);

            if (isError(exitCode, 'Error installing lcov')) return false;

            const instrumentationOptions = '--coverage';

            compilerFlags.push(`-DCMAKE_C_FLAGS='${instrumentationOptions}'`);
            compilerFlags.push(`-DCMAKE_CXX_FLAGS='${instrumentationOptions}'`);
            compilerFlags.push(`-DCMAKE_Fortran_FLAGS='--coverage'`);
        }
        else if (test && codeCoverage) {
            core.info(`Skipping code coverage collection on unsupported platform: ${compiler}@${os}`);
        }

        core.info(`==> compilerFlags: ${compilerFlags.join(' ')}`);

        const options = {
            cwd: buildDir,
            shell: '/bin/bash -eux',
            env: {
                ...process.env,  // preserve existing environment
                ...env,
                ...(test ? { 'CTEST_OUTPUT_ON_FAILURE': '1' } : {}),  // show output of failing tests only
            },
        };

        core.info(`==> options.env: ${JSON.stringify(options.env, null, 4)}`);

        await mkdirP(installDir);

        let exitCode = await exec.exec('env', [configurePath, ...configureOptions, ...compilerFlags, srcDir], options);

        if (isError(exitCode, 'Error configuring package')) return false;

        exitCode = await exec.exec('env', ['make', '-j2'], options);

        if (isError(exitCode, 'Error building package')) return false;

        if (test) {
            exitCode = await exec.exec('env', ['make', 'test', '-j2'], options);

            if (isError(exitCode, 'Error testing package')) return false;

            if (hasCodeCoverage) {
                const coverageFile = `${buildDir}/coverage.info`;
                const coverageDir = `${buildDir}/coverage`;

                exitCode = await exec.exec('env', ['lcov', '--capture', '--directory', buildDir, '--output-file', coverageFile], options);

                if (isError(exitCode, 'Error collecting code coverage')) return false;

                exitCode = await exec.exec('env', ['lcov', '--remove', coverageFile, '--output-file', coverageFile, '/usr/*', `${path.dirname(installDir)}/*`, `${buildDir}/*`], options);

                if (isError(exitCode, 'Error cleaning up code coverage')) return false;

                exitCode = await exec.exec('env', ['lcov', '--list', coverageFile], options);

                if (isError(exitCode, 'Error listing code coverage text report')) return false;

                exitCode = await exec.exec('env', ['genhtml', coverageFile, '--output-directory', coverageDir], options);

                if (isError(exitCode, 'Error generating code coverage HTML report')) return false;

                env.COVERAGE_FILE = coverageFile;
                env.COVERAGE_DIR = coverageDir;
            }
        }

        exitCode = await exec.exec('env', ['make', 'install'], options);

        if (isError(exitCode, 'Error installing package')) return false;

        await extendPaths(env, installDir, repo);
    }
    catch (error) {
        isError(true, error.message);
        return false;
    }

    core.endGroup();

    return true;
};
