# Claude 턴 종료 판정 결함 고치기 — 설계

## 근거 문서

- PRODUCT §5 item 1 'Project conversations': "Promotion is judged once per turn, at the first folder refresh after it ends or 10 seconds after … A send to the same conversation waits until the previous turn is judged."
- PRODUCT §5 'Send now': 읽히기 전에 턴이 끝나면 메시지는 스레드에서 빠져 큐의 원래 자리로 돌아간다.
- PRODUCT §5 'Turn indicator': 턴이 끝나면 표시줄은 사라진다. "No command text, thinking text, token count, progress or "still working" line is shown."(실행 중 턴의 표시줄 규칙. 아래 백그라운드 줄은 끝난 턴 뒤의 별도 줄이다.)
- ARCHITECTURE §7 'Agent conversation runtime and IPC':
  - 'Transport and environment': Claude는 턴마다 새 SDK/CLI를 띄운다. ACP는 턴마다 서버를 열고 턴이 끝나면 그룹을 멈춘다. Codex는 `app-server`를 턴 사이에 유지한다. 예약은 그룹 전체가 사라진 것을 관찰한 뒤에만 푼다.
  - Steering의 Claude 항목: 읽힘은 `user_message_uuids`에 uuid가 처음 나오는 top-level 프레임이다. success result가 uuid를 남기면 `STEER_READ_WAIT_MS`까지 기다리고, 지나면 done으로 끝내고 그룹을 멈춘다. "no read can follow a terminal".
  - 'Next-message suggestions': CLI는 done 턴의 result 뒤 1–3초에 제안을 하나 보낸다. 제안은 `conversationSummary`의 `suggestion`으로만 나가고 이벤트가 아니다.
  - 'Project conversations and promotion': 판정 증거, `taken`, 기존 캔버스 승격에는 편집 activity와 파일 변경이 둘 다 필요하다.
  - Send now(`sendQueuedNow`): 턴 종료 직전에 읽히지 않은 steer의 표시를 풀어 큐로 되돌린다.
- ARCHITECTURE §7 'Versions': 최소 버전은 결정으로만 올린다.

## POSTMORTEM에서 걸리는 함정

- **2026-10-28 — A send right after turn.done was refused as busy until the previous process group was gone**: "test sends issued before the previous process's exit callback, not after it … any path that replaces `this.live` for an id whose process is still alive must refuse before replacing it. Real-app checks of consecutive turns must send on `turn.done` itself." → 결함 1과 백그라운드 작업의 테스트·probe는 `turn.done` 순간에 보낸다. 예약 해제 순서는 바꾸지 않는다. 백그라운드 작업이 살아 있는 프로세스는 `EXIT_WAIT_MS`(10초)를 넘겨 살 수 있으므로, 다음 send가 기다리기만 하면 이 회귀(busy 거부)가 다시 난다.
- **2026-10-27 — SDK process death reached failure classification before group release**: "Keep reservation release tied to `OwnedGroup` disappearance, not the classification flag or a kill request." → 즉시 SIGKILL을 보내도 예약은 그룹이 사라진 것을 관찰한 뒤에만 푼다.
- **2026-11-11 — A runner test closed before the fake CLI exited**: 테스트는 시작한 runner promise를 모두 정리한다. 제안 대기·백그라운드 작업 프로세스를 끝내는 테스트가 이 경로를 다시 건드린다.
- **2026-11-05 — A Send now row refused back into the queue could vanish while main still held it**: 결함 3에서 메시지가 큐로 돌아가지 않고 스레드에 남는 경우가 생긴다. renderer의 `sending` 항목 정리(성공 응답 때 제거)가 이 새 결과에서도 맞는지 본다.

## 결함별 설계

### 결함 1a — 프로젝트 대화의 10초 대기

지금은 판정을 "턴이 끝난 뒤 첫 폴더 다시 읽기" 또는 10초 타이머에만 건다. 10초를 두는 이유는 턴이 쓴 파일의 watcher 이벤트가 늦게 올 수 있기 때문이다. 그런데 턴의 프로세스 그룹이 사라지면 그 턴은 더 쓸 수 없다. 남은 것은 watcher 지연뿐이다.

