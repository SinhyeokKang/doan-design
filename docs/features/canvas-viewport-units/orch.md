# canvas-viewport-units — orch

- 계획: [spec](./spec.md) · [design](./design.md) · [tasks](./tasks.md)
- 시작 hash: `28b270c8` (main)
- 통합 브랜치: `feat/canvas-viewport-units`
- 지휘: Claude Code (Opus). 모델 교차: 사용자가 이 세션에서 Codex를 허가했다. 구현은 Claude, 독립 리뷰와 agent-eval은 Codex가 맡는다.

## 결정 로그

- D1 (지휘자 판단 — tasks Z1): `buzz-project-settings`의 dvh 값은 900px 창 기준으로 계산한 px로 바꾼다. 화면 모양을 유지하는 최소 수정만 하고 다른 내용은 건드리지 않는다.
- D2 (지휘자 판단 — design 'skills'): T3의 가이드 줄은 Go 배치(A)가, `loadingdone` 주입은 TS 배치(B)가 맡는다. 파일이 겹치지 않는다.
- D3 (지휘자 판단 — AGENTS 'Workflow'): T6 `/verify --eval`과 Z1의 문서 승격(ARCHITECTURE·BACKLOG, 디렉터리 삭제)은 지휘자가 통합 HEAD에서 한다. 캔버스 수정은 배치 C가 한다.
- D5 (사용자 결정, 배치 A 결과에서): `viewport_height_unit`은 캔버스 파일의 `<style>`·`style` 속성만 본다. 링크한 공유 스타일시트(앱 `ds/surfaces.css`의 `100dvh` 등)는 에이전트가 고칠 수 없는 제품 CSS라 경고하지 않는다. 가이드에 "링크한 CSS의 viewport 높이 단위는 캔버스에서 px로 덮어쓴다"를 더하고, `buzz-project-settings`의 `.doan-dialog[open]{max-height:none}`은 남긴다. spec·design·tasks에 반영했다.
- D4 (지휘자 판단 — tasks T5): agent-eval은 `W1,W2`만 돌리고 새 시나리오는 두지 않는다.

## 배치

| 배치 | 항목 | 파일 소유 | 선행 | 모델·effort와 이유 | 검증 게이트 | 상태 |
|---|---|---|---|---|---|---|
| A | T1, T3 중 가이드 줄 | `cli/internal/canvas/css.go`·테스트, `cli/internal/check/check.go`·테스트, `cli/internal/cli/skill.md`(+스킬 테스트) | 없음 | Claude Sonnet high — 기존 `hardcoded_color` 경로를 따르는 확장이지만 토크나이저 경계 케이스가 많다 | `go test ./...`, `go vet ./...`, `doan skill` 출력 확인 | 대기 |
| B | T2, T3 중 `loadingdone` 주입 | `app/src/main/canvasScript.ts`·`canvasScript.test.ts` | 없음 | Claude Opus high — 높이 고정 루프는 POSTMORTEM 진동 이력이 있어 틀리면 보드가 잘리거나 흔들린다 | `npm --prefix app test`, `npm --prefix app run typecheck` | 대기 |
| RA | A 리뷰 | 보고만 | A | Codex gpt-6-astra medium — 교차 모델 독립 리뷰 | `/code-review` 보고 | 대기 |
| RB | B 리뷰 | 보고만 | B | Codex gpt-6-astra medium — 교차 모델 독립 리뷰, 고정점 판단 | `/code-review` 보고 | 대기 |
| C | Z1 중 캔버스 수정, T4 `/runtime-test` | `.doan/canvases/buzz-project-settings.html`, `.scratch/` 픽스처 | A, B 통합 | Claude Opus medium — 실제 앱 격리 probe에 판단이 필요하다 | runtime-test 측정값·스크린샷, `doan check --repo .`에 `viewport_height_unit` 없음 | 대기 |
| D | T5 `/agent-eval` | `docs/USABILITY-EVAL.md` | A, B 통합 | Codex gpt-6.1-sol medium — 정해진 절차를 돌리는 작업 | `node eval/run.ts --self-test` PASS, W1·W2 라운드 기록 | 대기 |
| 지휘자 | T6, Z1 문서 승격 | `docs/ARCHITECTURE.md`, `docs/BACKLOG.md`, 이 디렉터리 삭제 | C, D | — | `verify.mjs --eval` 통과 | 대기 |

## 겹침과 순서

- A와 B는 파일이 겹치지 않아 병렬로 돈다.
- C와 D는 A·B 통합 뒤에 병렬로 돈다. C는 GUI probe를, D는 패키지 빌드와 실제 에이전트를 쓰므로 서로 겹치지 않는다. 지휘자의 `/verify`는 C·D가 끝난 뒤에 돌린다.
- tasks 항목 대응: T1→A, T2→B, T3→A(가이드)+B(주입), T4→C, T5→D, T6→지휘자, Z1→C(캔버스)+지휘자(문서).
