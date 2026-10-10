/** The folder a video's processed files live in: its original's blob path with "/" and "." turned into "-". */
export const mediaBaseName = (originalBlobPath: string) => originalBlobPath.replace(/[\/\.]/g, '-');

/**
 * Processed folders are named "<creator>-<upload id>-<ext>" (a UUID pair), so always long. Anything short, empty or
 * odd-looking is refused, so a malformed record can never turn into "delete everything".
 */
export const looksLikeVideoFolder = (name: string) => name.length >= 36 && name.includes('-') && !name.includes('..');
