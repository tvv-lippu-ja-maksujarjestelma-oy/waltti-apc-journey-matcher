import type pino from "pino";
import type Pulsar from "pulsar-client";
import type {
  CountingSystemMap,
  CountingVendorName,
  UniqueVehicleId,
} from "./config";
import * as VehicleApcMapping from "./quicktype/vehicleApcMapping";

/**
 * Get the unique vehicle ID from a VehicleApcMapping.
 * Format: feedPublisherId:operatorId_vehicleShortName
 */
const getUniqueVehicleIdFromVehicleApcMapping = (
  vehicle: VehicleApcMapping.VehicleApcMapping,
  feedPublisherId: string
): UniqueVehicleId | undefined => {
  const { operatorId, vehicleShortName } = vehicle;
  if (operatorId != null && vehicleShortName != null) {
    return `${feedPublisherId}:${operatorId}_${vehicleShortName}` as UniqueVehicleId;
  }
  return undefined;
};

/**
 * Update the countingSystemMap and includedVehicles from a vehicle catalogue message.
 * Clears existing entries for this feedPublisherId and rebuilds from the message.
 */
export const updateCountingSystemMapFromMessage = (
  logger: pino.Logger,
  message: Pulsar.Message,
  feedPublisherId: string,
  countingSystemMap: CountingSystemMap,
  includedVehicles: Set<UniqueVehicleId>
): void => {
  const dataString = message.getData().toString("utf8");

  let vehicles: VehicleApcMapping.VehicleApcMapping[];
  try {
    vehicles = VehicleApcMapping.Convert.toVehicleApcMapping(dataString);
  } catch (err) {
    logger.warn(
      {
        err,
        messageId: message.getMessageId().toString(),
        eventTimestamp: message.getEventTimestamp(),
      },
      "Could not parse vehicle registry message"
    );
    return;
  }

  // Remove existing entries for this feed publisher from both map and set
  const keysToRemove: string[] = [];
  countingSystemMap.forEach(([uniqueVehicleId], countingSystemId) => {
    if (uniqueVehicleId.startsWith(`${feedPublisherId}:`)) {
      keysToRemove.push(countingSystemId);
      includedVehicles.delete(uniqueVehicleId);
    }
  });
  keysToRemove.forEach((id) => countingSystemMap.delete(id));

  let addedCount = 0;
  vehicles.forEach((vehicle) => {
    const uniqueVehicleId = getUniqueVehicleIdFromVehicleApcMapping(
      vehicle,
      feedPublisherId
    );

    if (uniqueVehicleId == null) {
      logger.warn(
        {
          vehicle: {
            operatorId: vehicle.operatorId,
            vehicleShortName: vehicle.vehicleShortName,
          },
        },
        "Could not construct uniqueVehicleId from vehicle"
      );
      return;
    }

    const passengerCounters = vehicle.equipment.filter(
      (eq) => eq.type === "PASSENGER_COUNTER"
    );

    passengerCounters.forEach((counter) => {
      if (counter.id != null) {
        const vendorName: CountingVendorName =
          (counter.apcSystem as CountingVendorName) ?? "unknown";
        countingSystemMap.set(counter.id, [uniqueVehicleId, vendorName]);
        includedVehicles.add(uniqueVehicleId);
        addedCount += 1;
      }
    });
  });

  logger.info(
    {
      feedPublisherId,
      totalVehicles: vehicles.length,
      entriesAdded: addedCount,
      mapSize: countingSystemMap.size,
    },
    "Updated countingSystemMap from vehicle catalogue"
  );
};

/**
 * Create a vehicle registry handler that updates the counting system map from catalogue messages.
 */
export const createVehicleRegistryHandler = (
  logger: pino.Logger,
  countingSystemMap: CountingSystemMap,
  includedVehicles: Set<UniqueVehicleId>
): { update: (message: Pulsar.Message) => void } => {
  const update = (message: Pulsar.Message): void => {
    const topic = message.getTopicName();
    const topicParts = topic.split("/");
    const topicName = topicParts[topicParts.length - 1];

    if (topicName == null) {
      logger.warn({ topic }, "Could not extract topic name from topic");
      return;
    }

    // Extract feedPublisherId from topic name
    // Expected format: vehicle-catalogue-{feedPublisherId} e.g. vehicle-catalogue-fi-jyvaskyla
    const match = topicName.match(/vehicle-catalogue-(.+)/);
    const feedPublisherId =
      match?.[1] != null ? match[1].replace(/-/g, ":") : undefined;

    if (feedPublisherId == null) {
      logger.warn(
        { topic, topicName },
        "Could not determine feedPublisherId from vehicle catalogue topic"
      );
      return;
    }

    updateCountingSystemMapFromMessage(
      logger,
      message,
      feedPublisherId,
      countingSystemMap,
      includedVehicles
    );
  };

  return { update };
};

/**
 * Run the vehicle registry update loop: receive messages and update the counting system map.
 */
export const keepUpdatingVehicleRegistry = async (
  logger: pino.Logger,
  update: (message: Pulsar.Message) => void,
  vehicleRegistryConsumer: Pulsar.Consumer
): Promise<void> => {
  logger.info("Starting vehicle registry update loop");
  for (;;) {
    logger.debug("Waiting for next vehicle registry message...");
    const message = await vehicleRegistryConsumer.receive();
    logger.info(
      {
        messageId: message.getMessageId().toString(),
        eventTimestamp: message.getEventTimestamp(),
        topic: message.getTopicName(),
      },
      "Received vehicle registry message"
    );
    update(message);
    vehicleRegistryConsumer.acknowledge(message);
  }
};
