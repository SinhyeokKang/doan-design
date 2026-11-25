# 코드베이스 감사 — 2026-11-26 (audit-loop 라운드 2)

- 실행 일자: 2026-11-26 (KST)
- 대상: `develop` HEAD `170e67dbce41de4364c356994928902dbdf7b46d`, 작업 트리 clean. 라운드 1의 PR #397–#402가 merge된 뒤다(`fa680f9..0ad8aea`).
- 범위: 코드베이스 전체. 라운드 1 PR이 바꾼 파일 120개의 회귀를 먼저 확인했다.
- 완료 상태: **정적 감사 완료.** 런타임 동작은 확인하지 않았다.
- 원자료: `.scratch/audit/261126-r2/` (리뷰어 보고서 13개, git에 포함되지 않음)
- 라운드 1 보고서: [audit-261126/report.md](../audit-261126/report.md)

## 미검토 영역과 실행 한계

- **실행 검증 없음.** "의심"으로 표시한 발견은 실행해야 확정된다.
- `styles.css`(1,897줄): 라운드 1(W3)에서 전체를 읽었다. 라운드 2에서는 라운드 1의 diff, postmortem 검색식, 토큰·`aria-disabled` 검색으로만 확인했다. 그래서 이 규칙들에 걸리지 않는 종류의 결함이 있다면 놓쳤을 수 있다.
- 프로젝트 identity 색(`oklch()`)의 대비: `ds/checks.ts`가 이 형식을 읽지 못해 어떤 테스트도 대비를 확인하지 않는다.
- 생성 파일(`viewerApp.js`, `inspect.js`, `inspectPanel.js`): drift만 봤다. 근거는 `0ad8aea`의 CI 성공이며, 이 CI에 `viewerInspect.mjs --check`가 포함된다.
- 적용 대상이 아니어서 읽지 않은 것은 라운드 1과 같다: eval seed, `schema/fixtures` 개별 파일, 바이너리 자산, 프리셋 본문.

## 요약

| 등급 | 개수 |
|---|---|
| High | 0 |
| Medium | 6 (의심 3) |
| Low | 28 |
| 미결정 | 1 |

라운드 1 PR이 만든 회귀는 5건이고 모두 Low다.
- #398: R2-conv-transport-2
- #401: R2-eval-1
- #402: R2-conv-transport-3, R2-cli-export-canvas-1, R2-renderer-canvas-2

이와 별개로, 라운드 1에서 고쳤지만 형제 위치를 빠뜨려 수정이 덜 끝난 경우가 여러 건이다. 아래에서 "수정 미완"으로 표시했다.

---

## Medium

### R2-M1. 펜스 안 Claude가 `.credentials.json` 자리에 폴더를 만들면 로그아웃이 영구히 실패한다 — R2-auth-setup-update-1 (M9 수정 미완, PR #400)
- 트리거: 펜스가 Claude의 `.credentials.json`에 prefix 쓰기를 허용한다(`agentAuth/fence.ts:52`). 그래서 펜스 안 대화가 그 자리에 폴더를 만들 수 있다.
- 영향: Doan은 그 경로를 비재귀 `rmSync`로 지우는데, 폴더라서 EISDIR로 실패한다. 존재 확인은 `existsSync`라 폴더도 있다고 본다(`manager.ts:446, 480, 530, 888`). 그 결과 로그아웃은 매번 `sign_out_failed`가 되고 이 상태가 재시작 뒤에도 남는다. 다시 로그인하면 `storage_failed`다. `mcpConnectors/service.ts:727`의 `scrubPlaintext`도 같은 구조다.
- 기대 동작: POSTMORTEM 2026-11-26 '심은 폴더' 규칙. 라운드 1의 `clearFolder`는 볼트 작업 사본과 설정 파일에만 적용됐다.
- 수정: keychain provider의 plaintext 경로에도 `clearFolder`와 같은 처리를 하고, Seatbelt probe를 추가한다.