- 규칙: done으로 끝난 프로젝트 턴은, 그 턴의 프로세스 그룹이 사라진 시점부터 `PROMOTION_SETTLE_MS`가 지나면 판정한다. 그 전에 폴더 다시 읽기가 오면 지금처럼 그때 판정한다. `BIND_GRACE_MS`(10초)는 상한으로 남는다. renderer의 `BIND_GRACE_MS` 사본(`homeRun.ts`)은 상한으로만 쓰이므로 바꾸지 않는다.
- `PROMOTION_SETTLE_MS`는 PoC로 정한다. 실제 앱에서 턴 마지막에 쓴 캔버스 파일의 watcher 이벤트가 `refreshed()`에 닿기까지 걸린 시간(watcher 지연 + `DEBOUNCE_MS` 200ms + `doan ls`)의 최댓값에 여유를 더한다.
- 판정을 기다리는 send가 있으면, 기다리기 전에 그 대화의 done 턴 프로세스에 `endSuggestion()`을 부른다(`previousExit`이 지금 하는 것과 같다). 그러지 않으면 제안을 만드는 동안(1–3초, 최대 30초) 그룹이 남아 판정이 늦어진다. 백그라운드 작업이 살아 있는 프로세스도 이 send가 끝낸다(아래 '백그라운드 작업').
- `exited(id)`에서 그 대화의 증거가 `endedAt`을 가졌고 아직 판정 전이면, 판정 타이머를 `min(endedAt + BIND_GRACE_MS, exitedAt + PROMOTION_SETTLE_MS)`로 다시 건다.
- 범위: 턴마다 그룹이 끝나는 모든 제공자(Claude, ACP). 규칙이 그룹 소멸에만 걸리므로 제공자로 나누지 않는다. Codex는 서버가 턴 사이에 살아 있어 그룹이 사라지지 않으므로 자연히 지금처럼 10초다. ACP는 측정하지 않고 단위 테스트로만 확인한다.
- 백그라운드 작업이 살아 있어 그룹이 남으면 판정은 10초 상한까지 기다린다. 그 작업이 캔버스를 쓸 수 있으므로 앞당기지 않는다. 다음 send가 그룹을 끝내면 그때부터 정착 시간이 흐른다.

### 결함 1b — 캔버스 대화의 0.5초 대기

다음 send의 `previousExit()` → `endSuggestion()` → `OwnedGroup.stop()`이 SIGTERM을 보낸다. 입력이 닫힌 CLI는 SIGTERM에 끝나지 않고, 500ms 뒤 SIGKILL에 끝난다. 그룹 소멸 확인은 100ms 간격이다.

- 동작: done 턴이고, usage 읽기도 끝났고, 남은 일이 제안뿐인 프로세스(`endSuggestion()`의 대상)는 즉시 SIGKILL로 끝낸다. PoC가 SIGKILL 뒤 세션 기록 무결성과 다음 resume 성공을 확인해야 이 동작을 쓴다. 확인되지 않으면 사용자에게 돌아온다.
- `OwnedGroup`에 유예 없는 정리 경로를 더한다. Stop, 앱 종료, 실패 경로, 백그라운드 작업이 살아 있는 프로세스의 SIGTERM → 500ms → SIGKILL은 그대로 둔다. 진행 중인 턴이나 빌드·개발 서버는 SIGTERM에 정리할 기회가 있어야 하기 때문이다.
- 그룹 소멸 관찰은 child `exit` 직후 한 번 바로 확인하는 지금 경로(`childExited` → `observe`)를 유지한다. 100ms 폴링이 대기의 큰 몫이면 PoC 결과로 판단한다.
- 예약 해제는 여전히 그룹 소멸 관찰에만 묶는다(POSTMORTEM 2026-10-27).
- PoC에서 확인할 것: SIGTERM을 무시하는 이유(제안 API 호출을 끝까지 기다리는지), 즉시 SIGKILL 뒤 세션 JSONL 마지막 줄이 온전하고 다음 resume이 정상인지(10회 반복). 참고로 SIGINT의 종료 시간도 함께 잰다.

### 결함 2 — 백그라운드 작업이 남은 세션의 조기 `turn.done`

