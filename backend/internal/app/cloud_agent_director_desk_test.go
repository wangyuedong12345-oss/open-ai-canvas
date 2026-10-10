package app

import "testing"

func TestDirectorDeskRejectsLossyOperationsBeforeApproval(t *testing.T) {
	scene := map[string]any{"directorDesk": map[string]any{"version": 1}}
	rotation := []float64{0, 1, 0}
	for _, op := range []cloudAgentPrevisPatchOperation{
		{Type: "object_remove", ID: "group-member"},
		{Type: "shot_remove", ID: "cut"},
		{Type: "object_keyframe_upsert", Rotation: &rotation},
		{Type: "object_update", Pose: "phone"},
		{Type: "object_motion_path_clear"},
	} {
		if cloudAgentDirectorDeskOperation(scene, op) == nil {
			t.Fatalf("lossy native operation was accepted: %+v", op)
		}
		if cloudAgentDirectorDeskOperation(map[string]any{}, op) != nil {
			t.Fatal("legacy scenes must retain their existing contract")
		}
	}
	if err := cloudAgentDirectorDeskOperation(scene, cloudAgentPrevisPatchOperation{Type: "object_update", Position: &rotation}); err != nil {
		t.Fatalf("native object placement should remain available: %v", err)
	}
}

func TestDirectorDeskProtectsNativeLockedAndBoundEntities(t *testing.T) {
	position := []float64{1, 0, 2}
	for _, binding := range []map[string]any{
		{"locked": true},
		{"handBinding": map[string]any{"actorId": "actor"}},
		{"structureLink": map[string]any{"parentId": "wall"}},
		{"camera": map[string]any{"mode": "follow"}},
	} {
		binding["id"] = "native"
		scene := map[string]any{"directorDesk": map[string]any{"document": map[string]any{
			"activeSceneId": "scene-main", "scenes": []any{map[string]any{"id": "scene-main", "state": map[string]any{"entities": []any{binding}}}},
		}}}
		if cloudAgentDirectorDeskOperation(scene, cloudAgentPrevisPatchOperation{Type: "object_update", ID: "native", Position: &position}) == nil {
			t.Fatalf("native binding accepted a legacy transform: %+v", binding)
		}
	}
}
