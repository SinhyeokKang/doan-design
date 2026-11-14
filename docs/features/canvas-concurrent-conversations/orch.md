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

## 배치

| 배치 | 작업 | 파일 소유 | 선행 | 모델·effort와 이유 | 검증 | 상태 |
|---|---|---|---|---|---|---|
| PoC | 1 | `.scratch/canvas-concurrent-conversations/` | — | 컨덕터 | `node .scratch/canvas-concurrent-conversations/poc.mjs` exit 0 | 진행 |
| S | 3 | tasks.md 표의 S 행 | — | Claude Opus high — 저장 형식·저널 이전이 틀리면 사용자 대화 기록을 잃는다 | test, typecheck | 대기 |
| R | 4 | tasks.md 표의 R 행 | S | Claude Opus high — 동시 턴, 지연 콜백 울타리, handoff | test, typecheck, lint | 대기 |
| F | 5 | tasks.md 표의 F 행 | R | Claude Opus medium — 순수 함수지만 순위 규칙 판단이 많다 | test, typecheck | 대기 |
| P | 6 | tasks.md 표의 P 행 | F | Claude Opus high — `App.tsx`, 포커스, ui-state 병합 | test, typecheck, lint, build | 대기 |
| O | 7 | tasks.md 표의 O 행 | F | Claude Opus high — 프로토타입 창 초안 옮기기 함정(POSTMORTEM) | test, typecheck, lint, build | 대기 |
| C | 8 | 모든 `state` 읽기와 테스트 | P, O | Codex Sol medium — 기계적 정리 | tasks.md 8의 `rg`, test, typecheck, lint, build | 대기 |
| DS | 9 | P·O 렌더러 파일, DESIGN.md | C | Claude Opus high — 실제 앱 측정과 수정 | measure.mjs | 대기 |
| RT | 10 | `.scratch/runtime-test/` | DS | 컨덕터 | probe.mjs exit 0 | 대기 |
| 리뷰 | 12 | 보고서만 | 각 배치 | S·F·O: Codex Astra medium, R·P·C: Claude Opus high, 최종: Codex Astra medium | 🔴 0 | 대기 |
| 승격 | 13 | PRODUCT·ARCHITECTURE·DESIGN·BACKLOG, fixtures/README | RT | 컨덕터 | tasks.md 13 | 대기 |
| verify | 14 | — | 승격 | 컨덕터 | verify.mjs PASS | 대기 |

- 겹침: P와 O는 파일이 겹치지 않아 병렬이다. 나머지는 직렬이다. C는 P·O가 끝난 뒤 모든 테스트 파일을 만진다.
- tasks.md의 체크 항목 1–14는 위 행 하나씩에 대응한다(2는 끝났고, 11은 결정 기록).

## PoC

- 로그인: 리드가 만든 공유 프로필을 쓴다. Cursor·Antigravity·Copilot 토큰은 앱 금고(`safeStorage`)에 있다.

## 진행 기록
