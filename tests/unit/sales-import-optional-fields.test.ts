import assert from "node:assert/strict";
import test from "node:test";
import { convertRow, getMappableFields } from "../../src/lib/salesImport";

test("链接标签和父ASIN是可映射的非必填上传字段", () => {
  const fields = new Map(getMappableFields().map((field) => [field.key, field]));
  assert.equal(fields.get("storeProductLabel")?.label, "链接标签");
  assert.equal(fields.get("storeProductLabel")?.required, false);
  assert.equal(fields.get("parentAsin")?.label, "父ASIN");
  assert.equal(fields.get("parentAsin")?.required, false);
});

test("上传的链接标签和父ASIN写入现有销售记录字段", () => {
  const result = convertRow(
    {
      日期: "2026-09-01",
      品牌: "Edifier",
      联盟商: "Publisher A",
      链接标签: "秋季推广链接",
      父ASIN: "B0PARENT123",
    },
    {
      orderDate: "日期",
      brand: "品牌",
      affiliateName: "联盟商",
      storeProductLabel: "链接标签",
      parentAsin: "父ASIN",
    },
    "Amazon",
    null,
  );

  assert.ok(result);
  assert.equal(result.record.storeProductLabel, "秋季推广链接");
  assert.equal(result.record.parentAsin, "B0PARENT123");
});
