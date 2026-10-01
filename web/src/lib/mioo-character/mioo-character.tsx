import { useEffect, useRef } from "react";

import { GrokCharacter } from "./engine";

/** 随机轮播用的情绪池：引擎全量 39 种状态。 */
const MOOD_POOL = [
    "sleeping",
    "waking",
    "listening",
    "thinking",
    "searching",
    "working",
    "excited",
    "surprised",
    "suspicious",
    "angry",
    "drowsy",
    "happy",
    "curious",
    "confused",
    "bored",
    "proud",
    "shy",
    "sad",
    "laughing",
    "scared",
    "playful",
    "celebrate",
    "orbit",
    "radar",
    "progress",
    "spawning",
    "humming",
    "loading",
    "dictating",
    "sending",
    "receiving",
    "uploading",
    "writing",
    "notifying",
    "alerting",
    "bouncing",
    "dragging",
    "powering-down",
] as const;

const rand = (min: number, max: number) => min + Math.random() * (max - min);

export interface MiooCharacterProps {
    className?: string;
    /** 随机播放情绪状态；prefers-reduced-motion 时强制关闭。 */
    randomMoods?: boolean;
    /** 视线跟随指针。 */
    followPointer?: boolean;
}

/**
 * Mioo 角色（Pebble 身形）React 封装。
 * 引擎来自 grok-icon-study 复刻版，挂载到本组件的 <svg> 上自行动画。
 */
export function MiooCharacter({ className, randomMoods = true, followPointer = true }: MiooCharacterProps) {
    const svgRef = useRef<SVGSVGElement>(null);

    useEffect(() => {
        const svg = svgRef.current;
        if (!svg) return;

        const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        const bot = new GrokCharacter(svg, {
            shape: "pebble",
            color: "black",
            scheme: "light",
            mode: "hold",
            state: "idle",
            inkFlat: "#17161c",
            eyeColor: "#ffffff",
            followPointer,
        });

        let timer: number | undefined;
        if (randomMoods && !reduceMotion) {
            let idleBeat = false;
            const tick = () => {
                idleBeat = !idleBeat;
                const next = idleBeat
                    ? "idle"
                    : MOOD_POOL[Math.floor(Math.random() * MOOD_POOL.length)];
                bot.setState(next, { resetEyes: false });
                // 情绪停留稍久，回 idle 短暂换气，节奏参考登录页 pjn 轮换。
                timer = window.setTimeout(tick, next === "idle" ? rand(1000, 1800) : rand(2400, 4200));
            };
            timer = window.setTimeout(tick, 1600);
        }

        return () => {
            window.clearTimeout(timer);
            bot.destroy();
        };
    }, [randomMoods, followPointer]);

    return <svg ref={svgRef} className={className} role="img" aria-label="Mioo 角色" />;
}
