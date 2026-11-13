# usage-limit-resume — design

## 영향 범위

- **앱 main** (`app/src/main/conversation/`, `app/src/main/agentAuth/`)
  - 한도 실패 뒤 사용량 읽기: `runners.ts`의 `usageAtTurnEnd`는 지금 `turn.done`에서만 불린다. 한도 실패(`rate_limited`)에도 부르도록 넓히고, 결과를 `usageService.ts`의 연결별 사용량에서 받는다.
  - 한도 상태와 예약 상태: `service.ts`.
  - 예약 항목: `drafts.ts`(`DraftStore`)의 대기열 항목을 쓰고, 보낼 시각은 메모리에만 둔다.
  - 타이머와 잠자기: `service.ts`에 시계·타이머 seam, Electron `powerMonitor`(main에서 처음 쓴다).
  - IPC: `ipc.ts`의 `send` 응답, 새 메서드 `scheduled`(아래 'IPC').
- **앱 renderer**
  - 대기열 행과 상태 줄: `conversationStore.ts`, docked composer의 대기열 부분.
  - Queue 버튼: `dockedRules.ts`.
  - 실패 줄: `ConversationThread.tsx`의 `endView`.
  - 사이드바 슬롯: `homeRun.ts`의 `slots()`.
  - Home 거절 문구: `homeComposer.ts`.
  - 삭제 확인창: `ConversationDeleteDialog.tsx`.
- **CLI(Go), 스킬, 캔버스 규약**: 바뀌지 않는다.

## 리셋 시각의 출처

- Agent usage(`agentAuth/usageService.ts`, `usageRead.ts`, `usageParse.ts`)가 이미 Doan 연결마다 창별 `usedPercent`, `resetsAt`(ms), `limited`를 읽는다. PRODUCT §5 item 0 'Agent usage'의 "Limit reached · resets in"이 이것이다. 새로 파싱하지 않는다.
- 한도 상태의 리셋 시각은 그 연결에서 `limited`인 창들의 `resetsAt` 중 가장 늦은 값이다. Codex는 `usageParse.ts`의 `limited` 규칙(`rateLimitReachedType`)을, Claude는 그 파서의 창 규칙을 그대로 쓴다.
- Claude transport의 `rate_limit_event`(`SDKRateLimitInfo`)는 지금 쓰지 않고 지나친다. 이 기능에서도 그대로 둔다. 참고로 `resetsAt`은 초 단위다(`app/src/main/conversation/fixtures/claude-frames-2.1.322-next-turn-after-stop.jsonl`의 `"resetsAt":1794978000`).
- 보조 출처(Claude Code만): 사용량에서 리셋 시각을 얻지 못하면 실패 detail의 “You've hit your <window> limit · resets <when> (<IANA 시간대>)”에서 시각과 시간대를 읽는다. 과거 로그의 형태는 “resets 10:10pm (Asia/Seoul)”, “resets Oct 17 at 1pm (Asia/Seoul)”이다. 읽을 수 없으면 리셋 시각이 없는 것으로 본다. Codex 실패 문구는 해석하지 않는다.

## 상태 모델

- **한도 상태** `Map<connectionId, resetsAt>`: 메모리 전용. 키는 Doan 연결의 `connectionId`다. `connectionChanged(provider, connectionId)`(service.ts, suggestion 정리에 쓰는 것)와 로그아웃에서 지운다. 리셋 시각이 지나면 지운다.
- **예약됨**: 대화 하나에 대해 "일하는 중이 아니고, root를 잡지 않으며, 대기열 항목이 있고, 보낼 시각이 있다"인 상태다.
  - 지금 대기열은 일하는 중에만 있다(`queue()`가 일하지 않으면 `not_running`). `holding`을 쓰면 `working()`이 true가 되어 Send가 busy로 거절되고, 프로젝트 대화는 리셋 때까지 root를 잡는다(`project_busy`). 그래서 예약됨은 working과 holding 어느 쪽도 쓰지 않는 별도 상태다.
  - 대화의 예약은 함께 나가므로 보낼 시각은 하나다(`scheduledAt`).
  - `ended`/`flush`/`stopRuns`와의 관계: 예약된 대화에는 live 실행이 없으므로 `stopRuns`는 건드리지 않는다. 예약 시각의 전송은 `flush`가 쓰는 전송 경로를 다시 쓴다.
