import { useCallback, useEffect, useRef, useState } from "react";

import { cn } from "@/lib/utils";

const SLEEP_DELAY_MS = 30_000;

export function CanvasAgentPet({ reducedMotion }: { reducedMotion: boolean }) {
    const [sleeping, setSleeping] = useState(false);
    const sleepTimerRef = useRef<number | null>(null);

    const scheduleSleep = useCallback(() => {
        if (sleepTimerRef.current !== null) window.clearTimeout(sleepTimerRef.current);
        if (reducedMotion) return;
        sleepTimerRef.current = window.setTimeout(() => setSleeping(true), SLEEP_DELAY_MS);
    }, [reducedMotion]);

    useEffect(() => {
        scheduleSleep();
        return () => {
            if (sleepTimerRef.current !== null) window.clearTimeout(sleepTimerRef.current);
        };
    }, [scheduleSleep]);

    const wake = () => {
        setSleeping(false);
        scheduleSleep();
    };

    return <span
        className={cn("canvas-agent-pet", sleeping && "is-sleeping", reducedMotion && "is-reduced-motion")}
        aria-hidden="true"
        onPointerEnter={wake}
    />;
}
