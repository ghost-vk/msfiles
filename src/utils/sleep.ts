export const sleep = (ms = 1000): Promise<void> => new Promise(res => setTimeout(res, ms))
