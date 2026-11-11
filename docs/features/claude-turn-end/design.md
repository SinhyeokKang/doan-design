# Claude 턴 종료 판정 결함 고치기 — 설계

## 근거 문서

- PRODUCT §3 Out of scope 4: Doan은 에이전트를 스스로 깨우지 않는다(handoff만 예외).
- PRODUCT §5 item 1 'Project conversations':
  - "A canvas that appears in that root during such a turn or within 10 seconds after it opens if the person opened no other canvas meanwhile"
  - "Promotion is judged once per turn, at the first folder refresh after it ends or 10 seconds after … A send to the same conversation waits until the previous turn is judged."
- PRODUCT §5 'Send now': 읽히기 전에 턴이 끝나면 메시지는 스레드에서 빠져 큐의 원래 자리로 돌아간다.
- PRODUCT §5 'Turn indicator': 표시줄은 턴이 끝나면, Stop이면 그 순간 사라진다. "No command text, thinking text, token count, progress or "still working" line is shown."
- ARCHITECTURE §7 'Agent conversation runtime and IPC':
  - 'Transport and environment': Claude는 턴마다 새 SDK/CLI를 띄운다. ACP는 턴마다 서버를 열고 턴이 끝나면 그룹을 멈춘다. Codex는 `app-server`를 턴 사이에 유지한다. 예약은 그룹 전체가 사라진 것을 관찰한 뒤에만 푼다.
  - Steering의 Claude 항목: 읽힘은 `user_message_uuids`에 uuid가 처음 나오는 top-level 프레임이다. success result가 uuid를 남기면 `STEER_READ_WAIT_MS`까지 기다리고, 지나면 done으로 끝내고 그룹을 멈춘다. "no read can follow a terminal".
  - 'Next-message suggestions': CLI는 done 턴의 result 뒤 1–3초에 제안을 하나 보낸다. 제안은 `conversationSummary`의 `suggestion`으로만 나가고 이벤트가 아니다.
  - 'Turn-end reads': done 턴의 usage는 입력을 닫기 전에 열린 `Query`에서 읽는다.
  - 'Project conversations and promotion': 판정 증거, `taken`, 기존 캔버스 승격에는 편집 activity와 파일 변경이 둘 다 필요하다.
  - Send now(`sendQueuedNow`): 턴 종료 직전에 읽히지 않은 steer의 표시를 풀어 큐로 되돌린다.
  - 'Versions': 최소 버전은 결정으로만 올리고, 버전별로 동작을 나누지 않는다.

## POSTMORTEM에서 걸리는 함정

- **2026-10-28 — A send right after turn.done was refused as busy until the previous process group was gone**: "test sends issued before the previous process's exit callback, not after it … any path that replaces `this.live` for an id whose process is still alive must refuse before replacing it. Real-app checks of consecutive turns must send on `turn.done` itself." → 테스트와 probe는 `turn.done` 순간에 보낸다. 예약 해제 순서는 바꾸지 않는다. 백그라운드 작업이 살아 있는 프로세스는 `EXIT_WAIT_MS`(10초)를 넘겨 살 수 있으므로, 다음 send가 기다리기만 하면 이 회귀가 다시 난다. 아래 '끝난 턴의 프로세스 정리'가 이를 막는다.
- **2026-10-27 — SDK process death reached failure classification before group release**: "Keep reservation release tied to `OwnedGroup` disappearance, not the classification flag or a kill request." → 즉시 SIGKILL을 보내도 예약은 그룹이 사라진 것을 관찰한 뒤에만 푼다. 결함 3의 보류된 종료도 `exited()`에서 예약을 먼저 푼다.
- **2026-11-11 — A runner test closed before the fake CLI exited**: 테스트는 시작한 runner promise를 모두 정리한다.
- **2026-11-05 — A Send now row refused back into the queue could vanish while main still held it**: 결함 3에서 메시지가 큐로 돌아가지 않고 스레드에 남는 경우가 생긴다. renderer의 `sending` 항목 정리가 이 결과에서도 맞는지 테스트한다.

