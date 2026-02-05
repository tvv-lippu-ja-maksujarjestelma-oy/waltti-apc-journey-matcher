import type pino from "pino";
import Pulsar from "pulsar-client";
import type { MatchedApc } from "./quicktype/matchedApc";
import type { Apc } from "./quicktype/stringentApc";

export type CountingSystemId = NonNullable<Apc["countingSystemId"]>;

export type FeedPublisherId = string;

export type WalttiAuthorityId = string;

export type VehicleId = string;

export type UniqueVehicleId = `${FeedPublisherId}:${VehicleId}`;

export type CountingDeviceId = MatchedApc["countingDeviceId"];

export type CountingVendorName = MatchedApc["countingVendorName"];

export type CountingSystemMap = Map<
  CountingSystemId,
  [UniqueVehicleId, CountingVendorName]
>;

export type TimezoneName = string;

export type FeedMap = Map<
  string,
  [FeedPublisherId, WalttiAuthorityId, TimezoneName]
>;

export interface ProcessingConfig {
  apcWaitInSeconds: number;
  countingSystemMap: CountingSystemMap;
  includedVehicles: Set<UniqueVehicleId>;
  feedMap: FeedMap;
}

export interface PulsarOauth2Config {
  // pulsar-client requires "type" but that seems unnecessary
  type: string;
  issuer_url: string;
  client_id?: string;
  client_secret?: string;
  private_key?: string;
  audience?: string;
  scope?: string;
}

export interface VehicleRegistryConsumerConfig {
  topicsPattern: string;
  subscription: string;
  subscriptionType: "Exclusive";
  subscriptionInitialPosition: "Earliest";
}

export interface PulsarConfig {
  oauth2Config?: PulsarOauth2Config;
  clientConfig: Pulsar.ClientConfig;
  producerConfig: Pulsar.ProducerConfig;
  gtfsrtConsumerConfig: Pulsar.ConsumerConfig;
  apcConsumerConfig: Pulsar.ConsumerConfig;
  vehicleRegistryConsumerConfig?: VehicleRegistryConsumerConfig;
}

export interface HealthCheckConfig {
  port: number;
}

export interface Config {
  processing: ProcessingConfig;
  pulsar: PulsarConfig;
  healthCheck: HealthCheckConfig;
}

const getRequired = (envVariable: string) => {
  const variable = process.env[envVariable];
  if (variable === undefined) {
    throw new Error(`${envVariable} must be defined`);
  }
  return variable;
};

const getOptional = (envVariable: string) => process.env[envVariable];

const getOptionalBooleanWithDefault = (
  envVariable: string,
  defaultValue: boolean
) => {
  let result = defaultValue;
  const str = getOptional(envVariable);
  if (str !== undefined) {
    if (!["false", "true"].includes(str)) {
      throw new Error(`${envVariable} must be either "false" or "true"`);
    }
    result = str === "true";
  }
  return result;
};

const getOptionalFiniteFloatWithDefault = (
  envVariable: string,
  defaultValue: number
) => {
  let result = defaultValue;
  const str = getOptional(envVariable);
  if (str !== undefined) {
    result = Number.parseFloat(str);
    if (!Number.isFinite(result)) {
      throw new Error(`${envVariable} must be a finite float`);
    }
  }
  return result;
};

const getStringTripleMap = (
  envVariable: string
): Map<string, [string, string, string]> => {
  // Check the contents below. Crashing here is fine, too.
  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
  const keyValueList = JSON.parse(getRequired(envVariable));
  if (!Array.isArray(keyValueList)) {
    throw new Error(`${envVariable} must be a an array`);
  }
  const map = new Map<string, [string, string, string]>(keyValueList);
  if (map.size < 1) {
    throw new Error(
      `${envVariable} must have at least one array entry in the form of [string, [string, string, string]].`
    );
  }
  if (map.size !== keyValueList.length) {
    throw new Error(`${envVariable} must have each key only once.`);
  }
  if (
    Array.from(map.values()).some(
      (triple) => !Array.isArray(triple) || triple.length !== 3
    ) ||
    Array.from(map.entries())
      .flat(2)
      .some((x) => typeof x !== "string")
  ) {
    throw new Error(
      `${envVariable} must contain only strings in the form of [string, [string, string, string]].`
    );
  }
  return map;
};

