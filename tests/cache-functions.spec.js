const cache = require('@actions/cache');
const core = require('@actions/core');
const { Octokit } = require('@octokit/core');
const { getCacheKey, restoreCache, saveCache } = require('../src/cache-functions');
const crypto = require('crypto');
const fastFolderSize = require('fast-folder-size');
const { version } = require('../package.json');

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
const installDir = '/path/to/install/repo';
const sha = 'f0b00fd201c7ddf14e1572a10d5fb4577c4bd6a2';

const env = {
    CMAKE_VERSION: '3.20.5',
    DEPENDENCIES: {
        'owner/repo1': 'de9f2c7fd25e1b3afad3e85a0bd17d9b100db4b3',
        'owner/repo2': '2fd4e1c67a2d28fced849ee1bb76e7391b93eb12',
    },
};

let cacheKey;

describe('getCacheKey', () => {
    it('returns a consistent cache key', async () => {
        expect.assertions(10);

        let cacheKeyStr = `v=${version}::cmake=${env.CMAKE_VERSION}::${repo}=${sha}`;

        for (const [dependency, dependencySha] of Object.entries(env.DEPENDENCIES || {})) {
            const [ , dependencyRepo] = dependency.split('/');
            cacheKeyStr += `::${dependencyRepo}=${dependencySha}`;
        }

        const cacheKeySha = crypto.createHash('sha1').update(cacheKeyStr).digest('hex');

        Octokit.prototype.constructor.mockImplementation(() => ({
            request: () => ({
                status: 200,
                data: {
                    object: {
                        sha,
                    },
                },
            }),
        }));

        for (let i = 0; i < 10; i++) {
            cacheKey = await getCacheKey(repository, branch, githubToken, os, compiler, env);

            expect(cacheKey).toStrictEqual(`${os}-${compiler}-${repo}-${cacheKeySha}`);
        }

        Octokit.prototype.constructor.mockReset();
    });

    it('returns cache key if dependencies object is undefined', async () => {
        expect.assertions(1);

        const testEnv = {
            ...env,
        };

        delete testEnv.DEPENDENCIES;

        const cacheKeyStr = `v=${version}::cmake=${env.CMAKE_VERSION}::${repo}=${sha}`;
        const cacheKeySha = crypto.createHash('sha1').update(cacheKeyStr).digest('hex');

        Octokit.prototype.constructor.mockImplementation(() => ({
            request: () => ({
                status: 200,
                data: {
                    object: {
                        sha,
                    },
                },
            }),
        }));

        const cacheKey = await getCacheKey(repository, branch, githubToken, os, compiler, testEnv);

        expect(cacheKey).toStrictEqual(`${os}-${compiler}-${repo}-${cacheKeySha}`);

        Octokit.prototype.constructor.mockReset();
    });

    it('returns cache key if dependencies object is empty', async () => {
        expect.assertions(1);

        const testEnv = {
            ...env,
            DEPENDENCIES: {},
        };

        const cacheKeyStr = `v=${version}::cmake=${env.CMAKE_VERSION}::${repo}=${sha}`;
        const cacheKeySha = crypto.createHash('sha1').update(cacheKeyStr).digest('hex');

        Octokit.prototype.constructor.mockImplementation(() => ({
            request: () => ({
                status: 200,
                data: {
                    object: {
                        sha,
                    },
                },
            }),
        }));

        const cacheKey = await getCacheKey(repository, branch, githubToken, os, compiler, testEnv);

        expect(cacheKey).toStrictEqual(`${os}-${compiler}-${repo}-${cacheKeySha}`);

        Octokit.prototype.constructor.mockReset();
    });

    it('logs error if repository HEAD fetch fails', async () => {
        expect.assertions(3);

        let cacheKeyStr = `v=${version}::cmake=${env.CMAKE_VERSION}::${repo}=undefined`;

        for (const [dependency, dependencySha] of Object.entries(env.DEPENDENCIES || {})) {
            const [ , dependencyRepo] = dependency.split('/');
            cacheKeyStr += `::${dependencyRepo}=${dependencySha}`;
        }

        const cacheKeySha = crypto.createHash('sha1').update(cacheKeyStr).digest('hex');

        const errorMessage = 'Oops!';

        Octokit.prototype.constructor.mockImplementation(() => ({
            request: () => {
                throw new Error(errorMessage);
            },
        }));

        const cacheKey = await getCacheKey(repository, branch, githubToken, os, compiler, env);

        expect(cacheKey).toStrictEqual(`${os}-${compiler}-${repo}-${cacheKeySha}`);
        expect(core.info).toHaveBeenCalledWith(`==> sha: undefined`);
        expect(core.warning).toHaveBeenCalledWith(`Error getting repository HEAD: ${errorMessage}`)

        Octokit.prototype.constructor.mockReset();
    });
});