가설: 이전 턴의 백그라운드 작업 때문에 CLI가 스스로 연 턴(meta 턴, 예: 작업 종료나 중단 알림)의 success `result`가, Doan이 보낸 프롬프트보다 먼저 온다. `normalizeClaude`는 이것을 이 턴의 끝으로 읽고 입력을 닫는다. 그 뒤 CLI는 Doan의 프롬프트를 처리하지만 Doan은 이미 턴을 끝냈다.

- 근거: SDK 0.3.312 `sdk.d.ts`의 `user_message_uuid(s)` 설명. meta 턴의 프레임은 클라이언트 uuid를 싣지 않고, 사람 메시지가 접혀 들어가면 그 uuid가 echo된다. 이전 Send now PoC(`.scratch/queue-send-now/claude.mjs`, 2.1.317)에서 첫 프롬프트에 uuid를 주면 result의 `user_message_uuids`에 그 uuid가 있었다.
- 동작: 턴의 프롬프트에도 uuid를 붙여 보낸다. transport state가 그 uuid를 "이 턴의 프롬프트"로 기억한다. steer와 같은 읽힘 규칙(어느 top-level 프레임의 `user_message_uuids`에 처음 나오면 읽힘)을 쓴다. success result는 턴의 프롬프트가 읽힌 뒤에만 종료가 된다. 읽히기 전의 success result는 지금 steer의 `awaitingRead`처럼 다루어, 같은 `STEER_READ_WAIT_MS` 상한 안에서 기다린다.
- 프롬프트가 읽히기 전에 온 프레임(meta 턴의 답, 도구 activity)은 이 턴의 이벤트로 나간다. 숨기면 프로세스가 보이지 않게 일하게 된다.
- 상한이 지나도 프롬프트가 읽히지 않으면, 그룹을 멈추고 턴을 `turn.failed`(`unknown`)로 끝낸다. 에이전트가 읽지 않은 프롬프트에 done을 내면 답이 있었던 것처럼 보이기 때문이다.
- failed나 aborted result는 지금처럼 즉시 종료다.
- **최소 버전 의존**: Claude 최소 버전은 2.1.284다. 그 버전이 첫 프롬프트 uuid를 echo하지 않으면, 모든 턴이 상한까지 기다리다 실패한다. PoC에서 2.1.284와 현재 설치 버전 둘 다 확인한다. echo하지 않으면 최소 버전을 올리거나 버전별로 나누어야 하고, 이는 결정 사항이므로 사용자에게 돌아온다.
- PoC 결과가 가설과 다르면(예: 그 result가 정말 이 프롬프트의 것이고, 모델이 Bash를 백그라운드로 돌린 뒤 바로 끝낸 경우) 이 절을 다시 쓴다. 이 경우 56ms가 모델 왕복보다 짧다는 점이 설명되어야 한다.

### 결함 3 — 늦게 보고된 Send now 메시지의 중복

지금은 상한이 지나면 done으로 끝내고, 읽히지 않은 메시지를 큐로 되돌린다. CLI가 메시지를 이미 받아 세션 기록에 썼다면, 다음 resume에서 에이전트는 그 메시지를 기록으로 보고, 큐에서 다시 가는 같은 메시지를 또 받는다.

- 동작: 읽히지 않은 steer uuid를 남긴 채 끝나는 모든 Claude 종료(상한 만료, failed, aborted, Stop)는, 프로세스 그룹이 사라진 뒤 그 세션의 기록(JSONL)에서 uuid를 찾는다.
  - 찾으면 읽힌 것으로 본다. `steerConsumed`를 종료 이벤트보다 먼저 보고해, 메시지가 그 턴의 사람 메시지로 남고 큐로 돌아가지 않는다.
  - 못 찾거나 기록을 읽을 수 없으면 지금처럼 큐로 되돌린다.
