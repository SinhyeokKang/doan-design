# canvas-row-menu — tasks

착수 조건: terminal-agent-activity의 work 목록(`app/src/main/workState.ts`, preload `getWork`·`onWorkChanged`)이 통합 브랜치에 있다. 아래 P1·P2는 UI 테스트(U 단계)를 쓰기 전에 끝낸다. 문구가 필요 없는 S·T의 Go 쪽은 P와 함께 시작할 수 있다.

명령은 AGENTS.md 'Commands'에 있는 것만 쓴다. `doan`은 `go run ./cli/cmd/doan`이다.

## P. 문구와 초안

- [ ] P1. clarify 프리셋(`go run ./cli/cmd/doan design-skill clarify --json`)으로 메뉴 항목 두 개와 비활성 이유 줄(작업 중, 행 읽기 오류, Export 진행 중), Alert Dialog의 제목·본문(댓글 있음·없음)·버튼, 삭제 토스트 세 가지(성공, 댓글만 실패, 거절), Export 토스트(진행, 성공 + Show in Finder, 외부 URL 안내, 실패 종류별), viewer shell 헤더 문구를 정한다. design.md의 후보를 결정으로 바꾼다. harden 프리셋으로 긴 캔버스 이름, 행 오류, 작업 중, 동시 요청 상태가 빠지지 않았는지 본다.
  - 검증: design.md '행 버튼과 메뉴'·'Alert Dialog'·'앱 Export 흐름'·'viewer shell'에 확정 문구가 있다.
- [ ] P2. `/design-draft`: 새 초안 `.doan/canvases/canvas-row-menu.html`에 (1) 캔버스 행 버튼: 평소·hover·키보드 포커스·메뉴 열림, 행 상태 자리(스피너·알림 dot)와 함께 있을 때(제안: hover·포커스·메뉴 열림 동안만 보이고 상태 자리를 대신한다; 프로젝트 행 버튼은 항상 보인다는 차이를 초안에 적는다), (2) 메뉴: Export / Move to Trash, 작업 중이라 비활성인 Move to Trash와 이유 줄, 행 오류로 비활성인 Export, (3) Alert Dialog(compact, 기본 크기 동작 Cancel·Move to Trash, 댓글 있음·없음), (4) Export 진행·완료·실패 토스트, (5) viewer shell(헤더의 캔버스 이름, frame drawer 닫힘·열림, 확대 컨트롤; 도구·선택·대화·댓글 없음). 사용자가 앱에서 초안을 확인한다.
  - 검증: `go run ./cli/cmd/doan check --repo .`(main과 같은 오류·경고 수, 새 초안의 finding 없음), `go run ./cli/cmd/doan ls --repo .`, 사용자 확인.

── commit: `docs(feature): canvas-row-menu copy` / `docs(design): canvas row menu draft` ──

## S. 고정 자료

- [ ] T1. export 테스트용 seed repo fixture(Go 테스트 안에서 임시 디렉터리로 만든다): token CSS와 그 `@import`, `.doan/assets/` 이미지·폰트(`@font-face`), `.doan/ds/` 공유 CSS, 로컬 script, `srcset`, SVG `<use>`, 외부 URL, `<a href>`, 그리고 거절 경우(repo 밖 `..`, 앞 `/`, scope 밖, 링크된 `.doan/assets`, `.doan/config.json`·`.doan/comments/` 참조, 없는 직접 참조, 로컬 iframe). 새 스키마는 없다(design.md '형식 변경').
  - 검증: `go test ./...`에서 fixture를 만드는 helper 테스트가 green.

── commit: `test(export): seed repository fixtures` ──

## T. 순수 함수 (`/tdd` → `/implement`)

- [ ] T2. Go `classifyRef`, `resolveAsset`(`repo.Resolve`·`repo.Scope` 재사용, 링크된 기본 디렉터리에서 scope와 export 결과를 함께 확인 — POSTMORTEM 2026-10-31 Prevention), `dataURI`(MIME 표 고정, 텍스트 percent-encoding, base64).
  - 검증: `go test ./...`, `go vet ./...`.
