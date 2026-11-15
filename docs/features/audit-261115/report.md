# 코드베이스 audit — 2026-11-15 (audit-loop 1라운드)

- 실행일: 2026-11-15. 리드는 audit-loop 1라운드 중 세션 한도로 중단됐고, 같은 날 새 리드가 이어받았다.
- 리뷰한 checkout: `develop`. HEAD는 `f4829b780`에서 시작했고, 이어받을 때는 `bfbb6caaa`였다. 그 사이 커밋은 skill과 AGENTS 문서만 바꿨으므로 코드는 같다.
- 워킹트리: 세션 전부터 untracked였던 `.doan/seen/` 외에는 깨끗하다.
- 범위: 저장소 전체(요청 축소 없음).
- 완료 상태: **완료** (정적 범위). 리뷰어 원본은 `.scratch/audit/261115-r1/`에 있다(`brief.md`, 관점별 보고서, `verify.md`).

## 실행 한계와 덜 본 곳

- 정적 검토만 했다. 테스트, 빌드, 실제 앱 실행은 하지 않았다. SUSPECTED 항목(B-1, B-3, M-11)은 실행해야 확정된다. 예외로 검증자가 C-3에 node 정규식 한 줄을 실행했다.
- 유지보수 관점은 renderer(약 31k줄)와 main root(약 11k줄)를 줄 단위로 읽지 않았다. 대신 트리 전체에 다섯 가지 검사를 돌렸다: 테스트 밖에서 안 쓰이는 export, 한 번만 나오는 선언, 같은 값을 가진 상수, 복제 표시 주석, 제거된 기능의 이름. 그래서 이름이나 값, 표시 없이 같은 규칙을 두 번 쓴 경우는 놓쳤을 수 있다. 같은 파일들은 수명주기·계약·경계 리뷰어가 각자 관점에서 읽었다.
- 1차 리뷰어 3개(계약 2차, 수명주기 2차, 유지보수)가 한도로 중단됐다. 새 리드가 남은 범위만 다시 돌렸다.

## 진행 방식

- 리뷰어는 네 관점(계약과 불변식 C, 경계 B, 수명주기와 실패 L, 유지보수와 회귀 방지 M)마다 하나씩 두었다. 미완료 칸은 2차 리뷰어가 마저 봤다.
- 발견 33건은 독립 검증자 하나가 HEAD의 소스에 다시 대조했다. REFUTED는 0건이고, 5건은 범위나 심각도를 고쳤다(ADJUST).
- B-1과 B-3은 리드가 직접 확인했다.
- "사용자에게 보임"은 audit-loop의 기준을 따른다. 고치려면 PRODUCT나 ARCHITECTURE 규칙을 바꿔야 하거나, 사용자가 겪는 흐름·동작·화면이 바뀌면 "예"다.

## 발견 — High

### B-1 [High] [SUSPECTED] [사용자에게 보임] 저장소의 `.claude/settings*.json`이 바깥 fence를 끄고, hook·MCP 서버를 sandbox 밖에서 돌게 할 수 있다
- 관점: 경계
- 트리거: 에이전트가 쓴 파일이나 clone한 저장소에 커밋된 `.claude/settings.json`·`settings.local.json`에 `sandbox.enabled: true`와 hook(또는 `enableAllProjectMcpServers` + `.mcp.json`)이 함께 들어 있다. 이때 다음 Claude 턴은 다음과 같이 흘러간다.
  - `runFence`가 project·local 소스를 읽는다(`app/src/main/conversation/prepare.ts:156-160`).
  - `claudeSandboxEnabled`가 참이 되어 `sandbox-exec` 없이 시작한다(`runners.ts:359-360`).
  - SDK는 `settingSources: ["user","project","local"]`로 그 hook과 MCP를 실행한다(`runners.ts:341`).
  - flag-tier `claudeFenceSettings`는 도구 deny와 Bash sandbox만 막는다(`agentAuth/fence.ts:185-189`).
