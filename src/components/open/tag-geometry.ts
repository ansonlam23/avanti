// Shared geometry for price labels (plain module: usable from server and client).

export const TAG_W = 84;
export const TAG_H = 44;
/** Labels turn around their center when they land. */
export const TAG_ORIGIN = "50% 50%";

/** The small turn a label carries while it flies (degrees). In ink nothing
 *  rests at an angle: every label settles square (0°) as it lands. */
const TURN = [-7, 6, -5, 8, -6, 5, -8, 7];
export const flightTurn = (i: number) => TURN[i % TURN.length];
