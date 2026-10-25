# revision-recheck — 설계

## 영향받는 구성 요소

- **공유 형식(fold)**: `app/src/formats/fold.ts`, `cli/internal/formats/fold.go`, `types.ts`, `types.go`, 공유 fixture `schema/fixtures/fold/`.
- **CLI·MCP**: `doan comments`와 MCP `comments` 출력에 `lastResolution`이 저절로 붙는다(`read.go`의 `listedComment`가 `formats.Comment`를 포함한다). skill 본문 `cli/internal/cli/skill.md`에 한 줄을 더한다.
- **앱 main**
  - 확인 상태 저장소: 새 파일 `main/reviewState.ts`가 `<userData>/review-state.json`을 쓴다.
  - 프로젝트 댓글 읽기 IPC(아래 3절). `project-feedback`이 이것을 확장한다.
  - 메뉴: Go 메뉴의 Next/Previous Resolved Comment.
  - `comments/service.ts`, `comments/events.ts`: `edit-reopen` intent와 이벤트 2개짜리 attempt.
- **앱 renderer**
  - `CommentsPanel.tsx`: 해결 메타, Review 바, 알림, 상태 줄, 해결 카드 편집, Canvas changed, Comment on selection instead
  - `CommentsSession.ts`, `useComments.tsx`: 정렬, 확인 상태, 성공 처리, 포커스, 위치로 가기 표지
  - `CanvasController.ts`: 위치로 가기, 비선택 이동
  - `activity.ts`, `RightPanel.tsx`, `App.tsx`
  - `Home.tsx`, `homeCards.ts`, `ProjectOverview.tsx`

## 동작

### 1. 위치로 가기 (L-1, L-20)
- `CanvasController.locate(node, comment)`는 앵커 스냅샷의 노드 사각형으로 이동하고 강조한 뒤, `select-anchor`(`selectPathNow`) 경로로 선택한다.
  - 앵커 사각형은 프로토콜을 바꾸지 않아도 이미 있다. iframe 높이가 문서 전체이므로 `canvasScript.ts`가 매칭된 노드의 board 좌표 사각형을 보내고, `AnchorSnapshot.rects`에 해결된 댓글 것까지 있다.
  - 이동은 `fitFrame`과 같이 배율을 바꾸지 않는다. 화면만 옮겨 사각형을 가운데에 둔다(`locateView`). 사각형이 뷰포트보다 크면 위쪽 가장자리에 맞춘다.
- 이 경로는 핀 경로(`select-comment` → `hooks.open`)를 쓰지 않는다. 그래서 상태 필터가 Open으로 바뀌지 않는다. renderer는 "locate가 요청한 선택 정체성" 표지를 두고, 범위 맞춤 효과는 그 정체성과 같으면 건너뛴다. 이 표지는 `revision-continuity`의 `selectionIdentity` 규칙을 넓힌 예외이며, 결정 영향에 적는다.
- Review 단계의 이동은 `jumpToNode(node)`다. 화면 이동과 강조만 하고 선택은 하지 않는다(RR3). 트리 프레임 점프와 같은 규칙이다.

### 2. 해결 메타와 `lastResolution` (L-7, Q5, RR5①)
- fold 규칙
  - `reopen`: 해결 상태 댓글을 열면서 `lastResolution = {by: resolvedBy, at: resolvedAt, reopenedBy: event.by, reopenedAt: event.at}`을 둔다.
  - 다음 `resolve`: `lastResolution`을 지운다.
  - 이미 열린 댓글에 대한 `reopen`은 지금처럼 무시한다.
  - `delete`는 지금처럼 댓글을 숨긴다.
- Go는 포인터와 `omitempty`를 쓴다. ARCH §2 "optional keys omitted, never null"을 지킨다.
- 바뀌는 기존 fixture의 `expected.json`(5개): basic-lifecycle, shuffled-lines, delete-followups, human-unicode-tied-lifecycle, reopen-idempotent. 새 fixture는 `fold/reopen-cycles`(해결·다시 열기 여러 회), `fold/lastresolution-tie`(같은 시각)다.
- 카드
  - 해결 상태: "Resolved by <name> · <relative>"
  - 다시 열린 열린 댓글: "Reopened by <name> · <relative>"와 "Previously resolved by <name>"
- Resolved 목록은 `resolvedAt` 역순이고, 같으면 comment id 순이다.

