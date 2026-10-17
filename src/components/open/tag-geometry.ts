// Shared geometry for price stickers (plain module: usable from server and client).

export const TAG_W = 84;
export const TAG_H = 44;
/** Stickers turn around their center when they land. */
export const TAG_ORIGIN = "50% 50%";

/** Each row's sticker rests at its own small angle (degrees). */
const REST = [-4, 3, -2, 5, -3, 2, -5, 4];
export const restAngle = (i: number) => REST[i % REST.length];
