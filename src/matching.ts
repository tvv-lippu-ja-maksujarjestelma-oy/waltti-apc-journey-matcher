import { add, intervalToDuration, sub } from "date-fns";
import { zonedTimeToUtc } from "date-fns-tz";
import type pino from "pino";
import type Pulsar from "pulsar-client";
import { ApcCacheValueElement, createApcCache } from "./apcCache";
import type {
  CountingSystemId,
  CountingSystemMap,
  FeedMap,
  FeedPublisherId,
  ProcessingConfig,
  UniqueVehicleId,
  WalttiAuthorityId,
} from "./config";
import { transit_realtime } from "./protobuf/gtfsRealtime";
import * as stringentApc from "./quicktype/stringentApc";
import * as matchedApc from "./quicktype/matchedApc";
import {
  createVehicleJourneyCache,
  formVehicleJourney,
  VehicleJourney,
} from "./vehicleJourneyCache";
import createTimerMap from "./timerMap";

export const extractVehiclesFromCountingSystemMap = (
  countingSystemMap: CountingSystemMap
): Set<UniqueVehicleId> =>
  new Set(
    Array.from(countingSystemMap.values()).map(
      ([uniqueVehicleId]) => uniqueVehicleId
    )
  );

export const getFeedDetails = (
  feedMap: FeedMap,
  topic: string
):
  | {
      feedPublisherId: FeedPublisherId;
      walttiAuthorityId: WalttiAuthorityId;
      timezoneName: string;
    }
  | undefined => {
  let result;
  const feedDetails = feedMap.get(topic);
  if (feedDetails !== undefined) {
    result = {
      feedPublisherId: feedDetails[0],
      walttiAuthorityId: feedDetails[1],
      timezoneName: feedDetails[2],
    };
  }
  return result;
};

export const getUniqueVehicleId = (
  entity: transit_realtime.IFeedEntity,
  feedPublisherId: string
): UniqueVehicleId | undefined => {
  let result: UniqueVehicleId | undefined;
  const vehicleId = entity.vehicle?.vehicle?.id;
  if (vehicleId != null) {
    result = `${feedPublisherId}:${vehicleId}`;
  }
  return result;
};

export const getCountingSystemIdFromMqttTopic = (
  mqttTopic: string | undefined
): CountingSystemId | undefined =>
  mqttTopic === undefined ? undefined : mqttTopic.split("/").at(5);

const flattenCounts = (
  doorCounts: stringentApc.Doorcount
): matchedApc.DoorClassCount[] =>
  doorCounts.count.map((currentCount) => ({
    // FIXME: no any
    /* eslint-disable @typescript-eslint/no-unsafe-assignment */
    /* eslint-disable @typescript-eslint/no-explicit-any */
    countClass: currentCount.class as any,
    /* eslint-enable @typescript-eslint/no-unsafe-assignment */
    /* eslint-enable @typescript-eslint/no-explicit-any */
    in: currentCount.in,
    out: currentCount.out,
    // Telia might send an integer.
    doorName: doorCounts.door.toString(),
  }));

export const formatDateToZuluWithoutMilliseconds = (date: Date): string =>
  `${date.toISOString().slice(0, 19)}Z`;

export const calculateUtcStartTime = (
  startDate: string,
  startTime: string,
  timezoneName: string
) => {
  const [hours, minutes, seconds] = startTime.split(":").map(Number);
  const totalSeconds =
    (hours ?? 0) * 3600 + (minutes ?? 0) * 60 + (seconds ?? 0);
  const duration = intervalToDuration({ start: 0, end: 1_000 * totalSeconds });
  const utcStartTime = sub(
    add(zonedTimeToUtc(`${startDate}T12:00:00`, timezoneName), duration),
    intervalToDuration({ start: 0, end: 12 * 60 * 60 * 1_000 })
  );
  return formatDateToZuluWithoutMilliseconds(utcStartTime);
};