## 1. 판정 시점 — 그룹이 사라진 뒤 정착 시간 (결함 1a)

지금은 승격 판정을 "턴이 끝난 뒤 첫 폴더 다시 읽기" 또는 10초 타이머에만 건다. 10초를 두는 이유는 턴이 쓴 파일의 watcher 이벤트가 늦게 올 수 있기 때문이다. 턴의 프로세스 그룹이 사라지면 그 턴은 더 쓸 수 없고, 남은 것은 watcher 지연뿐이다.

- 규칙: 턴이 끝나고(done, failed, interrupted) 그 턴의 프로세스 그룹이 사라지면, `promotionDeadline`이 정한 시각에 판정한다. 그 전에 폴더 다시 읽기가 오면 지금처럼 그때 판정한다. `BIND_GRACE_MS`(10초)는 상한으로 남는다.
- `promotionDeadline({ endedAt, exitedAt?, settle, grace })`: 그룹이 사라지지 않았으면 `endedAt + grace`. 사라졌으면 `min(endedAt + grace, max(endedAt, exitedAt) + settle)`. 프로세스가 이미 죽은 경우(`exitedAt ≤ endedAt`)는 `endedAt + settle`이다.
- 같은 규칙을 handoff 판정(`judgeHandoff(id, true)`의 타이머, `service.ts` `ended()`)에도 쓴다. `handoffWait`로 기다리는 send도 그만큼 빨리 풀린다.
- `exited()`가 `ended()`보다 먼저 오면 증거와 handoff 턴에 `exitedAt`을 기록한다. `ended()`는 `promotionDeadline`으로 타이머를 건다. `exited()`가 나중에 오면 타이머를 다시 건다. `judgement()`와 `checkProject()`의 늦은 판정 보정(바쁜 main loop)도 `BIND_GRACE_MS` 대신 `promotionDeadline`을 쓴다.
- `PROMOTION_SETTLE_MS`(`project.ts`) = PoC 1e에서 잰 최댓값 × 1.5, 최소 500ms.
- 판정을 기다리는 send는 기다리기 전에 그 대화의 끝난 턴 프로세스를 정리한다(아래 2절). 그러지 않으면 제안 생성(1–3초, 최대 30초)이나 백그라운드 작업이 그룹을 붙잡아 판정이 상한까지 늦어진다.
- 범위: 턴마다 그룹이 끝나는 모든 제공자(Claude, ACP). 규칙이 그룹 소멸에만 걸리므로 제공자로 나누지 않는다. Codex는 서버가 턴 사이에 살아 있어 그룹이 사라지지 않으므로 10초 그대로다. ACP는 측정하지 않고 단위 테스트로만 확인한다.
- 백그라운드 작업이 살아 있어 그룹이 남으면 판정은 10초 상한까지 기다린다. 그 작업이 캔버스를 쓸 수 있으므로 앞당기지 않는다. 다음 send가 그룹을 끝내면 그때부터 정착 시간이 흐른다.
- 판정 중 Stop: 지금처럼 큐를 되돌리고 기다리던 send를 busy로 거부한다. 정착 타이머는 판정이 끝나거나 증거가 버려질 때 지운다.
- **renderer**: 턴 중이나 뒤에 생긴 캔버스를 여는 창(PRODUCT "within 10 seconds after")은 판정에서 닫힌다. `homeRun.ts`가 `endedAt + BIND_GRACE_MS` 대신 대화 목록의 판정 대기 상태(working)가 풀리는 때를 쓴다. `BIND_GRACE_MS` 사본은 상한으로 남는다. 두 턴이 겹칠 때의 규칙은 그대로다. `handoffView.ts`의 `HANDOFF_WAIT_MS`는 handoff 알림 뒤 목록이 대상을 부를 때까지의 상한이라 바꾸지 않는다.

## 2. 끝난 턴의 프로세스 정리 (결함 1b, 백그라운드 작업)

