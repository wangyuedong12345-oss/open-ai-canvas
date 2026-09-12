import { describe, expect, test } from "bun:test";
import { filterImportModels, modelImportCapabilities, replaceVisibleSelection } from "../src/pages/admin/components/model-import-filter";

describe("model import filters", () => {
    test("prefers output metadata and does not treat vision input as image output", () => {
        expect(modelImportCapabilities({ id: "gpt-image-test", outputModalities: ["text", "audio"] })).toEqual(["text", "audio"]);
        expect(modelImportCapabilities({ id: "claude-test", supportsImages: true })).toEqual(["text"]);
        expect(modelImportCapabilities({ id: "unknown-model", supportsImages: true })).toEqual([]);
        expect(modelImportCapabilities({ id: "gemini-2.5-flash-image" })).toEqual(["image"]);
    });
    test("combines case-insensitive name search and output category", () => {
        const items = [{ id: "custom", displayName: "My Model", modelType: "image" as const }, { id: "mystery" }];
        expect(filterImportModels(items, " MY MODEL ", "image")).toEqual([items[0]]);
        expect(filterImportModels(items, "", "unknown")).toEqual([items[1]]);
        expect(filterImportModels(items, "MY", "video")).toEqual([]);
    });
    test("bulk changes preserve hidden selections without duplicates", () => {
        expect(replaceVisibleSelection(["hidden", "a"], ["a", "b"], ["a", "b"])).toEqual(["hidden", "a", "b"]);
        expect(replaceVisibleSelection(["hidden", "a"], ["a", "b"], [])).toEqual(["hidden"]);
    });
});
