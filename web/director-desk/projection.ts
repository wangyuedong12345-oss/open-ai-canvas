import { assertProject, entity, demoProject, type Entity, type Project, type Vec3, type Action } from "../vendor/director-desk/src/model.ts";
import { readSceneDocument, projectForScene, type SceneDocument } from "../vendor/director-desk/src/scenes/sequence-project.ts";
import { defaultLighting, defaultLight } from "../vendor/director-desk/src/lighting/model.ts";
import type { PrevisScene, PrevisObject, PrevisCamera, PrevisLight, PrevisPose } from "../src/types/previs.ts";
import { PREVIS_DEFAULT_ACTOR_URL } from "../src/lib/canvas/previs/previs-scene.ts";

const actions: Partial<Record<PrevisPose, Action>> = { neutral: "idle", stand: "idle", walk: "walk", run: "run", sit: "sit", squat: "crouch", fight: "guard", kick: "kick", throw: "throw", push: "push", wave: "wave" };
const equal = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const transform = (e: Entity) => ({ position: [...e.position] as Vec3, rotation: [...e.rotation] as Vec3, scale: [...e.scale] as Vec3 });
function objectEntity(object: PrevisObject, duration: number): Entity {
    const mappedRig = object.rig && (object.rig.status !== "unmapped" || Object.keys(object.rig.boneMap).length || object.rig.animationNames.length);
    if (object.kind === "model" || object.kind === "billboard" || mappedRig || (object.url && object.url !== PREVIS_DEFAULT_ACTOR_URL) || object.storageKey || object.motionClips?.length || object.boneTracks?.length || Object.keys(object.boneOverrides ?? {}).length) {
        throw new Error(`旧对象「${object.name}」包含模型、贴图或骨骼数据，尚不支持无损转换；请保留原工程，使用导演台导入素材`);
    }
    const actor = object.kind === "actor" || object.primitive === "character";
    const asset = actor ? (object.archetype === "woman" ? "woman" : "person") : `shape-${object.primitive ?? "box"}`;
    const e = entity(actor ? "actor" : "prop", asset, object.name);
    e.id = object.id; updateObject(e, object, undefined, duration);
    return e;
}
function updateObject(e: Entity, object: PrevisObject, previous: PrevisObject | undefined, duration: number) {
    if (!previous || !equal(object.transform, previous.transform)) {
        if (previous && e.path && equal([object.motionPath, object.keyframes], [previous.motionPath, previous.keyframes])) {
            const delta = object.transform.position.map((v, axis) => v - previous.transform.position[axis]);
            e.path.points = e.path.points.map((point) => ({ ...point, position: point.position.map((v, axis) => v + delta[axis]) as Vec3 }));
        }
        e.position = [...object.transform.position]; e.rotation = [...object.transform.rotation]; e.scale = [...object.transform.scale];
    }
    if (!previous || object.name !== previous.name) e.name = object.name;
    if (!previous || object.color !== previous.color) e.color = object.color;
    if (!previous || object.visible !== previous.visible) e.visible = object.visible;
    if (!previous || !equal(object.actorProfile, previous.actorProfile)) {
        if (object.actorProfile && (e.kind === "actor" || e.kind === "crowd")) e.height = object.actorProfile.height * (e.asset === "woman" ? 1.65 : 1.75);
    }
    if ((!previous || object.pose !== previous.pose) && object.pose) {
        const action = actions[object.pose];
        if (!action) throw new Error(`姿势「${object.pose}」需要在导演台动作面板设置，不能自动转换`);
        e.clips = [{ id: `pose-${e.id}`, action, start: 0, end: duration, speed: 1 }];
    }
    if (!previous || !equal([object.motionPath, object.keyframes], [previous.motionPath, previous.keyframes])) {
        const keys = object.keyframes;
        if (keys.some((k) => !equal(k.transform.rotation, object.transform.rotation) || !equal(k.transform.scale, object.transform.scale))) throw new Error(`对象「${object.name}」的旋转或缩放关键帧不能无损转换`);
        if (keys.length > 1) e.path = { smooth: true, points: keys.map((k) => ({ time: k.time, position: k.transform.position, easing: k.easing === "step" ? "hold" : k.easing ?? "linear" })) };
        else if (object.motionPath?.points.length) {
            const p = object.motionPath;
            const speed = p.speed === "run" ? 3 : p.speed === "slow" ? .6 : 1.4;
            let time = p.startDelay;
            e.path = { smooth: true, points: p.points.map((position, i) => {
                if (i) time += Math.hypot(...position.map((v, axis) => v - p.points[i - 1][axis])) / speed;
                return { time, position: [...position] as Vec3 };
            }) };
            e.face = p.orientToPath ? "path" : "fixed";
        } else e.path = null;
    }
}
function cameraEntity(camera: PrevisCamera): Entity {
    const e = entity("camera", "camera", camera.name); e.id = camera.id;
    updateCamera(e, camera); return e;
}
function updateCamera(e: Entity, camera: PrevisCamera, previous?: PrevisCamera) {
    if (!previous || !equal(camera.transform, previous.transform)) {
        if (previous && e.path && equal(camera.keyframes, previous.keyframes)) {
            const delta = camera.transform.position.map((v, axis) => v - previous.transform.position[axis]);
            e.path.points = e.path.points.map((point) => ({ ...point, position: point.position.map((v, axis) => v + delta[axis]) as Vec3 }));
        }
        e.position = [...camera.transform.position]; e.rotation = [...camera.transform.rotation]; e.scale = [...camera.transform.scale];
    }
    e.name = camera.name;
    if (!previous || !equal(camera.target, previous.target)) e.camera!.target = [...camera.target];
    if (!previous || camera.focalLength !== previous.focalLength) e.camera!.focal = camera.focalLength;
    if (!previous || !equal(camera.keyframes, previous.keyframes)) {
        if (camera.keyframes.some((k) => !equal(k.transform.rotation, camera.transform.rotation) || !equal(k.transform.scale, camera.transform.scale))) throw new Error(`摄影机「${camera.name}」旋转关键帧需要转为原生目标路径`);
        e.path = camera.keyframes.length > 1 ? { smooth: true, points: camera.keyframes.map((k) => ({ time: k.time, position: k.transform.position })) } : null;
    }
}
function lightEntity(light: PrevisLight): Entity {
    if (light.type === "ambient") throw new Error("环境光请通过场景环境强度设置，不能转换独立环境灯");
    const asset = light.type === "directional" ? "light-sun" : light.type === "spot" ? "light-spot" : "light-point";
    const e = entity("prop", asset, light.name); e.id = light.id;
    e.position = [...light.transform.position]; e.rotation = [...light.transform.rotation]; e.scale = [...light.transform.scale]; e.color = light.color;
    e.light = { ...defaultLight(asset), intensity: light.intensity, shadows: light.castShadow, ...(light.angle === undefined ? {} : { angle: light.angle * 180 / Math.PI }), ...(light.penumbra === undefined ? {} : { penumbra: light.penumbra }) };
    return e;
}
function updateLight(e: Entity, light: PrevisLight, previous?: PrevisLight) {
    if (!previous) { Object.assign(e, lightEntity(light)); return; }
    e.name = light.name;
    if (!equal(light.transform, previous.transform)) { e.position = [...light.transform.position]; e.rotation = [...light.transform.rotation]; e.scale = [...light.transform.scale]; }
    if (light.color !== previous.color) e.color = light.color;
    if (light.intensity !== previous.intensity) e.light!.intensity = light.intensity;
    if (light.castShadow !== previous.castShadow) e.light!.shadows = light.castShadow;
    if (light.angle !== previous.angle && light.angle !== undefined) e.light!.angle = light.angle * 180 / Math.PI;
    if (light.penumbra !== previous.penumbra && light.penumbra !== undefined) e.light!.penumbra = light.penumbra;
}
function applyShots(project: Project, scene: PrevisScene) {
    const shot = scene.shots.find((s) => s.id === scene.activeShotId) ?? scene.shots[0];
    if (!shot) throw new Error("预演场景缺少镜头");
    if (scene.shots.some((s) => s.fps === 25 || s.aspectRatio === "2.39:1")) throw new Error("旧工程的 25fps 或 2.39:1 规格不能直接转换，请先调整导出规格");
    project.fps = shot.fps; project.aspect = shot.aspectRatio ?? "16:9";
    let time = 0;
    project.cuts = scene.shots.map((s) => { const cut = { time, cameraId: s.cameraId }; time += s.duration; return cut; });
    project.duration = time;
}
export function documentFromPrevis(scene: PrevisScene): SceneDocument {
    const project = demoProject(); project.name = scene.title; project.references = []; project.room.enabled = false;
    applyShots(project, scene);
    project.entities = [...scene.objects.map((o) => objectEntity(o, project.duration)), ...scene.cameras.map(cameraEntity), ...scene.lights.filter((l) => l.type !== "ambient").map(lightEntity)];
    project.lighting = { ...defaultLighting(), defaultLights: !scene.lights.length, background: scene.background, ambient: scene.environmentIntensity + scene.lights.filter((l) => l.type === "ambient").reduce((sum, l) => sum + l.intensity, 0) };
    if (scene.environment?.url || scene.environment?.storageKey) throw new Error("旧全景环境需要在导演台重新设置，原工程尚未修改");
    assertProject(project); return readSceneDocument(project);
}
/** Only changed fields from approved legacy operations are applied; native-only data stays authoritative. */
export function reconcileDirectorDocument(document: SceneDocument, scene: PrevisScene): SceneDocument {
    const old = scene.directorDesk?.projection;
    if (!old) return document;
    const project = projectForScene(document);
    for (const [current, previous, create, update] of [
        [scene.objects, old.objects, (o: PrevisObject) => objectEntity(o, project.duration), (e: Entity, o: PrevisObject, p: PrevisObject) => updateObject(e, o, p, project.duration)],
        [scene.cameras, old.cameras, cameraEntity, updateCamera],
        [scene.lights, old.lights, lightEntity, updateLight],
    ] as const) {
        const before = new Map(previous.map((item) => [item.id, item]));
        for (const item of previous) if (!current.some((value) => value.id === item.id)) project.entities = project.entities.filter((e) => e.id !== item.id);
        for (const item of current) {
            const prior = before.get(item.id);
            if (equal(item, prior)) continue;
            const existing = project.entities.find((e) => e.id === item.id);
            // The tuple's create/update functions share the same discriminated collection.
            if (!existing) project.entities.push((create as (v: typeof item) => Entity)(item));
            else (update as (e: Entity, v: typeof item, p: typeof item | undefined) => void)(existing, item, prior);
        }
    }
    if (!equal(scene.shots.map(({ previewNodeId, depthNodeId, normalNodeId, ...s }) => s), old.shots.map(({ previewNodeId, depthNodeId, normalNodeId, ...s }) => s))) applyShots(project, scene);
    project.name = scene.title;
    if (project.lighting) {
        if (scene.background !== old.background) project.lighting.background = scene.background;
        if (scene.environmentIntensity !== old.environmentIntensity) project.lighting.ambient = scene.environmentIntensity;
    }
    assertProject(project);
    const { resources, media, format, version, name, ...state } = project;
    const result = structuredClone(document); result.name = scene.title;
    result.scenes.find((s) => s.id === result.activeSceneId)!.state = state;
    return readSceneDocument(result);
}
export function previsFromDocument(document: SceneDocument, base: PrevisScene): PrevisScene {
    const project = projectForScene(document);
    const { directorDesk, ...previous } = base;
    const oldObjects = new Map(base.objects.map((o) => [o.id, o]));
    const cuts = project.cuts.length ? project.cuts : [{ time: 0, cameraId: project.entities.find((e) => e.kind === "camera")!.id }];
    const scene: PrevisScene = {
        ...previous, title: document.name, background: project.lighting?.background ?? base.background,
        environmentIntensity: typeof project.lighting?.ambient === "number" ? project.lighting.ambient : base.environmentIntensity,
        objects: project.entities.filter((e) => e.kind !== "camera" && !e.light).map((e) => ({
            ...oldObjects.get(e.id), id: e.id, name: e.name, kind: e.external ? "model" : e.kind === "actor" || e.kind === "crowd" ? "actor" : "primitive",
            primitive: e.kind === "actor" || e.kind === "crowd" ? "character" : e.asset === "shape-sphere" ? "sphere" : e.asset === "shape-cylinder" ? "cylinder" : e.asset === "shape-plane" ? "plane" : "box",
            transform: transform(e), color: e.color, visible: e.visible, castShadow: true, receiveShadow: true,
            ...(e.kind === "actor" ? { actorProfile: { ...(oldObjects.get(e.id)?.actorProfile ?? { headRatio: 1, shoulderWidth: 1, torsoRatio: 1, accessory: "none" as const }), height: e.height / (e.asset === "woman" ? 1.65 : 1.75) } } : {}),
            keyframes: [], motionPath: undefined,
        })),
        cameras: project.entities.filter((e) => e.kind === "camera").map((e) => ({ id: e.id, name: e.name, transform: transform(e), target: [...e.camera!.target], focalLength: e.camera!.focal, fov: 50, aperture: 2.8, focusDistance: 5, near: .1, far: 1000, keyframes: [] })),
        lights: project.entities.filter((e) => e.light).map((e) => ({ id: e.id, name: e.name, type: e.asset === "light-sun" ? "directional" : e.asset === "light-spot" ? "spot" : "point", transform: transform(e), color: e.color, intensity: typeof e.light!.intensity === "number" ? e.light!.intensity : 1, castShadow: e.light!.shadows })),
        shots: cuts.map((cut, i) => ({ id: i === 0 ? base.shots[0]?.id ?? `${base.id}-shot` : `${document.activeSceneId}-cut-${i}`, name: `${project.name} · 镜头 ${i + 1}`, cameraId: cut.cameraId, duration: (cuts[i + 1]?.time ?? project.duration) - cut.time, fps: project.fps === 24 ? 24 : 30, aspectRatio: project.aspect === "9:16" ? "9:16" : "16:9", shotSize: "medium", cameraMove: "static", prompt: project.production?.promptText ?? project.production?.fixedPrompt ?? "" })),
        updatedAt: new Date().toISOString(),
    };
    scene.activeShotId = scene.shots[0].id;
    return scene;
}
