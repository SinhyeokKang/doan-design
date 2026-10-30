# buzz-add-projects — orch

계획 출처: [spec.md](./spec.md) · [design.md](./design.md) · [tasks.md](./tasks.md). 이 문서는 배치 분할·결정·상태만 적는다.

- 시작 해시: `dfaedfc2` (2026-10-30, main)
- 통합 브랜치: `feat-buzz-add-projects`
- 지휘자 체크아웃: `/Users/sinhyeok/code/doan-design`

## 결정 기록

| 날짜 | 결정 | 출처 |
|---|---|---|
| 2026-10-30 | 계획 문서는 `docs/features/buzz-add-projects/`다. 인자의 `buzz-add-project`는 같은 자식(부모 tasks C5)을 가리킨다 | 지휘자 판단 — 그 이름의 디렉터리는 이것 하나다 |
| 2026-10-30 | 이 세션에서 Codex 작업자를 쓸 수 있다(모델 계열 교차). Claude가 구현을 맡고, Codex는 교차 리뷰와 기계적 배치(BR)를 맡는다 | 사용자 ("Codex 워커 사용 가능"), 배분은 지휘자 판단 — 사용자 선호(Claude 주 작업, Codex는 교차 리뷰·일부 기계적 배치) |
| 2026-10-30 | M2의 "`flow.add`를 한 경로 판정으로 축소"는 BR(R1)로 옮긴다 | 지휘자 판단 — 축소하면 R1 전까지 남아 있는 체크리스트 스캔 경로가 깨진다. 지우는 배치가 함께 줄이는 편이 중간 통합을 컴파일 가능한 상태로 둔다 |
| 2026-10-30 | T1 중 App 수준 사례(잠긴 동안 이동 함수마다 무시, 페이지 진입이 startup 복원 취소)는 U1이 맡는다. BP는 순수 함수 `addPageReturn`·`leaveLocked`의 사례만 쓴다 | 지휘자 판단 — 두 사례는 `App.tsx`의 이동 함수를 거쳐야 검증되고, `App.tsx`는 BU1 소유다 |
| 2026-10-30 | S2 probe 명령: `node .scratch/runtime-test/buzz-add-projects/probe.mjs`. `/runtime-test` 스킬의 위치 규칙과 `app/runtime/` 지원을 쓴다 | 지휘자 판단 — tasks S2가 "명령 미정"으로 남겼고, `/runtime-test` 스킬이 probe 위치와 방법을 정한다(buzz-search 선례) |
| 2026-10-30 | `/agent-eval`은 해당하지 않는다. CLI·MCP 출력, 가이드, `doan check`, 스킬 스텁이 바뀌지 않는다. `onboarding_*` 계약 보존은 fixture `git diff --exit-code`와 기존 onboarding 테스트로 확인한다 | 지휘자 판단 — AGENTS '/agent-eval' 실행 조건, spec 완료 조건 12 |

## 배치