- 영향: hook이나 MCP 프로세스가 다른 provider의 profile(평문 작업 사본), `conversations/`, vault를 읽을 수 있다.
- 근거와 권위: ARCHITECTURE §7 'Agent authentication' 'Fence'는 모든 권한 모드에서 userData를 막는다고 적는다. 하지만 같은 절의 수용된 한계(ARCHITECTURE.md 812행)가 "a repository's `.claude/settings.json` hooks, `.mcp.json` can run later outside it"이라고 이미 인정한다. 2026-11-09 postmortem은 profile 쪽 설정 경로만 닫았다.
- 판단: 막으려면 문서화된 한계를 바꿔야 하고, 사용자 저장소의 hook과 MCP가 Doan 대화에서 돌지 않게 된다. 그래서 정책 결정이 필요하다 → BACKLOG.
- 제안: 실행별 `managedSettings`에 `allowManagedHooksOnly`와 MCP 허용 목록을 넣는다. 또는 project 소스에 hook이나 MCP가 있으면 바깥 fence를 유지한다. 확인 방법은 둘이다: runner 테스트, 그리고 1턴에 hook을 심고 2턴에서 decoy profile을 읽지 못하는지 보는 `/runtime-test` probe다.

## 발견 — Medium

### B-2 = C-4 = M-13 (+M-10) [Medium] [CONFIRMED] [보이지 않음] real-state 가드가 agent setup과 앱이 쓰는 파일 일부를 감시하지 않는다
- 관점: 경계, 계약, 유지보수(세 리뷰어가 따로 찾았다)
- 트리거: 실제 HOME으로 새는 probe가 있거나 agent setup 대상이 회귀한다.
  - agent setup의 `claude-allow` 대상은 `~/.claude/settings.json`이다(`app/src/main/agentSetup/plan.ts:189`, 946f4ea1f). 그런데 `app/runtime/real-state.ts:74-81`의 목록과 `AUTH_FILES`(:47)에 이 파일이 없다.
  - 앱이 쓰는 userData 항목 7개도 빠져 있다: `preferences.json`, `auto-folders.json`, `canvas-seen.json`, `mcp-connectors*.json` 2개, `star-prompt.json`, `attachments/`.
  - 반대로 plan이 더 쓰지 않는 `.cursor/skills/doan`과 `.copilot/skills/doan`이 아직 목록에 남아 있다.
- 영향: 사용자 상태가 바뀌어도 `assertRealState`가 통과한다. 이 가드는 모든 probe가 "실제 상태 불변"을 증명하는 근거다.
- M-10: 형제 폴더 `Application Support/doan*`도 감시하지 않는다(같은 파일).
- 권위: AGENTS 'Commands'(Applications 사본은 Claude Code allow 규칙을 쓴다), ARCHITECTURE §7 'Agent setup', postmortem 2026-10-30·2026-11-14.
- 제안:
  - `settings.json`은 파일 전체 대신 Doan의 allow 규칙만 해시한다. 사용자의 Claude Code가 이 파일을 계속 다시 쓰기 때문이다. `$CLAUDE_CONFIG_DIR`도 포함한다.
  - 빠진 userData 항목을 추가한다.
  - `real-state.test.ts`에 "plan의 모든 대상 경로가 snapshot에 있다"는 테스트를 넣는다.
  - 확인: `node --test 'app/runtime/*.test.ts'`

### B-3 [Medium] [SUSPECTED] [보이지 않음] main이 저장소나 에이전트가 쓸 수 있는 경로를 `O_NONBLOCK` 없이 연다 — FIFO나 장치 파일이면 멈춘다
- 관점: 경계
- 트리거(하나만 있어도 된다):
  - FIFO `.doan/assets/x.png`를 canvas가 4번 참조한다. `serve/server.ts:33-35,89`의 `openNoFollow`가 libuv worker 4개를 모두 묶는다.
  - `.doan/seen/<id>.json`이 FIFO다(`seenRecords.ts:113`).
  - 목록에 있는 canvas가 FIFO로 바뀐다(`seenFingerprint.ts:23`).
  - 등록된 저장소의 `.git/config`에 `[include] path = /dev/zero`가 있다. `onboarding/gitConfig.ts:118-144`의 `readFileSync`가 main thread를 막는다.
  - profile 안의 `.claude.json`이나 `.copilot/config.json`이 FIFO다(`agentAuth/providers.ts:62,101`).
