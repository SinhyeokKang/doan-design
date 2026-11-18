# 코드베이스 감사 — 2026-11-18 (audit-loop 1라운드)

- 실행일: 2026-11-18
- 기준: `develop` HEAD `05268bc3b` (0.1.20 bump 직후), 작업 트리 clean
- 범위: 코드베이스 전체 (`cli/`, `schema/`, `app/src/**`, `app/runtime/`, `app/scripts/`, `eval/`, `.github/workflows/`, 패키징 설정)
- 완료 상태: **정적 감사 완료**. 리뷰어는 1차 wave 8개(4관점 × 2영역)와 2차 wave 4개(1차가 partial로 남긴 셀)였다. 실행 확인이 필요한 항목은 아래에 "실행 확인 필요"로 표시했다.
- 원자료: `.scratch/audit/261118/` (`p1~p4-*.md`, `w2-*.md`)

## 미검토 영역과 실행 한계

- 테스트·빌드·앱은 실행하지 않았다. 런타임 동작은 인증하지 않는다.
- 한 줄씩 끝까지 읽지 않은 곳:
  - renderer의 `QuickOpenDialog` 200-235, `quickOpen.ts` index 구성, `conversationStrip` 110 이후
  - `selection.ts`, `viewport.ts`, `canvasView.ts`, `canvasPicker.ts`, `agentUsage.ts`와 작은 모듈 약 15개. 1차 wave의 postmortem 검색과 이전 loop 판정만 거쳤다.
  - Go `cli/internal/cli/onboarding.go`의 v2 클라이언트 쪽은 타입 수준으로만 대조했다.
  - `conversation/acp.ts`·`dispatcher.ts`의 내부 본문
- 실행 확인이 필요한 finding: R1-08, R1-10, R1-14, R1-20, R1-23, R1-24, R1-25, R1-31, R1-33, R1-35, R1-36.

## 결정 처리 (사용자 확인, 2026-11-18)

| 항목 | 결정 | 반영 |
|---|---|---|
| guide 규칙 F와 convention 14 authoring 제안이 ARCHITECTURE §1에 없음 | ARCHITECTURE로 승격 | develop `794ccb44a` |
| prototype 창 접힌 Show conversation badge 기준 | PRODUCT를 코드(canvas의 가장 강한 신호)에 맞춤 | develop `d3bd51213` |
| header frame drawer·zoom 메뉴가 열린 동안 V/H | 목록이 글자 키를 가져감 | 배치 F |
| canvas 로드 실패 Retry | DESIGN 'Busy action' 적용 | 배치 F |
| 승격 marker "Moved to x.html" | file stem으로 바꿈 | 배치 F |

## Findings

### Medium

**R1-01 — accept 전 start가 Move to Trash와 `doan remove` 게이트에서 빠진다** (P3 lifecycle-main C-P3-1, P1 contracts-main C-A1, P4 M-2)
- 트리거: canvas의 첫 대화를 보낸 직후, `acceptStart` 전(prepare·runner open 중)에 Move to Trash를 확인하거나 `doan remove`를 실행한다.
- 근거:
  - `canvasTrash.ts:67` `trashBusy`와 `canvasRowMenu.ts:26` `trashBlock`은 `store.list()`에 있는 대화만 본다. 새 대화는 `conversation/service.ts:438` `acceptStart` 전에는 목록에 없다. `live`(`service.ts:378`)에만 있다.
  - `cliRemove.ts:48`은 accept된 턴만 담는 `liveTurns()`를 센다.
- 영향: 휴지통으로 옮긴 canvas에서 대화가 시작될 수 있다. 두 번째 `admit`(`service.ts:409`)가 목록 갱신 전에 돌면 통과한다. `doan remove`는 보낸 메시지를 `project_not_open`으로 잃는다.
- 기준: PRODUCT §5 item 1 'Canvas row menu'("working, preparing or waiting for an answer"), item 10 `doan remove`("refused … while any conversation turn of the group runs"), POSTMORTEM 2026-11-17 'A quit before main accepted…'의 Prevention(accepted-only 게이트 재검토).
- 제안: service가 accept 전 start(root·canvas)를 함께 노출하고, 두 게이트가 그것을 센다.

