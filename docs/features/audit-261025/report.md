# 코드베이스 전체 감사 보고서 (audit-261025)

- **수행일**: 2026-10-25. 1차 단독 검토(interim)와 같은 날 관점별 서브에이전트 재검토로 이어서 진행했다.
- **기준 코드**: main, HEAD `28615ca` (작성 시점, worktree clean). 감사 도중 HEAD가 `cdff678` → `0ad0284` → `022cfaa` → `28615ca`로 바뀌었지만 모두 문서·스킬 커밋이다. `git diff --stat 022cfaa HEAD -- app cli schema eval`은 비어 있다. 따라서 인용한 앱·CLI·eval 코드 위치는 그대로 유효하다.
- **요청 범위**: 코드베이스 전체 (`/audit`, 범위 축소 없음).
- **완료 상태**: **정적 검토 완료**. 인벤토리의 모듈 24개(A–X)와 4개 관점의 셀을 모두 닫았다. 실행 검증은 하지 않았다(아래 §1).
- **수행자**: 리드 Claude Code 피어 1명과 Claude 계열 관점 리뷰어 서브에이전트(1차 4명, 2·3차 재배정 3건)가 맡았다. 원 근거는 `.scratch/audit/claude-peer-2026-10-25/`에 남겼다. 이 디렉터리는 커밋되지 않으므로, 이 보고서만 읽어도 판단할 수 있게 근거를 옮겨 적었다.

## 1. 확인하지 못한 것과 실행 한계

- **아무것도 실행하지 않았다.** 테스트, 빌드, 앱 실행, eval 실행 모두 하지 않았다(원 브리프와 재시작 지시의 금지 사항). 모든 판단은 소스를 추적해서 얻었다. 테스트가 있다는 사실은 의도한 커버리지의 근거일 뿐, 지금 통과한다는 근거는 아니다.
- **런타임에서 확인해야 하는 항목**은 각 발견에 "의심(실행 필요)"으로 표시했다. A-M4, A-L1, A-L12, A-L13, A-L14, A-L19, A-L20, A-L25가 여기에 해당한다. 확정된 발견도 창 표시 여부나 Chromium 이벤트처럼 런타임 동작에 기대는 부분은 미검증이다.
- PRODUCT §7 결정 로그는 리뷰어들이 필요한 항목을 검색해서 대조했다. 처음부터 끝까지 정독하지는 않았다.
- 과거에 측정한 값(DESIGN.md, USABILITY-EVAL.md 라운드 결과)은 다시 검증하지 않았다. 감사 목적과 무관하기 때문이다.
- 문서 쪽 오기(아래 §5)는 `/doc-check` 소관으로 넘겼다. 이 보고서에서 문서를 고치지 않았다.

## 2. 결과 요약

| 등급 | 건수 | 확정(정적) | 의심(실행 필요) | 제품 결정 필요(단독) |
|---|---|---|---|---|
| High | 0 | 0 | 0 | 0 |
| Medium | 6 | 5 | 1 (A-M4) | 0 (A-M1은 확정이면서 결정도 필요) |
| Low | 25 | 17 | 7 | 1 (A-L16) |

High가 0이라는 판단은 검토한 정적 범위에만 해당한다. 판단을 위해 사용자 결정이 필요한 발견은 A-M1, A-L1, A-L9, A-L16이다.

## 3. 발견

표기: 관점 P1=계약·불변식, P2=경계, P3=수명 주기·실패, P4=유지보수·회귀 방지. 근거 ID는 scratch 증거 파일 안의 번호다(C=P1, B=P2, LC=P3, P4-/P4V-/P4X-=P4).

### Medium

#### A-M1 — 저장 요청이 걸린 댓글 초안이 있으면 Cmd+Q가 표시 없이 거부된다 (확정, 제품 결정 필요)
- **관점**: P3 (LC-1), P1 재확인, 1차 보고서 M1.
- **트리거**: 댓글 초안을 저장했는데 결과가 `saved`가 아닌 상태로 요청이 남는다. 전송 실패(`unknown`), 기록 결과 불확실(`unknown`), `absent`(`retry-original`), 디렉터리 자식 격리(`recovery-blocked`, `child-exit-required`)가 해당한다. 이 상태에서 Cmd+Q, Dock 종료, 로그아웃을 시도한다. IME 조합 중이거나 `comments:begin`·카드 변경이 진행 중일 때도 잠시 같은 일이 일어난다.
- **추적**:
  1. `app/src/main/index.ts:853-869`의 `before-quit`은 cancel 없이 `transitionGuard.request({kind:"quit"}, action)`을 부른다.
  2. `app/src/renderer/useComments.tsx:26-29`는 모든 quit 요청에 `session.guard()`로 답한다.
  3. `app/src/renderer/CommentsSession.ts:150-151`의 `guard()`는 `draft.request`가 있으면 `draft.transition`을 만들기 전에 `false`를 돌려준다. 그래서 대화상자가 그려지지 않는다.
  4. `app/src/main/comments/transitions.ts:24-30`의 `answer({allow:false})`는 quit 요청에 없는 `cancel`을 부르므로 아무 일도 일어나지 않는다.
  5. `recovery-blocked`는 Check·Retry가 막혀 있고(`CommentsSession.ts:211,216`), 요청이 걸린 동안에는 Discard도 무시된다(`:158-161`). 요청을 해제할 경로가 없다.
  6. `useComments.tsx:105`의 `discardBlocked`는 요청이 걸린 상태의 대화상자를 의도한 흔적이다. 하지만 이 상태로는 도달할 수 없다. e2e도 `app.close()` 전에 가드를 직접 해제한다(`app/e2e/comments-ui.ts:518-519`).
