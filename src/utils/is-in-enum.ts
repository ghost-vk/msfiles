/**
 * Creates a type guard that checks if a string is in an enum or not..
 * @param e: input enum type to be compared with.
 * @returns desired enum type if passes
 */
export const isInEnum =
  <T extends Record<string, unknown>>(e: T) =>
  (token: unknown): token is T[keyof T] => {
    return Object.values(e).includes(token as T[keyof T]);
  };
