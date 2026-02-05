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
    promises.push(
      keepUpdatingVehicleRegistry(logger, update, vehicleRegistryConsumer)
    );
    logger.info(
      { initialMapSize: config.countingSystemMap.size },
      "Vehicle registry consumer configured, countingSystemMap will be updated dynamically"
    );
  }
  // We expect all promises to stay pending.
  await Promise.any(promises);
};

export default keepProcessingMessages;
