# app-shell — orch

- 원본: [spec.md](./spec.md) · [design.md](./design.md) · [tasks.md](./tasks.md)
- 시작 해시: `be80965` (main)
- 통합 브랜치: 배치 B0은 main(tasks.md 태스크 0). B0을 main에 통합한 뒤 main에서 `feat-app-shell`을 만들고, B1·B2부터 그 브랜치에 통합한다.
- 지휘: Claude Code(claude-opus-5-5). Orca orchestration Run으로 워커를 관리한다.

## 결정 로그

| 날짜 | 결정 | 근거 |
|---|---|---|
| 2026-10-21 | tasks.md의 '명령 미정' 명령을 이번 실행의 게이트로 허용한다: `npm --prefix app install --save-exact --save-dev electron@45.0.0 electron-vite@6.0.0 vite@8.3.4 playwright@1.64.1`, `npm --prefix app run build`, `npm --prefix app run e2e`, `go build -o <임시>/doan ./cli/cmd/doan`, `.scratch/poc4-serve/` 안의 `npm install`과 `node`로 Playwright 스크립트 실행. 새 worktree에서 기존 lock으로 `npm --prefix app ci`를 하는 것도 포함한다 | 사용자 |
| 2026-10-21 | B0(태스크 0)·B1(태스크 1)·B2(태스크 2)를 병렬로 돌린다. 태스크 3부터는 B0 통과 뒤에 띄운다. B0이 실패하면 B1·B2 결과를 통합하지 않고 보류한 채 다시 정한다 | 사용자 — 태스크 1·2는 PoC 결과(realpath API, Electron 버전)에 기대지 않는다 |
| 2026-10-21 | 워커는 Claude Code, 모델은 사용자 기본 설정을 따른다(`--model` 생략, 실행 뒤 `launch.effective`로 확인) | 지휘 판단 — AGENTS.md 모델 경계, Orca 지침(사용자가 모델을 지정하지 않으면 생략) |
| 2026-10-21 | 태스크 4·5를 배치 B4 하나로 묶는다 | 지휘 판단 — 태스크 4의 실제 화면 확인이 태스크 5이므로 리뷰를 한 번에 한다 |
| 2026-10-21 | 태스크 6(승격과 정리)은 지휘가 한다 | 지휘 판단 — orchestrate 5단계가 승격과 디렉터리 삭제를 지휘에게 둔다(mcp 실행과 같다) |
| 2026-10-21 | 병렬 배치는 각자 새 worktree에서 돈다 | 지휘 판단 — 커밋하는 워커가 같은 checkout을 쓰면 index가 겹친다 |
| 2026-10-21 | Q13을 다시 정한다: 서버는 범위 안 파일의 200 응답에만 `Access-Control-Allow-Origin: null`을 붙이고, 404와 다른 CORS 헤더는 보내지 않는다. design.md '로컬 서버'의 "CORS 헤더 없음"을 이것으로 바꿔 읽는다 | 사용자 — PoC 4에서 `null` origin iframe이 리포 안 폰트와 module 스크립트를 CORS로 버렸고, 이 헤더를 붙이면 둘 다 떴다. `.env` 등은 여전히 404 |
| 2026-10-21 | 서버는 `fs.promises.realpath`를 쓰고 디스크 철자로 바꾸는 별도 단계를 두지 않는다 | B0 관찰 — `fs.promises.realpath`·`fs.realpath.native` 둘 다 대소문자와 NFC·NFD를 디스크 철자로 돌려줬다. JS `fs.realpath`·`realpathSync`는 요청 철자를 유지하므로 쓰지 않는다 |
| 2026-10-21 | Electron 45.0.0을 유지한다 | B0 관찰 — Playwright 1.64.1 `_electron.launch`로 떴다 |
| 2026-10-21 | B1 소유를 `cli/internal/repo/find.go`까지 넓혀 `root`를 디스크 철자로 고친다. 철자 찾기가 실패하면(목록을 못 읽는 상위 디렉터리, NFC·NFD만 다른 이름) `EvalSymlinks` 결과를 그대로 쓴다 | 지휘 판단 — B1 리뷰 🟡1. spec 완료 조건 7(실제 절대 경로), ARCHITECTURE §12 경로 규칙 |
| 2026-10-21 | `folderState`의 CLI 오류는 `reason`(spawn 오류 메시지, 없으면 stderr 첫 줄)을 담고, `load`는 빈 문자열과 중복을 버린다 | 지휘 판단 — B2 리뷰 🟡1·⚪2 |
| 2026-10-21 | 404 응답은 `Content-Length: 0`을 보낸다 | 지휘 판단 — 본문 없는 404가 chunked로 나가지 않게 한다(B0 관찰) |
| 2026-10-21 | 서버는 realpath 결과를 macOS `O_NOFOLLOW_ANY`로 열고, 본문은 `fstat` 크기에서 끊는다. 시간 초과한 CLI 오류의 `reason`은 `timed out after 10 s`다 | 지휘 판단 — B3 리뷰 🟡1(판정과 열기 사이 링크 교체로 범위 밖 파일 200, 실측)·🟡2(전송 중 증가로 `Content-Length` 초과)·⚪1. 앱은 Mac 전용(PRODUCT) |
| 2026-10-21 | `folders.json`을 읽을 수 없으면 빈 목록으로 시작하고, 그 뒤 쓰기가 예전 파일을 덮어도 그대로 둔다 | 사용자 — 잃는 것은 연 폴더 목록뿐이고 다시 열면 된다 |
| 2026-10-22 | 폴더 열기의 cwd 실행이 실패하면 `doan ls --repo <고른 폴더>`를 한 번 더 실행해 목록이거나 `repo_not_found`가 아닌 실패일 때만 저장하고, 아니면 메시지 상자로 알린다 | 지휘 판단 — B4 자기 리뷰와 독립 리뷰 🟡1. 루트 판정을 Go에 맡긴다(POSTMORTEM) |
| 2026-10-22 | B4 리뷰의 제품 판단 3건(상위 init 뒤 하위 폴더, 창 닫기 = 종료, '폴더를 찾을 수 없음' 복구 안내)은 미룬다 | 사용자 — PRODUCT §8에 적었다 |
| 2026-10-21 | `build`·`dev`·`e2e` 스크립트와 `electron.vite.config.ts`는 B3가 아니라 B4가 만든다(tasks.md 태스크 3과 다름) | 지휘 판단 — 창이 생기기 전에는 확인할 수 없다 |

