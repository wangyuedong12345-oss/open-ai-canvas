import { useEffect, useRef } from "react";

import { cn } from "@/lib/utils";
import { createStudyCharacter } from "./study-character/engine.js";
import "./study-character.css";

export function StudyCharacter({ size = 60, className }: { size?: number; className?: string }) {
    const svgRef = useRef<SVGSVGElement>(null);

    useEffect(() => {
        const svg = svgRef.current;
        if (!svg) return;
        const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
        let character: ReturnType<typeof createStudyCharacter> | undefined;
        const mount = () => {
            character?.destroy();
            svg.replaceChildren();
            character = createStudyCharacter(svg, {
                sizePx: size,
                shape: "blob",
                color: "black",
                mode: "onboarding",
                loginWrap: true,
                inkFlat: "var(--foreground)",
                eyeColor: "var(--background)",
                reduceMotion: motion.matches,
                paused: motion.matches,
            });
            // The constructor paints once; reduced motion needs no ongoing frames.
            if (motion.matches) character.destroy();
        };
        mount();
        motion.addEventListener("change", mount);
        return () => {
            motion.removeEventListener("change", mount);
            character?.destroy();
            svg.replaceChildren();
        };
    }, [size]);

    return <span className={cn("study-character", className)} style={{ width: size, height: size }} aria-hidden="true">
        <span className="study-character-mirror"><svg ref={svgRef} /></span>
    </span>;
}
