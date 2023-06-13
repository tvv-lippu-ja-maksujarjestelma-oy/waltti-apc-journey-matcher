// @ts-nocheck
// To parse this data:
//
//   import { Convert, MatchedApc } from "./file";
//
//   const matchedApc = Convert.toMatchedApc(json);
//
// These functions will throw an error if the JSON doesn't
// match the expected interface, even if the JSON is valid.

/**
 * Automatic passenger counting (APC) results per stop and trip.
 */
export interface MatchedApc {
  /**
   * Authority ID as used by Waltti, e.g. '203' for Hämeenlinna. Identifiers listed here:
   * https://opendata.waltti.fi/docs#gtfs-static-packages .
   */
  authorityId: string;
  /**
   * Information on the quality of the counting result, as described by the ITxPT standard.
   */
  countQuality: CountQuality;
  /**
   * An ID for the onboard APC system in one vehicle.
   */
  countingDeviceId: string;
  /**
   * The name of the APC vendor that is responsible for this counting device.
   */
  countingVendorName: string;
  doorClassCounts: DoorClassCount[];
  /**
   * current_stop_sequence from the GTFS Realtime specification:
   * https://gtfs.org/realtime/reference/#message-vehicleposition .
   */
  gtfsrtCurrentStopSequence: number;
  /**
   * direction_id from the GTFS Realtime specification:
   * https://gtfs.org/realtime/reference/#message-tripdescriptor .
   */
  gtfsrtDirectionId: number;
  /**
   * route_id from the GTFS Realtime specification:
   * https://gtfs.org/realtime/reference/#message-tripdescriptor .
   */
  gtfsrtRouteId: string;
  /**
   * start_date from the GTFS Realtime specification:
   * https://gtfs.org/realtime/reference/#message-tripdescriptor . Operating date might be
   * longer than 24 hours.
   */
  gtfsrtStartDate: string;
  /**
   * start_time from the GTFS Realtime specification:
   * https://gtfs.org/realtime/reference/#message-tripdescriptor . Operating date might be
   * longer than 24 hours.
   */
  gtfsrtStartTime: string;
  /**
   * stop_id from the GTFS Realtime specification:
   * https://gtfs.org/realtime/reference/#message-vehicleposition .
   */
  gtfsrtStopId: string;
  /**
   * trip_id from the GTFS Realtime specification:
   * https://gtfs.org/realtime/reference/#message-tripdescriptor
   */
  gtfsrtTripId: string;
  /**
   * Vehicle ID i.e. VehicleDescriptor.id from the GTFS Realtime specification:
   * https://gtfs.org/realtime/reference/#message-vehicledescriptor .
   */
  gtfsrtVehicleId: string;
  /**
   * The SchemaVer version number of the JSON schema that this message follows. A valid value
   * is for example '1-0-0'.
   */
  schemaVersion?: string;
  /**
   * Timezone identifier for the GTFS Realtime trip details as defined by the tz (IANA)
   * database. A valid value would be e.g. 'Europe/Helsinki'.
   */
  timezoneName: string;
  /**
   * A timestamp for the start time including the date. Unlike gtfsrtStartDate and
   * gtfsrtStartTime, this value follows the usual Gregorian calendar so that outside of leap
   * seconds there is exactly one timestamp representation for each moment in time. The value
   * is an ISO 8601 UTC timestamp in the strftime format '%Y-%m-%dT%H:%M:%SZ'. A valid value
   * would be e.g. '2021-11-22T10:57:08Z'. Use 24-hour linear smear from noon to noon UTC for
   * leap seconds, like Google: https://developers.google.com/time/smear .
   */
  utcStartTime: string;
  [property: string]: any;
}

/**
 * Information on the quality of the counting result, as described by the ITxPT standard.
 */
export enum CountQuality {
  Defect = "defect",
  Other = "other",
  Regular = "regular",
}

export interface DoorClassCount {
  /**
   * Passenger type as described by ITxPT.
   */
  countClass: CountClass;
  /**
   * Identification of the door. The door closest to the front of a bus is '1'. The next door
   * is '2' etc. The string type allows us to use this field later for unordered door names,
   * for example in trains.
   */
  doorName: string;
  /**
   * Number of passengers having boarded
   */
  in: number;
  /**
   * Number of passengers having alighted
   */
  out: number;
  [property: string]: any;
}