- [ ] T3. Go `rewriteCSS`(위치를 내는 lexer 사용, `ScanCSS` 결과 불변 — `canvas_test.go` green 유지), `rewriteHTML`(바꾸지 않은 바이트 보존, `<template>` 무시, `srcset`, `style` 속성), `@import` 순환.
  - 검증: `go test ./...`, `go vet ./...`.
- [ ] T4. Go `assemble`(viewer embed, `srcdoc` escape, `measure.js` 위치, 메타 JSON의 `</script>` escape), `sizeCheck`(50 MiB, 큰 자산 5개), 캔버스 인자 → 목록 path.
  - 검증: `go test ./...`, `go vet ./...`.
- [ ] T5. viewer 파일 `cli/internal/export/viewer/{shell.html,shell.css,shell.js,measure.js}`와 `app/src/main/exportViewer.test.ts`: 높이 규칙(`documentHeight`, `frameBottom`, `nextHeight`), `canScrollAxis`, 메시지 검증, 확대 계산이 `canvasScript.ts`·`viewport.ts`와 같은 입력 표에서 같은 결과를 낸다.
  - 검증: `npm --prefix app test`.
- [ ] T6. TS `trashBlock`(앱 대화 작업 중·답 대기, project conversation drawing, 터미널 work, 다른 worktree의 같은 경로는 막지 않음 — POSTMORTEM 2026-11-01), `commentsFollow`(ID 없음·틀림·중복·행 오류·댓글 수 0), `nextFocusAfterRemoval`, `canvasViewUpdate`의 `trashed` 분기(같은 ID 캔버스가 하나 있어도 `moved`가 아니라 `clear`), main `trashTarget`(등록되지 않은 root, 목록에 없는 path, 하위 디렉터리, `.html` 아님).
  - 검증: `npm --prefix app test`, `npm --prefix app run typecheck`.

── commit: `feat(export): asset resolution and rewriting` / `feat(export): viewer shell` / `feat(app): canvas trash rules` ──

## U. 셸(I/O)

- [ ] T7. `doan export` 명령(`cli/internal/cli/export.go`, `run.go`, `args.go` `-o`·`--force`): 인자 확인 순서, 새 오류 코드 `export_refused`·`export_too_large`·`output_exists`의 exit 2(`envelope.go` `ExitCode`), 임시 파일 + rename, `.doan/` 아래 출력 거절, `O_NOFOLLOW` 읽기, 결과 `{path, output, bytes, frames, inlined, external, links}`, `doan help` usage. CLI 통합 테스트가 envelope를 검증하고 `result`를 깊게 비교한다.
  - 검증: `go test ./...`, `go vet ./...`.
- [ ] T8. 가이드 `cli/internal/cli/skill.md`: `doan export` 한 줄, 부르는 때(사용자가 요청할 때만), `.doan/` 안에 쓰지 않기, `external`이 있으면 사람에게 말하기. `skill_test.go`, brand 테스트(`schema/fixtures/brand/cases.json`)가 green.
  - 검증: `go test ./...`.
- [ ] T9. app main: `canvas:trash`(경로 확인 3~5단계, 작업 중 재확인, 진행 중 집합, 캔버스 → 댓글 순서, `shell.trashItem`), `canvas:export`(저장 대화상자, 마지막 폴더 메모리, `runExport`, 진행 중 집합, Show in Finder 경로 제한), preload 메서드, `senderAllowed` 주 창 전용.
  - 검증: `npm --prefix app test`, `npm --prefix app run typecheck`.

── commit: `feat(cli): doan export` / `docs(skill): export a canvas on request` / `feat(app): move a canvas to Trash and export it` ──

## V. UI

- [ ] T10. `ShellSidebar.tsx` 캔버스 행 버튼과 메뉴(P2 확정 배치, 같은 `menu` 상태, 비활성 항목의 `aria-disabled`와 이유 줄, 메뉴가 열린 행이 사라지면 닫기), 삭제 Alert Dialog, 삭제 뒤 화면(Overview, 토스트 하나, 포커스 이동), Export 토스트, `styles.css`. 실제 행 border-box 높이 32px 유지.
  - 검증: `npm --prefix app test`(`ShellSidebar.interaction.test.tsx`에 Tab·Enter·Esc·포커스 복귀, 정적 markup 테스트), `npm --prefix app run typecheck`, `npm --prefix app run build`.

