# revision-continuity — 설계

## 영향받는 구성 요소

- **앱 main**:
  - `watch.ts`: `design/` 이벤트의 파일 이름을 refresher에 누적한다.
  - `shell.ts`: 이름으로 servedRev를 올릴지 정하고, 행별 rev를 관리한다.
  - `thumbnails.ts`: 행 rev가 바뀐 캔버스를 다시 확인한다.
  - `view.ts`: `CanvasRow`에 `rev`를 싣는다(IPC 전용).
  - `uiState.ts`: `canvasId`를 검증한다.
  - 선택 IPC는 기존 `selection:set`을 쓴다.
- **앱 renderer**:
  - `canvasView.ts`: `canvasViewUpdate`에 `moved`와 행 rev 기반 reload를 넣는다.
  - `CanvasController.ts`: `moved` 처리, Esc·빈 여백, 막힌 초안 중 같은 캔버스 선택 변경, 앵커 pending을 맡는다.
  - `selection.ts`: 선택 정체성을 정한다.
  - `activity.ts`: `moved` 종류를 더한다.
  - `Sidebar.tsx`: 펼침과 포커스 행 키를 옮긴다.
  - `App.tsx`: 중복 id 안내, ui-state 저장을 맡는다.
  - `CommentsSession.ts`·`useComments.tsx`·`CommentsPanel.tsx`: 이어 쓰기, rename, 범위 유지, 위치 표시를 맡는다.
  - `app/src/comments/draft.ts`: 막힌 이유를 구분하고 이어 쓰기를 처리한다.
- **복원**: `app/src/restore/restorePlan.ts`, `app/src/restore/uiState.ts`.
- **CLI·MCP·skills·공유 형식**: 바뀌지 않는다.
- **기기 로컬 상태**: `ui-state.json`의 최상위 항목에 선택적 `canvasId`를 더한다. `lastByRoot`는 바꾸지 않는다. main이 kebab id 정규식으로 검증하고, `canvas`가 함께 있을 때만 받는다. 잘못된 값은 그 필드만 버린다.

## 원칙: 캔버스 단위 기기 로컬 상태의 키

캔버스 단위로 기억하는 기기 로컬 상태는 (root, canvas id)를 키로 쓴다. 경로는 표시용이다. 이 기능에서는 ui-state 복원과 Activity 이동에 적용한다. 다음 기능의 상태도 이 원칙을 따른다:

- `revision-recheck`: 캔버스별 마지막 확인 시각, Review 진행 상태
- `agent-handoff`: "Handed off" 표시

이 상태들은 `moved`와 `CommentsSession.rename`을 지나도 유지되어야 한다.

## 동작

### 1. 막힌 새 댓글 이어 쓰기 (L-2, R1)
- `transitionDraft`의 `document-lost`에 이유를 붙인다.
  - 초안 origin의 root·canvas id가 현재 session identity의 root·canvas id와 같으면 `reloaded`, 다르거나 identity가 없으면 `unavailable`이다.
  - 로딩 중(`state.status === "loading"`)에 불린 `documentLost`는 일단 `reloaded`로 둔다. 리로드가 실패나 폭 없음으로 끝나면 버튼은 비활성으로 남는다(새 문서 없음).
- 이어 쓰기는 `CommentsSession.continueDraft(scope)`라는 새 메서드다. 기존 `create()`는 초안이 있으면 바로 반환하므로 따로 둔다.
  - `scope`는 원래 초안 target의 종류다. frame이나 element가 있으면 `selection`, 없으면 `canvas`다. "Continue on canvas"는 `canvas`를 명시해서 부른다.
  - begin은 `create()`와 같은 `beginRevision` 펜스를 쓰고, `documentLost`·연타·늦은 완료를 무효화한다.
  - 막힌 초안이 있는 동안 main의 draft guard는 true로 유지된다. 이어 쓰기는 false를 보내지 않는다. 성공하면 `setCommentDraftGuard(true)`를 다시 확인한 뒤 `beginRevision`이 같을 때만 초안을 바꾼다. 실패하거나 무효화되면 막힌 초안이 그대로 남는다.
  - 성공 시점의 본문(진행 중 편집 포함)을 새 초안으로 옮긴다.