다음 send의 `previousExit()` → `endSuggestion()` → `OwnedGroup.stop()`이 SIGTERM을 보낸다. 입력이 닫힌 CLI는 SIGTERM에 끝나지 않고, 500ms 뒤 SIGKILL에 끝난다. 또 `previousExit()`은 제안이 이미 온 프로세스는 정리하지 않고 기다리기만 한다. 백그라운드 작업이 그 프로세스를 살려 두면 10초 뒤 busy로 거부된다.

- Runner에 끝난 턴의 프로세스를 정리하는 메서드를 더한다(`endAfterTurn()` 같은 이름). 결정은 순수 함수 `afterTurnCleanup({ doneTurn, promptRead, usageOver, inputClosed, background, suggestionSeen, finished })` → `"kill" | "term" | "none"`이 한다.
  - `"kill"`(즉시 SIGKILL): done 턴, 프롬프트 읽힘, usage 읽기 끝남, 입력 닫힘, 백그라운드 집합 빔. 제안 생성만 남았으므로 정리할 것이 없다. PoC 1b가 기록 무결성과 resume을 확인해야 쓴다.
  - `"term"`(SIGTERM → 500ms → SIGKILL): 백그라운드 집합이 비어 있지 않음. 빌드·개발 서버는 SIGTERM에 정리할 기회가 있어야 한다.
  - `"none"`: 이미 끝난 프로세스.
  - usage 읽기 중이면 결정을 입력이 닫힐 때로 미룬다(지금 `suggestionEnded`처럼).
- 즉시 SIGKILL 조건은 두 호출 지점에 모두 들어간다: `endSuggestion`의 `inputClosed` 분기와 루프의 `if (suggestionEnded) void group?.stop()`.
- `previousExit()`은 제안 상태와 상관없이 이 메서드를 부른다(지금의 `!this.suggestions.has(id)` 조건을 없앤다). 이것으로 백그라운드 프로세스 때문에 생기는 busy 거부(POSTMORTEM 2026-10-28 모양)를 막는다.
- `ended()`가 큐 때문에 `holding`을 세울 때도 같은 정리를 부른다. 턴 끝에 나가는 큐는 다음 send다.
- `OwnedGroup`에 즉시 SIGKILL 경로(`kill()`)를 더한다. 이미 `stop()`이 진행 중이라 `stopping`이 캐시되어 있어도 SIGKILL을 보낸다. Stop, 앱 종료, 실패 경로의 SIGTERM → 500ms → SIGKILL은 그대로다.
- 그룹 소멸 관찰은 child `exit` 직후 바로 확인하는 지금 경로를 유지한다. 예약 해제는 그룹 소멸 관찰에만 묶는다(POSTMORTEM 2026-10-27).
- PoC 1b에서 확인할 것: SIGTERM을 무시하는 이유(제안 API 호출을 끝까지 기다리는지), 즉시 SIGKILL 뒤 세션 JSONL 마지막 줄이 온전하고 다음 resume이 정상인지(10회 반복). 참고로 SIGINT의 종료 시간도 함께 잰다. 앱의 `settingSources`와 MCP 아래에서도 원인이 같은지는 tasks 8에서 다시 본다.

## 3. 턴의 프롬프트 읽힘 (결함 2)

가설: 이전 턴의 백그라운드 작업 때문에 CLI가 스스로 연 턴(meta 턴, 예: 작업 종료나 중단 알림)의 success `result`가, Doan이 보낸 프롬프트보다 먼저 온다. `normalizeClaude`는 이것을 이 턴의 끝으로 읽고 입력을 닫는다. 그 뒤 CLI는 Doan의 프롬프트를 처리하지만 Doan은 이미 턴을 끝냈다.