### R2-M2. 임시 폴더의 `doan-auth-link-*` 트리를 제자리에서 재귀 삭제한다 — R2-auth-setup-update-2 (의심)
- 트리거: 펜스가 임시 폴더 쓰기를 막지 않는다. 그래서 삭제가 진행되는 동안 하위 폴더를 userData를 가리키는 링크로 바꿀 수 있다.
- 영향: main이 펜스가 보호하는 볼트와 메타데이터를 지울 수 있다. 실제로 그런지는 Electron 45 `rmSync`가 경로를 따라 내려가는지에 달려 있다.
- 근거: `manager.ts:949`의 `hookLinks().close()`, `:961-972`의 `removeStaleLinkDirs`. POSTMORTEM 2026-11-26은 "제자리에서 지우지 않는다"고 정했고, 이 함수는 '확인하지 않음'으로 남겼다.
- 수정: probe로 확인한 뒤 `clearFolder`처럼 펜스 밖 위치로 rename하고 나서 지운다.

### R2-M3. send 대기 중 종료하면 다음 시작이 못 읽는 draft가 저장된다 — R2-conv-core-1
- 트리거: send가 수락되기 전(준비 중, 이전 프로세스 종료 대기, handoff 판정)에 사람이 메시지를 큐에 넣는다. 합친 크기는 32,768자 또는 첨부 10개를 넘는다. 이 상태에서 앱이 종료된다.
- 영향: 다음 시작 때 생성자가 큐를 한도 검사 없이 합쳐 저장한다(`drafts.ts:136`). 그다음 시작부터 그 대화의 draft를 읽을 수 없다. 보낸 메시지와 큐 메시지가 사라지고, 큐 추가는 "Conversation drafts are damaged"로 거절된다.
- 근거: `add()`(`drafts.ts:147`)는 보류 중인 send를 한도에 넣지 않는다. 생성자는 보류 send를 합칠 때만 `fits`로 확인한다(`:131`).
- 기대 동작: ARCHITECTURE §7 'drafts.json' "Reader and writer share the same bounds". POSTMORTEM 2026-10-27이 재발했다.
- 수정: `add()`가 보류 send까지 한도에 넣고, 넘치면 `queue_limit`으로 거절한다.

### R2-M4. 같은 URL로 문서가 바뀌면 이전 seq와 선택이 남는다 — R2-renderer-canvas-1
- 트리거: 캔버스가 `location.reload()`를 하거나 자기 파일로 가는 링크를 연다.
- 영향: renderer는 href가 바뀔 때만 seq를 리셋한다(`CanvasController.ts:1655, 1671-1685`). 그래서 새 스크립트가 seq 0으로 보낸 클릭을 `selection.ts:31-33`이 버린다. 다음 명령이 올 때까지 클릭으로 선택할 수 없고, 낡은 선택이 inspector와 `doan active`에 남는다.
- 기대 동작: ARCHITECTURE §3 'Ordering' "both reset with a new document".
- 수정: 같은 URL이라도 새 문서의 첫 layout이 오면 seq와 선택을 리셋한다.

### R2-M5. 대화 패널·composer의 포커스 이동이 활성화 hand-off를 거치지 않는다 — R2-renderer-conversation-1 (의심) · R2-renderer-canvas-3 · R2-renderer-shell-1 · R2-gaps-5 (M12 수정 미완, PR #402)
- 트리거: 창이 뒤에 있을 때 화면이 바뀌거나 응답이 도착한다.
- 해당 위치:
  - handoff로 화면이 바뀌어 카드·composer로 가는 포커스: `CanvasConversationPanel.tsx:359-388`, `ConversationThread.tsx:1040-1044`
  - send·start 응답 뒤: `DockedComposer.tsx:445,463`, `HomeComposerView.tsx:534`, `ProjectOverview.tsx:218-228`
  - 크기 bubble의 Play·Add: `App.tsx:648,655,2268,2274`
  - prototype 창이 닫힌 뒤 복귀: `PrototypeClosedFocus.tsx`
  - Settings 진입: `SettingsPage.tsx:41-45`, `SettingsAgents.tsx:116-125`
  - 첫 실행 clone 종료: `Onboarding.tsx:467-484`
  - Project Settings 쓰기 뒤: `ProjectSettingsPage.tsx:259-278`
  - 대화 삭제 뒤: `App.tsx:1150`
