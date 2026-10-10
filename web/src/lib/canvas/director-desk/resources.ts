import type { DirectorDeskResource, DirectorDeskState } from "@/types/previs";

// Native IDs belong to the director document, not the host resource table.
const nativeKeyPrefix = "$director:";
const hostResourceFields = new Set(["resourceId", "resourceIds", "sampleResourceId", "referenceResourceId", "referenceResourceIds"]);
function mapResourceKeys(value: unknown, encode: boolean): unknown {
    if (Array.isArray(value)) return value.map((item) => mapResourceKeys(item, encode));
    if (!value || typeof value !== "object") return value;
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [
        encode ? hostResourceFields.has(key) || key.startsWith(nativeKeyPrefix) ? nativeKeyPrefix + key : key : key.startsWith(nativeKeyPrefix) ? key.slice(nativeKeyPrefix.length) : key,
        mapResourceKeys(item, encode),
    ]));
}

export async function restoreDirectorResources(state: DirectorDeskState, read: (storageKey: string) => Promise<Blob | null>) {
    if (state.version !== 1 || !Array.isArray(state.resources)) throw new Error("导演台存储版本不受支持");
    const document = structuredClone(state.document);
    for (const resource of state.resources) {
        if (!resource.storageKey.startsWith("resource:") || !resource.path.length || resource.path.at(-1) !== "data") throw new Error("导演台素材引用无效");
        let parent: unknown = document;
        for (const key of resource.path.slice(0, -1)) {
            if (!parent || typeof parent !== "object" || key === "__proto__" || key === "constructor" || key === "prototype" || !Object.hasOwn(parent, key)) throw new Error("导演台素材路径无效");
            parent = (parent as Record<string | number, unknown>)[key];
        }
        if (!parent || typeof parent !== "object" || (parent as Record<string, unknown>).data !== "") throw new Error("导演台素材占位无效");
        const blob = await read(resource.storageKey);
        if (!blob) throw new Error("导演台素材不可用，请检查资源权限或重新上传");
        (parent as Record<string, unknown>).data = await blob.text();
    }
    return mapResourceKeys(document, false) as Record<string, unknown>;
}

export async function packDirectorResources(input: Record<string, unknown>, write: (data: string) => Promise<Omit<DirectorDeskResource, "path">>) {
    const document = mapResourceKeys(input, true) as Record<string, unknown>, resources: DirectorDeskResource[] = [];
    async function walk(value: unknown, path: Array<string | number>): Promise<void> {
        if (!value || typeof value !== "object") return;
        for (const [key, item] of Object.entries(value)) {
            const next = [...path, Array.isArray(value) ? Number(key) : key];
            if (key === "data" && typeof item === "string" && item.length) {
                resources.push({ ...await write(item), path: next });
                (value as Record<string, unknown>)[key] = "";
            } else await walk(item, next);
        }
    }
    await walk(document, []);
    return { document, resources };
}
