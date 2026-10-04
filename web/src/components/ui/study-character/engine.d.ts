export function createStudyCharacter(svg: SVGSVGElement, options: {
    sizePx: number;
    shape: string;
    color: string;
    mode: string;
    loginWrap: boolean;
    inkFlat: string;
    eyeColor: string;
    reduceMotion: boolean;
    paused: boolean;
}): { destroy(): void };