- 근거: 기록에 있는 메시지는 다음 resume에서 에이전트의 문맥에 들어간다. CLI가 받을 때 쓰든 읽을 때 쓰든, 기록에 있으면 이미 보낸 것이다. 종료 방식과 상관없이 중복 위험이 같다.
- "no read can follow a terminal"을 지킨다. 찾기는 그룹이 사라진 뒤, 종료 이벤트를 내기 전에 끝낸다. 그만큼 종료 이벤트가 늦어진다(그룹 정리 최대 0.5초 + 파일 읽기). 그룹이 사라지지 않으면 `stop()`의 2초 상한 뒤 찾지 않고 큐로 되돌린다. Stop의 경우 PRODUCT의 "Stop은 즉시 표시줄을 없앤다"와 부딪히지 않는지 tdd에서 확인한다(표시줄은 Stop 순간 사라지고, 종료 이벤트만 늦는다).
- PoC에서 확인할 것: steer로 보낸 메시지(접힘, 후속 턴 두 경우)가 기록에 어떤 필드로 들어가는지(`uuid`가 클라이언트 uuid와 같은지, `promptId` 등 다른 필드인지), 언제 쓰이는지(받을 때 / 읽을 때), 그리고 Doan이 그 기록 경로를 알 수 있는지(Doan 연결 프로필, 펜스 안 실행). 클라이언트 uuid가 기록에 남지 않으면 이 설계는 쓸 수 없고 사용자에게 돌아온다.

### 백그라운드 작업 — done 턴 뒤에도 도는 작업 (사용자 결정)

결정: 에이전트가 시작한 백그라운드 작업(빌드, 개발 서버)이 아직 도는 채로 턴이 done으로 끝나면, 턴은 done으로 끝나고 스레드가 그 작업이 아직 돌고 있으며 다음 send나 Stop으로 끝난다고 보여 준다.

**감지.** 후보는 둘이다. PoC로 정한다.

1. 스트림이 알려 주는 작업 집합: SDK 0.3.312의 `system/background_tasks_changed`(살아 있는 백그라운드 작업 전체를 매번 다시 보내는 level 신호, 프로세스마다 빈 집합에서 시작)와 `task_started`(`is_backgrounded`)·`task_notification`. done result 시점에 마지막 집합이 비어 있지 않으면 백그라운드 작업이 있다. 작업 이름과 종류(`task_type`)를 알 수 있다.
2. 그룹 생존: `turn.done` 뒤에도 그룹이 사라지지 않음. 그러나 제안 생성도 그룹을 1–3초(최대 30초) 살려 두므로 이것만으로는 구분할 수 없다.

추천은 1을 주 신호로, 2를 끝남 신호로 쓰는 것이다. 즉 done result 때 집합이 비어 있지 않으면 표시를 켜고, 그룹이 사라지면 끈다. PoC에서 확인할 것:
- 2.1.284와 현재 버전이 `background_tasks_changed`를 보내는지, done result 전후 어느 시점에 보내는지. 보내지 않는 버전이면 `task_started`·`task_notification` 짝으로 집합을 만든다.
- 입력이 닫힌 뒤 CLI가 백그라운드 작업이 끝날 때까지 살아 있는지, 작업을 죽이고 끝나는지.
- 작업이 끝나면 CLI가 스스로 meta 턴을 열어 모델을 부르는지(입력이 닫혀 있어도).
- runner는 지금도 done 뒤 제안을 읽으려고 스트림을 계속 읽는다. 백그라운드 집합 갱신도 그 루프에서 읽는다.

**보관과 전달.** 표시는 살아 있는 프로세스의 상태라 메모리에만 둔다. 이벤트로 쓰지 않는다(이벤트 JSONL v1이 모르는 타입을 거부하므로, 제안과 같은 이유). 서비스가 대화별로 들고 `conversationSummary`에 제안처럼 붙여 내보낸다(예: `background: { count }`). 재시작하면 프로세스가 없으므로 표시도 없다.

**스레드 표시.** done 턴의 답 아래, 턴 표시줄이 있던 자리에 한 줄을 둔다. 회전이나 sweep 없이 정적이다.
- 문구 제안: "Background work is still running. It stops when you send your next message or press Stop."
  - 작업이 하나이고 이름을 알면: "A background command is still running. It stops when you send your next message or press Stop."
- Stop: done 뒤에는 composer의 Stop이 없다(PRODUCT §5 composer 규칙). 그래서 줄 안에 작은 Stop 버튼을 둔다(사용자 결정). 문구와 버튼은 `/design-draft` 초안에서 최종 확인한다.
- 접근성: 줄은 live region이 아니다. 나타날 때 스레드의 screen-reader 상태가 한 번 알린다("Background work is still running").
- 새 UI이므로 `/feature-review` 뒤 `/design-draft`로 초안을 그리고 사용자 확인을 받는다.