const expandWithApc = (
  vehicleJourney: VehicleJourney,
  oneVendorApc: ApcCacheValueElement
): matchedApc.MatchedApc => ({
  authorityId: vehicleJourney.authorityId,
  // FIXME: no any
  /* eslint-disable @typescript-eslint/no-unsafe-assignment */
  /* eslint-disable @typescript-eslint/no-explicit-any */
  countQuality: oneVendorApc.vehicleCounts.countquality as any,
  /* eslint-enable @typescript-eslint/no-unsafe-assignment */
  /* eslint-enable @typescript-eslint/no-explicit-any */
  countingDeviceId: oneVendorApc.countingDeviceId,
  countingVendorName: oneVendorApc.countingVendorName,
  doorClassCounts: oneVendorApc.vehicleCounts.doorcounts.flatMap(flattenCounts),
  gtfsrtCurrentStopSequence: vehicleJourney.stopSequence,
  gtfsrtDirectionId: vehicleJourney.directionId,
  gtfsrtRouteId: vehicleJourney.routeId,
  gtfsrtStartDate: vehicleJourney.startDate,
  gtfsrtStartTime: vehicleJourney.startTime,
  gtfsrtStopId: vehicleJourney.stopId,
  gtfsrtTripId: vehicleJourney.tripId,
  gtfsrtVehicleId: vehicleJourney.vehicleId,
  schemaVersion: "1-0-0",
  timezoneName: vehicleJourney.timezoneName,
  utcStartTime: calculateUtcStartTime(
    vehicleJourney.startDate,
    vehicleJourney.startTime,
    vehicleJourney.timezoneName
  ),
});

const formMatchedApcMessage = (
  vehicleJourney: VehicleJourney,
  oneVendorApc: ApcCacheValueElement
): Pulsar.ProducerMessage => {
  const matchedApcData = expandWithApc(vehicleJourney, oneVendorApc);
  const encoded = Buffer.from(
    matchedApc.Convert.matchedApcToJson(matchedApcData),
    "utf8"
  );
  return {
    data: encoded,
    properties: { topicSuffix: vehicleJourney.authorityId },
    eventTimestamp: oneVendorApc.eventTimestamp,
  };
};

