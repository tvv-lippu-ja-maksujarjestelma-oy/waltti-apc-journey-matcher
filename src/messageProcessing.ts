import type pino from "pino";
import Pulsar from "pulsar-client";
import type { ProcessingConfig } from "./config";
import { initializeMatching } from "./matching";
import {
  createVehicleRegistryHandler,
  keepUpdatingVehicleRegistry,
} from "./vehicleRegistry";

const APC_RECEIVE_TIMEOUT_MS = 300_000;

export const rewindVehicleRegistryConsumer = async (
  logger: pino.Logger,
  vehicleRegistryConsumer: Pulsar.Consumer
): Promise<boolean> => {
  logger.info(
    "Seeking vehicle registry consumer to the earliest available message"
  );
  try {
    await vehicleRegistryConsumer.seek(Pulsar.MessageId.earliest());
    return true;
  } catch (err) {
    logger.warn(
      { err },
      "Could not rewind vehicle registry consumer; continuing from current cursor"
    );
    return false;
  }
};

const keepReactingToGtfsrt = async (
  logger: pino.Logger,
  producer: Pulsar.Producer,
  gtfsrtConsumer: Pulsar.Consumer,
  receiveTimeoutMs: number,
  expandWithApcAndSend: (
    gtfsrtMessage: Pulsar.Message,
    sendCallback: (fullApcMessage: Pulsar.ProducerMessage) => void
  ) => void
) => {
  // Errors are handled in the calling function.
  /* eslint-disable no-await-in-loop */
  for (;;) {
    let gtfsrtPulsarMessage: Pulsar.Message;
    try {
      gtfsrtPulsarMessage = await gtfsrtConsumer.receive(receiveTimeoutMs);
    } catch (err) {
      logger.error(
        { err, receiveTimeoutMs },
        "GTFS-RT consumer receive failed"
      );
      throw err;
    }
    logger.debug(
      {
        topic: gtfsrtPulsarMessage.getTopicName(),
        eventTimestamp: gtfsrtPulsarMessage.getEventTimestamp(),
        messageId: gtfsrtPulsarMessage.getMessageId().toString(),
        properties: { ...gtfsrtPulsarMessage.getProperties() },
      },
      "Received gtfsrtPulsarMessage"
    );
    expandWithApcAndSend(gtfsrtPulsarMessage, (matchedApcMessage) => {
      // In case of an error, exit via the listener on unhandledRejection.
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      producer.send(matchedApcMessage);
      logger.debug("Matched APC message sent");
    });
    logger.debug(
      {
        topic: gtfsrtPulsarMessage.getTopicName(),
        eventTimestamp: gtfsrtPulsarMessage.getEventTimestamp(),
        messageId: gtfsrtPulsarMessage.getMessageId().toString(),
        properties: { ...gtfsrtPulsarMessage.getProperties() },
      },
      "Ack gtfsrtPulsarMessage"
    );
    // In case of an error, exit via the listener on unhandledRejection.
    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    gtfsrtConsumer.acknowledge(gtfsrtPulsarMessage);
  }
  /* eslint-enable no-await-in-loop */
};

const keepSummingApcValues = async (
  logger: pino.Logger,
  apcConsumer: Pulsar.Consumer,
  updateApcCache: (apcMessage: Pulsar.Message) => void
): Promise<void> => {
  // Errors are handled on the main level.
  /* eslint-disable no-await-in-loop */
  for (;;) {
    let apcMessage: Pulsar.Message | undefined;
    try {
      apcMessage = await apcConsumer.receive(APC_RECEIVE_TIMEOUT_MS);
    } catch (err) {
      logger.warn(
        { err, receiveTimeoutMs: APC_RECEIVE_TIMEOUT_MS },
        "APC consumer receive failed"
      );
    }
    if (apcMessage != null) {
      updateApcCache(apcMessage);
      // In case of an error, exit via the listener on unhandledRejection.
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      apcConsumer.acknowledge(apcMessage);
    }
  }
  /* eslint-enable no-await-in-loop */
};

const keepProcessingMessages = async (
  logger: pino.Logger,
  producer: Pulsar.Producer,
  gtfsrtConsumer: Pulsar.Consumer,
  apcConsumer: Pulsar.Consumer,
  config: ProcessingConfig,
  vehicleRegistryConsumer?: Pulsar.Consumer
): Promise<void> => {
  const { updateApcCache, expandWithApcAndSend } = initializeMatching(
    logger,
    config
  );
  const promises: Promise<void>[] = [
    keepReactingToGtfsrt(
      logger,
      producer,
      gtfsrtConsumer,
      config.gtfsrtReceiveTimeoutMs,
      expandWithApcAndSend
    ),
    keepSummingApcValues(logger, apcConsumer, updateApcCache),
  ];
  if (vehicleRegistryConsumer) {
    const { update } = createVehicleRegistryHandler(
      logger,
      config.countingSystemMap,
      config.includedVehicles
    );
    const canReplayInitialRegistryState = await rewindVehicleRegistryConsumer(
      logger,
      vehicleRegistryConsumer
    );
    if (canReplayInitialRegistryState) {
      // Read all currently available messages to populate the map before
      // processing APC messages.
      logger.info("Reading initial vehicle registry messages...");
      let initialCount = 0;
      try {
        // Use a short timeout to drain all available messages
        // eslint-disable-next-line no-constant-condition
        while (true) {
          // eslint-disable-next-line no-await-in-loop
          const message = await vehicleRegistryConsumer.receive(2000);
          update(message);
          // eslint-disable-next-line no-await-in-loop
          await vehicleRegistryConsumer.acknowledge(message);
          initialCount += 1;
        }
      } catch {
        // Timeout means we have read all currently available messages
      }
      logger.info(
        {
          initialMessagesRead: initialCount,
          mapSize: config.countingSystemMap.size,
          includedVehicles: config.includedVehicles.size,
        },
        "Initial vehicle registry loading complete"
      );
    }

    promises.push(
      keepUpdatingVehicleRegistry(logger, update, vehicleRegistryConsumer)
    );
  }
  // We expect all promises to stay pending.
  await Promise.all(promises);
};

export default keepProcessingMessages;
