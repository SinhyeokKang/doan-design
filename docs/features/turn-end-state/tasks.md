# turn-end-state — tasks

순서: PoC → main 순수 함수(normalizer) → renderer 순수 함수 → main shell(service·runner) → UI 연결 → 실제 앱 확인 → 승격.

T1–T3, T5는 T0 결과와 무관하므로 T0과 나란히 진행해도 된다. T4만 T0을 기다린다.

코드 commit마다 `node .agents/skills/verify/scripts/verify.mjs`를 돌린다(늦어도 T5까지는 모든 코드 commit에서). 측정값은 PR 본문과 commit 메시지에 적는다. 이 디렉터리는 T7에서 지워지므로 여기에만 두지 않는다.

AGENTS.md 'Commands'에 없는 도구(`ps`, `/usr/bin/time -l`, `go tool pprof`, `.scratch/`의 Playwright·프로세스 관찰 script)는 PoC와 측정 작업(T0, T6)에서만 쓰고 `.scratch/`에 둔다.

## T0. P3 PoC — 끝난 Claude CLI 뒤에 남는 것 (design §4.1)

- packaged app(`npm --prefix app run package`)에서 잰다. main 쪽 시각은 commit하지 않는 임시 계측 patch로 남긴다.
- canvas 대화와 project 대화로 두 턴씩 보낸다. 두 번째 send는 첫 턴의 `turn.done`이 온 순간 보낸다. suggestion이 오기 전 send와 온 뒤 send를 각각 세 번.
- 남길 것(design §4.1의 3):
  - 환경: 대화 종류, profile 설정(hooks, MCP, plugins), `claude --version`, 턴 내용(도구 없음 / Bash 도구 사용).
  - main 시각: SDK loop `finished`, child `exit`·`close`, `stop()` 호출과 시각, SIGKILL escalation, `judging`·`waits` 시작과 끝, `usageAtTurnEnd` 길이, `endSuggestion`, `prompt_suggestion` 도착, `process_exited`, 다음 턴 `turn.started`.
  - 프로세스: `turn.done`부터 group이 사라질 때까지 100 ms마다 `ps -axo pid,ppid,pgid,stat,etime,command`를 그 pgid로 거른 목록.
  - 기준선: 이전 프로세스가 없는 canvas 대화에서 send부터 `turn.started`까지(세 번).
- 실제 Claude sign-in이 필요하다: 사용자가 브라우저에서 승인하고, probe 동안 그 profile을 다시 쓰며, 끝나면 sign-out하고 profile을 지운다.
- 결과와 판정을 design §4.1에 적는다. H1·H2·H5면 T4를 진행하고, H0·H3·H4나 다른 원인이면 멈추고 사용자에게 묻는다.
- 검증: `.scratch/turn-end-state/`의 Playwright와 프로세스 관찰 script. 통과 기준은 H0–H5 중 하나로 판정하거나 다른 원인을 증거와 함께 기록한 것.
- **commit 경계**: `docs(feature): turn-end-state exit-wait PoC result`(측정값은 commit 메시지에도)

## T1. main normalizer — 도구가 모두 끝났다는 stage (design §2.2, §6)

- `types.ts` `TransportState`에 `running?: string[]`(ACP 필드를 옮김, 비면 생략). `transport.ts` `finish()`가 비운다.
- Claude: top-level `tool_use` id를 넣고 `tool_result`로 빼며, 비면 general. Codex: `commandExecution`·`fileChange`·`mcpToolCall` item을 `item/started`로 넣고 `item/completed`로 빼며, 비면 general.
- 모든 terminal·aborted·failed 반환 경로에서 비운다.
- 테스트: design §6 표의 Claude·Codex 사례 전부. 특히 첫 `tool_result`가 둘째 `tool_use` frame보다 먼저 오는 경우, `awaitingRead` result가 집합을 남기지 않는 경우, 재사용 Codex server의 다음 턴이 빈 집합으로 시작하는 경우, 일반 명령이 도는 동안 read가 끝나면 stage가 없는 경우.
- 바뀌는 기존 단언:
  - `stage.test.ts`:188 "reports nothing for %s, start or completion" — 완료에서 general을 낸다(`codexFixture`·`codexHome` 사례 포함).
  - `stage.test.ts`:193 "reports nothing for file changes, MCP tool calls or a Doan connector's call" — 완료에서 general을 낸다.
  - 그 밖의 read·list·search 사례는 그대로 통과한다.
- 검증: `npm --prefix app test` green, `npm --prefix app run typecheck`, `node .agents/skills/verify/scripts/verify.mjs` 통과.
- **commit 경계**: `fix(conversation): report when every Claude and Codex tool of a turn has ended`

## T2. renderer 순수 함수 (design §2.1, §3.2, §6)

