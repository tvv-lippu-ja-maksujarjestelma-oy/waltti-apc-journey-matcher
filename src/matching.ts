import type pino from "pino";
import type Pulsar from "pulsar-client";
import { ApcCacheValue, createApcCache } from "./apcCache";
import type {
  CountingSystemMap,
  FeedMap,
  ProcessingConfig,
  UniqueVehicleId,
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
): UniqueVehicleId[] =>
  Array.from(countingSystemMap.values()).map(
    ([uniqueVehicleId]) => uniqueVehicleId
  );

export const getFeedDetails = (
  feedMap: FeedMap,
  topic: string
): { feedPublisherId: string; timezoneName: string } | undefined => {
  let result;
  const feedDetails = feedMap.get(topic);
  if (feedDetails !== undefined) {
    result = {
      feedPublisherId: feedDetails[0],
      timezoneName: feedDetails[1],
    };
  }
  return result;
};

export const getUniqueVehicleId = (
  entity: transit_realtime.IFeedEntity,
  feedPublisherId: string
): string | undefined => {
  let result;
  const vehicleId = entity.vehicle?.vehicle?.id;
  if (vehicleId != null) {
    result = `${feedPublisherId}:${vehicleId}`;
  }
  return result;
};

const flattenCounts = (
  doorCounts: stringentApc.Doorcount
): matchedApc.DoorClassCount[] =>
  doorCounts.count.map((currentCount) => ({
    countClass: currentCount.class,
    in: currentCount.in,
    out: currentCount.out,
    doorName: doorCounts.door,
  }));

const expandWithApc = (
  vehicleJourney: VehicleJourney,
  apcCacheValue: ApcCacheValue
): matchedApc.MatchedApc => ({
  countQuality: apcCacheValue.vehicleCounts.countquality,
  countingVendorName: apcCacheValue.countingVendorName,
  directionId: vehicleJourney.directionId,
  doorClassCounts:
    apcCacheValue.vehicleCounts.doorcounts.flatMap(flattenCounts),
  feedPublisherId: vehicleJourney.feedPublisherId,
  routeId: vehicleJourney.routeId,
  startDate: vehicleJourney.startDate,
  startTime: vehicleJourney.startTime,
  stopId: vehicleJourney.stopId,
  stopSequence: vehicleJourney.stopSequence,
  timezoneName: vehicleJourney.timezoneName,
  tripId: vehicleJourney.tripId,
});

const formMatchedApcMessage = (
  vehicleJourney: VehicleJourney,
  apcCacheValue: ApcCacheValue
): Pulsar.ProducerMessage => {
  const matchedApcData = expandWithApc(vehicleJourney, apcCacheValue);
  const encoded = Buffer.from(
    matchedApc.Convert.matchedApcToJson(matchedApcData),
    "utf8"
  );
  return {
    data: encoded,
    eventTimestamp: apcCacheValue.eventTimestamp,
  };
};

export const initializeMatching = (
  logger: pino.Logger,
  { apcWaitInSeconds, countingSystemMap, feedMap }: ProcessingConfig
) => {
  const apcCache = createApcCache();
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
    const countingSystemDetails = countingSystemMap.get(
      apcMessage.APC.countingSystemId
    );
    if (countingSystemDetails === undefined) {
      logger.error(
        { apcMessage: JSON.stringify(apcMessage), countingSystemMap },
        "countingSystemId could not be found from countingSystemMap. Try adding the missing countingSystemId into the configuration."
      );
      return;
    }
    const [uniqueVehicleId, countingVendorName] = countingSystemDetails;
    apcCache.add(uniqueVehicleId, {
      vehicleCounts: apcMessage.APC.vehiclecounts,
      countingVendorName,
      eventTimestamp: apcPulsarMessage.getEventTimestamp(),
    });
  };

  const expandWithApcAndSend = (
    gtfsrtPulsarMessage: Pulsar.Message,
    sendCallback: (fullApcMessage: Pulsar.ProducerMessage | undefined) => void
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
      sendCallback(undefined);
      return;
    }
    const pulsarTopic = gtfsrtPulsarMessage.getTopicName();
    const feedDetails = getFeedDetails(feedMap, pulsarTopic);
    if (feedDetails === undefined) {
      logger.warn(
        { pulsarTopic, gtfsrtMessage: JSON.stringify(gtfsrtMessage) },
        "Could not get feed details from the Pulsar topic name"
      );
      sendCallback(undefined);
      return;
    }
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
        sendCallback(undefined);
        return;
      }
      if (includedVehicles.includes(uniqueVehicleId)) {
        const vehicleJourney = formVehicleJourney(entity, feedDetails);
        if (vehicleJourney === undefined) {
          logger.warn(
            { feedEntity: JSON.stringify(entity) },
            "The feed entity could not be turned into vehicle journey"
          );
          sendCallback(undefined);
          return;
        }
        const cachedVehicleJourney = vehicleJourneyCache.get(uniqueVehicleId);
        if (cachedVehicleJourney === undefined) {
          vehicleJourneyCache.set(uniqueVehicleId, vehicleJourney);
        } else {
          const currentStopSequence = entity.vehicle?.currentStopSequence;
          if (currentStopSequence == null) {
            logger.warn(
              { feedEntity: JSON.stringify(entity) },
              "The feed entity has no currentStopSequence"
            );
            sendCallback(undefined);
            return;
          }
          if (
            entity.vehicle?.trip?.tripId !== cachedVehicleJourney.tripId ||
            currentStopSequence !== cachedVehicleJourney.stopSequence
          ) {
            resetTimer(uniqueVehicleId, () => {
              const apcCacheItem = apcCache.get(uniqueVehicleId);
              if (apcCacheItem !== undefined) {
                const matchedApcMessage = formMatchedApcMessage(
                  cachedVehicleJourney,
                  apcCacheItem
                );
                sendCallback(matchedApcMessage);
                apcCache.remove(uniqueVehicleId);
              }
            });
            // We assume that the stopSequence will not change before the
            // timeout has fired, i.e. not before apcWaitInSeconds has passed.
            vehicleJourneyCache.set(uniqueVehicleId, vehicleJourney);
          }
        }
      }
    });
  };

  return { updateApcCache, expandWithApcAndSend };
};
