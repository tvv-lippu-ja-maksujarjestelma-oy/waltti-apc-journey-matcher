import { pickLowerQuality, sumDoorCounts } from "./apcCache";
import * as stringentApc from "./quicktype/stringentApc";

test("Pick the lower quality from two quality levels", () => {
  expect(
    pickLowerQuality(
      stringentApc.Countquality.Regular,
      stringentApc.Countquality.Regular
    )
  ).toBe(stringentApc.Countquality.Regular);
  expect(
    pickLowerQuality(
      stringentApc.Countquality.Regular,
      stringentApc.Countquality.Defect
    )
  ).toBe(stringentApc.Countquality.Defect);
  expect(
    pickLowerQuality(
      stringentApc.Countquality.Regular,
      stringentApc.Countquality.Other
    )
  ).toBe(stringentApc.Countquality.Other);
  expect(
    pickLowerQuality(
      stringentApc.Countquality.Defect,
      stringentApc.Countquality.Regular
    )
  ).toBe(stringentApc.Countquality.Defect);
  expect(
    pickLowerQuality(
      stringentApc.Countquality.Defect,
      stringentApc.Countquality.Defect
    )
  ).toBe(stringentApc.Countquality.Defect);
  expect(
    pickLowerQuality(
      stringentApc.Countquality.Defect,
      stringentApc.Countquality.Other
    )
  ).toBe(stringentApc.Countquality.Other);
  expect(
    pickLowerQuality(
      stringentApc.Countquality.Other,
      stringentApc.Countquality.Regular
    )
  ).toBe(stringentApc.Countquality.Other);
  expect(
    pickLowerQuality(
      stringentApc.Countquality.Other,
      stringentApc.Countquality.Defect
    )
  ).toBe(stringentApc.Countquality.Other);
  expect(
    pickLowerQuality(
      stringentApc.Countquality.Other,
      stringentApc.Countquality.Other
    )
  ).toBe(stringentApc.Countquality.Other);
});

describe("Sum door counts", () => {
  test("Add door counts for the same door and class", () => {
    const cached = [
      {
        door: "door1",
        count: [{ class: stringentApc.Class.Adult, in: 1, out: 2 }],
      },
    ];
    const toBeAdded = [
      {
        door: "door1",
        count: [{ class: stringentApc.Class.Adult, in: 4, out: 1 }],
      },
    ];
    const expected = [
      {
        door: "door1",
        count: [{ class: stringentApc.Class.Adult, in: 5, out: 3 }],
      },
    ];
    expect(sumDoorCounts(cached, toBeAdded)).toStrictEqual(expected);
  });

  test("Add door counts only for a new class", () => {
    const cached = [
      {
        door: "door1",
        count: [{ class: stringentApc.Class.Adult, in: 1, out: 2 }],
      },
    ];
    const toBeAdded = [
      {
        door: "door1",
        count: [{ class: stringentApc.Class.Child, in: 4, out: 1 }],
      },
    ];
    const expected = [
      {
        door: "door1",
        count: [
          { class: stringentApc.Class.Adult, in: 1, out: 2 },
          { class: stringentApc.Class.Child, in: 4, out: 1 },
        ],
      },
    ];
    expect(sumDoorCounts(cached, toBeAdded)).toStrictEqual(expected);
  });

  test("Add door counts only for a new door", () => {
    const cached = [
      {
        door: "door1",
        count: [{ class: stringentApc.Class.Adult, in: 1, out: 2 }],
      },
    ];
    const toBeAdded = [
      {
        door: "door2",
        count: [{ class: stringentApc.Class.Child, in: 4, out: 1 }],
      },
    ];
    const expected = [
      {
        door: "door1",
        count: [{ class: stringentApc.Class.Adult, in: 1, out: 2 }],
      },
      {
        door: "door2",
        count: [{ class: stringentApc.Class.Child, in: 4, out: 1 }],
      },
    ];
    expect(sumDoorCounts(cached, toBeAdded)).toStrictEqual(expected);
  });

  test("Add door counts for an existing and a new door", () => {
    const cached = [
      {
        door: "door1",
        count: [{ class: stringentApc.Class.Adult, in: 1, out: 2 }],
      },
    ];
    const toBeAdded = [
      {
        door: "door1",
        count: [{ class: stringentApc.Class.Adult, in: 1, out: 1 }],
      },
      {
        door: "door2",
        count: [{ class: stringentApc.Class.Child, in: 4, out: 1 }],
      },
    ];
    const expected = [
      {
        door: "door1",
        count: [{ class: stringentApc.Class.Adult, in: 2, out: 3 }],
      },
      {
        door: "door2",
        count: [{ class: stringentApc.Class.Child, in: 4, out: 1 }],
      },
    ];
    expect(sumDoorCounts(cached, toBeAdded)).toStrictEqual(expected);
  });

  test("Add zero values", () => {
    const cached = [
      {
        door: "door1",
        count: [{ class: stringentApc.Class.Adult, in: 1, out: 2 }],
      },
    ];
    const toBeAdded = [
      {
        door: "door1",
        count: [{ class: stringentApc.Class.Adult, in: 0, out: 0 }],
      },
      {
        door: "door2",
        count: [{ class: stringentApc.Class.Pram, in: 0, out: 0 }],
      },
    ];
    const expected = [
      {
        door: "door1",
        count: [{ class: stringentApc.Class.Adult, in: 1, out: 2 }],
      },
      {
        door: "door2",
        count: [{ class: stringentApc.Class.Pram, in: 0, out: 0 }],
      },
    ];
    expect(sumDoorCounts(cached, toBeAdded)).toStrictEqual(expected);
  });

  test("A complicated example", () => {
    const cached = [
      {
        door: "door1",
        count: [
          { class: stringentApc.Class.Adult, in: 1, out: 1 },
          { class: stringentApc.Class.Child, in: 3, out: 1 },
        ],
      },
      {
        door: "door2",
        count: [{ class: stringentApc.Class.Adult, in: 1, out: 1 }],
      },
    ];
    const toBeAdded = [
      {
        door: "door1",
        count: [
          { class: stringentApc.Class.Child, in: 3, out: 1 },
          { class: stringentApc.Class.Pram, in: 0, out: 0 },
        ],
      },
      {
        door: "door2",
        count: [{ class: stringentApc.Class.Child, in: 0, out: 2 }],
      },
      {
        door: "door4",
        count: [{ class: stringentApc.Class.Pram, in: 1, out: 0 }],
      },
    ];
    const expected = [
      {
        door: "door1",
        count: [
          { class: stringentApc.Class.Adult, in: 1, out: 1 },
          { class: stringentApc.Class.Child, in: 6, out: 2 },
          { class: stringentApc.Class.Pram, in: 0, out: 0 },
        ],
      },
      {
        door: "door2",
        count: [
          { class: stringentApc.Class.Adult, in: 1, out: 1 },
          { class: stringentApc.Class.Child, in: 0, out: 2 },
        ],
      },
      {
        door: "door4",
        count: [{ class: stringentApc.Class.Pram, in: 1, out: 0 }],
      },
    ];
    expect(sumDoorCounts(cached, toBeAdded)).toStrictEqual(expected);
  });
});
