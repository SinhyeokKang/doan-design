# design-system-canvases — tasks

선행: remove-mcp가 main에 merge된 뒤 시작한다(design.md '순서와 다른 feature').

순서: CLI 순수 함수 → guide·preset → 앱 순수 함수 → 앱 shell(감시·썸네일·대화) → sidebar 초안·UI → 이 repo 적용 → eval → 문서 승격. schema 변경은 없다.

## T1. CLI: `.doan/ds/` 목록·서빙·check (`/tdd` → `/implement`)

- `repo` 캔버스 목록이 두 디렉터리를 걷고, `Scope`·`MetadataPath`에 `.doan/ds`를 더하고, `no_canvases` 조건과 메시지를 바꾼다(design.md '순수 함수' Go 항목).
- 검증: `go test ./...`, `go vet ./...`. 임시 repo에 `.doan/ds/button.html`을 두고 `go run ./cli/cmd/doan ls --repo <tmp> --json`이 그 행과 `scope`의 `.doan/ds`를, `go run ./cli/cmd/doan check --repo <tmp> --json`이 `no_canvases` 없음과 두 디렉터리 사이의 `duplicate_canvas_id`를 보인다.

— commit: `feat(cli): list and serve design-system canvases in .doan/ds`

## T2. guide와 preset 본문

- guide 컨벤션 1·7, `document.md`(design.md '`document`의 새 기본'), 다른 preset 7개의 design system 위치, `SOURCES.md`, `notices/MODIFICATIONS.md`.
- 검증: `go test ./...`(출력 예산 `skillOutputBudget`, catalog·본문·marker 테스트 포함). `rg -n 'canvases/design-system' cli/internal`의 남은 결과가 옛 위치를 설명하는 문장뿐이다.

— commit: `feat(cli): teach .doan/ds design-system canvases in the guide and presets`

## T3. 앱 순수 함수 (`/tdd` → `/implement`)

- 경로 판단 함수, `sidebarGroups`, Home 추천 규칙(Q5), `designChange`의 `.doan/ds/` 분류, 사라진 캔버스 toast 문구(design.md '순수 함수' TS 항목).
- 검증: `npm --prefix app test`, `npm --prefix app run typecheck`.

— commit: `feat(app): recognize .doan/ds canvases`

## T4. 앱 shell: 감시·썸네일·대화·설정 문구

- `watch.ts`의 `.doan/ds/` 감시와 지웠다 다시 만드는 테스트, `thumbnails.ts`, conversation `store.ts`·`transport.ts`·`acp.ts`, toast 호출부, ProjectSettingsDialog 문구(`clarify` preset 먼저). `rg -n 'startsWith.*canvases' eval app/src`로 남은 판정을 하나씩 판단한다.
- 검증: `npm --prefix app test`, `npm --prefix app run typecheck`, `npm --prefix app run build`. `/runtime-test`로 격리한 앱에서 `.doan/ds/` 캔버스를 열고, 그 파일을 고치면 그 캔버스만 다시 그려지고 다른 캔버스의 선택이 남는지 확인한다.

— commit: `feat(app): watch, serve and bind .doan/ds canvases`

## T5. sidebar 초안 (`/design-draft`)

- design.md 'sidebar' 절로 초안을 그린다(두 묶음, 묶음 제목, `.doan/ds/` 행만 있을 때, 행 상태 slot·코멘트 수·읽기 오류가 묶음 안에 있을 때). 사용자가 앱에서 확정한다.
- 검증: `go run ./cli/cmd/doan check --repo .`에 이 초안의 error가 없고, `go run ./cli/cmd/doan ls --repo . --json`에 초안이 있다. 사용자 확정.

— commit: `docs(design): design-system-canvases sidebar draft`

## T6. sidebar UI

- `ShellSidebar.tsx`가 `sidebarGroups`로 두 묶음을 그린다. 키 이동·typeahead·초점 이동이 두 묶음을 한 줄로 잇는다.
- 검증: `npm --prefix app test`(ShellSidebar 테스트에 묶음 렌더와 키 이동), `npm --prefix app run typecheck`. `/runtime-test`로 두 묶음과 `.doan/ds/`만 있는 프로젝트를 확인하고, `/design-sync`로 초안과 계산된 스타일을 맞춘다.

— commit: `feat(app): group design-system canvases in the sidebar`

## T7. 이 repo의 design system 옮기기

- 확장한 `document` preset으로 `.doan/canvases/notice.html`을 `.doan/ds/notice.html`로 옮기고(id 그대로), `buzz-ds.html`을 `.doan/ds/`의 토큰 그룹별·컴포넌트별 캔버스로 나눈다. 묶음에 맞지 않는 프레임(`canvas-marks`, `accent-places`, `shared-*`)을 어디에 둘지 preset이 제안하면 사용자에게 확인한다. `docs/DESIGN.md`의 `.doan/canvases/buzz-ds.html`·`notice.html` 참조를 새 경로와 프레임으로 고친다.
- 검증: `go run ./cli/cmd/doan check --repo .`에 이 변경으로 생긴 error가 없다. `rg -n 'buzz-ds\.html|canvases/notice\.html' docs .agents AGENTS.md`에 남은 참조가 없다(POSTMORTEM의 과거 기록은 보존). 사용자가 앱 sidebar에서 새 캔버스들을 확인한다.

— commit: `docs(design): split the design-system canvas into .doan/ds`

## T8. eval 시나리오

- D10c를 은퇴시키고 D10d(같은 seed·prompt, `.doan/ds/` 기대)를 만든다. D11e(`.doan/ds/`의 완전한 design system 재사용), D13(코드 변경 뒤 해당 캔버스만 유지)을 더한다. 각 시나리오에 pass·fail fixture를 둔다.
- 검증: `node --test 'eval/**/*.test.ts'`, `node eval/run.ts --self-test`가 `self-test PASS`, exit 0.

— commit: `test(eval): design-system canvases in .doan/ds`

## T9. `/agent-eval`

- 검증: `npm --prefix app run package` 후 `node eval/run.ts --round design-system-canvases`(D10d, D11d, D11e, D13과 preset 세트). 결과를 `docs/USABILITY-EVAL.md`에 적고, 이 변경으로 생긴 새 issue 행이 없다.

— commit: `docs(eval): design-system-canvases round`

## T10. 문서 승격

- PRODUCT: §5 item 1(sidebar, Home 추천 규칙), item 13 `document`, 'Dogfooding' 절, §6 'Open questions'의 "Design-system canvases" 항목 삭제. ARCHITECTURE: §1 Project directory·컨벤션 1·7·check 규칙 표(`no_canvases`, `css_not_served`), §3 서빙 범위, §6 guide 설명, §12 `ls`·`config` 규칙, §13 Listing·Watching, §14 시나리오 세트. DESIGN.md(sidebar 측정값과 design system 참조), DIRECTORY.md(`.doan/ds/`). buzz-restyle spec #7 `buzz-project` 행에 Overview의 `.doan/ds/` 섹션 표시(제목, 순서, design-system 캔버스만 있을 때의 빈 상태와 FirstPrompt)를 넘긴다.
- 검증: `rg -n 'canvases/design-system|Design-system canvases' docs AGENTS.md README.md`의 남은 결과가 과거 기록뿐이다. `node .agents/skills/verify/scripts/verify.mjs --eval` 통과.
- 마지막으로 `docs/features/design-system-canvases/`를 지운다.

— commit: 문서별로 나눈다.
