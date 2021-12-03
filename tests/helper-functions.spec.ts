import * as core from '@actions/core';

import { isError } from '../src/helper-functions';

jest.mock('@actions/core');

describe('isError', () => {
    it('always returns evaluated condition', () => {
        expect.assertions(2);

        [true, false].forEach((condition) => {
            expect(isError(condition, 'foobar')).toBe(condition);
        });
    });

    it('logs error message at the warning level', () => {
        expect.assertions(2);

        const errorMessage = 'This is a recoverable error';

        expect(isError(true, errorMessage)).toBe(true);
        expect(core.warning).toHaveBeenCalledWith(errorMessage);
    });

    it('does not log error message on success', () => {
        expect.assertions(2);

        const errorMessage = 'This is an invisible error';

        expect(isError(false, errorMessage)).toBe(false);
        expect(core.warning).not.toHaveBeenCalledWith(errorMessage);
    });

    it('ends group on error', () => {
        expect.assertions(2);

        expect(isError(true, 'foobar')).toBe(true);
        expect(core.endGroup).toHaveBeenCalledWith();
    });
});
