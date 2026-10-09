import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { inspirationSources } from "../src/lib/inspirations/catalog";
import { resolveInspirations } from "../src/lib/inspirations/resolve";

const publicDir = resolve(import.meta.dir, "../public");
const readJson = (name: string) => JSON.parse(readFileSync(resolve(publicDir, "inspirations", name), "utf8"));

describe("remaining inspiration sources", () => {
    test("catalogs and gallery retain only supported sources with valid covers", () => {
        const sources = ["haohaoxue", "youmind"];
        const manifest = readJson("manifest.json");
        expect(Object.keys(manifest.sources).sort()).toEqual(sources);
        expect(Object.keys(inspirationSources).sort()).toEqual(["custom", ...sources]);
        for (const source of sources) {
            const pack = readJson(`${source}.json`);
            expect(pack.entries.length).toBe(manifest.sources[source].count);
            expect(new Set(pack.entries.map((item: { id: string }) => item.id)).size).toBe(pack.entries.length);
            for (const item of pack.entries) {
                expect(item.sourceId).toBe(source);
                expect(item.prompt.trim().length).toBeGreaterThan(0);
                if (item.image.startsWith("/")) expect(existsSync(resolve(publicDir, item.image.slice(1)))).toBe(true);
            }
        }
        const gallery = readJson("gallery-pool.json");
        expect(gallery.entries.length).toBeGreaterThan(0);
        for (const item of gallery.entries) {
            expect(sources).toContain(item.sourceId);
            expect(existsSync(resolve(publicDir, item.image.slice(1)))).toBe(true);
        }
        expect(existsSync(resolve(publicDir, "inspirations/seedance.json"))).toBe(false);
        expect(existsSync(resolve(publicDir, "inspiration-thumbs/seedance"))).toBe(false);
    });
    test("user-created entries remain available separately from removed built-in templates", () => {
        const custom = { id: "custom:existing", title: "我的创意", description: "", image: "", mode: "text" as const, prompt: "保留用户自己写的内容" };
        expect(resolveInspirations([], { custom: [custom], overrides: {}, hidden: [] })).toEqual([{ ...custom, sourceId: "custom" }]);
    });
});
