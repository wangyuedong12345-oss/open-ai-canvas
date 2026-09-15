import { describe, expect, test } from "bun:test";

import { assetCategoryLabel, defaultAssetCategoryForKind, normalizeAssetCategory } from "@/lib/asset-category";

describe("asset category contract", () => {
    test("旧服饰、武器和配饰统一迁移为道具", () => {
        expect(normalizeAssetCategory("wardrobe")).toBe("prop");
        expect(normalizeAssetCategory("weapon")).toBe("prop");
        expect(normalizeAssetCategory("accessory")).toBe("prop");
    });

    test("旧画风、其他和未知值统一归入未分类", () => {
        expect(normalizeAssetCategory("style")).toBe("material");
        expect(normalizeAssetCategory("other")).toBe("material");
        expect(normalizeAssetCategory("unknown")).toBe("material");
        expect(assetCategoryLabel("material")).toBe("未分类");
        expect(assetCategoryLabel("other")).toBe("未分类");
    });

    test("未分类媒体默认归入统一分类", () => {
        expect(defaultAssetCategoryForKind("image")).toBe("material");
        expect(defaultAssetCategoryForKind("video")).toBe("material");
        expect(defaultAssetCategoryForKind("audio")).toBe("material");
        expect(defaultAssetCategoryForKind("text")).toBe("material");
    });
});
