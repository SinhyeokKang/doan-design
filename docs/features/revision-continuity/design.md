# revision-continuity — 설계

## 영향받는 구성 요소

- **앱 renderer**: `CanvasController.ts`(폴더 갱신 처리, Esc·빈 여백, 앵커 스냅샷), `canvasView.ts`(`canvasViewUpdate`), `CommentsSession.ts`·`useComments.tsx`·`CommentsPanel.tsx`(다시 시작, 범위 유지, 위치 표시), `comments/draft.ts`(막힌 원인 구분), `restore/restorePlan.ts`·`restore/uiState.ts`.
- **앱 main**: `watch.ts`·`shell.ts`(Q1: 변경 경로를 분류해 servedRev를 올릴지 정한다), 선택 IPC(경로 갱신)는 기존 `selection:set`을 그대로 쓴다.
- **CLI·MCP·skills·공유 형식**: 바뀌지 않는다. `doan active`는 앱이 보낸 새 경로를 그대로 돌려준다.
- **기기 로컬 상태**: `ui-state.json`의 `lastByRoot`·현재 항목에 선택적 `canvasId`를 더한다. 공유 형식(ARCH §11)이 아니라 main이 검증하는 기기 로컬 파일이다. 없는 값은 지금처럼 경로만으로 복원한다.

## 동작

### 1. 막힌 새 댓글 다시 시작 (L-2)
- `transitionDraft`의 `document-lost`는 지금처럼 생성 초안을 막는다. ARCH "Document origin"을 유지하며, 막힌 초안을 다른 문서에 자동으로 다시 묶지 않는다.
- 막힌 이유를 종류로 구분한다: `reloaded`(같은 canvas id의 새 문서), `unavailable`(문서·대상 없음). `reloaded` 문구는 "The canvas reloaded while you were writing. Start again on this version to keep your text."이다.
- **Start again on this version**(편집기의 primary 자리, 막힌 생성 초안에만 표시): 세션이 원래 범위로 새 `commentsBegin`을 요청한다. 성공하면 새 origin·target·hash로 초안을 다시 만들고 본문을 옮긴다. 이전 초안의 guard는 새 begin이 guard를 얻은 뒤에 넘긴다. 실패하면 이전 막힌 초안과 본문을 그대로 두고 오류를 편집기에 보인다.
- 선택 범위인데 현재 선택이 없으면 버튼을 비활성으로 두고 "Select a target in the canvas, or switch to Canvas."를 보인다. 범위를 Canvas로 바꾸면 Canvas 범위로 다시 시작할 수 있다(필터 변경은 초안을 바꾸지 않는다는 기존 규칙은 유지하고, 다시 시작할 때만 현재 범위를 읽는다).
- 요청 중(`request !== null`)이거나 저장 불확실 상태인 초안에는 버튼을 보이지 않는다. 불변 요청 규칙을 유지한다.

### 2. 무관한 파일 변경에 다시 로드하지 않기 (L-2, Q1 결정)
- 결정(Q1, 2026-10-25 사용자): `design/` 감시 이벤트의 파일 이름이 **목록에 있는 다른 캔버스 HTML**뿐이면 `servedRev`를 올리지 않고 `doan ls`만 다시 읽는다. 판정은 shell이 다시 읽기 전과 후의 캔버스 행 경로로 한다. 파일 이름이 없는 이벤트, HTML이 아닌 파일, 목록에 없는 HTML은 지금처럼 `servedRev`를 올린다.
- 열린 캔버스 자신의 변경은 행 `mtimeMs`가 바뀐 것으로 판단해 다시 로드한다. `canvasViewUpdate`의 reload 조건은 "servedRev가 바뀌었거나 열린 행의 mtimeMs가 바뀌었다"가 된다.
- 받아들이는 위험: 다른 목록 캔버스를 iframe으로 품는 캔버스는 그 캔버스가 바뀌어도 자동으로 다시 로드되지 않는다. ⌘R로 다시 불러온다. 이 위험은 ARCH §3에 기록한다.

### 3. 같은 id 따라가기 (L-4)
- `canvasViewUpdate`에 `{ kind: "moved"; canvas: CanvasRow }`를 더한다. 열린 경로가 목록에 없고, 열린 행의 canvas id가 있으며, 같은 폴더 목록에 그 id를 가진 행이 정확히 하나일 때다. 0개나 2개 이상이면 지금의 `clear: missing`이다.
- 컨트롤러는 `moved`를 리로드처럼 처리한다. 열린 상태의 경로와 행을 바꾸고, 뷰를 유지하고, 선택은 기존 재앵커 경로(unique doan-id → selector → frame id)로 다시 찾는다. 다시 찾으면 바뀐 경로로 `selection:set`을 보내므로 `doan active`가 새 경로를 돌려준다. 실패하면 기존 "selection is no longer in the canvas" 안내를 쓴다. Activity에는 "Reloaded"가 남는다. Activity 의미 변경은 `revision-recheck`에서 다룬다.
- 댓글 세션의 identity는 `{root, path, canvas}`다. `moved`이면 같은 root·id로 path만 바꾸는 갱신 경로를 둔다(`CommentsSession.rename(path)`). 목록, 복사 상태, 카드 상태, 필터는 유지한다. 편집 초안은 canvas id에 묶여 있으므로 유지되고, 생성 초안은 문서가 바뀌므로 1번 경로를 따른다. `useComments`의 `open` 효과는 root·id가 같고 path만 다르면 `rename`을 부른다.
- 행 단위 기억(`workspaceMemory`)과 저장 상태의 경로도 새 경로로 바꾼다.
- 같은 id 행이 2개 이상이라 따라가지 못하면 토스트를 "<title> is no longer at <path>."로 바꾼다. 실제로 사라진 경우는 지금 문구를 유지한다.