- **영향**: 종료가 아무 반응 없이 무시된다. 격리 상태나 계속 `unknown`인 상태에서는 강제 종료 외에 앱을 끌 방법이 없다. 로그아웃·종료도 앱이 취소시킨다. 같은 `guard()` 분기 때문에 다른 캔버스·프로젝트로의 이동, Reload, 프로젝트 Remove도 표시 없이 막힌다. 이 부분은 ux-audit(R2-1)에서 화면 관점으로 다룬다.
- **기준**: ARCHITECTURE §2 "Directory-child uncertainty"는 복구 절차로 "앱 재시작"을 요구한다. §3 "Transitions"와 PRODUCT §5(137행)는 종료할 때 Save/Discard/Keep writing 선택지를 보여주라고 한다. 같은 §3은 "불확실한 요청은 일반 전환 대화상자로 버릴 수 없다"고도 한다. 이 상태에서 종료를 어떻게 처리할지는 아직 정해지지 않았다.
- **최소 수정(결정 후)**: `guard()`에서 종료와 앱 내부 전환을 구분한다. 요청이 걸린 상태의 종료에는 전용 대화상자를 띄운다(예: "그래도 종료 — 초안은 메모리에만 있고 디스크 상태는 바뀌지 않는다" / "계속 작성"). 앱 내부 전환은 지금처럼 막는다. 결정은 ARCHITECTURE §2/§3과 PRODUCT §7에 기록한다.
- **검증**: CommentsSession 단위 테스트를 추가한다. e2e는 격리 fixture(`comments-ui.ts:499-507`) 뒤에 가드를 해제하지 않고 `app.quit()`을 불러 결정된 결과를 확인한다.

#### A-M2 — 창을 숨긴 상태에서 초안이 있을 때 종료하면 Save/Discard 대화상자가 숨은 창에 뜬다 (확정, 런타임 미검증)
- **관점**: P3 (LC-2), P1 재확인, 1차 M2.
- **트리거**: 저장하지 않은 초안이 있는 상태에서 Cmd+W(창 숨김, `index.ts:337-353`)나 Cmd+H를 누른 뒤 Dock에서 종료하거나 로그아웃한다.
- **추적**: `before-quit`(`index.ts:853-869`)는 `transitionGuard`를 거쳐 `win.webContents.send`(`:87-89`)로 요청만 보낸다. `showWindow`, `app.show()`, `focus()`는 부르지 않는다. 대화상자(`useComments.tsx:104`, `App.tsx:288`, `CommentsPanel.tsx:221`)는 숨은 창 안에 그려진다. 창을 다시 보여주는 `showWorkspace`는 "Keep writing"에만 붙어 있다(`useComments.tsx:106`).
- **영향**: Dock에서 창을 다시 열기 전까지 종료가 멈춘 것처럼 보인다.
- **기준**: ARCHITECTURE §3 "Transitions", PRODUCT §5. e2e는 창이 보이는 경우만 다룬다(`comments-ui.ts:325`).
- **최소 수정**: 가드가 켜진 종료 요청을 보내기 전에 앱과 창을 보여주고 포커스한다.
- **검증**: index 단위 테스트를 추가한다. e2e로 초안 → Close Window → `app.quit()` 순서를 밟아 대화상자가 보이는지 확인한다.

#### A-M3 — 앱의 댓글 읽기가 공유 fold 경로를 쓰지 않고 엄격 UTF-8로 디코딩한다. 잘못된 바이트 하나로 해당 캔버스의 댓글이 앱에서 읽히지도 쓰이지도 않는다 (확정)
- **관점**: P1 (C1, C3), P4 (P4-M1). 병합한 항목이다.
- **트리거**: `.doan/comments/<id>.jsonl`에 잘못된 UTF-8 바이트가 들어간다(다른 인코딩 편집기, 머지 도구, 여러 바이트 문자가 잘린 기록). 또는 파일이 BOM 두 개로 시작한다.
- **추적**:
  - `app/src/main/comments/service.ts:43`은 `new TextDecoder("utf-8", { fatal: true })`로 디코딩한다. 이 결과가 `readList`(`:44-48`, list와 copy), `inspectAttempt`(`:51,55`), `prepareEvent`(`:167,170`)로 들어간다.
  - 디코딩 예외가 나면 list는 `{ok:false}`가 된다. 렌더러는 `readError`를 받아 쓰기까지 막는다(`useComments.tsx:70`). 모든 변경도 append 전에 실패한다.
  - Go는 같은 파일을 바이트 그대로 `FoldText`에 넘긴다(`cli/internal/cli/read.go:52`). 잘못된 바이트는 U+FFFD가 되거나 그 줄만 `invalid_event`로 버려진다.
  - BOM은 TextDecoder가 하나를 먼저 벗기고 `parseLines`(`app/src/formats/fold.ts:19`)가 또 하나를 벗긴다. Go는 하나만 벗긴다(`cli/internal/formats/fold.go:13`).
  - 프로덕션 경로는 `foldText`를 부르지 않는다. 경고를 줄 번호로만 정렬하는 자체 조합을 쓴다(`service.ts:44-48`; `foldText.ts`의 프로덕션 호출자는 0개). 그래서 공유 fixture가 실제 경로를 검증하지 않는다.