- `activityRun(items, status, stepKey)`(가칭, `turnStatus.ts`), `composerTurn(events, summary, live)`, `composerAction(turn, request, queueRows)`, `dockedAvailability`의 `holding`.
- `threadItems.ts`:279–283의 running·head·verb 판단을 뺀다. `turnStatus.ts`의 "A tool activity row may still spin while this says general" 주석을 고친다.
- 테스트: design §6 표의 renderer 사례 전부. `composerTurn` × `composerAction` 표: holding + 빈 입력 → 비활성 send, holding + 텍스트 → queue, holding + queue 행 → stop, holding + flush 중(행이 모두 sending) → stop. 문장 step 예외. ACP 완료 activity만 있고 stage가 없으면 단계 수.
- 바뀌는 기존 단언: `threadItems.test.ts`의 running·head 단언(행 판단이 `activityRun`으로 옮겨 감), `ConversationThread.test.tsx`와 `ConversationThread.turn.test.tsx`의 "도구가 끝난 뒤에도 행이 도는" 단언과 행·indicator 동시 표시 단언.
- 검증: `npm --prefix app test` green, `node .agents/skills/verify/scripts/verify.mjs` 통과.
- **commit 경계**: `fix(renderer): rules for an ended tool's row and an ended turn's composer`

## T3. main service — persistence 실패 뒤 (design §5.2)

- `failedPersistence && exited`를 푸는 helper(`busy = false`, `giveBack(id, "turn_failed")`를 try/catch로, 목록 알림). `exited()`의 `receive` 뒤와 `receive()` catch의 `live.exited`일 때 부른다.
- Stop은 보통 Stop처럼 남은 group을 끝낸다. `previousExit`는 `failedPersistence`여도 group을 기다린다. `send`는 `failedPersistence && exited`인 항목을 버리고 새로 시작한다.
- 테스트(`service.test.ts`):
  - (a) 턴 중 append 실패 → 프로세스 exit 전 working·Delete `busy`·Stop이 group을 끝냄·그동안 온 send는 기다림 → exit 뒤 `working` false·`phase` ended·큐 draft·Delete 성공·restore 가능·새 send 수락과 새 턴의 `user.message`.
  - (b) 프로세스가 먼저 exit → `exited()`의 `turn.failed` append 실패 → 같은 결과.
  - `transportFailed` 뒤 쓰기 실패도 (b)와 같은 결과.
  - history가 계속 실패하면 새 send는 거절. drafts 쓰기 실패는 로그만. project 대화면 root hold 없음(지금과 같음).
- 검증: `npm --prefix app test` green, `node .agents/skills/verify/scripts/verify.mjs` 통과.
- **commit 경계**: `fix(conversation): release a conversation whose history stopped taking writes once its process is gone`

## T4. runner — P3 수정 (design §4.2–§4.3, T0이 H1·H2·H5일 때만)

**취소.** T0이 H0으로 판정했고, 사용자 결정으로 원인만 기록한다(design §4.2). 아래는 하지 않는다.

- done terminal 뒤 CLI leader의 child `exit`에서 runner가 `group.stop()`을 부른다. `observe()`는 group이 사라지면 escalation timer를 지우고, SIGKILL 직전에 한 번 더 `observe()`를 부른다.
- 테스트(`runners.test.ts`, `process.test.ts`, `service.test.ts`): SIGTERM을 무시하는 같은 group 후손을 둔 fake 실행 파일로, leader exit 뒤 0.6 s 안에 group이 사라지고 그 뒤에야 reservation이 풀림. 새 턴은 새 `OwnedGroup`이고 이전 stop이 닿지 않음. `this.live.get(id) === live && live.turnId === turnId && live.done`이 아니면 부르지 않음. suggestion이 온 뒤 send. 기다리는 동안 Stop(`cancelWait`, reservation은 관찰로만 풀림). steer가 남은 done 턴(`doneTurn` false)에서는 이 trigger가 아님. 실패·중단 턴과 quitting에서는 기존 경로. group이 끝내 사라지지 않으면 `EXIT_WAIT_MS` 뒤 `busy`(지금과 같음).
- 검증: `npm --prefix app test` green, `node .agents/skills/verify/scripts/verify.mjs` 통과. T0이 다른 원인이면 이 작업은 사용자 결정 뒤 다시 쓴다.
- **commit 경계**: `fix(conversation): end a finished Claude turn's group when its CLI exits`

## T5. UI 연결 (design §2.1, §3.2–§3.3)

