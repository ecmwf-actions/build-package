import * as cache from '@actions/cache';
import * as core from '@actions/core';
import { Octokit } from '@octokit/core';
import crypto from 'crypto';
import fastFolderSize from 'fast-folder-size';

import { getCacheKey, restoreCache, saveCache } from '../src/cache-functions';
import { version } from '../package.json';
import { EnvironmentVariables } from '../src/types/env-functions';

jest.mock('@actions/core');
jest.mock('@actions/cache');
jest.mock('@actions/io');
jest.mock('@octokit/core');
jest.mock('fast-folder-size');

const repository = 'owner/repo';
const branch = 'branch';
const githubToken = '123';
const repo = 'repo';
const os = 'ubuntu-20.04';
const compiler = 'gnu-10';
const cacheSuffix = '';
const installDir = '/path/to/install/repo';
const sha = 'f0b00fd201c7ddf14e1572a10d5fb4577c4bd6a2';
const errorObject = new Error('Oops!');
const emptyObject = {};

const env = {
    CMAKE_VERSION: '3.20.5',
    DEPENDENCIES: {
        'owner/repo1': 'de9f2c7fd25e1b3afad3e85a0bd17d9b100db4b3',
        'owner/repo2': '2fd4e1c67a2d28fced849ee1bb76e7391b93eb12',
    },
};

const resolveHeadSha = () => Promise.resolve({
    status: 200,
    data: {
        object: {
            sha,
        },
    },
});

let cacheKey: string;