- **영향**: 에이전트(`doan comments`, MCP)는 댓글을 읽고 resolve까지 하는데, 앱에서는 같은 캔버스가 읽기 실패로 보이고 쓰기가 전부 막힌다.
- **기준**: ARCHITECTURE §2 Reading(줄 단위 `invalid_event`, BOM 하나, "callers and tests use `foldText`"), §12("Non-UTF-8 bytes from files become U+FFFD"), PRODUCT §5 항목 5, POSTMORTEM 2026-10-21 fold 분기 예방 규칙.
- **최소 수정**: `readList`를 `foldText(decode(bytes))`로 바꾼다. 디코딩은 `TextDecoder("utf-8", { ignoreBOM: true })`(비엄격)로 한다. 엄격 디코딩이 append 보호용이라면 그 결정을 §2에 기록하고, 읽을 수 있는 줄은 계속 표시한다.
- **검증**: `0xff` 바이트가 든 파일과 BOM이 두 개인 파일로 service 테스트를 만들어 CLI 출력과 비교한다(`roundtrip.test.ts` 확장). 바이트로 읽는 공유 fold fixture도 추가한다.

#### A-M4 — Go 경로 해석이 NFC와 NFD를 같은 이름으로 보지 않는다 (의심, APFS 실행 필요)
- **관점**: P1 (C2).
- **트리거**: 디스크에는 NFD로 저장된 이름(Finder에서 만든 한글 폴더·파일)을 NFC 텍스트(IME 입력, 에이전트가 쓴 HTML, NFC로 된 `$PWD`)로 가리킨다.
- **추적**: `cli/internal/repo/resolve.go:84-117`의 `diskSpelling`은 정확 일치와 `strings.EqualFold`만 비교한다. 그래서 `EvalSymlinks`가 이미 성공했는데도 `Resolve`(`:61-66`)는 `Missing`을 낸다. `InsideRelative`와 `Find`(`find.go:46-52`)도 같은 함수를 쓴다.
- **영향**:
  - 실제 파일에 `implements_not_found`, `local_css_not_found`, `token_css_not_found`(exit 4)가 난다. 앱 서버는 같은 파일을 정상으로 서빙한다(`serve/server.ts:75-82`).
  - `Scope`가 해당 serve 항목을 빠뜨린다.
  - `doan config`와 절대 경로 `--token-css`가 실패한다.
  - `doan active`가 사용자가 입력한 표기의 root를 보내 `project_not_open`이 될 수 있다(`runtime.ts:69`는 문자열을 그대로 비교한다).
- **기준**: ARCHITECTURE §13 "Paths inside the repo"(디스크 표기 반환, missing의 정의), §4 root 비교.
- **최소 수정**: 정확 일치와 대소문자 무시 비교가 모두 실패하면 `norm.NFC`로 다시 비교한다. `golang.org/x/text`는 이미 의존성에 있다.
- **검증**: NFD로 만든 이름을 NFC로 조회하는 Find/Resolve 테스트를 추가한다(정규화를 하지 않는 FS에서는 skip). NFC로 적은 implements fixture도 추가한다.

#### A-M5 — 토스트 타이머가 네이티브 창 숨김에 멈추지 않아, 창을 숨긴 사이 프로젝트 제거 Undo가 만료된다 (확정 계약 위반, 런타임 미검증)
- **관점**: P3 (LC-3), P4 (P4-M2). 병합한 항목이다.
- **트리거**: 프로젝트를 제거해 Undo 토스트(8초)를 띄운 뒤 Cmd+W나 Cmd+H로 숨기고, 8초가 지나서 돌아온다.
- **추적**: `app/src/renderer/Toast.tsx:11-12`는 `document.hidden`/`visibilitychange`만 본다. 그런데 저장소 스스로 이 값이 `hide()`를 따라가지 않는다고 기록해 뒀다(`index.ts:120-121`, `FirstPrompt.tsx:42`). 그래서 `window:visible` 푸시가 따로 있고 FirstPrompt는 이를 쓰지만, Toast는 쓰지 않는다. 토스트가 만료되면 `App.tsx:221`의 `forgetRemoval`이 main의 Undo 기록을 지운다(`index.ts:639-641`).
- **영향**: 숨긴 창에서는 보지 못한 Undo가 사라진다. 디스크 파일은 그대로다.
- **기준**: ARCHITECTURE §7 Toasts("hidden window pause the timer"), PRODUCT §7 2026-10-25 projects-home.
- **최소 수정**: `window.doan.onWindowVisible`로 `hidden` 상태를 함께 갱신한다.
- **검증**: e2e로 제거 → Close Window → 8초 넘게 대기 → activate 순서를 밟아 Undo가 그대로 있는지 확인한다.