- 영향: 창이 활성화될 때 포커스가 의도한 곳이 아닌 데로 간다.
- 기대 동작: POSTMORTEM 2026-11-17과 2026-11-26 재발 항목.
- 수정: 모든 위치를 `handFocus` 또는 `useActivationFocus`로 보낸다. 파일별 검색에 걸리지 않는 파일이 있으니, 검색식도 넓힌다.

### R2-M6. `@property` 판정이 `<image>` syntax를 인식하지 못한다 — R2-cli-export-canvas-3 (의심)
- 트리거: `syntax: "<image>"`로 등록한 속성을, 선언한 폴더와 다른 폴더에서 쓴다.
- 영향: export가 앱 화면과 다른 파일을 넣거나, 이미지를 빠뜨린 채 성공하거나, 잘못 거부한다. 라운드 1 후속 후보였던 "`@property` `<url>` 처방이 `image-set()` 값에 맞지 않는다"의 원인이다.
- 근거: `cli/internal/canvas/css.go:593-594`가 syntax 문자열에서 `<url>`이라는 글자만 찾는다.
- 기대 동작: ARCHITECTURE §3 "syntax accepting `<url>`". `<image>`도 `url()`을 받는다.
- 수정: Electron probe로 확인한 뒤 `<image>`도 url을 받는 syntax로 판정한다. 가이드 규칙 13의 처방도 함께 맞춘다.

---

## Low

