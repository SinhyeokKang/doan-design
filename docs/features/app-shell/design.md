# app-shell — design

## 영향 받는 구성 요소

- 앱(Electron + TS): 새로 만든다. main 프로세스(창, 폴더 목록 저장, CLI 실행, 로컬 서버, 파일 감시), preload(좁은 IPC), renderer(최소 UI: 폴더와 캔버스 목록).
- CLI(Go): `doan ls --json` 결과에 `root`와 서빙 범위 `scope`를 더한다(Q2, Q6). 범위 계산은 `doan check`(`CheckInput`의 `Served`)와 같은 함수 하나로 옮긴다(Q7). 다른 명령의 출력은 그대로다.
- 형식: 스키마 변경 없음. `result` 모양은 ARCHITECTURE §12 산문이므로(§11 예외) `v`도 그대로다.
- `doan mcp`·스킬 본문: 변경 없음(`ls` 도구는 `cli.Run`을 부르므로 `root`·`scope`가 저절로 따라온다).
- 개발용 스킬: `.agents/skills/runtime-test/SKILL.md` + `.claude/skills/runtime-test` 링크.
- 의존성(app, 모두 devDependencies, 정확한 버전으로 고정): `electron` 45.0.0, `electron-vite` 6.0.0, `vite` 8.3.4(지금 lock에 간접 의존성으로 있는 버전, electron-vite peer `^6||^7||^8` 안), `playwright` 1.64.1. npm 레지스트리에서 2026-10-21에 확인했다. Electron 45.0.0은 2026-10-21에 나왔으므로 PoC 4(태스크 0)에서 Playwright `_electron.launch`로 뜨는지 확인하고, 실패하면 44.x로 내린다(Q8). electron 계열을 devDependencies에 두는 이유: 8번 패키징 도구가 `electron`이 dependencies에 있으면 거부한다.

## 코드 배치

```
app/electron.vite.config.ts      main·preload·renderer 빌드 (Q4)
app/src/main/                    창, IPC, 폴더 저장, CLI 실행, 서버, 감시
app/src/main/serve/              경로 판정(순수) + HTTP 서버(I/O)
app/src/preload/                 contextBridge로 좁은 API만 노출
app/src/renderer/                최소 DOM UI (프레임워크 없음, Q4)
app/e2e/                         /runtime-test가 쓰는 Playwright 스크립트 (Q5)
cli/internal/repo/scope.go       서빙 범위 계산 (ls·check 공유, Q7)
cli/internal/cli/read.go         ls 결과에 root·scope 추가 (Q2, Q6)
cli/internal/cli/check.go        Served가 공유 범위 함수를 쓰게 바꿈 (Q7)
```

- `app/tsconfig.json`의 `include`에 `e2e`와 `electron.vite.config.ts`를 더한다. `vitest.config.ts`에 `exclude: ['e2e/**']`를 두어 `npm --prefix app test`가 Electron을 띄우지 않게 한다.

## 폴더 열기 (Q6)

- 대화상자에서 고른 폴더를 작업 디렉터리로 두고 `--repo` 없이 `doan ls --json`을 실행한다. CLI가 위로 찾은 리포의 `result.root`(실제 절대 경로)를 폴더로 저장한다. `repo_not_found`이면 고른 폴더의 실제 경로를 그대로 저장하고 "초기화되지 않음"으로 보여 준다.
- 그 뒤 다시 읽을 때는 `--repo <저장한 경로>`를 쓴다(위로 찾지 않는다). 탐색 규칙은 Go 한 곳(ARCHITECTURE §13)에만 있다.
- 같은 저장 경로는 한 번만 들어간다. 그래서 같은 리포의 하위 폴더를 두 번 고르거나 심볼릭 링크 경로로 다시 골라도 하나다. worktree는 루트가 다르므로 따로 들어간다.

## 캔버스 목록 (Q1)