**R1-02 — 사라진 auto-registered worktree 정리가 Remove 정리와 갈라졌다** (P3 C-P3-2, P4 M-1, P1 C-A2)
- 근거:
  - `index.ts:913-918` `autoRemoved`는 selection과 thumbnails만 정리한다.
  - `removeRoots`(`index.ts:1451-1462`)가 하는 `stopBackground`, `prototype.controller.rootsRemoved`, `discardRootStarts`가 빠져 있다.
  - 주석 `index.ts:913`, `shell.ts:104`는 "cleaned up like Remove"라고 쓴다.
- 영향: quit으로 멈춘 start draft가 `drafts.json`에 남는다. 같은 경로에 worktree가 다시 생기면 옛 메시지가 돌아온다. 끝난 턴의 background 작업도 멈추지 않는다.
- 기준: POSTMORTEM 2026-11-17 'Removing a project…', 2026-10-25 'Locating a project…'.
- 제안: root 제거 뒤처리를 한 함수로 모아 두 경로가 함께 부른다.

**R1-03 — unseen marker 판정이 main과 renderer에서 다르다** (P4 maint-main CV-1)
- 근거: `conversation/summary.ts:71` `lastTurnSeq`는 `handoff.resolved`, `handoff.missed`를 뺀다. renderer `overviewRun.ts:60` `isMarker`는 `conversation.*`과 `canvas.drawn`만 뺀다.
- 영향: 스레드를 읽은 뒤 handoff 이벤트가 오면 `endSeq`가 null이 되어 `markSeen`이 가지 않는다. 대화를 보고 있어도 unseen dot이 남는다.
- 제안: 술어 하나를 공유하거나, 같은 fixture로 두 구현을 고정한다.

**R1-04 — 백그라운드에서 일어난 focus 복구 9곳(+inspector 1곳)이 `refocusOnActivation`을 거치지 않는다** (W2 renderer W2-1, P3 lifecycle-rest C3-R1)
- 위치: `ConversationThread` 3곳, `DockedComposer`/`QueueRows` 2곳, `SettingsAgents`, `SettingsMcpConnectors`, `CanvasConversationList`, `PrototypeWindow` iframe focus, `InspectorPanel.tsx:65-72`.
- 영향: 창이 뒤에 있는 동안 focus를 가진 control이 사라지면, 앱으로 돌아왔을 때 focus가 Hide sidebar로 간다.
- 기준: POSTMORTEM 2026-11-17의 activation focus 규칙. `App.tsx:2403`과 `ShellSidebar.tsx:382`는 이 규칙을 지킨다.
- 실행 확인 필요.

**R1-05 — `claudeSessionExists`가 transcript 전체를 main에서 동기로 엄격하게 디코딩한다** (W2 main-agents W2M-1)
- 근거: `conversation/prepare.ts:73`. 같은 파일을 `claudeTranscript`는 `isFile`로만 판정한다.
- 영향: transcript가 256 MiB를 넘거나 잘못된 UTF-8 바이트가 있으면 그 대화의 send가 모두 `session_unavailable`로 거절된다. main thread가 멈추는 시간이 있다(실행 확인 필요).

**R1-06 — rate_limited로 끝난 프로젝트 대화의 판정 창에서 queue가 limit을 무시하고 flush된다** (W2M-2)
- 근거: `service.ts:1382` `judge()`가 schedule·limit을 확인하지 않는다. `queueAfterEnd`에는 이 가드가 있다.
- 영향: reset 전에 메시지가 나가 실패 턴이 하나 더 생긴다.

**R1-07 — MCP connector를 Remove한 뒤 같은 호스트의 다른 URL을 추가하면 옛 등록으로 연결된다** (W2M-4)
- 근거: provider가 로그아웃된 상태에서 Remove하면 이름 `doan-foo`가 재사용된다. `reconcilePlan`은 이름만 비교한다.
- 영향: Connect가 옛 URL로 로그인한다. 실행 확인 필요.

