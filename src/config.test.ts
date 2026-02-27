import pino from "pino";
import { getConfig } from "./config";

const logger = pino({ level: "silent" });

describe("getConfig", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  test("normalizes COUNTING_SYSTEM_MAP keys to lowercase", () => {
    process.env["FEED_MAP"] = JSON.stringify([
      [
        "persistent://apc-prod/source/splitted-gtfsrt-vp-fi-jyvaskyla",
        ["fi:jyvaskyla", "209", "Europe/Helsinki"],
      ],
    ]);
    process.env["COUNTING_SYSTEM_MAP"] = JSON.stringify([
      ["JL475-0009d8066d78", ["fi:jyvaskyla:6714_475", "TELIA"]],
    ]);
    process.env["PULSAR_SERVICE_URL"] =
      "pulsar://pulsar-broker.pulsar.svc.cluster.local:6650";
    process.env["PULSAR_PRODUCER_TOPIC"] =
      "persistent://apc-prod/aggregated/aggregated-apc-journey";
    process.env["PULSAR_GTFSRT_CONSUMER_TOPICS_PATTERN"] =
      "persistent://apc-prod/source/splitted-gtfsrt-vp-.*";
    process.env["PULSAR_GTFSRT_SUBSCRIPTION"] = "journey-matcher-gtfsrt-sub";
    process.env["PULSAR_APC_CONSUMER_TOPICS_PATTERN"] =
      "persistent://apc-prod/deduplicated/mqtt-apc-from-vehicle-deduplicated";
    process.env["PULSAR_APC_SUBSCRIPTION"] = "journey-matcher-apc-sub";

    const config = getConfig(logger);

    expect(
      config.processing.countingSystemMap.get("jl475-0009d8066d78")
    ).toStrictEqual(["fi:jyvaskyla:6714_475", "TELIA"]);
    expect(config.processing.countingSystemMap.has("JL475-0009d8066d78")).toBe(
      false
    );
    expect(
      config.processing.includedVehicles.has("fi:jyvaskyla:6714_475")
    ).toBe(true);
  });
});