### 라운드 1 회귀
- **R2-conv-transport-2** (PR #398): `acp.ts:275`의 `/sign in/i`에 단어 경계가 없다. 그래서 "design in", "assign in" 같은 문구가 `not_logged_in`이 된다. 단어 경계를 넣고 오탐 테스트를 추가한다.
- **R2-conv-transport-3** (PR #402): `messageText.ts`가 이제 `renderer/canvasTree`의 `frameTitle`을 값으로 import한다. 그런데 ARCHITECTURE:728에는 아직 "only type imports"라고 적혀 있다. 문서를 고친다.
- **R2-cli-export-canvas-1** (PR #402): `player.js:47`의 `function frameName`이 같은 함수 스코프에 이어 붙은 `lib.js:397`의 `frameName`을 덮어쓴다(`assemble.go:61`). 그래서 board drawer에서 id가 빈 프레임의 이름이 "(no id)"가 아니라 빈 문자열로 나온다. 이름을 바꾸고, 이어 붙인 스크립트의 중복 선언을 잡는 테스트를 추가한다.
- **R2-renderer-canvas-2** (PR #402): `resendHover`가 낡은 `metaHeld` 값으로 리로드할 때마다 `hover-meta: true`를 보낸다(의심). `pointerOnApp`이 `metaHeld`도 갱신하게 한다.
- **R2-eval-1** (PR #401): `eval/lib/types.ts:78` 주석이 `ctx.run`을 아직 "에이전트 환경"이라고 설명한다. 주석을 고친다.

### 라운드 1 수정 미완
- **R2-conv-transport-1** (W2-conv-transport-2): U+0000을 activity에서만 처리했다. `message.delta`·`message.done` 텍스트, 질문 텍스트, `turn.failed` `detail`, `permission.request` `tool`은 그대로 저장되고, store가 거부하면 턴 종료가 기록되지 않는다.
- **R2-mcp-onboarding-1** (M-G2-13): `QUIT_WAIT_MS`를 하나로 합쳤지만 `mcpConnectors/service.ts:75`와 `onboarding/projectAdder.ts:52`에는 아직 `5000`이 남아 있다.
- **R2-main-core-1** (M5): 손으로 추가한 root가 상위 root로 re-root되면(`shell.ts:166-187`, `:356`) 목록에서는 빠지지만 `rootsLeft`를 거치지 않는다.
- **R2-main-canvas-1** (B-G3-1): 배열에 이름 붙은 키를 달면 `runReport`·`framesReport` 검사를 통과한다. 게다가 `prototype/host.ts:83-84`는 검증한 복사본이 아니라 받은 `data`를 그대로 넘긴다(의심). 검증한 필드로 메시지를 다시 만들어 넘긴다.
- **R2-cli-core-1** (B-G1-4): 루트를 다른 철자로 쓴 절대경로(`/tmp` 대 `/private/tmp`, 대소문자, 논리 `$PWD`)를 주면 `withheldAsTyped`(`config.go:166-172`)가 false를 낸다. `configRemovalPaths`처럼 `belowRoot`로 판정한다.
- **R2-cli-core-2** (C-G1-1): 가이드 `skill.md:54`에 `doan active` `project_not_open`의 옛 안내가 남아 있고, `skill_test.go:84`가 그 문구를 고정한다(POSTMORTEM 2026-11-19).
- **R2-cli-core-3** (M-G1-3): ARCHITECTURE:280이 `workSession`과 `sessionSettings`를 따로 두는 이유를 아직 설명한다.
- **R2-cli-export-canvas-2** (W3-leftovers-1): forced-colours 테두리가 viewer 쪽 복사본 `shell.css` `.vw-noscript`와 `prototype.css` `.proto-line`에는 빠졌다. 이를 고정하는 테스트는 `@media` 안을 보지 않는다.
- **R2-cli-export-canvas-4** (PR #399): `canvas.go:53`의 `IDPattern` 주석이 대상을 `data-doan-id`라고 적었다. 실제 대상은 `doan:canvas` meta다.
- **R2-cli-export-canvas-5** (PR #399): JS `trim` 규칙이 `assemble.go` `frameName`과 `project_thumb.go` `trimProjectName`에 따로 있다. 공유 fixture로 고정된 것은 `trimProjectName`뿐이다.
- **R2-renderer-conversation-2** (W3-leftovers-2): `revealDecision.ts:53-58`이 이름을 `title || id`로 만든다. 그래서 title이 공백뿐이면 reveal 토스트의 이름이 비어 보인다.
- **R2-renderer-conversation-3** (M-G3-3): `homeConversations.ts:48`, `canvasConversationRows.ts:26`에 틀린 근거 주석("renderer는 main 모듈을 import하지 않는다")이 남아 있다.

### 그 밖
- **R2-main-canvas-2**: 시작 시 썸네일 정리(`thumbnails.ts:261-271`)가 `list` 상태만 살아 있다고 본다. 그래서 `notFound`·`cliError`·`error`·`uninitialized` 프로젝트의 캐시까지 지운다. 같은 파일의 `:306`, `:36` 규칙과 맞지 않는다.
- **R2-renderer-canvas-4**: 목록에 보이는 캔버스가 나중에 `doan:width`를 얻으면 썸네일 요청이 다시 가지 않는다. 스크롤하기 전까지 "Preview loading"으로 남는다(POSTMORTEM 2026-11-26).
- **R2-renderer-shell-2**: Quick Open 닫기의 포커스 guard가 CSS 규칙이 없는 클래스 `dialog.qo`로 dialog를 찾는다(`App.tsx:2754`). 이 동작을 확인하는 테스트가 없다(POSTMORTEM 2026-10-30).
- **R2-gaps-1**: forced-colours에서 panel resize handle의 포커스 표시가 사라지고, 프로젝트 추가 뒤·Settings 행의 flash 강조도 사라진다(`styles.css:1603-1611, 944, 980`).
- **R2-gaps-2**: forced-colours에서 공용 tooltip 캡슐에 테두리가 없다(`ds/surfaces.css:104-119`).
- **R2-gaps-3**: problem screen을 다시 읽는 동안, 쓸 수 없는 버튼이 hover와 press에 반응한다(`styles.css:1842`, POSTMORTEM 2026-11-17).
- **cli-export-canvas 참고**: `HasID && !IDDup && IDPattern` 조합 판정이 `check.go:82`, `cli/read.go:88`, `cli/sessions.go:159` 세 곳에 남아 있다.
- **R2-eval-2** (M-G1-2): v4 frame 판정 중 `doan ls` 읽기가 throw하면 그 예외가 소켓 `data` 핸들러에서 잡히지 않는다. 그래서 fake 앱이 조용히 죽고, 이어지는 실패가 에이전트 탓으로 기록된다(`socket.ts:375-384, 453-458, 518-522`).
- **R2-eval-3** (L-G1-4): `realRun`의 `finally { await ws.dispose() }`가 reject하면 끝난 실행의 record가 버려진다(`run.ts:118-120`).

## 미결정

| id | 질문 |
|---|---|
| R2-gaps-4 | 캔버스 jump 강조와 working-frame marker가 팔레트 값 `--indigo-600`을 직접 쓴다(`styles.css:403, 1530`). DESIGN의 "roles, never palette steps"에 어긋난다. 역할 토큰을 새로 둘지, 예외로 기록할지 정해야 한다. |

## 커버리지

| 클러스터 | 범위 | 상태 |
|---|---|---|
| conv-core | `main/conversation` service·runners·store 등 14개 | 완료 |
| conv-transport | `main/conversation` 나머지 33개 | 완료 |
| auth-setup-update | `agentAuth`, `agentSetup`, `update` 33개 | 완료 |
| mcp-onboarding | `mcpConnectors`, `onboarding`, `document` | 완료 |
| main-core | `index.ts`, preload, main 최상위 모듈 | 완료 |
| main-canvas | prototype, serve, 캔버스 스크립트, 썸네일, watch, `app/runtime`, `app/scripts`, workflows | 완료 (`cssomMatched.ts` 80–250, `doanyGolden.mjs` 80–208은 훑음) |
| renderer-shell | `App.tsx`, 셸 모듈, `brand`·`formats`·`restore` | 완료 |
| renderer-canvas + gaps | CanvasController, inspector, prototype, buddy, usage, ds, CSS | 완료 (`styles.css`는 위 한계 참고) |
| renderer-conversation | 대화·composer 모듈 | 완료 |
| cli-export-canvas | `export`(viewer 포함), `canvas`, `check` | 완료 (생성 파일은 drift만) |
| cli-core | `cli/internal/cli`, `cmd`, `repo`, `formats`, `designskill`, schema | 완료 |
| eval | `run.ts`, `lib`, 시나리오 checks | 완료 |

## Postmortem 적용 체크리스트

- 재발: 2026-11-17 활성화 포커스(R2-M5), 2026-11-26 심은 폴더(R2-M1, R2-M2), 2026-10-27 reader·writer 한도(R2-M3), 2026-11-26 U+0000(R2-conv-transport-1), 2026-10-25/11-17·11-26 root 제거 정리(R2-main-core-1), 2026-11-19 project_not_open 가이드(R2-cli-core-2), 2026-11-25/26 forced-colours(R2-cli-export-canvas-2, R2-gaps-1·2), 2026-11-26 썸네일 renderer 쪽(R2-renderer-canvas-4), 2026-10-30 클래스 의존 guard(R2-renderer-shell-2), 2026-11-17 비활성 버튼 hover(R2-gaps-3), 2026-11-18 규칙 사본(R2-renderer-conversation-3)
- 유지: 위를 뺀 적용 항목. 클러스터별 목록은 원자료 §3에 있다.
- 문서 drift(`/doc-check` 대상): 2026-11-22 Cursor 항목의 검색 명령이 지워진 `transportCode`를 가리킨다.

## 리뷰어

클러스터 12개와 공백 1개, 모두 Claude다. 각 리뷰어가 맡은 클러스터에서 4관점을 모두 봤다. 리드가 소스에서 다시 확인한 발견은 R2-M1, R2-M3, R2-cli-export-canvas-1이다.
