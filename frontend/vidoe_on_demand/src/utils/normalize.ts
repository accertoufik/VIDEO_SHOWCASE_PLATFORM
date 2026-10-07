import type { BigIntString } from '../types/api';

/** durationMs / viewCount / positionMs etc. can arrive as "123" or 123. Never do math on the raw value. */
export const toNumber = (value: BigIntString | unknown, fallback = 0): number => {
    if (typeof value === 'number') {
        return Number.isFinite(value) ? value : fallback;
    }
    if(typeof value === 'bigint') {
        return Number(value);
    }
    if (typeof value === 'string' && value.trim() !== '') {
        const parsed = parseFloat(value);
        return Number.isFinite(parsed) ? parsed : fallback;
    }
    return fallback;
}