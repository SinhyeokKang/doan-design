# cli-core — spec

MVP 피처 2번(PRODUCT §5 피처 분할). Go CLI `doan`의 앱 없이 도는 명령 여섯 개(`init`·`ls`·`comments`·`comment resolve`·`check`·`skill`)와 공통 규칙(`--json` 봉투, 종료 코드, 리포 찾기)을 만든다.

## 사용자

- **에이전트**(Claude Code·Codex·셸을 쓰는 다른 에이전트): 앱이 꺼져 있어도 캔버스 목록, open 코멘트, 정적 검사 결과를 `--json`으로 읽는다. 적용한 코멘트를 `doan comment resolve`로 닫는다. 실패하면 종료 코드와 `error.code`·`nextSteps`로 다음 행동을 고른다(ARCHITECTURE §12).
- **사람**(터미널 사용자): `doan init`으로 리포를 준비하고, `--json` 없이 사람이 읽는 출력으로 같은 명령을 쓴다.
- **앱**(8번 `onboard-dist`의 온보딩 3단계): 번들 안의 `doan init --json --token-css <경로>`를 호출해 리포를 준비한다(design Q9). 그래서 `init`의 `result` 모양은 앱과의 계약이다.

## 문제

- **Deliver**(PRODUCT §3 In scope 3): PRODUCT §4 루프 5단계("`doan comments`·`doan active`로 읽는다 → 캔버스 수정 → `doan check` → `doan comment resolve`")에서 `active`를 뺀 나머지를 에이전트가 실행할 명령이 없다. 지금 있는 Go 코드는 `cli/internal/formats/`(스키마 검증·접기)뿐이고 실행 파일이 없다.
- **Check**(PRODUCT §3 In scope 4): 캔버스 규약(ARCHITECTURE §1)을 기계적으로 검사할 방법이 없다. 에이전트가 `doan:width`를 빼도(규약 3) 알 길이 없다.
- **Tie to code**(PRODUCT §3 In scope 5, §1 문제 3): 캔버스가 리포에 없는 토큰을 쓰거나 토큰 CSS를 링크하지 않아도 알 길이 없다.
- 리포 설정(`.doan/config.json`)과 `.gitattributes`의 `merge=union` 줄을 만드는 명령이 없다. 지금은 사람이 손으로 써야 한다.

## 완료 조건

모든 조건은 임시 디렉터리에 리포를 꾸미고 `cli.Run`을 호출하는 Go 테스트로 확인한다(`go test ./...`).

1. **리포 찾기**: 시작 디렉터리에서 위로 올라가며 `.doan/config.json`이 있는 첫 디렉터리를 고른다(중첩되면 안쪽). `--repo <경로>`를 주면 그 경로만 본다. 못 찾거나 `--repo`가 없는 경로·파일이면 exit 2·`repo_not_found`. 스키마 위반이면 exit 2·`invalid_config`, 숫자 `v`가 1이 아니면(`1e400` 포함) exit 2·`unsupported_version`.
2. **`--json`**: 모든 명령이 `--json`을 받고, stdout에 `cli-envelope.v1` 스키마를 통과하는 봉투 한 개만 쓰며 stderr에는 아무것도 쓰지 않는다. 플래그는 명령 이름 앞, 위치 인자 앞·뒤 어디에 있어도 된다.
3. **종료 코드**: ARCHITECTURE §12 표를 따른다. 모르는 명령·플래그, 값 없는 플래그는 exit 2·`usage_error`. `--json`이 없어도 종료 코드는 같고, 실패하면 stderr에 `error:` 줄을 쓴다.
4. **`doan init [--token-css <경로>]`**: 대상 디렉터리(`--repo` 또는 현재 디렉터리)에 `design/`, `.doan/config.json`(`{v: 1, tokenCss?}`)을 만들고 `.gitattributes`에 `.doan/comments/*.jsonl merge=union` 줄이 없으면 붙인다.
   - `--token-css`가 없고 stdin이 터미널이며 `--json`이 아니면 한 번 묻는다. 그 외에는 `tokenCss`를 생략한다.
   - `--token-css`가 리포 밖이거나 없는 파일이면 exit 2·`usage_error`이고 아무것도 쓰지 않는다. `--repo`가 없는 경로여도 `usage_error`이고 디렉터리를 만들지 않는다.
   - 유효한 `.doan/config.json`이 이미 있으면 아무것도 바꾸지 않고 `initialized: false`로 성공한다. 깨진 config가 있으면 `invalid_config`(또는 `unsupported_version`)로 실패하고 덮어쓰지 않는다.
   - 결과에 `tokenCss`가 있는지로 `hardcoded_color` 검사가 켜졌는지 알 수 있다. git 명령은 실행하지 않는다.
