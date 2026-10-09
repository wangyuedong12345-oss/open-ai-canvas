import type { CreationMode } from "@/lib/creation-mode";
import { HIGHLIGHT_REVISIONS } from "./source-revisions";

export type InspirationSourceId = "custom" | "haohaoxue" | "youmind";

export type InspirationSourceInfo = {
    /** 卡片来源行上的短标签。 */
    label: string;
    /** 页脚链接文本，通常是仓库短名或站点名。 */
    name?: string;
    /** 来源地址：仓库或站点首页。 */
    repository?: string;
    revision?: string;
    license?: string;
    notice?: string;
};

/** 来源表：新增外部灵感源时在这里加一项，卡片与页脚都按它渲染许可标识。 */
export const inspirationSources: Record<InspirationSourceId, InspirationSourceInfo> = {
    custom: { label: "我的灵感" },
    haohaoxue: {
        label: "好好学 AI · 图片提示词",
        name: "好好学 AI",
        repository: "https://www.haohaoxue.com/prompts/",
        revision: HIGHLIGHT_REVISIONS.haohaoxue,
        license: "站点公开数据 · robots.txt 允许抓取",
        notice: "图片提示词中英双语正文与封面来自好好学 AI 提示词库（haohaoxue.com），该站 robots.txt 明确允许包括 ClaudeBot 在内的抓取。作者署名取数据内置的 author 字段。封面为原提示词示例图，不代表本平台生成结果。",
    },
    youmind: {
        label: "YouMind 提示词库 · CC BY 4.0",
        name: "YouMind",
        repository: "https://github.com/YouMind-OpenLab/awesome-nano-banana-pro-prompts",
        revision: HIGHLIGHT_REVISIONS.youmind,
        license: "CC BY 4.0",
        notice: "图片提示词与配图来自 YouMind OpenLab 的 awesome-nano-banana-pro-prompts 与 awesome-gpt-image-2 两个姊妹库（Nano Banana Pro / GPT Image 2 中文提示词），按 CC BY 4.0 署名使用。作者署名取条目内置的 author 字段。配图为原提示词的生成示例，不代表本平台生成结果。",
    },
};

export function inspirationSourceOf(item: CreationInspiration): InspirationSourceInfo {
    return inspirationSources[item.sourceId ?? "custom"];
}

/**
 * 灵感条目。
 * 外部来源的 id 是 "<来源>:<上游标识>"，自建条目没有 id，由 catalogIdOf 按来源加标题兜底，
 * 两者合起来作为收藏、隐藏、改写的稳定键。
 */
export type CreationInspiration = {
    id?: string;
    title: string;
    description: string;
    image: string;
    mode: CreationMode;
    prompt: string;
    /** 中文正文，双语来源才有（好好学 AI 的中英双语条目）。 */
    promptZh?: string;
    /** 上游分类 id，标签表见 public/inspirations/manifest.json。 */
    category?: string;
    tags?: string[];
    /** 画面比例，例如 "4:5"；上游有才带。 */
    ratio?: string;
    featured?: boolean;
    /** 来源归属；缺省视为用户自建。 */
    sourceId?: InspirationSourceId;
    /** 署名，例如外部案例的作者或提示词角色名。 */
    credit?: string;
    /** 回到上游原页的链接。 */
    sourceUrl?: string;
};

/** 条目在本地存储里的稳定键。 */
export function catalogIdOf(item: CreationInspiration): string {
    return item.id ?? `${item.sourceId ?? "custom"}:${item.title}`;
}

/** 需要对外声明的来源（自建不写声明），供页面署名与合规展示复用。 */
export function declaredInspirationSources(): InspirationSourceInfo[] {
    return Object.values(inspirationSources).filter((source) => source.notice);
}
