package assets

import "testing"

func TestDirectorDeskKeepsHostResourceOwnershipReferences(t *testing.T) {
	raw := `{"previsScenes":[{"directorDesk":{"document":{"scenes":[{"state":{"entities":[{"external":{"$director:resourceId":"model-native"}}]}}]},"resources":[{"path":["resources",0,"package","files",0,"data"],"storageKey":"resource:director-upload"}]}}]}`
	refs, err := CollectDocumentResourceReferences(raw)
	if err != nil {
		t.Fatal(err)
	}
	if len(refs) != 1 || refs[0].ResourceID != "director-upload" {
		t.Fatalf("native identities must not bypass or become host ownership references: %#v", refs)
	}
}