## 배치

| 배치 | 항목 | 파일 소유 | 전제 | 워커 모델 | 검증 게이트 | 상태 |
|---|---|---|---|---|---|---|
| B0 | 태스크 0 | `.scratch/poc4-serve/`, `docs/PRODUCT.md` §6 | 없음 | Claude Code(기본) | PRODUCT §6에 PoC 4 결과(날짜·Electron·Playwright 버전, realpath API 선택, 폰트·module 스크립트, `.env` 404) | 통과(ACAO `null` 재결정 뒤), main `cc164b6`·`efa5959`(워커 `6940af8`·`71dae98`), 2회 |
| B1 | 태스크 1 | `cli/internal/repo/scope.go`·`scope_test.go`, `cli/internal/cli/read.go`·`check.go`와 그 테스트 | 없음 | Claude Code(기본) | `go test ./...`, `go vet ./...`, 빨강 먼저 | 통과, `feat-app-shell` `80e1d96..1d0d1b7`, 리뷰 🔴0 🟡1 → 수정 1회 |
| B2 | 태스크 2 | `app/src/main/serve/`의 순수 함수와 테스트, `app/src/main/`의 `folderState`·`folders` 순수 함수와 테스트 | 없음 | Claude Code(기본) | `npm --prefix app test`, `npm --prefix app run typecheck`, 빨강 먼저 | 통과, `feat-app-shell` `adad338..2065722`, 리뷰 🔴0 🟡1 → 수정 1회 |
| B3 | 태스크 3 | `app/package.json`·`package-lock.json`·`tsconfig.json`·`vitest.config.ts`, vitest `globalSetup`, `app/src/main/`의 서버·CLI 실행·감시·`folders.json` 읽기·쓰기와 테스트 | B0 통과, B1·B2 통합 | Claude Code(기본) | `npm --prefix app test`(`DOAN_CLI` 없이), `npm --prefix app run typecheck`, 빨강 먼저 | 통과, `feat-app-shell` `efd3bc4..096a81a`, 리뷰 🔴1 🟡2 → 수정 1회 |
| B4 | 태스크 4, 5 | `app/electron.vite.config.ts`, `app/src/main/` 창·IPC·진입점, `app/src/preload/`, `app/src/renderer/`, `app/e2e/`, `app/package.json` 스크립트, `.agents/skills/runtime-test/`, `.claude/skills/runtime-test` | B3 통합 | Claude Code(기본), 리뷰 Opus high | `npm --prefix app test`, `typecheck`, `run build`, `run e2e`, 실제 `folders.json` 전후 같음, 깨뜨린 변형에서 e2e 실패 | 통과, `feat-app-shell` `6db7aab..0785988`, 리뷰 🔴0 🟡1 → 수정 1회 |
| 지휘 | 태스크 6 | `docs/ARCHITECTURE.md`, `docs/PRODUCT.md`, `docs/DIRECTORY.md`, `AGENTS.md`, `docs/features/app-shell/` 삭제 | B4 통합 | — | tasks.md 태스크 6의 grep, 디렉터리 없음 | 통과, 승격 커밋 뒤 이 디렉터리를 지운다 |

## 겹침과 순서

- B0·B1·B2는 서로 겹치는 파일이 없어 병렬로 돈다.
- B0 커밋은 main에 cherry-pick하고 push한다. 그 뒤 main에서 `feat-app-shell`을 만들고 B1·B2 커밋을 cherry-pick한다.
- B3는 B2가 만든 `app/src/main/` 순수 함수를 쓰고 B1의 `root`·`scope`가 있는 CLI로 테스트하므로 B0·B1·B2 통합 뒤에 `feat-app-shell`에서 띄운다.
- B4는 B3의 서버·실행기·감시를 창에 잇고, `app/package.json`을 B3에 이어 고치므로 직렬이다.
- 각 배치가 끝나면 독립 리뷰 워커가 `/code-review`를 하고, 🔴가 0이 될 때까지 배치 워커가 고친다.
