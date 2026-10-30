# buzz-settings — orch

계획 출처: [spec.md](./spec.md) · [design.md](./design.md) · [tasks.md](./tasks.md). 이 문서는 배치 분할·결정·상태만 적는다.

- 시작 해시: `64945783` (2026-10-30, main)
- 통합 브랜치: `feat-buzz-settings`
- 지휘자 체크아웃: `/Users/sinhyeok/code/doan-design`

## 결정 기록

| 날짜 | 결정 | 출처 |
|---|---|---|
| 2026-10-30 | 이 세션에서 Codex 작업자를 쓸 수 있다(모델 계열 교차). Claude가 구현을 맡고, Codex는 교차 리뷰와 기계적 배치(BR)를 맡는다 | 사용자 ("Codex 워커 허가"), 배분은 지휘자 판단 — 사용자 선호(Claude 주 작업, Codex는 교차 리뷰·일부 기계적 배치) |
| 2026-10-30 | tasks의 commit 묶음(T → S → U → R)은 배치 단위 커밋으로 바꾼다. 각 작업자 커밋은 typecheck·빌드가 되는 상태를 지키고, 순서(추가 → 전환 → 제거)는 배치 순서로 지킨다 | 지휘자 판단 — T·S 항목이 main과 renderer에 나뉘어 병렬 배치가 되므로, 통합 순서가 tasks의 경계를 대신한다 |
| 2026-10-30 | main·preload 쪽 순수 함수(T3·T4·T5·T8)와 shell 추가(S2·S3·S4)는 한 배치(BM)다. renderer 쪽 순수 함수(T1·T2·T6·T7·T9), 로그인 컨트롤러(S1), 공용 스타일(U1)은 다른 배치(BP)다 | 지휘자 판단 — 파일이 겹치지 않는다. S1은 main preload에 이미 있는 agent-auth 메서드만 쓴다(`app/src/preload/index.ts:93-111`). U1은 `ds/`만 고친다 |
| 2026-10-30 | T9의 `configBridge` 세션 무효화 사례는 S4(BM)가 맡는다. BP는 다이얼로그 순수 규칙(`projectSettingsDialog.ts`)만 쓴다 | 지휘자 판단 — `configBridge.ts`는 main 소유다(design '순수 함수' 9) |
| 2026-10-30 | R2의 사람 몫(Codex 계정 로그인·로그아웃, 패키지 앱 알림 클릭)은 BS 작업자가 준비하고 지휘자가 사용자에게 시작 전 알리고 허락을 받는다. 알림 권한은 P1에서 `design.doan.app`으로 이미 허용됐다 | tasks '실제 상태 규칙', design 'PoC 의존' |
| 2026-10-30 | R2 probe 위치: `.scratch/runtime-test/buzz-settings/`, R3 측정: `.scratch/design-sync/buzz-settings/measure.mjs`. dev 측정도 격리 env와 `--user-data-dir`로 띄운다 | 지휘자 판단 — `/runtime-test`·`/design-sync` 스킬의 위치 규칙, buzz-add-projects 사고(격리 없는 `electron-vite dev --rendererOnly`) |
| 2026-10-30 | `/agent-eval`은 해당하지 않는다 | spec '사용자' — CLI·MCP·스킬 출력과 `doan config` 계약이 그대로다 |
| 2026-10-30 | 부모 tasks C6 체크는 이 run에서 하지 않는다 | tasks Z4 |

## 배치