**사라지는 때.** 다음 중 먼저 오는 것.
- 다음 send가 그 프로세스 그룹을 끝냈을 때(그룹 소멸 관찰).
- 줄의 Stop으로 그룹을 끝냈을 때.
- 작업이 스스로 끝나 그룹이 사라졌을 때.
- 대화가 archive·삭제되거나, 그 Claude 연결이 로그아웃·변경되거나(이때 그룹을 멈춘다), 앱이 종료될 때.

**다음 send와 Stop의 동작.**
- 다음 send의 `previousExit()`는 백그라운드 작업이 있는 프로세스를 기다리지 않고 `OwnedGroup.stop()`(SIGTERM → 500ms → SIGKILL)으로 끝낸 뒤 그룹 소멸을 기다린다. 그러지 않으면 `EXIT_WAIT_MS` 10초 뒤 busy로 거부된다(POSTMORTEM 2026-10-28). 빌드·개발 서버는 SIGTERM에 정리할 기회가 있어야 하므로 즉시 SIGKILL은 쓰지 않는다.
- Stop은 같은 정리를 하고, 턴 이벤트는 쓰지 않는다(이미 done으로 끝난 턴이다).

**작업이 끝난 뒤 CLI가 여는 턴(사용자 결정).** PoC에서 CLI가 작업 종료 뒤 스스로 모델을 부르면, 그 일은 Doan의 턴 밖에서 아무도 모르게 돈다. 그래서 백그라운드 집합이 비는 순간 그룹을 멈춘다. 끝난 작업의 결과는 세션 기록에 남아 다음 턴에서 에이전트가 볼 수 있다. PoC에서 CLI가 스스로 모델을 부르지 않으면 이 정지는 넣지 않고, 그룹이 스스로 끝나기를 기다린다.

**계정 lease와 프로젝트 판정.** 그룹이 살아 있는 동안 계정 lease와 세션 예약도 남는다. 로그아웃 때 `stop_required` 확인이 이 그룹을 센다. 프로젝트 판정은 위 결함 1a대로 10초 상한까지 기다린다.

## 영향 받는 구성요소

- **앱(main)**: `conversation/runners.ts`(Claude runner의 프롬프트 uuid, 만료·종료 경로의 기록 찾기, `endSuggestion`의 즉시 정리, 백그라운드 집합 읽기와 정리), `conversation/transport.ts`(프롬프트 읽힘 규칙, 백그라운드 집합 갱신), `conversation/process.ts`(`OwnedGroup` 즉시 정리 경로), `conversation/service.ts`(판정 타이머 재설정, 판정 대기 send의 정리, 백그라운드 표시 보관과 Stop IPC), `conversation/summary.ts`(목록에 백그라운드 표시), `conversation/project.ts`(상수 `PROMOTION_SETTLE_MS`). 기록 찾기의 파싱은 `conversation/sessions.ts` 주변.
- **앱(preload·renderer)**: 스레드의 백그라운드 줄과 그 Stop(Overview와 캔버스 패널 공통), Stop IPC 호출. 결함 3에서 메시지가 스레드에 남는 결과가 기존 Send now 성공과 같은 응답이면 Send now 쪽은 바뀌는 것이 없다. tdd에서 확인한다.
- **CLI(Go)·스킬·가이드**: 없음.

## 순수 함수로 떼어낼 부분 (`/tdd` 대상)

