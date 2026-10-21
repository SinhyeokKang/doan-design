# app-shell — tasks

명령: 검증은 AGENTS.md 'Commands'의 `npm --prefix app test`·`npm --prefix app run typecheck`·`go test ./...`·`go vet ./...`·`go run ./cli/cmd/doan`으로 한다. 다음은 'Commands'에 없어 **명령 미정 — 사용자 확인 필요**다.

- 의존성 추가: `npm --prefix app install --save-exact electron@45.0.0 electron-vite@6.0.0`, `npm --prefix app install --save-exact --save-dev playwright@1.64.1`(네트워크 필요, Electron 바이너리 내려받기)
- 앱 빌드·실행: `npm --prefix app run build`, `npm --prefix app run dev`(스크립트는 태스크 3에서 만든다)
- CLI 바이너리: `go build -o <임시>/doan ./cli/cmd/doan`
- Playwright 스크립트 실행: `npm --prefix app run e2e`(태스크 5에서 만든다)

브랜치: 태스크 0은 `.scratch/` 실험과 PRODUCT §6 기록뿐이므로 main에서 한다(문서 커밋만). 1~6은 `/orchestrate`로 `feat-app-shell` 브랜치에서 하고 PR 하나로 끝낸다(승격 문서도 같은 PR).

- [ ] **0. PoC 4 로컬 서버 서빙 범위** (main, 코드 커밋 없음 · 완료 조건 1)
  - `.scratch/poc4-serve/`에 최소 Electron 앱(리포 `app/`과 별개 npm 프로젝트)을 만든다. 서버는 design의 '로컬 서버' 판정 순서를 그대로 따른다. 창은 토큰 경로의 캔버스를 `sandbox="allow-scripts"` iframe에 띄운다.
  - 임시 리포: `design/a.html`(→ `../tokens.css` 링크), `tokens.css`(설정의 `tokenCss`), `.env`, `src/secret.ts`, `design/link-out`(리포 밖을 가리키는 심볼릭 링크).
  - 확인: 허용 경로 200, 상대 링크로 토큰 CSS가 적용됨, iframe 스크립트의 `fetch('/.env')`·`fetch('/t/<token>/<key>/.env')`·`fetch('/t/<token>/<key>/src/secret.ts')` 실패, `..`·`%2e%2e`·`%2f`·`%00`·심볼릭 링크 밖·`DESIGN/A.HTML` 요청 결과.
  - 검증: PRODUCT §6 Results에 PoC 4 결과를 날짜·Electron 버전과 함께 적는다. 대소문자 요청에서 `realpath`가 디스크 철자를 돌려주는지 반드시 적는다. 실패하면 여기서 멈추고 보고한다.
  - 커밋: `docs(product): record PoC 4 results`.
- [ ] **1. `doan ls` 결과에 `scope`** (Go · 완료 조건 6)
  - `scope` 계산(순수): `design` 디렉터리 있음/없음, `tokenCss` 있음/없음/리포 밖/없는 파일, `serve`의 파일·디렉터리·없는 경로·심볼릭 링크로 리포 밖, 대소문자 다른 철자의 `serve` 항목, 정렬.
  - `cli.Run` 테스트: `doan ls --json`의 `result.scope`, 빈 리포에서 `scope: []`, 기존 `canvases` 출력은 그대로.
  - 검증: `go test ./...` 초록, `go vet ./...` 깨끗.
  - 커밋: `test(cli): pin ls serving scope` → `feat(cli): report serving scope in ls`.
- [ ] **2. 순수 함수** (TS · 완료 조건 3, 4, 6)
  - `parseServePath`: 정상, 토큰 불일치, 폴더 키 없음, 빈 세그먼트, `.`·`..`, `%2e%2e`, `%2f`·`%5c`, `%00`, 잘못된 퍼센트 인코딩, 퍼센트 인코딩된 한글 파일 이름, 끝의 `/`.
  - `inScope`: 파일 항목 일치, 디렉터리 아래, `design2`는 `design` 아래가 아님, 빈 범위.
  - `folderState`: `ok` 목록, `repo_not_found` → 초기화되지 않음, `invalid_config` → 메시지, 봉투 검증 실패, 종료 코드만 있고 stdout 빔(CLI 없음), stdout에 JSON 아닌 값.
  - `folders`: 추가(중복 무시), 삭제, 깨진 JSON·배열 아님·문자열 아닌 원소 → `[]`.
  - 검증: `npm --prefix app test` 초록, `npm --prefix app run typecheck` 통과.
  - 커밋: `test(app): pin serve path, scope, folder state and folders` → `feat(app): add pure shell helpers`.