- 영향: 앞의 세 경우는 모든 폴더의 canvas, 썸네일, seen 쓰기가 멈춘다. 뒤의 두 경우는 앱이 멈추거나 죽는다.
- 권위: 코드 안 불변식 `conversation/io.ts:14` "opening a FIFO must never block main". `attachments.ts:42`, `acpRunner.ts:189`, CLI `active.go`, `export/resolve.go`는 이미 이 불변식을 따른다. postmortem 2026-10-21 두 건도 관련된다.
- 제안: 세 곳에 `O_NONBLOCK`을 붙이고 기존 `isFile()` 검사가 거절하게 한다. `gitConfig.ts`와 `providers.ts`는 `O_NONBLOCK|O_NOFOLLOW`, `isFile()`, 크기 제한을 갖춘 helper 하나로 읽는다. 각 테스트에 `mkfifo` 사례를 넣는다.

### M-8 [Medium] [CONFIRMED] [보이지 않음] 재발: O4 시나리오가 에이전트 저장소에서 `checkedGit` 없이 `git status`를 실행한다
- 관점: 유지보수
- 근거: `eval/scenarios/O4/checks.ts:5-7`. 안전한 경로는 `eval/lib/context.ts:64-77`의 `checkedGit`이다.
- 영향: 에이전트가 심은 git 설정(hook, fsmonitor)이 eval inspection에서 실행될 수 있다.
- 권위: postmortem 2026-10-25 "Eval inspection executed repo-configured helpers".
- 제안: `checkedGit`을 쓰게 하고, 이를 고정하는 테스트를 넣는다.

## 발견 — Low

모두 사용자에게 보이지 않는다(C-1만 예외).

