const fs = require('fs');
const { HttpClient } = require('@actions/http-client');

/**
 * Downloads a file using `HttpClient` class. Supports HTTP redirection out-of-box.
 *
 * @param {String} url Source URL of file to download.
 * @param {String} dest Destination path where to save the downloaded file.
 * @returns {Promise}
 */
module.exports = (url, dest) => new Promise((resolve, reject) => {
    return new HttpClient().get(url)
        .then((res) => {
            const file = fs.createWriteStream(dest);

            res.message
                .pipe(file)
                .on('finish', () => {
                    file.close(() => {
                        resolve();
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
