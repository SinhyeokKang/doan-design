# turn-end-state — tasks

순서: PoC → main 순수 함수(normalizer) → renderer 순수 함수 → main shell(service·process) → UI 연결 → 실제 앱 확인 → 승격.

T1–T3, T5는 T0 결과와 무관하므로 T0과 나란히 진행해도 된다. T4만 T0을 기다린다.

## T0. P3 PoC — 끝난 Claude CLI 뒤에 남는 프로세스 (design §4.1)

- `.scratch/turn-end-state/`에 격리된 앱과 Doan 연결 Claude 대화로 두 턴을 보내는 probe를 둔다. 두 번째 send는 첫 턴의 `turn.done`이 온 순간 보낸다. `turn.done`부터 group이 사라질 때까지 100 ms마다 그 pgid의 프로세스 목록(pid, ppid, pgid, stat, 경과, command), `endSuggestion` 호출 시각, `prompt_suggestion` 도착 시각, CLI leader exit 시각, `process_exited` 시각, 다음 턴 `turn.started` 시각을 남긴다.
- suggestion이 오기 전 send와 온 뒤 send를 각각 세 번.
- 실제 Claude sign-in이 필요하다: 사용자가 브라우저에서 승인하고, probe 동안 그 profile을 다시 쓰며, 끝나면 sign-out하고 profile을 지운다.
- 결과(지목한 프로세스, 부모, 상태, 신호가 닿는지, H1–H4 판정)를 design §4.1에 적고, H1·H2면 §4.2의 결정된 방향으로 T4를 진행한다. 다른 원인이면 멈추고 사용자에게 묻는다.
- 검증: `.scratch/turn-end-state/`의 Playwright·프로세스 관찰 script로 측정한다(AGENTS.md 'Commands'에 없는 도구는 PoC·측정 작업에서만 쓰고 `.scratch/`에 둔다. `ps`, `/usr/bin/time -l` 등). 결과는 design §4.1과 commit 메시지에 적는다. 통과 기준은 원인 프로세스 하나 이상을 command와 pgid까지 기록한 것.
- **commit 경계**: `docs(feature): turn-end-state exit-wait PoC result`

## T1. main normalizer — 도구가 모두 끝났다는 stage (design §2.2, §6)

- Claude: top-level `tool_use` id의 `running` 집합, `tool_result`로 빼고 비면 general.
- Codex: `commandExecution`·`fileChange`·`mcpToolCall` item의 `running` 집합, `item/completed`로 빼고 비면 general.
- 모든 terminal·aborted·failed 반환 경로에서 집합을 비운다.
- 테스트: design §6 표의 Claude·Codex 사례 전부(병렬, 순서가 바뀐 완료, 한 frame에 여러 결과, `AskUserQuestion`, `parent_tool_use_id`, 다음 턴이 물려받지 않음). 기존 `stage.test.ts`·`stageRunners.test.ts`·`transport.test.ts`의 read·list·search 사례는 그대로 통과.
- 검증: `npm --prefix app test` green, `npm --prefix app run typecheck` 통과.
- **commit 경계**: `fix(conversation): report when every Claude and Codex tool of a turn has ended`

## T2. renderer 순수 함수 (design §2.1, §3.2, §6)

- `activityRun(items, status)`(가칭, `turnStatus.ts`)와 `composerTurn(events, summary, live)`(`dockedRules.ts` 또는 `composerRules.ts`).
- 테스트: design §6 표의 두 함수 사례 전부. `composerTurn`은 두 host의 지금 `turnOf`가 내는 값과 terminal 뒤 사례만 다르다는 것을 표로 고정한다.
- 검증: `npm --prefix app test` green.
- **commit 경계**: `fix(renderer): rules for an ended tool's row and an ended turn's composer`

## T3. main service — persistence 실패 뒤 (design §5.2)

- `exited()`에서 `failedPersistence` 항목의 `busy`를 내리고 큐를 `giveBack(id, "turn_failed")`로 돌려준다. `send`는 `failedPersistence && exited`인 항목을 버리고 새로 시작한다.
- 테스트(`service.test.ts`): append 실패 → exit 전 working·Delete `busy` → exit 뒤 `working` false·큐 draft·Delete 성공·새 send 수락과 새 턴의 `user.message` → history가 계속 실패하면 send 거절. exit 전 send는 지금처럼 `busy`. project 대화면 root hold 없음(지금과 같음).
- 검증: `npm --prefix app test` green.
- **commit 경계**: `fix(conversation): release a conversation whose history stopped taking writes once its process is gone`