describe('restoreCache', () => {
    it('restores package from cache if found', async () => {
        expect.assertions(4);

        Octokit.prototype.constructor.mockImplementation(() => ({
            request: () => ({
                status: 200,
                data: {
                    object: {
                        sha,
                    },
                },
            }),
        }));

        for (const mockCacheHit of [false, true]) {
            cache.restoreCache.mockResolvedValue(mockCacheHit);

            const cacheHit = await restoreCache(repository, branch, githubToken, installDir, os, compiler, env);

            expect(cacheHit).toBe(mockCacheHit);
            expect(cache.restoreCache).toHaveBeenCalledWith([installDir], cacheKey);
        }

        Octokit.prototype.constructor.mockReset();
        cache.restoreCache.mockReset();
    });

    it('catches unexpected restore cache errors', async () => {
        expect.assertions(2);

        Octokit.prototype.constructor.mockImplementation(() => ({
            request: () => ({
                status: 200,
                data: {
                    object: {
                        sha,
                    },
                },
            }),
        }));

        const errorMessage = 'Oops!';

        cache.restoreCache.mockRejectedValue(new Error(errorMessage));

        const cacheHit = await restoreCache(repository, branch, githubToken, installDir, os, compiler, env);

        expect(cacheHit).toBe(false);
        expect(core.warning).toHaveBeenCalledWith(errorMessage);

        Octokit.prototype.constructor.mockReset();
        cache.restoreCache.mockReset();
    });
});

describe('saveCache', () => {
    it('saves package to cache', async () => {
        expect.assertions(4);

        Octokit.prototype.constructor.mockImplementation(() => ({
            request: () => ({
                status: 200,
                data: {
                    object: {
                        sha,
                    },
                },
            }),
        }));

        fastFolderSize.mockImplementation((f, cb) => {
            if (f) cb(null, 1024);
        });

        for (const mockIsSaved of [false, true]) {
            cache.saveCache.mockResolvedValue(mockIsSaved);

            const isSaved = await saveCache(repository, branch, githubToken, installDir, os, compiler, env);

            expect(isSaved).toBe(mockIsSaved);
            expect(cache.saveCache).toHaveBeenCalledWith([installDir], cacheKey);
        }

        Octokit.prototype.constructor.mockReset();
        fastFolderSize.mockReset();
        cache.saveCache.mockReset();
    });

    it('does not save empty package to cache', async () => {
        expect.assertions(2);

        Octokit.prototype.constructor.mockImplementation(() => ({
            request: () => ({
                status: 200,
                data: {
                    object: {
                        sha,
                    },
                },
            }),
        }));

        fastFolderSize.mockImplementation((f, cb) => {
            if (f) cb(null, 0);
        });

        const isSaved = await saveCache(repository, branch, githubToken, installDir, os, compiler, env);

        expect(isSaved).toBe(false);
        expect(cache.saveCache).not.toHaveBeenCalled();

        Octokit.prototype.constructor.mockReset();
        fastFolderSize.mockReset();
    });

    it('does not save cache on key collisions', async () => {
        expect.assertions(2);

        Octokit.prototype.constructor.mockImplementation(() => ({
            request: () => ({
                status: 200,
                data: {
                    object: {
                        sha,
                    },
                },
            }),
        }));

        fastFolderSize.mockImplementation((f, cb) => {
            if (f) cb(null, 1024);
        });

        const errorMessage = `Unable to reserve cache with key ${cacheKey}, another job may be creating this cache.`;

        cache.saveCache.mockRejectedValue(new Error(errorMessage));

        const isSaved = await saveCache(repository, branch, githubToken, installDir, os, compiler, env);

        expect(isSaved).toBe(true);
        expect(core.warning).toHaveBeenCalledWith(errorMessage);

        Octokit.prototype.constructor.mockReset();
        fastFolderSize.mockReset();
        cache.saveCache.mockReset();
    });

    it('catches unexpected save cache errors', async () => {
        expect.assertions(2);

        Octokit.prototype.constructor.mockImplementation(() => ({
            request: () => ({
                status: 200,
                data: {
                    object: {
                        sha,
                    },
                },
            }),
        }));

        fastFolderSize.mockImplementation((f, cb) => {
            if (f) cb(null, 1024);
        });

        const errorMessage = 'Oops!';

        cache.saveCache.mockRejectedValue(new Error(errorMessage));

        const isSaved = await saveCache(repository, branch, githubToken, installDir, os, compiler, env);

        expect(isSaved).toBe(false);
        expect(core.warning).toHaveBeenCalledWith(errorMessage);

        Octokit.prototype.constructor.mockReset();
        fastFolderSize.mockReset();
        cache.saveCache.mockReset();
    });
});
