/*eslint-disable block-scoped-var, id-length, no-control-regex, no-magic-numbers, no-prototype-builtins, no-redeclare, no-shadow, no-var, sort-vars*/
import * as $protobuf from "protobufjs/light";

const $root = (
  $protobuf.roots["default"] ||
  ($protobuf.roots["default"] = new $protobuf.Root())
).addJSON({
  transit_realtime: {
    options: {
      java_package: "com.google.transit.realtime",
    },
    nested: {
      FeedMessage: {
        fields: {
          header: {
            rule: "required",
            type: "FeedHeader",
            id: 1,
          },
          entity: {
            rule: "repeated",
            type: "FeedEntity",
            id: 2,
          },
        },
        extensions: [[1000, 1999]],
      },
      FeedHeader: {
        fields: {
          gtfsRealtimeVersion: {
            rule: "required",
            type: "string",
            id: 1,
          },
          incrementality: {
            type: "Incrementality",
            id: 2,
            options: {
              default: "FULL_DATASET",
            },
          },
          timestamp: {
            type: "uint64",
            id: 3,
          },
        },
        extensions: [[1000, 1999]],
        nested: {
          Incrementality: {
            values: {
              FULL_DATASET: 0,
              DIFFERENTIAL: 1,
            },
          },
        },
      },
      FeedEntity: {
        fields: {
          id: {
            rule: "required",
            type: "string",
            id: 1,
          },
          isDeleted: {
            type: "bool",
            id: 2,
            options: {
              default: false,
            },
          },
          tripUpdate: {
            type: "TripUpdate",
            id: 3,
          },
          vehicle: {
            type: "VehiclePosition",
            id: 4,
          },
          alert: {
            type: "Alert",
            id: 5,
          },
        },
        extensions: [[1000, 1999]],
      },
      TripUpdate: {
        fields: {
          trip: {
            rule: "required",
            type: "TripDescriptor",
            id: 1,
          },
          vehicle: {
            type: "VehicleDescriptor",
            id: 3,
          },
          stopTimeUpdate: {
            rule: "repeated",
            type: "StopTimeUpdate",
            id: 2,
          },
          timestamp: {
            type: "uint64",
            id: 4,
          },
          delay: {
            type: "int32",
            id: 5,
          },
        },
        extensions: [[1000, 1999]],
        nested: {
          StopTimeEvent: {
            fields: {
              delay: {
                type: "int32",
                id: 1,
              },
              time: {
                type: "int64",
                id: 2,
              },
              uncertainty: {
                type: "int32",
                id: 3,
              },
            },
            extensions: [[1000, 1999]],
          },
          StopTimeUpdate: {
            fields: {
              stopSequence: {
                type: "uint32",
                id: 1,
              },
              stopId: {
                type: "string",
                id: 4,
              },
              arrival: {
                type: "StopTimeEvent",
                id: 2,
              },
              departure: {
                type: "StopTimeEvent",
                id: 3,
              },
              scheduleRelationship: {
                type: "ScheduleRelationship",
                id: 5,
                options: {
                  default: "SCHEDULED",
                },
              },
            },
            extensions: [[1000, 1999]],
            nested: {
              ScheduleRelationship: {
                values: {
                  SCHEDULED: 0,
                  SKIPPED: 1,
                  NO_DATA: 2,
                },
              },
            },
          },
        },
      },
      VehiclePosition: {
        fields: {
          trip: {
            type: "TripDescriptor",
            id: 1,
          },
          vehicle: {
            type: "VehicleDescriptor",
            id: 8,
          },
          position: {
            type: "Position",
            id: 2,
          },
          currentStopSequence: {
            type: "uint32",
            id: 3,
          },
          stopId: {
            type: "string",
            id: 7,
          },
          currentStatus: {
            type: "VehicleStopStatus",
            id: 4,
            options: {
              default: "IN_TRANSIT_TO",
            },
          },
          timestamp: {
            type: "uint64",
            id: 5,
          },
          congestionLevel: {
            type: "CongestionLevel",
            id: 6,
          },
          occupancyStatus: {
            type: "OccupancyStatus",
            id: 9,
          },
        },
        extensions: [[1000, 1999]],
        nested: {
          VehicleStopStatus: {
            values: {
              INCOMING_AT: 0,
              STOPPED_AT: 1,
              IN_TRANSIT_TO: 2,
            },
          },
          CongestionLevel: {
            values: {
              UNKNOWN_CONGESTION_LEVEL: 0,
              RUNNING_SMOOTHLY: 1,
              STOP_AND_GO: 2,
              CONGESTION: 3,
              SEVERE_CONGESTION: 4,
            },
          },
          OccupancyStatus: {
            values: {
              EMPTY: 0,
              MANY_SEATS_AVAILABLE: 1,
              FEW_SEATS_AVAILABLE: 2,
              STANDING_ROOM_ONLY: 3,
              CRUSHED_STANDING_ROOM_ONLY: 4,
              FULL: 5,
              NOT_ACCEPTING_PASSENGERS: 6,
            },
          },
        },
      },
      Alert: {
        fields: {
          activePeriod: {
            rule: "repeated",
            type: "TimeRange",
            id: 1,
          },
          informedEntity: {
            rule: "repeated",
            type: "EntitySelector",
            id: 5,
          },
          cause: {
            type: "Cause",
            id: 6,
            options: {
              default: "UNKNOWN_CAUSE",
            },
          },
          effect: {
            type: "Effect",
            id: 7,
            options: {
              default: "UNKNOWN_EFFECT",
            },
          },
          url: {
            type: "TranslatedString",
            id: 8,
          },
          headerText: {
            type: "TranslatedString",
            id: 10,
          },
          descriptionText: {
            type: "TranslatedString",
            id: 11,
          },
        },
        extensions: [[1000, 1999]],
        nested: {
          Cause: {
            values: {
              UNKNOWN_CAUSE: 1,
              OTHER_CAUSE: 2,
              TECHNICAL_PROBLEM: 3,
              STRIKE: 4,
              DEMONSTRATION: 5,
              ACCIDENT: 6,
              HOLIDAY: 7,
              WEATHER: 8,
              MAINTENANCE: 9,
              CONSTRUCTION: 10,
              POLICE_ACTIVITY: 11,
              MEDICAL_EMERGENCY: 12,
            },
          },
          Effect: {
            values: {
              NO_SERVICE: 1,
              REDUCED_SERVICE: 2,
              SIGNIFICANT_DELAYS: 3,
              DETOUR: 4,
              ADDITIONAL_SERVICE: 5,
              MODIFIED_SERVICE: 6,
              OTHER_EFFECT: 7,
              UNKNOWN_EFFECT: 8,
              STOP_MOVED: 9,
            },
          },
        },
      },
      TimeRange: {
        fields: {
          start: {
            type: "uint64",
            id: 1,
          },
          end: {
            type: "uint64",
            id: 2,
          },
        },
        extensions: [[1000, 1999]],
      },
      Position: {
        fields: {
          latitude: {
            rule: "required",
            type: "float",
            id: 1,
          },
          longitude: {
            rule: "required",
            type: "float",
            id: 2,
          },
          bearing: {
            type: "float",
            id: 3,
          },
          odometer: {
            type: "double",
            id: 4,
          },
          speed: {
            type: "float",
            id: 5,
          },
        },
        extensions: [[1000, 1999]],
      },
      TripDescriptor: {
        fields: {
          tripId: {
            type: "string",
            id: 1,
          },
          routeId: {
            type: "string",
            id: 5,
          },
          directionId: {
            type: "uint32",
            id: 6,
          },
          startTime: {
            type: "string",
            id: 2,
          },
          startDate: {
            type: "string",
            id: 3,
          },
          scheduleRelationship: {
            type: "ScheduleRelationship",
            id: 4,
          },
        },
        extensions: [[1000, 1999]],
        nested: {
          ScheduleRelationship: {
            values: {
              SCHEDULED: 0,
              ADDED: 1,
              UNSCHEDULED: 2,
              CANCELED: 3,
            },
          },
        },
      },
      VehicleDescriptor: {
        fields: {
          id: {
            type: "string",
            id: 1,
          },
          label: {
            type: "string",
            id: 2,
          },
          licensePlate: {
            type: "string",
            id: 3,
          },
        },
        extensions: [[1000, 1999]],
      },
      EntitySelector: {
        fields: {
          agencyId: {
            type: "string",
            id: 1,
          },
          routeId: {
            type: "string",
            id: 2,
          },
          routeType: {
            type: "int32",
            id: 3,
          },
          trip: {
            type: "TripDescriptor",
            id: 4,
          },
          stopId: {
            type: "string",
            id: 5,
          },
        },
        extensions: [[1000, 1999]],
      },
      TranslatedString: {
        fields: {
          translation: {
            rule: "repeated",
            type: "Translation",
            id: 1,
          },
        },
        extensions: [[1000, 1999]],
        nested: {
          Translation: {
            fields: {
              text: {
                rule: "required",
                type: "string",
                id: 1,
              },
              language: {
                type: "string",
                id: 2,
              },
            },
            extensions: [[1000, 1999]],
          },
        },
      },
    },
  },
});

export { $root as default };