describe('getCacheKey', () => {
    it('returns a consistent cache key', async () => {
        expect.assertions(22);

        const testEnv = {
            ...env,
        };

        let cacheKeyStr = `v=${version}${cacheSuffix}::cmake=${testEnv.CMAKE_VERSION}::${repo}=${sha}`;

        for (const [dependency, dependencySha] of Object.entries(testEnv.DEPENDENCIES || {})) {
            const [ , dependencyRepo] = dependency.split('/');
            cacheKeyStr += `::${dependencyRepo}=${dependencySha}`;
        }

        const cacheKeySha = crypto.createHash('sha1').update(cacheKeyStr).digest('hex');

        (Octokit.prototype.constructor as jest.Mock).mockImplementation((options) => {
            if (!options.auth) throw Error(`Octokit authentication missing, did you pass the auth key?`);

            return {
                request: resolveHeadSha,
            };
        });

        for (let i = 0; i < 10; i++) {
            const result = await getCacheKey(repository, branch, githubToken, os, compiler, cacheSuffix, testEnv);

            expect(result.cacheKey).toStrictEqual(`${os}-${compiler}-${repo}-${cacheKeySha}`);
            expect(result.headSha).toStrictEqual(sha);

            cacheKey = result.cacheKey;  // Save for later tests.
        }

        expect(core.info).toHaveBeenCalledWith(`==> Branch: ${branch}`);
        expect(core.info).toHaveBeenCalledWith(`==> Ref: heads/${branch}`);
    });

    it('supports tags', async () => {
        expect.assertions(3);

        const testEnv = {
            ...env,
        };

        const testTag = '1.0.0';
        const testBranch = `refs/tags/${testTag}`;

        let cacheKeyStr = `v=${version}${cacheSuffix}::cmake=${testEnv.CMAKE_VERSION}::${repo}=${sha}`;

        for (const [dependency, dependencySha] of Object.entries(testEnv.DEPENDENCIES || {})) {
            const [ , dependencyRepo] = dependency.split('/');
            cacheKeyStr += `::${dependencyRepo}=${dependencySha}`;
        }

        const cacheKeySha = crypto.createHash('sha1').update(cacheKeyStr).digest('hex');

        (Octokit.prototype.constructor as jest.Mock).mockImplementationOnce(() => ({
            request: resolveHeadSha,
        }));

        const { cacheKey } = await getCacheKey(repository, testBranch, githubToken, os, compiler, cacheSuffix, testEnv);

        expect(cacheKey).toStrictEqual(`${os}-${compiler}-${repo}-${cacheKeySha}`);
        expect(core.info).toHaveBeenCalledWith(`==> Branch: ${testTag}`);
        expect(core.info).toHaveBeenCalledWith(`==> Ref: tags/${testTag}`);
    });

    it('skips current repository as a dependency', async () => {
        expect.assertions(1);

        const testEnv = {
            ...env,
            DEPENDENCIES: {
                ...env.DEPENDENCIES,
                [repository]: sha,
            },
        };

        let cacheKeyStr = `v=${version}${cacheSuffix}::cmake=${testEnv.CMAKE_VERSION}::${repo}=${sha}`;

        for (const [dependency, dependencySha] of Object.entries(testEnv.DEPENDENCIES || {})) {
            const [ , dependencyRepo] = dependency.split('/');
            if (dependency === repository) continue;
            cacheKeyStr += `::${dependencyRepo}=${dependencySha}`;
        }

        const cacheKeySha = crypto.createHash('sha1').update(cacheKeyStr).digest('hex');

        (Octokit.prototype.constructor as jest.Mock).mockImplementationOnce(() => ({
            request: resolveHeadSha,
        }));

        const { cacheKey } = await getCacheKey(repository, branch, githubToken, os, compiler, cacheSuffix, testEnv);

        expect(cacheKey).toStrictEqual(`${os}-${compiler}-${repo}-${cacheKeySha}`);
    });

    it('returns cache key if dependencies object is undefined', async () => {
        expect.assertions(1);

        const testEnv: EnvironmentVariables = {
            ...env,
        };

        delete testEnv.DEPENDENCIES;

        const cacheKeyStr = `v=${version}${cacheSuffix}::cmake=${testEnv.CMAKE_VERSION}::${repo}=${sha}`;
        const cacheKeySha = crypto.createHash('sha1').update(cacheKeyStr).digest('hex');

        (Octokit.prototype.constructor as jest.Mock).mockImplementationOnce(() => ({
            request: resolveHeadSha,
        }));

        const { cacheKey } = await getCacheKey(repository, branch, githubToken, os, compiler, cacheSuffix, testEnv);

        expect(cacheKey).toStrictEqual(`${os}-${compiler}-${repo}-${cacheKeySha}`);
    });

    it('returns cache key if dependencies object is empty', async () => {
        expect.assertions(1);

        const testEnv = {
            ...env,
            DEPENDENCIES: {},
        };

        const cacheKeyStr = `v=${version}${cacheSuffix}::cmake=${testEnv.CMAKE_VERSION}::${repo}=${sha}`;
        const cacheKeySha = crypto.createHash('sha1').update(cacheKeyStr).digest('hex');

        (Octokit.prototype.constructor as jest.Mock).mockImplementationOnce(() => ({
            request: resolveHeadSha,
        }));

        const { cacheKey } = await getCacheKey(repository, branch, githubToken, os, compiler, cacheSuffix, testEnv);

        expect(cacheKey).toStrictEqual(`${os}-${compiler}-${repo}-${cacheKeySha}`);
    });

    it.each`
        error
        ${errorObject}
        ${emptyObject}
    `('logs error if repository HEAD fetch fails ($error)', async ({ error }) => {
        expect.hasAssertions();

        const testEnv = {
            ...env,
        };

        let cacheKeyStr = `v=${version}${cacheSuffix}::cmake=${testEnv.CMAKE_VERSION}::${repo}=undefined`;

        for (const [dependency, dependencySha] of Object.entries(testEnv.DEPENDENCIES || {})) {
            const [ , dependencyRepo] = dependency.split('/');
            cacheKeyStr += `::${dependencyRepo}=${dependencySha}`;
        }

        const cacheKeySha = crypto.createHash('sha1').update(cacheKeyStr).digest('hex');

        (Octokit.prototype.constructor as jest.Mock).mockImplementationOnce(() => ({
            request: () => {
                throw error;
            },
        }));

        const { cacheKey } = await getCacheKey(repository, branch, githubToken, os, compiler, cacheSuffix, testEnv);

        expect(cacheKey).toStrictEqual(`${os}-${compiler}-${repo}-${cacheKeySha}`);
        expect(core.info).toHaveBeenCalledWith(`==> result.headSha: undefined`);

        if (!(error instanceof Error)) return;
        expect(core.warning).toHaveBeenCalledWith(`Error getting repository HEAD for ${repo}: ${error.message}`)
    });

    it('invalidates the cache if suffix is supplied', async () => {
        expect.assertions(5);

        const testEnv = {
            ...env,
        };

        let cacheKeyStr = `v=${version}${cacheSuffix}::cmake=${testEnv.CMAKE_VERSION}::${repo}=${sha}`;

        for (const [dependency, dependencySha] of Object.entries(testEnv.DEPENDENCIES || {})) {
            const [ , dependencyRepo] = dependency.split('/');
            cacheKeyStr += `::${dependencyRepo}=${dependencySha}`;
        }

        const cacheKeySha = crypto.createHash('sha1').update(cacheKeyStr).digest('hex');

        (Octokit.prototype.constructor as jest.Mock).mockImplementationOnce(() => ({
            request: resolveHeadSha,
        }));

        const result = await getCacheKey(repository, branch, githubToken, os, compiler, cacheSuffix, testEnv);

        expect(result.cacheKey).toStrictEqual(`${os}-${compiler}-${repo}-${cacheKeySha}`);
        expect(result.headSha).toStrictEqual(sha);

        const testCacheSuffix = 'foobar';

        let newCacheKeyStr = `v=${version}${testCacheSuffix}::cmake=${testEnv.CMAKE_VERSION}::${repo}=${sha}`;

        for (const [dependency, dependencySha] of Object.entries(testEnv.DEPENDENCIES || {})) {
            const [ , dependencyRepo] = dependency.split('/');
            newCacheKeyStr += `::${dependencyRepo}=${dependencySha}`;
        }

        const newCacheKeySha = crypto.createHash('sha1').update(newCacheKeyStr).digest('hex');

        const newResult = await getCacheKey(repository, branch, githubToken, os, compiler, testCacheSuffix, testEnv);

        expect(newResult.cacheKey).toStrictEqual(`${os}-${compiler}-${repo}-${newCacheKeySha}`);
        expect(newResult.cacheKey).not.toStrictEqual(result.cacheKey);
        expect(newResult.headSha).toStrictEqual(result.headSha);
    });
});