- **들어가는 길**
  1. 한도 상태가 있는 동안의 Send: main은 메시지를 받아들이지 않고(기록에 쓰지 않고, 첨부를 소비하지 않고) 대기열 항목으로 둔다. 첨부는 대기열 항목처럼 예약해 둔다.
  2. 활동 없는 한도 실패: 턴이 `rate_limited`로 끝났고 그 턴에 에이전트 활동이 없었으며(`turnHadActivity`가 false) 리셋 시각을 얻으면, 그 턴의 메시지를 새 대기열 항목으로 만든다. 이 메시지는 이미 받아들여져 기록에 쓰였고 첨부도 소비됐다. 그래서 글과 칩은 기록에서, 첨부는 Edit and resend처럼 경로로 다시 발급(`attachments:fromPaths`와 같은 재발급)해서 만든다. 다시 발급할 수 없는 첨부가 있으면 예약하지 않고 평소 실패로 둔다.
  3. 한도로 실패한 턴에 이미 대기열이 있었으면, 그 대기열은 초안으로 돌리지 않고 같은 시각의 예약이 된다.
- **나가는 길**: 시각이 되면 보낸다. 같은 root의 프로젝트 대화가 일하는 중이면(`project_busy`) 그 root의 턴이 끝날 때 다시 시도한다. 제거, 보관, 로그아웃은 예약을 즉시 정리한다(제거는 버리고, 보관과 로그아웃은 초안으로). 삭제는 기존 삭제가 초안과 대기열을 버리는 것과 같이 버린다.
- **재시작**: `drafts.json`의 대기열 항목은 시작할 때 모두 초안이 된다(ARCHITECTURE §7 'Device-local storage and limits'). 보낼 시각은 저장하지 않으므로 재시작 뒤 저절로 나가지 않는다.

## IPC

- `ConversationSummary`에 `scheduledAt?: string`(ISO)을 더한다. 대화 목록이 이미 쓰는 자리라 사이드바 슬롯, 실패 줄, 상태 줄이 같은 값을 읽는다. `working`은 false이고 `queued`는 예약 항목 수다.
- `send`가 예약으로 끝나면 `{ scheduled: { itemId, at } }`를 돌려준다. renderer는 지금 queue 응답으로 행을 만드는 것처럼 이 응답으로 행을 만든다(`conversationStore.ts`).
- main이 스스로 만든 예약(들어가는 길 2, 3)은 renderer가 내용을 모른다. 그래서 `conversation` 메서드에 `scheduled {conversationId}`를 더한다. 이 메서드는 예약 항목들(글, 칩, 첨부 표시)을 돌려준다. renderer는 목록의 `scheduledAt`이 생기거나 바뀌면 이것을 읽는다. 채널은 늘리지 않는다.
- 예약된 Send에 picker 변경(model, effort, fast, mode)이 실려 오면 지금의 queue와 같이 거절한다. composer의 picker 변경은 다음 보내기에 적용되는 기존 규칙을 따른다.

## 순수 함수로 뺄 부분 (`/tdd` 대상)

1. `limitResetFromUsage(windows, now)` — 한 연결의 사용량 창에서 `limited` 창들의 가장 늦은 `resetsAt`(ms). 없거나 이미 지났으면 null.
2. `limitState(prev, connectionId, reset, now)` — 연결별 상태 갱신과 만료.
3. `sendDecision({ provider, owner, limit, working, scheduled, now })` — `"send" | "queue" | "schedule" | "refuse"`. ACP provider, legacy external, 새 대화 시작은 `schedule`이 되지 않는다. 일하는 중이면 지금처럼 `queue`다.
4. `turnHadActivity(events)` — 한 턴의 이벤트에 에이전트의 답 글이나 도구 단계가 있었는지. 정확한 기준은 PoC가 정한다.
5. `autoSchedule({ code, hadActivity, reset, previousReset, retriedSame, now })` — `"schedule" | "retry" | "none"`. `rate_limited`이고 활동이 없고 리셋 시각을 알 때: 처음이면 schedule, 재예약이면 이전보다 늦을 때 schedule, 같으면 아직 같은 시각으로 다시 시도하지 않았을 때만 retry(60초 뒤), 그 밖에는 none.
5a. `claudeResetFromDetail(detail, now)` — 보조 출처의 시각과 시간대를 ms로. 날짜가 없으면 now 이후 가장 가까운 그 시각이다. 읽을 수 없으면 null.
6. `sendAt(resetsAt)` — 리셋 시각 + 60초.
7. `resetTimeText(at, now, { timeZone, hour12 })` — 오늘·tomorrow·요일·날짜 형식. 자정 경계, 시간대 변경, 일광 절약 시간 전환을 다룬다.
8. `queueStatusLine(scheduledAt, now)` — “Sends when the limit resets at …” 또는 “Sending…”.
9. `endView` 확장 — 마지막 턴이고 한도 상태가 살아 있을 때의 둘째 줄. detail의 "resets <when>"과 한도 상태가 둘 다 있으면 한도 상태의 시각을 쓴다.
10. 슬롯 우선순위 확장(`homeRun.ts`의 슬롯 판정 함수) — '예약됨'의 자리.

## 셸(I/O)