| id | 관점 | 내용 | 근거 | 제안 |
|---|---|---|---|---|
| C-1 | 계약 | 확장자가 대문자인 `.HTML` canvas는 `ls`와 `check`에는 나오지만, app의 `work`·`open`·`handoff`는 `usage_error`로 끝난다. **사용자에게 보임**: §4 'Paths'는 소문자 `*.html`만 받는다고 정했다. 어느 쪽으로 고치든 ARCHITECTURE 규칙이 바뀐다 | 계약 보고서 C-1 | 정책 결정 후 처리(보고서에만 남김) |
| C-2 | 계약 | canvas 이름(stem)을 `canvasLabel`을 거치지 않고, 대소문자를 구분하는 `.html` 제거로 5곳에서 따로 만든다(2026-11-05 postmortem 재발) | `canvasRowMessages.ts`, `ShellSidebar.tsx:319`, `canvasNotice.ts:11`, `canvasOrder.ts:4`, `revealDecision.ts:69` | `canvasLabel`로 통일 |
| C-3 | 계약 | U+FEFF만 있는 handoff 메시지를 CLI는 통과시키지만 app은 거부한다. CLI는 이를 `internal_error`로 보고한다 | `handoff_rules.go` vs app `/\S/u` | Go 쪽 검사에 BOM을 더하고 공유 fixture를 추가 |
| C-5 | 계약 | eval의 "실행 안 함" 검사(D4b, R8d·R9b `no_handoff`, `no_doan_open`)가 `commandWords`의 incomplete 표시를 버린다. 그래서 `if …; then brew install doan; fi`를 놓친다(2026-11-07 postmortem 재발) | `eval/lib/handoff.ts`, `open.ts`, `scenarios/D4b/base.ts` | incomplete면 해당 검사를 판정 불가로 처리 |
| L-1 | 수명주기 | `OwnedGroup.stop()`·`kill()`이 그룹이 일찍 끝나도 항상 2초를 기다린다. 그래서 모델·스킬 목록을 읽을 때마다 2초가 더 걸린다 | `conversation/process.ts:22-45` | `observe()`가 종료를 감지하면 resolve |
| L-2 | 수명주기 | 대화 index나 undo 쓰기가 실패하면 `*.tmp`가 남고, 정리하는 곳이 없다 | `conversation/store.ts` (`drafts.ts`와 다르게 동작) | 실패 경로에서 temp 삭제 |
| L-3 | 수명주기 | 쓰기를 이미 거부하는 기록에 quit이 `interrupted/appQuit`을 append하다 throw한다. 그러면 뒤에 남은 runner가 닫히지 않는다 | `conversation/service.ts` quit 경로 | `failedPersistence`를 확인하거나 runner별로 try 처리 |
| M-1 | 유지보수 | eval의 CLI 플래그 표에 그 뒤 추가된 플래그가 빠져 있다. 그래서 `doan init --storage`를 O3의 `no_doan_init`이 잡지 못한다(검증 결과 Medium→Low: `repo_untouched`가 실패시키므로 실패 원인만 다른 check로 잡힌다) | `eval/lib/transcript.ts:11-12` vs `cli/internal/cli/run.go:160-178` | 플래그 추가, `run.go`와 비교하는 drift 테스트 |
| M-2 | 유지보수 | 지워진 Settings 창이나 "main window only"를 설명하는 낡은 주석이 남아 있다 | `service.ts:286,288`, `index.ts:1283`, `preload/index.ts:329`, `agentAuth/ipc.ts:6`, `senderAllowed.ts`, `CanvasAgent.tsx:145`, `dockedBuddyCore.ts:36` | 주석 수정 |
| B-4 | 경계 | prototype preload의 머리 주석은 "no delete"라고 하지만, 실제로는 `conversation:delete`를 노출한다 | `preload/prototype.ts:3-4` vs `:37,146` | 주석 수정 |
| M-3 | 유지보수 | `claude-frames-*-next-turn-after-stop` fixture를 읽는 테스트가 없다(README는 이미 transcripts만 읽는다고 적고 있다) | `conversation/fixtures` | 테스트로 읽거나 삭제 |
| M-4 | 유지보수 | `openFrameMax`와 `workNoteMax`가 schema `maxLength`의 복사본인데, 둘을 묶는 테스트가 없다 | open·work rules | schema를 읽는 테스트 |
| M-5 | 유지보수 | renderer 상수 `COPY_FAILED`를 읽는 곳이 없다 | `onboardingView.ts` | 삭제 |
| M-6 | 유지보수 | renderer가 main의 event-merge 규칙을 복사해 갖고 있다. 근거로 든 import 금지는 이제 없다 | `conversationStrip.ts`, ARCHITECTURE 455행 | main의 규칙을 import하고 문서 문장을 맞춤 |
| M-7 | 유지보수 | 코드 주석이 promote 뒤 지워지는 feature 문서 id를 인용한다 | `projectStep.ts`, `mcpConnectors/service.ts`, `styles.css`, `mcpConnectors/fixtures/README.md:13` | 이유를 직접 적음 |
| M-9 | 유지보수 | quit teardown이 durable state를 flush하기 전에 prototype 창을 파괴한다. throw하면 will-quit이 다시 flush하므로 실제 영향은 native crash일 때뿐이다(2026-10-25 postmortem의 부분 재발) | `index.ts:1775` | flush를 먼저 하도록 순서 변경, 테스트 |
| M-11 | 유지보수 | [SUSPECTED] prototype 창의 FrameMenu 팝오버에 `useHeaderNoDrag`가 없다(2026-11-06·11-08 postmortem) | `prototype/PrototypeWindow.tsx` | hook 추가 |
| M-12 | 유지보수 | postmortem이 열어 둔 후속 작업 중 Doany WebGL 손실 복구와 R10 단일 handoff 판정이 어디서도 추적되지 않는다(capture-layer 항목은 BACKLOG:146에 이미 있다) | `Doany.tsx:144`, `R10/checks.ts:35`, `handoff-canvases.test.ts` | R10과 테스트는 고치고, Doany는 BACKLOG 등록 여부를 판단 |
| M-14 | 유지보수 | prototype 창의 frame 이름 툴팁이 `open={cut && tip}`으로 상태를 가린다(2026-11-01 postmortem 재발) | `PrototypeWindow.tsx:621` | 상태 분리 |
| M-15 | 유지보수 | `.doan-scroll`이 빠진 스크롤 영역이 3곳이다(2026-11-02 postmortem 재발) | `styles.css:708,1876,1952` | 클래스 추가 |
| M-16 | 유지보수 | 2026-11-07 postmortem이 export temp 파일에 적용한 signal·소유권 규칙이 `replaceExclude`와 config·init temp에는 빠져 있다 | `storage_write.go:83-110`, `cli/config.go:169`, `cli/init.go:228` | signal 정리 추가 |
| M-17 | 유지보수 | `CanvasState.reloading`·`reanchoring`을 계산하고 테스트도 하지만, 읽는 곳이 없다 | `CanvasController.ts` | 삭제 |
| M-18 | 유지보수 | identity 비교에 non-native `realpathSync`가 다시 쓰인다. 이 함수는 입력의 대소문자를 그대로 두고, CLI는 디스크 표기를 쓴다(postmortem 재발) | `folderState.ts:169`, `index.ts:1134` | `realpathSync.native` |
| M-19 | 유지보수 | 대체된 규칙이 테스트에서만 살아 있다. `sessionAvailability`, `bindFirstCanvas`, `playingFrameCount`, `searchPresets`는 실제 판단과 갈라졌고, 그 밖에 쓰이지 않는 심볼이 약 13개다 | 유지보수 2차 보고서 M-19 | 삭제하고, 유효한 테스트는 실제 함수로 옮김 |
| M-20 | 유지보수 | runtime helper `settingsPage`가 지워진 `settings.html`을 10초 동안 기다린 뒤, 앱이 실패한 것처럼 읽히는 오류를 던진다 | `app/runtime/windows.ts` | 삭제 |
| M-21 | 유지보수 | 주입 스크립트의 메시지 cap과 이를 받는 parser의 cap이 주석으로만 묶여 있다 | `canvasScript.ts`·`prototypeScript.ts` vs `canvasMessage.ts`·`prototype/requests.ts` | 두 값을 비교하는 테스트 |
| M-22 | 유지보수 | TS gate에 미사용 코드 검사가 없어 고아가 쌓인다. `SHELL_BACKGROUND` 주석은 사실과 반대이고(창 배경은 투명), eval의 `VARIABLE`은 쓰이지 않는다 | `index.ts:164-165`, `transcript.ts:181`, `.oxlintrc.json` | 고아 삭제와 주석 수정. lint 설정 변경은 범위 밖 |
| M-23 | 유지보수 | buddy golden의 `--check`가 verify gate와 CI에 없다 | `verify.mjs` | gate 단계 추가 |