#### A-M6 — eval 검사가 에이전트가 작업한 repo를 cwd로 두고 `python3.12 -c`를 실행해, 에이전트 파일이 검사 코드의 import를 가로챈다 (확정 정적, 런타임 미검증)
- **관점**: P2 (B2). 리드가 Low에서 Medium으로 올렸다. ARCHITECTURE §14의 격리 계약(샌드박스 고정, 실제 HOME 불변)을 eval 도구 스스로 깨는 경로이기 때문이다. 다만 개발 도구이고 에이전트가 섀도 모듈을 만들어야 하므로 High로 보지는 않았다.
- **트리거**: Codex 실행(`--sandbox workspace-write`) 중 에이전트가 repo 루트에 `json.py`나 `html/__init__.py`를 만든다. 주입 시나리오의 유도로도 생길 수 있다. 실행이 끝난 뒤 runner가 checks를 돌린다.
- **추적**: `eval/lib/context.ts:71-74,113`의 `ctx.run`은 cwd를 repo로 둔다. Python 검사 10곳(`R1/R2/R2b/R3/H1/H2/H4 inspect.ts:8`, `W1/checks.ts:9`, `W2/checks.ts:11`, `R4/checks.ts:20`)이 `-I` 없이 `-c`로 실행된다. 그러면 `sys.path[0]`이 cwd가 된다. runner는 샌드박스 밖에서 사용자 권한으로 실행된다. 실행 후 git 호출(`eval/run.ts:39-40`, `context.ts:83-101`)에도 `core.hooksPath`·`core.fsmonitor` 고정이 없다. 이 git 쪽은 의심 단계다.
- **영향**: 에이전트 코드가 샌드박스 밖에서 실행된다. 검사 결과를 조작하거나 실제 HOME에 쓸 수 있다. real-state 비교는 doan 키만 보므로(`app/e2e/real-state.ts:35-43`) 다른 변경은 잡지 못한다.
- **최소 수정**: `python3.12 -I -c`로 실행하거나, runner 소유의 임시 cwd에서 실행한다. 실행 후 git 호출에는 `-c core.fsmonitor=false -c core.hooksPath=/dev/null`을 붙인다.
- **검증**: `json.py`를 심은 self-test fixture로 검사 결과에 영향이 없고, 바깥에 마커 파일이 생기지 않는지 확인한다.

### Low