- 타이머는 대화마다 하나, 그 대화의 보낼 시각에 unref된 timeout을 건다(폴링 없음, `workState.ts`의 만료 타이머와 같은 방식). 타이머가 울리면 그 대화와 예약 항목이 아직 같은지 다시 확인한 뒤 보낸다.
- `powerMonitor`의 `resume`에서 모든 타이머를 벽시계 기준으로 다시 계산하고, 지난 예약은 바로 보낸다. 잠든 동안 타이머 시계가 멈추기 때문이다.
- 테스트를 위해 `ConversationService`에 시계(`now`)와 타이머(`setTimer`/`clearTimer`), resume 구독을 주입할 seam을 둔다.
- 한도 실패 뒤의 사용량 읽기는 Agent usage의 읽기 lease 규칙을 따른다. 읽기가 실패하면 리셋 시각이 없는 것으로 보고 평소 실패로 둔다.

## 포맷 변경

- 대화 이벤트 JSONL, `index.json`, `drafts.json`, 공유 JSON Schema는 바뀌지 않는다. 한도 상태와 보낼 시각은 메모리에만 있다. 그래서 `v`도 바뀌지 않는다.
- 리셋 시각을 `turn.failed`에 저장하지 않는다. 기록 읽기는 이벤트 하나라도 검사에 실패하면 전체가 실패하므로(ARCHITECTURE §7 'Device-local storage and limits'), 새 필드는 이전 Doan이 그 대화를 못 읽게 만든다. transport가 리셋 정보를 다룬다면 `EventPayload`로 내보내지 말고 `suggested`나 `stage`처럼 기록에 남지 않는 콜백으로 service에 넘긴다.

## 규약 영향

없다. 캔버스 규약과 `doan check` 규칙은 바뀌지 않는다.

## 결정 영향

- **PRODUCT §3 Out of scope 4**: 예외 문장을 더한다. 초안: "A message the person sent while their Doan connection's usage limit is in force, or one whose turn the limit stopped before the agent did anything, waits and goes out when the limit resets; a turn the limit stops the same way again waits for a later reset. Doan writes nothing of its own and sends nothing while it is not running."
- **PRODUCT In scope 6**의 "the one exception to Out of scope 4"와 **§4 Loop 4**의 "apart from a handoff"가 둘째 예외를 반영하도록 고친다.
- **PRODUCT §5 item 1**의 대기열 규칙("after a failed … turn, the queue comes back as the draft")에 한도 실패의 예외를 더한다.
- 서버 없음(§3 5), GitHub 토큰, git 명령과 무관하다. 사용량 읽기는 Agent usage가 이미 쓰는 Doan 연결의 읽기다.

## PoC 결과 (로그 기반, 2026-11-13)

한도에 걸린 계정이 없어서, 이 Mac의 과거 로그를 읽기만 해서 확인했다(사용자 결정).

1. **Claude Code 거절 형태**: `~/.claude/projects/` transcript에 실제 한도 거절 2건이 있다(Claude Code 2.1.319). 사람 메시지 바로 뒤에 합성 assistant 메시지(`isApiErrorMessage: true`, model `<synthetic>`)로 “You've hit your 5-hour limit · resets 10:10pm (Asia/Seoul)”이 오고, 그 사이 에이전트 활동은 0회다. 다른 transcript의 문구로는 “You've hit your weekly limit · resets Oct 17 at 1pm (Asia/Seoul)”도 있다. 그래서 '활동 없는 한도 실패'가 흔한 경우이고, `turnHadActivity`는 그 턴에 답 글이나 도구 단계 이벤트가 있었는지로 판정한다.
2. **Codex 한도 형태**: `~/.codex/sessions` 기록에 `rate_limits.primary.used_percent: 100.0`, `resets_at`(초), `window_minutes: 43200`인 스냅샷이 있다. Agent usage의 Codex 파서가 읽는 필드와 같다.
3. **확인하지 못한 것**: 한도 직후 Agent usage 읽기가 `limited`를 돌려주는지, 리셋 정각에 보낸 요청이 받아들여지는지. 그래서 보조 출처(Claude 실패 문구), 60초 여유, 같은 시각으로 막히면 한 번 다시 시도하는 규칙으로 버틴다. 실제 한도에서의 확인은 승격 때 BACKLOG 'Not verified in the real app'에 남긴다.

fixture는 이 로그에서 필요한 줄만 골라 대화 내용을 지우고 `app/src/main/conversation/fixtures/`에 둔다(`/tdd`에서).

## POSTMORTEM에서 가져온 함정

