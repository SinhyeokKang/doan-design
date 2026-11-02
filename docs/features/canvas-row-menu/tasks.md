# canvas-row-menu — tasks

착수 조건: 이 feature는 terminal-agent-activity와 같은 PR로 나가고, 그 배치들이 소유한 파일을 고친다. 그래서 다음 배치가 통합 브랜치에 통합된 뒤 그 파일에 손댄다(소유는 `docs/features/terminal-agent-activity/orch.md` '배치'):
- A(`skill.md`): T8 전. B(`main/index.ts`·preload·`senderAllowed.ts`, work 목록 `workState.ts`): T9 전. D(`ShellSidebar.tsx`·`App.tsx`): T6의 renderer 부분과 T10 전. F(`eval/`·`USABILITY-EVAL.md`): T11 전. G(`DESIGN.md`·실제 앱 probe): T12·T13은 G와 순서를 정한다.
- 두 feature의 Z1이 모두 PRODUCT §5 item 1과 ARCHITECTURE §7을 고치므로, 지휘자가 두 승격을 함께 하거나 순서를 정한다. terminal-agent-activity의 마지막 `verify.mjs --eval`은 이 feature를 통합한 뒤 돈다.
- P1·P2는 UI 테스트(V 단계)를 쓰기 전에 끝낸다. 문구가 필요 없는 S·T의 Go 쪽은 P와 함께 시작할 수 있다.

명령은 AGENTS.md 'Commands'에 있는 것만 쓴다. `doan`은 `go run ./cli/cmd/doan`이다.

## P. 문구와 초안

- [ ] P1. clarify 프리셋(`go run ./cli/cmd/doan design-skill clarify --json`)으로 다음 문구를 정하고, design.md의 후보를 결정으로 바꾼다.
  - 메뉴 항목 두 개와 비활성 이유 줄(작업 중, 행 읽기 오류, Export 진행 중)
  - Alert Dialog의 제목·본문(댓글 있음·없음, 추적하지 않는 캔버스에서도 틀리지 않는 커밋 문장, Put Back을 약속하지 않는 되살리기 문장)·버튼, 대화상자 안 작업 중 이유 줄
  - 삭제 토스트 세 가지(성공, 댓글만 실패 + 남은 경로, 거절)
  - Export 토스트(진행, 성공 + Show in Finder, 외부 URL 안내, 실패 종류별 — `export_refused`는 막힌 참조 수와 첫 참조)
  - viewer shell 헤더, "No frames", 1,000개 뒤 남은 수, `<noscript>` 안내
  - harden 프리셋으로 긴 캔버스 이름, 행 오류, 작업 중, 동시 요청 상태가 빠지지 않았는지 본다.
  - 검증: design.md '행 버튼과 메뉴'·'Alert Dialog'·'앱 Export 흐름'·'viewer shell'에 확정 문구가 있다.
- [ ] P2. `/design-draft`: 새 초안 `.doan/canvases/canvas-row-menu.html`에 다섯 가지를 그린다. 사용자가 앱에서 초안을 확인한다.
  - (1) 캔버스 행 버튼: 평소·hover·키보드 포커스·메뉴 열림·잠김, 행 상태 자리(스피너·알림 dot)와 함께 있을 때. 제안은 hover·포커스·메뉴 열림 동안만 보이고 상태 자리를 대신하는 것이다. 프로젝트 행 버튼은 항상 보인다는 차이를 초안에 적는다.
  - (2) 메뉴: Export… / Move to Trash, 작업 중이라 비활성인 Move to Trash와 이유 줄, 행 오류로 비활성인 Export.
  - (3) Alert Dialog: compact, 기본 크기 동작 Cancel·Move to Trash, 댓글 있음·없음, 열린 사이 작업이 시작되어 막힌 상태.
  - (4) Export 진행·완료·실패 토스트.
  - (5) viewer shell: 헤더의 캔버스 이름, frame drawer 닫힘·열림·프레임 0개, 확대 컨트롤, JavaScript 없이 연 상태. 도구·선택·대화·댓글은 없다.
  - 검증: `go run ./cli/cmd/doan check --repo .`(main과 같은 오류·경고 수, 새 초안의 finding 없음), `go run ./cli/cmd/doan ls --repo .`, 사용자 확인.

