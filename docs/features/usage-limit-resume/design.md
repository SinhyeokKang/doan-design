# usage-limit-resume — design

## 영향 범위

- **앱 main**: `app/src/main/conversation/`의 transport(리셋 시각 읽기), service(한도 상태, 예약, 재예약), 대기열(`queue.ts`·`drafts.ts`), Codex runner(`account/rateLimits/read`).
- **앱 renderer**: 대기열 행의 예약 표시(`conversationStore.ts`와 docked composer의 대기열 행), 실패한 턴의 둘째 줄(`ConversationThread.tsx` `endView`), 한도 중 Send의 거절 문구(`dockedRules.ts`, `homeComposer.ts`).
- **IPC**: 대화 목록 요약(`summary.ts` `ConversationSummary`)에 예약 정보(`scheduledAt?`)를 더하거나 대기열 응답에 담는다. 정확한 자리는 `/tdd`에서 정한다. 채널은 늘리지 않는다.
- **CLI(Go), 스킬, 캔버스 규약**: 바뀌지 않는다.

## 리셋 시각의 출처

| provider | 출처 | 상태 |
|---|---|---|
| Claude Code | Agent SDK의 `rate_limit_event`(`rate_limit_info.status === "rejected"`, `resetsAt`, `rateLimitType`). 타입은 `@anthropic-ai/claude-agent-sdk` `sdk.d.ts`의 `SDKRateLimitInfo` | 한도 거절 때 실제로 오는지, `resetsAt` 단위(초인지 밀리초인지)는 PoC로 확인 |
| Codex | 한도 실패(`transport.ts`의 `rate_limited` 판정) 뒤 같은 연결에서 `account/rateLimits/read`를 읽어, 다 찬 창들 중 가장 늦은 `resetsAt`(초)을 쓴다. 읽기 형태는 Agent usage가 이미 쓴다(`agentAuth/usageParse.ts`) | 한도 상태에서 다 찬 창이 어떤 값으로 오는지 PoC로 확인 |

어느 쪽이든 리셋 시각을 얻지 못하면 한도 상태를 만들지 않는다. 실패 detail의 사람용 문구("resets 3pm")는 해석하지 않는다. 지금처럼 화면 문구에만 쓴다.

## 순수 함수로 뺄 부분 (`/tdd` 대상)

1. `claudeLimitReset(event)` — `rate_limit_event` 한 개에서 `{ resetsAt: ms } | null`. `rejected`가 아니거나 값이 이상하면 null.
2. `codexLimitReset(rateLimits, now)` — `account/rateLimits/read` 응답에서 다 찬 창들의 가장 늦은 리셋 시각(ms), 없으면 null.
3. `limitState(prev, reset, now)` — 계정별 한도 상태 갱신과 만료. 지난 시각은 버린다.
4. `sendDecision({ provider, limit, working, now })` — `"send" | "schedule" | "refuse"`. ACP provider와 새 대화 시작은 `schedule`이 되지 않는다.
5. `sendAt(resetsAt, margin)` — 실제 전송 시각.
6. `retryDecision({ previousReset, newReset, promptRead })` — `"reschedule" | "draft"`. 새 시각이 더 늦고 메시지가 읽히지 않았을 때만 재예약.
7. `scheduledRowText(at, now, timeZone)` — 행 문구와 시각 형식.
8. `endView` 확장 — 리셋 시각을 알 때의 둘째 줄.

## 셸(I/O)

- 한도 상태는 main 메모리(`ConversationService`)에 provider 계정 키로 둔다. 로그아웃과 계정 교체(`AuthStatusDto.generation`)에서 지운다.
- 예약은 대기열 항목에 메모리 전용 표시(보낼 시각)를 붙인다. `drafts.json`에는 예약 시각을 쓰지 않는다. 시작할 때 모든 대기열 항목이 초안이 되므로(ARCHITECTURE §7 'Device-local storage and limits' `drafts.json`) 재시작 뒤 저절로 나가지 않는다는 규칙이 그대로 지켜진다.
- 타이머는 대화마다 하나, 가장 이른 전송 시각에 unref된 timeout을 건다(폴링 없음, `workState.ts`의 만료 타이머와 같은 방식). `powerMonitor`의 `resume`에서 지난 예약을 바로 처리한다.
- 전송은 턴이 끝난 뒤 대기열을 보내는 기존 경로를 다시 쓴다. 그래서 project 대화의 `project_busy`, 캔버스 대화의 현재 대화 규칙, 보관된 대화의 복원 규칙이 그대로 적용된다.

## 포맷 변경

- 대화 이벤트 JSONL, `index.json`, `drafts.json`, 공유 JSON Schema는 바뀌지 않는다. 리셋 시각과 예약은 메모리에만 있다. 그래서 `v`도 바뀌지 않는다.
- `turn.failed`에 리셋 시각을 저장하지 않는 이유: 기록 읽기는 이벤트 하나라도 검사에 실패하면 전체가 실패하므로(ARCHITECTURE §7 'Device-local storage and limits'), 새 필드는 이전 Doan이 그 대화를 못 읽게 만든다.

## 규약 영향

없다. 캔버스 규약과 `doan check` 규칙은 바뀌지 않는다.

## 결정 영향

- **PRODUCT §3 Out of scope 4**: 예외 문장을 더한다. "사람이 한도 중에 보낸 메시지는 리셋 시각까지 기다렸다가 그대로 나간다. Doan은 글을 만들거나 더하지 않고, 앱이 꺼져 있으면 보내지 않는다." 사람의 메시지만 작업을 시작한다는 원칙은 유지된다.
- 서버 없음(§3 5), GitHub 토큰, git 명령과 무관하다. Codex의 `account/rateLimits/read`는 이미 Agent usage가 쓰는 Doan 연결의 읽기다.

## PoC 의존

1. Claude Code 한도 거절 때 `rate_limit_event`가 `rejected`와 `resetsAt`을 담아 턴 실패 전에 오는지, `resetsAt` 단위는 무엇인지. 평소 턴의 `allowed` 이벤트로 필드 모양과 단위는 볼 수 있지만, `rejected`는 실제로 한도에 걸린 계정에서만 볼 수 있다.
2. Codex 한도 실패 뒤 `account/rateLimits/read`가 다 찬 창과 리셋 시각을 돌려주는지.
3. 리셋 시각 정각에 보낸 요청이 받아들여지는지, 여유가 얼마나 필요한지.

두 provider 모두 한도에 걸린 실제 계정이 필요하다. PoC가 사용자의 실제 계정 상태에 기대므로 시점을 사용자와 맞춘다(확인 필요).

## POSTMORTEM에서 가져온 함정

- 2026-11-05 'A Send now row refused back into the queue could vanish while main still held it': main의 대기열 수가 줄었다가 돌아올 수 있으면(예약 행이 전송 중으로 빠졌다가 재예약으로 돌아오는 경우) 읽기 표시를 `readsStarted(root)`로 옮긴다. 재예약은 이 경로와 같은 모양이다.
- 2026-10-27 'Successful appends crossed the history reader's byte limit': `drafts.json` 읽기와 쓰기는 같은 한도를 쓴다. 예약 표시를 `drafts.json`에 쓰지 않는 이유 중 하나다.
- 2026-10-28(열린 stdin이 CLI를 살려 둔다): 예약 전송도 기존 대기열 전송 경로로 보내고, 새 프로세스 수명 규칙을 만들지 않는다.

## 디자인 프리셋

`shape`(기존 대기열 행과 실패 줄의 확장)와 `clarify`(행 문구, 실패 줄 둘째 줄)를 읽었다.