- 활성 조건은 다음 넷을 모두 만족할 때다. 이유는 막힌 초안의 `reloaded`, 요청 없음, 저장 상태 확정이다.
  - `createBlocked`가 없다(새 문서가 있음).
  - 선택을 다시 찾는 중(`reanchor !== null`)이 아니다.
  - 작성자 정보가 ready다.
  - 선택 범위라면 선택이 있다.
- **같은 캔버스 선택 변경의 가드 예외**: 초안이 `reloaded`로 막힌 생성 초안이면, 컨트롤러의 선택 변경 경로(캔버스 클릭, 트리 Select, 상위 경로, 핀, 빈 여백·Esc)는 가드를 거치지 않는다. 다른 캔버스·root·Home·Reload·프로젝트 제거·종료는 지금처럼 가드한다. 막힌 초안은 저장할 수 없고 본문은 남기 때문에 데이터 손실이 없다.
- 표시: 버튼은 별도 `key`를 가진 요소로 렌더한다(Save와 같은 DOM 노드를 재사용하지 않는다). 성공하면 포커스를 textarea 끝으로 옮긴다.

### 2. 이름으로 리로드 판정 (L-2, R3)
- `watch.ts`의 `design/` target은 `{reread, served, names}`를 넘긴다. `createRefresher`는 debounce와 대기 중인 실행 사이에 names를 합집합으로 누적한다. 하나라도 `null`이면 "모름"이 된다.
- `shell.ts`는 **읽기 전에** 판정한다. names가 모두 다음을 만족하면 servedRev를 올리지 않는다:
  - `design/` 상대 경로가 `.html`(대소문자 무시)로 끝난다.
  - 점으로 시작하는 경로 구간이 없다.

  이 기준은 CLI 목록 규칙(`cli/internal/repo/files.go`)과 같다. 대신 이름별 `rev`를 올린다(`Folder.canvasRevs: Map<path, number>`, 읽기와 무관하게 유지).
- 다음 경우에는 무조건 servedRev를 올린다:
  - names가 "모름"
  - HTML이 아닌 이름
  - 루트 watcher의 `design` 이벤트
  - rearm SERVED
  - served target

  폐기된 읽기에서도 bump를 잃지 않는다(기존 `shell.ts` 주석의 규칙).
- `CanvasRow.rev`는 그 경로의 rev다. `canvasViewUpdate`의 reload 조건은 "servedRev가 바뀌었거나 열린 행의 rev가 바뀌었다"이다. 썸네일은 servedRev 변화 또는 행 rev 변화로 그 캔버스를 다시 확인한다.
- 측정 의존: 에이전트 도구가 임시 이름에 쓰고 rename하면, 임시 이름(HTML이 아닌 이름)이 섞여 bump가 일어난다. tasks 1의 측정 결과가 이 경우라면 이 절을 다시 정한다. 예: 임시 이름 패턴을 판정에서 빼기. 이렇게 정할 때 Q1을 다시 확인한다.

### 3. 같은 id 따라가기 (L-4, R2)
- `canvasViewUpdate(prev, next, open)`은 열린 행의 id를 `open.row.id`에서 읽는다. 결과는 다음과 같다.
  - `{ kind: "moved", canvas, from }`: 열린 경로가 목록에 없고, id가 있으며, 같은 id 행이 하나다.
  - `{ kind: "clear", reason: "duplicateId", count }`: 같은 id 행이 둘 이상이다.
  - 지금의 `clear: missing`: 같은 id 행이 없다.
- 같은 경로에서 id가 바뀐 경우는 reload로 처리하되 선택을 지운다(`SelectionTrigger`에 `idChanged`를 더한다).
- 컨트롤러는 `moved`를 받으면 먼저 세션에 따라갈 수 있는지 묻는다. 세션에 `pending`·`busy`·`cardPending`·`deleteConfirmation`이 있으면 `clear: missing`으로 처리한다(R2). 따라갈 수 있으면 다음을 바꾼다.
  - `state.open`과 `state.shown`의 경로·행을 바꾼다(`openCanvas` no-op 판정을 위해).
  - 뷰를 유지한다.
  - 기존 재앵커 경로로 선택을 다시 찾는다. 재앵커를 기다리는 동안 `syncMain`은 새 경로와 기존 선택자로 `selection:set`을 보낸다(지금의 reload와 같은 동작).
  - Activity 항목의 키를 새 경로로 옮기고 `moved`를 추가한다.
  - 트리의 펼침 상태, active·focused 행 키, `ui-state` expanded를 새 경로로 옮긴다. 다른 폴더로 옮겨졌으면 새 조상을 펼친다.
