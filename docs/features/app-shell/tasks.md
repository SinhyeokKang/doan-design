# app-shell — tasks

명령: 검증은 AGENTS.md 'Commands'의 `npm --prefix app test`·`npm --prefix app run typecheck`·`go test ./...`·`go vet ./...`·`go run ./cli/cmd/doan`으로 한다. 다음은 'Commands'에 없어 **명령 미정 — 사용자 확인 필요**다.

- 의존성 추가: `npm --prefix app install --save-exact --save-dev electron@45.0.0 electron-vite@6.0.0 vite@8.3.4 playwright@1.64.1`(네트워크 필요, Electron 바이너리 내려받기)
- 앱 빌드·실행: `npm --prefix app run build`, `npm --prefix app run dev`(스크립트는 태스크 3에서 만든다)
- CLI 바이너리: `go build -o <임시>/doan ./cli/cmd/doan`
- Playwright 스크립트 실행: `npm --prefix app run e2e`(태스크 5에서 만든다)
- PoC 4: `.scratch/poc4-serve/`에서의 `npm install`(Electron·Playwright)과 PoC 앱 실행 명령(태스크 0에서 정해 결과와 함께 적는다)

빨강 먼저: 태스크 1~3의 `test:` 커밋 시점에 새 테스트가 빨강이고, 실패 사유가 미구현(컴파일 오류 또는 기대값 불일치)인지 확인한다. 그 뒤 `feat:` 커밋에서 초록이 된다.

브랜치: 태스크 0은 `.scratch/` 실험과 PRODUCT §6 기록뿐이므로 main에서 한다(문서 커밋만). 1~6은 `/orchestrate`로 `feat-app-shell` 브랜치에서 하고 PR 하나로 끝낸다(승격 문서도 같은 PR).

- [ ] **0. PoC 4 로컬 서버 서빙 범위** (main, 코드 커밋 없음 · 완료 조건 1)
  - `.scratch/poc4-serve/`에 최소 Electron 45.0.0 앱(리포 `app/`과 별개 npm 프로젝트)을 만든다. 서버는 design의 '로컬 서버' 판정 순서를 그대로 따르고, 요청마다 경로와 응답 상태를 로그로 남긴다. 창은 토큰 경로의 캔버스를 `sandbox="allow-scripts"` iframe에 띄운다. iframe 스크립트의 `fetch` 결과는 `postMessage`나 콘솔로 모아 기록한다.
  - 임시 리포: `design/a.html`(→ `../tokens.css` 링크, module 스크립트 `design/a.js`), `tokens.css`(설정의 `tokenCss`, `@font-face`로 리포 안 폰트), `.env`, `src/secret.ts`, `design/link-out`(리포 밖을 가리키는 심볼릭 링크), NFC·NFD 한글 이름 파일.
  - 확인: 허용 경로 200, 상대 링크로 토큰 CSS가 적용됨, 폰트와 module 스크립트가 뜨는지. iframe 스크립트의 `fetch('/.env')`·`fetch('/t/<token>/<key>/.env')`·`fetch('/t/<token>/<key>/src/secret.ts')`가 실패하고 서버 로그의 응답 상태가 404인지. `..`·`%2e%2e`·`%2f`·`%00`·심볼릭 링크 밖·`DESIGN/A.HTML`·한글 이름 요청 결과. Playwright 1.64.1 `_electron.launch`로 이 앱이 뜨는지.
  - 검증: PRODUCT §6 Results에 PoC 4 결과를 날짜·Electron·Playwright 버전과 함께 적는다. `fs.promises.realpath`와 `fs.realpath.native`가 대소문자 요청에 디스크 철자를 돌려주는지 각각 적고, 서버가 쓸 API를 정한다. 허용 경로가 응답하지 않거나, `.env` 요청의 응답이 404가 아니거나, 폰트·module 스크립트가 막히면 여기서 멈추고 보고한다. `_electron.launch`만 실패하면 Electron 44.x로 다시 확인하고 그 버전을 적는다.
  - 커밋: `docs(product): record PoC 4 results`.
- [ ] **1. `doan ls` 결과에 `root`와 `scope`** (Go · 완료 조건 7, 6)
  - 범위 계산을 `cli/internal/repo/scope.go`의 함수 하나로 뽑고, `check.go`의 `Served`도 그 함수를 쓴다.
  - 범위 계산 테스트(순수): `design` 디렉터리 있음/없음/파일임, `tokenCss` 있음/없음/리포 밖/없는 파일/디렉터리(빠짐), `serve`의 파일·디렉터리·없는 경로·심볼릭 링크로 리포 밖, `design -> .`과 `serve` 항목이 심볼릭 링크로 `.`이 됨(빠짐), 중복(`serve: ["design"]`, `serve`에 `tokenCss`와 같은 경로, 대소문자만 다른 철자) → 하나, 접두사 쌍(`design`, `design-x`, `design/a.css`) 정렬.
  - `check` 테스트: 같은 입력에서 `css_not_served`의 판정이 `scope`와 일치, `design -> .`이면 `css_not_served`가 남. 기존 `check` 테스트는 그대로 초록.
  - `cli.Run` 테스트: `doan ls --json`의 `result.root`(실제 절대 경로, 하위 폴더에서 `--repo` 없이 실행해도 루트), `result.scope`, `design/`·`tokenCss`가 없는 리포에서 `scope: []`, 기존 `canvases` 출력은 그대로.
  - 검증: `go test ./...` 초록, `go vet ./...` 깨끗.
  - 커밋: `test(cli): pin ls root and serving scope` → `feat(cli): report repo root and serving scope in ls`.
