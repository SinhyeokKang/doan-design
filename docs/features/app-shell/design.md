# app-shell — design

## 영향 받는 구성 요소

- 앱(Electron + TS): 새로 만든다. main 프로세스(창, 폴더 목록 저장, CLI 실행, 로컬 서버, 파일 감시), preload(좁은 IPC), renderer(최소 UI: 폴더와 캔버스 목록).
- CLI(Go): `doan ls --json` 결과에 서빙 범위 `scope`를 더한다(Q2). 다른 명령은 그대로다.
- 형식: 스키마 변경 없음. `result` 모양은 ARCHITECTURE §12 산문이므로(§11 예외) `v`도 그대로다.
- `doan mcp`·스킬 본문: 변경 없음(`ls` 도구는 `cli.Run`을 부르므로 `scope`가 저절로 따라온다).
- 개발용 스킬: `.agents/skills/runtime-test/SKILL.md` + `.claude/skills/runtime-test` 링크.
- 의존성(app, 정확한 버전으로 고정): `electron` 45.0.0, `electron-vite` 6.0.0, `playwright` 1.64.1(dev). npm 레지스트리에서 2026-10-21에 확인한 최신이다.

## 코드 배치

```
app/electron.vite.config.ts      main·preload·renderer 빌드 (Q4)
app/src/main/                    창, IPC, 폴더 저장, CLI 실행, 서버, 감시
app/src/main/serve/              경로 판정(순수) + HTTP 서버(I/O)
app/src/preload/                 contextBridge로 좁은 API만 노출
app/src/renderer/                최소 DOM UI (프레임워크 없음, Q4)
app/e2e/                         /runtime-test가 쓰는 Playwright 스크립트 (Q5)
cli/internal/cli/read.go         ls 결과에 scope 추가 (Q2)
```

## 캔버스 목록 (Q1)

- 앱은 폴더마다 `doan ls --json --repo <폴더 실제 경로>`를 실행하고 봉투를 그대로 쓴다. TypeScript로 목록 규칙(`design/` 아래 `.html`, 점 파일·심볼릭 링크 제외, 경로 바이트 순서, 코멘트 수 접기)을 다시 구현하지 않는다. 근거: 온보딩 3단계가 번들 `doan init`을 부르는 결정(PRODUCT §7)과 같다. 두 구현이 갈라진 POSTMORTEM 2026-10-21 "TS and Go comment folding diverged"를 피한다.
- 봉투는 기존 `app/src/formats/validate.ts`의 CLI 봉투 검증을 통과해야 쓴다. 검증 실패·실행 실패는 그 폴더의 오류로 보여 준다.
- 상태: `ok: true` → 목록, `error.code == "repo_not_found"` → "초기화되지 않음"과 `doan init` 문장, 그 밖의 `ok: false` → `error.message`, CLI를 못 찾음·비정상 종료·봉투 검증 실패 → "doan CLI 오류"와 stderr 첫 줄.
- 실행할 때 stdin은 닫고(`ignore`) `--json`을 넘기므로 묻지 않는다.

## CLI 경로 (Q3)

- 개발 중에는 환경 변수 `DOAN_CLI`(절대 경로)를 쓰고, 없으면 `PATH`의 `doan`을 쓴다. 번들 안 경로로 바꾸는 일은 8번이다.
- 앱 실행 전에 `go build -o <임시>/doan ./cli/cmd/doan`으로 만든 바이너리를 `DOAN_CLI`로 넘긴다. 이 명령은 'Commands'에 없으므로 명령 미정이다.

## 서빙 범위 (Q2)

- `doan ls --json` 결과에 `scope: [{path, kind}]`를 더한다. `kind`는 `"dir"` 또는 `"file"`, `path`는 실제 리포 상대 경로(디스크 철자, `/`)다. 들어가는 것: `design`(디렉터리가 있을 때), 리포 안으로 풀리는 `tokenCss`, 리포 안으로 풀리는 `serve` 항목. 풀리지 않는 항목은 빠진다(`doan check`가 `token_css_not_found`로 알린다). `path` 바이트 순서로 정렬한다.
- 이렇게 하면 설정 읽기 순서(ARCHITECTURE §13)와 경로 해석(`repo.Resolve`)이 Go 한 곳에만 있다. 앱은 범위 목록을 받아 요청마다 판정만 한다.
- 범위는 목록을 다시 읽을 때(파일 감시) 함께 바뀐다.

## 로컬 서버

