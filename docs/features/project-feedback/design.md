# project-feedback — 설계

## 영향받는 구성 요소

- **CLI(Go)**
  - `cli/internal/cli/read.go`: `List`가 행 단위 실패와 `orphans`를 만든다.
  - `cli/internal/check/check.go`: 고아 판정을 공유 함수로 옮기고 `orphan_comment_file` message를 고친다.
  - `cli/internal/repo/`: 공유 함수 위치.
  - `cli/internal/cli/mcp.go`: `ls` 도구 설명.
  - `cli/internal/cli/skill.md`: `ls` 설명과 갈 곳 잃은 댓글 안내.
- **MCP**: `ls` 결과는 `cli.Run`을 거치므로 CLI와 같아진다.
- **앱 main**
  - `view.ts`, `folderState.ts`: 행 오류와 `orphans`를 파싱한다.
  - `revision-recheck`의 `comments:project` IPC 확장: `orphans` 파일도 읽는다.
  - `comments/service.ts`, `comments/identity.ts`, `comments/files.ts`: orphan 요청 종류, 파일을 만들지 않는 append.
  - `senderAllowed.ts`, `index.ts`, preload.
- **앱 renderer**
  - `RightPanel.tsx`와 새 `FeedbackPanel.tsx`: Overview 오른쪽 패널.
  - `CommentsPanel.tsx`: id 변경 안내.
  - `CommentsSession.ts`: orphan 쓰기.
  - `Sidebar.tsx`, `Home.tsx`, `homeCards.ts`, `ProjectOverview.tsx`.
- **공유 형식**: 이벤트·config·runtime 스키마는 그대로다. CLI `ls` 응답 계약(ARCH §12)이 바뀐다. `result`에는 JSON Schema가 없으므로(`cli-envelope.v1.schema.json`) 고칠 스키마는 없다.

## 동작

### 1. `ls`의 부분 실패 (L-5, Q3)
- 전체 실패로 남는 경우: 저장소·설정 읽기 실패, `design/` 열거(WalkDir) 실패, `.doan/comments` 열거(ReadDir) 실패, `repo.Scope` 실패. 파일 집합을 모르면 `orphans`를 믿을 수 없기 때문이다.
- 행 단위로 낮추는 경우
  - 캔버스 HTML을 읽지 못함: 그 행에 `error: {code: "unreadable_canvas", message}`를 두고 `frames: []`로 하며 `comments`는 생략한다.
  - 댓글 파일을 읽지 못함: 그 행에 `commentsError: {code: "unreadable_comments", message}`를 두고 `comments`는 생략한다.
- `comments`는 지금 필수 필드다. 오류 행에서만 생략하는 것은 ARCH §12 계약 변경이므로 skill과 MCP 설명에 반영한다. 0으로 채우지 않는다. "a read error is not an empty list" 원칙 때문이다.
- `message`에는 repo 상대 경로와 원인 종류만 넣는다. 절대 경로는 넣지 않는다.
- envelope은 `ok: true`, exit 0이고 MCP는 `isError: false`다.

### 2. 갈 곳 잃은 댓글 파일 (L-3, PF1)
- 공유 Go 함수 `repo.OrphanFiles(canvases, commentFiles)`는 check의 기존 규칙(`c.HasID`, 첫 id 문자열이 같으면 유효·중복과 무관하게 일치)을 그대로 쓴다. check와 ls가 같이 쓴다.
- `ls` 결과의 `orphans`는 `[{id, file, comments?: {open, resolved}, error?: {code, message}, uncertain: bool}]`이고 빈 목록은 `[]`다.
  - `uncertain`은 캔버스 행 가운데 `error`나 파싱 오류가 하나라도 있으면 true다. 그 캔버스의 id를 알 수 없기 때문이다.
  - 갈 곳 잃은 파일을 읽지 못하면 `error`를 둔다.
- `orphan_comment_file`의 message: "No canvas uses this comment file's id. Restore the canvas id, or ask the user. Do not delete or rewrite the comment file." check finding에는 `nextSteps` 필드가 없으므로(ARCH §1 finding 모양) 안내는 message와 skill에만 둔다.

### 3. Feedback 패널 (N3, Q2, PF3)
- 데이터: `revision-recheck`의 `comments:project(root)`를 확장한다.
  - 새로 받은 `ls` 한 번에서 캔버스 행 id와 `orphans` id의 파일만 읽어 fold한다(ARCH §13: 앱은 목록을 다시 구현하지 않는다).
  - 읽기 규칙은 tolerant read(U+FFFD, BOM)다.
  - 파일 하나가 실패하면 그 묶음만 오류로 둔다.
  - 요청 id와 revision으로 늦은 응답을 버린다.
  - 패널이 보이는 동안만 읽는다. 무효화가 연달아 오면 합친다.
  - 프레임 묶음과 순서는 `ls` 정적 프레임을 따른다. 정적 프레임이 1,000개에서 잘린 경우의 나머지는 저장된 `target.frame`으로 둔다.
- 행 클릭: `openCanvasAt(root, path, commentId, status)`. 동기 생산자가 쓴 목록 상태를 콜백에 넘긴다(POSTMORTEM). 캔버스를 연 뒤 `revision-recheck`의 `locate`를 부르고, 상태 필터를 행 상태로, 범위를 Canvas로 맞춘다.
- 키보드: `role="tree"` 패턴(Sidebar와 같은 이동 규칙). 행 버튼은 `tabIndex=-1`이 아니라 Tab으로 닿는다.

