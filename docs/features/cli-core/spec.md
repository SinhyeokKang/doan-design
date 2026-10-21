# cli-core — spec

MVP 피처 2번(PRODUCT §5 피처 분할). Go CLI `doan`의 앱 없이 도는 명령 여섯 개(`init`·`ls`·`comments`·`comment resolve`·`check`·`skill`)와 공통 규칙(`--json` 봉투, 종료 코드, 리포 찾기)을 만든다.

## 사용자

- **에이전트**(Claude Code·Codex·셸을 쓰는 다른 에이전트): 앱이 꺼져 있어도 캔버스 목록, 코멘트, 정적 검사 결과를 `--json`으로 읽는다. 적용한 코멘트를 `doan comment resolve`로 닫는다. 실패하면 종료 코드와 `error.code`·`nextSteps`로 다음 행동을 고른다(ARCHITECTURE §12).
- **사람**(터미널 사용자): `doan init`으로 리포를 준비하고, `--json` 없이 사람이 읽는 출력으로 같은 명령을 쓴다.
- **doan 개발자**: 3번 `mcp`가 같은 코드를 MCP 도구로 감싼다(ARCHITECTURE §5). 명령 본체가 입출력과 분리돼 있어야 그대로 재사용할 수 있다.

## 문제

- PRODUCT §4 루프 5단계("`doan comments`·`doan active`로 읽는다 → 캔버스 수정 → `doan check` → `doan comment resolve`")에서 `active`를 뺀 나머지를 에이전트가 실행할 명령이 아직 없다. 지금 있는 Go 코드는 `cli/internal/formats/`(스키마 검증·접기)뿐이고 실행 파일이 없다.
- 캔버스 규약(ARCHITECTURE §1)을 기계적으로 검사할 방법이 없다. 에이전트가 `doan:width`를 빼거나 없는 토큰을 써도 알 길이 없다(PRODUCT §1 문제 3).
- 리포 설정(`.doan/config.json`)과 `.gitattributes`의 `merge=union` 줄을 만드는 명령이 없다. 지금은 사람이 손으로 써야 한다.

## 완료 조건

모든 조건은 임시 디렉터리에 리포를 꾸미고 명령 본체를 호출하는 Go 테스트로 확인한다(`go test ./...`).

1. **리포 찾기**: 현재 디렉터리에서 위로 올라가며 `.doan/config.json`을 찾는다. `--repo <경로>`를 주면 그 경로만 본다. 못 찾으면 exit 2·`repo_not_found`, 스키마 위반이면 exit 2·`invalid_config`, 숫자 `v`가 1이 아니면 exit 2·`unsupported_version`.
2. **`--json`**: 모든 명령이 `--json`을 받고, stdout에 `cli-envelope.v1` 스키마를 통과하는 봉투 한 개만 쓴다. 플래그는 인자 앞뒤 어디에 있어도 된다.
3. **종료 코드**: ARCHITECTURE §12 표를 따른다. 모르는 명령·플래그는 exit 2·`usage_error`.
4. **`doan init`**: 대상 디렉터리에 `design/`, `.doan/config.json`(`{v: 1, tokenCss?}`)을 만들고 `.gitattributes`에 `.doan/comments/*.jsonl merge=union` 줄이 없으면 붙인다. 이미 `.doan/config.json`이 있으면 아무것도 바꾸지 않고 성공한다. git 명령은 실행하지 않는다.
5. **`doan ls`**: `design/` 아래 캔버스마다 id·경로·제목·폭·프레임 목록·open/resolved 코멘트 수를 돌려준다.
6. **`doan comments`**: 기본으로 open 코멘트를 캔버스 id·경로·outdated 여부와 함께 돌려준다. `--all`이면 resolved도 포함하고, `--canvas <id>`로 좁힌다. 접기 경고는 실패가 아니라 `result.warnings`로 돌려준다.
7. **`doan comment resolve <cmt_id>... --agent <name>`**: open 코멘트마다 resolve 이벤트를 해당 JSONL 끝에 한 줄씩 붙인다. `at`은 `max(지금, 파일의 마지막 at + 1ms)`다. 붙인 뒤 `foldText`로 다시 접으면 그 코멘트가 `resolved`이고 `resolvedBy`가 `{kind: "agent", name}`이다. 이미 resolved면 쓰지 않고 성공한다. 없는 id가 하나라도 있으면 아무것도 쓰지 않고 실패한다.
8. **`doan check`**: design.md '검사 규칙' 표의 규칙을 전부 판정한다. error 수준 발견이 하나라도 있으면 exit 4 + `ok: true` + `result.findings`, warning만 있거나 없으면 exit 0.
9. **`doan skill`**: 내장된 스킬 본문을 출력하고 마지막 줄이 `[doan:skill] end of guide v<버전>`이다.
10. `go vet ./...`가 깨끗하다.

## 비목표

- `doan active`, `runtime.json`, 유닉스 소켓 — 6번 `select-inspect`(PoC 6 선행).
- `doan mcp` — 3번 `mcp`.
- 렌더 검사(겹침·넘침·콘솔 에러), 스크린샷, `doan doctor` — PRODUCT §5 Deferred.
- 코멘트 생성·수정·삭제·reopen 명령 — 에이전트는 resolve만 한다(PRODUCT §5, §7).
- 에이전트(Claude Code·Codex)에 스킬 스텁 설치·MCP 등록, 앱 번들 안 CLI를 PATH에 연결 — 8번 `onboard-dist`(design Q3). `doan init`도 스킬을 설치하지 않는다.
- 바이너리 빌드·서명·배포 설정 — 8번 `onboard-dist`.
- 네트워크 요청. 외부 URL은 목록만 경고하고 내려받지 않는다.
- 로컬 서버의 서빙 범위 검사 — 4번 `app-shell`(PoC 4). CLI는 자기가 읽는 경로가 리포 밖으로 나가지 않는지만 본다.
