import type { UniqueVehicleId } from "./config";
import * as stringentApc from "./quicktype/stringentApc";

export type ApcCacheKey = UniqueVehicleId;

export interface ApcCacheValue {
  vehicleCounts: stringentApc.Vehiclecounts;
  countingVendorName: string;
  eventTimestamp: number;
}

export type ApcCache = Map<ApcCacheKey, ApcCacheValue>;

/**
 * Select the lower of the two quality levels. Consider the quality order as
 * Regular > Defect > Other.
 */
export const pickLowerQuality = (
  oldQuality: stringentApc.Countquality,
  newQuality: stringentApc.Countquality
): stringentApc.Countquality => {
  let quality = stringentApc.Countquality.Other;
  if (
    oldQuality === stringentApc.Countquality.Regular &&
    newQuality === stringentApc.Countquality.Regular
  ) {
    quality = stringentApc.Countquality.Regular;
  } else if (
    (oldQuality === stringentApc.Countquality.Regular &&
      newQuality === stringentApc.Countquality.Defect) ||
    (oldQuality === stringentApc.Countquality.Defect &&
      newQuality === stringentApc.Countquality.Regular) ||
    (oldQuality === stringentApc.Countquality.Defect &&
      newQuality === stringentApc.Countquality.Defect)
  ) {
    quality = stringentApc.Countquality.Defect;
  }
  return quality;
};

export const sumDoorCounts = (
  oldDoorCounts: stringentApc.Doorcount[],
  newDoorCounts: stringentApc.Doorcount[]
): stringentApc.Doorcount[] => {
  type DoorName = stringentApc.Doorcount["door"];
  type ClassName = stringentApc.Count["class"];
  const doorMap = new Map<DoorName, Map<ClassName, stringentApc.Count>>();
  oldDoorCounts.concat(newDoorCounts).forEach((currentDoorCount) => {
    const classMap = doorMap.get(currentDoorCount.door);
    if (classMap === undefined) {
      doorMap.set(
        currentDoorCount.door,
        new Map(
          currentDoorCount.count.map((currentCount) => [
            currentCount.class,
            currentCount,
          ])
        )
      );
    } else {
      currentDoorCount.count.forEach((currentCount) => {
        const requiredClass = currentCount.class;
        const previousClassValues = classMap.get(requiredClass);
        if (previousClassValues === undefined) {
          classMap.set(requiredClass, currentCount);
        } else {
          classMap.set(requiredClass, {
            class: requiredClass,
            in: previousClassValues.in + currentCount.in,
            out: previousClassValues.out + currentCount.out,
          });
        }
      });
      doorMap.set(currentDoorCount.door, classMap);
    }
  });
  const doorCounts = [...doorMap].map(([doorName, classMap]) => ({
    door: doorName,
    count: [...classMap].map(([, classCount]) => classCount),
  }));
  return doorCounts;
};

export const sumVehicleCounts = (
  oldVehicleCounts: stringentApc.Vehiclecounts,
  newVehicleCounts: stringentApc.Vehiclecounts
): stringentApc.Vehiclecounts => {
  const doorcounts = sumDoorCounts(
    oldVehicleCounts.doorcounts,
    newVehicleCounts.doorcounts
  );
  const countquality = pickLowerQuality(
    oldVehicleCounts.countquality,
    newVehicleCounts.countquality
  );
  return {
    doorcounts,
    countquality,
  };
};

export const sumApcCacheValues = (
  oldValue: ApcCacheValue,
  newValue: ApcCacheValue
): ApcCacheValue => {
  // Retain only the latest timestamp.
  const { countingVendorName, eventTimestamp } = newValue;
  if (countingVendorName !== oldValue.countingVendorName) {
    throw new Error(
      `Old and new countingVendorName should be identical. Instead old value is ${oldValue.countingVendorName} and new value is ${countingVendorName}.`
    );
  }
  const vehicleCounts = sumVehicleCounts(
    oldValue.vehicleCounts,
    newValue.vehicleCounts
  );
  return {
    vehicleCounts,
    countingVendorName,
    eventTimestamp,
  };
};

export const createApcCache = (): {
  get: (key: ApcCacheKey) => ApcCacheValue | undefined;
  add: (key: ApcCacheKey, value: ApcCacheValue) => void;
  remove: (key: ApcCacheKey) => boolean;
} => {
  const cache: ApcCache = new Map<ApcCacheKey, ApcCacheValue>();

  const get = (key: ApcCacheKey): ApcCacheValue | undefined => cache.get(key);

  const add = (key: ApcCacheKey, value: ApcCacheValue): void => {
    const old = cache.get(key);
    if (old === undefined) {
      cache.set(key, value);
    } else {
      cache.set(key, sumApcCacheValues(old, value));
    }
  };

  const remove = (key: ApcCacheKey): boolean => cache.delete(key);

  return {
    get,
    add,
    remove,
  };
};