- main 프로세스의 Node `http` 서버 하나가 모든 폴더를 맡는다. `127.0.0.1`, 포트 0(OS가 고름). 토큰은 실행마다 `crypto.randomBytes(32)`의 hex.
- URL: `/t/<token>/<폴더 키>/<리포 상대 경로>`. 폴더 키는 폴더 실제 경로의 SHA-256 앞 16 hex다. 토큰이 다르거나, 폴더 키를 모르거나, 범위 밖이면 404(본문 없음)로 같게 답해 무엇이 틀렸는지 드러내지 않는다.
- 판정 순서:
  1. `parseServePath(pathname, token)`(순수): 접두사를 확인하고 세그먼트마다 퍼센트 디코딩을 한 번 한다. 빈 세그먼트, `.`·`..`, 디코딩 뒤 `/`·`\`·NUL이 든 세그먼트, 잘못된 퍼센트 인코딩은 거절한다. 쿼리와 해시는 URL 파서가 떼어 낸다.
  2. `realpath(폴더 루트 + 상대 경로)`: 없거나(`ENOENT`·`ENOTDIR`·`ELOOP`·`ENAMETOOLONG`) 실제 루트 밖이면(세그먼트 비교) 404.
  3. `inScope(realRel, scope)`(순수): 실제 상대 경로가 `file` 항목과 같거나 `dir` 항목 아래여야 한다(세그먼트 비교, `design2`는 `design` 아래가 아님).
  4. 일반 파일만 스트리밍한다. 디렉터리는 404(목록 없음).
- 대소문자: macOS에서 `DESIGN/A.CSS` 요청의 `realpath`가 디스크 철자를 돌려주는지는 PoC 4에서 확인한다(POSTMORTEM 2026-10-21 경로 항목). 돌려주지 않으면 범위 비교를 디스크 철자로 바꾸는 단계를 더한다.
- 응답 헤더: `Content-Type`은 확장자 표, `Cache-Control: no-store`, CORS 헤더 없음. `GET`·`HEAD`만 받는다.
- 이 피처에서는 서버를 렌더러 iframe에 쓰지 않는다. 5번이 쓴다. 이 피처는 서버와 그 테스트, PoC 4의 iframe 확인까지만 한다.

## 폴더 목록과 감시

- 연 폴더는 `app.getPath('userData')/folders.json`에 실제 경로 배열로 저장한다. 기계 로컬 파일이라 공유 형식(ARCHITECTURE §11)이 아니고 스키마를 두지 않는다. 읽을 수 없거나 깨졌으면 빈 목록으로 시작하고 앱은 뜬다. 같은 실제 경로는 한 번만 들어간다.
- 감시: 폴더 루트(비재귀, `design`·`.doan`이 생기는지), `design/`(재귀), `.doan/`(비재귀, `config.json`). Node `fs.watch`를 쓴다(macOS에서 재귀 감시 지원, 새 의존성 없음). 이벤트는 폴더마다 200ms 디바운스한 뒤 `doan ls`를 다시 실행한다. 실행 중에 이벤트가 오면 끝난 뒤 한 번 더 실행한다. `design/`이 생기면 감시를 다시 건다.
- 코멘트 파일(`.doan/comments/`) 감시는 7번이다. 다만 `ls`의 코멘트 수는 다음 다시 읽기 때 따라온다.

## Electron 보안 기본값

- 앱 창: `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`. preload는 `openFolder`, `closeFolder`, `onFolders` 정도만 노출한다. 렌더러 HTML에 CSP(`default-src 'self'`)를 둔다.
- 앱 창은 로컬 파일만 띄운다. 외부 탐색과 새 창은 막는다.

## 빌드와 UI (Q4)

- `electron-vite`로 main·preload·renderer를 빌드하고, 렌더러는 프레임워크 없이 DOM으로 그린다. 4·5번은 디자인 초안 없는 최소 UI이고(PRODUCT §5 Dogfooding), UI 프레임워크는 디자인 초안이 생기는 6번에서 정한다.
- `npm --prefix app test`(vitest)와 `typecheck`(tsc)는 그대로 쓴다. 앱 실행·빌드 명령은 'Commands'에 없어 명령 미정이다.

## `/runtime-test` (Q5)

- 도구: Playwright `_electron`(1.64.1 타입 정의에서 확인, "experimental" 표기). 스크립트로 앱을 띄우고, main 프로세스에서 평가하고, 렌더러 DOM을 읽고, 스크린샷을 남길 수 있다. 같은 Chromium 위에서 돌아서 5번 이후의 iframe 확인에도 쓸 수 있다.
- 폴더 열기 대화상자는 `electronApp.evaluate`로 `dialog.showOpenDialog`를 바꿔 끼워 임시 리포를 돌려준다. 제품 코드에 테스트 전용 경로를 두지 않는다.
- 스킬 본문: CLI 빌드 → 앱 빌드 → Playwright 스크립트 실행 → 결과(통과·실패, 스크린샷 경로) 보고. 스크립트는 `app/e2e/`에 두고, 확인 항목은 spec 완료 조건 7이다.
- 다른 후보: CDP를 직접 쓰면 Playwright가 해 주는 대기와 선택자를 다시 만들어야 한다. `computer-use`는 보이는 창과 사람의 화면이 필요해 자동 확인에 맞지 않는다.

## 순수 함수로 떼어 낼 부분 (`/tdd` 대상)

1. `parseServePath(pathname, token) → {folderKey, rel} | null`
2. `inScope(rel, scope) → boolean`
3. `folderState(result) → 목록 | 초기화되지 않음 | 오류`: CLI 실행 결과(종료 코드, stdout, stderr)를 받아 봉투 검증까지 한다.
4. `folders` 갱신: `add(list, realPath)`, `remove(list, realPath)`, `load(text) → list`(깨진 입력은 `[]`).
5. Go: `scope` 계산 함수(설정 + 해석 결과 → 정렬된 목록).

셸(I/O): HTTP 서버(임시 디렉터리 통합 테스트), CLI 실행, 감시와 디바운스, Electron 창과 IPC.

## 형식 변경

없음. `doan ls`의 `result`에 `scope` 키가 늘지만 `result`는 ARCHITECTURE §12 산문 계약이고 봉투 스키마는 `result`를 아무 값으로 둔다. `v`는 그대로다. TS와 Go가 함께 읽을 fixture는 늘지 않는다(TS는 `scope`를 만들지 않고 받기만 한다).

## 규약 영향

없음. 캔버스 규약, 에이전트 규칙, `doan check` 규칙은 그대로다.

## 결정 영향

- 서빙 범위(ARCHITECTURE §3): 결정대로 구현한다. `design/`·`tokenCss`·`serve`만, `127.0.0.1`, CORS 없음, 실행마다 바뀌는 토큰 경로. 범위 계산은 Go 한 곳(Q2), 요청 판정은 TS다.
- sandbox iframe: 이 피처에서는 PoC 4에서만 쓴다. 5번이 그대로 따른다.
- 토큰 처리 없음, git 작업 없음, 네트워크 없음: 앱은 git을 읽지도 실행하지도 않는다.
- 같은 코드: 목록은 CLI 결과를 쓴다(Q1, PRODUCT §7의 `doan init` 결정과 같은 근거).

## POSTMORTEM에서 가져올 것

- 2026-10-21 "TS and Go comment folding diverged": 목록과 설정 해석을 TS로 다시 만들지 않는다(Q1·Q2).
- 2026-10-21 경로 항목(`ENOTDIR`, NUL, 너무 긴 이름, 심볼릭 링크 고리, 대소문자, 끊긴 심볼릭 링크): 서버 테스트에 모두 넣는다. `DESIGN/A.CSS`와 `design/a.css`가 같은 파일로 판정되는지 확인한다.
- 2026-10-21 "A character device is not necessarily a terminal": CLI를 실행할 때 stdin을 `ignore`로 두고 `--json`을 넘긴다.
- 2026-10-21 `doan comments` 순서: 목록 순서는 CLI가 정한 그대로 두고 앱에서 다시 정렬하지 않는다.

## PoC 의존

PRODUCT §6 PoC 4(로컬 서버 서빙 범위). 태스크 0으로 먼저 한다. `.scratch/poc4-serve/`에 최소 Electron 앱과 서버를 만들어 확인한다.
- 허용 경로만 응답한다.
- 상대 링크(`../tokens.css` 같은)가 리포와 같은 구조로 풀린다.
- `sandbox="allow-scripts"` iframe의 스크립트가 보낸 `fetch('/.env')`(토큰 경로 안팎 모두)가 실패한다.
- `..`·`%2e%2e`·`%2f`·NUL·리포 밖 심볼릭 링크·대소문자 다른 요청의 결과를 적는다.

실패하면 태스크 1 이후는 멈추고 서빙 구조를 다시 정한다.

## 확정된 질문 (2026-10-21 사용자)

- Q1 캔버스 목록 출처: 번들 `doan ls --json`.
- Q2 서빙 범위 출처: `doan ls` 결과에 `scope`를 더한다.
- Q3 개발 중 CLI 경로: `DOAN_CLI` → `PATH`의 `doan`.
- Q4 빌드와 UI: `electron-vite` + 프레임워크 없는 DOM. UI 프레임워크는 6번에서 정한다.
- Q5 앱 조작 도구: Playwright `_electron`.
