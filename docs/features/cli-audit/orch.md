# cli-audit 오케스트레이션

- 원천: `docs/features/audit-261126/report.md`의 발견(C-G1-1, B-G1-4, M-G1-3, M-G1-4, L-G1-3, M-G3-7, M14, M15, W2-cli-export-canvas-4). 원 근거: 메인 체크아웃 `.scratch/audit/261126-r1/`.
- 시작 해시: `08ec857c6`
- 통합 브랜치: `feat/cli-audit` (lead가 develop에서 만들었다). PR은 develop 대상, 병합은 lead가 한다.
- 이 디렉터리는 PR 전에 지운다.

## 결정 기록

사용자에게 묻지 않는다(lead 지시). 모두 conductor's call이다.

1. 파일 소유권으로 배치 3개를 나눈다. M-G1-3(trimURL·서빙 범위)과 W2-cli-export-canvas-4가 `check/check.go`·`canvas/`·`export/`를 함께 고치므로 한 배치(C)에 묶는다 — 근거: orchestrate §0.4 겹치는 파일은 병렬 금지.
2. L-G1-3은 의심 항목이다. 실패 테스트로 먼저 재현하고, 재현되지 않으면 고치지 않고 PR 본문에 적는다 — 근거: lead 공통 규칙.
3. M-G1-4는 한쪽 상수가 바뀌면 실패하는 테스트 하나로 고정한다. 새 공유 파일·스키마는 만들지 않는다 — 근거: AGENTS '요청하지 않은 추상화 금지', 기존 `handoffTextLimit` 테스트가 스키마를 읽는 방식과 같다.
4. W2-cli-export-canvas-4는 `image-set()`/`-webkit-image-set()` 안 문자열 URL을 `url(` 참조와 같이 다룬다(내보내기 인라인, `doan check` 판정). PRODUCT §5 3번 "필요한 repo 파일을 모두 데이터로" 문서화된 동작의 버그 수정이다.
5. renderer-audit가 `viewer/player.js`를, main-audit가 `storage.go`·`app/src/main/onboarding/projects.ts`의 `.gitattributes` 줄을 맡는다. 이 실행은 그 파일을 건드리지 않는다.
6. 모든 워커는 Claude다(lead 규칙, AGENTS 'Runtime differences').

## 배치

| 배치 | 항목 | 파일 소유 | 선행 | 모델·effort와 이유 | 검증 게이트 | 상태 |
|---|---|---|---|---|---|---|
| A | C-G1-1, B-G1-4, M-G1-4, L-G1-3(의심), M-G3-7 | `cli/internal/cli/{remove_rules,active,config,config_ops,handoff_rules,onboarding,brand}*.go` 와 그 테스트, `app/src/brand/candidates.ts`(+테스트), `app/src/main/runtime.ts`(+테스트) | 없음 | Opus medium — 메시지 계약과 Go↔TS 상수 고정, 의심 항목 재현 판단 | `go test ./...`, `go vet ./...`, `npm --prefix app test`, typecheck, lint | 통합(리뷰 🔴0 🟡0 ⚪6, ⚪는 남김) |
| B | M14, M15 | `cli/internal/export/viewer/{shell.css,measure.js}`, `app/src/main/exportViewer.test.ts`, `cli/internal/export/assemble*_test.go` | 없음 | Opus medium — 클립 체인은 POSTMORTEM 2026-11-11 재발, 첫 layout 게이트는 2026-11-20 재발 | 위와 같음 | 리뷰 🔴0 🟡1 ⚪4 → 수정 1회차 진행 |
| C | M-G1-3, W2-cli-export-canvas-4 | `cli/internal/cli/{sessions,work_rules,run,check}.go`, `cli/internal/check/`, `cli/internal/canvas/`, `cli/internal/export/*.go`(viewer 제외) 와 그 테스트 | 없음(배치 안에서 M-G1-3 → W2-4 순서) | Opus high — 동작을 바꾸지 않는 패키지 간 통합과 CSS 토크나이저 변경, `doan check` 경로 판정에 닿는다 | 위와 같음 | 통합(리뷰 🔴0 🟡1 ⚪4 → 수정 1회차 반영), 후속 2(프레임 이름 trim) 진행 |

## 겹침과 순서

- A·B·C는 파일이 겹치지 않아 병렬로 돈다. A와 C는 `cli/internal/cli/` 안에서 다른 파일을 맡는다. 겹치는 파일이 필요해지면 워커는 손대지 말고 handoff에 적는다.
- 통합: A → C → B 순서로 cherry-pick한 뒤 통합 HEAD에서 `/verify`.

## 진행 중 결정

7. lead 알림(renderer-audit W3-leftovers-2): 내보내기의 프레임 이름도 PRODUCT "title, else id"를 앱처럼 trim한 제목, 없으면 id로 맞춘다. `assemble.go` 두 곳을 C가 고친다 — 근거: export는 이 실행 소유, lead 지시.
8. `output_test.go` 고정 digest는 B만 바꾸고, 다른 배치·브랜치와 겹치면 통합 시 `go test ./cli/internal/export/ -run Pinned`의 got 값으로 한 번 다시 만든다.
9. L-G1-3 수정으로 bootstrap 대기가 15 s 상한을 최대 약 2.25 s 넘을 수 있다. ARCHITECTURE §4 'Bootstrap'의 "bounded time"은 그대로 성립해 결정 변경이 아니라 사실 기술로 본다 — 근거: 리뷰 A 판단.
10. 공유 게이트의 시간 한도 테스트 실패(harness, quickOpen 등)는 부하 평균 약 100에서 난 것으로, 통합 HEAD에서 부하가 낮을 때 다시 돌린다.
