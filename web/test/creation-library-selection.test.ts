import { expect, test } from "bun:test";
import { creationAttachmentsFromLibrarySelection } from "../src/pages/create/creation-assets";
import type { AssetLibraryPickerItem } from "../src/components/assets/asset-library-picker-modal";
import type { ImageAsset } from "../src/stores/use-asset-store";

function image(id: string, width = 1024): AssetLibraryPickerItem {
    const asset: ImageAsset = {
        id, title: id, kind: "image", tags: [], coverUrl: "", createdAt: "", updatedAt: "",
        data: { dataUrl: "data:image/png;base64,AAAA", storageKey: "", mimeType: "image/png", bytes: 4, width, height: 768 },
    };
    return { id, title: id, category: "material", kindLabel: "图片", asset };
}

test("remote page selections become references without requiring the local asset cache", () => {
    const selected = creationAttachmentsFromLibrarySelection(["page-2", "page-1"], [image("page-1"), image("page-2")]);
    expect(selected.map((item) => item.id)).toEqual(["asset:page-2", "asset:page-1"]);
    expect(selected.every((item) => item.type === "image/png")).toBe(true);
});

test("picked remote metadata takes precedence over stale local entries", () => {
    const selected = creationAttachmentsFromLibrarySelection(["same"], [image("same", 512), image("same", 2048)]);
    expect(selected[0]).toMatchObject({ width: 2048 });
});

test("unsupported and stale selections fail explicitly instead of disappearing", () => {
    expect(() => creationAttachmentsFromLibrarySelection(["missing"], [])).toThrow("所选素材已不存在");
    const disabled = { ...image("blocked"), disabledReason: "当前视频模型不支持参考图片" };
    expect(() => creationAttachmentsFromLibrarySelection([disabled.id], [disabled])).toThrow(disabled.disabledReason);
});
