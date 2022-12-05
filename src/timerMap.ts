import type { UniqueVehicleId } from "./config";

/**
 * Create a Map of timeoutIds.
 *
 * Setting a callback for a key cancels any previous callbacks for that key.
 * Each callback is triggered after a constant time from the setting of the
 * callback into the Map.
 */
const createTimerMap = (
  waitInSeconds: number
): ((key: UniqueVehicleId, callback: () => void) => void) => {
  const waitInMilliSeconds = 1_000 * waitInSeconds;
  const map = new Map<UniqueVehicleId, NodeJS.Timeout>();

  const cancel = (key: UniqueVehicleId): void => {
    const timeoutId = map.get(key);
    if (timeoutId !== undefined) {
      clearTimeout(timeoutId);
      // This is not strictly necessary as we should overwrite it next but let's
      // delete the old timeoutId just in case we make a mistake elsewhere.
      map.delete(key);
    }
  };

  const set = (key: UniqueVehicleId, callback: () => void): void => {
    const timeoutId = setTimeout(() => {
      map.delete(key);
      callback();
    }, waitInMilliSeconds);
    map.set(key, timeoutId);
  };

  const resetTimer = (key: UniqueVehicleId, callback: () => void): void => {
    cancel(key);
    set(key, callback);
  };

  return resetTimer;
};

export default createTimerMap;
