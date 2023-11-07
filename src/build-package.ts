import process from "process";
import fs from "fs";
import path from "path";
import * as core from "@actions/core";
import * as exec from "@actions/exec";
import { mkdirP } from "@actions/io";
import yargsParser from "yargs-parser";
import isEqual from "lodash.isequal";

import { extendPaths } from "./env-functions";
import { getProjectVersion, isError } from "./helper-functions";

import { BuildOptions } from "./types/build-package";
import { EnvironmentVariables } from "./types/env-functions";

/**
 * Parses a string of options and returns an array of items for each. Will handle quoting and prefixing of separate
 *   options as expected.
 *
 * @param {string} options A list of options as one string.
 * @returns {string[]} Array of parsed options, may be empty.
 *
 * @example
 *   const opts = parseOptions('-DOPT1=ON -DOPT2=OFF -DOPT3="A string with spaces" OPT4=\'Hello, world!\' OPT5=foo');
 *
 *   [
 *     '-DOPT1=ON',
 *     '-DOPT2=OFF',
 *     '-DOPT3="A string with spaces"',
 *     "OPT4='Hello, world!'",
 *     'OPT5=foo',
 *   ]
 */
export const parseOptions = (options: string): string[] => {
    const { _ } = yargsParser(options, {
        configuration: {
            "short-option-groups": false,
            "camel-case-expansion": false,
            "dot-notation": false,
            "parse-numbers": false,
            "parse-positional-numbers": false,
            "boolean-negation": false,
            "duplicate-arguments-array": false,
            "greedy-arrays": false,
            "unknown-options-as-args": true,
        },
    });

    return _ as string[];
};

/**
 * Expands shell variables in passed options array and returns modified array.
 *
 * @param {BuildOptions} optionsObject Object containing options to expand as the only named key.
 * @param {EnvironmentVariables} env Object with shell variable values.
 * @returns {string[]} Array of expanded options, may be empty.
 *
 * @example
 *   const configureOptions = expandShellVariables({
 *      configureOptions: [
 *          '-DEXPANDED_OPT1=$VAR1',
 *          '-DEXPANDED_OPT2=${VAR2}',
 *      ],
 *   }, {
 *      VAR1: 'val1',
 *      VAR2: 'val2',
 *   });
 *
 *   [
 *     '-DEXPANDED_OPT1=val1',
 *     '-DEXPANDED_OPT2=val2',
 *   ]
 */
const expandShellVariables = (
    optionsObject: BuildOptions,
    env: EnvironmentVariables
): string[] => {
    const optionsName = Object.keys(optionsObject)[0];
    const options = [...optionsObject[optionsName]];
    const result: string[] = [];

    options.forEach((option) => {
        const variableRegex = new RegExp("\\$\\{?(\\w+)\\}?", "g");
        const matches = [...option.matchAll(variableRegex)];

        matches.forEach((match) => {
            const variableName = match[1];
            option = option.replace(
                new RegExp(`\\$\\{?${variableName}\\}?`),
                env[variableName] as string
            );
        });

        result.push(option);
    });

    if (!isEqual(result, options)) {
        core.info(`==> Expanded shell variables in ${optionsName}: ${result}`);
    }

    return result;
};

/**
 * Builds and installs a package from source. Optionally, runs tests and collects code coverage information.
 *
 * @param {string} repository Github repository owner and name.
 * @param {string} sourceDir Path to source directory.
 * @param {string} installDir Directory where to install the package.
 * @param {boolean} cmake Whether to use CMake for build configuration, instead of ecbuild.
 * @param {string|null} cmakeOptions The list of ecbuild/CMake options to be passed during the build configuration
 *   phase.
 * @param {string|null} ctestOptions The list of ctest options to be passed to the test command.
 * @param {boolean} test Whether to run tests or not.
 * @param {boolean} codeCoverage Whether to collect code coverage or not. Note that tests must be run for this to work.
 *   Currently supported only on Ubuntu 20.04 platform with GNU 10 compiler.
 * @param {string} os Current OS platform.
 * @param {string} compiler Current compiler family.
 * @param {EnvironmentVariables} env Local environment object.
 * @param {string} parallelismFactor Number of threads build job will utilise on the runner.
 * @returns {Promise<boolean>} Whether the build and install process finished successfully.
 */