### 4. 재시작 복원의 id 따라가기 (Q2 결정)
- `restorePlan`에서 저장된 경로가 없고 저장된 `canvasId`를 가진 행이 하나면 그 행과 저장된 뷰를 복원한다. 아니면 지금처럼 Overview와 토스트다.

### 5. 범위 유지 (L-13)
- `useComments`의 범위 맞춤 효과는 `state.selection` 객체가 아니라 **선택 정체성**(root, canvas id, frame id, doanId, selector의 조합)이 바뀔 때만 실행한다. 같은 대상의 재앵커와 `moved`는 정체성이 같다.

### 6. Esc·빈 여백의 과잉 가드 (L-17)
- `escape()`는 선택과 재앵커 대기가 모두 없으면 `transition()`을 거치지 않고 끝낸다. 빈 여백 클릭도 같은 함수로 들어가므로 함께 해결된다. POSTMORTEM 2026-10-23(가드가 동기 경로 타이밍을 바꿨다)의 규칙을 지킨다: 초안이 없을 때의 즉시 반환과 Escape 기본 동작 처리는 바꾸지 않는다.

### 7. 리로드 중 위치 표시 (T-11, W-9; 측정 뒤 결정)
- 먼저 실제 앱에서 측정한다(tasks 1). 재현되면: 앵커 스냅샷에 `pending` 상태를 둔다. 리로드로 앵커가 비워지는 동안과 렌더 문서가 없는 상태에서는 `missingLocations`를 비운다. 그래서 "Location unavailable"이 뜨지 않는다. 대상 버튼은 이전 값을 유지하고, 핀은 지금처럼 새 레이아웃 뒤에 다시 그린다. 재현되지 않으면 측정값만 기록한다.

## 순수 함수로 떼어낼 부분 (`/tdd` 대상)

- `canvasViewUpdate(prev, next, open)` — `moved` 판정(같은 id 행 0/1/2+), mtime 기반 reload, servedRev 기반 reload.
- `classifyServedChange(changedNames, rowsBefore, rowsAfter)` — 다른 목록 캔버스 HTML만 바뀐 경우를 판정한다.
- `transitionDraft` — `document-lost`의 이유 구분, `restart` 액션(본문 보존, 요청 중에는 무시).
- `selectionIdentity(selection)` — 범위 맞춤 효과의 비교 키.
- `shouldGuardEscape(selection, reanchor)` — 컨트롤러 메서드로 두되 테스트 가능한 형태로 둔다.
- `restorePlan(state, entries)` — 경로가 없을 때 id로 찾는 경우.
- 앵커 `pending` 상태에서 `missingLocations`를 계산하는 함수(측정 결과에 따라).

## 형식 변경

- 공유 JSON Schema 변경 없음. 댓글 이벤트, config, CLI 응답, runtime 형식은 그대로다.
- 기기 로컬 `ui-state.json`에 선택적 `canvasId`. 이전 파일은 그대로 읽힌다.

## 컨벤션 영향

- ARCH §1 컨벤션과 `doan check` 규칙은 바뀌지 않는다. skill 규칙 H("id를 바꾸지 않는다")를 그대로 두며, 이 기능은 id가 같을 때 파일 이동을 따라간다.

## 결정 영향

- **Document origin(ARCH §3 "Comment documents, pins and drafts")**: 생성은 확인된 로드 문서에 묶인다는 결정을 유지한다. 다시 시작은 사람이 누르는 새 begin이며, 이전 요청을 바꾸지 않는다.
- **Live reload(ARCH §3, PRODUCT §5 항목 2)**: 이 기능은 "served 파일이 바뀌면 다시 로드"를 "열린 캔버스와 공유 자산이 바뀌면 다시 로드"로 좁힌다. 다른 목록 캔버스를 iframe으로 품는 경우의 위험을 기록한다.
- **Selection lifetime(ARCH §3)**: "Opening another canvas … clears it"는 그대로다. 같은 id의 이동은 다른 캔버스를 여는 것이 아니라 같은 캔버스의 재로드로 정의한다. 이 정의를 ARCH에 추가한다.
- **Restore(PRODUCT §5 항목 1, design-nav)**: "a missing canvas falls back to that project overview"에 "같은 id가 하나면 따라간다"를 더한다.

## POSTMORTEM에서 가져온 함정

- 2026-10-25 "Comment creation errors hid readable comments and outlived their document": 다시 시작은 begin마다 문서 수명에 묶고, 쓸모없어진 완료가 새 guard를 풀지 않게 한다. 검색어 `cancelBegin|beginRevision|documentLost|setCommentDraftGuard`.
- 2026-10-23 "Draft guards changed existing transition timing": 초안이 없을 때 동기 반환을 유지하고, 가드를 시작한 Escape의 기본 동작은 가드할 때만 막는다.
- 2026-10-25 "Navigation feedback read the previous React snapshot": `moved` 판정에 쓴 목록을 콜백에 넘기고, 경로 부재와 정체성 교체를 따로 테스트한다.
- 2026-10-25 "A canvas reload detached the frame between a poll's lookup and evaluation": e2e 폴링은 iframe 교체를 지나는 동안 실패한 관찰을 재시도한다.

## PoC 의존

- 없음. PRODUCT §6의 통과한 PoC(파일 감시, 서버 범위)만 쓴다.
