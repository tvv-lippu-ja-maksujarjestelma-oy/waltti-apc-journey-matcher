import type Pulsar from "pulsar-client";
import type { AugmentedApcEvent } from "./mapper";

export const keepUpdatingTripDetails = async (
  gtfsrtConsumer: Pulsar.Consumer,
  updateTripDetails: (gtfsrtMessage: Pulsar.Message) => void
) => {
  // Errors are handled in the calling function.
  /* eslint-disable no-await-in-loop */
  for (;;) {
    const gtfsrtMessage = await gtfsrtConsumer.receive();
    updateTripDetails(gtfsrtMessage);
    await gtfsrtConsumer.acknowledge(gtfsrtMessage);
  }
  /* eslint-enable no-await-in-loop */
};

export const keepAugmentingAndSending = async (
  producer: Pulsar.Producer,
  apcConsumer: Pulsar.Consumer,
  augmentWithTripDetails: (
    apcMessage: Pulsar.Message
  ) => AugmentedApcEvent | undefined
) => {
  // Errors are handled in the calling function.
  /* eslint-disable no-await-in-loop */
  for (;;) {
    const apcMessage = await apcConsumer.receive();
    const augmentedApcEvent = augmentWithTripDetails(apcMessage);
    if (augmentedApcEvent !== undefined) {
      // In case of an error, exit via the listener on unhandledRejection.
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      producer
        .send({
          data: Buffer.from(JSON.stringify(augmentWithTripDetails), "utf8"),
          eventTimestamp: Date.now(),
        })
        .then(() => {
          // In case of an error, exit via the listener on unhandledRejection.
          // eslint-disable-next-line @typescript-eslint/no-floating-promises
          apcConsumer.acknowledge(apcMessage).then(() => {});
        });
    }
  }
  /* eslint-enable no-await-in-loop */
};