── commit: `feat(app): canvas row menu` ──

## W. 평가와 실제 앱 확인

- [ ] T11. `/agent-eval`: 새 export 시나리오(design.md '`/agent-eval`', id는 기존과 겹치지 않게)와 fixture·rubric, fake 없이 패키지된 CLI로 실제 round. 삭제는 CLI가 없어 시나리오가 없다.
  - 검증: `node --test 'eval/**/*.test.ts'`, `node eval/run.ts --self-test --scenarios <새 id>`가 `self-test PASS`·exit 0, `npm --prefix app run package` 뒤 `node eval/run.ts --scenarios <새 id> --agents claude,codex`에서 둘 다 통과, 결과를 `docs/USABILITY-EVAL.md`에 적는다.
- [ ] T12. `/design-sync`: 캔버스 행 버튼·메뉴·Alert Dialog·토스트를 초안과 computed style로 비교하고, viewer shell은 `doan export`로 만든 결과 파일을 같은 Electron에서 열어 초안과 비교한다. 측정값을 `docs/DESIGN.md`에 적는다.
  - 검증: 측정 로그(`node .scratch/design-sync/<screen>/measure.mjs`), DESIGN.md 갱신.
- [ ] T13. `/runtime-test`: 격리 앱(임시 HOME·userData·repo)에서 (a) 열린 캔버스를 Move to Trash → Overview, 토스트 하나, 파일과 댓글 파일이 임시 repo에서 빠짐, Back이 지운 캔버스를 건너뜀; (b) 같은 ID를 쓰는 두 캔버스 중 하나를 지워도 다른 쪽으로 따라가지 않음; (c) 앱 대화 작업 중·터미널 `doan work start` 중 Move to Trash 비활성; (d) Export → 저장 → 결과 파일을 네트워크 없이 열어 프레임·폰트·이미지가 보이고 drawer·확대가 동작. 휴지통 probe는 임시 repo의 임시 파일만 옮긴다.
  - 검증: 스크린샷과 상태 로그(`.scratch/runtime-test/`), real-state 비교 통과.

## Z. 승격과 정리

- [ ] Z1. 문서 승격(영어, 현재 규칙으로):
  - `docs/PRODUCT.md` §3 Out of scope 5(export 파일은 사람이 보내는 공유 수단이고 서버·호스팅은 여전히 없다), 7(앱이 캔버스 파일에 하는 유일한 변경은 사람이 확인한 휴지통 옮기기다), §5 item 1(캔버스 행 메뉴, 삭제 규칙, 작업 중 막기, 대화 처리), item 3 또는 새 항목(Export와 viewer), CLI item 9 또는 새 항목(`doan export`).
  - `docs/ARCHITECTURE.md` §12(`doan export` 결과 모양, 새 오류 코드 exit 2), §3(viewer shell: srcdoc sandbox, CSP 상속 함정, embed 위치, 앱 보드에서 가져온 것과 버린 것, 동등성 테스트), §7(`canvas:trash`·`canvas:export` IPC, 경로 확인, 확인과 실행 사이 한계, 삭제 뒤 화면의 `trashed` 표시), §11(device-local 변화 없음 확인).
  - `docs/DIRECTORY.md`(`cli/internal/export/`, `viewer/`), `docs/BACKLOG.md`(Chromium 밖 viewer 미확인, 로컬 iframe·JS import 미지원), README의 status·capabilities.
  - `docs/features/canvas-row-menu/` 삭제.
  - 검증: `node .agents/skills/verify/scripts/verify.mjs --eval` 통과, 사용자가 `/doc-check`를 돌릴 때 이 문서들에서 drift가 없다.

── commit: `docs: promote canvas-row-menu` (문서별로 나눈다) ──
