# app-ui — orch

정본: [spec.md](./spec.md) · [design.md](./design.md) · [tasks.md](./tasks.md). 이 문서는 배치 배정과 진행만 적는다.

- 시작 해시: `6a41da7`(main)
- 통합 브랜치: `feat-app-ui`
- 지휘: Claude Code(Opus 5.5)

## 결정 로그

| 날짜 | 결정 | 근거 |
|---|---|---|
| 2026-10-22 | Codex 워커를 쓴다(이 기능에 한해 모델 경계를 넘음) | 사용자(`/orchestrate … // Codex 워커 허가`), tasks.md '진행' |
| 2026-10-22 | 커밋 안 된 초안(`design/` · `.doan/config.json` · `.gitattributes`)을 리뷰 반영 전 상태 그대로 먼저 커밋한다 | 지휘자 판단 — 워크트리는 커밋에서 갈라지므로 워커가 초안을 읽으려면 커밋이 있어야 한다. task 2 커밋은 그 위에 고친 것만 담는다 |
| 2026-10-22 | task 0(AGENTS.md 두 줄)은 지휘자가 직접 커밋한다 | 지휘자 판단 — AGENTS 'Commit conventions': 하네스 변경은 대화 중에 바로 고친다 |
| 2026-10-22 | task 2(초안 확정 · 토큰 이동)는 Claude 워커가 맡는다 | 지휘자 판단 — design.md 흐름 10: 초안은 Claude, 구현은 Codex라는 실험 구도 |
| 2026-10-22 | task 7의 `/design-sync`는 Codex 워커가 6단계(리뷰) 직전까지 하고 멈춘다. 리뷰는 지휘자가 띄운 Claude 리뷰 워커가 하고, 지적은 같은 Codex 워커가 고친다 | design.md 흐름 10 |
| 2026-10-22 | 배치별 코드 리뷰는 Claude 리뷰 워커가 한다 | `/orchestrate` 3: 지휘자와 같은 런타임 |
| 2026-10-22 | task 8 · 9(문서 정리, 승격)는 지휘자가 한다 | `/orchestrate` 4 · 5: 문서 최신화와 승격은 지휘자 몫 |
| 2026-10-22 | Astra가 Sol보다 상위 모델이다. 판단이 많은 E · F는 Astra medium, C는 Sol medium으로 배정한다. B는 이미 Sol high로 돌고 있어 그대로 둔다 | 사용자 지적("astra가 더 상위 모델") |
| 2026-10-22 | Radix ScrollArea는 쓰지 않는다. 사이드바와 패널은 네이티브 overflow로 스크롤하고 스크롤바는 CSS로 꾸민다. 빌드 CSP는 그대로 둔다 | 사용자 — task 1에서 ScrollArea의 인라인 `<style>`이 빌드 CSP 위반 1건 |
| 2026-10-22 | `@vitejs/plugin-react`는 쓰지 않는다. JSX는 Vite 내장 변환으로 처리하고, dev에서는 Fast Refresh 대신 페이지 전체 리로드를 받아들인다. dev CSP는 그대로 둔다 | 사용자 — task 1에서 Fast Refresh의 인라인 스크립트가 dev CSP에 막혀 React가 뜨지 않음 |
| 2026-10-22 | 캔버스가 열린 프로젝트가 uninitialized가 되면 notFound와 다른 문구를 쓴다: "The project <name> is not initialized. Run doan init in a terminal." | 사용자 — A 리뷰 🟡4: Reopen이 없는 행에 Reopen을 안내함 |
| 2026-10-22 | CLI error 행의 칩은 "CLI error"로 둔다 | 지휘자 판단 — design.md '순수 함수'의 `projectRow` status에 "CLI error"가 따로 있다(A 리뷰 🟡1) |
| 2026-10-22 | Codex 워커에게는 초안 경로와 `doan ls` · `doan check` 결과만 넘기고 초안을 말로 풀지 않는다 | tasks.md '진행' |

## 배치