/**
 * Passenger type as described by ITxPT.
 */
export enum CountClass {
  Adult = "adult",
  Bike = "bike",
  Child = "child",
  Other = "other",
  Pram = "pram",
  Wheelchair = "wheelchair",
}

// Converts JSON strings to/from your types
// and asserts the results of JSON.parse at runtime
export class Convert {
  public static toMatchedApc(json: string): MatchedApc {
    return cast(JSON.parse(json), r("MatchedApc"));
  }

  public static matchedApcToJson(value: MatchedApc): string {
    return JSON.stringify(uncast(value, r("MatchedApc")), null, 2);
  }

  public static toDoorClassCount(json: string): DoorClassCount {
    return cast(JSON.parse(json), r("DoorClassCount"));
  }

  public static doorClassCountToJson(value: DoorClassCount): string {
    return JSON.stringify(uncast(value, r("DoorClassCount")), null, 2);
  }
}

function invalidValue(typ: any, val: any, key: any, parent: any = ""): never {
  const prettyTyp = prettyTypeName(typ);
  const parentText = parent ? ` on ${parent}` : "";
  const keyText = key ? ` for key "${key}"` : "";
  throw Error(
    `Invalid value${keyText}${parentText}. Expected ${prettyTyp} but got ${JSON.stringify(
      val
    )}`
  );
}

function prettyTypeName(typ: any): string {
  if (Array.isArray(typ)) {
    if (typ.length === 2 && typ[0] === undefined) {
      return `an optional ${prettyTypeName(typ[1])}`;
    } else {
      return `one of [${typ
        .map((a) => {
          return prettyTypeName(a);
        })
        .join(", ")}]`;
    }
  } else if (typeof typ === "object" && typ.literal !== undefined) {
    return typ.literal;
  } else {
    return typeof typ;
  }
}

function jsonToJSProps(typ: any): any {
  if (typ.jsonToJS === undefined) {
    const map: any = {};
    typ.props.forEach((p: any) => (map[p.json] = { key: p.js, typ: p.typ }));
    typ.jsonToJS = map;
  }
  return typ.jsonToJS;
}

function jsToJSONProps(typ: any): any {
  if (typ.jsToJSON === undefined) {
    const map: any = {};
    typ.props.forEach((p: any) => (map[p.js] = { key: p.json, typ: p.typ }));
    typ.jsToJSON = map;
  }
  return typ.jsToJSON;
}