export const initializeMatching = (
  logger: pino.Logger,
  { apcWaitInSeconds, countingSystemMap, feedMap }: ProcessingConfig
) => {
  const apcCache = createApcCache(logger);
  const vehicleJourneyCache = createVehicleJourneyCache();
  const resetTimer = createTimerMap(apcWaitInSeconds);
  const includedVehicles =
    extractVehiclesFromCountingSystemMap(countingSystemMap);

  const updateApcCache = (apcPulsarMessage: Pulsar.Message): void => {
    const dataString = apcPulsarMessage.getData().toString("utf8");
    let apcMessage;
    try {
      apcMessage = stringentApc.Convert.toStringentApcMessage(dataString);
    } catch (err) {
      logger.warn(
        {
          err,
          apcPulsarMessage: JSON.stringify(apcPulsarMessage),
          apcPulsarMessageDataString: dataString,
        },
        "Could not parse apcPulsarMessage"
      );
      return;
    }
    const countingSystemId =
      apcMessage.APC.countingSystemId ??
      getCountingSystemIdFromMqttTopic(
        apcPulsarMessage.getProperties()["mqttTopic"]
      );
    if (countingSystemId === undefined) {
      logger.error(
        {
          apcMessage: JSON.stringify(apcMessage),
          apcPulsarMessageProperties: JSON.stringify(
            apcPulsarMessage.getProperties()
          ),
        },
        "countingSystemId could not be found from the Pulsar message payload nor the properties. The bug seems to be upstream along the data pipeline."
      );
      return;
    }
    const countingSystemDetails = countingSystemMap.get(countingSystemId);
    if (countingSystemDetails === undefined) {
      logger.error(
        { apcMessage: JSON.stringify(apcMessage), countingSystemMap },
        "countingSystemId could not be found from countingSystemMap. Try adding the missing countingSystemId into the configuration."
      );
      return;
    }
    const [uniqueVehicleId, countingVendorName] = countingSystemDetails;
    const apcCacheValue = {
      vehicleCounts: apcMessage.APC.vehiclecounts,
      countingDeviceId: countingSystemId,
      countingVendorName,
      eventTimestamp: apcPulsarMessage.getEventTimestamp(),
    };
    logger.debug(
      {
        uniqueVehicleId,
        countingVendorName,
        eventTimestamp: apcPulsarMessage.getEventTimestamp(),
      },
      "Add into APC cache"
    );
    apcCache.add(uniqueVehicleId, apcCacheValue);
  };

  const expandWithApcAndSend = (
    gtfsrtPulsarMessage: Pulsar.Message,
    sendCallback: (fullApcMessage: Pulsar.ProducerMessage) => void
  ): void => {
    let gtfsrtMessage;
    try {
      gtfsrtMessage = transit_realtime.FeedMessage.decode(
        gtfsrtPulsarMessage.getData()
      );
    } catch (err) {
      logger.warn(
        { err },
        "The GTFS Realtime message does not conform to the proto definition"
      );
      return;
    }
    const pulsarTopic = gtfsrtPulsarMessage.getTopicName();
    const feedDetails = getFeedDetails(feedMap, pulsarTopic);
    if (feedDetails === undefined) {
      logger.warn(
        { pulsarTopic, gtfsrtMessage: JSON.stringify(gtfsrtMessage) },
        "Could not get feed details from the Pulsar topic name"
      );
      return;
    }
    logger.debug(
      { nEntity: gtfsrtMessage.entity.length },
      "Handle each GTFS Realtime entity"
    );
    gtfsrtMessage.entity.forEach((entity) => {
      const uniqueVehicleId = getUniqueVehicleId(
        entity,
        feedDetails.feedPublisherId
      );
      if (uniqueVehicleId == null) {
        logger.warn(
          { feedDetails, feedEntity: JSON.stringify(entity) },
          "Could not form uniqueVehicleId from the feed entity"
        );
        return;
      }
      if (includedVehicles.has(uniqueVehicleId)) {
        logger.debug({ uniqueVehicleId }, "Got message for included vehicle");
        const vehicleJourney = formVehicleJourney(entity, feedDetails);
        if (vehicleJourney === undefined) {
          logger.warn(
            { feedEntity: JSON.stringify(entity) },
            "The feed entity could not be turned into vehicle journey"
          );
          return;
        }
        const cachedVehicleJourney = vehicleJourneyCache.get(uniqueVehicleId);
        if (cachedVehicleJourney === undefined) {
          // The very first message should not trigger sending as we are waiting
          // for the moment of stopSequence change to trigger sending and that
          // cannot be determined without another message to compare to.
          logger.debug(
            { uniqueVehicleId },
            "Cache the vehicle for the first time"
          );
          vehicleJourneyCache.set(uniqueVehicleId, vehicleJourney);
        } else {
          const currentStopSequence = entity.vehicle?.currentStopSequence;
          if (currentStopSequence == null) {
            logger.warn(
              { feedEntity: JSON.stringify(entity) },
              "The feed entity has no currentStopSequence"
            );
            return;
          }
          if (
            entity.vehicle?.trip?.tripId !== cachedVehicleJourney.tripId ||
            currentStopSequence > cachedVehicleJourney.stopSequence
          ) {
            logger.debug(
              {
                uniqueVehicleId,
                cachedVehicleJourneyTripId: cachedVehicleJourney.tripId,
                cachedVehicleJourneyStopSequence:
                  cachedVehicleJourney.stopSequence,
                currentStopSequence,
                tripId: entity.vehicle?.trip?.tripId,
              },
              "Trigger timer to send APC messages"
            );
            resetTimer(uniqueVehicleId, () => {
              logger.debug(
                { uniqueVehicleId },
                "Possibly send matched APC message"
              );
              const vendorsApc = apcCache.get(uniqueVehicleId);
              if (vendorsApc !== undefined) {
                vendorsApc.forEach((oneVendorApc) => {
                  logger.debug(
                    { cachedVehicleJourney, oneVendorApc },
                    "Form matched APC message"
                  );
                  const matchedApcMessage = formMatchedApcMessage(
                    cachedVehicleJourney,
                    oneVendorApc
                  );
                  logger.debug("Send matched APC message");
                  sendCallback(matchedApcMessage);
                });
                logger.debug({ uniqueVehicleId }, "Remove APC cache value");
                // The sent messages might not have been acked yet by the
                // cluster.
                apcCache.remove(uniqueVehicleId);
              }
            });
            // We assume that the stopSequence will not change before the
            // timeout has fired, i.e. not before apcWaitInSeconds has passed.
            vehicleJourneyCache.set(uniqueVehicleId, vehicleJourney);
          } else {
            logger.debug(
              {
                uniqueVehicleId,
                tripId: entity.vehicle?.trip?.tripId,
                currentStopSequence,
              },
              "Saw the same stop sequence for the same trip again"
            );
          }
        }
      }
    });
  };

  return { updateApcCache, expandWithApcAndSend };
};
