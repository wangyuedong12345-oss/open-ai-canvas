package app

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"yingce/backend/internal/protocol"
)

func TestDeepSeekDeclarativeAgentResponses(t *testing.T) {
	t.Setenv("CANVAS_ALLOWED_PRIVATE_UPSTREAM_HOSTS", "127.0.0.1")
	manifest, err := os.ReadFile(filepath.Join("..", "..", "..", "plugin-packages", "deepseek-chat", "manifest.json"))
	if err != nil {
		t.Fatal(err)
	}
	adapter, err := protocol.LoadManifest(manifest)
	if err != nil {
		t.Fatal(err)
	}
	agentAdapter, ok := adapter.(protocol.AgentAdapter)
	if !ok {
		t.Fatal("DeepSeek plugin has no Agent adapter")
	}
	for _, scenario := range []string{"sse_text", "sse_tools_json_content_type", "json_fallback", "json_nonstream"} {
		t.Run(scenario, func(t *testing.T) {
			stream := scenario != "json_nonstream"
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				if r.URL.Path != "/v1/chat/completions" {
					t.Errorf("unexpected endpoint: %s", r.URL.Path)
				}
				var body map[string]any
				if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
					t.Error(err)
				}
				if (body["stream"] == true) != stream || body["max_tokens"] != float64(128) {
					t.Errorf("request options: stream=%v max_tokens=%v", body["stream"], body["max_tokens"])
				}
				if strings.HasPrefix(scenario, "json_") {
					w.Header().Set("Content-Type", "application/json")
					fmt.Fprint(w, `{"choices":[{"message":{"content":"ready"}}]}`)
					return
				}
				w.Header().Set("Content-Type", "text/event-stream")
				if scenario == "sse_tools_json_content_type" {
					w.Header().Set("Content-Type", "application/json")
					fmt.Fprint(w, "data: {\"choices\":[{\"delta\":{\"tool_calls\":[{\"index\":0,\"id\":\"call_create\",\"function\":{\"name\":\"canvas_apply_ops\",\"arguments\":\"{\\\"ops\\\":\"}}]}}]}\n\n")
					fmt.Fprint(w, "data: {\"choices\":[{\"delta\":{\"tool_calls\":[{\"index\":0,\"function\":{\"arguments\":\"[]}\"}}]},\"finish_reason\":\"tool_calls\"}]}\n\n")
				} else {
					fmt.Fprint(w, "data: {\"choices\":[{\"delta\":{\"reasoning_content\":\"plan\",\"content\":\"ready\"},\"finish_reason\":\"stop\"}]}\n\n")
				}
				fmt.Fprint(w, "data: [DONE]\n\n")
			}))
			defer server.Close()
			var text, reasoning strings.Builder
			result, err := runDeclarativeAgentTask(context.Background(), canvasGenerationInput{
				Mode: "text", StreamText: stream,
				Config:      providerConfig{BaseURL: server.URL, APIKey: "test-key", Model: "test-model", InterfaceType: "deepseek-chat"},
				TextOptions: canvasTextOptions{MaxOutputTokens: 128},
				AgentRequests: &agentToolRequests{ChatCompletion: map[string]interface{}{
					"messages": []interface{}{map[string]interface{}{"role": "user", "content": "create node"}},
					"stream":   stream,
				}},
				OnTextDelta:      func(delta string) { text.WriteString(delta) },
				OnReasoningDelta: func(delta string) { reasoning.WriteString(delta) },
			}, agentAdapter)
			if err != nil {
				t.Fatal(err)
			}
			if scenario == "sse_tools_json_content_type" {
				calls, _ := result["toolCalls"].([]interface{})
				if len(calls) != 1 {
					t.Fatalf("tool calls = %#v", result)
				}
				call := calls[0].(map[string]interface{})
				function := call["function"].(map[string]interface{})
				if call["id"] != "call_create" || function["name"] != "canvas_apply_ops" || function["arguments"] != `{"ops":[]}` {
					t.Fatalf("tool call = %#v", call)
				}
			} else if result["text"] != "ready" {
				t.Fatalf("text = %#v", result)
			}
			if scenario == "sse_text" && (text.String() != "ready" || reasoning.String() != "plan") {
				t.Fatalf("deltas: text=%q reasoning=%q", text.String(), reasoning.String())
			}
		})
	}
}