## 리뷰어 메모 (finding 아님)

- 브랜드 분류기 하위 명령 목록에 `handoff`·`remove`·`export`가 빠져 있다. 지금 이 목록에 걸리는 문자열은 없다.
- renderer에 50 MB 상수가 3곳 중복돼 있다(main 값과 같다).
- `queue_limit`은 일반 문구로 보인다. 테스트가 이를 의도로 고정하고 있다.
- 버려진 Edit on Home의 attachment id가 main 메모리에 남는다. `homeRun.history()`는 실패한 읽기도 캐시한다.
- `sameCanvas`가 두 곳에 정의돼 있다(`ProjectOverview.tsx:110`, `canvasConversationRows.ts:25`).

## Coverage

| # | 모듈 | 계약 | 경계 | 수명주기 | 유지보수 |
|---|---|---|---|---|---|
| 1 | cli/cmd/doan + cli/internal/cli | 완료 | 완료 | 완료 | 완료 |
| 2 | cli/internal/{canvas,check,formats,repo} | 완료 | 완료 | 완료 | 완료 |
| 3 | cli/internal/designskill | 완료 | 완료 | 해당 없음(상태 없는 catalog) | 완료 |
| 4 | cli/internal/export | 완료 | 완료 | 완료 | 완료 |
| 5 | schema + fixtures | 완료 | 완료 | 해당 없음(데이터) | 완료 |
| 6 | app/src/main root | 완료 | 완료 | 완료 | 완료(스캔 수준) |
| 7 | app/src/main/conversation | 완료(2차) | 완료 | 완료(2차, `service.ts` 줄 단위) | 완료 |
| 8 | agentAuth·agentSetup·mcpConnectors | 완료(2차) | 완료 | 완료(2차) | 완료 |
| 9 | onboarding·update·serve·document·prototype | 완료(2차) | 완료 | 완료 | 완료 |
| 10 | app/src/preload | 완료 | 완료 | 완료 | 완료 |
| 11 | app/src/renderer | 완료(2차) | 완료 | 완료(2차, `App.tsx`·`homeRun.ts`·`conversationRun.ts` 줄 단위) | 완료(스캔 수준) |
| 12 | app/src/{brand,formats,restore} | 완료(2차) | 완료 | 완료 | 완료 |
| 13 | app/runtime + app/scripts | 완료(2차) | 완료 | 완료 | 완료 |
| 14 | eval | 완료(2차) | 완료 | 완료 | 완료 |
| 15 | packaging/CI | 완료(2차) | 완료 | 완료 | 완료 |

