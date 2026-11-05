# export-viewer-chrome — orch

- 원본: [spec](./spec.md)·[design](./design.md)·[tasks](./tasks.md), 초안 `.doan/canvases/export-viewer-chrome.html`(design '사용자 확정').
- 체인: [chain-261104](../chain-261104/chain.md) 링크 3(마지막). 상시 권한(자기 PR 병합, 멈추지 않고 진행)은 그 파일을 따른다.
- 시작 hash: `855d5c06`(main). 통합 브랜치: `feat/export-viewer-chrome-local`.

## 결정 기록

- **재시작(사용자, 2026-11-05)**: 링크 3은 다른 기기에서 시작했으나 그 지휘자와 연락이 끊겼다. 그 지휘자가 push한 것은 `origin/feat/export-viewer-chrome`의 orch.md 커밋(`89acf81f`)뿐이고 PR은 없다. 사용자는 이 기기에서 링크 3을 독립적으로 돌리기로 했다. 그래서 통합 브랜치를 `feat/export-viewer-chrome-local`로 따로 두고, `feat/export-viewer-chrome`과 이 지휘자가 만들지 않은 브랜치는 건드리지 않는다. 다른 기기의 지휘자가 먼저 export-viewer-chrome PR을 main에 병합하면 이 실행은 버린다. 그래서 통합 전·PR 전·병합 전마다 `origin/main`에 그 병합이 있는지 본다. 배치 구성은 그 지휘자의 orch.md를 참고했다.
- 열린 결정 없음. feature 문서가 모든 점을 정했다(design '사용자 확정'과 각 항목의 '사람의 결정').
- 작업자 모델: Claude만 쓴다(지휘자 판단). 이 기기의 `~/.codex/models_cache.json`에 orchestrate §0의 Astra·Sol id(`gpt-6-astra`, `gpt-6.1-sol`)가 없고, 링크 1·2도 Claude만 썼다. Codex 사용 범위: 없음.
- C1의 '명령 미정'(지휘자 판단): `.scratch/export-viewer-chrome/` 아래 Node probe가 `app/node_modules`의 `playwright`(1.64.1, 이미 있는 devDependency)로 이 브랜치 CLI(`go build -o <tmp>/doan ./cli/cmd/doan`)의 `doan export` 결과를 Chromium·WebKit에서 연다. 결과는 tasks.md C1에 적는다.
- Playwright 브라우저(사용자 승인): `app/`에서 `npx playwright install chromium webkit`으로 playwright 1.64.1이 쓰는 chromium-1248, webkit-2370을 내려받았다.
- C1은 구현 배치(VIEW)가 한다. 브라우저에서 찾은 결함을 같은 작업자가 바로 고치게 하기 위해서다. C2 측정은 통합 뒤 별도 작업자(SYNC)가, C3 `/verify --eval`과 Z1 승격은 지휘자가 통합 HEAD에서 한다.
- **먼저 병합(사용자, 시작 뒤)**: 이 실행이 main에 먼저 병합해, 다른 기기의 지휘자가 병합할 때 충돌로 멈추게 한다. 마지막에 체인 디렉터리는 지우지 않는다. 대신 링크 3 결과를 적는 커밋에서 chain.md 맨 위에 "링크 3은 이 재시작 실행의 PR로 끝났고, `feat/export-viewer-chrome`의 지휘자는 충돌 해결·rebase·force-push·병합 없이 멈추고 사용자에게 보고한다"는 안내를 넣는다. 체인 디렉터리는 사용자가 나중에 지운다. Z1의 feature 디렉터리 삭제는 그대로 한다. 게이트마다 `origin/feat/export-viewer-chrome`의 새 push·PR·병합을 보고, 보이면 사용자에게 알리고 계속한다(main에 병합됐으면 멈춘다).
- 로그인 정리: 공용 provider 프로필과 그 Keychain 항목은 다른 기기에 있다. 이 링크는 로그인이 필요 없으므로 마지막 링크의 로그인 정리를 건너뛰고, chain.md 인계 기록에 다른 기기에 남은 일로 적는다.

## 배치

