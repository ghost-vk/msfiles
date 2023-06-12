/**
 * Purpose : A place to implement routines for cleaning whatever mess is left after the tests.
 */
export default async (): Promise<void> => {
  //To kill the process when the tests are finished. Didn't find better way yet - if there are suggestions, feel free to test them out and submit a Merge Request if it works.
  process.exit(0);
};