- 근거: SDK 0.3.312 `sdk.d.ts`의 `user_message_uuid(s)` 설명. meta 턴의 프레임은 클라이언트 uuid를 싣지 않고, 사람 메시지가 접혀 들어가면 그 uuid가 echo된다. 이전 Send now PoC(`.scratch/queue-send-now/claude.mjs`, 2.1.317)에서 첫 프롬프트에 uuid를 주면 result의 `user_message_uuids`에 그 uuid가 있었다.
- 동작: 턴의 프롬프트에도 uuid를 붙여 보낸다. transport state가 그 uuid를 "이 턴의 프롬프트"로 기억한다(`promptTransport`). steer와 같은 읽힘 규칙을 쓴다. success result는 프롬프트가 읽힌 뒤에만 종료가 된다. 읽히기 전의 success result는 steer의 `awaitingRead`처럼 다루어 같은 `STEER_READ_WAIT_MS` 상한 안에서 기다린다.
- 프롬프트가 읽히기 전에 온 프레임(meta 턴의 답, 도구 activity)은 이 턴의 이벤트로 나간다. 숨기면 프로세스가 보이지 않게 일하게 된다. 사람의 답보다 meta 턴의 답이 먼저 보여 헷갈리는지는 tasks 8에서 관찰한다.
- 상한이 지나도 프롬프트가 읽히지 않으면, 그룹을 멈추고 턴을 실패로 끝낸다. 스레드는 "Claude Code didn’t pick up your message. Send it again."을 보인다. 그 메시지는 이미 `user.message`로 스레드에 있고, 큐로 돌아가지 않는다. 실패는 새 `turn.failed` 코드 `prompt_unread`로 기록한다(사용자 결정, '형식 변경').
- 프롬프트가 읽히지 않은 채 failed나 aborted result가 오면 지금처럼 즉시 종료하고, 그룹을 멈춘다(CLI가 그 프롬프트를 뒤에 몰래 처리하지 않게).
- `doneTurn`과 usage 읽기 조건(`runners.ts`)에 "프롬프트 읽힘"을 더한다. 프롬프트를 읽지 않은 턴의 done은 없다.
- **최소 버전**: Claude 최소 버전은 2.1.284다. 버전별로 나누지 않는다(ARCHITECTURE §7 'Versions'). 2.1.284가 첫 프롬프트 uuid를 echo하지 않으면 모든 턴이 상한까지 기다리다 실패하므로, PoC에서 멈추고 최소 버전을 올릴지 사용자에게 묻는다.
- PoC 결과가 가설과 다르면 이 절을 다시 쓴다. 56ms가 모델 왕복보다 짧다는 점이 설명되어야 한다.

## 4. 읽히지 않은 Send now 메시지의 기록 확인 (결함 3)

지금은 상한이 지나면 done으로 끝내고, 읽히지 않은 메시지를 큐로 되돌린다. CLI가 메시지를 이미 받아 세션 기록에 썼다면, 다음 resume에서 에이전트는 그 메시지를 기록으로 보고, 큐에서 다시 가는 같은 메시지를 또 받는다. 기록에 있는 메시지는 CLI가 받을 때 썼든 읽을 때 썼든 이미 보낸 것이다.

서비스가 맡는다.