── commit: `docs(feature): canvas-row-menu copy` / `docs(design): canvas row menu draft` ──

## S. 고정 자료

- [ ] T1. export 테스트용 seed repo fixture(Go 테스트 안에서 임시 디렉터리로 만든다).
  - 넣는 것: token CSS와 그 `@import`(diamond 포함), `.doan/assets/` 이미지·폰트(`@font-face`), `.doan/ds/` 공유 CSS, 로컬 script, `srcset`, SVG `<use>`, 외부 URL과 `//host/x`, `<a href>`, 프레임 0개 캔버스, 이름·경로에 공백과 유니코드가 있는 캔버스와 자산(percent-escape된 href), 하위 디렉터리 캔버스.
  - 거절 경우: repo 밖 `..`, 앞 `/`, scope 밖(직접과 CSS 안 `url()`), 링크된 `.doan/assets`, `.doan/config.json`·`.doan/comments/` 참조, 없는 직접 참조, 로컬 iframe, `doan:width` 없음·틀림.
  - 그대로 두는 경우: CSS 안 없는 `@import`·`url()`.
  - 새 스키마는 없다(design.md '형식 변경').
  - 검증: `go test ./...`에서 fixture를 만드는 helper 테스트가 green.

── commit: `test(export): seed repository fixtures` ──

## T. 순수 함수 (`/tdd` → `/implement`)

- [ ] T2. Go `classifyRef`, `resolveAsset`(`repo.Resolve`·`repo.Scope` 재사용, 링크된 기본 디렉터리에서 scope와 export 결과를 함께 확인 — POSTMORTEM 2026-10-31 Prevention, CSS 안 참조의 없음·범위 밖 구분), `dataURI`(MIME 표 고정, 텍스트 percent-encoding, base64, `srcset`·CSS `url("…")`·HTML 속성 문맥별).
  - 검증: `go test ./...`, `go vet ./...`.
- [ ] T3. Go `rewriteCSS`(위치를 내는 lexer 사용, `ScanCSS` 결과 불변 — `canvas_test.go` green 유지), `rewriteHTML`(바꾸지 않은 바이트 보존, `<template>` 무시, `srcset`, `style` 속성, `//` → `https:`), `@import` 순환(조상 stack)과 diamond.
  - 검증: `go test ./...`, `go vet ./...`.
- [ ] T4. viewer 파일 `cli/internal/export/viewer/{shell.html,shell.css,lib.js,shell.js,measure.js}`와 `app/src/main/exportViewer.test.ts`. `assemble`의 `//go:embed`가 이 파일을 쓰므로 T5보다 먼저 한다.
  - `lib.js`의 `documentHeight`, `frameBottom`, `nextHeight`, `canScrollAxis`가 `canvasScript.ts`의 같은 함수 `toString()`과 같다(golden). 상수와 `fitScale`이 `viewport.ts`와 같다. 메시지 검증 함수의 입력 표.
  - 앱 Vitest가 Go MIME 표를 읽어 `server.ts` `TYPES`와 비교한다.
  - viewer 상태: 프레임 0개, 첫 `layout` 5초 timeout, drawer Esc 복귀, ⇧1·⇧0, `<noscript>`.
  - 검증: `npm --prefix app test`.
