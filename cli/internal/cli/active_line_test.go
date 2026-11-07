package cli

import (
	"strconv"
	"strings"
	"testing"
)

func TestActiveAndOnboardingResponseLineCap(t *testing.T) {
	root := realPath(t, initialized(t))
	for _, command := range []string{"active", "onboarding"} {
		for _, length := range []int{maxResponseLine, maxResponseLine + 1} {
			t.Run(command+"/"+strconv.Itoa(length), func(t *testing.T) {
				success := `{"v":1,"ok":true,"result":{}}`
				if command == "onboarding" {
					success = fixtureReply(t, "status-completed")
				}
				app := &fakeApp{requests: make(chan map[string]any, 1), respond: reply(strings.Repeat(" ", length-len(success)-1) + success)}
				ctx := activeContext(t, root, app.dial(t))
				var failure *Error
				if command == "active" {
					_, failure = Active(ctx, Flags{Repo: root}, nil)
				} else {
					_, failure = Onboarding(ctx, Flags{Session: "s_1", Given: map[string]bool{"session": true}}, []string{"status"})
				}
				if length <= maxResponseLine {
					if failure != nil {
						t.Fatalf("accepted-size response failed: %v", failure)
					}
				} else if failure == nil || failure.Code != "internal_error" || !strings.Contains(failure.Message, "longer than 64 KiB") {
					t.Fatalf("oversized response was not rejected by the line cap: %v", failure)
				}
			})
		}
	}
}
