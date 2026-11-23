import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { runningOutThreshold } from "./types.ts";

describe("порог «последних мест»", () => {
  it("на большой группе срабатывает под конец набора, а не в середине", () => {
    // Ради этого всё и затевалось: с прежним абсолютным порогом в пять мест
    // поход на десятерых предупреждал «поторопись» на половине группы.
    assert.equal(runningOutThreshold(25), 7);
    assert.equal(runningOutThreshold(20), 5);
    assert.equal(runningOutThreshold(10), 3);
  });

  it("на маленькой группе не опускается ниже трёх мест", () => {
    // Иначе поход на восьмерых предупреждал бы на последних двух, когда
    // торопиться уже поздно.
    assert.equal(runningOutThreshold(8), 3);
    assert.equal(runningOutThreshold(4), 3);
    assert.equal(runningOutThreshold(1), 3);
  });

  it("никогда не больше самой вместимости на разумных группах", () => {
    // Порог выше вместимости означал бы «последние места» с первой минуты.
    for (const capacity of [12, 16, 20, 25, 30, 40]) {
      assert.ok(
        runningOutThreshold(capacity) < capacity,
        `порог ${runningOutThreshold(capacity)} не меньше вместимости ${capacity}`,
      );
    }
  });
});