| 배치 | 항목 | 파일 소유 | 선행 | 모델·effort (이유) | 검증 게이트 | 상태 |
|---|---|---|---|---|---|---|
| BM | T3, T4, T5, T8, S2, S3, S4 | `app/src/main/**`(`menuState.ts`, 새 `preferences.ts`·`notifications.ts`·`about.ts`·`notifyService.ts`, `index.ts`, `senderAllowed.ts`, `configBridge.ts`, `setupBroker.ts`, `settings.ts`의 알림 설정 URL·카테고리 파싱 추가), `app/src/preload/index.ts`(추가만), 그 테스트 | — | Claude Opus high (IPC 발신자 검사, 알림 참조 수명, 다이얼로그 세션 무효화, 렌더러 교체 정리. 틀리면 권한 경계나 늦은 응답 처리가 깨진다) | 구현 전 red 기록, tasks T3·T4·T5·T8·S2·S3·S4 검증, `npm --prefix app test`, typecheck, `verify.mjs` | 대기 |
| BP | T1, T2, T6, T7, T9, S1, U1 | `addProjectsNav.ts`, 새 `settingsSections.ts`, `app/src/restore/uiState.ts`, `homeComposer.ts`, `agentAuthView.ts`, 새 `projectSettingsDialog.ts`, `agentStep.ts`, 새 `agentSignIn.ts`, `Onboarding.tsx`(컨트롤러 읽기만), `app/src/renderer/ds/`, 그 테스트 | — | Claude Opus high (로그인 컨트롤러는 컴포넌트 수명과 main 작업 수명이 갈라지는 POSTMORTEM 구조. 나머지 순수 함수는 명세가 자세하다) | 구현 전 red 기록, tasks T1·T2·T6·T7·T9·S1·U1 검증, test, typecheck, `Onboarding.test.tsx`·`agentStep` 통과 | 대기 |
| BU1 | U2, U3 | `App.tsx`, 새 `SettingsPage.tsx`·`SettingsAgents.tsx`, `ShellSidebar.tsx`, `HomeComposerView.tsx`, 이동 함수가 있는 renderer 파일, `styles.css`, 그 테스트 | BM·BP 통합 | Claude Opus high (화면 모델·잠금·들어오는 대상 큐·포커스가 여러 이동 경로에 걸침, POSTMORTEM 다수) | tasks U2·U3 검증, POSTMORTEM `rg` 기록, test, typecheck, build | 대기 |
| BU2 | U4, U5 | 새 `SettingsNotifications.tsx`·`SettingsConnections.tsx`·`SettingsAbout.tsx`·`ProjectSettingsDialog.tsx`, `SettingsPage.tsx`, `ShellSidebar.tsx`(프로젝트 메뉴), `SettingsDialog.tsx`, `styles.css`, 그 테스트 | BU1(같은 작업자·워크트리) | Claude Opus high (BU1 작업자 재사용. 터미널 재사용은 모델을 바꿀 수 없다) | tasks U4·U5 검증, test, typecheck, build | 대기 |
| BR | R1 | tasks R1의 지울 파일과 그 참조(`index.ts`, `menuState.ts`, main `uiState.ts`, `senderAllowed.ts`, `settings.ts`, `electron.vite.config.ts`, 관련 테스트) | BU2 통합 | Codex `gpt-6.1-sol` high (삭제와 참조 정리. 판단보다 단계가 많다) | tasks R1 `ls`·`grep` 결과 없음, test, typecheck, build | 대기 |
| BS | R2, R3 | U·R 배치 파일의 수정, `.scratch/runtime-test/buzz-settings/`, `.scratch/design-sync/buzz-settings/`, `docs/DESIGN.md` | BR 통합 | Claude Opus high (실제 앱 probe, 측정·수정·회귀 테스트, 사용자와 함께 하는 확인) | R2 항목별 통과, 기록되지 않은 차이 0, tasks R3 grep | 대기 |
| BZ | Z1~Z4 | `docs/PRODUCT.md`, `docs/ARCHITECTURE.md`, `docs/DIRECTORY.md`, `docs/features/buzz-settings/` 삭제 | 모든 배치 | 지휘자 (`/verify`, 문서 승격 커밋) | `verify.mjs` exit 0, tasks Z1~Z4 grep·`ls` | 대기 |

P1(PoC)은 이미 완료됐다(design 'PoC 의존').

리뷰 작업자(보고만): BM → Codex `gpt-6-astra` medium. BP → Codex `gpt-6-astra` medium. BU1 → Claude Opus high(이동·포커스·잠금 판단이 많다). BU2 → Codex `gpt-6-astra` medium. BR → Claude Opus medium(Codex 구현의 교차 리뷰). BS의 코드 수정 → Codex `gpt-6-astra` medium.

## 겹침과 순서

- 1차 병렬: BM(main·preload), BP(renderer 순수 모듈·컨트롤러·`ds/`). 파일이 겹치지 않는다. GUI를 쓰는 배치가 없다.
- BU1은 BM·BP 리뷰·통합 뒤 새 워크트리에서 시작한다. BU1 완료 뒤 같은 작업자에게 BU2를 새 Task로 보내고, 그동안 BU1 리뷰를 별도 child 워크트리에서 돌린다. BU1 수정은 BU2 뒤 같은 작업자가 한다.
- BR은 BU2 통합 뒤. BS는 BR 통합 뒤이고, 실제 앱을 띄우는 유일한 배치다.
- BZ → push·PR. 병합하지 않는다.

## 진행 기록

- 2026-10-30: orch.md 작성.
- 2026-10-30: Run `run_2216706506ed`. BM(워크트리 `buzz-settings-BM`, dispatch `ctx_255920c5cbd9`, Opus high)·BP(워크트리 `buzz-settings-BP`, dispatch `ctx_45707c50befa`, Opus high) 시작. `launch.effective`가 요청과 같고, 두 작업자 모두 `working`이다.
