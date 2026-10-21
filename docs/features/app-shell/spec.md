# app-shell — spec

MVP 피처 4번(PRODUCT §5 피처 분할). Electron 뼈대를 만든다: 여러 폴더, 로컬 서버(서빙 범위), 파일 감시, 캔버스 목록. 실제 앱을 확인하는 루프(`/runtime-test` 스킬)와 앱을 조작할 도구도 이 피처에서 정한다.

## 사용자

- **사람**: Mac 앱에서 리포 폴더를 열고 캔버스 목록을 본다(PRODUCT §5 앱 1). 캔버스를 보는 화면(확대·축소, 프레임 이동)은 5번 `canvas-view`다.
- **에이전트**: `doan ls --json`(CLI와 MCP `ls` 도구)의 결과에 `root`와 `scope`가 늘어난다. 그 밖에는 이 피처를 직접 쓰지 않는다. 이 리포를 개발하는 에이전트는 `/runtime-test` 스킬로 실제 앱을 띄워 변경을 확인한다(개발용 스킬, 제품 스킬 아님).

## 문제

- `app/`에는 `formats`(검증과 접기) TypeScript 코드만 있고 앱이 없다. 사람은 캔버스를 볼 방법이 없다.
- 캔버스를 iframe으로 띄우려면 로컬 서버가 있어야 하는데(ARCHITECTURE §3), 서빙 범위·토큰 경로·`127.0.0.1` 바인딩이 구현되지 않았다. PRODUCT §6 PoC 4(로컬 서버 서빙 범위)도 통과하지 않았다.
- 앱 변경을 실제 앱에서 확인할 도구와 명령이 없다(PRODUCT §7: `/runtime-test`는 이 피처에서 도구를 정하고 만든다).

## 완료 조건

1. **PoC 4**(태스크 0): `.scratch/`의 최소 Electron 앱에서 PRODUCT §6 PoC 4 통과 기준을 확인하고 날짜와 함께 PRODUCT §6에 적는다. 허용 경로만 응답하고, 상대 링크가 풀리고, `sandbox="allow-scripts"` iframe 안의 스크립트가 보낸 `/.env` 요청은 실패하며 서버의 응답도 404다. 리포 안 폰트(`@font-face`)와 `<script type="module" src>`가 뜨는지도 적는다. Playwright `_electron.launch`로 PoC 앱이 뜨는지 확인한다.
2. **폴더 열기**: 사람이 폴더 열기 대화상자로 폴더를 여러 개 연다. 리포의 하위 폴더를 고르면 그 폴더에서 위로 찾은 리포 루트가 열린다(ARCHITECTURE §13 탐색 규칙). 같은 리포의 다른 worktree도 각각 다른 폴더로 열린다. 같은 리포 루트를 다시 열면 목록에 한 번만 남는다. 연 폴더 목록은 다시 실행해도 남는다(기계 로컬, ARCHITECTURE §10). 폴더를 목록에서 닫을 수 있다.
3. **캔버스 목록**: 연 폴더마다 캔버스 목록이 보인다. 항목은 경로, 제목, 열린 코멘트 수다. 목록은 앱이 찾은 `doan` CLI(`DOAN_CLI`, 없으면 `PATH`)의 `doan ls --json` 결과를 그대로 쓴다(Q1).
4. **초기화되지 않은 폴더·오류**: `.doan/config.json`이 없는 폴더는 "초기화되지 않음"과 사람이 터미널에서 칠 명령 `doan init`을 보여 준다. 설정이 깨졌으면 봉투의 `error.message`를 보여 준다. 연 폴더가 지워졌거나 옮겨졌으면 "폴더를 찾을 수 없음"을 보여 준다. 어느 경우에도 앱이 멈추거나 다른 폴더 목록이 사라지지 않는다.
5. **파일 감시**: 다음이 바뀌면 1초 안에 그 폴더의 목록이 다시 그려진다. `design/` 아래 캔버스의 추가·삭제·이름 바꾸기·내용 변경(제목), `.doan/config.json` 변경, `.doan/comments/`의 `.jsonl` 변경(열린 코멘트 수). `design/`이나 `.doan/`이 나중에 생기거나 지워졌다 다시 생겨도 감시가 이어진다.
6. **로컬 서버**: `127.0.0.1`의 임의 포트에만 붙고, `Host`가 그 주소가 아니면 404다. 실행마다 바뀌는 토큰 경로 `/t/<token>/<폴더 키>/…` 아래에서만 응답한다. 서빙 범위(`design/`, `tokenCss`, `serve`) 안의 파일만 리포와 같은 구조로 돌려준다. 그 밖, 토큰 불일치, `..`·인코딩된 구분자·NUL·리포 밖 심볼릭 링크, 리포 루트로 풀리는 범위 항목은 404다. CORS 헤더를 보내지 않는다.
7. **`doan ls`의 `root`와 `scope`**: `doan ls --json`의 `result.root`는 리포 루트의 실제 절대 경로다. `result.scope`는 서빙 범위의 실제 리포 상대 경로 배열이다. 범위 계산은 `doan check`의 `css_not_served` 판정과 같은 함수를 쓰고, 리포 루트(`.`)로 풀리는 항목은 빠진다. 같은 실제 경로는 한 번만, 바이트 순서로 담는다. 기존 `canvases`는 그대로이고, MCP `ls`도 같은 결과를 준다.
8. **`/runtime-test`**: `.agents/skills/runtime-test/SKILL.md`와 `.claude/skills/runtime-test` 링크가 있다. 스킬대로 하면 앱을 띄우고, 임시 리포를 열고, 목록에 캔버스가 보이고, 파일을 더하면 목록이 바뀌고, 서빙 URL로 캔버스를 받고 `.env`는 404임을 확인한다.
9. **테스트**: 순수 함수와 로컬 서버는 `npm --prefix app test`로, 타입은 `npm --prefix app run typecheck`로 확인한다. `go test ./...`·`go vet ./...`가 통과한다.

## 비목표

- 캔버스를 iframe에 띄워 보여 주기, 확대·축소, 프레임 목록과 이동, 라이브 리로드 — 5번 `canvas-view`.
- 선택, 인스펙터, `runtime.json`, 소켓, `doan active` — 6번 `select-inspect`.
- 코멘트 UI — 7번 `comments-ui`. 이 피처는 코멘트 파일이 바뀌면 목록의 코멘트 수만 다시 읽는다.
- 온보딩(CLI 설치, 에이전트 연결, 앱에서 `doan init` 실행), 앱 번들·서명·자동 업데이트 — 8번 `onboard-dist`.
- 디자인 초안을 따르는 UI. 4·5번은 디자인 초안 없이 최소 UI로 만든다(PRODUCT §5 Dogfooding).
- 제품 기능인 렌더 검사·스크린샷 — 미룸(PRODUCT §5 Deferred). `/runtime-test`가 남기는 확인용 스크린샷은 이와 별개다.
