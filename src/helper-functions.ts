import * as core from '@actions/core';

/**
 * Checks an error condition, and displays error message if true.
 *
 * @param {number|boolean} condition Error condition to evaluate.
 * @param {string} errorMessage Error message to display in the log (as a warning).
 * @returns {boolean} Whether the error condition was true or not.
 */
export const isError = (condition: number | boolean, errorMessage: string): boolean => {
    if (condition) {
        core.warning(errorMessage);
        core.endGroup();
        return true;
    }

    return false;
};
