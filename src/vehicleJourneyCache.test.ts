import { hyphenateDate } from "./vehicleJourneyCache";

test("hyphenateDate", () => {
  expect(hyphenateDate("20221013")).toStrictEqual("2022-10-13");
});