- 앱은 폴더마다 `doan ls --json --repo <저장한 경로>`를 실행하고 봉투를 그대로 쓴다. TypeScript로 목록 규칙(`design/` 아래 `.html`, 점 파일·심볼릭 링크 제외, 경로 바이트 순서, 코멘트 수 접기)을 다시 구현하지 않는다. 근거: 온보딩 3단계가 번들 `doan init`을 부르는 결정(PRODUCT §7)과 같다. 두 구현이 갈라진 POSTMORTEM 2026-10-21 "TS and Go comment folding diverged"를 피한다.
- 봉투는 기존 `app/src/formats/validate.ts`의 CLI 봉투 검증을 통과해야 쓴다. `ok: true`이면 `result`에 앱이 쓰는 필드(`root` 문자열, `scope` 문자열 배열, `canvases` 배열)가 있는지 최소한으로 확인한다. 예전 `doan`은 `root`·`scope`를 주지 않으므로 이 확인에서 걸린다.
- 상태:
  - 저장한 경로가 디렉터리로 없음(`ls` 실행 전에 셸이 확인) → "폴더를 찾을 수 없음". 목록에서 닫을 수 있다.
  - `ok: true`이고 최소 모양 통과 → 목록.
  - `error.code == "repo_not_found"` → "초기화되지 않음"과 터미널에서 칠 명령 `doan init`.
  - 그 밖의 유효한 `ok: false` 봉투(종료 코드 1·2) → `error.message`.
  - CLI를 못 찾음, 제한 시간 초과, 봉투가 없거나 검증·최소 모양 확인에 실패 → "doan CLI 오류"와 stderr 첫 줄.
- 실행할 때 stdin은 닫고(`ignore`) `--json`을 넘기므로 묻지 않는다. 제한 시간은 10초이고, 넘으면 프로세스를 죽이고 CLI 오류로 둔다. stdout은 크기 제한 없이 모은다(`execFile` 기본 `maxBuffer` 1 MiB를 쓰지 않는다. 캔버스가 많으면 정상 출력도 넘는다).

## CLI 경로 (Q3)

- 개발 중에는 환경 변수 `DOAN_CLI`(절대 경로)를 쓰고, 없으면 `PATH`의 `doan`을 쓴다. 번들 안 경로로 바꾸는 일은 8번이다.
- 앱 실행 전에 `go build -o <임시>/doan ./cli/cmd/doan`으로 만든 바이너리를 `DOAN_CLI`로 넘긴다. 이 명령은 'Commands'에 없으므로 명령 미정이다.
- 테스트는 `DOAN_CLI`에 기대지 않는다(Q9). vitest `globalSetup`이 `go build`로 임시 디렉터리에 바이너리를 만들어 테스트에 넘긴다. 그래서 `npm --prefix app test` 하나로 끝난다(`go`가 `PATH`에 있어야 한다).

## 서빙 범위 (Q2, Q7)

- `doan ls --json` 결과에 `scope: [string]`을 더한다. 항목은 실제 리포 상대 경로(디스크 철자, `/`)다(Q10, `kind` 없음).
- 계산은 `cli/internal/repo/scope.go`의 함수 하나가 맡고, `ls`와 `check`의 `Served`가 함께 쓴다. 지금 `check.go:35-70`의 규칙을 그대로 옮긴다: `design`과 `serve` 항목은 `repo.Resolve`로 리포 안으로 풀리면 들어가고, `tokenCss`는 리포 안의 일반 파일일 때만 들어간다. 풀리지 않는 항목은 빠진다(`doan check`가 `token_css_not_found` 등으로 알린다).
- 실제 경로가 리포 루트 `.`인 항목은 빠진다(Q11). 스키마는 `.` 리터럴만 막으므로(ARCHITECTURE §3), `design -> .`이나 `serve: ["assets"]`(`assets -> .`) 같은 심볼릭 링크를 거치면 리포 전체가 범위에 들어간다. `check`도 같은 함수를 쓰므로 이 경우 `css_not_served`를 낸다.
- 같은 실제 경로는 한 번만 남기고(`serve: ["design"]`, `serve`에 `tokenCss`와 같은 경로, 철자만 다른 같은 경로), 바이트 순서로 정렬한다.
- 판정 규칙은 `check`와 같다: 경로 `p`가 항목 `s`와 같거나 `s + "/"`로 시작하면 범위 안이다(`design2`는 `design` 아래가 아님). 파일 항목 아래 경로는 `realpath`에서 `ENOTDIR`이 나므로 판정까지 오지 않는다.
- `root`는 `repo.Find`가 돌려준 실제 루트의 절대 경로다.
- 범위는 목록을 다시 읽을 때(파일 감시) 함께 바뀐다. `design/`·`.doan/` 밖의 `serve` 경로는 감시하지 않으므로, 그 경로가 나중에 생기면 다음 다시 읽기 때 범위에 들어간다.

