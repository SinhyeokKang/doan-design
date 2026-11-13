# usage-limit-resume — orch

- 원본: [spec](./spec.md) · [design](./design.md) · [tasks](./tasks.md)
- 체인: [chain-261113-2](../chain-261113-2/chain.md) 링크 2. 권한은 체인 파일과 lead 브리프를 따른다.
- 시작 hash: `ec1aebfd`
- 통합 브랜치: `feat/usage-limit-resume` (lead가 `origin/develop`에서 만들었다)
- 런타임: conductor는 Claude Code다. 사용자가 이 링크에 한해 Codex 워커를 허가했다(lead 브리프). 링크 시작 때 Codex 주간 사용량은 22%였다(`window_minutes: 10080`, Orca `CODEX_HOME`의 최신 rollout).

## 결정 기록

- 범위·문구·슬롯 순서·시각 형식은 spec과 design의 '초안 리뷰에서 정한 것'에 이미 있다. 새로 물을 제품 결정은 없다(conductor 판단 — spec·design에 답이 있다).
- **IPC 공백 보완(conductor 판단)**: design.md 'IPC'에는 `scheduledAt`만 있다. 그런데 Queue 버튼·tooltip, 실패 줄의 둘째 줄은 예약이 없어도 그 연결의 한도 상태를 알아야 하고, Home·패널·Overview의 시작 거절은 대화 없이 리셋 시각을 알아야 한다. 채널을 늘리지 않고 다음으로 정한다. 근거: 기존 `ConversationSummary`와 `attachment_missing`이 이미 같은 방식(목록 필드, 오류에 붙은 필드)을 쓴다.
  - `ConversationSummary.limitResetsAt?: string`(ISO): 그 대화의 Doan 연결에 살아 있는 한도 상태의 리셋 시각. Claude Code·Codex의 Doan 소유 대화에만 있다.
  - `ConversationSummary.scheduledAt?: string`(ISO): design.md 그대로. 예약됨이면 `working`은 false, `queued`는 예약 항목 수다.
  - `rate_limited` IPC 오류는 리셋 시각을 알 때 `{ error: "rate_limited", resetsAt: <ISO> }`를 돌려준다.
  - `send`가 예약으로 끝나면 `{ scheduled: { itemId, at } }`(at은 ISO). `scheduled {conversationId}`는 예약 항목들을 기존 queue 항목과 같은 모양(글, anchors, 첨부 표시)으로 돌려준다.
- **계약 보완 2(conductor 판단, R 인계의 질문)**:
  - `scheduledAt`과 `send`의 `at`은 리셋 시각이다(보내는 시각 = 리셋 + 60초가 아니다). 상태 줄이 리셋 시각을 보이고, 그 시각이 지나면 “Sending…”으로 바뀌기 때문이다.
  - `ScheduledItem.turnId?`: 실패한 턴의 메시지를 되풀이하는 항목(들어가는 길 2)에만 둔다. renderer는 그 항목이 있는 동안 그 턴의 Edit and resend를 숨긴다. 근거: renderer는 계약만으로 자동 예약 행과 나중에 누른 Queue 행을 구별할 수 없다.
  - 12/24시간: 이 Mac에서 macOS 24시간 설정(`AppleICUForce24HourTime = 1`)인데 Electron renderer의 Intl은 h12로 풀린다(측정, `.scratch/orch/hc/`). 그래서 main이 `systemPreferences`로 읽어 `additionalArguments`로 넘기고 preload가 동기 값으로 내놓는다. 설정을 바꾸면 재시작 뒤 반영된다.
  - R이 초안에 없는 상태에 고른 문구(리셋 뒤 슬롯 “Queued — sending”, 초안과 예약 메시지가 함께 있을 때의 삭제 줄)를 받아들인다(clarify 프리셋을 읽고 고른 것).
- 구현 배치는 Claude, 독립 리뷰는 Codex로 섞는다(conductor 판단 — 사용자의 이전 지시 '주 업무는 Claude, 리뷰에 Codex를 섞는다').
- tasks 9(`/verify`와 문서 승격)는 conductor가 통합 뒤에 한다.

## 배치