| 배치 | 항목 | 파일 소유 | 선행 | 모델 · effort (이유) | 검증 게이트 | 상태 |
|---|---|---|---|---|---|---|
| 0 | task 0 | `AGENTS.md` | — | 지휘자 | grep 두 줄 | 완료 `9dbf9fe` |
| A | task 2(초안 확정, 토큰 이동) | `design/` · `.doan/config.json` · `app/src/renderer/tokens.css`(새 파일) | — | Claude Opus medium (초안이 실험의 정본이라 문구 · 상태 판단이 틀리면 뒤 배치가 모두 어긋남) | `doan check --repo .` 오류 0, `doan ls` 프레임 7개, 한글 0건, `tokens.css` 지시어 0건 | 통합 `6b49140`..`7449715` (2라운드) |
| B | task 1(스택 확인) | `.scratch/app-ui-stack/` · `docs/features/app-ui/design.md` 'PoC · 사전 확인' | — | Codex gpt-6.1-sol high (CSP · peer 호환 판단이 틀리면 렌더러 전체가 막힘) | 확인 항목마다 결과가 design.md에 있음. CSP를 넓혀야 하면 멈춤 | 통합 `bcfec5d` (사용자 결정 2건 뒤 재확인) |
| C | task 3 · 4(순수 함수, main · preload · shell) | `app/src/renderer/{projectRow,activity,canvasInfo,canvasView}.ts`와 테스트, `app/src/main/{view,shell,index}.ts`와 테스트, `app/src/preload/`, `app/src/renderer/main.ts`의 타입이 깨지는 호출부만(지휘자 허가) | A(문구가 초안과 같아야 함) | Codex gpt-6.1-sol medium (경계 사례가 tasks에 다 적혀 있어 판단할 곳이 적다. 수명주기는 Claude 리뷰가 본다) | `npm --prefix app test` · `typecheck` · `build` | 대기 |
| E | task 5 · 6(렌더러, e2e) | `app/src/renderer/` 나머지, `app/package.json` · lock · `.npmrc` · `components.json` · `electron.vite.config.ts` · `tsconfig.json`, `app/e2e/` | B · C | Codex gpt-6-astra medium (상위 모델, effort 상한 medium — 명령형 경계, CSP, 포커스, 변형 증명) | task 5 grep 4종, `test` · `typecheck`, `e2e` PASS 두 번 연속, 변형 표 | 대기 |
| F | task 7(`/design-sync`) | `app/src/renderer/`, `docs/DESIGN.md`, `.scratch/design-sync/` | E | Codex gpt-6-astra medium (상위 모델, effort 상한 medium — 측정 · 수정 반복) | 대조표 일치 또는 기록된 차이, 첫 대조표 보존 | 대기 |
| 리뷰 | 배치 A · C · E · F diff | 보고만 | 각 배치 | Claude Opus high(C · E · F) / Sonnet medium(A). C는 창 수명주기와 IPC 신뢰가 있어 Opus high로 올렸다 | 🔴 0 | — |
| 문서 | task 8 · 9 | `docs/DIRECTORY.md` · `.agents/skills/runtime-test/SKILL.md` · `AGENTS.md` · `docs/PRODUCT.md` · `docs/ARCHITECTURE.md` · `docs/features/app-ui/` | F | 지휘자 | tasks.md 8 · 9 검증 | 대기 |

tasks.md의 체크 항목은 task 0–9이고 모두 위 한 행에 속한다.

## 순서와 겹침

- 1파: A ∥ B. 파일이 겹치지 않는다(B는 design.md의 한 절만).
- 2파: A 통합 뒤 C. B가 아직 돌고 있어도 된다(겹치지 않음).
- 3파: B · C 통합 뒤 E. 4파: E 통합 뒤 F. 그 뒤 문서.
- C와 E는 `canvasView.ts`를 함께 쓰지만 C가 먼저 끝나므로 직렬이다.

## 진행 기록

- A 1라운드 `790f01e` · `221d225` → 리뷰(Sonnet medium) 🔴 0 · 🟡 4 → 2라운드 `07a8fb9` · `373437c` → 통합. 통합 HEAD에서 check 오류 0 · 경고 6, 프레임 7, test 533 · typecheck 통과.
- C(Sol medium) `bfdc067`..`4636bd1`: test 567 · typecheck · build 통과(워커 보고). `/runtime-test`와 e2e는 E로 넘김(지휘자 확인). 리뷰(Opus high) 진행 중.
- B: CSP 게이트 실패(빌드 ScrollArea 인라인 style, dev Fast Refresh 인라인 스크립트) → 사용자 결정 두 건 → 재확인에서 빌드 · dev 위반 0건, peer 경고 0건 → `dd7f363` 통합(`bcfec5d`). 실험 사본과 인계 문서는 `.scratch/app-ui/`에 보관했다(렌더러 배치 참고용). B 터미널은 Orca가 `user_takeover`로 보존 중이다.

