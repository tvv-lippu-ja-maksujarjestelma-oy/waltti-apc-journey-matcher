# waltti-apc-journey-matcher

Match the APC messages from the vehicles with GTFS Realtime messages to augment the APC messages with GTFS trip metadata.

To do the matching, one needs a mapping between the vehicle IDs and the installed counting system IDs.
During the pilot phase, the mapping can be encoded in an environment variable.
After the APC pilot phase, the mapping should be managed in a separate system from this microservice, e.g. in the fleet registry.

This repository has been created as part of the [Waltti APC](https://github.com/tvv-lippu-ja-maksujarjestelma-oy/waltti-apc) project.

## Development

1. Install [the build dependencies for the Apache Pulsar C++ client](https://pulsar.apache.org/docs/en/client-libraries-cpp/#system-requirements).
1. Create a suitable `.env` file for configuration.
   Check below for the configuration reference.
1. Create any necessary secrets that the `.env` file points to.
1. Install dependencies:

   ```sh
   npm install
   ```

1. Run linters and tests and build:

   ```sh
   npm run check-and-build
   ```

1. Load the environment variables:

   ```sh
   set -a
   source .env
   set +a
   ```

1. Run the application:

   ```sh
   npm start
   ```

## Docker

You can use the Docker image `ghcr.io/tvv-lippu-ja-maksujarjestelma-oy/waltti-apc-journey-matcher:edge`.
Check out [the available tags](https://github.com/tvv-lippu-ja-maksujarjestelma-oy/waltti-apc-journey-matcher/pkgs/container/waltti-apc-journey-matcher).

## Configuration

| Environment variable                    | Required? | Default value | Description                                                                                                                                                                                                                                                                                                                                                                    |
| --------------------------------------- | --------- | ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `COUNTING_SYSTEM_TO_VEHICLE_MAP`        | ✅ Yes    |               | A map from each counting system ID to the vehicle ID of the vehicle in which the counting system is installed. The format is a stringified JSON array of arrays containing string pairs, like the output of `Map.prototype.values()`. An example could be `[[\"c5e96843-e820-4837-8eef-6176be4b4c4e\",\"6714_503\"],[\"6dd41f2e-841f-44a0-b5f8-a108847dc4a2\",\"6714_529\"]]`. |
| `FEED_PUBLISHER_ID`                     | ✅ Yes    |               | A unique ID for the authority or the GTFS feed publisher whose APC data will be handled by the software. The format is `<country-code>:<name>` where `<country-code>` follows a _lowercase_ version of [ISO 3166-1 alpha-2](https://en.wikipedia.org/wiki/ISO_3166-1_alpha-2) and `<name>` is unique within the country. An example could be `fi:jyvaskyla`.                   |
| `HEALTH_CHECK_PORT`                     | ❌ No     | `8080`        | Which port to use to respond to health checks.                                                                                                                                                                                                                                                                                                                                 |
| `PULSAR_APC_CONSUMER_TOPICS_PATTERN`    | ✅ Yes    |               | The topic pattern to consume APC vehicle messages from.                                                                                                                                                                                                                                                                                                                        |
| `PULSAR_APC_SUBSCRIPTION`               | ✅ Yes    |               | The name of the subscription for reading messages from `PULSAR_APC_CONSUMER_TOPICS_PATTERN`.                                                                                                                                                                                                                                                                                   |
| `PULSAR_BLOCK_IF_QUEUE_FULL`            | ❌ No     | `true`        | Whether the send operations of the producer should block when the outgoing message queue is full. If false, send operations will immediately fail when the queue is full.                                                                                                                                                                                                      |
| `PULSAR_COMPRESSION_TYPE`               | ❌ No     | `ZSTD`        | The compression type to use in the topic where messages are sent. Must be one of `Zlib`, `LZ4`, `ZSTD` or `SNAPPY`.                                                                                                                                                                                                                                                            |
| `PULSAR_GTFSRT_CONSUMER_TOPICS_PATTERN` | ✅ Yes    |               | The topic pattern to consume GTFS Realtime messages from.                                                                                                                                                                                                                                                                                                                      |
| `PULSAR_GTFSRT_SUBSCRIPTION`            | ✅ Yes    |               | The name of the subscription for reading messages from `PULSAR_GTFSRT_CONSUMER_TOPICS_PATTERN`.                                                                                                                                                                                                                                                                                |
| `PULSAR_OAUTH2_AUDIENCE`                | ✅ Yes    |               | The OAuth 2.0 audience.                                                                                                                                                                                                                                                                                                                                                        |
| `PULSAR_OAUTH2_ISSUER_URL`              | ✅ Yes    |               | The OAuth 2.0 issuer URL.                                                                                                                                                                                                                                                                                                                                                      |
| `PULSAR_OAUTH2_KEY_PATH`                | ✅ Yes    |               | The path to the OAuth 2.0 private key JSON file.                                                                                                                                                                                                                                                                                                                               |
| `PULSAR_PRODUCER_TOPIC`                 | ✅ Yes    |               | The topic to send messages to.                                                                                                                                                                                                                                                                                                                                                 |
| `PULSAR_SERVICE_URL`                    | ✅ Yes    |               | The service URL.                                                                                                                                                                                                                                                                                                                                                               |
| `PULSAR_TLS_VALIDATE_HOSTNAME`          | ❌ No     | `true`        | Whether to validate the hostname on its TLS certificate. This option exists because some Apache Pulsar hosting providers cannot handle Apache Pulsar clients setting this to `true`.                                                                                                                                                                                           |
| `TIMEZONE_NAME`                         | ✅ Yes    |               | The timezone used by the authority or the GTFS feed publisher for local time. Given in the format of an [IANA timezone (tz database)](https://en.wikipedia.org/wiki/List_of_tz_database_time_zones), e.g. `Europe/Helsinki`.                                                                                                                                                   |