| 배치 | 항목 | 파일 소유 | 선행 | 모델·effort와 이유 | 검증 gate | 상태 |
|---|---|---|---|---|---|---|
| VIEW | A1, B1, B2, C1 | `cli/internal/export/viewer/*`, `app/src/main/exportViewer.test.ts`, `cli/internal/export/assemble_test.go`(필요할 때), tasks.md A1·B1·B2·C1 줄, `.scratch/export-viewer-chrome/` | 없음 | Opus high — iframe 키 넘기기·Space 해제·포커스 규칙이 얽혀 있고 틀리면 Space가 눌린 채 남거나 캔버스 입력을 가로챈다 | `npm --prefix app test`, typecheck, `go test ./...`, `go vet ./...`, C1 probe | 완료(`4a98a70f`·`007f560a`·`c6970260`, worktree `evc-view`, dispatch `ctx_70ad3928cc85`) |
| 리뷰 | VIEW | 보고만 | VIEW 완료 | Opus medium — 앱 원본과의 복사 일치와 키 규칙을 대조해야 한다 | `/code-review` 보고 | 완료(r1 🔴0·🟡1·⚪4, 수정 r1 `ctx_6f2c9b7165f7`로 🟡1·⚪1·⚪2 해결) |
| SYNC | C2 | 초안 대비 viewer 수정(`shell.css`·`shell.html`), `docs/DESIGN.md` 측정값, tasks.md C2 줄, `.scratch/export-viewer-chrome/sync/` | VIEW 통합 | Opus medium — 측정·수정 반복이고 기준은 초안이 정한다 | 측정 보고, `npm --prefix app test`, `go test ./...` | 대기 |
| 지휘자 | C3, Z1 | 통합 HEAD, PRODUCT·ARCHITECTURE·DESIGN·BACKLOG, chain.md | SYNC 통합 | — | `verify.mjs --eval`, Z1 grep | 대기 |

## 겹침과 순서

- 모든 구현 항목이 같은 파일(`lib.js`, `exportViewer.test.ts`, `shell.*`)을 고쳐 VIEW 한 배치로 순서대로 한다. 병렬 배치는 없다.
- 리뷰는 VIEW 완료 뒤, SYNC는 VIEW 통합 뒤. SYNC와 VIEW 수정 라운드가 겹치면 SYNC를 기다린다(같은 파일).
- 통합 뒤 C3 `/verify --eval`, Z1 승격, PR, 병합, 체인 디렉터리 삭제.

## 진행 기록

- 2026-11-05 intake: tasks의 체크 항목은 모두 한 배치에 속한다(A1·B1·B2·C1 VIEW, C2 SYNC, C3·Z1 지휘자, U0 완료).
- 2026-11-05 VIEW 완료: C1 probe 52/52(Chromium·WebKit 각 26), `verify.mjs` PASS(`c6970260`), 파일당 +25,955 B. 클래식 스크롤바는 툴바 아래 5px 떨어져 겹치지 않는다. 실제 Safari·트랙패드·실제 창 전환의 Space 해제는 확인하지 못했다. 작업자는 수정 라운드를 위해 남겼다(retain).
- 2026-11-05 리뷰 r1(Opus medium): 🔴 0, 🟡 1 — 캔버스에서 넘어온 Esc가 tooltip만 닫고 Hand를 그대로 둔다(앱 `CanvasController.ts:778`은 바로 Select). ⚪1(probe의 `hasFocus` 복원)·⚪2(끄는 중 Esc·Space-up probe)를 함께 보냈다. VIEW 작업자 터미널 재사용은 Orca가 `agent_unconfigured`로 거절해, 작업자를 놓고 같은 worktree에 새 작업자(Opus medium, `ctx_6f2c9b7165f7`)를 띄웠다. 수정이 작아서 medium으로 했다.
- 2026-11-05 지휘자: Z1의 PRODUCT·ARCHITECTURE·BACKLOG 문안을 먼저 커밋했다(`cb6d0ea0`·`6d2097f0`·`5dabaee0`). DESIGN.md는 SYNC가 쓴 뒤 고친다.
- 2026-11-05 수정 r1 완료: 캔버스에서 넘어온 Esc는 `escapeTool`로 바로 Hand → Select(앱 `escape(false)`와 같다). 회귀 테스트 red→green, probe 58/58(Chromium·WebKit 각 29), 이전 빌드는 새 Esc 확인에서 실패, `verify.mjs` PASS. 파일당 +26,237 B. 🔴가 0이고 수정이 작아 리뷰를 다시 돌리지 않았다(지휘자 판단).
- 2026-11-05 VIEW 통합: `c436e1e2`·`2ee23db6`·`40ed33d2`·`9d45b895`·`dddb8853`을 `feat/export-viewer-chrome-local`에 cherry-pick했다. 통합 HEAD의 `/verify --eval`은 SYNC 통합 뒤 한 번 돌린다(작업자 gate와 겹치지 않게).