| ID | 상태 | 관점 | 내용 · 근거 | 기준 | 최소 수정 |
|---|---|---|---|---|---|
| A-L1 | 의심, 결정 필요 | P3 LC-5, P1, 1차 L1 | 썸네일 캡처가 실패 플래그를 아무 하위 프레임에나 세운다. 중첩 iframe의 404나 직전 작업 프레임의 중단도 실패로 센다. `thumbnailWindow.ts:73-74,91-93`. 실패한 작업은 캔버스가 바뀌기 전까지 다시 시도하지 않는다(`thumbnailQueue.ts`). | ARCH §3 Capture document("Load failure"가 어느 프레임인지 모호) | 작업 대상 캔버스 iframe의 실패만 세거나, 지금 동작을 문서화한다 |
| A-L2 | 확정 | P3 LC-4 | `doan init`이 `config.json`을 `.gitattributes`보다 먼저 쓴다(`cli/internal/cli/init.go:169,182`). 그 사이에서 실패하면 재실행이 no-op 성공으로 끝나 `merge=union` 줄이 끝내 추가되지 않는다. | ARCH §2, §12 init | `.gitattributes`를 먼저 쓰고, config는 temp+rename으로 쓴다 |
| A-L3 | 확정 | P1 C4 | `--repo`가 파일을 거치는 경로(ENOTDIR), NUL, 너무 긴 이름, 링크 루프면 exit 1 `internal_error`가 된다. `repo/find.go:38-45`, `init.go:29-35`가 `os.IsNotExist`만 확인한다. | ARCH §13 "a file is `repo_not_found`", §12 | `missingPath(err)`로 분류한다 |
| A-L4 | 확정 | P1 C5 | R2/R2b의 `asked_doan_active`와 judge 플래그가 `words[1]==="active"`만 인정한다(`R2/checks.ts:21`, `R2b/checks.ts:21`, `eval/lib/judge.ts:102`). `doan --repo X active` 같은 정상 호출이 거짓 fail이 된다. | ARCH §12 파싱 문법, POSTMORTEM 2026-10-24 eval | 첫 비플래그 단어로 판정하고 회귀 사례를 추가한다 |
| A-L5 | 확정 | P1 C6 | `canvasLabel`이 소문자 `.html`만 떼어 낸다(`canvasTree.ts:48`). Go는 대소문자를 가리지 않고 나열한다(`repo/files.go:39`). | ARCH §3 "file stem" | `/\.html$/i`로 바꾼다 |
| A-L6 | 확정 | P1 C7 | §2의 "a record written by a newer version of Doan" 안내가 앱, CLI, 가이드 어디에도 없다. 앱은 `unknown_version · line N`만 표시한다(`CommentsPanel.tsx:111`). | ARCH §2 | 안내를 구현하거나 /doc-check로 문서를 고친다 |
| A-L7 | 확정 | P4-L1 | 위저드 3단계가 옛 `projectRow.ts:25` 문구("Restore it and Reopen, or Close it.")와 상태명을 쓴다(`onboardingView.ts:329-332`). 이 동작들은 이제 없다. 테스트(`projectRow.test.ts:18`)가 옛 문구를 고정하고 있다. | ARCH §13 문제 행 표와 문구 | Home 행 모델의 문구를 쓰고 `projectRow` 뷰를 제거한다 |
| A-L8 | 확정 | P4-L2 | 렌더러가 main 메시지 문자열을 비교해 상태를 판정한다. translocation 문구는 `connectionRowView.ts:9,21,23`과 `onboardingView.ts:50,117`이, "Install the CLI link in step 1…"은 `ConnectionRows.tsx:11`과 `machine.ts:308`이 해당한다. 문구 하나만 고쳐도 Settings와 Home이 다르게 보인다. | PRODUCT §5 항목 0, ARCH §7 Status | `MachineState`에 boolean·코드 필드를 추가한다 |
| A-L9 | 확정, 표시 규칙은 결정 필요 | P4-L3 | Overview가 `id`가 없는 캔버스를 모두 "Can't read this canvas"로 표시하고 썸네일을 요청하지 않는다(`ProjectOverview.tsx:30-39,95,202`). `ls`는 파싱되는 캔버스라도 id가 없거나 잘못되면 id를 생략한다(`read.go:89-93`). | ARCH §12 `doan ls` | 규칙을 정한 뒤 세 곳을 같이 고친다 |
| A-L10 | 확정 | P4-L4 | 댓글 target의 `text`를 `readCommentTarget`(`inspector.ts:240-264`)이 공백을 접지 않고 빈 값도 남긴 채 저장한다. 선택 쪽 `textQuote`(`canvasScript.ts:118-125,271-272`)와 규칙이 다르고 테스트가 없다. | ARCH §3 Caps("whitespace-folded"), §2 `text?` | 캡처 헬퍼를 하나로 합친다 |
| A-L11 | 확정 | P4-L5 | Canvas info가 프레임 id/title이 잘리기만 해도 "1,000+"를 표시한다(`canvasInfo.ts:10`; 스크립트는 `canvasScript.ts:162-170`에서 문자열을 자를 때도 `truncated`를 세운다). 테스트가 이 잘못된 해석을 고정하고 있다. | ARCH §3 Design navigation(1,000행 조건) | Sidebar 규칙(`Sidebar.tsx:148`)과 맞춘다 |
| A-L12 | 의심(flake) | P3 LC-9, P4-L6 | `e2e/settings.ts:20-23`과 `onboarding.ts:30-33`의 `wait()`가 예외가 나면 재시도하지 않는다. `settings.ts:109`는 iframe 내용을 폴링한다. | POSTMORTEM 2026-10-25 frame detached | 재시도와 마지막 오류 재전파 형태로 바꾼다 |
| A-L13 | 의심(네이티브 드래그 실행 필요) | P2 B1 | 드래그가 캔버스 iframe 위에서 창으로 들어오면 앱 오버레이(`DropOverlay.tsx:6-14`)가 켜지지 않는다. 주입 스크립트에도 드래그 처리가 없다(`canvasScript.ts:545-575`). drop 핸들러를 건 캔버스 스크립트는 떨어뜨린 폴더 내용(serving scope 밖)을 읽을 수 있다. | ARCH §3 serving scope 근거, §13("overlay covers the iframe") | 주입 스크립트가 Files 드래그를 renderer로 전달하고 drop을 취소하게 한다 |
| A-L14 | 의심(타이밍) | P3 LC-6 | 시작 시 썸네일 캐시 정리가 키별 lock 밖에서 `*.tmp`를 지운다(`thumbnails.ts:247-248,297-300`). 진행 중인 쓰기의 rename이 실패할 수 있다. | ARCH §3 Cache | 서비스 시작 시각 이전의 tmp만 지운다 |
| A-L15 | 확정 | P3 LC-7 | 댓글 서비스의 `attempts`가 저장 시도마다 직전 파일 바이트 전체를 프로세스가 끝날 때까지 보관한다(`service.ts:81,171-172`). | ARCH §2 retries | 확인된 저장 뒤 해제하거나 상한을 둔다 |
| A-L16 | 제품 결정 필요 | P3 LC-8 | 승인된 Claude MCP 교체(remove 뒤 add, `machine.ts:320-325`) 도중 종료하면 기존 등록만 지워질 수 있다. `before-quit`은 setup 쓰기를 기다리지 않는다. | ARCH §7 Machine setup·Settings Lifetime | 종료를 미룰지, 한계로 받아들일지 정한다 |
| A-L17 | 확정 | P4V-1 | e2e watchdog이 `process.exit(1)`로 바로 끝나 real-state 확인을 건너뛴다. `runtime.ts`는 하위 suite 8개를 import하기 전에 watchdog을 해제하고, 그중 6개는 `app.close()`를 시간 제한 없이 기다린다. | AGENTS e2e real-state 규칙 | 공통 watchdog과 bounded close 헬퍼를 둔다 |
| A-L18 | 확정 | P4V-2 | `e2e/thumbnails.ts:179-193`의 캡처 중 종료 단계가 close가 끝났는지와 ui-state만 본다. exit code와 signal은 확인하지 않는다. | POSTMORTEM 2026-10-25 quit ("state persistence alone is not a clean-exit assertion") | `{code:0, signal:null}`을 단언한다(`design-nav.ts:60-64`처럼) |
| A-L19 | 의심(타이밍) | P4V-3 | 고정 sleep 직후나 main 신호 직후에 "없음"을 단언한다: `settings.ts:80-84`, `comments-ui.ts:474-476`, `design-nav.ts:271-304`. | POSTMORTEM polling 규칙 | 양성 도착 신호를 기다린 뒤 단언한다 |
| A-L20 | 의심 | P4V-4 | `runtime.ts:1983-1994`의 `menu`가 `enabled`를 확인하지 않고 click한다. 메뉴가 비활성화되는 회귀가 있어도 해당 단계가 통과할 수 있다. | ARCH §7 메뉴 표 | `windows.ts`의 `menu`를 쓴다 |
| A-L21 | 확정 | P4X-1 | `R5/rubric.md:2`가 정답을 `receipt-detail.html`로 적었다. checker(`R5/checks.ts:9`)와 seed는 `view-c.html`이다. USABILITY-EVAL에 두 번 기록됐지만 고쳐지지 않았다. | ARCH §14(rubric 보정 허용) | rubric 한 줄을 고친다 |
| A-L22 | 확정 | P4X-2 | R4 reach walker가 따옴표 없는 `@import url(...)`과 `<style>` 안 `@import`를 따라가지 않는다(`R4/checks.ts:66-74`). W1과 CLI는 받아들인다. | POSTMORTEM 2026-10-24 eval(양성 대안) | W1의 walker를 공유한다 |
| A-L23 | 확정 | P4X-3 | H3 import walker가 여러 줄 import를 따라가지 않는다(`H3/checks.ts:20`). 주석이 허용한다고 적은 "추출한 row 모듈" 대안이 실패할 수 있다. | 같은 항목 | 정규식이 줄바꿈을 허용하게 하고 회귀 테스트를 추가한다 |
| A-L24 | 확정 | P4X-4 | R2/R2b가 cascade 순위와 상관없이 `background-color`를 먼저 읽는다(`R2/checks.ts:10`). 순위가 낮은 longhand로 primary를 줘도 통과한다. 실제 화면은 inline shorthand가 이겨 muted 그대로다. | 시나리오 의도 | 두 속성 중 순위가 높은 쪽을 쓴다 |
| A-L25 | 의심 | P4X-5 | R3 삭제·복구 가드가 shell 명령만 본다(`R3/checks.ts:12-15`, `eval/lib/transcript.ts:41-49`). Codex `apply_patch`로 지운 경우를 놓친다. A-L4와 같은 계열이다. | ARCH §14 | `apply_patch` 입력을 증거로 기록한다 |