- `CommentsSession.rename(path)`는 identity의 path를 바꾼다. 요청 없는 편집 초안이면 `draftIdentity`의 path도 바꾼다. 그다음 `revision`을 올리고 다시 읽는다. 이렇게 해서 옛 경로의 진행 중 read가 결과를 덮어쓰지 못하게 한다. 목록·필터·앵커는 유지한다. `useComments`의 open 효과는 root·id가 같고 path만 다르면 rename을 부르고, 필터와 앵커를 초기화하지 않는다.
- 생성 초안은 문서가 바뀌므로 1번(`reloaded`)으로 막힌다.
- 중복 id는 `canvasRemoved` 콜백에 이유를 넘겨 토스트와 캔버스 영역 문구를 바꾼다.

### 4. 재시작 복원 (Q2)
- ui-state 저장 시 최상위 `canvasId`에 `state.open.row.id`를 넣는다.
- `restorePlan`은 저장된 `canvasId`가 있으면 그 id의 행을 먼저 찾는다. 하나면 그 행을 복원하고(경로가 같든 다르든), 둘 이상이면 Overview와 중복 id 안내를 보인다. 없으면 경로로 찾는다(기존 동작). `canvasId`가 없는 이전 파일은 기존대로 경로로 찾는다.

### 5. 범위 유지 (L-13)
- `selectionIdentity(selection)`의 키는 다음과 같다. 경로는 넣지 않는다.
  - 요소: root + canvas id + (doanId가 있으면 doanId, 없으면 selector)
  - 프레임: root + canvas id + frame id
- `useComments`의 범위 맞춤 효과는 이 키가 바뀔 때만 실행한다. 선택이 null이 되면 지금처럼 Canvas로 전환한다.

### 6. Esc·빈 여백 (L-17)
- `shouldGuardEscape()`는 선택이 있거나 재앵커를 기다릴 때만 true다.
- `keydown`의 `if (this.inputGuard) event.preventDefault()`를 `if (this.inputGuard && this.shouldGuardEscape())`로 바꾼다(POSTMORTEM 2026-10-23: 초안을 가드할 때만 기본 동작을 막는다).
- `escape()`는 가드가 필요 없으면 `transition()`을 거치지 않는다. 그래도 `transitionIntent`는 올려서 대기 중인 Open 취소 효과를 유지한다.
- 빈 여백 클릭도 같은 함수를 쓴다.
- 이 변경은 ARCH §3 "Transitions"의 "selection/path/pin/blank/Escape … wait" 문장을 바꾸므로 승격 대상이다.

### 7. 위치 표시 (W-9, T-11)
- 렌더 문서가 없을 때: `missingLocations`는 현재 문서의 앵커 스냅샷이 있을 때만 계산한다. 폭 없음, 로드 실패, 목록에 없는 문서에서는 빈 집합이다. 대상 줄은 텍스트로 보인다.
- 리로드 중(측정에서 재현될 때만): 앵커 스냅샷에 `pending`을 둔다. 새 문서가 응답할 때까지 `missingLocations`와 Selection 목록 노드는 이전 값을 유지한다. 핀은 지금처럼 새 레이아웃 뒤에 다시 그린다.

## 순수 함수로 떼어낼 부분 (`/tdd` 대상)

- `classifyDesignChange(names)`: `{bumpServed, revPaths}`를 돌려준다. 다음 경우를 다룬다.
  - null, HTML 아님, `.HTML` 대문자, `.htm`, 점 구간, 하위 경로
  - 이름 정규화(`design/` 접두)
  - 생성·삭제·rename 쌍
- `createRefresher`의 names 누적: debounce 병합, 실행 중 도착, null 유지.
- `canvasViewUpdate(prev, next, open)`: 다음 경우를 다룬다.
  - moved(0/1/2+)
  - 행 rev reload
  - servedRev reload
  - 열린 행에 id 없음
  - 이동과 width 변경이 동시에 일어남
  - 이전 entry가 list가 아님
  - 같은 경로의 id 변경