**R1-08 — eval transcript reader가 `\`+줄바꿈에서 명령을 둘로 나눈다** (W2 cli-schema-eval W2-1)
- 근거: `eval/lib/transcript.ts:317`, `:872`.
- 영향: D1 preset 검사가 거짓으로 통과한다. O3 `no_doan_init`은 실제 `doan init`을 놓친다. 이렇게 쓴 export·open 호출은 거짓 실패로 판정된다.
- 기준: POSTMORTEM 2026-11-16 refused-rule 항목.

**R1-09 — export viewer `measure.js`에 prototype 페이지의 링크 처리 두 가지가 없다** (W2-2)
- 내용: `isolate.js`에 있는 srcdoc 내부 `#` 링크 처리와 `pushState` 재시도가 없다. 문제가 되는 링크는 `links`에도 보고되지 않는다.
- 실행 확인 필요: WebKit·Chromium에서 내보낸 파일로 확인한다.

### Low

| id | 내용 | 근거 | 출처 |
|---|---|---|---|
| R1-10 | inspector가 이미 대체된 `inspect:get`도 순서대로 실행한다. queue 대기가 2초 예산에 포함되어 거짓 "Couldn't read the styles."가 나온다. timeout 뒤 옛 읽기의 `CSS/DOM.disable`이 다음 읽기와 겹친다 | `inspector.ts:140-175` | P3 C3-R2, P2 C-B1 |
| R1-11 | `canvasRows`가 `.html`로 끝나는 읽을 수 없는 폴더(`unreadable_folder`)를 canvas 행으로 남긴다 | `view.ts:85`, ARCHITECTURE §12 | P1-rest C-A1, P2-rest B2-1 |
| R1-12 | `withoutUnlisted`가 id 없이 잠깐 나열된 canvas 때문에 마지막에 본 대화 기억을 지운다 | `restore/uiState.ts:319-323`, ARCHITECTURE §7 | P1 C-A3 |
| R1-13 | quit이 중단된 뒤 send·start를 누를 때마다 hold가 새 key로 쌓여 다음 실행에서 draft가 중복된다 | `service.ts:361-363` | P3 C-P3-3 |
| R1-14 | Home의 project A start draft가 project B send 도중 도착하면 A의 메시지가 B의 field에 남는다 | renderer Home run | P3-rest C3-R3 |
| R1-15 | Remove from Doan이 Overview의 `root:` 초안만 지운다. `canvas:` 초안·첨부, CanvasRun, HomeRun 실패 상태가 남는다 | renderer draft stores | W2-2 renderer |
| R1-16 | Edit on Home이나 Edit and resend로 draft를 교체할 때 기존 첨부를 main에서 해제하지 않는다 | renderer composer | W2-8 renderer |
| R1-17 | `takeStartDraft`가 한 번 실패하면 같은 실행 중에는 다시 묻지 않는다 | renderer | W2-9 renderer |
| R1-18 | handoff 첫 메시지가 `/compact`처럼 시작하면 main과 renderer 모두 명령 턴으로 읽는다 | `commandTurns`, `threadCommands` | W2M-3 |
| R1-19 | `readConversation`의 `commands.turns`·`usageStale`을 읽는 곳이 없다. renderer가 같은 규칙을 따로 다시 계산한다 | conversation read | CV-2 |
| R1-20 | 창을 숨겼다 다시 띄운 뒤에는 docked buddy가 WebGL context를 잃었을 때 GPU 복귀를 기다리지 않는다 | `Doany`/`dockedBuddyShell` | W2-3 renderer |
| R1-21 | 창이 닫히거나 숨겨진 채 toast가 떠 있으면 멈춘 tick이 새 객체를 돌려줘 App이 1초에 10번 다시 렌더된다 | Toast tick | W2-4 renderer |
| R1-22 | Home buddy가 native visibility를 보지 않는다 | Home buddy | W2-5 renderer (실행 확인 필요) |
| R1-23 | buddy 두 개와 dot field가 DPR 변화를 따라가지 않는다 | Doany, CanvasAgent | W2-6 renderer (실행 확인 필요) |
| R1-24 | prototype 창의 close와 closed 사이에 Play가 들어오면 옛 창의 첨부 정리(`deps.closed`)가 건너뛰어진다 | prototype controller | W2-7 renderer, W2M-7 |
| R1-25 | 이전 prototype 창의 still이 새 창에 다시 보내질 수 있다 | `prototype/controller.ts:127-136`, POSTMORTEM 2026-10-25 generation 태그 | W2M-9 |
| R1-26 | 진행 중인 Move to Trash alert에 Escape keydown 가드가 없다 | canvas row menu alert | W2-10 renderer |
| R1-27 | header frame drawer와 zoom 메뉴가 열린 동안 V/H가 tool을 바꾼다(결정: 목록이 키를 가져감) | `CanvasHeader.tsx:132-148` | P4-rest P4-R1 |
| R1-28 | canvas 로드 실패 Retry가 누르는 즉시 실패 문구를 지운다(결정: Busy action 적용) | `App.tsx:2752` | P3-rest |
| R1-29 | 승격 marker가 "Moved to x.html"이다(결정: stem) | `ConversationThread.tsx:931`, PRODUCT 'Canvas names' | W2-13 renderer |
| R1-30 | Approval requests 설명이 agent 질문을 빠뜨린다 | `SettingsNotifications.tsx:9`, PRODUCT §5 'Notifications' | W2-14 renderer |
| R1-31 | eval Codex home이 `/tmp` 아래에 있어 workspace-write sandbox가 쓸 수 있다. `auth.lock`은 이미 있을 때만 링크한다 | `eval/lib/agent.ts:31-34`, `workspace.ts:76` | P2-rest B2-2, B2-3 (실행 확인 필요) |
| R1-32 | eval reader가 변수를 bash 방식으로 단어 분할한다(agent는 zsh). Codex `exec_command` 리터럴을 제어 흐름과 무관하게 실행으로 친다. 인터프리터 판단에 빈틈이 있다(`-c`, `python -m`, 백틱) | `transcript.ts` | W2-7~9 cli-schema-eval |
| R1-33 | `repo.Resolver`가 링크 대상의 대소문자·NFC/NFD 철자를 root와 바이트로 비교한다 | `cli/internal/repo/resolve.go:72-89` | W2-3 cli (실행 확인 필요) |
| R1-34 | `ambiguous_custom_url` 중복 제거 key에 token이 빠져 있다 | `cli/internal/check/check.go:405` | W2-4 cli |
| R1-35 | `harness.test.ts`의 시간 한도가 빠듯하다(200ms watchdog, `closeMs: 20`) | `app/runtime/harness.test.ts` | W2-10 cli (실행 확인 필요) |
| R1-36 | MCP 상태 읽기(`claude mcp get` 병렬)가 profile queue 밖에서 돈다. 주석과 다르다 | `mcpConnectors/service.ts` | W2M-6 (실행 확인 필요) |
| R1-37 | 원본과 묶이지 않은 복사 상수: `HANDOFF_WAIT_MS`, `SPLIT_ROWS` label, export viewer tooltip 700/300, renderer TEXT_LIMIT·MAX_ATTACHMENTS·50MB, `notice.ts` Claude allow 규칙, connector-name 정규식 3곳, `agentSetup/runner.ts:232` provider 목록, `measure.js` `bodyClips`/`scrollsFurther`, Go `bundleID`↔`appId`, `app/runtime/windows.ts` capture 제목 | 각 파일 | P4, W2 |
| R1-38 | 낡은 주석과 삭제된 문서 인용: `commandRecords.ts:3-6`, `completion.ts:41`, `mcpConnectors/service.ts:442`, `document/bindings.ts:7`, `canvasScript.ts`(design flow N), `inspect.ts:1-2`(PoC), `handoffView.ts:19`(Decision 5), `serve/server.ts:77-79`(PoC), `runtime.ts:51`, export viewer `fitFrame` 주석, 테스트 주석(AddProjectsPage, Onboarding, homeRun, conversationList, `index.test.ts:3375`, `designskill_test.go:557,559,598`), design-skill fixture `$comment`("four fields") | 각 파일 | P4, W2 |
| R1-39 | `conversation:takeStartDraft` 요청 검증을 다루는 IPC 테스트가 없다 | `index.ts` | CV-4 |
| R1-40 | `docs/design/prototype.md` 70-71행이 지금의 대화 버튼(아이콘·tooltip·unread)과 다르다 | DESIGN | W2-12 renderer |