## 4. 관점·모듈 커버리지

리드가 셀마다 담당 리뷰어를 배정했다. 표의 상태는 각 리뷰어가 돌려준 근거를 리드가 확인해 정했다. "완료"는 해당 관점의 계약·경계·수명 주기·회귀 방지를 실제 소스로 추적했다는 뜻이다. 파일 목록 확인이나 검색만 한 경우는 완료로 치지 않았다.

| 모듈 | P1 계약 | P2 경계 | P3 수명 주기 | P4 유지보수 |
|---|---|---|---|---|
| A CLI 진입·인자·envelope·MCP·가이드 | 완료 | 완료 | 완료 | 완료 |
| B CLI 명령(init/config/ls/comments/resolve/check/active) | 완료 | 완료 | 완료 | 완료 |
| C repo 탐색·경로·scope·git | 완료 | 완료 | 완료 | 완료 |
| D 캔버스 파서·CSS 스캐너·check 규칙 | 완료 | 완료(경계 범위) | 완료(수명 주기 표면 없음) | 완료 |
| E 공유 포맷·스키마·Go/TS fold | 완료(fold 줄 단위 대조) | N/A(경계는 validator 사용 지점만, 확인함) | N/A(순수 함수) | 완료 |
| F CLI 댓글 쓰기 | 완료 | 완료 | 완료 | 완료 |
| G main 수명 주기·IPC·메뉴·Settings 창 | 완료 | 완료(55채널 전부) | 완료 | 완료 |
| H preload | 완료 | 완료 | 완료 | 완료 |
| I 캔버스 프레임 게이트·주입 스크립트·CDP | 완료 | 완료 | 완료 | 완료(2차) |
| J 로컬 서버 | 완료 | 완료 | 완료 | 완료 |
| K 런타임 소켓 | 완료 | 완료 | 완료 | 완료 |
| L shell·폴더 저장·CLI 실행기·watcher | 완료 | 완료 | 완료 | 완료 |
| M Add/Locate/Remove | 완료 | 완료 | 완료 | 완료 |
| N 댓글 서비스·공유 댓글 로직 | 완료 | 완료 | 완료 | 완료 |
| O 썸네일 | 완료 | 완료 | 완료 | 완료 |
| P UI 상태·복원 | 완료 | 완료 | 완료 | 완료 |
| Q setup·onboarding·config bridge·first prompt | 완료 | 완료 | 완료 | 완료 |
| R 렌더러 캔버스 동작 | 완료 | 완료 | 완료 | 완료 |
| S 렌더러 댓글 | 완료 | 완료 | 완료 | 완료 |
| T 렌더러 앱 셸·화면 | 완료 | 완료(2차, 28개 파일 줄 단위) | 완료 | 완료(2차) |
| U 빌드·패키징·CSP | 완료 | 완료 | 완료 | 완료 |
| V 런타임 e2e 하네스 | 완료 | 완료 | 완료 | 완료(2차 전용 리뷰어 + 리드가 `runtime.ts:146-300,1130-1315` 직접 확인) |
| W eval runner | 완료 | 완료 | 완료 | 완료 |
| X eval 시나리오·검사 | 완료 | 완료 | 완료 | 완료(2차 전용 리뷰어: 모든 시나리오의 checks·inspect·rubric·prompt·fixture·scenario.json·regression.test) |