- `transitionDraft`: `document-lost`의 이유, 이어 쓰기 교체(본문 보존, 요청 중 무시).
- `continueEnabled(draft, state)`: 이유별 비활성.
- `guardsSelectionChange(draft, destination)`: 같은 캔버스 선택 변경의 예외.
- `selectionIdentity(selection)`.
- `shouldGuardEscape(selection, reanchor)`.
- `parseUiState`의 `canvasId`: 없음, 잘못된 값, `canvas` 없이 단독으로 있음.
- `restorePlan(state, entries)`: id 0/1/2+, 경로는 같고 id가 다름, id 없는 이전 형식, width가 null인 행.

## 형식 변경

- 공유 JSON Schema 변경은 없다.
- 기기 로컬 `ui-state.json`의 최상위에 선택적 `canvasId`를 더한다. ARCH §7 "Navigation persistence and IPC"의 형식 줄을 갱신한다.
- IPC의 `CanvasRow`에 `rev`를 더한다. 내부 전용이다.

## 컨벤션 영향

- ARCH §1 컨벤션과 `doan check` 규칙은 바뀌지 않는다. skill 규칙 H("id를 바꾸지 않는다")를 유지한다.

## 결정 영향

- **Document origin(ARCH §3)**: 유지한다. 이어 쓰기는 사람이 누르는 새 begin이다.
- **Live reload(ARCH §13 "Changes carry two flags…", "Any change in the open folder's served files reloads the open canvas, including another canvas's file.")**: 다른 캔버스 HTML의 변경은 리로드에서 뺀다. 받아들이는 위험(공유 HTML 셸)을 함께 기록한다.
- **썸네일 캐시(ARCH §3 "Signatures are computed once per root/servedRev")**: 행 rev도 다시 확인하는 기준이 된다.
- **Selection lifetime(ARCH §3)**: 같은 id의 이동은 같은 캔버스의 재로드로 정의한다. 같은 경로의 id 변경은 다른 캔버스로 본다.
- **Transitions(ARCH §3)**:
  - Esc·빈 여백은 바뀌는 것이 없으면 가드하지 않는다.
  - `reloaded`로 막힌 생성 초안이 있는 동안 같은 캔버스 선택 변경은 가드하지 않는다(PRODUCT §5 항목 5 "Controllable selection/navigation … offer Save, Discard or Keep writing"의 예외).
- **PRODUCT §5 항목 3** "An open canvas removed from the list returns to Overview with a toast; a saved canvas missing at restart does the same": 같은 id는 따라간다.
- **PRODUCT §5 항목 4** "Reload reanchors the same canvas…": 이동을 재로드에 포함한다.
- **PRODUCT §7**: 2026-10-25 design-nav의 줄(제거된 캔버스 → Overview, 복원 대체)을 대체하는 새 결정 줄을 둔다.

## POSTMORTEM에서 가져온 함정

- 2026-10-25 "Comment creation errors hid readable comments and outlived their document": 이어 쓰기는 begin마다 문서 수명에 묶고, 쓸모없어진 완료가 guard를 풀지 않게 한다. 검색어는 `cancelBegin|beginRevision|documentLost|setCommentDraftGuard`다.
- 2026-10-23 "Draft guards changed existing transition timing": 초안이 없을 때 동기 반환을 유지하고, Escape 기본 동작은 가드할 때만 막는다.
- 2026-10-25 "Navigation feedback read the previous React snapshot": `moved` 판정에 쓴 목록을 콜백에 넘기고, 경로 부재와 정체성 교체를 따로 테스트한다.
- 2026-10-25 "A canvas reload detached the frame between a poll's lookup and evaluation": e2e 폴링은 iframe 교체를 지나는 동안 실패한 관찰을 재시도한다.
- 2026-10-22 "Filtering root fs.watch events by names…", "A served directory wiped and rebuilt…": 루트 삭제와 delete-and-recreate 테스트를 유지하고, 이름 판정은 `design/` target에서만 한다.

## 측정 의존

- PRODUCT §6에는 파일 감시 PoC가 없다. 2절의 이름 판정은 macOS recursive `fs.watch`가 실제로 주는 filename에 의존한다. tasks 1에서 다음 방식으로 저장할 때의 (watch path, filename) 원시 로그를 측정한다:
  - Claude Code Write·Edit
  - Codex apply_patch
  - `mv`
  - `git checkout`
  - atomic rename
