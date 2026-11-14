# canvas-concurrent-conversations — orch

- 계획: [spec.md](./spec.md) · [design.md](./design.md) · [tasks.md](./tasks.md)
- 체인: [chain-261114-2](../chain-261114-2/chain.md) 링크 1. 시작 점검 1–4는 사용자가 승인했다(체인 '인계 기록').
- 시작 해시: `eda6f2793`(origin/develop와 같다)
- 통합 브랜치: `feat/canvas-concurrent-conversations`(리드가 만들었다). 워커는 `--worktree new-child --base-branch feat/canvas-concurrent-conversations`로 띄운다.
- 컨덕터: Claude Code(Opus). 리드 터미널 `term_806f6340-eb01-4eb6-8c23-1f6fbf6d09a4`.

## 모델 경계

- 사용자가 2026-11-14 이 링크에 Codex 워커를 허가했다(체인 '상시 권한').
- 2026-11-14 시작 때 Codex 주간 사용량(`window_minutes: 10080`)은 43% 사용이다.
- Codex를 쓰는 범위: 배치마다 하나 걸러 독립 리뷰(Astra medium), 기계적인 배치 C(Sol medium), 작업 12의 최종 리뷰(Astra medium). 구현 배치 S·R·F·P·O와 `/design-sync`는 Claude다.

## 결정 기록

- 작업 2(`/design-draft`)는 끝났다 — 컨덕터 판단: 체인 파일과 design.md '초안 확인'에 독립 리뷰와 사용자 확인(`739280338`)이 있다.
- 작업 11(로그인 정리) — 컨덕터 판단: 체인 '로그인'과 리드 브리프에 따라 공유 프로필(`/Users/sinhyeok/code/doan-design/.scratch/provider-profile/userData`)의 로그아웃과 삭제는 마지막 링크 병합 전에 리드가 한다. 컨덕터는 로그아웃하지 않는다. 이 링크가 따로 만든 로그인 상태(있으면)만 지우고, 그때 시작 점검 1의 확인 방법(`security find-generic-password`)을 쓴다.
- 배치 S를 PoC와 병렬로 시작한다 — 컨덕터 판단: 보관 제거와 색인 v3는 상위 공통 결정 1·8이라 PoC 결과와 상관없이 필요하다. PoC가 실패해 범위가 바뀌면 R부터 다시 본다.
- `/agent-eval`은 하지 않는다(spec 정한 점 16).
- PoC 로그인 — 컨덕터 판단: 리드의 공유 프로필을 앱 밖에서 썼다. 금고 토큰은 dev 앱과 같은 Electron 바이너리의 `safeStorage`로 풀고 다시 봉인했다(design.md 'PoC 관찰'). 새 로그인은 만들지 않았다.
- 워커 S 질문(2026-11-14) — 컨덕터 판단: (1) S 동안 `state` 타입은 `"current" | "archived"` 유니언으로 두고 C가 좁힌다. `restoreEntries`와 저널의 restore 갈래는 R이 호출을 없앤 뒤 지운다. (2) S 구현 커밋 뒤 보관·복원을 고정한 service 쪽 테스트만 빨강인 것을 받아들인다. S와 R을 함께 통합하고 R의 HEAD에서 검증한다. (3) 이전한 v2 보관 대화는 `seenSeq`를 마지막 턴 seq로 맞추는 대신 `seenSeq`를 뺀다. `seenSeq`가 없으면 모두 본 것으로 치는 기존 규칙(`store.ts:18`, `markSeen`)이 같은 결과를 내고, 색인을 읽을 때 기록을 읽지 않아도 된다.

## 배치

| 배치 | 작업 | 파일 소유 | 선행 | 모델·effort와 이유 | 검증 | 상태 |
|---|---|---|---|---|---|---|
| PoC | 1 | `.scratch/canvas-concurrent-conversations/` | — | 컨덕터 | `node .scratch/canvas-concurrent-conversations/poc.mjs` exit 0 | 통과(design.md 'PoC 관찰') |
| S | 3 | tasks.md 표의 S 행 | — | Claude Opus high — 저장 형식·저널 이전이 틀리면 사용자 대화 기록을 잃는다 | test, typecheck | 통합 `0ed2e701d`·`63988c595`·`fccfce338`, 리뷰 🔴0 🟡0, 워크트리 정리 |
| R | 4 | tasks.md 표의 R 행 | S | Claude Opus high — 동시 턴, 지연 콜백 울타리, handoff | test, typecheck, lint | 통합 `21455c8b0`·`7ddaf91ce`, 리뷰 중 |
| F | 5 | tasks.md 표의 F 행 | R | Claude Opus medium — 순수 함수지만 순위 규칙 판단이 많다 | test, typecheck | 통합 `c895927dc`·`dd7296ec8`, 고침 `cdfdba433`·`83a3c87a0`(리뷰 🟡3 해소, 컨덕터가 diff 확인), 워크트리 정리 |
| P | 6 | tasks.md 표의 P 행 | F | Claude Opus high — `App.tsx`, 포커스, ui-state 병합 | test, typecheck, lint, build | 진행(`ctx_5834c9faff5f`, `ccc-batch-p`) |
| O | 7 | tasks.md 표의 O 행 | F | Claude Opus high — 프로토타입 창 초안 옮기기 함정(POSTMORTEM) | test, typecheck, lint, build | 진행(`ctx_2cb661736ee3`, `ccc-batch-o`) |
| C | 8 | 모든 `state` 읽기와 테스트 | P, O | Codex Sol medium — 기계적 정리 | tasks.md 8의 `rg`, test, typecheck, lint, build | 대기 |
| DS | 9 | P·O 렌더러 파일, DESIGN.md | C | Claude Opus high — 실제 앱 측정과 수정 | measure.mjs | 대기 |
| RT | 10 | `.scratch/runtime-test/` | DS | 컨덕터 | probe.mjs exit 0 | 대기 |
| 리뷰 | 12 | 보고서만 | 각 배치 | S·F·O: Codex Astra medium, R·P·C: Claude Opus high, 최종: Codex Astra medium | 🔴 0 | 대기 |
| 승격 | 13 | PRODUCT·ARCHITECTURE·DESIGN·BACKLOG, fixtures/README | RT | 컨덕터 | tasks.md 13 | 대기 |
| verify | 14 | — | 승격 | 컨덕터 | verify.mjs PASS | 대기 |

