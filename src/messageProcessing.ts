import type pino from "pino";
import type Pulsar from "pulsar-client";
import type { ProcessingConfig } from "./config";
import { initializeMatching } from "./matching";
import {
  createVehicleRegistryHandler,
  keepUpdatingVehicleRegistry,
} from "./vehicleRegistry";

const keepReactingToGtfsrt = async (
  logger: pino.Logger,
  producer: Pulsar.Producer,
  gtfsrtConsumer: Pulsar.Consumer,
  expandWithApcAndSend: (
    gtfsrtMessage: Pulsar.Message,
    sendCallback: (fullApcMessage: Pulsar.ProducerMessage) => void
  ) => void
) => {
  // Errors are handled in the calling function.
  /* eslint-disable no-await-in-loop */
  for (;;) {
    const gtfsrtPulsarMessage = await gtfsrtConsumer.receive();
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
  apcConsumer: Pulsar.Consumer,
  updateApcCache: (apcMessage: Pulsar.Message) => void
): Promise<void> => {
  // Errors are handled on the main level.
  /* eslint-disable no-await-in-loop */
  for (;;) {
    const apcMessage = await apcConsumer.receive();
    updateApcCache(apcMessage);
    // In case of an error, exit via the listener on unhandledRejection.
    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    apcConsumer.acknowledge(apcMessage);
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
      expandWithApcAndSend
    ),
    keepSummingApcValues(apcConsumer, updateApcCache),
  ];
  if (vehicleRegistryConsumer) {
    const { update } = createVehicleRegistryHandler(
      logger,
      config.countingSystemMap,
      config.includedVehicles
    );
    // Seek to the beginning so we re-read all retained vehicle catalogue
    // messages on every startup. Without this, the consumer's acknowledged
    // cursor position means it would wait for the next new message (up to 6 h).
    logger.info(
      "Seeking vehicle registry consumer to the beginning of the topic"
    );
    await vehicleRegistryConsumer.seekTimestamp(0);
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
    promises.push(
      keepUpdatingVehicleRegistry(logger, update, vehicleRegistryConsumer)
    );
  }
  // We expect all promises to stay pending.
  await Promise.any(promises);
};

export default keepProcessingMessages;