const getOptionalCountingSystemMap = (): {
  map: CountingSystemMap;
  includedVehicles: Set<UniqueVehicleId>;
} => {
  const raw = getOptional("COUNTING_SYSTEM_MAP");
  const map: CountingSystemMap = new Map();
  if (raw != null && raw.trim() !== "" && raw !== "[]") {
    try {
      const keyValueList = JSON.parse(raw) as unknown;
      if (Array.isArray(keyValueList)) {
        for (const entry of keyValueList) {
          if (
            Array.isArray(entry) &&
            entry.length === 2 &&
            typeof entry[0] === "string" &&
            Array.isArray(entry[1]) &&
            entry[1].length === 2 &&
            typeof entry[1][0] === "string" &&
            typeof entry[1][1] === "string"
          ) {
            const [uniqueVehicleId, vendor] = entry[1] as [string, string];
            const parts = uniqueVehicleId.split(":");
            if (
              parts.length >= 2 &&
              parts.slice(0, -1).join("").length >= 1 &&
              parts.slice(-1).join("").length >= 1
            ) {
              map.set(entry[0], [uniqueVehicleId as UniqueVehicleId, vendor]);
            }
          }
        }
      }
    } catch {
      // Invalid: leave map empty
    }
  }
  const includedVehicles = new Set<UniqueVehicleId>(
    Array.from(map.values()).map(([uniqueVehicleId]) => uniqueVehicleId)
  );
  return { map, includedVehicles };
};

const getProcessingConfig = (): ProcessingConfig => {
  const apcWaitInSeconds = getOptionalFiniteFloatWithDefault(
    "APC_WAIT_IN_SECONDS",
    6
  );
  const { map: countingSystemMap, includedVehicles } =
    getOptionalCountingSystemMap();
  const feedMap = getStringTripleMap("FEED_MAP");
  return {
    apcWaitInSeconds,
    countingSystemMap,
    includedVehicles,
    feedMap,
  };
};

const getPulsarOauth2Config = (): PulsarOauth2Config | undefined => {
  const issuerUrl = getOptional("PULSAR_OAUTH2_ISSUER_URL");
  const privateKey = getOptional("PULSAR_OAUTH2_KEY_PATH");
  const audience = getOptional("PULSAR_OAUTH2_AUDIENCE");

  const anyProvided =
    issuerUrl !== undefined ||
    privateKey !== undefined ||
    audience !== undefined;
  if (!anyProvided) {
    return undefined;
  }

  if (!issuerUrl || !privateKey || !audience) {
    throw new Error(
      "If any of PULSAR_OAUTH2_ISSUER_URL, PULSAR_OAUTH2_KEY_PATH, PULSAR_OAUTH2_AUDIENCE is defined, all must be defined."
    );
  }

  return {
    // pulsar-client requires "type" but that seems unnecessary
    type: "client_credentials",
    issuer_url: issuerUrl,
    private_key: privateKey,
    audience,
  };
};

const createPulsarLog =
  (logger: pino.Logger) =>
  (
    level: Pulsar.LogLevel,
    file: string,
    line: number,
    message: string
  ): void => {
    switch (level) {
      case Pulsar.LogLevel.DEBUG:
        logger.debug({ file, line }, message);
        break;
      case Pulsar.LogLevel.INFO:
        logger.info({ file, line }, message);
        break;
      case Pulsar.LogLevel.WARN:
        logger.warn({ file, line }, message);
        break;
      case Pulsar.LogLevel.ERROR:
        logger.error({ file, line }, message);
        break;
      default: {
        const exhaustiveCheck: never = level;
        throw new Error(String(exhaustiveCheck));
      }
    }
  };