### 3. 재확인 (N1, Q1, Q2, RR1–RR4)
- **확인 상태 저장소**
  - main 전용 파일 `review-state.json`: `{v:1, since, canvases: {"<root>\u0000<canvasId>": lastReviewedAt}}`.
  - renderer는 IPC로 읽고, 올리는 동작만 요청한다. main은 값을 올리기만 하고 내리지 않는다.
  - 처음 만들 때 `since`는 현재 시각이다. 처음 보는 (root, canvas id)의 기준은 `since`다. 기능을 처음 켤 때 과거 해결이 쏟아지지 않게 하기 위해서다.
  - 프로젝트를 제거하면 그 root의 항목을 지운다.
- **확인 대상 판정**: `toReview(comments, lastReviewedAt, self)`. 다음을 모두 만족하는 댓글이다.
  - 상태가 `resolved`다.
  - `resolvedAt > lastReviewedAt`이다.
  - `resolvedBy`가 현재 Git 이름의 사람(`kind: human`, name 일치)이 아니다(RR2).
- **프로젝트 댓글 읽기 IPC**: `comments:project(root)`. 새로 받은 `ls` 한 번의 캔버스 행 id들의 댓글 파일만 읽어 fold한다. 파일 집합을 다시 열거하지 않는다(ARCH §13). 결과는 캔버스 id별 열린 수, 확인 대상 수, 해결 목록 요약이다.
  - 파일 하나가 실패하면 그 캔버스만 오류로 둔다.
  - 무효화 신호가 오면 다시 읽고 요청 revision으로 늦은 응답을 버린다.
  - Home·Overview는 이 결과로 "N resolved to review"를 보인다. `project-feedback`은 갈 곳 잃은 파일을 이 IPC에 더한다.
- **Review 상태 기계**: `reviewState(fixed, cursor, extras)`. 동작은 `next | previous | reopen | done | close | arrived | changed`다.
  - `fixed`는 시작할 때의 확인 대상 집합으로, 해결 시각 오름차순이다.
  - 새로 도착한 해결은 `extras`로 끝에 붙는다.
  - 마지막 review 시각 올리기
    - Next: 지나간 단계의 `resolvedAt`
    - Done: `fixed`의 최대 `resolvedAt`
    - close(Esc, ×, 다른 캔버스로 이동): 지금까지 지나간 진행만 남긴다.
  - 단계 표시: 다시 열림이나 삭제는 그 단계에 표시하고 건너뛰게 한다. 대상이 없으면 이동하지 않는다.
- **UI**
  - 알림과 Review 바는 Comments 머리 바로 아래에 둔다. 머리 아래 배너 순서는 오류·id 안내 → 재확인 → 넘기기다. 각 배너는 한 줄이고 넘치면 말줄임한다.
  - Done 뒤 요약: "Reviewed N · Reopened M · Hand off…". Hand off…는 `agent-handoff` 대화상자를 열고, 다시 연 id들을 미리 체크하라고 넘긴다.
- **메뉴**: Go 메뉴 "Next Resolved Comment ⌘]", "Previous Resolved Comment ⌘[". `menu:state`에 `reviewing`을 더한다. 텍스트 입력과 충돌하는 키는 쓰지 않는다.

### 4. Activity와 하단 라벨 (L-7, T-10)
- Activity 종류: `opened | changed | reloaded | moved | resolved`.
  - `changed`: 리로드 전후의 캔버스 행 rev(`revision-continuity`)가 다르다.
  - `resolved`: 댓글을 다시 읽었을 때 open에서 resolved로 바뀐 것을 묶는다(해결자 이름 목록).
    - 첫 읽기와 `open()` 초기화는 기준선으로만 쓰고 기록하지 않는다.
    - 사람의 Resolve도 넣는다.
- Activity 키는 `revision-continuity`가 (root, canvas id)로 옮긴다.
- 하단 라벨: `bottomLabel(latest, now)`.
- 이 변경은 PRODUCT §7 2026-10-22 app-ui의 Updated/Activity 정의를 대체한다.

### 5. 사람의 Resolve·Reopen 성공 (L-9)
- 카드 변경이 성공하면 `mutations`를 `idle`로 돌린다. `saved`와 "No duplicate was added."는 상태 확인으로 확정된 경우에만 쓴다.
- 상태 줄 `{commentId, text}`는 4초 동안 남는다. 캔버스가 바뀌거나 문서가 교체되면 타이머를 정리한다.
- 포커스: `nextFocus(cards, removedId)` → 다음 카드 article(`tabIndex=-1`), 이전 카드, Comments 제목 순서다. Resolve 버튼 자체로는 보내지 않는다. Enter를 두 번 눌러 다음 댓글까지 해결되는 일을 막기 위해서다.