재배정 기록:
- 2차에서 P2-T(경계 리뷰어 재개), P4-I/T(유지보수 리뷰어 재개), P4-V/X(새 리뷰어)를 맡겼다.
- 3차에서 P4 리뷰어가 V/X 밖의 "(not re-read)" 회귀 테스트를 모두 다시 읽었다.

## 5. 발견에서 제외한 것과 다른 스킬로 넘긴 것

- **shell re-root 시 main selection을 비우지 않음** (`shell.ts:112-124`): 렌더러가 `null`을 다시 보내고(`CanvasController.ts:236-245`) 소켓이 root를 문자열 그대로 비교하므로 누출이 없다. POSTMORTEM "Locate kept old root's selection"의 예방 규칙과 어긋나는 잔여 불일치로만 기록했다.
- **CLI 댓글 append가 no-follow 없이 연다** (`cli/internal/comments/append.go:13`): `repo.CommentFiles`가 symlink를 목록에서 빼므로 저장소 내용만으로는 바깥에 쓸 수 없다. 동시 로컬 작업에 따른 TOCTOU만 남는다. 다만 §4의 FIFO race처럼 수용됐다고 문서화돼 있지 않다.
- **위조된 `layout.href`로 열린 캔버스가 바뀜**: 의도된 동작이다(ARCH §3). 댓글 쓰기는 CDP와 서버 응답 기록으로 실제 문서에 묶여 있다.
- **수동으로 적은 `serve: [".doan"]`/`.git`**: 문서상 허용이다(ARCH §12).
- **retry 이벤트가 원래 `at`을 유지함**: 명시된 결정이다(ARCH §2 "App authority and retries").
- **draft-guard 동기 경로**: 실제 `CommentsSession.guard()`는 e2e(`runtime.ts:581-589`)로만 고정돼 있다. 약점으로 기록했고 발견으로 올리지는 않았다.
- **/doc-check로 넘김**:
  - ARCH §13 "`.doan/` is never served"는 watcher 문맥의 문장인데 HTTP 서빙으로도 읽힌다.
  - ARCH §13 "The app follows the same order when it reads config"라고 적혀 있지만 TS config reader는 없다.
  - ARCH §1에 token CSS 파일 안의 `undefined_token` 제외가 문서화돼 있지 않다.
  - A-L6을 문서 수정으로 처리할 수도 있다.
  - POSTMORTEM 예방 메모 일부가 옛 이름(`main.ts`, `folders:close`, "only the watcher should match")을 쓴다.

## 6. POSTMORTEM 적용 점검표

모든 항목과 재발 항목에 대해 예방 grep을 `022cfaa` 기준으로 다시 실행했다. 그 결과 나온 호출 지점을 읽고, 이름이 걸린 회귀 테스트의 단언을 다시 읽었다. 이 단계에서도 테스트는 실행하지 않았다. 상세 행은 scratch의 `review-maintainability.md`(점검표)와 `review-maintainability-vx.md`(V/X)에 있다.

