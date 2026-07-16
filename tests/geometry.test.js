import test from "node:test";
import assert from "node:assert/strict";
import {
  constrainCropToSource,
  cropsEqual,
  normalizeCrop,
  resizeSymmetricCrop,
  scaleCropBetweenSources,
  transformCropForRotation,
} from "../core/geometry.js";

test("normalizeCrop converts negative dimensions", () => {
  assert.deepEqual(normalizeCrop({ x: 80, y: 60, width: -30, height: -20 }), {
    x: 50,
    y: 40,
    width: 30,
    height: 20,
  });
});

test("constrainCropToSource keeps crop inside source", () => {
  assert.deepEqual(
    constrainCropToSource(
      { x: 90, y: -10, width: 40, height: 5 },
      { width: 100, height: 80 },
    ),
    { x: 60, y: 0, width: 40, height: 5 },
  );
});

test("constrainCropToSource caps oversized crops", () => {
  assert.deepEqual(
    constrainCropToSource(
      { x: 20, y: 20, width: 500, height: 500 },
      { width: 120, height: 80 },
    ),
    { x: 0, y: 0, width: 120, height: 80 },
  );
});

test("scaleCropBetweenSources preserves normalized position", () => {
  assert.deepEqual(
    scaleCropBetweenSources(
      { x: 10, y: 20, width: 30, height: 40 },
      { width: 100, height: 200 },
      { width: 200, height: 400 },
    ),
    { x: 20, y: 40, width: 60, height: 80 },
  );
});

test("transformCropForRotation rotates clockwise", () => {
  assert.deepEqual(
    transformCropForRotation(
      { x: 10, y: 20, width: 30, height: 40 },
      { width: 100, height: 200 },
      1,
    ),
    { x: 140, y: 10, width: 40, height: 30 },
  );
});

test("transformCropForRotation rotates counterclockwise", () => {
  assert.deepEqual(
    transformCropForRotation(
      { x: 10, y: 20, width: 30, height: 40 },
      { width: 100, height: 200 },
      -1,
    ),
    { x: 20, y: 60, width: 40, height: 30 },
  );
});

test("resizeSymmetricCrop keeps the center fixed", () => {
  const resized = resizeSymmetricCrop({
    handle: "se",
    startCrop: { x: 30, y: 20, width: 40, height: 20 },
    dx: 10,
    dy: 5,
    source: { width: 120, height: 100 },
  });
  assert.deepEqual(resized, { x: 20, y: 15, width: 60, height: 30 });
});

test("resizeSymmetricCrop respects fixed aspect ratio", () => {
  const resized = resizeSymmetricCrop({
    handle: "se",
    startCrop: { x: 30, y: 30, width: 40, height: 40 },
    dx: 10,
    dy: 2,
    source: { width: 120, height: 120 },
    ratio: 1,
  });
  assert.equal(resized.width, resized.height);
  assert.equal(resized.x + resized.width / 2, 50);
  assert.equal(resized.y + resized.height / 2, 50);
});

test("cropsEqual accepts small floating point differences", () => {
  assert.equal(
    cropsEqual(
      { x: 1, y: 2, width: 3, height: 4 },
      { x: 1.05, y: 2.05, width: 3.05, height: 4.05 },
    ),
    true,
  );
});