- [ ] **2. 순수 함수** (TS · 완료 조건 3, 4, 6)
  - `parseServePath`: 정상, 토큰 불일치, 폴더 키 없음, 빈 세그먼트, `.`·`..`, `%2e%2e`, `%2f`·`%5c`, `%00`, 잘못된 퍼센트 인코딩, 퍼센트 인코딩된 한글 파일 이름, 끝의 `/`.
  - `relInside`: 루트 자체, 루트 아래, `/repo`와 `/repo2`, 루트 밖.
  - `inScope`: 파일 항목 일치, 디렉터리 아래, `design2`는 `design` 아래가 아님, 빈 범위.
  - `folderState`: `ok` 목록, `repo_not_found` → 초기화되지 않음, `invalid_config`·`unsupported_version` → 메시지, 봉투 검증 실패, 봉투 `v: 2` → CLI 오류, 종료 코드 0인데 `ok: false`, `ok: true`인데 `root`나 `scope`가 없음(예전 doan) → CLI 오류, 종료 코드만 있고 stdout 빔(CLI 없음), stdout에 JSON 아닌 값, 제한 시간 초과.
  - `folders`: 추가(중복 무시), 삭제, 깨진 JSON·배열 아님·문자열 아닌 원소 → `[]`.
  - 검증: `npm --prefix app test` 초록, `npm --prefix app run typecheck` 통과.
  - 커밋: `test(app): pin serve path, scope, folder state and folders` → `feat(app): add pure shell helpers`.
- [ ] **3. 셸: 로컬 서버, CLI 실행, 감시** (I/O · 완료 조건 2, 3, 4, 5, 6)
  - 의존성 추가(명령 미정 — 위). `app/package.json`에 빌드·실행 스크립트를 더한다. `tsconfig.json`의 `include`에 `e2e`·`electron.vite.config.ts`를, `vitest.config.ts`에 `exclude: ['e2e/**']`와 `go build`를 하는 `globalSetup`을 더한다.
  - 서버 통합 테스트(임시 디렉터리, 실제 `http` 요청): 범위 안 200과 `Content-Type`·`Cache-Control: no-store`, 범위 밖 404, 토큰 불일치 404, 모르는 폴더 키·닫은 폴더의 키 404, 서버를 두 번 띄우면 토큰이 다름, `127.0.0.1`에만 붙음, `Host`가 다르면 404, CORS 헤더 없음, `HEAD` 200·`POST` 404, 디렉터리 404, 리포 밖 심볼릭 링크 404, `design -> .` 리포의 `.env` 404, 끊긴 심볼릭 링크 404, 심볼릭 링크 고리 404, `ENOTDIR`(파일 아래 경로) 404, 너무 긴 이름 404, 권한 없는 파일(`EACCES`) 404, `DESIGN/A.CSS`(PoC 4 결과대로). `http.request({path})`로 원문 `..`·`%2e%2e`·`%2f`·`%5c`·`%00` 경로를 보내 404인지 확인한다. 응답 중 파일이 지워져도 서버 프로세스가 살아 있다.
  - CLI 실행 테스트: `globalSetup`이 만든 바이너리로 임시 리포에서 `folderState`가 목록을 돌려줌, 리포의 하위 폴더에서 `--repo` 없이 실행하면 `root`가 리포 루트, 없는 경로의 CLI → CLI 오류, 멈춘 가짜 CLI → 제한 시간 뒤 CLI 오류, 1 MiB를 넘는 stdout → 목록, 저장 경로가 없거나 파일 → "폴더를 찾을 수 없음"(CLI를 실행하지 않음).
  - `folders.json` 테스트: 임시 파일에 쓰고 rename, 쓸 수 없는 디렉터리면 오류를 돌려주되 메모리 목록은 유지.
  - 감시 테스트: 캔버스 추가·삭제·이름 바꾸기·내용 변경, `config.json` 변경, `.doan/comments/<id>.jsonl` 추가·변경, `design/`이 나중에 생김, `design/` 삭제 뒤 재생성, `.doan/`이 나중에 생긴 뒤 `config.json` 변경 → 각각 1초 안에 다시 읽기 한 번 이상, 연속 이벤트는 합쳐짐.
  - 검증: `npm --prefix app test` 초록(`DOAN_CLI` 없이, `go`만 `PATH`에 있으면 됨), `npm --prefix app run typecheck` 통과.
  - 커밋: `test(app): pin local server, cli runner and watcher` → `feat(app): serve canvases locally and watch folders`.