## Postmortem 적용 점검

`docs/postmortem/2026-10.md`(102건)와 `2026-11.md`(90건)를 관점별로 나눠 현재 호출부와 회귀 테스트에 대조했다. 관점별 표는 원본 보고서에 있다.

- **재발(RECURS)**: 2026-10-25 eval의 저장소 helper 실행 → M-8. 2026-11-02 sidebar scrollbar → M-15. 2026-11-01 비활성 트리거 drawer → M-14. 2026-11-05 canvas label → C-2. 2026-11-07 eval command reader → C-5. non-native realpath → M-18.
- **부분 재발(partial)**: 2026-10-25 quit 중 크래시 → M-9. 2026-11-07 export signal 정리 → M-16. 2026-11-06·11-08 header 팝오버 드래그 → M-11. 2026-11-13 단일 handoff 판정과 2026-11-12 WebGL 손실 → M-12. 2026-10-21 twin rule(주입 스크립트 cap) → M-21. 2026-10-30 packaged-app probe → B-2/C-4/M-13, M-20. 2026-10-23 clipboard 성공 보고(테스트가 동기 mock만 쓴다).
- **유지**: 2026-11-15 refused-send canvas move, 2026-11-05 Checking after Add, 2026-10-29·10-30 agentAuth, 2026-11-09 profile 설정 경로, 그 밖의 대부분이다.
- **해당 없음**: 코드가 지워진 항목(댓글 UI, 제거 Undo, `app/e2e`, `setupBroker.ts`, Set Up 메뉴)이다. 이 항목들의 검색 명령은 이제 없는 대상을 가리킨다.

## Triage (audit-loop)

- **사용자 결정 필요**:
  - B-1(High) → BACKLOG.
  - C-1(Low, 주요 흐름 아님) → 보고서에만 남긴다.
  - M-12의 Doany WebGL 손실 복구는 사용자가 보는 동작이 바뀐다 → 보고서에만 남긴다.
- **컨덕터로 고친다** (나머지 전부):
  - real-state 가드: B-2/C-4/M-13, M-10, M-20
  - eval 검사: C-5, M-1, M-8, M-12(R10)
  - main FIFO 읽기: B-3
  - 대화 수명주기: L-1, L-2, L-3
  - CLI 계약: C-3, M-4, M-16
  - app 정리: B-4, C-2, M-2, M-3, M-5, M-6, M-7, M-9, M-11, M-14, M-15, M-17, M-18, M-19, M-21, M-22(lint 설정 제외), M-23

## 1라운드 결과 (2026-11-16 마감)