- **보류**: 읽히지 않은 steer uuid를 가진 Claude live에 종료 이벤트(상한 만료의 done, failed, aborted, interrupted)가 오면, `receive()`가 그 종료를 바로 쓰지 않고 `pendingTerminal`로 들고 있는다. 이 경로는 Stop(`interrupt()`), 로그아웃(`stopRuns`), archive, 앱 종료에도 적용된다.
- **`exited()`에서 순서대로**: (1) 예약을 먼저 푼다(POSTMORTEM 2026-10-27). (2) 세션 기록을 찾는다. (3) 찾은 steer를 `steerConsumed`로 보고한다(`user.message`가 그 턴에 붙는다). (4) 보류한 종료를 쓴다. 이때 `process_exited`로 바꾸지 않는다. (5) 찾지 못한 steer는 지금처럼 큐로 돌아간다.
- "no read can follow a terminal"을 지킨다. 찾기는 종료 이벤트를 쓰기 전에 끝난다.
- **상한**: 서비스가 보류 시작부터 2초를 잰다. 그 안에 그룹이 사라지지 않으면 찾지 않고 보류한 종료를 쓰고 steer를 큐로 돌린다. 앱이 종료 중이면 이벤트를 쓰지 않는다.
- **Stop 순간의 턴 표시줄**: 종료 이벤트가 늦어도 PRODUCT 'Turn indicator'의 "at once on Stop"을 지키도록, 서비스가 Stop을 받은 순간 대화 목록에 `stopping`을 내보내고, renderer의 `turnStatus`가 이를 보면 표시줄을 바로 숨긴다.
- **기록 경로와 읽기**: 경로는 이미 있다. `prepare.ts` `claudeSessionExists`의 `<configDir>/projects/*/<id>.jsonl`. 파싱은 `io.ts`(`openRegular`/`readDescriptor`)에서 한다(`sessions.ts`가 아니다). 턴을 받아들일 때 파일 크기를 기록하고, 그 뒤 붙은 바이트만 읽는다(1MB tail이 아니다). 순수 함수 `readInTranscript(appended, uuids)`가 찾은 uuid를 돌려준다. 잘린 첫 줄, 깨진 줄은 무시한다. 필드는 PoC 1c로 정한다.
- **legacy-external Claude 대화**: 같은 방식으로 기록을 읽기만 한다(프로필은 사용자의 것이고 쓰지 않는다).
- PoC 1c에서 확인할 것: steer로 보낸 메시지(접힘, 후속 턴)가 기록에 어떤 필드로 들어가는지, 언제 쓰이는지, 읽히기 전에 그룹을 멈추면 어떻게 되는지. 클라이언트 uuid가 기록에 남지 않으면 이 설계는 쓸 수 없고 사용자에게 돌아온다.

## 5. 백그라운드 작업 — done 턴 뒤에도 도는 작업 (사용자 결정)

결정: 에이전트가 시작한 백그라운드 작업(빌드, 개발 서버)이 아직 도는 채로 턴이 done으로 끝나면, 턴은 done으로 끝나고 스레드가 그 작업이 아직 돌고 있으며 다음 send나 Stop으로 끝난다고 보여 준다.

**감지.** level 신호 `system/background_tasks_changed`만 쓴다(SDK 0.3.312: 살아 있는 백그라운드 작업 전체를 매번 다시 보내고, 프로세스마다 빈 집합에서 시작한다. SDK가 edge 스트림(`task_started`·`task_notification`)과 짝지우지 말라고 한다). 순수 함수 `backgroundTasks(state, raw)`가 집합을 교체한다.
- 셈에 넣는 것: 백그라운드 셸 작업과 백그라운드 서브에이전트(`task_type: local_agent`).
- 빼는 것: `ambient: true` 항목(SDK: 호스트가 활동 표시에서 뺀다).
- done result 때 집합이 비어 있지 않으면 표시를 켠다. runner는 지금도 done 뒤 제안을 읽으려고 스트림을 계속 읽으므로, 그 루프에서 집합을 계속 갱신한다.
- PoC 1d에서 확인할 것: 2.1.284와 현재 버전이 `background_tasks_changed`를 보내는지와 시점, 입력이 닫힌 뒤 CLI가 작업이 끝날 때까지 사는지, 작업 종료 뒤 CLI가 스스로 모델을 부르는지, 집합이 비는 프레임과 첫 모델 요청 사이의 간격. 2.1.284가 이 신호를 보내지 않으면 멈추고 최소 버전을 올릴지 사용자에게 묻는다.

**사람의 메시지 없는 모델 요청 막기(PRODUCT §3 Out of scope 4).** PoC 1d가 CLI가 작업 종료 뒤 스스로 모델을 부른다고 보이면, 집합이 비는 프레임에서 그룹을 멈춘다(`"term"`이 아니라 즉시 SIGKILL; 작업은 이미 끝났다). 끝난 작업의 결과는 세션 기록에 남아 다음 턴에서 에이전트가 볼 수 있다. 그 간격이 너무 짧아 요청이 나가기 전에 막을 수 없으면 PoC 멈춤 조건이다. CLI가 스스로 모델을 부르지 않으면 이 정지는 넣지 않고 그룹이 스스로 끝나기를 기다린다.