const buildPackage = async (
    repository: string,
    sourceDir: string,
    installDir: string,
    cmake: boolean,
    ecbundle: boolean,
    cmakeOptions: string | null,
    ctestOptions: string | null,
    test: boolean,
    codeCoverage: boolean,
    os: string,
    compiler: string,
    env: EnvironmentVariables,
    parallelismFactor: string,
    token: string,
    cpackGenerator?: string,
    cpackOptions?: string,
    toolchainFile?: string
): Promise<boolean> => {
    core.startGroup(`Build ${repository}`);

    const [, repo] = repository.split("/");

    try {
        let configurePath;
        let configureOptions = [];

        if (repo === "ecbundle") {
            const ecbundlePath = path.join(path.resolve(sourceDir));
            await extendPaths(env, ecbundlePath, repo);
            core.endGroup();
            return true;
        }

        if (ecbundle) {
            return await ecbundleBuild(
                test,
                token,
                parallelismFactor,
                env,
                cmakeOptions,
                ctestOptions,
                installDir
            );
        }

        if (cmake) {
            configurePath = "cmake";
            configureOptions.push(`-DCMAKE_INSTALL_PREFIX=${installDir}`);
        } else if (repo === "ecbuild") {
            configurePath = path.join(
                path.resolve(sourceDir),
                "bin",
                "ecbuild"
            );
            configureOptions.push(`--prefix=${installDir}`);
        } else {
            configurePath = "ecbuild";
            configureOptions.push(`--prefix=${installDir}`);
        }

        core.info(`==> configurePath: ${configurePath}`);

        const srcDir = path.resolve(sourceDir);
        core.info(`==> srcDir: ${srcDir}`);

        if (toolchainFile && fs.existsSync(toolchainFile)) {
            configureOptions.push(`-DCMAKE_TOOLCHAIN_FILE=${toolchainFile}`);
            core.info(`==> using toolchain file: ${toolchainFile}`);
        }

        const cmakeOptionsFile = path.join(srcDir, ".github", ".cmake-options");
        const deprecatedCmakeOptionsFile = path.join(
            srcDir,
            ".github",
            ".compiler-flags"
        );

        if (fs.existsSync(cmakeOptionsFile)) {
            const cmakeOptionsFileContent = fs
                .readFileSync(cmakeOptionsFile)
                .toString();

            core.info(
                `==> Found ${cmakeOptionsFile}: ${cmakeOptionsFileContent}`
            );

            configureOptions.push(...parseOptions(cmakeOptionsFileContent));
        } else if (fs.existsSync(deprecatedCmakeOptionsFile)) {
            const deprecatedCmakeOptionsFileContent = fs
                .readFileSync(deprecatedCmakeOptionsFile)
                .toString();

            core.info(
                `==> Found ${deprecatedCmakeOptionsFile}: ${deprecatedCmakeOptionsFileContent}`
            );
            core.warning(
                "Magic file path `.github/.compiler-flags` has been deprecated, please migrate to `.github/.cmake-options`"
            );

            configureOptions.push(
                ...parseOptions(deprecatedCmakeOptionsFileContent)
            );
        }

        // Currently, code coverage is supported only on Ubuntu with GNU compiler.
        const hasCodeCoverage =
            test &&
            codeCoverage &&
            os.startsWith("ubuntu") &&
            compiler.startsWith("gnu");

        if (hasCodeCoverage) {
            core.info(
                "==> Code coverage collection enabled, installing lcov..."
            );
            core.info("==> Checking if lcov is installed...");
            const lcovInstalled =
                (await exec.exec("dpkg-query", ["-W", "lcov"], {
                    ignoreReturnCode: true,
                })) == 0;
            if (!lcovInstalled) {
                core.info("==> lcov not found, installing...");
                let exitCode = await exec.exec("sudo", [
                    "apt-get",
                    "-y",
                    "-q",
                    "update",
                ]);

                if (isError(exitCode, "Error updating apt repositories"))
                    return false;

                exitCode = await exec.exec("sudo", [
                    "apt-get",
                    "-y",
                    "-q",
                    "install",
                    "lcov",
                ]);

                if (isError(exitCode, "Error installing lcov")) return false;
            } else {
                core.info("==> lcov is already installed");
            }

            const instrumentationOptions = "--coverage";

            configureOptions.push(
                `-DCMAKE_C_FLAGS='${instrumentationOptions}'`
            );
            configureOptions.push(
                `-DCMAKE_CXX_FLAGS='${instrumentationOptions}'`
            );
            configureOptions.push(`-DCMAKE_Fortran_FLAGS='--coverage'`);
        } else if (test && codeCoverage) {
            core.info(
                `Skipping code coverage collection on unsupported platform: ${compiler}@${os}`
            );
        }

        // Include additional CMake options at the end, therefore giving them chance to override those before.
        //   See https://github.com/ecmwf-actions/build-package/issues/1 for more information.
        if (cmakeOptions) {
            configureOptions.push(...parseOptions(cmakeOptions));
        }

        core.info(`==> configureOptions: ${configureOptions}`);

        let testOptions = [];

        if (ctestOptions) {
            testOptions.push(...parseOptions(ctestOptions));
            core.info(`==> testOptions: ${testOptions}`);
        }

        const buildDir = path.join(srcDir, "build");
        core.info(`==> buildDir: ${buildDir}`);

        await mkdirP(buildDir);

        const options = {
            cwd: buildDir,
            env: {
                CMAKE_BUILD_PARALLEL_LEVEL: parallelismFactor, // default for Github runners, equals `-j2`
                ...(test ? { CTEST_OUTPUT_ON_FAILURE: "1" } : {}), // show output of failing tests only
                ...(test ? { CTEST_PARALLEL_LEVEL: parallelismFactor } : {}), // default for Github runners, equals `-j2`
                ...process.env, // preserve existing environment
                ...env, // compiler env must win
            },
        };

        core.info(`==> options.env: ${JSON.stringify(options.env, null, 4)}`);

        // Expand shell variables for all option arguments.
        //   We must do this manually, because @actions/exec ignores them (`shell: false` option is passed to `spawn`).
        configureOptions = expandShellVariables(
            { configureOptions },
            options.env
        );
        testOptions = expandShellVariables({ testOptions }, options.env);

        await mkdirP(installDir);

        let exitCode = await exec.exec(
            "env",
            [configurePath, ...configureOptions, srcDir],
            options
        );
        if (isError(exitCode, "Error configuring package")) return false;

        exitCode = await exec.exec("env", ["cmake", "--build", "."], options);
        if (isError(exitCode, "Error building package")) return false;

        exitCode = await exec.exec("env", ["cmake", "--install", "."], options);
        if (isError(exitCode, "Error installing package")) return false;
        await extendPaths(env, installDir, repo);

        if (test) {
            exitCode = await exec.exec(
                "env",
                ["ctest", ...testOptions],
                options
            );

            if (isError(exitCode, "Error testing package")) return false;

            if (hasCodeCoverage) {
                const coverageFile = `${buildDir}/coverage.info`;
                const coverageDir = `${buildDir}/coverage`;

                exitCode = await exec.exec(
                    "env",
                    [
                        "lcov",
                        "--capture",
                        "--directory",
                        buildDir,
                        "--output-file",
                        coverageFile,
                    ],
                    options
                );

                if (isError(exitCode, "Error collecting code coverage"))
                    return false;

                exitCode = await exec.exec(
                    "env",
                    [
                        "lcov",
                        "--remove",
                        coverageFile,
                        "--output-file",
                        coverageFile,
                        "/usr/*",
                        `${path.dirname(installDir)}/*`,
                        `${buildDir}/*`,
                    ],
                    options
                );

                if (isError(exitCode, "Error cleaning up code coverage"))
                    return false;

                exitCode = await exec.exec(
                    "env",
                    ["lcov", "--list", coverageFile],
                    options
                );

                if (
                    isError(exitCode, "Error listing code coverage text report")
                )
                    return false;

                exitCode = await exec.exec(
                    "env",
                    [
                        "genhtml",
                        coverageFile,
                        "--output-directory",
                        coverageDir,
                    ],
                    options
                );

                if (
                    isError(
                        exitCode,
                        "Error generating code coverage HTML report"
                    )
                )
                    return false;

                env.COVERAGE_FILE = coverageFile;
                env.COVERAGE_DIR = coverageDir;
            }
        }

        if (cpackGenerator) {
            const cpackOptionsParsed = [];
            if (cpackOptions) {
                cpackOptionsParsed.push(...parseOptions(cpackOptions));
                core.info(`==> cpackOptionsParsed: ${cpackOptionsParsed}`);
            }

            exitCode = await exec.exec(
                "env",
                [
                    "cpack",
                    "-G",
                    cpackGenerator.toUpperCase(),
                    ...cpackOptionsParsed,
                ],
                options
            );
            if (isError(exitCode, "Error while generating package"))
                return false;

            const packageVersion = getProjectVersion(sourceDir);
            if (isError(!packageVersion, "Error reading version number")) {
                return false;
            }

            const packageFileNames = fs
                .readdirSync(buildDir)
                .filter(
                    (file) =>
                        path.extname(file) ===
                        `.${cpackGenerator.toLowerCase()}`
                );

            if (packageFileNames.length == 1) {
                env.PACKAGE_PATH = path.join(buildDir, packageFileNames[0]);
            } else {
                isError(true, "Generated binary not found");
                return false;
            }
        }
    } catch (error) {
        if (error instanceof Error) isError(true, error.message);
        return false;
    }

    core.endGroup();

    return true;
};