### 6. 해결된 댓글 편집 (L-10, Q4)
- 새 intent `{type: "edit-reopen", comment, body, expected}`.
  - edit 이벤트를 준비한다.
  - 그 줄을 더한 텍스트를 기준으로 reopen 이벤트를 `at + 1ms`로 이어서 준비한다.
  - 두 줄을 한 번의 append로 쓴다(ARCH §2 쓰기 규칙).
- `Attempt.events[]`로 일반화한다.
  - 두 id가 모두 있으면 saved, 모두 없으면 absent, 하나만 있으면 unknown이다.
  - 응답의 `event`는 첫 이벤트 id다.
  - 같은 request ID로 재시도하면 같은 두 이벤트를 쓴다.
- `project-feedback`의 `orphan` 요청 종류도 같은 검증 코드를 고친다. 그래서 이 작업이 먼저 들어간다.

### 7. Canvas changed (L-14, Q3)
- 라벨 "Canvas changed", title "The canvas changed after this comment was written."이다. 열린 카드에서는 중립 배지로 보이고, 해결 카드에서는 렌더하지 않는다. "Freshness unknown"도 같은 규칙을 따른다.

### 8. 사라진 대상 (L-16, Q6)
- 열린 댓글이고 Location unavailable일 때만 보인다.
- 현재 선택으로 같은 본문의 생성 초안을 시작한다. 기존 begin을 쓰고, 본문을 미리 채운다.
- 저장에 성공하면 삭제 확인 대화상자를 연다(기존 Delete 대화상자를 변형). 실패하면 원본은 그대로다.

## 순수 함수로 떼어낼 부분 (`/tdd` 대상)

- fold `lastResolution`(TS·Go 공유 fixture).
- `toReview`, `reviewState`.
- `sortResolved`, `resolutionText`, `reopenText`.
- `activityKind(prevRev, nextRev)`, `resolvedActivity(before, after)`.
- `bottomLabel(latest, now)`.
- `nextFocus(cards, removedId)`, `locateView(rect, viewport, view)`.
- `reviewSummary(result)`.
- service `prepareEditReopen`, `inspectAttempt(events[])`.

## 형식 변경

- 이벤트 스키마와 `v`는 바뀌지 않는다.
- fold 출력과 CLI `comments` 응답에 선택적 `lastResolution`을 더한다. ARCH §2의 fold Output과 §12를 갱신한다.
- 기기 로컬에 `review-state.json`(main 전용)을 더한다. ARCH §7에 기록한다.
- 내부 IPC: `comments:project`, review 상태 읽기·올리기, `edit-reopen` intent, `menu:state.reviewing`.

## 컨벤션 영향

- skill 규칙에 한 줄을 더한다: "An open comment with `lastResolution` was resolved before and reopened by a human; your previous change was not accepted — read the body again before applying." `doan check` 규칙은 바뀌지 않는다.

## 결정 영향

- 승인을 미룬 결정은 유지한다. 마지막 review 시각은 로컬의 본 표시이고, 공유하지 않는다. PRODUCT §7에 다음 문장으로 기록한다: "lastReviewedAt is a device-local seen marker, not approval; not shared, invisible to agents".
- PRODUCT §7 2026-10-22 Updated/Activity 정의는 대체한다(4절).
- PRODUCT §5 항목 5 comments-ui Q2(재부착 없음)는 유지한다. 8절은 사람이 명시적으로 하는 동작이다.
- PRODUCT §5 항목 5 comments-ui Q5(Outdated 계산)는 계산을 유지하고 표시만 바꾼다.
- `revision-continuity`의 범위 맞춤 규칙은 확장한다. 목록에서 시작한 locate 선택은 예외로 둔다.
- ARCH §2 쓰기 규칙: Save and reopen은 이벤트 2개를 한 번의 append로 쓴다.
- design-nav 결정 9(이동은 선택하지 않음)를 Review 단계에도 적용한다.

## POSTMORTEM에서 가져온 함정

- 2026-10-25 "Comment creation errors hid readable comments and outlived their document": 작업 오류와 읽을 수 있는 데이터를 분리하고, 각각을 문서 수명에 묶는다.
- 2026-10-25 "Navigation feedback read the previous React snapshot": 알림 계산은 동기 생산자가 쓴 상태를 콜백에 넘긴다.
- ux-audit L-9와 ARCH "Anchors and pins"의 사라지는 핀 포커스 규칙: 사라지는 동작 뒤에는 현재 유효한 위치로 포커스를 돌린다.

## 측정 의존