**보관과 전달.** 표시는 살아 있는 프로세스의 상태라 메모리에만 둔다. 이벤트로 쓰지 않는다(이벤트 JSONL v1이 모르는 타입을 거부하므로, 제안과 같은 이유). 서비스가 대화별로 들고, 그 done 턴의 turnId와 함께 `conversationSummary`에 붙여 내보낸다(예: `background: { turnId, stopping? }`). 재시작하면 프로세스가 없으므로 표시도 없다.

**다른 곳에서는 실행 중이 아니다.** 백그라운드만 남은 대화는 working도 running도 아니다. 슬롯, 사이드바 스피너, Home strip, 에이전트 표시는 바뀌지 않는다. `stop_required`는 이 그룹을 세지 않는다. 로그아웃(`stopRuns`), Restart to Update, 프로젝트 Remove, archive, 삭제, 앱 종료는 묻지 않고 이 그룹을 조용히 멈춘다(SIGTERM 경로). 그동안에도 그 그룹은 계정 lease와 세션 예약을 쥐고 있으므로, 이 경로들은 그룹 소멸을 기다린 뒤 다음 단계로 간다.

**스레드 표시.** done 턴의 답 아래, 턴 표시줄이 있던 자리에 한 줄을 둔다. 회전이나 sweep 없이 정적이다. 문구는 하나다.
- "Background work is still running. It stops when you send your next message or press Stop."
- 줄 안에 작은 Stop 버튼을 둔다(사용자 결정). done 뒤에는 composer의 Stop이 없기 때문이다. 문구와 버튼은 `/design-draft` 초안에서 최종 확인한다.
- Stop 상태: 누르면 스피너와 함께 누를 수 없게 되고, 그룹이 사라질 때까지 줄이 남는다. 실패하면 Stop이 돌아오고 토스트 "Couldn’t stop the background work. Try again."이 뜬다.
- 접근성: 접근 가능한 이름은 "Stop background work". 평범한 Tab 정지점이다. 빈 composer에서 Tab은 제안을 받으므로, composer에서 Shift+Tab으로 닿는다. 포커스가 Stop에 있는 채로 줄이 사라지면 포커스는 그 composer 필드로 간다. 줄은 live region이 아니다. 나타날 때 스레드의 screen-reader 상태가 한 번 알린다("Background work is still running").
- Overview와 캔버스 패널이 같은 규칙을 따른다.

**사라지는 때.**
- send가 있으면: 사람의 메시지가 스레드에 들어가는 렌더(턴 표시줄이 나타나는 순간)에 사라진다. 턴 끝에 나가는 큐도 send다.
- send 없이: 작업이 스스로 끝나 그룹이 사라지거나, 줄의 Stop으로 그룹이 사라질 때.
- 대화가 archive·삭제되거나, 그 Claude 연결이 로그아웃·변경되거나, 앱이 종료될 때(위 '조용히 멈춘다').

**Stop의 대상.** 새 IPC를 만들지 않고 `conversation:interrupt`의 not-busy 분기(`service.ts` `interrupt()`의 `if (!live || !live.busy)`)를 넓힌다. Stop은 줄이 가리킨 done 턴의 프로세스(그 turnId 또는 runner 세대)만 멈춘다. 새 send가 이미 시작된 뒤 늦게 온 Stop은 아무것도 하지 않는다. Overview와 캔버스 패널에서 두 번 눌려도 한 번만 처리한다. 턴 이벤트는 쓰지 않는다(이미 done으로 끝난 턴이다).

**다음 send.** 위 2절의 `"term"` 정리로 그룹을 끝내고 소멸을 기다린 뒤 시작한다. 프로젝트 판정은 1절대로 그때부터 정착 시간이 흐른다. handoff나 terminal의 continue가 백그라운드 그룹이 살아 있는 같은 세션을 resume하려 할 때도 같은 정리를 먼저 한다.

## 영향 받는 구성요소