**검증하지 못한 것**
- 실제 앱에서 보지 못하고 단위 테스트로만 확인한 것:
  - #219: prototype 헤더 메뉴를 연 채 누르는 경우(M-11), 실제 포인터로 띄운 툴팁(M-14), 스크롤바 모양(M-15), 실제 GPU reset에서 Home buddy가 복구되는지(M-12)
  - #220: docked composer 오류 notice, 추천 프롬프트 Tooltip, Settings Permission 메뉴, canvas-gone notice, Set Up 대화상자 focus ring, 캔버스 로드 실패 블록(CSS만 실측)
  - #213: runner가 살아 있는 상태의 quit
- B-1 probe에서 확인하지 못한 것: `apiKeyHelper` 외의 env 변수, Copilot 워크스페이스 MCP 파일, 승인된 Cursor MCP, trusted Codex 프로젝트
- 로컬 gate: 컨덕터 여러 개가 동시에 돌아 부하가 높았고, 그래서 여러 번 타이밍 테스트에서 실패했다. 모든 PR은 CI `gate`를 기준으로 병합했다.

**병합한 PR** (모두 develop)
- #212 real-state 가드: B-2/C-4/M-13, M-10, M-20
- #213 대화 수명주기: L-1, L-2, L-3
- #214 main FIFO 읽기: B-3
- #215 Claude 저장소 fence: B-1. 사용자 결정은 "저장소에 hook·MCP가 있으면 바깥 fence"다. probe에서 찾은 `.mcp.json` 단독 경로, AWS helper, `apiKeyHelper`도 같은 규칙으로 막았다. profile의 `.claude/`와 `.mcp.json`은 쓰기를 막았다.
- #216 CLI 계약: C-3, M-4, M-16, C-1. 사용자 결정에 따라 소문자 `.html`만 canvas로 본다.
- #217 eval 검사: C-5, M-1, M-8, M-12(R10), M-22(eval)
- #218 주석·고아 정리: B-4, M-2, M-3, M-5, M-6, M-7, M-17, M-19, M-22(app). 사용자 결정에 따라 `noUnusedLocals`와 `noUnusedParameters`를 켰다.
- #219 app 재발: C-2, M-9, M-11, M-14, M-15, M-18, M-21, M-23, M-12(Home buddy). 사용자 결정으로 고쳤다.
- #220 본문 패널 외곽선 통일과 화면 간 시각 drift 9건. 출처는 `.scratch/audit/261115-r1/visual-drift.md`다.
  - 사용자 결정: 본문 패널은 외곽선을 없애고, 떠 있는 요소는 외곽선을 유지한다. 확인 대화상자 버튼은 40px, Settings 메뉴는 standard 밀도다.

**BACKLOG**: B-1을 올렸다가 #215에서 닫았다. 새로 남긴 항목은 없다.

**probe에서 반증돼 수용된 한계로 둔 것**
- 다른 provider의 목록 읽기와 Codex 턴은 저장소의 MCP·hook을 실행하지 않았다.
- `statusLine`과 `otelHeadersHelper`는 실행되지 않았다.
- 상위·하위 폴더의 `.claude/`는 로드되지 않았다.

**다음 라운드 후보** (PR이 범위 밖으로 남긴 것)
- `conversation/runners.ts`와 `mcpConnectors/service.ts`의 `profileServers`가 FIFO를 막지 않는 동기 읽기를 쓴다.
- `onboarding/projects.ts`의 `.gitattributes`를 FIFO를 막지 않고 읽는다.
- `usageRead.ts`가 stat 뒤에 읽어 경쟁 조건이 있다.
- `UpdateHeaderButton.tsx`의 `open={open && shown !== null}`이 M-14와 같은 유형으로 보인다.
- `ds/surfaces.css`의 `.doan-panel` 주석이 낡았다.
- eval 시나리오에 단일 id를 `includes`로 확인하는 실패 케이스 36개가 남았고, 플래그 drift 테스트는 한 방향만 본다.
- 앱 테스트가 `$TMPDIR`에 `doan-acp-*`와 `doan-auth-manager*` 폴더를 남겨(약 6만 개) Go 테스트를 느리게 한다.
- `shell.test.ts`의 "setting up the same folder again"이 로컬에서만 실패한다.
