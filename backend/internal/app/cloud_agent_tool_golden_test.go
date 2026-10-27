package app

import (
	"bytes"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"reflect"
	"sort"
	"testing"
)

// 工具 schema 是模型契约，也是 prompt cache 前缀的第一段。重构（注册表、typed args）
// 必须逐字节保持输出不变；确实需要改契约时用 UPDATE_GOLDEN=1 重新生成并在评审中检查 diff。
func cloudAgentToolGoldenRequests() map[string]CloudAgentRequest {
	full := CloudAgentRequest{PermissionMode: "auto", ContextScope: []string{"canvas"}, SkillIDs: []string{"capability-list"}, VisionEnabled: true}
	full.Budget.MaxGenerationTasks = 1
	return map[string]CloudAgentRequest{
		"full":             full,
		"read_only_canvas": {PermissionMode: "read_only", ContextScope: []string{"canvas"}},
		"approval_canvas":  {PermissionMode: "request_approval", ContextScope: []string{"canvas"}},
		"no_canvas":        {PermissionMode: "auto"},
	}
}

func TestCloudAgentToolSchemaGolden(t *testing.T) {
	for name, req := range cloudAgentToolGoldenRequests() {
		t.Run(name, func(t *testing.T) {
			raw, err := json.MarshalIndent(cloudAgentTools(req), "", "  ")
			if err != nil {
				t.Fatal(err)
			}
			assertCloudAgentGolden(t, filepath.Join("testdata", "agent_tools", name+".json"), raw)
		})
	}
}

func TestCloudAgentSupportedToolNamesGolden(t *testing.T) {
	raw, err := json.MarshalIndent(CloudAgentSupportedToolNames(), "", "  ")
	if err != nil {
		t.Fatal(err)
	}
	assertCloudAgentGolden(t, filepath.Join("testdata", "agent_tools", "supported_names.json"), raw)
}

func assertCloudAgentGolden(t *testing.T, path string, got []byte) {
	t.Helper()
	got = append(got, '\n')
	if os.Getenv("UPDATE_GOLDEN") == "1" {
		if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(path, got, 0o644); err != nil {
			t.Fatal(err)
		}
		return
	}
	want, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("缺少 golden 文件 %s（UPDATE_GOLDEN=1 生成）：%v", path, err)
	}
	if !bytes.Equal(want, got) {
		var expected, actual any
		if json.Unmarshal(want, &expected) == nil && json.Unmarshal(got, &actual) == nil {
			for _, difference := range cloudAgentGoldenDifferences("$", expected, actual) {
				t.Log(difference)
			}
		}
		t.Fatalf("%s 与当前输出不一致；确认是有意改契约后用 UPDATE_GOLDEN=1 更新", path)
	}
}

func cloudAgentGoldenDifferences(path string, expected, actual any) []string {
	if reflect.DeepEqual(expected, actual) {
		return nil
	}
	if left, ok := expected.(map[string]any); ok {
		if right, ok := actual.(map[string]any); ok {
			keys := map[string]bool{}
			for key := range left {
				keys[key] = true
			}
			for key := range right {
				keys[key] = true
			}
			ordered := make([]string, 0, len(keys))
			for key := range keys {
				ordered = append(ordered, key)
			}
			sort.Strings(ordered)
			var differences []string
			for _, key := range ordered {
				differences = append(differences, cloudAgentGoldenDifferences(path+"."+key, left[key], right[key])...)
			}
			return differences
		}
	}
	if left, ok := expected.([]any); ok {
		if right, ok := actual.([]any); ok && len(left) == len(right) {
			var differences []string
			for index := range left {
				differences = append(differences, cloudAgentGoldenDifferences(fmt.Sprintf("%s[%d]", path, index), left[index], right[index])...)
			}
			return differences
		}
	}
	left, _ := json.Marshal(expected)
	right, _ := json.Marshal(actual)
	return []string{fmt.Sprintf("%s expected=%s actual=%s", path, left, right)}
}
