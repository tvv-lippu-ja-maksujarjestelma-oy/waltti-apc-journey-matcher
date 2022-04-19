import Pulsar from "pulsar-client";
import type { PulsarConfig } from "./config";

export const createPulsarClient = ({
  oauth2Config,
  clientConfig,
}: PulsarConfig) => {
  const authentication = new Pulsar.AuthenticationOauth2(oauth2Config);
  const client = new Pulsar.Client({ ...clientConfig, authentication });
  if (clientConfig.log) {
    Pulsar.Client.setLogHandler(clientConfig.log);
  }
  return client;
};

export const createPulsarProducer = async (
  client: Pulsar.Client,
  { producerConfig }: PulsarConfig
) => {
  // There is a try-catch where this function is called.
  // eslint-disable-next-line @typescript-eslint/return-await
  return await client.createProducer(producerConfig);
};

export const createPulsarConsumer = async (
  client: Pulsar.Client,
  consumerConfig: Pulsar.ConsumerConfig
) => {
  // There is a try-catch where this function is called.
  // eslint-disable-next-line @typescript-eslint/return-await
  return await client.subscribe(consumerConfig);
};