- 2026-11-05 'A Send now row refused back into the queue could vanish while main still held it': main의 대기열 수가 줄었다가 돌아오는 경우(예약 전송 → 재예약)에 읽기 표시를 `readsStarted(root)`로 옮긴다. 테스트로 고정한다.
- 2026-10-27 'Successful appends crossed the history reader's byte limit': `drafts.json`의 읽기와 쓰기는 같은 한도를 쓴다. 보낼 시각을 `drafts.json`에 쓰지 않는 이유 중 하나다.
- 2026-10-28 'A send right after turn.done was refused as busy until the previous process group was gone': 예약 전송도 기존 전송 경로를 쓰고 새 프로세스 수명 규칙을 만들지 않는다.
- 2026-10-27 'Awaited conversation work outlived its current turn': 타이머가 울리거나 사용량 읽기가 돌아왔을 때 대화와 예약의 identity를 다시 확인한다.
- 2026-11-06 'The Codex model list stayed the previous account's after an account replacement': 한도 상태는 `connectionId`를 키로 두고 계정 교체에서 지운다.
- 2026-10-30 'Timing tests failed under machine load because their waits matched or beat the test limit': 시간이 드는 테스트는 가짜 시계로 쓰고 실제 대기를 두지 않는다.

## 디자인 프리셋

`shape`(기존 대기열 행과 실패 줄의 확장)와 `clarify`(상태 줄, 실패 줄, 거절 문구, Queue 버튼 설명)를 읽었다.

## 초안 요청

- 파일: `.doan/canvases/usage-limit-resume.html`, 캔버스 id `usage-limit-resume`, 폭 1760. docked composer, 대기열 행, thread의 실패 줄, 사이드바, 삭제 확인창, Home composer는 지금 코드와 DESIGN.md대로 복사하고 새 부분만 그린다.
- 프레임(id — 내용):
  - `queue-button` — 한도 상태의 docked composer. Send 자리의 Queue 버튼과 리셋 시각을 담은 tooltip.
  - `scheduled-rows` — 예약 행 두 개와 그 아래 상태 줄 “Sends when the limit resets at …”. 시각 형식 네 가지(오늘, tomorrow, 요일, 날짜)를 타일로.
  - `sending` — 리셋 시각이 지났지만 아직 보내지 않은 상태 줄 “Sending…”.
  - `failed-line` — 마지막 턴이 한도로 끝난 thread와 새 둘째 줄 “Resets at <시각>. Messages you send now go out then.”. 비교용으로 리셋 시각을 모를 때의 지금 문구 타일.
  - `auto-scheduled` — 에이전트 활동 없이 한도로 실패한 턴이 thread에 남고, 같은 메시지가 예약 행으로 들어간 상태.
  - `rescheduled` — 리셋 때 보낸 턴이 다시 막혀 새 시각으로 예약된 상태.
  - `sidebar-slot` — 사이드바 슬롯의 예약 상태.
  - `delete-dialog` — 예약 메시지가 버려진다는 줄이 더해진 삭제 확인창.
  - `home-refusal` — 리셋 시각이 들어간 Home 시작 거절 문구.
- `/design-sync`가 비교할 프레임: `queue-button`, `scheduled-rows`, `failed-line`, `sidebar-slot`, `delete-dialog`.
- 초안 리뷰에서 정한 것(사용자 결정, 2026-11-13):
  - 예약 상태는 사이드바 슬롯(Home 대화만)과 함께 대화 메뉴의 `StatusMark`(Overview 드롭다운, Canvas conversations 목록)에도 시계 아이콘(`--text-subtle`)으로 보인다.
  - 리셋이 지났지만 예약이 아직 나가지 않은 동안(“Sending…”)에도 버튼은 Queue로 남고, 새 메시지는 예약 행 뒤에 붙는다. 이때 tooltip은 출시 그대로 "Queue"다.
  - 누르기 전 단서는 Queue tooltip뿐이다. 한도 상태가 생기면 이전 거절 줄을 지운다.
  - 패널과 Overview의 New conversation 시작 거절에도 리셋 시각을 넣는다.
  - 자동 예약된 실패 턴의 Edit and resend는 예약된 동안 숨기고, 행을 제거하면 다시 보인다.
  - 시각 문구는 “resets at 3:00 PM” / “resets tomorrow at 3:00 PM” / “resets Thursday at 3:00 PM” / “resets Nov 20 at 3:00 PM”이고, 시각과 AM/PM은 U+202F로 묶는다.
  - 슬롯 우선순위는 권한·질문, 문제, 일하는 중, 터미널 작업, 예약됨, 아직 보지 않은 끝 순이다. '예약됨'은 Show sidebar 배지에 세지 않고, 누르면 그 대화를 연다.
  - 상태 줄의 live region은 빈 컨테이너로 항상 있고 내용만 바뀐다. DESIGN.md 'Queued messages'의 "No caption sits under the list" 규칙이 이 기능으로 바뀐다.
- 초안 `.doan/canvases/usage-limit-resume.html`은 사용자가 앱에서 확인했다(2026-11-13, `ead60218`).