## T4. main — P3 수정 (design §4.2, T0 결과에 따름)

- T0이 H1·H2를 확인하면 결정된 방향을 구현한다: done 턴의 leader가 끝난 뒤 group을 기다리는 send가 남은 group을 끝낸다. reservation은 group이 사라진 관찰로만 풀린다.
- 테스트: 주입한 `signal`·`alive`로 `OwnedGroup`의 leader exit 뒤 동작, `service.test.ts`에서 `turn.done`에 보낸 send가 남은 group을 끝내고 `process_exited` 뒤 시작, group이 끝내 사라지지 않으면 `EXIT_WAIT_MS` 뒤 `busy`(지금과 같음), 실패·중단 턴과 quitting에서는 끝내지 않음, 기다리는 동안 다른 send가 live 항목을 바꾸지 않음(POSTMORTEM 2026-10-28).
- 검증: `npm --prefix app test` green. T0이 "기록만"으로 끝나면 이 작업은 없다.
- **commit 경계**: `fix(conversation): end what a finished Claude turn left in its group when the next send waits`

## T5. UI 연결 (design §2.1, §3.2)

- `ConversationThread.tsx`가 `threadTurn`의 status(settle 전)로 `activityRun`을 적용한다. `ProjectOverview.tsx`와 `CanvasConversationPanel.tsx`의 `turnOf` 두 벌을 `composerTurn`으로 바꾼다.
- `/design-draft`는 하지 않는다(레이아웃·문구 변경 없음).
- 테스트: host 테스트에서 (1) Claude 도구 activity → 같은 seq의 general stage push → 그 render에서 행 spinner가 없고 head가 단계 수, (2) project 대화에 `turn.done` push, 목록은 아직 `working` → 그 render에서 composer 버튼이 Stop이 아니라 비활성 Send, 텍스트 입력 → Queue, (3) 큐가 있는 terminal → Stop.
- 검증: `npm --prefix app test` green, `npm --prefix app run typecheck`, `npm --prefix app run lint` 통과.
- **commit 경계**: `fix(app): an ended tool's row and an ended turn's composer stop looking busy`

## T6. 실제 앱 확인

- `/runtime-test`로 격리된 앱에서 바뀐 동작만 짧게 본다(실제 provider sign-in, 사용자 승인, 끝나면 sign-out과 profile 삭제):
  - Claude Code·Codex 각각 명령 하나를 실행시키고, 명령이 끝난 뒤 다음 출력 전에 행 spinner가 멈추고 indicator가 "is working"인지. Copilot이 병렬 도구를 쓰면 그 경우도.
  - Overview project 턴의 `turn.done` 직후 composer가 Stop이 아닌지, 판단 창에서 입력한 텍스트가 Queue로 들어가 판단 뒤 나가는지.
  - Claude 턴의 `turn.done`에 보낸 메시지의 `turn.started`가 4 s 안에 오는지(세 번). 측정 script는 `.scratch/turn-end-state/`에 둔다.
  - P4는 실제 디스크 실패를 만들기 어렵다. 단위 테스트로만 확인하고 실제 앱 확인은 하지 않았다고 기록한다.
- 검증: 화면 캡처와 측정값을 `.scratch/turn-end-state/`에 남기고, 결과를 이 문서와 PR 본문에 적는다.

## T7. 승격과 정리

- PRODUCT.md: §5 item 3 'Turn indicator'의 activity row 문장(design §2.3), §3 'Turn stages'의 Codex 문장.
- ARCHITECTURE.md §7: 'Turn stages' Sources와 Renderer(design §2.3), composer의 terminal 뒤 판단 한 줄(design §3.3), 'Send after a finished turn'·'Quit and process cleanup'에 P3 원인과 수정(T0·T4), 'Deletion'의 persistence 실패 문장(design §5.3).
- BACKLOG.md 'Known defects'에서 네 항목을 지운다. P3가 "기록만"으로 끝났으면 그 항목은 원인을 적어 남긴다. (BACKLOG는 feature가 항목을 맡을 때 지우는 것이 규칙이지만, 이 문서를 쓴 실행은 BACKLOG를 건드리지 않았다.)
- `docs/features/turn-end-state/`를 지운다.
- 검증: 바뀐 문장마다 해당 코드(design §2.3·§3.3·§5.3이 가리키는 파일)와 대조하고, `node .agents/skills/verify/scripts/verify.mjs` 통과.
- **commit 경계**: 문서마다 따로 — `docs(PRODUCT): …`, `docs(ARCHITECTURE): …`, `docs(BACKLOG): …`, `docs(feature): remove turn-end-state`