## 수정 배치

| 배치 | 브랜치 | finding | 비고 |
|---|---|---|---|
| A | `fix/removal-drafts-gates` | R1-01, R1-02, R1-14, R1-15, R1-16, R1-17, R1-39 | `service.ts` 공유 → B와 순서대로 merge |
| B | `fix/conversation-turns` | R1-05, R1-06, R1-13, R1-18, R1-19 | |
| C | `fix/focus-and-inspector` | R1-04, R1-10, R1-37 중 `SPLIT_ROWS` | `ConversationThread` 공유 → F와 순서대로 |
| D | `fix/seen-restore-rows` | R1-03, R1-11, R1-12 | |
| E | `fix/eval-reader-isolation` | R1-08, R1-31, R1-32 | `/verify --eval` |
| F | `fix/canvas-keys-retry-copy` | R1-27, R1-28, R1-29, R1-30, R1-40 | PRODUCT·DESIGN 갱신 포함 |
| G | `fix/prototype-buddy-lifecycle` | R1-20~R1-26, R1-35 | |
| H | `fix/mcp-name-reuse` | R1-07, R1-36 | |
| I | `fix/cli-export-resolve` | R1-09, R1-33, R1-34, R1-37 중 `measure.js`·`bundleID` | |
| J | `chore/audit-maintenance` | R1-37·R1-38 중 나머지 | 마지막에 시작 |

