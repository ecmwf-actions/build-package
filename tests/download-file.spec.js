const { HttpClient } = require('@actions/http-client');

const downloadFile = require('../src/download-file');

jest.mock('@actions/http-client');

const url = 'https://foo.bar';
const dest = 'file.ext';

describe('downloadFile', () => {
    it('returns promise that resolves on success', async () => {
        expect.assertions(1);

        HttpClient.prototype.constructor.mockImplementation(() => ({
            get: () => Promise.resolve({
                message: {
                    pipe: () => ({
                        on: (event, cb) => {
                            cb();

                            return {
                                on: () => {},
                            };
                        }
                    }),
                }
            }),
        }));

        await expect(downloadFile(url, dest)).resolves.toBe();

        HttpClient.prototype.constructor.mockReset();
    });

    it('returns promise that rejects on failure', async () => {
        expect.assertions(1);

        const errorMessage = 'Oops!';

        HttpClient.prototype.constructor.mockImplementation(() => ({
            get: () => Promise.resolve({
                message: {
                    pipe: () => ({
                        on: () => {
                            return {
                                on: (event, cb) => cb(new Error(errorMessage)),
                            };
                        }
                    }),
                },
            }),
        }));

        await expect(downloadFile(url, dest)).rejects.toBe(errorMessage);

        HttpClient.prototype.constructor.mockReset();
    });

    it('catches failed request', async () => {
        expect.assertions(1);

        const errorMessage = 'Oops!';

        HttpClient.prototype.constructor.mockImplementation(() => ({
            get: () => Promise.reject(new Error(errorMessage)),
        }));

        await expect(downloadFile(url, dest)).rejects.toBe(errorMessage);

        HttpClient.prototype.constructor.mockReset();
    });
});
