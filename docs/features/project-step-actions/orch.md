# project-step-actions — orch

- 계획: [spec](./spec.md) · [design](./design.md) · [tasks](./tasks.md)
- 체인: [chain-261114-1](../chain-261114-1/chain.md) 링크 1/2
- 시작 해시: `bb4447737` (origin/develop)
- 통합 브랜치: `feat/project-step-actions` (리드가 만들어 체크아웃함)
- 컨덕터: Claude Opus (이 세션)

## Codex 사용 범위

- 시작 시 주간 사용량(`$CODEX_HOME` 최신 rollout, `window_minutes: 10080`): 42% 사용, 리셋 2026-11-19 18:16 KST.
- 체인 상시 권한(사용자 2026-11-14)으로 Codex 워커를 쓴다. 범위: 독립 `/code-review` 워커 R(gpt-6-astra medium). 리뷰를 나눌 때(A 완료 뒤, R의 rollout) 다시 봤다: 42% 사용. 구현은 Claude가 맡는다(메모리 규칙: Claude 주, Codex는 교차 리뷰 위주).

## 결정 기록

- D1 tasks 1(초안 확인): 체인 시작 점검 2를 사용자가 승인했다("초안과 두 문서의 대조를 마친 뒤의 초안을 확정본으로 본다"). 컨덕터가 `doan check --repo . --json` 오류 0(경고 40, 이 초안 경로 없음), `doan ls`의 `new-project-folder` 프레임 14개를 확인했다. 완료로 본다 — 컨덕터 판단, 근거 체인 시작 점검 2.
- D2 배치 분할: 바뀌는 파일(`projectStep.ts`, `Onboarding.tsx`, `styles.css`, `ds/surfaces.css`, 그 테스트들)이 모든 작업에서 겹치므로 구현 배치는 A 하나로 직렬 진행한다 — 컨덕터 판단, 근거 `/orchestrate` §0.4.
- D3 격리 앱으로 만들 수 없는 상태(로컬 git 서버가 필요한 클론 실패, CLI 거부가 필요한 설정 실패, 첫 실행 Project 단계)는 단위 테스트와 문서화된 차이로 둔다 — 체인 시작 점검 3.
- D4 `/agent-eval` 없음 — 체인 운영 메모, spec '사용자'. PR 본문에 이유를 적는다.
- D5 초안 공유: 이 링크는 `card-busy`, `shipped-notices-*` 다섯 프레임, 모든 프레임의 하단 줄·버튼 크기·알림 모양을 맡는다. New folder 요소는 `/design-sync`에서 "comes with new-project-folder"로 기록한다 — 리드 브리프.

## 배치

- Orca Run: `run_22242497f776`
- D7 A가 본 '설정 실패 뒤 사이드바에 Not set up으로 등록됨'은 출시 규칙이다(PRODUCT §5 item 1 'Add Projects': "a failure leaves it registered as Not set up"). 결함이 아니다 — 컨덕터 판단.
- D8 초안과 코드가 다른 세 곳(`config_invalid`·`project_unreadable`이 검사가 아니라 등록에서 나서 그 폴더 화면에 뜸, `access_failed`에서 'or use GitHub' 구분선 숨김, `invalid_url`에서 Find repository 꺼짐)은 출시 규칙을 따르고 DESIGN.md에 문서화된 차이로 둔다. spec이 바꾸라고 하지 않은 출시 동작이다. 링크 2가 같은 초안을 쓰므로 PR 본문에 적는다 — 컨덕터 판단.
- D6 리드 정정(2026-11-14): 워커 브리프에서 변수 경로 `rm` 금지 줄을 뺐다. Orca 워커에는 해당하지 않는다.


| 배치 | 항목 | 파일 소유 | 선행 | 모델·effort와 이유 | 검증 게이트 | 상태 |
|---|---|---|---|---|---|---|
| A | tasks 2(`/tdd`), 3(`/implement`), 4(`/design-sync`), 5(`/runtime-test`) | `app/src/renderer/**`, `docs/DESIGN.md`, `.scratch/` | 없음 | Claude Opus high — 동의 토큰·포커스·알림 자리 규칙이 얽혀 판단이 많고, 틀리면 보여 주지 않은 계획에 동의하는 회귀가 난다 | tasks 2–5의 검증 줄 | 완료 — `ctx_959255317537`, 워크트리 `psa-a`(브랜치 `SinhyeokKang/psa-a`, 기준 `89a27111e`). 커밋 `4c12c0cf1` test, `d8e535260` feat, `92886cc0b` docs(DESIGN). test·typecheck·lint·build 통과, measure PASS(구현 결함 0), probe PASS 23 |
| R | tasks 6 `/code-review`(보고만) | 없음(읽기) | A | Codex gpt-6-astra medium — 판단 위주 교차 리뷰 | 보고서 | 진행 중 — `ctx_4bd8911eaef1`, `psa-a`에서 |
| D | `/design-sync` 6단계 독립 리뷰 + Doan preset 점검(보고만) | 없음(읽기) | A | Claude Opus medium — design-sync는 같은 런타임 리뷰를 요구하고, 표와 스크린샷 대조라 판단은 중간 | 보고서 | 진행 중 — `ctx_b359592c24b1`, `psa-a`에서 |
| A' | tasks 6 `/refactor`, 영향받은 4·5번 재확인, tasks 7 승격(PRODUCT·ARCHITECTURE·DESIGN·BACKLOG). 피처 디렉터리 삭제는 컨덕터(orch.md 충돌 방지) | A와 같음 + `docs/PRODUCT.md`, `docs/ARCHITECTURE.md`, `docs/BACKLOG.md` | R, D | Claude Opus high(A 워커 이어서) | 🔴 0, tasks 7 검증 줄 | 대기 |
| 컨덕터 | 통합(cherry-pick), tasks 8 `/verify`, push, PR | `orch.md` | A' | — | `verify.mjs` PASS | 대기 |

- 파일 겹침: 모든 배치가 같은 파일을 고치므로 병렬은 없다. A → R·D(읽기만, 병렬) → A' → 통합 순.
- 다른 컨덕터 `feat/cli-remove`와 `app/src/main/index.ts`·`senderAllowed.ts`·`preload/index.ts`가 겹칠 수 있으나, 이 링크는 renderer만 바꾼다(tasks 3 검증: main·preload diff 비어 있음).
- tasks 체크 항목 대응: 1 → D1(컨덕터), 2–5 → A, 6 → R + A', 7 → A', 8 → 컨덕터. 주인 없는 항목 0.
