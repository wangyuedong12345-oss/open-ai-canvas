package app

// Native-only animation, grouping and resource relationships cannot be rewritten
// through the old projection. Reject them before approval instead of losing data.
func cloudAgentDirectorDeskOperation(scene map[string]any, op cloudAgentPrevisPatchOperation) error {
	native, ok := scene["directorDesk"].(map[string]any)
	if !ok {
		return nil
	}
	unsupported := func() error {
		return BadAuthRequest("此操作不能通过预演投影无损修改 DirectorDesk 工程，请在导演台编辑；本次未写入")
	}
	if op.ParentID != nil || op.Archetype == "monster" || (op.FPS != nil && *op.FPS == 25) {
		return unsupported()
	}
	if document, ok := native["document"].(map[string]any); ok {
		for _, entry := range creationMaps(document["scenes"]) {
			if stringValue(entry["id"]) != stringValue(document["activeSceneId"]) {
				continue
			}
			state, _ := entry["state"].(map[string]any)
			for _, entity := range creationMaps(state["entities"]) {
				if stringValue(entity["id"]) != op.ID {
					continue
				}
				if locked, _ := entity["locked"].(bool); locked {
					return unsupported()
				}
				if op.Position != nil || op.Rotation != nil || op.Scale != nil || op.Target != nil {
					if entity["handBinding"] != nil || entity["structureLink"] != nil {
						return unsupported()
					}
					if camera, ok := entity["camera"].(map[string]any); ok && stringValue(camera["mode"]) != "free" {
						return unsupported()
					}
				}
			}
		}
	}
	if op.Pose != "" {
		switch op.Pose {
		case "neutral", "stand", "walk", "run", "sit", "squat", "fight", "kick", "throw", "push", "wave":
		default:
			return unsupported()
		}
	}
	switch op.Type {
	case "scene_update":
		if op.GridVisible != nil || op.ActiveShotID != nil || (op.EnvironmentIntensity != nil && *op.EnvironmentIntensity > 20) {
			return unsupported()
		}
	case "object_add", "object_update":
		if op.Kind == "model" || op.Kind == "billboard" || (op.Type == "object_update" && (op.Kind != "" || op.Primitive != "" || op.Archetype != "")) {
			return unsupported()
		}
	case "object_motion_path_set", "object_keyframe_upsert", "object_keyframe_remove", "camera_keyframe_upsert", "camera_keyframe_remove":
		if op.Rotation != nil || op.Scale != nil {
			return unsupported()
		}
	case "camera_add", "camera_update", "light_add", "light_update":
		if op.LightType != nil && (*op.LightType == "ambient" || op.Type == "light_update") {
			return unsupported()
		}
	default:
		// Removing entities or rewriting cuts can invalidate native bindings,
		// continuity snapshots, physics and independent scene relationships.
		return unsupported()
	}
	return nil
}