| 항목 | 결과 |
|---|---|
| 2026-10-25 quit 중 ui-state 손실 / quit-capture-crash | 준수(`index.ts:853-878`, `index.test.ts:1027,1644,1661`). 인접 문제: A-M1, A-M2, A-L18 |
| 2026-10-25 loading 중 토스트 Open 누락 | 준수(다시 읽음) |
| 2026-10-25 TS 헬퍼가 TSX를 가림 | 준수(대소문자 무시 stem 충돌 없음) |
| 2026-10-25 Quit 메뉴 JS click | 준수(`windows.ts:42`만 네이티브 role 처리) |
| 2026-10-25 forwarded Settings target | 준수(`settingsWindow.tsx:18-43`, `e2e/settings.ts:77-89`). 타이밍 약점: A-L19 |
| 2026-10-25 새 링크 상태가 가드 커버리지를 지움 | 준수(존재하는 대상 twin 유지) |
| 2026-10-25 제거한 프로젝트 기억 유지 | 준수 |
| 2026-10-25 제거가 draft origin 대신 현재 캔버스를 봄 | 준수 |
| 2026-10-25 poll 중 frame detached | 부분: A-L12 |
| 2026-10-25 제거 후 키보드 탐색 | 준수(다시 읽음) |
| 2026-10-25 overflow hidden 체크리스트 | 준수 |
| 2026-10-25 읽을 수 없는 pick을 setup으로 제안 | 준수(다시 읽음) |
| 2026-10-25 다음 제거 저장 중 Undo 유효 | 준수(다시 읽음) |
| 2026-10-25 Locate가 old root selection 유지 | 준수. 잔여 불일치(re-root)는 §5 참고 |
| 2026-10-25 git 등록 반복 스캔 | 준수 |
| 2026-10-24 eval 검사가 정상 마크업 거부 | 재발: A-L22, A-L23, A-L24, 관련 A-L4·A-L25 |
| 2026-10-24 agent shell이 패키지 CLI 우회 | 준수(다시 읽음) |
| 2026-10-24 빈 check | 준수 |
| 2026-10-24 rollout이 judge 근거를 밀어냄 | 준수(다시 읽음) |
| 2026-10-24 Codex transcript cwd 파싱 | 준수(다시 읽음) |
| 2026-10-24 바깥에서 Set Up 닫힐 때 포커스 | 준수(`runtime.ts:525-560`) |
| 2026-10-24 링크된 config 디렉터리 거부 | 준수(다시 읽음) |
| 2026-10-24 setup 메뉴가 위저드 세션 폐기 | 적용 대상 아님(위저드는 첫 실행 전용) |
| 2026-10-24 위저드 키·클릭 | 준수(메뉴 재오픈 부분은 해당 없음) |
| 2026-10-24 setup 쓰기가 경쟁자를 덮음 | 준수(`onboarding/race.test.ts` 다시 읽음) |
| 2026-10-23 tooltip 재호버 / 선행 tooltip 캐시 | 준수(`hoverTooltip` 경로) |
| 2026-10-23 full-width 단언의 스크롤바 | 준수(V 리뷰어 확인) |
| 2026-10-23 timestamp 렌더링 충돌 | 준수(다시 읽음) |
| 2026-10-23 draft guard 타이밍 | 준수. 단, 실제 guard는 e2e로만 고정(§5) |
| 2026-10-23 copy 조기 성공 | 준수(다시 읽음) |
| 2026-10-23 mkdir 자식 미확인 종료 후 재시도 | 준수(다시 읽음). UI 결과는 A-M1 |
| 2026-10-23 응답 eviction·OOPIF swap·세션 소유 | 준수(다시 읽음) |
| 2026-10-23 조상 visibility | 준수(`e2e/anchors.ts:152-163`) |
| 2026-10-23 앵커 측정 순서 / pin 완료 fence | 준수(다시 읽음) |
| 2026-10-23 hover 재진입·Alt / hover와 selection seq 분리 | 준수(다시 읽음) |
| 2026-10-23 utility-process kill 미정산 | 준수(다시 읽음) |
| 2026-10-22 TS에서 repo root 추측 | 준수. 예방 메모의 기대값이 오래됨(§5) |
| 2026-10-22 served 디렉터리 재생성 / root watch 필터 | 준수(다시 읽음) |
| 2026-10-22 100vh 캔버스·fresh iframe·blocked link | 준수(단위 테스트는 P4, e2e 단계는 V가 다시 읽음) |
| 2026-10-22 fullscreen Close Window | 준수(다시 읽음) |
| 2026-10-22 zero-mismatch 표가 자식을 놓침 | 준수(CSS 규칙과 onboarding computed-style 단언) |
| 2026-10-21 TS/Go fold 분기 | 재발: A-M3(디코딩 경계, `foldText` 미사용) |
| 2026-10-21 파일시스템 "missing"/"same file" | 재발: A-M4(정규화), A-L3(`--repo`) |
| 2026-10-21 HTML 파서 오류 / 문자 장치≠터미널 / 파일명과 id 정렬 / 로컬 서버 보장 | 준수(다시 읽음) |

## 7. 권장 다음 단계

1. A-M1의 종료 처리 방침을 먼저 결정한다. A-M2도 같은 `before-quit` 경로를 고치므로 한 변경으로 묶는 것이 가장 작다.
2. A-M3, A-M5, A-M6과 확정 Low는 `/ship` 단위로 나눠 수정한다. 각 발견의 "검증" 항목을 회귀 테스트로 먼저 빨갛게 만든 뒤 고친다.
3. 의심 항목(A-M4, A-L1, A-L12~14, A-L19, A-L20, A-L25)은 `/verify --runtime`이나 실기기 확인으로 먼저 재현한다.