- [ ] **3. 셸: 로컬 서버, CLI 실행, 감시** (I/O · 완료 조건 3, 4, 5, 6)
  - 의존성 추가(명령 미정 — 위). `app/package.json`에 빌드·실행 스크립트를 더한다.
  - 서버 통합 테스트(임시 디렉터리, 실제 `http` 요청): 범위 안 200과 `Content-Type`, 범위 밖 404, 토큰 불일치 404, `127.0.0.1`에만 붙음, CORS 헤더 없음, `HEAD` 200·`POST` 405 또는 404, 디렉터리 404, 리포 밖 심볼릭 링크 404, 끊긴 심볼릭 링크 404, 심볼릭 링크 고리 404, `ENOTDIR`(파일 아래 경로) 404, 너무 긴 이름 404, `DESIGN/A.CSS`(PoC 4 결과대로).
  - CLI 실행 테스트: 태스크 1의 바이너리를 `DOAN_CLI`로 넘겨 임시 리포에서 `folderState`가 목록을 돌려줌, `DOAN_CLI`가 없는 경로면 CLI 오류 상태.
  - 감시 테스트: 캔버스 추가·삭제·이름 바꾸기, `config.json` 변경, `design/`이 나중에 생김 → 1초 안에 다시 읽기 한 번 이상, 연속 이벤트는 합쳐짐.
  - 검증: `npm --prefix app test` 초록, `typecheck` 통과. CLI 실행 테스트는 `DOAN_CLI`가 없으면 건너뛰지 말고 실패한다(빌드 명령은 명령 미정 — 위).
  - 커밋: `test(app): pin local server, cli runner and watcher` → `feat(app): serve canvases locally and watch folders`.
- [ ] **4. Electron 창과 최소 UI** (UI · 완료 조건 2, 3, 4)
  - main: 창 생성(보안 기본값), 폴더 열기 대화상자, `folders.json` 읽기·쓰기, 폴더마다 감시와 `doan ls`, IPC. renderer: 폴더별 캔버스 목록(경로, 제목, 열린 코멘트 수), 초기화되지 않음·오류 표시, 폴더 닫기.
  - 검증: `npm --prefix app run typecheck` 통과, `npm --prefix app test` 초록, `npm --prefix app run build` 성공(명령 미정 — 위). 실제 화면 확인은 태스크 5.
  - 커밋: `feat(app): electron window with folder and canvas lists`.
- [ ] **5. `/runtime-test` 스킬과 Playwright 스크립트** (완료 조건 7)
  - `app/e2e/`에 Playwright `_electron` 스크립트: 앱 실행 → `dialog.showOpenDialog`를 바꿔 끼워 임시 리포 열기 → 목록에 캔버스 보임 → 파일 추가 뒤 목록 갱신 → 초기화되지 않은 폴더 표시 → 서빙 URL로 캔버스 200·`.env` 404 → 스크린샷.
  - `.agents/skills/runtime-test/SKILL.md`(영어)와 `.claude/skills/runtime-test` 심볼릭 링크.
  - 검증: `npm --prefix app run e2e`(명령 미정 — 위)가 통과하고 스크린샷 경로를 보고한다. 앱을 고의로 깨뜨린 변형(목록을 그리지 않게)에서 실패하는지 한 번 확인한다.
  - 커밋: `test(app): add electron runtime smoke` → `docs(skills): add runtime-test skill`.
- [ ] **6. 승격과 정리** (`feat-app-shell`, 같은 PR)
  - ARCHITECTURE §3: 로컬 서버 구현 세부(포트 0, 토큰 길이, URL 모양, 폴더 키, 판정 순서, 404 통일, 헤더, `GET`·`HEAD`만).
  - ARCHITECTURE §7: Electron·electron-vite 버전, 보안 기본값, 렌더러는 프레임워크 없음(6번에서 결정), 폴더 목록 저장 위치.
  - ARCHITECTURE §12: `doan ls`의 `scope`.
  - ARCHITECTURE §13: 앱이 여러 폴더를 여는 방식과 감시 범위.
  - ARCHITECTURE(새 하위 절 또는 §7): `/runtime-test` 도구(Playwright `_electron`)와 이유.
  - PRODUCT §6: PoC 4 결과(태스크 0에서 적음)를 확인한다. PRODUCT §7: Q1~Q5 결정과 PoC 4 결과로 바뀐 것.
  - `docs/DIRECTORY.md`: `app/src/main/`, `app/src/preload/`, `app/src/renderer/`, `app/e2e/`.
  - AGENTS.md 'Commands': 굳어진 앱 빌드·실행·e2e·CLI 빌드 명령.
  - 검증: 지우기 전에 grep으로 ARCHITECTURE에 `scope`, `/t/<token>`, `_electron`이 있는지 확인. 그 뒤 `docs/features/app-shell/`이 없다.
  - 커밋: 문서별 `docs(architecture): promote app-shell decisions`·`docs(product): record app-shell decisions`·`docs: list app directories`·`docs(agents): add app commands` → `docs(feature): remove app-shell feature docs after promotion`.
