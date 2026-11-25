# r2-cli orchestrate

- 출처: `docs/features/audit-261126-2/report.md`(R2-M6, Low 목록), 원본 리뷰어 보고 `/Users/sinhyeok/code/doan-design/.scratch/audit/261126-r2/{cli-core,cli-export-canvas}.md`, 리드 brief(/audit-loop 라운드 2)
- 시작 해시: `1078f3a67`
- 통합 브랜치: `feat/r2-cli` (리드가 develop에서 만들었다)
- 병렬 conductor: r2-renderer(`app/src/renderer`), r2-main(ARCHITECTURE ~728행). 이 run은 `cli/internal/**`(viewer CSS/JS 포함)와 `app/src/main/exportViewer.test.ts`를 맡는다.

## 결정 기록

- 사용자에게 묻지 않는다(리드 brief). 사용자 결정이 필요한 항목은 PR 본문 "Needs a user decision"에 남긴다.
- R2-M6은 의심 항목이다. Electron 45 probe로 `<image>` 등록 속성이 선언한 곳 기준으로 url을 푸는지 먼저 확인한다. 재현되지 않으면 고치지 않고 PR 본문에 적는다 — conductor's call(리드 brief 규칙).
- R2-M6 확인 시 ARCHITECTURE §3 문구는 "syntax accepting `<url>`"이다. `<image>`도 url을 받으므로 규칙은 그대로이고 구현과 가이드만 맞춘다. 문구에 `<image>`를 명시하는 것은 사실 기술이라 결정 변경이 아니다 — conductor's call.
- 가이드(`skill.md`) 변경은 AGENTS.md 'Workflow'에 따라 `/agent-eval` 대상이다. 처리는 통합 후 판단해 PR 본문에 적는다.
- 모든 worker는 Claude 계열이다.

## 배치

| 배치 | 항목 | 파일 소유 | 선행 | 모델·effort와 이유 | 검증 게이트 | 상태 |
|---|---|---|---|---|---|---|
| A viewer | R2-cli-export-canvas-1, -2, -5 | `cli/internal/export/viewer/{player.js,shell.css,prototype.css}`, `cli/internal/export/{assemble.go,project_thumb.go}`와 테스트, `app/src/main/exportViewer.test.ts`, viewerInspect 재생성물·export Pinned digest | 없음 | Sonnet medium — 이름 바꾸기·CSS 복사·헬퍼 합치기에 테스트 추가, 판단 적음 | `go test ./cli/...`, `npm --prefix app test -- exportViewer`, `node app/scripts/viewerInspect.mjs --check` | 대기 |
| B property·guide | R2-M6, R2-cli-core-2, R2-cli-core-3 | `cli/internal/canvas/{css.go,custom.go}`와 테스트, `cli/internal/export/{inline.go,customurl.go}`(필요 시), `cli/internal/cli/{skill.md,skill_test.go}`, `docs/ARCHITECTURE.md` | 없음 | Opus high — Electron probe로 브라우저 동작을 확인하고 export 불변식(앱과 다른 파일을 넣지 않음)을 건드린다 | `go test ./cli/...`, probe 기록 | 대기 |
| C core | R2-cli-core-1, R2-cli-export-canvas-4, IDPattern 조합 헬퍼 | `cli/internal/cli/{config.go,config_test.go,read.go,sessions.go}`, `cli/internal/check/check.go`, `cli/internal/canvas/canvas.go` | 없음 | Sonnet medium — 기존 `belowRoot` 재사용과 헬퍼 추출, 경로 판정은 테스트로 고정 | `go test ./cli/...`, `go vet ./...` | 대기 |

## 파일 겹침과 순서

- A·B·C는 파일이 겹치지 않아 병렬로 돈다. `canvas.go`는 C만, `css.go`·`custom.go`는 B만 고친다. `skill.md`와 ARCHITECTURE는 B만 고친다.
- B가 export(`inline.go`, `customurl.go`)를 고치게 되면 A의 `assemble.go`·`project_thumb.go`와는 다른 파일이다.
- 통합 후 전체 게이트(`node .agents/skills/verify/scripts/verify.mjs`)를 conductor가 돌린다.