- [ ] T5. Go `assemble`(viewer embed, `srcdoc` escape, `lib.js`+`measure.js` 위치, 메타 JSON의 `<` 전체 escape), `sizeCheck`(50 MiB, 큰 자산 5개), 캔버스 인자 → 목록 path(절대·상대, 하위 디렉터리, 유니코드), 출력 경로의 `.doan` segment 판정.
  - 끝나면 seed fixture 캔버스 하나를 `assemble`한 결과 파일을 실제 Safari로 열어 `srcdoc` sandbox, data: `@import`·폰트, `postMessage`가 동작하는지 본다(design.md 'PoC 의존'). 안 되면 멈추고 지휘자에게 알린다.
  - 검증: `go test ./...`, `go vet ./...`, Safari 스크린샷(`.scratch/`).
- [ ] T6. TS 순수 함수.
  - renderer `trashBlock`: 앱 대화 작업 중·답 대기, project conversation drawing, 터미널 work, 다른 worktree의 같은 경로는 막지 않음(POSTMORTEM 2026-11-01).
  - renderer `canvasViewUpdate`의 `trashed` 분기: 같은 ID 캔버스가 하나 있어도 `moved`가 아니라 `clear`. 대기 중 목록에서 사라짐, `refused`면 표시를 거둠.
  - renderer 사이드바 `ownedFocus` 복구의 새 분기: 마지막 행 → 이전 행, 그룹이 비면 그룹 머리.
  - main `trashTarget`: 등록되지 않은 root, 목록에 없는 path, 하위 디렉터리 허용, `.html` 아님, 댓글 조건(ID 없음·틀림·중복·행 오류).
  - main `trashBusy`: 캔버스 대화 상태, project conversation 실행 중·`BIND_GRACE_MS` 안에서 evidence에 path 있음·없음, work 목록, 다른 root.
  - 검증: `npm --prefix app test`, `npm --prefix app run typecheck`.

── commit: `feat(export): asset resolution and rewriting` / `feat(export): viewer shell` / `feat(app): canvas trash rules` ──

## U. 셸(I/O)

- [ ] T7. `doan export` 명령(`cli/internal/cli/export.go`, `run.go`, `args.go` `-o`·`--force`).
  - 인자 확인 순서, 상대 `-o`는 현재 디렉터리 기준, `.doan` segment 출력 거절, 새 오류 코드 `export_refused`·`export_too_large`의 exit 2(`envelope.go` `ExitCode`), 이미 있는 출력은 `destination_exists`.
  - 임시 파일 + rename, 0644, 오류 뒤 임시 파일 없음, segment별 `Openat` `O_NOFOLLOW` 읽기, 결과 `{path, output, bytes, frames, external, links}`, `doan help` usage.
  - CLI 통합 테스트가 envelope를 검증하고 `result`를 깊게 비교한다. 결과 HTML과 `srcdoc`을 다시 스캔해, 남은 로컬 참조가 `links`에 있는 것과 CSS 안 없는 참조뿐인지 확인한다.
  - 검증: `go test ./...`, `go vet ./...`.
- [ ] T8. 가이드 `cli/internal/cli/skill.md`: `doan export` 한 줄, 부르는 때(사용자가 요청할 때만), `.doan/` 안에 쓰지 않기, `external`·`links`가 있으면 사람에게 말하기. `skill_test.go`, brand 테스트(`schema/fixtures/brand/cases.json`)가 green.
  - 검증: `go test ./...`.
- [ ] T9. app main.
  - `canvas:trashPlan`·`canvas:trash`: 경로 확인 1~5단계, 작업 중 재확인(`trashBusy`), 진행 중 집합, 캔버스 → 댓글 순서, `.doan/comments` `readdir` 바이트 비교, `shell.trashItem`.
  - `canvas:export`: 등록된 root·목록 행 확인, 저장 대화상자(`defaultPath`는 이름만), `runExport` 전용 타임아웃, 진행 중 집합, Show in Finder 경로 제한.
  - preload 메서드, `senderAllowed` 주 창 전용.
  - main 단위 테스트(`trashItem`·CLI·대화상자 주입): 저장 대화상자 취소는 CLI·토스트 없음, CLI 없음·envelope 아님·비정상 종료·타임아웃은 실패 응답과 진행 중 집합 해제, `trashItem` 실패는 `refused failed`이고 댓글은 건드리지 않음, 댓글만 실패는 `comments: "failed"`, 등록되지 않은 root·목록에 없는 path 거절(두 채널 모두), 중간 segment 링크 거절.
  - 검증: `npm --prefix app test`, `npm --prefix app run typecheck`.

