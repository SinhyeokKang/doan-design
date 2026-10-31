# buzz-conversation — orch

원본: [spec](./spec.md), [design](./design.md), [tasks](./tasks.md). 이 문서는 배치 나누기, 결정, 진행 상태만 적는다.

- 시작 해시: `53221762` (main)
- 통합 브랜치: `feat-buzz-conversation`
- 지휘자: Claude Code (Opus 5.5), 체크아웃 `/Users/sinhyeok/code/doan-design`

## 결정 기록

1. 모델 경계: 이 세션에서 Codex 워커를 써도 된다(사용자, "Codex 워커 사용 가능"). 구현은 Claude가 맡고, Codex는 PoC 한 배치와 독립 리뷰 일부에 쓴다(지휘자 판단 — 메모리의 이전 지휘 방식).
2. P1과 D2는 격리 HOME의 dev 앱에서 Claude Code와 Codex 둘 다 로그인한다(사용자). 로그인 승인은 지휘자가 ego-browser로 직접 한다(사용자). 워커는 로그인 URL이나 창이 뜨면 `ask`로 지휘자에게 알리고 기다린다.
3. tasks.md 체크 표시는 지휘자가 통합할 때 고친다. 워커는 tasks.md를 고치지 않는다. 예외: P1 워커는 P1 절에 관찰 결과를 적는다(지휘자 판단 — 병렬 배치가 같은 파일을 고치지 않게 하려고).
4. GUI probe(P1의 dev 앱, B1의 Home 기준선, D2)는 겹치지 않게 지휘자가 순서를 정한다. 워커는 앱을 띄우기 전에 `ask`로 허락을 받는다(지휘자 판단 — orchestrate §4 GUI probe 조정).
5. B1의 링크 클릭은 주입받은 콜백으로 그린다. preload의 `openLink` 연결은 A1 통합 뒤 B2가 한다(지휘자 판단 — preload는 A1 소유).
6. B2의 대기열 연결(Queue 버튼, 대기 줄, 실패 시 초안 복원)은 A2 통합 뒤에 보내는 후속 작업이다. B2는 나머지를 먼저 끝내고 이 항목을 미룬 항목으로 넘긴다(지휘자 판단 — orchestrate §0.4).
7. Z1·Z2(문서 승격과 디렉터리 삭제)는 지휘자가 한다(orchestrate §5).

## 배치

| 배치 | 항목 | 파일 소유 | 선행 | 모델·effort와 이유 | 검증 게이트 | 상태 |
|---|---|---|---|---|---|---|
| P | P1 | `.scratch/`, tasks.md P1 절 | 없음 | Codex Sol medium — 정해진 절차를 따르는 관찰이고 판단이 적다 | 공급자별 관찰을 tasks.md에 기록, 원시 jsonl을 `.scratch/`에 보관 | 대기 |
| A1 | T1, T2, T3, T4, M1, M2, M3, M7, M8 | `app/src/main/**`, `app/src/preload/**` | 없음 | Opus high — 저널 형식·crash 복구·IPC 검증이 틀리면 기록이 깨진다 | `npm --prefix app test`, `npm --prefix app run typecheck`, `verify.mjs` | 대기 |
| B1 | T5, R1, R3 | `app/src/renderer/**`, `app/package.json`, `app/package-lock.json`, `docs/DESIGN.md` | 없음 | Opus high — Home 회귀 없는 분해와 Markdown 안전 규칙 | 같음 + R1 기준선 probe(`.scratch/`) | 대기 |
| RA1 | A1 리뷰 | 보고만 | A1 | Codex Astra medium — 다른 계열의 판단 리뷰 | `/code-review` 보고 | 대기 |
| RB1 | B1 리뷰 | 보고만 | B1 | Opus high — 포커스·IME·보안 렌더링 판단 | `/code-review` 보고 | 대기 |
| A2 | M4, M5, M6 | `app/src/main/**`, `app/src/preload/**` | A1 통합 | Opus high — 승격·복구·대기열의 동시성과 저널 커밋 | A1과 같음 | 대기 |
| B2 | R2, R4 (+ 대기열 연결은 A2 뒤) | `app/src/renderer/**` | A1·B1 통합 | Opus high — 렌더 사이 경쟁(POSTMORTEM 2026-10-25)과 거절 이유 줄 | `npm --prefix app test`, typecheck, `verify.mjs` | 대기 |
| RA2 | A2 리뷰 | 보고만 | A2 | Codex Astra medium — 다른 계열의 동시성 리뷰 | `/code-review` 보고 | 대기 |
| RB2 | B2 리뷰 | 보고만 | B2 | Opus high — 상태 복원과 포커스 규칙 | `/code-review` 보고 | 대기 |
| D | D2 | `.scratch/`, 수정이 필요하면 `app/src/renderer/**`, `docs/DESIGN.md` | 모든 구현 배치 통합 | Opus medium — 정해진 측정 절차, 판단은 design-sync 리뷰가 받친다 | `verify.mjs` 통과 뒤 `/design-sync`(Home 보드)와 `/runtime-test` probe | 대기 |
| Z | Z1, Z2 | `docs/PRODUCT.md`, `docs/ARCHITECTURE.md`, `docs/DESIGN.md`, `docs/features/buzz-restyle/tasks.md`, 이 디렉터리 | D | 지휘자 | Z1 grep 결과 없음, `verify.mjs` 통과 | 대기 |

이미 끝난 항목: D1(초안, 2026-10-31 사용자 확정).

## 겹침과 순서

- 1차(병렬): P, A1, B1. A1은 main·preload만, B1은 renderer·의존성·DESIGN.md만 고친다. P는 앱 코드를 고치지 않는다.
- 2차: RA1, RB1 → 수정 라운드 → A1, B1, P 통합.
- 3차(병렬): A2(main), B2(renderer). 같은 파일이 없다.
- 4차: RA2, RB2 → 수정 라운드 → 통합 → B2에 대기열 연결 후속 작업 → 다시 리뷰.
- 5차: D → Z → push와 PR.

## 진행 기록
