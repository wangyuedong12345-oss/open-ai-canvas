import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("asset library filters", () => {
    test("keeps type and business filters in the toolbar while folders stay in the left nav", () => {
        const page = readFileSync(resolve(import.meta.dir, "../src/pages/assets/index.tsx"), "utf8");
        const css = readFileSync(resolve(import.meta.dir, "../src/styles/workspace-product.css"), "utf8");
        expect(page).toContain('className="assets-collection-layout"');
        expect(page).toContain('aria-label="素材分类"');
        expect(page).toContain("value={kindFilter}");
        expect(page).toContain("value={categoryFilter}");
        expect(page).toContain("全部类型");
        expect(page).toContain("全部用途");
        expect(page).not.toContain('title="素材类型"');
        expect(page).not.toContain('title="业务分类"');
        expect(page).toContain("我的分类");
        expect(page).not.toContain("全部自定义分类");
        expect(css).toMatch(/\.assets-collection-layout\s*\{[^}]*grid-template-columns:\s*220px minmax\(0, 1fr\)/s);
        expect(css).toContain("grid-template-columns: repeat(var(--assets-grid-columns, 6), minmax(0, 1fr));");
    });
});

describe("wallet history pagination", () => {
    test("pins ledger pagination to the history panel footer", () => {
        const modal = readFileSync(resolve(import.meta.dir, "../src/components/layout/workspace-wallet-modal.tsx"), "utf8");
        const css = readFileSync(resolve(import.meta.dir, "../src/styles/globals.css"), "utf8");
        expect(modal).toContain("workspace-wallet-history-scroll");
        expect(modal).toContain("workspace-wallet-pagination");
        expect(modal).not.toContain("wallet.total > 20");
        expect(css).toMatch(/\.workspace-wallet-content\.is-history\s*\{[^}]*overflow:\s*hidden/s);
        expect(css).toMatch(/\.workspace-wallet-pagination\s*\{[^}]*margin-top:\s*auto/s);
    });
});

describe("batch asset upload modal", () => {
    test("uses the shared modal shell and explicit content spacing", () => {
        const modal = readFileSync(resolve(import.meta.dir, "../src/pages/assets/asset-batch-upload-modal.tsx"), "utf8");
        const css = readFileSync(resolve(import.meta.dir, "../src/styles/globals.css"), "utf8");
        expect(modal).toContain("import { AppModal }");
        expect(modal).toContain("flush");
        expect(modal).toContain("batch-upload-modal-content");
        expect(modal).toContain("batch-upload-modal-actions");
        expect(css).toContain(".batch-upload-modal-content");
        expect(css).toContain(".batch-upload-fields");
        expect(css).toContain("gap: var(--space-4)");
        expect(css).toContain(".batch-upload-modal-actions");
    });
});
