import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("workspace credit mark", () => {
    test("top-bar credit entries use the purple lucide coin mark", () => {
        const topBar = readFileSync(resolve(import.meta.dir, "../src/components/layout/workspace-top-bar.tsx"), "utf8");
        const canvas = readFileSync(resolve(import.meta.dir, "../src/pages/canvas/canvas-project-top-bar.tsx"), "utf8");
        const css = readFileSync(resolve(import.meta.dir, "../src/styles/globals.css"), "utf8");

        expect(topBar).toContain("<Coins aria-hidden=\"true\" />");
        expect(canvas).toContain("<Coins className=\"size-3.5\"");
        expect(css).toContain(".app-user-workspace .app-workspace-topbar-credit-pill svg");
        expect(css).toContain("color: var(--user-accent);");
        expect(css).toContain("color-mix(in srgb, var(--user-accent)");
        expect(css).not.toContain("#ff8a28");
    });
});