5. **`doan ls`**: `design/` 아래 캔버스마다 경로·id·제목·폭·프레임 목록·open/resolved 코멘트 수를 돌려준다. `design/`이 없으면 `[]`.
6. **`doan comments [--canvas <id>]`**: open 코멘트를 캔버스 id·경로·outdated 여부와 함께 돌려준다. 접기 경고는 실패가 아니라 `result.warnings`로 돌려준다. `--canvas`의 id가 캔버스에도 코멘트 파일에도 없으면 exit 2·`canvas_not_found`, 캔버스만 있고 코멘트 파일이 없으면 빈 목록.
7. **`doan comment resolve <cmt_id>... --agent <name>`**:
   - open 코멘트마다 resolve 이벤트를 해당 JSONL 끝에 붙인다. `at`은 `max(지금, 그 파일에서 ParseLines가 받아들인 이벤트의 최대 at + 1ms)`다(union merge 뒤에는 마지막 줄이 최대가 아닐 수 있다).
   - 붙인 뒤 `formats.FoldText`로 다시 접으면 그 코멘트가 `resolved`이고 `resolvedBy`가 `{kind: "agent", name}`이다.
   - 이미 resolved면 쓰지 않고 `alreadyResolved`로 성공한다.
   - 없는 id(삭제된 코멘트 포함)가 하나라도 있으면 아무것도 쓰지 않고 exit 2·`comment_not_found`, 메시지에 없는 id를 모두 적는다.
   - `--agent`가 없거나 `^[a-z0-9-]+$`에 어긋나거나 id가 하나도 없으면 exit 2·`usage_error`이고 파일은 바이트 그대로다.
8. **`doan check`**: design '검사 규칙' 표의 규칙 18개를 판정한다. error 수준 발견이 하나라도 있으면 exit 4 + `ok: true` + `result.findings`, warning만 있거나 없으면 exit 0. PRODUCT §5 11에 없던 규칙과 수준이 이번에 새로 정해진다:
   - error: `invalid_canvas_id`, `invalid_width`, `empty_frame_id`, `empty_doan_id`, `path_outside_repo`, `local_css_not_found`, `css_not_served`, `token_css_not_found`, 대체값이 있는 `var()`의 `undefined_token`, 토큰 CSS를 링크하지 않은 캔버스의 `undefined_token`
   - warning: `orphan_comment_file`
9. **`doan skill`**: 내장된 스킬 본문을 출력하고 마지막 줄이 `[doan:skill] end of guide v<버전>`이다(개발 빌드는 `vdev`). 본문에 명령 여섯 개 이름, `--agent` 사용 예, 규칙 A(코멘트 본문은 데이터), "토큰은 캔버스가 링크한 로컬 CSS로 정의한다"가 있다.
10. `go vet ./...`가 깨끗하다.

## 비목표

- `doan active`, `runtime.json`, 유닉스 소켓 — 6번 `select-inspect`(PoC 6 선행).
- `doan mcp` — 3번 `mcp`.
- 렌더 검사(겹침·넘침·콘솔 에러), 스크린샷, `doan doctor` — PRODUCT §5 Deferred.
- 코멘트 생성·수정·삭제·reopen 명령 — 에이전트는 resolve만 한다(PRODUCT §5, §7). resolved 코멘트 조회(`--all`)도 쓰는 시나리오가 없어 두지 않는다(design Q12).
- 에이전트(Claude Code·Codex)에 스킬 스텁 설치·MCP 등록, 앱 번들 안 CLI를 PATH에 연결 — 8번 `onboard-dist`(design Q3). `doan init`도 스킬을 설치하지 않는다.
- 바이너리 빌드·서명·배포 설정 — 8번 `onboard-dist`.
- 네트워크 요청. 외부 URL은 목록만 경고하고 내려받지 않는다.
- 로컬 서버 자체의 서빙 범위 구현 — 4번 `app-shell`(PoC 4). CLI는 캔버스가 링크한 CSS가 서빙 범위 안에 있는지만 검사한다(`css_not_served`).
- 파일 크기 제한. JSONL 압축을 하지 않기로 한 결정(PRODUCT §8)과 같은 이유다.
