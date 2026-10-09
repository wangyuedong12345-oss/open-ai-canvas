import { expect, test } from "bun:test";
import { creationPromptLayout } from "../src/pages/create/creation-prompt-layout";

test("wrapped content grows until twelve lines, then scrolls without growing", () => {
    expect(creationPromptLayout(200, 24.8)).toEqual({ height: 200, growth: 64, overflow: "hidden" });
    expect(creationPromptLayout(298, 24.8)).toEqual({ height: 298, growth: 162, overflow: "hidden" });
    expect(creationPromptLayout(323, 24.8)).toEqual({ height: 298, growth: 162, overflow: "auto" });
});

test("deleting content restores the initial height and hides scrolling", () => {
    expect(creationPromptLayout(25, 24.8)).toEqual({ height: 136, growth: 0, overflow: "hidden" });
    expect(creationPromptLayout(248, 24.8)).toEqual({ height: 248, growth: 112, overflow: "hidden" });
});

test("conversation input uses the taller baseline and caps at ten wrapped lines", () => {
    expect(creationPromptLayout(22, 21.7, "thread")).toEqual({ height: 116, growth: 0, overflow: "hidden" });
    expect(creationPromptLayout(174, 21.7, "thread")).toEqual({ height: 174, growth: 58, overflow: "hidden" });
    expect(creationPromptLayout(217, 21.7, "thread")).toEqual({ height: 217, growth: 101, overflow: "hidden" });
    expect(creationPromptLayout(239, 21.7, "thread")).toEqual({ height: 217, growth: 101, overflow: "auto" });
    expect(creationPromptLayout(65, 21.7, "thread")).toEqual({ height: 116, growth: 0, overflow: "hidden" });
});