── commit: `feat(cli): doan export` / `docs(skill): export a canvas on request` / `feat(app): move a canvas to Trash and export it` ──

## V. UI

- [ ] T10. `ShellSidebar.tsx` 캔버스 행 버튼과 메뉴, 삭제 Alert Dialog, 삭제 뒤 화면, Export 토스트, `styles.css`.
  - 메뉴: P2 확정 배치, `{kind, key}` `menu` 상태, `aria-disabled` 항목과 이유 줄, 메뉴가 열린 행이 사라지거나 잠기면 닫기, 잠긴 동안 버튼 `aria-disabled`.
  - 대화상자: App `modal`에 합류, `canvas:trashPlan` 답 전 확인 버튼 `aria-disabled`, 열린 사이 행이 사라지면 닫기, live `trashBlock`.
  - 삭제 뒤: Overview, 토스트 하나, 포커스(대화상자 닫힘 → 버튼, 행 제거 → `ownedFocus` 복구).
  - 실제 행 border-box 높이 32px 유지.
  - POSTMORTEM 2026-10-27 "Shell navigation shortcuts lost destination ownership and recovery access"의 `rg -n 'validHistoryVisit|showOverview\(|workspaceMemory.set|cancelWorkspaceOpen|aria-current|repairRoot'`로 새 경로(삭제 → Overview)가 source 메모리와 완료된 이동만 기록하는지 확인한다.
  - 검증: `npm --prefix app test`, `npm --prefix app run typecheck`, `npm --prefix app run build`. 테스트에 넣는 것:
    - `ShellSidebar.interaction.test.tsx`: Tab·Enter·Esc·포커스 복귀, 비활성 항목에 화살표로 닿고 `aria-describedby`가 이유 줄, 잠긴 동안 `aria-disabled`, 상태 자리의 접근 이름이 버튼이 보이는 동안에도 남음, 캔버스 메뉴가 열린 채 유지됨(프로젝트 메뉴 effect에 닫히지 않음).
    - 새 대화상자 컴포넌트 테스트: 처음 포커스 Cancel, Esc·Cancel은 아무것도 바꾸지 않고 버튼으로 포커스 복귀, `comments: false`면 댓글 문장 없음, 행이 사라지면 닫힘, 작업이 시작되면 확인 버튼 `aria-disabled`.
    - 정적 markup 테스트.

── commit: `feat(app): canvas row menu` ──

## W. 평가와 실제 앱 확인

- [ ] T11. `/agent-eval`: 새 export 시나리오(design.md '`/agent-eval`', id는 기존과 겹치지 않게)와 fixture·rubric, fake 없이 패키지된 CLI로 실제 round. 삭제는 CLI가 없어 시나리오가 없다.
  - 검증: `node --test 'eval/**/*.test.ts'`, `node eval/run.ts --self-test --scenarios <새 id>`가 `self-test PASS`·exit 0, `npm --prefix app run package` 뒤 `node eval/run.ts --scenarios <새 id> --agents claude,codex`에서 둘 다 통과, 결과를 `docs/USABILITY-EVAL.md`에 적는다.
- [ ] T12. `/design-sync`: 캔버스 행 버튼·메뉴·Alert Dialog·토스트를 초안과 computed style로 비교하고, viewer shell은 `doan export`로 만든 결과 파일을 같은 Electron에서 열어 초안과 비교한다. 측정값을 `docs/DESIGN.md`에 적는다.
  - 검증: 측정 로그(`node .scratch/design-sync/<screen>/measure.mjs`), DESIGN.md 갱신.