const getPulsarCompressionType = (): Pulsar.CompressionType => {
  const compressionType = getOptional("PULSAR_COMPRESSION_TYPE") ?? "ZSTD";
  // tsc does not understand:
  // if (!["Zlib", "LZ4", "ZSTD", "SNAPPY"].includes(compressionType)) {
  if (
    compressionType !== "Zlib" &&
    compressionType !== "LZ4" &&
    compressionType !== "ZSTD" &&
    compressionType !== "SNAPPY"
  ) {
    throw new Error(
      "If defined, PULSAR_COMPRESSION_TYPE must be one of 'Zlib', 'LZ4', " +
        "'ZSTD' or 'SNAPPY'. Default is 'ZSTD'."
    );
  }
  return compressionType;
};

const getPulsarConfig = (logger: pino.Logger): PulsarConfig => {
  const oauth2Config = getPulsarOauth2Config();
  const serviceUrl = getRequired("PULSAR_SERVICE_URL");
  const tlsValidateHostname = getOptionalBooleanWithDefault(
    "PULSAR_TLS_VALIDATE_HOSTNAME",
    true
  );
  const log = createPulsarLog(logger);
  const producerTopic = getRequired("PULSAR_PRODUCER_TOPIC");
  const blockIfQueueFull = getOptionalBooleanWithDefault(
    "PULSAR_BLOCK_IF_QUEUE_FULL",
    true
  );
  const compressionType = getPulsarCompressionType();
  const gtfsrtConsumerTopicsPattern = getRequired(
    "PULSAR_GTFSRT_CONSUMER_TOPICS_PATTERN"
  );
  const gtfsrtSubscription = getRequired("PULSAR_GTFSRT_SUBSCRIPTION");
  const gtfsrtSubscriptionType = "Exclusive";
  const gtfsrtSubscriptionInitialPosition = "Earliest";
  const apcConsumerTopicsPattern = getRequired(
    "PULSAR_APC_CONSUMER_TOPICS_PATTERN"
  );
  const apcSubscription = getRequired("PULSAR_APC_SUBSCRIPTION");
  const apcSubscriptionType = "Exclusive";
  const apcSubscriptionInitialPosition = "Earliest";
  const vehicleRegistryConsumerTopicsPattern = getOptional(
    "PULSAR_VEHICLE_REGISTRY_CONSUMER_TOPICS_PATTERN"
  );
  const vehicleRegistrySubscription =
    getOptional("PULSAR_VEHICLE_REGISTRY_SUBSCRIPTION") ??
    "journey-matcher-vehicle-registry";
  const base = {
    clientConfig: {
      serviceUrl,
      tlsValidateHostname,
      log,
    },
    producerConfig: {
      topic: producerTopic,
      blockIfQueueFull,
      compressionType,
    },
    gtfsrtConsumerConfig: {
      topicsPattern: gtfsrtConsumerTopicsPattern,
      subscription: gtfsrtSubscription,
      subscriptionType: gtfsrtSubscriptionType,
      subscriptionInitialPosition: gtfsrtSubscriptionInitialPosition,
    },
    apcConsumerConfig: {
      topicsPattern: apcConsumerTopicsPattern,
      subscription: apcSubscription,
      subscriptionType: apcSubscriptionType,
      subscriptionInitialPosition: apcSubscriptionInitialPosition,
    },
    vehicleRegistryConsumerConfig: vehicleRegistryConsumerTopicsPattern
      ? {
          topicsPattern: vehicleRegistryConsumerTopicsPattern,
          subscription: vehicleRegistrySubscription,
          subscriptionType: "Exclusive" as const,
          subscriptionInitialPosition: "Earliest" as const,
        }
      : undefined,
  };

  const result = oauth2Config ? { ...base, oauth2Config } : base;

  return result as PulsarConfig;
};

const getHealthCheckConfig = () => {
  const port = parseInt(getOptional("HEALTH_CHECK_PORT") ?? "8080", 10);
  return { port };
};

export const getConfig = (logger: pino.Logger): Config => ({
  processing: getProcessingConfig(),
  pulsar: getPulsarConfig(logger),
  healthCheck: getHealthCheckConfig(),
});
