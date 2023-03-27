/**
 * Возвращает boolean значение по правилу:
 * 'y' => true
 * 'n' => false
 * Если значение не удовлетворяет условиям отображения, функция возвращает false
 *
 * @example
 * // returns true
 * convertEnvToBoolean('y')
 *
 * @example
 * // returns false
 * convertEnvToBoolean('n')
 *
 * @example
 * // returns false
 * convertEnvToBoolean(null)
 */
export const convertEnvToBoolean = (env: string | undefined): boolean => {
  return env ? env === 'y' : false;
};

export const availableEnvBoolean = ['y', 'n'];

export const splitByComma = (value: string): string[] => value.split(',');