1. `promotionDeadline({ endedAt, exitedAt?, settle, grace })` → 판정 시각. 그룹이 사라지지 않았으면 `endedAt + grace`, 사라졌으면 둘 중 이른 것.
2. transport의 프롬프트 등록과 읽힘: `promptTransport(state, uuid)`와 `normalizeClaude`의 result 규칙. 프롬프트가 읽히기 전 success result는 `awaitingRead`, 읽힌 뒤 success result는 `turn.done`, 프롬프트와 steer가 같은 프레임에서 읽히는 경우, meta 턴의 프레임이 이 턴의 이벤트로 나가는 경우. 만료 시 결과는 `endPromptWait`(failed)와 `endSteerWait`(done)로 나뉜다.
3. `readInTranscript(tail, uuids)` → 기록 tail에서 찾은 uuid 목록. 잘린 첫 줄, 깨진 줄, 다른 세션의 줄을 무시한다. 필드는 PoC로 정한다.
4. 백그라운드 집합: `backgroundTasks(state, raw)` → `background_tasks_changed`(교체)와 `task_*`(짝) 프레임으로 갱신한 집합. 프로세스가 바뀌면 빈 집합.
5. 백그라운드 줄의 문구와 표시 여부: `backgroundLine({ count, name?, ended, working })` → 문구 또는 없음. 다음 턴이 시작되었거나 대화가 working이면 없음.

## 형식 변경

없다. 이벤트 JSONL(v1), CLI 응답, `runtime.json`, 앱 소켓 메시지는 그대로다. 결함 3에서 남는 메시지는 기존 `user.message` 이벤트다. 대화 목록 IPC(`ConversationSummary`)에 메모리 전용 필드가 하나 늘고, 백그라운드 작업을 끝내는 IPC 채널이 하나 는다. 둘 다 JSON Schema 공유 형식이 아니다.

## 컨벤션 영향

없다. ARCHITECTURE §1과 `doan check` 규칙은 바뀌지 않는다.

## 결정 영향

- PRODUCT §5 item 1 'Project conversations'의 판정 시점 규칙이 바뀐다(사용자 승인 완료). 승격 결과의 규칙은 그대로다.
- PRODUCT §5 'Send now'의 "턴이 먼저 끝나면 큐로 돌아간다"에 "CLI가 받은 것이 기록에 있으면 그 턴에 남는다"가 더해진다(승인 완료).
- PRODUCT §5 대화 스레드에 백그라운드 작업 줄과 그 안의 Stop이 더해진다(결정 완료, 문구는 `/design-draft` 초안에서 확인).
- ARCHITECTURE §7 Steering의 Claude 항목, 'Project conversations and promotion', 'Next-message suggestions', 그룹 정리 규칙이 바뀐다. "no read can follow a terminal"과 "예약은 그룹 소멸 관찰로만 푼다"는 지킨다.
- ARCHITECTURE의 구조 결정(서빙 범위, sandbox iframe, 토큰, git 명령)은 건드리지 않는다.

## PoC 의존

실제 Claude CLI에서 확인되지 않은 가정이 넷 있다. tasks 1이 먼저 확인한다.

1. 결함 1: 입력이 닫히고 제안만 남은 CLI가 SIGTERM을 무시하는 이유, 즉시 SIGKILL의 종료 시간과 세션 기록 무결성, 다음 resume. 턴 마지막 파일 쓰기에서 `refreshed()`까지의 지연.
2. 결함 2: 백그라운드 작업을 남긴 세션에 보낸 턴의 원시 프레임 순서. 첫 result가 meta 턴의 것이고 클라이언트 uuid가 없는지. 첫 프롬프트 uuid가 2.1.284와 현재 버전에서 echo되는지.
3. 결함 3: steer 메시지의 클라이언트 uuid가 세션 기록에 남는지, 어떤 필드로, 언제.
4. 백그라운드 작업: 살아 있는 작업을 스트림이 어떻게 알리는지, 입력이 닫힌 뒤 CLI의 수명, 작업 종료 뒤 CLI가 스스로 턴을 여는지.

PoC는 설치된 CLI의 기존 로그인으로 돌린다. 임시 cwd와 `settingSources: []`를 쓴다(이전 Send now PoC 방식). 스크립트는 `.scratch/claude-turn-end/`에 둔다. 세션 기록이 실제 `~/.claude` 아래(임시 cwd 이름의 프로젝트 디렉터리)에 남는다. PoC는 자기가 만든 세션만 읽고 resume하며, 다른 세션을 건드리지 않는다.

## 실제 앱 확인의 로그인

PoC와 달리 실제 앱 확인(tasks 8)은 Doan Claude 연결이 필요하다. 격리 userData·HOME의 패키지 앱에서 사용자가 Doan Claude 연결에 한 번 로그인한다(사용자 결정).
