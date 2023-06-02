import * as core from "@actions/core";
import fs from "fs";
import path from "path";

/**
 * Checks an error condition, and displays error message if true.
 *
 * @param {number|boolean} condition Error condition to evaluate.
 * @param {string} errorMessage Error message to display in the log (as a warning).
 * @returns {boolean} Whether the error condition was true or not.
 */
export const isError = (
    condition: number | boolean,
    errorMessage: string
): boolean => {
    if (condition) {
        core.warning(errorMessage);
        core.endGroup();
        return true;
    }

    return false;
};

export const getProjectVersion = (sourceDir: string): string => {
    const cmakeListsPath = path.join(sourceDir, "CMakeLists.txt");
    try {
        const data = fs.readFileSync(cmakeListsPath, "utf-8");
        const pattern = /project\([\s\w]+VERSION\s+((?:\d+)(?:.\d+){0,3})/;
        const match = data.match(pattern);
        if (match && match[1]) {
            return match[1];
        }
        return "";
    } catch (error) {
        if (error instanceof Error)
            isError(true, `Error loading data from ${cmakeListsPath}`);
        return "";
    }
};
