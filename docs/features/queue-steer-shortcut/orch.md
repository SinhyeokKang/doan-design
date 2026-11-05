# queue-steer-shortcut — orch

원본: [spec.md](./spec.md) · [design.md](./design.md) · [tasks.md](./tasks.md)

- 시작 hash: `c30bc563` (origin/main)
- 통합 브랜치: `feat/queue-steer-shortcut`
- 모델 교차: 사용자가 이번 실행에 Codex 워커를 허락했다(설정 세션의 인계, AGENTS.md 'Runtime differences'). 범위: 구현 배치 하나(I1)와 그 수정 라운드. 리뷰 워커와 지휘는 Claude다. 확인한 Codex 모델 목록: `$CODEX_HOME/models_cache.json`(2026-11-05 fetch, `gpt-6-astra`·`gpt-6.1-sol` 있음). 남은 사용량: Codex 5h 창 60% 사용(check-usage), Claude는 조회 실패.

## 결정 기록

1. 배치를 하나로 둔다 — 지휘자 판단. 근거: tasks가 "한 번의 `/ship`으로 간다"고 하고, A1·B1·C1이 `DockedComposer.tsx`·`homeComposer.ts`·`composerRules.ts`를 함께 고쳐 병렬로 나눌 수 없다.
2. E1·Z1·Z2는 지휘자가 맡는다 — 지휘자 판단. 근거: orchestrate §4(통합 HEAD에서 `/verify`와 `/runtime-test`, 문서 최신화 커밋)와 §5(feature 디렉터리 삭제).
3. `/design-sync`는 따로 돌리지 않는다 — 지휘자 판단. 근거: design '초안 요청'은 다섯 frame 비교를 적었지만 tasks에 `/design-sync` 항목이 없고(C1: "실제 모양은 E1에서 스크린샷으로 본다"), 바뀌는 화면 요소는 caption 한 줄이다. E1에서 caption의 computed style(글자 시작 x가 행 글자와 같은지, 목록 아래 4·card 위 8, 색 `--text-metadata`)을 초안 결정 5와 대조한다. 결과는 DESIGN.md에 적는다(Z1).
4. E1 로그인 프로필: `/Users/sinhyeokkang/code/doan-design/.scratch/provider-profile/userData`를 그대로 쓴다(실제 HOME, 사용자 승인, 설정 세션의 인계). 로그아웃하지 않는다.
5. E1 (b) 실제 키보드·한국어 IME: 그 단계에서 사용자에게 묻는다. 답이 없으면 보고에 미확인으로 남긴다(설정 세션의 인계).
6. 병합 권한 없음. push와 PR까지만 한다. 통합과 PR 전에 최신 origin/main으로 rebase하고 `/verify`를 다시 돌린다(설정 세션의 인계).

## 배치

| 배치 | 항목 | 파일 소유 | 선행 | 모델·effort와 이유 | 검증 gate | 상태 |
|---|---|---|---|---|---|---|
| I1 | A1, B1, C1 | `app/src/renderer/`의 `homeComposer.ts`·`composerRules.ts`·`ComposerParts.tsx`·`DockedComposer.tsx`·`CanvasConversationPanel.tsx`·`ProjectOverview.tsx`와 그 테스트 | 없음 | Codex `gpt-6-astra` medium — 비동기 경계(대화 전환 중 queue 답, `not_running` 전환, flying 행 건너뛰기)와 포커스 판단이 많다 | `npm --prefix app test`, `npm --prefix app run typecheck` | 대기 |
| R1 | I1 리뷰(`/code-review`) | 없음(보고만) | I1 | Claude Opus high — 같은 비동기·키 연결을 다른 시각으로 본다 | 보고서 | 대기 |
| 지휘 | E1, Z1, Z2 | `docs/PRODUCT.md`·`docs/DESIGN.md`·이 디렉터리 | I1 통합 | — | `/runtime-test`, `verify.mjs` | 대기 |

tasks의 체크 항목 A1·B1·C1·E1·Z1·Z2가 모두 위 행 하나에 속한다.

## 파일 겹침과 순서

I1 하나만 코드를 고치므로 병렬 배치가 없다. 순서: I1 → R1 → (수정 라운드) → 통합·rebase → E1 → Z1 → Z2 → push·PR.