- `ConversationThread.tsx`가 `settled.shown`과 `withSending` 전 목록으로 `activityRun`을 적용한다. `ProjectOverview.tsx`와 `CanvasConversationPanel.tsx`의 `turnOf` 두 벌을 `composerTurn`으로 바꾼다. `DockedComposer.tsx`(turn 타입, queue 행 수, focus), `useProjectSkills.ts`(`holding`은 idle 쪽).
- `/design-draft`는 하지 않는다(레이아웃·문구 변경 없음).
- 테스트(host):
  - Claude 도구 activity → 같은 seq의 general stage push → settle 뒤 행 spinner가 없고 head가 단계 수.
  - ACP: 완료 activity event push → 그 render에서 행이 돌지 않음 → stage push → 결과.
  - Overview project 대화에 `turn.done` push, 목록은 아직 `working` → 그 render에서 composer가 Stop이 아니라 비활성 Send, 텍스트 → Queue(Enter와 Control+Enter), queue 행 → Stop.
  - Stop에 focus가 있던 채 holding으로 → focus가 입력란으로. focus가 다른 곳이면 그대로.
  - `CanvasConversationPanel`: handoff 판단 창에서 같은 규칙, "Hands off to <file> when this turn ends" 줄과 함께.
  - `useProjectSkills`: `running → holding`에서 한 번 읽고 `holding → idle`에서 다시 읽지 않음.
  - D2.6: 판단 창의 Delete는 지금처럼 불가, 같은 이유 문구.
  - 한 host의 send가 판단을 기다리는 동안 다른 host의 Send → `busy`.
- 검증: `npm --prefix app test` green, `npm --prefix app run typecheck`, `npm --prefix app run lint`, `node .agents/skills/verify/scripts/verify.mjs` 통과.
- **commit 경계**: `fix(app): an ended tool's row and an ended turn's composer stop looking busy`

## T6. 실제 앱 확인

`/runtime-test`로 격리된 앱에서 바뀐 동작만 짧게 본다. probe는 `.scratch/runtime-test/turn-end-state/`에 둔다(P3 측정은 T0의 계측과 script를 다시 쓰므로 `.scratch/turn-end-state/`를 함께 쓴다). 실제 provider sign-in은 사용자가 승인하고, 끝나면 sign-out과 profile 삭제.

- **(a) 활동 행**: 도구가 끝난 뒤 첫 render에서 행 spinner가 없고 head가 단계 수다.
  - Claude: 병렬 도구를 명시적으로 요청한다(예: `sleep 1`과 `sleep 5`를 함께). frame이 한 `user` frame인지 따로인지 raw frame을 남기고, design의 가정과 다르면 recorded fixture를 하나 더한다.
  - Codex: 일반 명령, `fileChange`, `mcpToolCall`.
  - ACP: 단일 도구 행이 running head 없이 나타난다. Copilot은 병렬 도구도.
- **(b) 판단 창**: Overview `turn.done`과 같은 render에 Stop이 없다. 판단 창에서 입력한 텍스트는 Queue로 들어가 판단 뒤 나간다.
- **(c) P3 목표**(T4 취소로 하지 않는다): packaged build, Claude, canvas 대화, CLI 버전 기록. suggestion 전·후 각각 세 번, 수정 전과 후. group이 leader exit 뒤 0.6 s 안에 사라지고, `turn.started`가 그 순간 + T0 기준선 안에 온다.
- **P4**: 실제 디스크 실패를 만들기 어렵다. 단위 테스트로만 확인했다고 기록한다.
- 통과 기준은 항목마다 위와 같다. 결과(화면 캡처, 측정값)는 PR 본문에 적는다.
- **commit 경계**: T6에서 fixture를 더하면 `test(conversation): recorded Claude parallel tool frames`

## T7. 승격과 정리

- PRODUCT.md:
  - §5 item 3 'Turn indicator'의 activity row 문장(design §2.3).
  - §3 'Turn stages'의 Codex 문장.
- ARCHITECTURE.md §7:
  - 'Turn stages' Sources와 Renderer(design §2.3).
  - composer의 `holding` 판단 한 줄(design §3.4).
  - 'Deletion'의 persistence 실패 문장과 "(BACKLOG)" 참조(:582 근처, design §5.3).
- DESIGN.md 'Turn indicator': Place 행의 "next to a still-spinning activity row…"와 "The activity rows' shipped values were unchanged" 문장.
- BACKLOG.md: 'Known defects'의 :122, :123, :124, :145 네 줄을 지운다. P3 줄(:124)은 지우지 않고 T0이 찾은 원인으로 고쳐 쓴다: project 대화의 send가 promotion 판단(`BIND_GRACE_MS` 10 s)을 기다리고, canvas 대화의 대기는 SIGTERM에 끝나지 않는 CLI를 0.5 s 뒤 SIGKILL하는 0.53–0.55 s다(design §4.1). T6에서 Copilot 병렬 도구를 세 개 보면 :55의 "two were seen"을 고친다.
- `docs/features/turn-end-state/`를 지운다.
- 검증: 바뀐 문장마다 해당 코드와 대조하고, `node .agents/skills/verify/scripts/verify.mjs` 통과.
- **commit 경계**: 문서마다 따로 — `docs(PRODUCT): …`, `docs(ARCHITECTURE): …`, `docs(DESIGN): …`, `docs(BACKLOG): …`, `docs(feature): remove turn-end-state`