- **앱(main)**: `conversation/runners.ts`(프롬프트 uuid, `afterTurnCleanup` 호출 지점, 백그라운드 집합, 프롬프트 조건이 붙은 `doneTurn`·usage 읽기), `conversation/transport.ts`(프롬프트 읽힘, 백그라운드 집합 갱신), `conversation/process.ts`(`OwnedGroup.kill()`), `conversation/service.ts`(`promotionDeadline` 타이머, handoff 판정, `previousExit`와 `ended()`의 정리, `pendingTerminal`과 기록 찾기, `interrupt()` not-busy 분기, 조용한 정지 경로, `stopping`·`background` 목록 필드), `conversation/summary.ts`, `conversation/project.ts`(`PROMOTION_SETTLE_MS`), `conversation/io.ts`(기록 읽기), `conversation/types.ts`·`conversation/store.ts`(`prompt_unread`). 로그아웃·Restart to Update·프로젝트 Remove의 `stop_required` 계산.
- **앱(preload·renderer)**: 스레드의 백그라운드 줄과 Stop(Overview와 캔버스 패널), `turnStatus.ts`의 `stopping`, `homeRun.ts`의 새 캔버스 창, `prompt_unread`의 문구(`threadItems.ts`, `ConversationThread.tsx`, `conversationStrip.ts`).
- **CLI(Go)·스킬·가이드**: 없음.

## 순수 함수로 떼어낼 부분 (`/tdd` 대상)

1. `promotionDeadline({ endedAt, exitedAt?, settle, grace })` → 판정 시각(1절).
2. `promptTransport(state, uuid)`와 `normalizeClaude`의 result 규칙: 프롬프트가 읽히기 전 success result는 `awaitingRead`, 읽힌 뒤는 `turn.done`, 프롬프트와 steer가 같은 프레임에서 읽힘, meta 턴의 프레임이 이 턴의 이벤트로 나감, 만료 시 `endPromptWait`(실패)와 `endSteerWait`(done).
3. `readInTranscript(appended, uuids)` → 덧붙은 바이트에서 찾은 uuid 목록. 2.1.284와 현재 버전의 실제 JSONL fixture(`conversation/fixtures/`)로 테스트한다.
4. `backgroundTasks(state, raw)` → `background_tasks_changed`로 교체한 집합(`local_agent` 포함, `ambient` 제외).
5. `afterTurnCleanup({ … })` → `"kill" | "term" | "none"`(2절).
6. `backgroundLine({ background, sending, stopping })` → 줄을 그릴지, Stop 상태. 문구는 하나다. 사람의 메시지가 들어간 렌더에서는 그리지 않는다.

## 형식 변경

- 이벤트 JSONL(v1), CLI 응답, `runtime.json`, 앱 소켓 메시지의 스키마는 그대로다. 결함 3에서 남는 메시지는 기존 `user.message`다.
- 대화 목록 IPC(`ConversationSummary`)에 메모리 전용 필드 `background`, `stopping`이 는다. JSON Schema 공유 형식이 아니다.
- `turn.failed`에 새 코드 `prompt_unread`를 더한다(사용자 결정). 바꿀 곳:
  - `types.ts` `FailureCode`.
  - `store.ts`의 `turn.failed` 검증 목록(닫힌 목록). 이 목록은 TypeScript에만 있다. 루트 `schema/`에 이벤트 JSONL 스키마나 공유 fixture는 없고(ARCHITECTURE §11의 공유 형식에 대화 이벤트는 들어 있지 않다), Go는 이 기록을 읽지 않는다. 그래서 스키마 파일과 Go 쪽 변경은 없다.
  - 이벤트 JSONL 버전 `v`는 1 그대로다. 새 코드는 기존 이벤트 타입의 값이 하나 는 것이다.
  - renderer가 실패 코드별 문구를 고르는 곳(`threadItems.ts`, `ConversationThread.tsx`, `conversationStrip.ts`).
  - 테스트: `storeRecovery.test.ts`(새 코드가 든 기록을 읽음, 모르는 코드는 여전히 거부), `transport.test.ts`·runner 테스트(만료 시 `prompt_unread`), renderer 테스트(문구, strip).