### 4. 갈 곳 잃은 댓글 쓰기 (Q1, PF1, PF2)
- 허용 이벤트는 `resolve`, `reopen`, `delete`다. create와 edit는 거부한다.
- 요청 모양: `{root, canvas: <id>, requestID, project, intent: {type: "resolve"|"reopen"|"delete", comment, expected}}`이고 `path`는 없다.
- 권한 판정은 append 콜백 안에서 새로 받은 `ls`로 다시 한다(`service.ts`의 기존 재판정 위치).
  - `orphans`에 그 id가 있고, 그 항목이 `uncertain: false`이며 `error`가 없고, id가 kebab 형식이면 허용한다.
  - TS는 캔버스 행 id를 다시 확인하지 않는다. `ls` 행은 무효·중복 id를 생략하기 때문이다.
- 파일 경로: 기존 App writer filesystem boundary(ARCH §2)를 쓰되 **만들지 않는 모드**(`create: false`)로 쓴다. 디렉터리나 파일이 없으면 거부하고 mkdir child도 실행하지 않는다.
- Git 이름 필요, 기대 상태 검증, 불변 요청과 재시도, 저장 불확실 처리는 기존 카드 변경과 같다. `revision-recheck`의 이벤트 여러 개 attempt 일반화 위에 얹는다.
- `status`는 root, epoch, attempt만 확인하고 고아 여부를 다시 판정하지 않는다. 그래야 캔버스가 돌아온 뒤에도 불확실 요청의 상태를 확인할 수 있다.
- 판정과 쓰기 사이에 캔버스가 같은 id로 돌아오면 다음 판정에서 거부된다. 같은 파일이고 기대 상태 검증이 있으므로 해롭지 않다.

### 5. id 변경 안내
- 컨트롤러가 같은 경로에서 행 id가 바뀌는 것을 보면(`revision-continuity`의 `idChanged`) 이전 id를 기억한다.
- `idChangeNotice(previousId, orphans)`: 이전 id가 `orphans`에 있고 보이는 댓글이 1개 이상이면 안내를 만든다. 그 id를 되돌리면 사라진다.
- Comments 머리 배너 순서는 `revision-recheck`와 같다(오류·id 안내 → 재확인 → 넘기기).

### 6. 트리·Home 표시
- 오류 행: 트리 배지 대신 경고 표시와 고정 문장을 둔다. 원문은 Details에 둔다.
- Home 요약: `homeSummary(entry, review, orphans)`. 좁을 때 줄바꿈 순서도 여기서 정한다.

## 순수 함수로 떼어낼 부분 (`/tdd` 대상)

- Go
  - `repo.OrphanFiles`: 중복 id, 무효 id, 파싱 오류 캔버스, 읽기 불가 캔버스는 uncertain
  - `List` 부분 실패 조립: 댓글 파일만, 캔버스 파일만, 둘 다, 고아 파일 읽기 불가
  - check message
- TS
  - `feedbackGroups(comments, rows, orphans)`: 묶음, 순서, Whole canvas, not in canvas, 잘린 프레임, Resolved 정렬, 0개 고아 숨김
  - `idChangeNotice`, `homeSummary`, `orphanWriteAllowed(listing, request)`
  - `feedbackFocusAfterRemoval(rows, removed)`

## 형식 변경

- CLI `ls` 응답
  - 캔버스 행의 `commentsError?`, `error?`
  - 오류 행에서 `comments` 생략
  - 최상위 `orphans`
- `doan check` finding message 문구.
- 내부 IPC: `comments:project`의 orphans 확장, orphan 요청 종류, 새 채널은 `senderAllowed`에 등록한다.

## 컨벤션 영향

- `doan check` 규칙과 수준은 그대로 경고다. skill에서는 `ls` 설명에 새 필드를 넣고, "Do not delete or rewrite comment files listed in `orphans`; ask the user"를 더한다.

## 결정 영향

- PRODUCT §5 항목 11과 §7 2026-10-21(고아 파일은 경고, 첫 id 문자열 일치 규칙)은 유지한다. 앱에 보이는 것만 더한다.
- "a read error is not an empty list"(PRODUCT §5 항목 5)는 행 단위 오류로 더 정확히 지킨다.
- ARCH §2 "App authority and retries"는 갈 곳 잃은 댓글의 resolve, reopen, delete에 한해 확장한다(Q1, PF2). 판정은 새로 받은 `ls`의 `orphans`로 한다. 파일을 만들지 않는 모드를 쓰고, 재시도 규칙은 그대로다.
- design-nav의 "The right panel stays 'No canvas open'"(PRODUCT §5 항목 3)은 Feedback으로 바꾼다.
- `/agent-eval` 트리거: CLI·MCP `ls` 출력, MCP 도구 설명, skill이 바뀐다.

## POSTMORTEM에서 가져온 함정

- 2026-10-25 "Navigation feedback read the previous React snapshot": 목록 클릭으로 캔버스를 열 때 동기 생산자가 쓴 목록 상태를 콜백에 넘긴다.
- ARCH "App byte ingress": 피드백 목록 읽기에도 tolerant read 규칙을 그대로 쓴다.

## 측정 의존

- PoC 의존은 없다. 댓글 파일이 많은 프로젝트의 읽기 비용과 무효화 빈도는 tasks 1에서 잰다.