const ecbundleBuild = async (
    test: boolean,
    token: string,
    parallelismFactor: string,
    env: EnvironmentVariables,
    cmakeOptions: string | null,
    ctestOptions: string | null,
    installDir: string
): Promise<boolean> => {
    const options = {
        env: {
            CMAKE_BUILD_PARALLEL_LEVEL: parallelismFactor,
            ...(test ? { CTEST_OUTPUT_ON_FAILURE: "1" } : {}), // show output of failing tests only
            ...(test ? { CTEST_PARALLEL_LEVEL: parallelismFactor } : {}),
            ...process.env, // preserve existing environment
            ...env, // compiler env must win
        },
    };

    // ecbundle create
    let exitCode = await exec.exec(
        "env",
        [
            "ecbundle",
            "create",
            `--github-token=${token}`,
            "--shallow",
            `--threads=${parallelismFactor}`,
        ],
        options
    );
    if (isError(exitCode, "Error creating bundle")) return false;

    // prepare cmake options
    let configureOptions = [];
    if (cmakeOptions) {
        configureOptions.push(...parseOptions(cmakeOptions));
    }
    configureOptions = expandShellVariables({ configureOptions }, options.env);

    // ecbundle build and install
    exitCode = await exec.exec(
        "env",
        [
            "ecbundle",
            "build",
            `--install`,
            `--threads=${parallelismFactor}`,
            `--install-dir=${installDir}`,
            ...(configureOptions.length
                ? [`--cmake="${configureOptions.join(" ")}"`]
                : []),
        ],
        options
    );
    if (isError(exitCode, "Error building bundle")) return false;

    // ctest
    if (test) {
        let testOptions = [];

        if (ctestOptions) {
            testOptions.push(...parseOptions(ctestOptions));
            core.info(`==> testOptions: ${testOptions}`);
        }
        testOptions = expandShellVariables({ testOptions }, options.env);

        exitCode = await exec.exec("env", ["ctest", ...testOptions], options);

        if (isError(exitCode, "Error testing bundle")) return false;
    }

    core.endGroup();
    return true;
};

export default buildPackage;
