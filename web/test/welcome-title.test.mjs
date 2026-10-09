import assert from "node:assert/strict";
import { test } from "node:test";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const compile = async (path) => {
    const result = await Bun.build({ entrypoints: [fileURLToPath(new URL(path, import.meta.url))], format: "cjs", target: "node", external: ["*"] });
    assert.equal(result.success, true);
    return result.outputs[0].text();
};
const jsx = (type, props) => typeof type === "function" ? type(props) : { type, props };

test("welcome waits for configured appearance and preserves its SEO title", async () => {
    const document = { title: "正在加载", getElementById: () => ({}) };
    const pageModule = { exports: {} };
    vm.runInNewContext(await compile("../src/pages/welcome/index.tsx"), {
        module: pageModule, exports: pageModule.exports, document,
        require: (id) => /^react\/jsx-(dev-)?runtime$/.test(id) ? { jsx, jsxs: jsx, jsxDEV: jsx } :
            id === "lucide-react" ? { ArrowUpRight: () => null } :
            id === "@/lib/mioo-character/mioo-character" ? { MiooCharacter: () => null } : {},
    });
    let resolveAppearance;
    const appearanceReady = new Promise((resolve) => { resolveAppearance = resolve; });
    let complete;
    const rendered = new Promise((resolve) => { complete = resolve; });
    let renders = 0;
    vm.runInNewContext(await compile("../src/welcome-application.tsx"), {
        module: { exports: {} }, exports: {}, document, console,
        window: { location: { pathname: "/welcome", replace() { throw new Error("unexpected redirect"); } } },
        require: (id) => {
            if (/^react\/jsx-(dev-)?runtime$/.test(id)) return { jsx, jsxs: jsx, jsxDEV: jsx };
            if (id === "react") return { StrictMode: ({ children }) => children };
            if (id === "react-dom/client") return { createRoot: () => ({ render: (element) => { renders++; complete(element); } }) };
            if (id === "@/services/api/welcome") return { getWelcomeAvailability: async () => ({ welcomeEnabled: true }) };
            if (id === "@/services/appearance-bootstrap") return { bootstrapAppearance: () => appearanceReady.then(() => { document.title = "灵帧造物"; }) };
            if (id === "@/pages/welcome") return pageModule.exports;
            if (id === "@/lib/workspace-boot") return { bootWorkspace() { throw new Error("unexpected workspace fallback"); } };
            throw new Error(`Unexpected import: ${id}`);
        },
    });
    await Promise.resolve();
    assert.equal(renders, 0, "welcome must wait for appearance metadata");
    resolveAppearance();
    const element = await rendered;
    assert.equal(renders, 1);
    assert.equal(document.title, "灵帧造物");
    assert.equal(element.props.children[2].props.children, "FRAMIND");
});