| 배치 | 항목 | 파일 소유 | 선행 | 모델·effort (이유) | 검증 게이트 | 상태 |
|---|---|---|---|---|---|---|
| BM | T2, T5, M1, M2(`flow.add` 축소 제외) | `app/src/main/**`(새 공유 project 클래스, `onboarding/service.ts`, `menuState.ts`, `index.ts`, `senderAllowed.ts`, 새 `addPageRequest`), `app/src/preload/index.ts`(페이지 API 추가만) | — | Claude Opus high (clone 프로세스 정리, 두 인스턴스의 leftovers·대상 잠금 공유, IPC 발신자 검사. 틀리면 git 프로세스·임시 폴더가 남거나 온보딩 계약이 깨진다) | 구현 전 red 기록, `npm --prefix app test`(onboarding 기존 테스트 무수정), typecheck, `git diff --exit-code main -- app/src/main/onboarding/fixtures cli/internal` | 대기 |
| BP | T1(순수 함수 사례), T3, T4 | 새 렌더러 순수 모듈과 테스트, `homeComposer.ts`·테스트, `projectStep.ts`·테스트(`projectFooter`) | — | Claude Opus medium (이동 결과·하단 문구 판정. 명세가 자세해 판단 폭은 좁다) | 구현 전 red 기록, `npm --prefix app test`, typecheck, `onboardingView.test.ts`·`Onboarding.test.tsx` 무수정 통과 | 대기 |
| BU1 | U1, U2, U3 | `App.tsx`, 새 `AddProjectsPage.tsx`·페이지 세션·포커스 훅, `Onboarding.tsx`, `projectStep.ts`, `HomeComposerView.tsx`, `homeComposer.ts`, 이동 함수가 있는 렌더러 파일(`homeRun.ts`, `useComments.tsx`, `ShellSidebar.tsx` 등), 그 테스트 | BM·BP 통합 | Claude Opus high (화면 모델·포커스·잠금이 여러 이동 경로에 걸침, POSTMORTEM 다수) | tasks U1~U3 검증, POSTMORTEM `rg` 기록, test, typecheck | 대기 |
| BU2 | U4, U5 | `Onboarding.tsx`, `styles.css`, 온보딩 테스트 | BU1(같은 작업자·워크트리) | Claude Opus high (BU1 작업자 재사용. 터미널 재사용은 모델을 바꿀 수 없다) | tasks U4·U5 검증, test, build | 대기 |
| BR | R1, `flow.add` 한 경로 축소 | 지울 파일과 그 참조(`AddProjectsDialog.tsx`, `DropOverlay.tsx`, `addProjects.ts`, `addFlow.ts`, `index.ts`, `preload/index.ts`, `senderAllowed.ts`, `styles.css`의 옛 규칙, 관련 테스트) | BU2 통합 | Codex `gpt-6.1-sol` high (삭제와 참조 정리. 판단보다 단계가 많다) | tasks R1 `rg` 결과 없음, test, typecheck, build | 대기 |
| BS | S1, S2, S3 | U·R 배치 파일의 수정, `.scratch/design-sync/buzz-add-projects/`, `.scratch/runtime-test/buzz-add-projects/`, `docs/DESIGN.md` | BR 통합 | Claude Opus high (측정·수정·회귀 테스트, 실제 앱 probe) | 기록되지 않은 차이 0, probe exit 0, tasks S3 grep | 대기 |
| BZ | Z1~Z3 | `docs/PRODUCT.md`, `docs/ARCHITECTURE.md`, `docs/features/buzz-restyle/spec.md`·`tasks.md`(C5), `docs/features/buzz-add-projects/` 삭제 | 모든 배치 | 지휘자 (`/verify`, 문서 승격 커밋) | `verify.mjs` exit 0, tasks Z2 grep, Z3 디렉터리 없음 | 대기 |

D1(초안)은 이미 완료됐다(tasks D1, 4차 확정 + 5차 `selecting` 잠금 표시).

리뷰 작업자(보고만): BM → Codex `gpt-6-astra` medium. BP → Codex `gpt-6-astra` medium. BU1 → Claude Opus high(포커스·이동 판단이 많다). BU2 → Codex `gpt-6-astra` medium. BR → Claude Opus medium(Codex 구현의 교차 리뷰). BS의 코드 수정 → Codex `gpt-6-astra` medium.

## 겹침과 순서

- 1차 병렬: BM(main·preload), BP(렌더러 순수 모듈). 파일이 겹치지 않는다. GUI를 쓰는 배치가 없다.
- BU1은 BM·BP 리뷰·통합 뒤 새 워크트리에서 시작한다. BU1 완료 뒤 같은 작업자에게 BU2를 새 Task로 보내고, 그동안 BU1 리뷰를 돌린다. BU1 수정은 BU2 뒤 같은 작업자가 한다.
- BR은 BU2 통합 뒤. BS는 BR 통합 뒤이고, 실제 앱을 띄우는 유일한 배치다.
- BZ → push·PR. 병합하지 않는다.

## 진행 기록

- 2026-10-30: orch.md 작성.
