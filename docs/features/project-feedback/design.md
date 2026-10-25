# project-feedback — 설계

## 영향받는 구성 요소

- **CLI(Go)**: `cli/internal/cli/read.go`의 `List`가 댓글·캔버스 파일 읽기 실패를 행 단위로 낮춘다. `ls` 결과에 갈 곳 잃은 댓글 파일 요약을 더한다.
- **MCP**: `ls` 도구 결과가 CLI와 같아진다(같은 envelope).
- **앱 main**: `view.ts`(행 오류, 갈 곳 잃은 파일), 프로젝트 피드백 목록 IPC(프로젝트의 모든 댓글 파일을 fold해 돌려준다. 기존 `comments:list`의 tolerant read 규칙을 따른다).
- **앱 renderer**: `ProjectOverview.tsx`·`RightPanel.tsx`(Q2), `CommentsPanel.tsx`(id 변경 안내), `homeCards.ts`·`Home.tsx`(갈 곳 잃은 수), `Sidebar.tsx`(행 읽기 오류 표시).
- **skills**: `ls` 출력 설명에 새 필드를 더한다. CLI 출력이 바뀌므로 `/agent-eval` 대상이다.
- **공유 형식**: 이벤트 스키마는 바뀌지 않는다. CLI `ls` 응답에 선택 필드를 더한다(ARCH §12). preload·main의 댓글 변경 요청에 `orphan` 종류가 더해진다(내부 IPC).

## 동작

### 1. `ls`의 부분 실패 (L-5, Q3 결정)
- 결정(Q3): 캔버스 행에 선택 필드 `commentsError: {code, message}`를 둔다. 댓글 파일을 읽지 못하면 그 행의 `comments` 수 대신 이 필드가 나온다. 캔버스 HTML을 읽지 못하면 행에 `error: {code, message}`를 두고 `frames: []`로 둔다. 전체 실패는 저장소·설정을 읽지 못할 때만이다.
- 앱: 행 오류가 있는 캔버스는 트리에 경고 표시와 title을 둔다. 열면 Comments 패널이 기존 읽기 실패 블록과 Retry를 보인다. 프로젝트 상태는 정상으로 남는다.

### 2. 갈 곳 잃은 댓글 파일 요약 (L-3)
- `ls` 결과에 `orphans: [{id, file, comments: {open, resolved}}]`를 더한다. 목록 캔버스 중 같은 id(유효하고 유일한 것)가 없는 댓글 파일이다. 판정은 `doan check`의 `orphan_comment_file`과 같은 규칙을 공유 함수로 쓴다.
- `doan check`의 `orphan_comment_file` 경고에 message와 nextSteps를 붙인다: "Restore the canvas id `<id>`, or ask the user. Do not delete the comment file."

### 3. 프로젝트 피드백 목록 (N3, Q2 결정)
- Overview일 때 오른쪽 패널("No canvas open")을 **Feedback** 패널로 바꾼다. 위에서부터 "Comments without a canvas" 묶음(있을 때), 캔버스 묶음(Overview 카드 순서), 그 안의 프레임 묶음(문서 순서, 프레임 없는 대상은 "Canvas")이 온다. 행은 `targetLabel`과 본문 첫 줄이다. Open/Resolved 전환을 둔다.
- 행 클릭: 해당 캔버스를 열고(초안 가드 적용) 대상 위치로 간다. 갈 곳 잃은 행은 이동하지 않는다.
- 데이터: main이 root의 모든 댓글 파일을 읽고 fold한다(파일 수에 비례). 캔버스 정적 프레임 목록(`ls`)으로 프레임 묶음과 순서를 정한다. 대상이 프레임 밖 요소면 저장된 `target.frame`을 쓴다.
- 갱신: 기존 댓글 무효화 이벤트(`onCommentsInvalidated`)와 폴더 갱신 때 다시 읽는다.

### 4. 갈 곳 잃은 댓글 동작 (Q1 결정)
- 각 댓글에 Resolve와 Delete를 둔다. Delete는 기존 삭제 확인 대화상자를 쓴다. 작성·편집·Reopen과 위치로 가기는 없다. 안내 "Restore the canvas id to bring these back to their canvas."는 그대로 둔다.
- **쓰기 권한 확장**: 지금 main은 새로 받은 Go 목록에서 root/path/canvas 정체성을 확인한 뒤에만 쓴다(ARCH "App authority and retries"). 갈 곳 잃은 댓글은 경로가 없다. 그래서 새 요청 종류 `orphan`을 둔다: `{root, canvas: <id>, comment, expected}`. main은 새로 받은 `ls`의 `orphans`에 그 id가 있고, 목록 캔버스 중 같은 id가 없을 때만 허용한다. 허용하는 이벤트는 `resolve`와 `delete`뿐이다.
- 쓰기 경계는 기존 App writer filesystem boundary(ARCH §2)를 그대로 쓴다. 파일은 이미 있으므로 디렉터리를 만들지 않는다. Git 이름 필요, 기대 상태 검증, 불변 요청과 재시도, 저장 불확실 처리도 기존 카드 변경과 같다.
- 판정과 쓰기 사이에 캔버스가 같은 id로 돌아오면 다음 쓰기에서 거부되고, 목록을 새로 읽어 그 댓글이 캔버스 묶음으로 옮겨 간다.

### 5. id 변경 안내
- 열린 캔버스의 행 id가 같은 경로에서 바뀌면(이전 id → 새 id) 컨트롤러가 이전 id를 기억한다. 그 이전 id가 `orphans`에 있으면 Comments 패널 머리에 안내와 Show를 둔다.

## 순수 함수로 떼어낼 부분 (`/tdd` 대상)

- Go: `orphanFiles(canvases, commentFiles)` — check와 ls가 같이 쓴다. `List`의 부분 실패 조립.
- TS: `feedbackGroups(comments, rows, orphans)` — 묶음과 순서. `idChangeNotice(previousId, entry)`. `homeOrphanText(entry)`. main의 `orphanWriteAllowed(listing, request)` — 허용 이벤트와 id 판정.

## 형식 변경

- CLI `ls` 응답: 캔버스 행 `commentsError?`, `error?`, 최상위 `orphans`(빈 목록은 `[]`). ARCH §12 계약을 갱신한다. 이벤트·config·runtime 스키마는 그대로다.
- `doan check` finding 문구와 nextSteps.

## 컨벤션 영향

- `doan check` 규칙 자체는 그대로다(경고 수준 유지). skill의 `ls` 설명이 바뀐다.

## 결정 영향

- PRODUCT §5 항목 11(고아 댓글 파일은 경고): 유지한다. 앱에 보이는 것만 더한다.
- "a read error is not an empty list"(PRODUCT §5 항목 5): 행 단위 오류로 더 정확히 지킨다.
- 앱 쓰기 권한(ARCH "App authority and retries"): 갈 곳 잃은 댓글의 resolve·delete에 한해 확장한다(Q1 결정). 판정은 새로 받은 `ls`의 `orphans`로 한다. 파일시스템 경계와 재시도 규칙은 그대로다.

## POSTMORTEM에서 가져온 함정

- 2026-10-25 "Navigation feedback read the previous React snapshot": 목록 클릭으로 캔버스를 열 때는 동기 생산자가 쓴 목록 상태를 콜백에 넘긴다.
- ARCH "App byte ingress": 피드백 목록 읽기는 tolerant read 규칙(U+FFFD, BOM)을 같이 쓴다.

## PoC 의존

- 없음. 댓글 파일이 많은 프로젝트의 읽기 비용은 tasks 1에서 잰다.