- 대가: `store.ts`가 모르는 코드를 거부하므로, `prompt_unread`가 든 대화 기록은 이 코드를 모르는 이전 빌드에서 읽히지 않는다. 앱을 이전 버전으로 되돌리거나, 같은 기록을 이전 빌드가 읽는 경우(대화 이벤트는 기기 밖으로 옮기지 않으므로 같은 기기의 다운그레이드가 주된 경우다)에 그 대화는 읽기 실패로 보인다. 기록 자체는 지우거나 고치지 않으므로 다시 올리면 읽힌다. 이 결과를 ARCHITECTURE §7에 적는다.

## 컨벤션 영향

없다. ARCHITECTURE §1과 `doan check` 규칙은 바뀌지 않는다.

## 결정 영향

- PRODUCT §5 item 1 'Project conversations': 판정 시점이 "그룹이 사라진 뒤 정착 시간, 10초 상한"으로 바뀐다. 새 캔버스를 여는 창은 판정에서 닫힌다. handoff 판정도 같다. 승격 결과와 두 턴이 겹칠 때의 규칙은 그대로다.
- PRODUCT §5 'Send now': 기록에 있는 steer는 그 턴에 남는다.
- PRODUCT §5 'Turn indicator': "No … "still working" line"은 실행 중인 턴에 대한 규칙으로 좁히고, 백그라운드 줄은 별도 항목이 된다.
- PRODUCT §5 대화 스레드: 백그라운드 작업 줄, 그 Stop, 사라지는 때, 턴 끝의 큐도 다음 send로 셈, 다른 곳에서는 실행 중이 아님, 로그아웃 등에서 묻지 않고 멈춤, 결함 2의 실패 문구.
- ARCHITECTURE §7: Steering Claude 항목, 'Project conversations and promotion', 'Next-message suggestions', 'Turn-end reads', 그룹 정리 규칙. `runners.ts` `TURN_USAGE_MS` 주석의 "SIGKILL after 0.5 s"도 맞춘다. "no read can follow a terminal"과 "예약은 그룹 소멸 관찰로만 푼다"는 지킨다.
- ARCHITECTURE의 구조 결정(서빙 범위, sandbox iframe, 토큰, git 명령)은 건드리지 않는다.

## PoC 의존

실제 Claude CLI에서 확인되지 않은 가정이 넷 있다. tasks 1이 먼저 확인한다.

1. 결함 1: 제안만 남은 CLI가 SIGTERM을 무시하는 이유, 즉시 SIGKILL의 종료 시간과 세션 기록 무결성, 다음 resume. 턴 마지막 파일 쓰기에서 `refreshed()`까지의 지연.
2. 결함 2: 백그라운드 작업을 남긴 세션에 보낸 턴의 원시 프레임 순서. 첫 result가 meta 턴의 것이고 클라이언트 uuid가 없는지. 첫 프롬프트 uuid가 2.1.284와 현재 버전에서 echo되는지.
3. 결함 3: steer 메시지의 클라이언트 uuid가 세션 기록에 남는지, 어떤 필드로, 언제.
4. 백그라운드 작업: `background_tasks_changed`의 유무와 시점(두 버전), 입력이 닫힌 뒤 CLI의 수명, 작업 종료 뒤 CLI가 스스로 모델을 부르는지와 그 간격.

PoC는 설치된 CLI의 기존 로그인으로 돌린다. 임시 cwd와 `settingSources: []`를 쓴다(이전 Send now PoC 방식). 2.1.284는 `.scratch/claude-turn-end/cli-284/`에 따로 설치하고 `pathToClaudeCodeExecutable`로 가리킨다. 스크립트는 `.scratch/claude-turn-end/`의 명령이며 커밋하지 않는다. 세션 기록이 실제 `~/.claude` 아래에 남는다. PoC는 자기가 만든 세션만 읽고 resume하며, 다른 세션을 건드리지 않는다.

## 실제 앱 확인의 로그인

PoC와 달리 실제 앱 확인(tasks 8)은 Doan Claude 연결이 필요하다. 격리 userData·HOME의 패키지 앱에서 사용자가 Doan Claude 연결에 한 번 로그인한다(사용자 결정).

