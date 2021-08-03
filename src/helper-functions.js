const core = require('@actions/core');

/**
 * Checks an error condition, and displays error message if true.
 *
 * @param {Boolean} condition Error condition to evaluate
 * @param {String} errorMessage Error message to display in the log (as a warning)
 * @returns {Boolean} Whether the error condition was true or not
 */
module.exports.isError = (condition, errorMessage) => {
    if (condition) {
        core.warning(errorMessage);
        core.endGroup();
        return true;
    }

    return false;
};