- [ ] **4. Electron 창과 최소 UI** (UI · 완료 조건 2, 3, 4)
  - main: 앱 이름 `doan`(userData가 `~/Library/Application Support/doan/`), 창 생성(보안 기본값, preload CJS, CSP), 폴더 열기 대화상자(하위 폴더면 `root`로 저장), `folders.json` 읽기·쓰기, 폴더마다 감시와 `doan ls`, IPC. renderer: 폴더별 캔버스 목록(경로, 제목, 열린 코멘트 수), 초기화되지 않음·오류·폴더를 찾을 수 없음 표시, 폴더 닫기.
  - 검증: `npm --prefix app run typecheck` 통과, `npm --prefix app test` 초록, `npm --prefix app run build` 성공(명령 미정 — 위). 실제 화면 확인은 태스크 5.
  - 커밋: `feat(app): electron window with folder and canvas lists`.
- [ ] **5. `/runtime-test` 스킬과 Playwright 스크립트** (완료 조건 2, 3, 4, 8)
  - `app/e2e/`에 Playwright `_electron` 스크립트. 앱은 임시 userData로 띄운다. 순서:
    1. `dialog.showOpenDialog`를 바꿔 끼워 임시 리포들을 연다. 정상 리포(제목과 열린 코멘트 1개가 있는 캔버스, `id`·`title`·`doan:width`가 없는 캔버스, 파싱할 수 없는 캔버스), 깨진 config 폴더, 초기화되지 않은 폴더, 정상 리포의 하위 폴더(→ 루트로 하나만), 심볼릭 링크 경로(→ 하나만), 같은 리포의 worktree 역할을 하는 두 번째 디렉터리.
    2. 각 폴더의 표시를 확인한다: 경로·제목·코멘트 수, `error.message`, "초기화되지 않음"과 `doan init`. 오류 폴더가 있어도 다른 폴더 목록이 남는다.
    3. 캔버스 파일을 더하면 목록이 바뀐다. 폴더 하나를 지우면 "폴더를 찾을 수 없음"이 된다.
    4. 서빙 URL로 캔버스 200, `.env` 404.
    5. 폴더 하나를 닫고 앱을 종료한 뒤 다시 실행하면 닫은 폴더는 없고 나머지 목록은 남는다.
    6. 스크린샷.
  - `.agents/skills/runtime-test/SKILL.md`(영어)와 `.claude/skills/runtime-test` 심볼릭 링크.
  - 검증: `npm --prefix app run e2e`(명령 미정 — 위)가 통과하고 스크린샷 경로를 보고한다. 실행 전후로 실제 `~/Library/Application Support/doan/folders.json`이 바뀌지 않는다. 앱을 고의로 깨뜨린 변형(목록을 그리지 않게)에서 실패하는지 한 번 확인한다.
  - 커밋: `test(app): add electron runtime smoke` → `docs(skills): add runtime-test skill`.
- [ ] **6. 승격과 정리** (`feat-app-shell`, 같은 PR)
  - ARCHITECTURE §3: 로컬 서버 구현 세부(포트 0, 토큰 길이, URL 모양, 무작위 폴더 키, `Host` 검사, 판정 순서, 리포 루트로 풀리는 범위 항목 제외, 404 통일, 헤더, `GET`·`HEAD`만, realpath API), PoC 4에서 확인한 폰트·module 스크립트 결과.
  - ARCHITECTURE §7: Electron·electron-vite·vite 버전, 보안 기본값(preload CJS, CSP), 렌더러는 프레임워크 없음(6번에서 결정), 앱 이름 `doan`과 `folders.json` 위치.
  - ARCHITECTURE §12: `doan ls`의 `root`와 `scope`, 범위 계산을 `check`와 공유.
  - ARCHITECTURE §13: 앱이 여러 폴더를 여는 방식(하위 폴더 → 루트), 감시 범위, 폴더 상태(폴더를 찾을 수 없음 등).
  - AGENTS.md 'Workflow': `/runtime-test`를 개발용 스킬 목록(10개)과 권장 흐름에서의 위치에 넣는다. 'Commands': 굳어진 앱 빌드·실행·e2e·CLI 빌드 명령.
  - PRODUCT §6: PoC 4 결과(태스크 0에서 적음)를 확인한다. PRODUCT §7: Q1~Q13 결정, 코멘트 파일 감시를 4번에서 한다는 것, PoC 4 결과로 바뀐 것, `/runtime-test` 도구(Playwright `_electron`)와 이유.
  - `docs/DIRECTORY.md`: `app/src/main/`, `app/src/preload/`, `app/src/renderer/`, `app/e2e/`, `cli/internal/repo/`의 범위 계산.
  - 검증: 지우기 전에 grep으로 새로 생기는 문자열이 있는지 확인한다. ARCHITECTURE에 `folders.json`, `Cache-Control: no-store`, `"root"`·`scope`가 든 `doan ls` 결과 모양, AGENTS.md에 `runtime-test`, PRODUCT에 `_electron`. 그 뒤 `docs/features/app-shell/`이 없다.
  - 커밋: 문서별 `docs(architecture): promote app-shell decisions`·`docs(product): record app-shell decisions`·`docs: list app directories`·`docs(agents): add runtime-test and app commands` → `docs(feature): remove app-shell feature docs after promotion`.
