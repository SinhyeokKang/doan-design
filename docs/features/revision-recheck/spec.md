# revision-recheck — 수정본에서 처리된 것을 보고 하나씩 확인한다

근거: [ux-audit-261025-2 보고서](../ux-audit-261025-2/report.md)의 L-1, L-7, L-9, L-10, L-14, L-16(행동), L-20, 제안 N1과 리뷰 W-4·W-5·W-6·W-7, A-1·A-5·A-6·A-7·A-11, T-1·T-6·T-7·T-10·T-15, P-1·P-3·P-8. 원 근거는 `.scratch/ux-audit/loop-261025-2/`(S1 #20–#28, S2 #3–#6, #19, #101)에 있다.

선행 기능은 두 가지다.
- `revision-continuity`: 행 rev, 선택 정체성, Activity `moved`, (root, canvas id) 키 원칙, `CommentsSession.rename`
- `comments-readability`: `targetLabel`, 포커스 규칙

## 사용자

- **사람**: 에이전트에게 피드백을 넘긴 뒤 돌아와서 무엇이 처리됐는지 보고, 댓글마다 결과를 확인하는 사람이다. 만족하지 않으면 다시 연다.
- **에이전트**: `doan comments`(CLI·MCP)가 다시 열린 댓글에 직전 해결 정보(`lastResolution`)를 붙여 준다. skill은 이 댓글을 "이전 적용이 받아들여지지 않은 것"으로 다루라고 안내한다.

## 문제 (관찰한 사실)

1. **위치로 가기가 긴 캔버스에서 동작하지 않는다(L-1).**
   - 화면 밖에 있는 열린 댓글의 대상 줄을 눌러도 아무 일이 없다(S2 #3, board transform이 그대로다).
   - 해결된 댓글은 선택만 되고 화면이 움직이지 않는다.
   - 해결된 카드에서 위치로 가면 범위가 Selection으로 바뀌어 다른 해결 카드가 목록에서 사라진다(S1 #23).
2. **누가 언제 해결했는지 보이지 않는다(L-7).**
   - 해결 카드에는 작성자와 작성 시각만 있다(S1 #22, #28).
   - Resolved 목록은 작성 순서라서 1회차 해결과 2회차 해결을 구분할 수 없다.
   - 다시 열면 해결 기록이 지워진다(`app/src/formats/fold.ts:126-130`).
3. **수정본이 도착해도 알 수 없다(L-7).**
   - "Updated"는 캔버스를 열기만 해도 뜬다(S1 #5).
   - Activity는 Opened와 Reloaded만 있어서 에이전트 수정, 사람의 ⌘R, 다른 파일 변경이 모두 같은 항목으로 남는다(S2 #15, #18).
   - 창을 숨긴 사이나 앱을 끈 사이에 해결된 것은 알림 없이 반영된다(S2 #19, #101).
   - Home은 열린 댓글 수만 보인다. 그 수가 0이면 "모두 해결되어 재확인을 기다림"과 "댓글 없음"이 똑같이 보인다(S1 #25).
4. **사람이 Resolve·Reopen한 뒤의 피드백이 맞지 않다(L-9).**
   - 카드가 확인 없이 목록에서 사라지고 포커스는 `<body>`로 간다.
   - 해결 카드에는 저장 복구용 문구 "Comment saved — … No duplicate was added."가 남는다(S2 #5).
5. **해결된 댓글을 고쳐도 에이전트에게 닿지 않는다(L-10).** Edit는 되지만 상태는 Resolved로 남는다. 에이전트는 열린 댓글만 읽는다(S2 #6과 `doan comments` 출력).
6. **Outdated가 신호 역할을 못 한다(L-14).** 수정이 한 번 들어오면 모든 댓글이 경고색 Outdated가 된다(S2 #15). 해결 카드라면 캔버스가 바뀐 것이 정상 결과인데도 경고로 보인다(S1 #22).
7. **대상이 사라진 댓글은 지우고 새로 쓰는 수밖에 없다(L-16).** 대상을 다시 지정하지 않는 것은 결정 사항이다(PRODUCT §5 항목 5, comments-ui Q2).

## 완료 조건

### 위치로 가기
- 카드의 대상 줄을 누르면 대상이 화면 밖이어도 그 대상을 선택한다. 화면은 그 대상으로 옮겨 가 1.2초 동안 강조한다(트리 이동과 같은 강조).
- 열린 댓글과 해결된 댓글이 같은 방식으로 동작한다.
- 범위·상태 필터는 바뀌지 않는다.

### 해결 기록
- 해결 카드에는 "Resolved by <name> · <상대 시각>"이 보인다(절대 시각은 title). 에이전트면 런타임 이름(`claude-code`, `codex`)을 보인다.
- Resolved 목록은 해결 시각의 역순이다.
- 다시 열린 댓글의 카드에는 "Reopened by <name> · <상대 시각>"과 그 아래 "Previously resolved by <name>"이 보인다.
- 다시 열린 열린 댓글에 대해 `doan comments --json`이 `lastResolution: {by, at, reopenedBy, reopenedAt}`을 낸다. 그 댓글이 다시 해결되면 이 필드는 사라진다.

### 재확인(Review)
- 확인 대상은 마지막 review 이후 해결된 것 가운데 현재 Git 이름이 아닌 사람이나 에이전트가 해결한 것이다.
- 확인 대상이 있으면 Comments 머리에 알림이 뜬다.
  - 처음 보는 캔버스: "3 resolved · Review"
  - 그 밖: "3 resolved since your last review · Review"
  - 창을 숨겼다 열거나 재시작한 뒤에도 같은 기준으로 다시 보인다.
- Review를 누르면 Comments 머리 아래에 고정 Review 바가 뜨고, 목록 필터 줄은 접힌다.
  - 바에는 "Review 2 of 3"(`role="status"`), 대상(`targetLabel`), 본문 발췌 두 줄, "Resolved by codex · 3 min ago", [Previous] [Reopen] [Edit and reopen…] [Next](primary), 닫기 ×가 있다.
  - 마지막 단계에서는 Next가 Done이 된다. 첫 단계에서는 Previous가 비활성이고, 하나뿐이면 Previous가 없다.
  - 단계를 옮기면 그 대상으로 화면을 옮겨 강조하지만, 선택·Inspector·`doan active`·초안은 바꾸지 않는다.
  - Reopen을 누르면 그 단계에 "Reopened"를 보이고 Next를 그대로 둔다. Edit and reopen…은 Save and reopen 편집기를 연다.
- 키보드
  - Go 메뉴의 "Next Resolved Comment ⌘]"와 "Previous Resolved Comment ⌘["는 Review 중에만 활성이다.
  - Esc는 대화상자 → 편집기 → Review 닫기 → 선택 해제 순서로 처리한다.
  - 단계를 옮기면 포커스가 Next로 간다. Review를 닫으면 포커스는 알림의 Review 버튼으로, 그 버튼이 없으면 Comments 제목으로 간다.
- 마지막 review 시각
  - Next로 지나간 단계의 해결 시각까지 올라가고, Esc로 닫아도 그 진행은 남는다.
  - Done은 Review를 시작할 때 고정한 집합의 끝까지 올린다.
  - Review 중에 새로 도착한 해결은 집합 끝에 붙어 "2 of 4"로 늘어나지만, Done의 범위에는 들어가지 않는다.
- Review 중 상태가 바뀌는 경우
  - 다시 열렸거나 삭제됐으면 그 단계에 "Reopened by codex"나 "Deleted"를 보이고 Next만 남긴다.
  - 대상을 찾을 수 없으면 이동하지 않고 "Not found in the current canvas"를 보인다.
  - 리로드되거나 캔버스가 이동하면 comment id로 같은 단계를 유지한다.
  - 다른 캔버스나 Home으로 가면 Review를 끝낸다. 지나간 진행은 남는다.
- 초안이 열려 있으면 Review 버튼을 비활성으로 두고 "Finish or cancel your comment to start Review."를 보인다.
- Done을 누르면 바 자리에 "Reviewed 3 · Reopened 1 · Hand off…"가 남는다. Hand off…는 다시 연 댓글을 미리 체크한 상태로 `agent-handoff` 대화상자를 연다.
- Home 행과 Overview 카드에 "N resolved to review"가 보인다. Home 요약 줄의 순서는 "2 open · 1 resolved to review · 3 without a canvas"이고, 좁으면 둘째 줄로 내려간다.

### Activity와 하단 라벨
- Activity는 다음을 구분한다.
  - 열기 "Opened"
  - 캔버스 행 rev가 바뀐 리로드 "Changed"
  - 바뀌지 않은 리로드 "Reloaded"
  - 이동 "Moved"(`revision-continuity`)
  - 해결 "Resolved 2 · codex, Kim Doe"
- 하단 라벨은 최신 항목에 따라 "Opened HH:MM", "Changed HH:MM", "Reloaded HH:MM", "Moved HH:MM" 가운데 하나를 보인다. 날짜가 오늘이 아니면 날짜를 붙인다.

### 사람의 Resolve·Reopen
- 성공하면 카드 자리에 4초 동안 상태 줄 "Resolved — moved to Resolved." 또는 "Reopened — moved to Open."이 `role="status"`로 남는다.
- 포커스는 다음 카드의 article로 간다. 다음 카드가 없으면 이전 카드, 그것도 없으면 Comments 제목으로 간다.
- 에이전트의 해결로 포커스가 있던 카드가 사라질 때도 같은 규칙을 따른다.
- "No duplicate was added." 문구는 상태 확인을 거친 복구 경로에서만 보인다.

### 해결된 댓글 편집
- 해결된 댓글 편집기의 기본 버튼은 "Save and reopen"이고 보조 버튼은 "Save only"다. 안내 문구는 "Agents read open comments only."다.
- Save and reopen은 edit와 reopen을 한 번의 append로 쓴다. 저장 뒤에는 `doan comments`에 다시 나타나고 "Reopened — moved to Open. Show"가 보인다.

### Canvas changed
- Outdated는 "Canvas changed"로 이름을 바꾸고 title "The canvas changed after this comment was written."을 단다.
- 열린 카드에서는 중립색으로 보이고, 해결 카드에서는 보이지 않는다. 계산 방식은 그대로다.

### 사라진 대상
- 열린 댓글이 Location unavailable이면 카드에 "Comment on selection instead"가 있다.
  - 선택이 없으면 비활성이고, 이유 "Select an element or frame first."를 버튼에 연결한다.
  - 누르면 같은 본문으로 새 댓글 초안이 열린다. 작성자는 현재 Git 이름이다.
  - 저장되면 확인 대화상자가 뜬다. 제목은 "Delete the original comment?", 본문은 "Your text was saved as a new comment on <target>.", 버튼은 [Keep both] [Delete original](destructive)이다.

## 범위 밖

- 승인(approval). MVP 이후로 미룬 결정(PRODUCT §5)을 유지한다. 마지막 review 시각은 기기 로컬의 "본 표시"일 뿐이고, 저장소에 기록하지 않으며 다른 사람과 에이전트에게 보이지 않는다. Accept, Approve, Checked라는 말은 쓰지 않는다.
- 전후 비교 화면과 스크린샷. 미룬 결정(PRODUCT §5 Deferred)을 유지한다.
- 넘기기 대화상자의 내용과 문구(`agent-handoff`), 대상 표시 문구(`comments-readability`), 리로드 중 초안·범위 유지(`revision-continuity`), 프로젝트 피드백 목록과 갈 곳 잃은 댓글(`project-feedback`)은 다른 기능에서 다룬다.

## 받아들이는 위험

- 다른 기기의 해결이 git pull로 늦게 들어와 그 해결 시각이 마지막 review 시각보다 이르면 확인 대상에 들지 않는다.
- 토큰 CSS만 바뀐 리로드는 캔버스 행 rev가 그대로라서 "Reloaded"로 보인다.

## 결정 (2026-10-25 사용자)

- Q1: 수정 도착 알림과 Review 단계를 둔다.
- Q2: 확인 기준은 캔버스별 마지막 review 시각(기기 로컬)이다. Home·Overview에 수를 보인다.
- Q3: Outdated는 계산을 유지하고 이름과 색만 바꾼다.
- Q4: 해결된 댓글 편집기의 기본 버튼은 Save and reopen이다.
- Q5: fold 출력과 CLI `comments`에 `lastResolution`을 더하고 skill을 한 줄 고친 뒤 agent-eval로 측정한다.
- Q6: Location unavailable 카드에 "Comment on selection instead"를 둔다.
- 리뷰 RR1: Next와 Esc는 지나간 단계까지만 올리고, Done은 시작 때 고정한 집합의 끝까지 올린다.
- 리뷰 RR2: 현재 Git 이름으로 해결한 것은 확인 대상에서 뺀다.
- 리뷰 RR3: Review 단계는 화면 이동과 강조만 하고 선택은 바꾸지 않는다(design-nav 결정 9와 같은 규칙).
- 리뷰 RR4: 고정 Review 바와 ⌘]/⌘[ 메뉴를 쓰고, Esc 우선순위를 정한다.
- 리뷰 RR5: `lastResolution`의 정의, review 동사, 행 rev 기준 Changed, main 전용 확인 상태, Done 뒤 넘기기 연결 등은 design대로 한다.