## 로컬 서버

- main 프로세스의 Node `http` 서버 하나가 모든 폴더를 맡는다. `127.0.0.1`, 포트 0(OS가 고름). 토큰은 실행마다 `crypto.randomBytes(32)`의 hex.
- URL: `/t/<token>/<폴더 키>/<리포 상대 경로>`. 폴더 키는 폴더를 열 때마다 만드는 무작위 값(`crypto.randomBytes(16)`의 hex)이고, main이 키 → 폴더 표를 들고 있다(Q12). 폴더를 닫으면 키도 지운다.
- 토큰이 다르거나, 폴더 키를 모르거나, 범위 밖이거나, 그 밖의 어떤 오류든 404(본문 없음)로 같게 답해 무엇이 틀렸는지 드러내지 않는다. `GET`·`HEAD`가 아닌 메서드도 404다.
- 판정 순서:
  0. `Host` 헤더가 `127.0.0.1:<port>`가 아니면 404(DNS rebinding 방어. 캔버스 스크립트는 `location`으로 토큰을 읽어 밖으로 보낼 수 있으므로 토큰만으로는 막지 못한다).
  1. `parseServePath(rawPath, token)`(순수): `req.url` 원본을 `?`·`#` 앞에서 잘라 넘긴다. `new URL()`은 `..`·`%2e%2e`를 미리 정규화하고 `\`를 `/`로 바꾸므로 쓰지 않는다. 접두사를 확인하고 세그먼트마다 퍼센트 디코딩을 한 번 한다. 빈 세그먼트, `.`·`..`, 디코딩 뒤 `/`·`\`·NUL이 든 세그먼트, 잘못된 퍼센트 인코딩은 거절한다.
  2. realpath(폴더 루트 + 상대 경로): 실패하면 404. 쓸 API(`fs.promises.realpath` 또는 `fs.realpath.native`)는 PoC 4에서 대소문자를 디스크 철자로 돌려주는 쪽으로 고른다.
  3. `relInside(realRoot, realPath)`(순수): 세그먼트로 비교해 루트 안이면 상대 경로, 밖이면 `null`(`/repo`와 `/repo2`는 다름, ARCHITECTURE §13) → 404.
  4. `inScope(rel, scope)`(순수): 위 판정 규칙. 밖이면 404.
  5. 2에서 얻은 실제 경로를 열고, 연 fd에 `fstat`을 해 일반 파일일 때만 스트리밍한다. 디렉터리 등은 404(목록 없음). 판정과 열기 사이에 링크가 바뀌어도 판정한 경로만 연다. 헤더를 보낸 뒤 스트림 오류가 나면 연결을 끊고, 프로세스는 죽지 않는다.
- 대소문자: 2에서 고른 API가 디스크 철자를 돌려주지 않으면 범위 비교를 디스크 철자로 바꾸는 단계를 더한다(POSTMORTEM 2026-10-21 경로 항목). NFC·NFD 한글 파일 이름도 PoC 4에서 함께 적는다.
- 응답 헤더: `Content-Type`은 확장자 표, `Cache-Control: no-store`, CORS 헤더 없음.
- 이 피처에서는 서버를 렌더러 iframe에 쓰지 않는다. 5번이 쓴다. 이 피처는 서버와 그 테스트, PoC 4의 iframe 확인까지만 한다.

## 폴더 목록과 감시

- 연 폴더는 `app.getPath('userData')/folders.json`에 저장 경로 배열로 둔다. 앱 이름을 `doan`으로 정해(`productName`) userData가 `~/Library/Application Support/doan/`이 되게 한다. ARCHITECTURE §4의 `runtime.json`과 같은 디렉터리다. 기계 로컬 파일이라 공유 형식(ARCHITECTURE §11)이 아니고 스키마를 두지 않는다.
- 읽을 수 없거나 깨졌으면 빈 목록으로 시작하고 앱은 뜬다. 쓸 때는 같은 디렉터리의 임시 파일에 쓰고 rename한다. 쓰다 끊겨도 이전 목록이 남는다. 쓰기가 실패하면 메모리의 목록으로 계속 돌고 앱은 멈추지 않는다.
- 감시: 폴더 루트(비재귀, `design`·`.doan`이 생기거나 지워지는지), `design/`(재귀), `.doan/`(비재귀, `config.json`과 `comments`가 생기는지), `.doan/comments/`(비재귀, `.jsonl`). Node `fs.watch`를 쓴다(macOS에서 재귀 감시 지원, 새 의존성 없음).
- `design/`·`.doan/`·`.doan/comments/`가 생기거나 지워지면 그 감시를 다시 건다. 그래서 초기화되지 않은 폴더에서 `doan init`을 한 뒤의 `config.json` 변경도 보인다.
- 이벤트는 폴더마다 200ms 디바운스한 뒤 `doan ls`를 다시 실행한다. 실행 중에 이벤트가 오면 끝난 뒤 한 번 더 실행한다.
- 코멘트 파일은 코멘트 수를 다시 읽기 위해서만 감시한다. 코멘트 UI는 7번이다.

## Electron 보안 기본값

- 앱 창: `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`. preload는 `openFolder`, `closeFolder`, `onFolders` 정도만 노출한다. sandbox preload는 ESM을 읽지 못하므로(`app/package.json`이 `"type": "module"`) preload는 CJS(`.cjs`)로 빌드한다.
- 렌더러 HTML의 CSP는 빌드에서 `default-src 'self'`다. electron-vite dev 모드는 렌더러를 dev 서버(http)에서 띄우므로 dev에서만 그 주소를 허용한다. iframe용 `frame-src`는 5번에서 연다.
- 앱 창은 빌드한 로컬 파일(dev에서는 electron-vite dev 서버)만 띄운다. 외부 탐색과 새 창은 막는다.

## 빌드와 UI (Q4)

- `electron-vite`로 main·preload·renderer를 빌드하고, 렌더러는 프레임워크 없이 DOM으로 그린다. 4·5번은 디자인 초안 없는 최소 UI이고(PRODUCT §5 Dogfooding), UI 프레임워크는 디자인 초안이 생기는 6번에서 정한다.
- `npm --prefix app test`(vitest)와 `typecheck`(tsc)는 그대로 쓴다. 앱 실행·빌드 명령은 'Commands'에 없어 명령 미정이다.

## `/runtime-test` (Q5)

- 도구: Playwright `_electron`(1.64.1 타입 정의에서 확인, "experimental" 표기). 스크립트로 앱을 띄우고, main 프로세스에서 평가하고, 렌더러 DOM을 읽고, 스크린샷을 남길 수 있다. 같은 Chromium 위에서 돌아서 5번 이후의 iframe 확인에도 쓸 수 있다.
- 폴더 열기 대화상자는 `electronApp.evaluate`로 `dialog.showOpenDialog`를 바꿔 끼워 임시 리포를 돌려준다. 제품 코드에 테스트 전용 경로를 두지 않는다.
- 앱은 임시 userData로 띄운다. 개발자의 실제 `~/Library/Application Support/doan/folders.json`을 읽거나 덮어쓰지 않는다(방법은 태스크 5에서 정한다).
- 스킬 본문: CLI 빌드 → 앱 빌드 → Playwright 스크립트 실행 → 결과(통과·실패, 스크린샷 경로) 보고. 스크립트는 `app/e2e/`에 두고, 확인 항목은 spec 완료 조건 2·3·4·8이다.
- 다른 후보: CDP를 직접 쓰면 Playwright가 해 주는 대기와 선택자를 다시 만들어야 한다. `computer-use`는 보이는 창과 사람의 화면이 필요해 자동 확인에 맞지 않는다.

## 순수 함수로 떼어 낼 부분 (`/tdd` 대상)

1. `parseServePath(rawPath, token) → {folderKey, rel} | null`
2. `relInside(realRoot, realPath) → rel | null`
3. `inScope(rel, scope) → boolean`
4. `folderState(result) → 목록 | 초기화되지 않음 | 오류`: CLI 실행 결과(종료 코드, stdout, stderr, 제한 시간 초과 여부)를 받아 봉투 검증과 최소 모양 확인까지 한다. "폴더를 찾을 수 없음"은 실행 전 셸이 정한다.
5. `folders` 갱신: `add(list, path)`, `remove(list, path)`, `load(text) → list`(깨진 입력은 `[]`).
6. Go: 범위 계산 함수(설정 + 해석 결과 → 중복 없는 정렬된 목록, `.` 제외). `ls`와 `check`가 함께 쓴다.

셸(I/O): HTTP 서버(임시 디렉터리 통합 테스트), CLI 실행, 감시와 디바운스, `folders.json` 읽기·쓰기, Electron 창과 IPC.

## 형식 변경

없음. `doan ls`의 `result`에 `root`·`scope` 키가 늘지만 `result`는 ARCHITECTURE §12 산문 계약이고, 봉투 스키마는 `result`를 아무 값으로 둔다(`schema/cli-envelope.v1.schema.json`). MCP 도구는 입력 스키마만 있다(`mcp.go`). `v`는 그대로다. TS와 Go가 함께 읽을 fixture는 늘지 않는다(TS는 `root`·`scope`를 만들지 않고 받기만 한다).

## 규약 영향

캔버스 규약과 에이전트 규칙은 그대로다. `doan check`의 `css_not_served` 규칙도 그대로이고, 범위 계산이 리포 루트(`.`)로 풀리는 항목을 빼게 되어 그 경우의 판정만 바뀐다(Q11).

## 결정 영향

- 서빙 범위(ARCHITECTURE §3): 결정대로 구현한다. `design/`·`tokenCss`·`serve`만, `127.0.0.1`, CORS 없음, 실행마다 바뀌는 토큰 경로. 범위 계산은 Go 한 곳(Q2, Q7), 요청 판정은 TS다. 리포 루트로 풀리는 항목 제외와 `Host` 검사를 더한다.
- CORS 없음: 리포 안 폰트·module 스크립트가 막히는지 PoC 4에서 확인한다(Q13). 막히면 멈추고 §3 결정을 바꿀지 정한다.
- sandbox iframe: 이 피처에서는 PoC 4에서만 쓴다. 5번이 그대로 따른다.
- 토큰 처리 없음, git 작업 없음, 네트워크 없음: 앱은 git을 읽지도 실행하지도 않는다.
- 같은 코드: 목록과 리포 탐색은 CLI 결과를 쓴다(Q1, Q6, PRODUCT §7의 `doan init` 결정과 같은 근거).

## POSTMORTEM에서 가져올 것

- 2026-10-21 "TS and Go comment folding diverged": 목록, 리포 탐색, 설정 해석을 TS로 다시 만들지 않는다(Q1·Q2·Q6). Go 안에서도 범위 계산을 하나로 둔다(Q7).
- 2026-10-21 경로 항목(`ENOTDIR`, NUL, 너무 긴 이름, 심볼릭 링크 고리, 대소문자, 끊긴 심볼릭 링크): 서버 테스트에 모두 넣는다. `DESIGN/A.CSS`와 `design/a.css`가 같은 파일로 판정되는지 확인한다.
- 2026-10-21 "A character device is not necessarily a terminal": CLI를 실행할 때 stdin을 `ignore`로 두고 `--json`을 넘긴다.
- 2026-10-21 `doan comments` 순서: 목록 순서는 CLI가 정한 그대로 두고 앱에서 다시 정렬하지 않는다. `scope` 정렬 테스트에 접두사 쌍(`design`, `design-x`, `design/…`)을 넣는다.

## PoC 의존

PRODUCT §6 PoC 4(로컬 서버 서빙 범위). 태스크 0으로 먼저 한다. `.scratch/poc4-serve/`에 최소 Electron 앱과 서버를 만들어 확인한다.
- 허용 경로만 응답한다.
- 상대 링크(`../tokens.css` 같은)가 리포와 같은 구조로 풀린다.
- `sandbox="allow-scripts"` iframe의 스크립트가 보낸 `fetch('/.env')`(토큰 경로 안팎 모두)가 실패하고, 서버 로그에 남은 그 요청의 응답 상태가 404다. CORS가 읽기를 막는 것만으로는 통과가 아니다.
- 리포 안 `@font-face` 폰트와 `<script type="module" src>`가 iframe에서 뜨는지 적는다(Q13).
- `..`·`%2e%2e`·`%2f`·NUL·리포 밖 심볼릭 링크·대소문자 다른 요청의 결과를 적는다. 대소문자는 `fs.promises.realpath`와 `fs.realpath.native` 둘 다로 확인하고, NFC·NFD 한글 파일 이름도 적는다.
- Playwright 1.64.1 `_electron.launch`로 Electron 45.0.0 PoC 앱이 뜬다(Q8).

실패하면 태스크 1 이후는 멈추고 서빙 구조를 다시 정한다. `_electron.launch`만 실패하면 Electron을 44.x로 내려 다시 확인한다.

## 확정된 질문 (2026-10-21 사용자)

- Q1 캔버스 목록 출처: 번들 `doan ls --json`.
- Q2 서빙 범위 출처: `doan ls` 결과에 `scope`를 더한다.
- Q3 개발 중 CLI 경로: `DOAN_CLI` → `PATH`의 `doan`.
- Q4 빌드와 UI: `electron-vite` + 프레임워크 없는 DOM. UI 프레임워크는 6번에서 정한다.
- Q5 앱 조작 도구: Playwright `_electron`.

`/feature-review`에서 정한 것(2026-10-21 사용자):

- Q6 하위 폴더: 고른 폴더에서 위로 찾은 리포 루트로 연다. 루트는 `doan ls` 결과의 `root`로 받는다.
- Q7 범위 계산: `check`와 `ls`가 Go 함수 하나를 함께 쓴다.
- Q8 Electron 45.0.0: 유지하고 PoC 4에서 `_electron.launch`를 확인한다. 실패하면 44.x.
- Q9 테스트용 CLI: vitest `globalSetup`이 `go build`로 만든다.
- Q10 `scope` 모양: 경로 문자열 배열, 같은 실제 경로는 하나.
- Q11 리포 루트로 풀리는 범위 항목은 뺀다.
- Q12 폴더 키: 폴더를 열 때마다 무작위.
- Q13 폰트·module 스크립트 CORS: PoC 4에서 확인하고, 막히면 그때 정한다.
- 코멘트 파일 감시는 이 피처에서 한다(코멘트 수 갱신만). 사라진 폴더는 "폴더를 찾을 수 없음"으로 보여 준다.