- PoC 의존은 없다. Home·Overview 수 계산 비용은 tasks 1에서 잰다. 기준을 넘으면 대안은 `ls` 행에 확인 대상 수 계산에 필요한 최대 `resolvedAt`을 싣는 것이다. 이 대안은 사용자와 정한다.

## 초안 요청 (2026-10-25 사용자, 링크 0)

- 캔버스: `design/revision-recheck.html`, canvas id `revision-recheck`, 폭 1440.
- 프레임 (id — 담을 상태):
  - `resolution-meta` — "Resolved by codex · 3 min ago"(절대 시각은 title), "Reopened by <name> · <상대 시각>"과 "Previously resolved by <name>", 해결 시각 역순 Resolved 목록, 열린 카드의 중립 "Canvas changed" 배지(해결 카드에는 없음).
  - `review-notice` — "3 resolved · Review"와 "3 resolved since your last review · Review"; 초안이 열려 있을 때 비활성 Review와 "Finish or cancel your comment to start Review."; 머리 아래 배너 순서(오류·id 안내 → 재확인 → 넘기기).
  - `review-bar` — "Review 1/2/3 of 3", 하나뿐일 때(Previous 없음), 마지막 단계 Done, Reopen 뒤 "Reopened", "Reopened by codex"·"Deleted" 단계, "Not found in the current canvas", extras로 늘어난 "2 of 4", 필터 줄 접힘, Go 메뉴 "Next Resolved Comment ⌘]"·"Previous Resolved Comment ⌘[".
  - `review-done` — "Reviewed 3 · Reopened 1 · Hand off…".
  - `status-lines` — "Resolved — moved to Resolved.", "Reopened — moved to Open.", "Reopened — moved to Open. Show".
  - `edit-reopen` — 해결된 댓글 편집기: "Save and reopen"(primary), "Save only", "Agents read open comments only.".
  - `missing-target` — "Comment on selection instead"의 활성과 비활성("Select an element or frame first."), "Delete the original comment?" 대화상자 [Keep both] [Delete original].
  - `activity-label` — Activity 종류 Opened·Changed·Reloaded·Moved·"Resolved 2 · codex, Kim Doe", 하단 라벨 네 가지와 날짜가 붙은 경우.
  - `home-counts` — Home 행과 Overview 카드의 "N resolved to review", 요약 줄 "2 open · 1 resolved to review"의 넓은 폭과 좁은 폭. 셋째 항목 "· 3 without a canvas"는 `project-feedback` 초안이 더한다.
- `/design-sync` 비교 대상: `review-notice`, `review-bar`, `review-done`(새 표면). 나머지 프레임의 이미 main에 있는 화면(카드, Activity, Home, Overview)은 코드와 `docs/DESIGN.md` 그대로 옮기고, 바뀌는 부분만 그린다.

### 초안 확정 (2026-10-25, 링크 0 지휘자 검토)

- 초안 `design/revision-recheck.html`을 확정했다. 사용자가 확정을 지휘자에게 맡겼다. 초안은 comments-readability가 반영된 화면 위에 그렸다.
- Done 요약에는 닫기 ×가 있다. 새 재확인 알림이 뜨거나 캔버스·root가 바뀌면 사라진다. 다시 연 댓글이 0개면 "Reviewed 3"만 보이고 Hand off…는 없다.
- Review 단계에서 Reopen을 누르면 "Reopened"가 보이고 Reopen과 Edit and reopen…은 사라진다. Previous와 Next는 그대로다.
- 해결 메타의 상대 시각은 shipped `relativeTime`(Intl 긴 형식, 예: "3 minutes ago")을 쓴다. spec의 "3 min ago"는 예시다.
- 머리 아래 배너 순서는 오류·canvas ID 블록 또는 이전 id 안내(project-feedback) → 재확인 알림이다. "Handed off …"는 배너가 아니라 머리 도구 줄에 있다(agent-handoff).
- 초안 제안을 그대로 쓴다: Review 바는 sticky 제목 아래 `top: 37px`에 붙는다. Activity 시각 열은 `flex: none`이다. Overview 카드 메타는 항목 사이에서 줄바꿈한다. Home 행이 좁으면 요약 전체가 브랜치 아래 줄로 내려가 항목 사이에서 줄바꿈한다. "resolved to review"는 `--text-2`다. Delete original은 `--err`이고 Keep both에 처음 포커스가 간다. 날짜가 붙은 하단 라벨은 "Changed Oct 24 18:40" 형식이다. 알림의 Review는 보조 버튼, Next와 Done은 primary다. × 이름은 "Close Review"와 "Close summary"다.
