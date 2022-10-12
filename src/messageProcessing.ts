import type pino from "pino";
import type Pulsar from "pulsar-client";
import type { ProcessingConfig } from "./config";
import initializeMatching from "./matching";

const keepReactingToGtfsrt = async (
  producer: Pulsar.Producer,
  gtfsrtConsumer: Pulsar.Consumer,
  expandWithApcAndSend: (
    gtfsrtMessage: Pulsar.Message,
    sendCallback: (fullApcMessage: Pulsar.ProducerMessage | undefined) => void
  ) => void
) => {
  // Errors are handled in the calling function.
  /* eslint-disable no-await-in-loop */
  for (;;) {
    const gtfsrtPulsarMessage = await gtfsrtConsumer.receive();
    expandWithApcAndSend(gtfsrtPulsarMessage, (matchedApcMessage) => {
      if (matchedApcMessage !== undefined) {
        // In case of an error, exit via the listener on unhandledRejection.
        // eslint-disable-next-line @typescript-eslint/no-floating-promises
        producer
          .send(matchedApcMessage)
          .then(() => gtfsrtConsumer.acknowledge(gtfsrtPulsarMessage));
      } else {
        // In case of an error, exit via the listener on unhandledRejection.
        // eslint-disable-next-line @typescript-eslint/no-floating-promises
        gtfsrtConsumer.acknowledge(gtfsrtPulsarMessage);
      }
    });
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
  config: ProcessingConfig
): Promise<void> => {
  const { updateApcCache, expandWithApcAndSend } = initializeMatching(
    logger,
    config
  );
  const promises = [
    keepReactingToGtfsrt(producer, gtfsrtConsumer, expandWithApcAndSend),
    keepSummingApcValues(apcConsumer, updateApcCache),
  ];
  // We expect both promises to stay pending.
  await Promise.any(promises);
};

export default keepProcessingMessages;