- 겹침: P와 O는 파일이 겹치지 않아 병렬이다. 나머지는 직렬이다. C는 P·O가 끝난 뒤 모든 테스트 파일을 만진다.
- tasks.md의 체크 항목 1–14는 위 행 하나씩에 대응한다(2는 끝났고, 11은 결정 기록).

## PoC

- 2026-11-14 다섯 프로바이더 통과. 관찰은 design.md 'PoC 관찰'.

## 진행 기록

- S 리뷰: Codex gpt-6-astra medium(`ctx_77675bb2cb0f`, `ccc-review-s`).
- R 리뷰: Claude Opus high(`ctx_90c3e649f0a6`, `ccc-review-r`). R 통합 HEAD `7ddaf91ce`에서 `/verify`.
- 워커 R 질문 — 컨덕터 판단: spec 정한 점 12의 프로토타입 창 Delete를 위해 R이 프로토타입 역할에 삭제(그 창이 띄운 캔버스의 대화만)를 열고 `preload/prototype.ts`에 `deleteConversation`을 더한다.
- R이 `summary.ts`(S 파일)에 `startedBy?: "handoff" | "promotion"`을 더했다(브리프가 허용).
- 워커 F 질문 — 컨덕터 판단: F가 P 파일 `CanvasConversationPanel.tsx`·`canvasRun.ts`에서 보관·복원 갈래만 지운다(P는 F 뒤에 돌아 겹치지 않는다).
- R 리뷰 🔴0 🟡0 ⚪4. 리뷰어의 사용자 결정 후보(세션 하나는 대화 하나를 main도 강제할지) — 컨덕터 판단: spec 정한 점 11이 이미 정한 규칙이라, main도 기존 `session_in_use` 거부로 막는다(새 코드·문구 없음). R에 후속 작업으로 보냈다. ⚪1(`homeConversations.ts:97`의 `forCanvas` 주석)은 O에, ⚪3·⚪4는 그대로 둔다.
- R 통합 HEAD `7ddaf91ce`의 `/verify`: verify-tests·runtime-support·go test·go vet·typecheck·lint 통과, app-test에서 `cli.test.ts` "Include in Git, then Keep out of Git…"와 `shell.test.ts` "setting up the same folder again…"가 부하 중 시간 초과로 실패(F·R 워커 테스트와 겹침, load 14). 두 파일만 다시 돌리면 116 통과. build는 돌지 않았다. 마지막 `/verify`에서 다시 본다.
- F 리뷰: Codex gpt-6-astra medium(`ctx_bc872a6e22ed`, `ccc-review-f`).
- 컨덕터 판단: spec 정한 점 11의 이어받기 제안 숨기기는 대화 요약에 세션 ID가 없어 렌더러가 판단할 수 없다. R 후속으로 main의 `resumeTarget`이 그 세션을 쥔 삭제되지 않은 대화가 있으면 기록이 없을 때와 같은 답을 하게 했다. P는 렌더러를 고치지 않는다.
- F가 P 파일(`CanvasConversationPanel.tsx`, `canvasRun.ts`, P 테스트 9건)에서 보관·복원 갈래만 지웠다(컨덕터 허가).
- F 리뷰 🟡3: 대기 순서를 마지막 활동 시각으로 잼, 순위가 바뀌어도 이전 대상을 유지함, 기록을 못 읽은 handoff 대화를 따라감. F 고침 1회차에서 `summary.ts`에 `waitingSince`를 더한다(컨덕터 허가).
- 워커 O 질문 — 컨덕터 판단: (1) 프로토타입 창의 대화 고르기 덮어쓰기를 지우고 창마다 자기 `CanvasRun`이 고르고 따라간다. P의 `canvasRun` 테스트가 두 창 모두를 고정한다. (2) 프로토타입 창의 `remembered`는 R이 읽기 전용 preload 호출 `rememberedConversation()`을 더한 뒤 O 후속 작업으로 잇는다.
- S가 범위 밖 `io.test.ts`의 테스트 하나("recovers an interrupted replacement rollback…")를 고쳤다. 컨덕터가 허가했다.