function transform(
  val: any,
  typ: any,
  getProps: any,
  key: any = "",
  parent: any = ""
): any {
  function transformPrimitive(typ: string, val: any): any {
    if (typeof typ === typeof val) return val;
    return invalidValue(typ, val, key, parent);
  }

  function transformUnion(typs: any[], val: any): any {
    // val must validate against one typ in typs
    const l = typs.length;
    for (let i = 0; i < l; i++) {
      const typ = typs[i];
      try {
        return transform(val, typ, getProps);
      } catch (_) {}
    }
    return invalidValue(typs, val, key, parent);
  }

  function transformEnum(cases: string[], val: any): any {
    if (cases.indexOf(val) !== -1) return val;
    return invalidValue(
      cases.map((a) => {
        return l(a);
      }),
      val,
      key,
      parent
    );
  }

  function transformArray(typ: any, val: any): any {
    // val must be an array with no invalid elements
    if (!Array.isArray(val)) return invalidValue(l("array"), val, key, parent);
    return val.map((el) => transform(el, typ, getProps));
  }

  function transformDate(val: any): any {
    if (val === null) {
      return null;
    }
    const d = new Date(val);
    if (isNaN(d.valueOf())) {
      return invalidValue(l("Date"), val, key, parent);
    }
    return d;
  }

  function transformObject(
    props: { [k: string]: any },
    additional: any,
    val: any
  ): any {
    if (val === null || typeof val !== "object" || Array.isArray(val)) {
      return invalidValue(l(ref || "object"), val, key, parent);
    }
    const result: any = {};
    Object.getOwnPropertyNames(props).forEach((key) => {
      const prop = props[key];
      const v = Object.prototype.hasOwnProperty.call(val, key)
        ? val[key]
        : undefined;
      result[prop.key] = transform(v, prop.typ, getProps, key, ref);
    });
    Object.getOwnPropertyNames(val).forEach((key) => {
      if (!Object.prototype.hasOwnProperty.call(props, key)) {
        result[key] = transform(val[key], additional, getProps, key, ref);
      }
    });
    return result;
  }

  if (typ === "any") return val;
  if (typ === null) {
    if (val === null) return val;
    return invalidValue(typ, val, key, parent);
  }
  if (typ === false) return invalidValue(typ, val, key, parent);
  let ref: any = undefined;
  while (typeof typ === "object" && typ.ref !== undefined) {
    ref = typ.ref;
    typ = typeMap[typ.ref];
  }
  if (Array.isArray(typ)) return transformEnum(typ, val);
  if (typeof typ === "object") {
    return typ.hasOwnProperty("unionMembers")
      ? transformUnion(typ.unionMembers, val)
      : typ.hasOwnProperty("arrayItems")
      ? transformArray(typ.arrayItems, val)
      : typ.hasOwnProperty("props")
      ? transformObject(getProps(typ), typ.additional, val)
      : invalidValue(typ, val, key, parent);
  }
  // Numbers can be parsed by Date but shouldn't be.
  if (typ === Date && typeof val !== "number") return transformDate(val);
  return transformPrimitive(typ, val);
}

function cast<T>(val: any, typ: any): T {
  return transform(val, typ, jsonToJSProps);
}

function uncast<T>(val: T, typ: any): any {
  return transform(val, typ, jsToJSONProps);
}

function l(typ: any) {
  return { literal: typ };
}

function a(typ: any) {
  return { arrayItems: typ };
}

function u(...typs: any[]) {
  return { unionMembers: typs };
}

function o(props: any[], additional: any) {
  return { props, additional };
}

function m(additional: any) {
  return { props: [], additional };
}

function r(name: string) {
  return { ref: name };
}

const typeMap: any = {
  MatchedApc: o(
    [
      { json: "authorityId", js: "authorityId", typ: "" },
      { json: "countQuality", js: "countQuality", typ: r("CountQuality") },
      { json: "countingDeviceId", js: "countingDeviceId", typ: "" },
      { json: "countingVendorName", js: "countingVendorName", typ: "" },
      {
        json: "doorClassCounts",
        js: "doorClassCounts",
        typ: a(r("DoorClassCount")),
      },
      {
        json: "gtfsrtCurrentStopSequence",
        js: "gtfsrtCurrentStopSequence",
        typ: 0,
      },
      { json: "gtfsrtDirectionId", js: "gtfsrtDirectionId", typ: 0 },
      { json: "gtfsrtRouteId", js: "gtfsrtRouteId", typ: "" },
      { json: "gtfsrtStartDate", js: "gtfsrtStartDate", typ: "" },
      { json: "gtfsrtStartTime", js: "gtfsrtStartTime", typ: "" },
      { json: "gtfsrtStopId", js: "gtfsrtStopId", typ: "" },
      { json: "gtfsrtTripId", js: "gtfsrtTripId", typ: "" },
      { json: "gtfsrtVehicleId", js: "gtfsrtVehicleId", typ: "" },
      { json: "schemaVersion", js: "schemaVersion", typ: u(undefined, "") },
      { json: "timezoneName", js: "timezoneName", typ: "" },
      { json: "utcStartTime", js: "utcStartTime", typ: "" },
    ],
    "any"
  ),
  DoorClassCount: o(
    [
      { json: "countClass", js: "countClass", typ: r("CountClass") },
      { json: "doorName", js: "doorName", typ: "" },
      { json: "in", js: "in", typ: 0 },
      { json: "out", js: "out", typ: 0 },
    ],
    "any"
  ),
  CountQuality: ["defect", "other", "regular"],
  CountClass: ["adult", "bike", "child", "other", "pram", "wheelchair"],
};
