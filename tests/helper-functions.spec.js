const core = require('@actions/core');
const { isError } = require('../src/helper-functions');

jest.mock('@actions/core');

describe('isError', () => {
    it('always returns evaluated condition', () => {
        expect.assertions(2);

        [true, false].forEach((condition) => {
            expect(isError(condition)).toBe(condition);
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

        expect(isError(true)).toBe(true);
        expect(core.endGroup).toHaveBeenCalledWith();
    });
});
