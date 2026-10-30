# buzz-search — orch

계획 출처: [spec.md](./spec.md) · [design.md](./design.md) · [tasks.md](./tasks.md). 이 문서는 배치 분할·결정·상태만 적는다.

- 시작 해시: `85de4469` (2026-10-30, origin/main `1a7205e5`보다 25커밋 앞섬, 뒤처짐 0)
- 통합 브랜치: `feat-buzz-search`
- 지휘자 체크아웃: `/Users/sinhyeok/code/doan-design`

## 결정 기록

| 날짜 | 결정 | 출처 |
|---|---|---|
| 2026-10-30 | 브랜치 예외: main에서 새로 만들지 않고 feature 문서와 확정 초안이 든 기존 `feat-buzz-search`를 이어 쓴다 | 사용자 ("feat 브랜치는 준비됐고 체크아웃도 되어있으니 바로 시작") |
| 2026-10-30 | tasks의 진행 경로 `/ship` 대신 `/orchestrate`로 진행한다. 배치 순서는 tasks의 D→T→U→S→Z를 따른다 | 사용자 (`/orchestrate` 호출) |
| 2026-10-30 | S2 probe 명령: `node .scratch/runtime-test/buzz-search/probe.mjs`. `/runtime-test` 스킬의 위치 규칙과 `app/runtime/` 지원을 쓴다 | 지휘자 판단 — tasks S2가 "명령 미정"으로 남겼고, `/runtime-test` 스킬이 probe 위치와 방법을 정한다 |
| 2026-10-30 | 독립 리뷰 일부를 Codex `gpt-6-astra` medium으로 한다(모델 계열 교차) | 지휘자 판단 — 사용자 상시 선호(2026-10-26 "Codex 적당히 섞어 써도 괜찮아", Claude 주 작업·Codex는 교차 리뷰) |
| 2026-10-30 | S0 기준값 측정과 초안 쪽 측정 스크립트 준비를 BT·BU와 병렬로 먼저 돌린다(BS0). 나머지 S1~S3는 BU 통합 뒤 같은 작업자에게 새 Task로 보낸다 | 지휘자 판단 — S0는 main 코드만 재고, 초안 측정은 구현이 필요 없다. 파일 겹침 없음 |
| 2026-10-30 | BU는 BT의 워크트리를 이어 쓰되, 작업자는 Opus high로 새로 띄운다(BT 작업자는 해제) | 지휘자 판단 — 터미널 재사용은 모델·effort를 바꿀 수 없고, BU는 high가 필요하다. 맥락은 handoff-BT로 넘긴다 |

## 배치

| 배치 | 항목 | 파일 소유 | 선행 | 모델·effort (이유) | 검증 게이트 | 상태 |
|---|---|---|---|---|---|---|
| BT | T1–T4 | `app/src/renderer/quickOpen.ts`, `app/src/renderer/quickOpen.test.ts` | — | Claude Opus medium (코드포인트·정규화 경계와 상한 전 거르기. 명세가 자세해 판단 폭은 좁다) | 구현 전 red 기록, `npm --prefix app test`, typecheck, 기존 순위 단언 무수정 | 통합 `914db15c` |
| BS0 | S0, S1 준비(초안 열 프레임 측정) | `.scratch/design-sync/buzz-search/` | — | Claude Opus high (측정 스크립트가 S1 판정의 근거) | `node .scratch/design-sync/buzz-search/measure.mjs`가 기준값·초안 측정 파일을 남김 | 완료(커밋 없음) |
| BU | U1, U2 | `QuickOpenDialog.tsx`, `QuickOpenDialog.test.tsx`, `ds/surfaces.css`, `styles.css`의 `.qo*` 규칙 | BT 통합 | Claude Opus high (포커스·모달·접근성·바깥 클릭 함정, POSTMORTEM 2건) | tasks U1·U2 검증, `npm --prefix app test`, typecheck, build | 진행 중 |
| BS | S1–S3 | U 배치 파일의 수정, `.scratch/design-sync/buzz-search/`, `.scratch/runtime-test/buzz-search/`, `docs/DESIGN.md` | BU 통합, BS0 | Claude Opus high (측정·수정·회귀 테스트) | 기록되지 않은 차이 0, probe exit 0, tasks S3 grep | 대기 |
| BZ | Z1–Z4 | `docs/PRODUCT.md`, `docs/ARCHITECTURE.md`, `docs/features/buzz-restyle/spec.md`, `docs/features/buzz-search/` 삭제 | 모든 배치 | 지휘자 (`/verify`, 문서 승격 커밋) | `verify.mjs` exit 0, tasks Z2·Z3 grep, Z4 디렉터리 없음 | 대기 |

D1(초안)은 이미 완료됐다(`c56a544f`, 기록 `df23dd4f`).

리뷰 작업자(보고만): BT → Codex `gpt-6-astra` medium. BU → Claude Opus high(포커스·모달 판단이 많아 같은 계열 고난도 리뷰). BS의 코드 수정 → Codex `gpt-6-astra` medium.

## 겹침과 순서

- 1차 병렬: BT, BS0. 파일이 겹치지 않는다. BS0의 Electron 측정 외에 GUI를 쓰는 배치가 없다.
- BU는 BT 리뷰·통합 뒤 같은 작업자·워크트리에서 시작한다.
- BS는 BU 리뷰·통합 뒤 BS0 작업자가 워크트리를 `feat-buzz-search`로 맞춘 뒤 시작한다.
- BZ → push·PR.

## 진행 기록

- 2026-10-30: BT(`buzz-search-BT`, dispatch `ctx_ecc49a1bf2f2`)·BS0(`buzz-search-BS0`, dispatch `ctx_1d891c434901`) 시작, Run `run_92eb71e2ecf1`.
- 2026-10-30: BT 완료. 커밋 `6d1525a0`(test, red 27/46)·`914db15c`(feat), 브랜치 `SinhyeokKang/feat-buzz-search-bt`. 작업자 보고 `npm --prefix app test` 4721 통과, typecheck 통과. 리뷰는 Codex `gpt-6-astra` medium(dispatch `ctx_28e831b00d6e`). 첫 시작은 handoff에 적힌 옛 브랜치 이름으로 worktree 생성에 실패해 재시도했다.
- 2026-10-30: BT 리뷰(Codex) 🔴0·🟡0·⚪0. red 27/46과 46/46 통과를 리뷰어가 재현했다. `feat-buzz-search`를 `914db15c`로 fast-forward했고, 지휘자가 typecheck와 Quick Open 테스트 53개 통과를 확인했다. 리뷰어와 BT 작업자를 해제했다. BU 시작(dispatch `ctx_8ea18845bfc1`, 워크트리 `buzz-search-BT`).
- 2026-10-30: BS0 완료. `measure.mjs`(BS0 워크트리 `.scratch/design-sync/buzz-search/`) exit 0. Add Projects 기준값은 640×304, top 128, padding 32, radius 28, `corner-shape` `superellipse(1)`이다. 초안 열 프레임 값은 design.md '화면 구성'과 일치한다. Electron 45는 `corner-shape`를 지원한다. S1이 판단할 초안 사항은 행 squircle, `.qo-height` clip에 잘리는 스크롤바 4px, 초안 예시 데이터 불일치다. 작업자는 BS를 위해 남겨 둔다.