describe('restoreCache', () => {
    it('restores package from cache if found', async () => {
        expect.assertions(4);

        (Octokit.prototype.constructor as jest.Mock).mockImplementationOnce(() => ({
            request: resolveHeadSha,
        }));

        for (const mockCacheHit of [false, true]) {
            (cache.restoreCache as jest.Mock).mockResolvedValueOnce(mockCacheHit);

            const cacheHit = await restoreCache(repository, branch, githubToken, installDir, os, compiler, cacheSuffix, env);

            expect(cacheHit).toBe(mockCacheHit);
            expect(cache.restoreCache).toHaveBeenCalledWith([installDir], cacheKey);
        }
    });

    it.each`
        error
        ${errorObject}
        ${emptyObject}
    `('catches unexpected restore cache errors ($error)', async ({ error }) => {
        expect.hasAssertions();

        (Octokit.prototype.constructor as jest.Mock).mockImplementationOnce(() => ({
            request: resolveHeadSha,
        }));

        (cache.restoreCache as jest.Mock).mockRejectedValueOnce(error);

        const cacheHit = await restoreCache(repository, branch, githubToken, installDir, os, compiler, cacheSuffix, env);

        expect(cacheHit).toBe(false);

        if (!(error instanceof Error)) return;
        expect(core.warning).toHaveBeenCalledWith(`Error restoring cache for ${repository}: ${error.message}`);
    });
});

describe('saveCache', () => {
    it('saves package to cache', async () => {
        expect.assertions(4);

        (Octokit.prototype.constructor as jest.Mock).mockImplementation(() => ({
            request: resolveHeadSha,
        }));

        (fastFolderSize as jest.Mock).mockImplementation((f, cb) => {
            if (f) cb(null, 1024);
        });

        for (const mockIsSaved of [false, true]) {
            (cache.saveCache as jest.Mock).mockResolvedValueOnce(mockIsSaved);

            const isSaved = await saveCache(repository, branch, githubToken, installDir, os, compiler, cacheSuffix, env);

            expect(isSaved).toBe(mockIsSaved);
            expect(cache.saveCache).toHaveBeenCalledWith([installDir], cacheKey);
        }
    });

    it('does not save empty package to cache', async () => {
        expect.assertions(2);

        (Octokit.prototype.constructor as jest.Mock).mockImplementationOnce(() => ({
            request: resolveHeadSha,
        }));

        (fastFolderSize as jest.Mock).mockImplementationOnce((f, cb) => {
            if (f) cb(null, 0);
        });

        const isSaved = await saveCache(repository, branch, githubToken, installDir, os, compiler, cacheSuffix, env);

        expect(isSaved).toBe(false);
        expect(cache.saveCache).not.toHaveBeenCalled();
    });

    it('does not save cache on key collisions', async () => {
        expect.assertions(2);

        (Octokit.prototype.constructor as jest.Mock).mockImplementationOnce(() => ({
            request: resolveHeadSha,
        }));

        (fastFolderSize as jest.Mock).mockImplementationOnce((f, cb) => {
            if (f) cb(null, 1024);
        });

        const errorMessage = `Unable to reserve cache with key ${cacheKey}, another job may be creating this cache.`;

        (cache.saveCache as jest.Mock).mockRejectedValueOnce(new Error(errorMessage));

        const isSaved = await saveCache(repository, branch, githubToken, installDir, os, compiler, cacheSuffix, env);

        expect(isSaved).toBe(false);
        expect(core.warning).toHaveBeenCalledWith(`Error saving cache for ${repository}: ${errorMessage}`);
    });

    it.each`
        error
        ${errorObject}
        ${emptyObject}
    `('catches unexpected save cache errors ($error)', async ({ error }) => {
        expect.hasAssertions();

        (Octokit.prototype.constructor as jest.Mock).mockImplementationOnce(() => ({
            request: resolveHeadSha,
        }));

        (fastFolderSize as jest.Mock).mockImplementationOnce((f, cb) => {
            if (f) cb(null, 1024);
        });

        (cache.saveCache as jest.Mock).mockImplementationOnce(() => {
            throw error;
        });

        const isSaved = await saveCache(repository, branch, githubToken, installDir, os, compiler, cacheSuffix, env);

        expect(isSaved).toBe(false);

        if (!(error instanceof Error)) return;
        expect(core.warning).toHaveBeenCalledWith(`Error saving cache for ${repository}: ${error.message}`);
    });
});