- [ ] T13. `/runtime-test`: 격리 앱(임시 HOME·userData·repo)에서 확인한다. 휴지통 probe는 임시 repo의 임시 파일만 옮긴다.
  - (a) 열린 캔버스를 Move to Trash → Overview, 토스트 하나, 파일과 댓글 파일이 임시 repo에서 빠짐, Back이 지운 캔버스를 건너뜀, 임시 repo의 `git status`에 추적 파일 삭제로 보임(Doan이 git을 부르지 않음).
  - (b) 같은 ID를 쓰는 두 캔버스 중 하나를 지워도 다른 쪽으로 따라가지 않음.
  - (c) 앱 대화 작업 중·터미널 `doan work start` 중 Move to Trash 비활성.
  - (d) Export → 저장 → 결과 파일을 네트워크 없이 Electron의 Chromium으로 열어 `doan:width` 폭으로 프레임·폰트·이미지가 보이고 drawer·확대가 동작.
  - (e) 같은 결과 파일을 실제 Safari로 열어 (d)와 같은 것을 확인한다(Playwright WebKit이 아니다). Firefox는 확인하지 않는다(BACKLOG).
  - (f) 휴지통으로 옮긴 임시 파일에 Finder Put Back이 되는지 기록한다(문구는 약속하지 않는다).
  - 검증: 스크린샷과 상태 로그(`.scratch/runtime-test/`, Safari는 스크린샷), real-state 비교 통과.

## Z. 승격과 정리

- [ ] Z1. 문서 승격(영어, 현재 규칙으로). terminal-agent-activity Z1과 같은 문단을 고치므로 지휘자가 함께 한다(착수 조건).
  - `docs/PRODUCT.md`:
    - §1·§2: repo 밖 사람에게 캔버스를 보이는 필요와, Doan 없이 결과 파일을 받는 사람.
    - §3 In scope: Export(1 Show 아래 또는 새 항목). Out of scope 5(export 파일은 사람이 보내는 공유 수단이고 서버·호스팅은 여전히 없다), 7(앱이 캔버스 파일에 하는 유일한 변경은 사람이 확인한 휴지통 옮기기다).
    - §5 item 1(캔버스 행 메뉴, 삭제 규칙, 작업 중 막기, 대화 처리), item 3 'Moved and duplicate canvases'(휴지통으로 보낸 캔버스는 같은 ID 캔버스로 따라가지 않는다는 예외)와 Export·viewer, item 5·11(댓글 파일은 사람이 확인한 휴지통 옮기기로만 빠진다; 에이전트는 여전히 지우지 않는다), CLI item 9 또는 새 항목(`doan export`).
  - `docs/ARCHITECTURE.md` §12(`doan export` 결과 모양, 새 오류 코드 exit 2, `destination_exists` 재사용), §3(viewer shell: srcdoc sandbox, CSP 상속 함정, embed 위치, 앱 보드에서 가져온 것과 버린 것, `lib.js` golden test), §7(`canvas:trashPlan`·`canvas:trash`·`canvas:export` IPC, 경로 확인, 확인과 실행 사이 한계, 삭제 뒤 화면의 `trashed` 표시, main의 작업 중 판정 근거), §11(device-local 변화 없음 확인).
  - `docs/DIRECTORY.md`(`cli/internal/export/`, `viewer/`), `docs/BACKLOG.md`(Firefox viewer 미확인, 로컬 iframe·JS import 미지원, kill된 export의 임시 파일, T13 (f)에서 Put Back이 안 되면 그 사실), README의 status·capabilities.
  - `docs/features/canvas-row-menu/` 삭제.
  - 검증: `node .agents/skills/verify/scripts/verify.mjs --eval` 통과, 사용자가 `/doc-check`를 돌릴 때 이 문서들에서 drift가 없다.

── commit: `docs: promote canvas-row-menu` (문서별로 나눈다) ──
