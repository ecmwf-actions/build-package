import fs from 'fs';
import { HttpClient } from '@actions/http-client';

/**
 * Downloads a file using `HttpClient` class. Supports HTTP redirection out-of-box.
 *
 * @param {String} url Source URL of file to download.
 * @param {String} dest Destination path where to save the downloaded file.
 * @returns {Promise}
 */
const downloadFile = (url: string, dest: string): Promise<true> => new Promise((resolve, reject) => {
    return new HttpClient().get(url)
        .then((res) => {
            const file = fs.createWriteStream(dest);

            res.message
                .pipe(file)
                .on('finish', () => {
                    file.close(() => {
                        resolve(true);
                    });
                }).on('error', (error) => {
                    fs.unlink(dest, () => {
                        reject(error.message);
                    });
                });
        }).catch((error) => {
            reject(error.message);
        });
});

export default downloadFile;