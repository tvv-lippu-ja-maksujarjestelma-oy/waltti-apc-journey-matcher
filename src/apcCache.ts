import type pino from "pino";
import type {
  CountingDeviceId,
  CountingVendorName,
  UniqueVehicleId,
} from "./config";
import * as stringentApc from "./quicktype/stringentApc";

export type ApcCacheKey = UniqueVehicleId;
export interface ApcCacheValueElement {
  vehicleCounts: stringentApc.Vehiclecounts;
  countingDeviceId: CountingDeviceId;
  countingVendorName: CountingVendorName;
  eventTimestamp: number;
}
export type ApcCache = Map<ApcCacheKey, ApcCacheValueElement[]>;

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

export const sumApcCacheValueElements = (
  logger: pino.Logger,
  oldValue: ApcCacheValueElement,
  newValue: ApcCacheValueElement
): ApcCacheValueElement => {
  // Retain only the latest timestamp.
  const { countingDeviceId, countingVendorName, eventTimestamp } = newValue;
  if (
    countingVendorName !== oldValue.countingVendorName ||
    countingDeviceId !== oldValue.countingDeviceId
  ) {
    logger.fatal(
      {
        oldCountingVendorName: oldValue.countingVendorName,
        countingVendorName,
      },
      "Old and new countingVendorName should be identical"
    );
    throw new Error(
      `Old and new countingVendorName should be identical. Instead old value is ${oldValue.countingVendorName} and new value is ${countingVendorName}.`
    );
  }
  if (countingDeviceId !== oldValue.countingDeviceId) {
    logger.fatal(
      {
        oldCountingDeviceId: oldValue.countingDeviceId,
        countingDeviceId,
      },
      "Old and new countingDeviceId should be identical"
    );
    throw new Error(
      `Old and new countingDeviceId should be identical. Instead old value is ${oldValue.countingDeviceId} and new value is ${countingDeviceId}.`
    );
  }
  const vehicleCounts = sumVehicleCounts(
    oldValue.vehicleCounts,
    newValue.vehicleCounts
  );
  return {
    vehicleCounts,
    countingDeviceId,
    countingVendorName,
    eventTimestamp,
  };
};

export const createApcCache = (
  logger: pino.Logger
): {
  get: (key: ApcCacheKey) => ApcCacheValueElement[] | undefined;
  add: (key: ApcCacheKey, value: ApcCacheValueElement) => void;
  remove: (key: ApcCacheKey) => boolean;
} => {
  const cache: ApcCache = new Map<ApcCacheKey, ApcCacheValueElement[]>();

  // Get counts of all vendors for given vehicle.
  const get = (key: ApcCacheKey): ApcCacheValueElement[] | undefined =>
    cache.get(key);

  // Add counts of one vendor for given vehicle.
  const add = (key: ApcCacheKey, valueElement: ApcCacheValueElement): void => {
    const elements = cache.get(key);
    if (elements === undefined) {
      cache.set(key, [valueElement]);
    } else {
      if (elements.length < 1) {
        logger.fatal(
          { key, cache: JSON.stringify(cache) },
          "apcCache must not have an empty array stored for a key"
        );
        throw new Error(
          `apcCache ${JSON.stringify(
            cache
          )} has an empty array stored for key ${key}`
        );
      }
      const { countingVendorName } = valueElement;
      const index = elements.findIndex(
        (elem) => elem.countingVendorName === countingVendorName
      );
      if (index < 0) {
        elements.push(valueElement);
        cache.set(key, elements);
      } else {
        const oldValueElement = elements[index];
        if (oldValueElement === undefined) {
          logger.fatal(
            { elements, index, countingVendorName },
            "oldValueElement must not be undefined"
          );
          throw new Error(
            `oldValueElement must not be undefined. countingVendorName ${countingVendorName} was expected to be in index ${index} of elements ${JSON.stringify(
              elements
            )}`
          );
        }
        elements[index] = sumApcCacheValueElements(
          logger,
          oldValueElement,
          valueElement
        );
        cache.set(key, elements);
      }
    }
  };

  // Remove counts of all vendors for given vehicle.
  const remove = (key: ApcCacheKey): boolean => cache.delete(key);

  return {
    get,
    add,
    remove,
  };
};