| 배치 | 항목 | 파일 소유 | 선행 | 모델·effort와 이유 | 검증 게이트 | 상태 |
|---|---|---|---|---|---|---|
| M | tasks 3·4의 main 쪽(`limitResetFromUsage`, `limitState`, `sendDecision`, `turnHadActivity`, `claudeResetFromDetail`, `autoSchedule`, `sendAt`, `ipc.test.ts`, fixture), tasks 5 | `app/src/main/**`, `app/src/preload/**`와 그 테스트·fixture | 없음. 첫 커밋은 IPC 타입 모양 | Opus high — 타이머, 잠자기·깨어나기, `project_busy` 대기, identity 재확인, 첨부 재발급 등 동시성 판단이 많다 | `npm --prefix app test`, `run typecheck`, `run lint` | 대기 |
| R | tasks 3·4의 renderer 쪽(`resetTimeText`, `queueStatusLine`, `endView`, 슬롯 우선순위), tasks 6 | `app/src/renderer/**`와 그 테스트 | 없음. `conversationStore`의 `scheduled` 응답·메서드 연결은 M의 IPC 커밋 통합 뒤 새 Task | Opus medium — 화면 연결과 날짜 형식(시간대·일광 절약 시간)이지만 계약은 정해져 있다 | `npm --prefix app test`, `run typecheck`, `run lint` | 대기 |
| VM | M diff 독립 리뷰(`/code-review`, 보고만) | 없음(읽기만) | M | Codex gpt-6-astra medium — 다른 계열의 눈으로 동시성 경계를 본다 | 🔴 0 | 대기 |
| VR | R diff 독립 리뷰(`/code-review`, 보고만) | 없음(읽기만) | R | Codex gpt-6-astra medium — 같은 이유 | 🔴 0 | 대기 |
| S | tasks 7(`/design-sync`) | R과 같은 파일, `docs/DESIGN.md`, `.scratch/design-sync/` | M·R 통합 | R 워커에 새 Task(맥락 재사용) | `node .scratch/design-sync/<screen>/measure.mjs` | 대기 |
| T | tasks 8(`/runtime-test`, 보고만) | `.scratch/`만 | S | Opus medium — 가짜 Claude CLI 구성과 짧은 probe | 스크린샷·probe 결과 | 대기 |
| 9 | `/verify`, PRODUCT·ARCHITECTURE·DESIGN·BACKLOG 승격, feature 디렉터리 삭제 | 문서 | T | conductor | `node .agents/skills/verify/scripts/verify.mjs` | 대기 |

## 파일 겹침과 순서

- M은 main·preload, R은 renderer만 바꾼다. 겹치지 않으므로 병렬로 돌린다. renderer는 main의 타입을 import하므로 IPC 모양은 위 결정 기록으로 미리 고정하고, M이 첫 커밋으로 넣는다.
- R은 M의 IPC 커밋이 없는 동안 그 타입이 필요한 연결(`conversationStore`의 `scheduled` 응답과 메서드, `limitResetsAt`·`scheduledAt` 읽기)을 남겨 두고, 인계에 '미룬 항목'으로 적는다. conductor가 M의 IPC 커밋을 통합한 뒤 새 Task로 보낸다.
- S와 T는 통합 뒤에 직렬로 한다. GUI probe는 한 번에 하나다.

## tasks 매핑

- 1·2 → 완료
- 3·4 → M(main 쪽)·R(renderer 쪽)
- 5 → M
- 6 → R
- 7 → S
- 8 → T
- 9 → conductor

## 진행 기록

- M·R을 병렬로 시작했다(run `run_2f3bf8784f31`, M `ctx_09ae75aadc68` worktree `ulr-main`, R `ctx_ab72b7ab767c` worktree `ulr-renderer`, 둘 다 `launch.effective` 확인).
- M의 IPC 타입 커밋을 먼저 통합했다(`97864b00`, typecheck 통과).
- R 1부 완료(`1eae1f9b`까지 4커밋, test 416 files·11175 passed, typecheck 0, lint 80/80). 미룬 연결 작업을 2부로 보냈다(`ctx_a43548b38383`). 계약 보완 2를 M에 보냈다.