## Coverage

| 모듈 | 계약 | 경계 | lifecycle | 유지보수 | 담당 |
|---|---|---|---|---|---|
| app/src/main (상위) | 완료 | 완료 | 완료 | 완료 | P1~P4-main, W2 main-core |
| main/conversation | 완료 | 완료 | 완료 | 완료 | P1~P4-main, W2 main-agents |
| main/agentAuth·mcpConnectors·agentSetup·onboarding·prototype | 완료 | 완료 | 완료 | 완료 | W2 main-agents (Go onboarding 클라이언트는 타입 수준) |
| main/serve·document·update·thumbnails | 완료 | 완료 | 완료 | 완료 | W2 main-core |
| preload | 완료 | 완료 | 완료 | 완료 | P1~P4-main, W2 renderer(IPC 대조) |
| brand·formats·restore | 완료 | 완료 | 해당 없음(소유 리소스 없음) | 완료 | P4-main, W2 main-core |
| app/src/renderer | 대부분 완료 | 완료(IPC 전수 대조) | 대부분 완료 | 대부분 완료 | P1~P4-rest, W2 renderer (위 '미검토 영역') |
| cli/** (export viewer 포함) | 완료 | 완료 | 완료 | 완료 | P1~P4-rest, W2 cli-schema-eval |
| schema/** | 완료(두 언어가 fixture를 glob으로 읽음) | 완료 | 해당 없음 | 완료 | P4-rest, W2 cli-schema-eval |
| eval/** | 완료 | 완료 | 완료 | 완료 | P1~P4-rest, W2 cli-schema-eval |
| app/runtime·app/scripts·workflows·패키징 | 완료 | 완료(secret 값은 읽지 않음) | 완료 | 완료 | P2~P4-rest, W2 cli-schema-eval |

## Postmortem 적용 점검

두 달치 항목(10월 102건, 11월 119건)을 리뷰어별 원자료에 항목 단위로 기록했다. 위반이나 공백이 발견된 규칙은 아래와 같다. 나머지 적용 항목은 준수했다.

- 2026-11-17 accept 전 quit과 accepted-only 게이트 → R1-01
- 2026-11-17 project 제거 시 root 키 상태 정리 → R1-02, R1-15
- 2026-11-17 activation focus → R1-04
- 2026-10-25 project Locate 시 옛 root 상태 → R1-02
- 2026-10-25 비동기 완료 generation 태그 → R1-25
- 2026-11-14 close 정리 → R1-24
- 2026-11-16 refused rule(eval) → R1-08
- 2026-11-07 shell state 추정 → R1-32
- 2026-10-21 echoed constants → R1-37
- 2026-10-30 timing 여유 → R1-35
- 2026-10-22 served directory watch target 재생성 테스트: 새 gitdir watch target에 테스트가 없다. 트리거가 드물어 finding으로 올리지 않았다.
