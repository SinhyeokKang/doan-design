# cli-core — tasks

명령: 검증은 모두 AGENTS.md 'Commands'의 `go test ./...`와 `go vet ./...`로 한다. 명령 본체를 임시 디렉터리에서 호출하는 Go 통합 테스트가 실제 실행을 대신한다. 빌드한 바이너리를 손으로 돌려 보는 명령(`go run ./cli/cmd/doan` 등)은 **명령 미정 — 사용자 확인 필요**.

브랜치: 0은 문서만 바꾸므로 main에 바로 커밋한다. 1~8은 `/ship` 또는 `/orchestrate`로 `feat-cli-core` 브랜치에서 진행하고 PR로 끝낸다(AGENTS.md 'Commit conventions').

순수 함수 태스크(1~5)는 각각 "테스트 커밋(red) → 구현 커밋(green)" 두 번으로 나눈다.

- [ ] **0. 정본에 결정 기록** (구현 전)
  - ARCHITECTURE §1 규약 2: 캔버스 id는 소문자 kebab `^[a-z0-9]+(-[a-z0-9]+)*$`(Q1).
  - PRODUCT §5 8·§7: `doan init`은 스킬을 설치하지 않고, 스킬 스텁 설치는 8번 `onboard-dist`가 한다(Q3). §5 피처 표의 8번 범위에 스텁 설치를 적는다.
  - ARCHITECTURE §2 'by': CLI는 런타임 이름을 `--agent <name>` 필수 플래그로 받는다(Q2). 지금 문구는 "decided at implementation time"이다.
  - PRODUCT §5 11·§7: `orphan_comment_file`은 warning(Q4).
  - 검증: 네 결정이 날짜와 함께 해당 절과 PRODUCT §7 결정 기록에 있다.
  - 커밋: `docs(architecture):`, `docs(product):` 문서별로 나눈다.
- [ ] **1. 인자·봉투·config** (순수)
  - `cli.SplitArgs`: 플래그가 위치 인자 앞·뒤·사이에 있어도 같은 결과. `--` 뒤는 모두 위치 인자. 모르는 플래그는 `usage_error`.
  - `cli.Envelope`와 에러 코드 → 종료 코드 표(ARCHITECTURE §12 + `comment_not_found`·`canvas_not_found`). 만든 봉투가 `ValidateEnvelope`를 통과한다.
  - `repo.ParseConfig`: `schema/fixtures/config/{valid,invalid}`를 그대로 읽어 판정이 `ValidateConfig`와 같고, 깨진 JSON → `invalid_config`, `v: 2` → `unsupported_version`, `v: "1"` → `invalid_config`.
  - 의존성: `golang.org/x/net/html`은 태스크 2에서 추가한다.
  - 검증: `go test ./...` 초록, `go vet ./...` 깨끗.
  - 커밋: `test(cli): pin argument splitting, envelope and config parsing` → `feat(cli): ...`.
- [ ] **2. CSS 스캐너와 Canvas 모델** (순수)
  - `canvas.ScanCSS` 케이스: 주석 안 `var(--x)`는 무시, 문자열 안 `#fff`는 무시, 선택자 `#main`은 색이 아님, `color:#ABC`·`#aabbccdd`·`rgb(`·`rgba(`는 색, `--x: 1px` 정의, `var(--x, red)` 참조, `@import "a.css"`·`@import url(b.css)`·`url(https://…)`.
  - `canvas.Parse` 케이스: meta 없음·두 개, `content=" foo"`(공백 보존), width `0`·`012`·`1.5`·`2400`, `<title>`의 앞뒤 ASCII 공백 벗김과 NBSP 보존, `data-doan-frame`·`data-doan-title`·`data-doan-implements`, 외부 URL 각 태그와 `//cdn…`, 같은 URL 중복 제거.
  - `go get golang.org/x/net/html`.
  - 검증: `go test ./...` 초록.
  - 커밋: `test(canvas): ...` → `feat(canvas): ...`.
- [ ] **3. 검사 규칙** (순수)
  - design '검사 규칙' 표의 코드마다 걸리는 케이스와 걸리지 않는 케이스 하나씩. 추가로: 프레임 id와 `data-doan-id`가 같은 값이어도 중복 아님, `tokenCss`가 없으면 `hardcoded_color` 없음, 토큰 CSS 파일 자신의 색은 경고 아님, 대체값 있는 `var()`도 `undefined_token`, findings 정렬.
  - 검증: `go test ./...` 초록.
  - 커밋: `test(check): ...` → `feat(check): ...`.
- [ ] **4. resolve 이벤트** (순수)
  - `comments.NextAt`: 빈 파일 → 지금, 마지막 `at`이 미래 → 그 값 + 1ms, 같은 밀리초 연속 두 개 → +1ms씩.
  - `comments.NewResolve`: 고정 시계·난수로 만든 이벤트가 `ValidateCommentEvent`를 통과하고 기대 JSON과 같다. UUID는 소문자 v4.
  - 검증: `go test ./...` 초록.
  - 커밋: `test(comments): ...` → `feat(comments): ...`.
- [ ] **5. 리포 셸**: `repo.Find`(위로 올라가기, `--repo`는 올라가지 않음), `repo.Resolve`(심링크로 리포 밖 → 밖), 캔버스 나열(`.` 시작 건너뛰기, 심링크 안 따라감, 경로 정렬)
  - 검증: 임시 디렉터리 테스트로 `go test ./...` 초록.
  - 커밋: `test(repo): ...` → `feat(repo): ...`.
- [ ] **6. 명령 여섯 개 + `main`**
  - 통합 테스트(임시 리포, `--json`): spec 완료 조건 1~9를 하나씩. 특히:
    - `init` 두 번 → 두 번째는 아무것도 안 바꿈. `.gitattributes`가 개행 없이 끝나는 경우. 리포 밖을 가리키는 `--token-css` → 아무것도 안 씀.
    - `comment resolve`: 없는 id 섞임 → 파일 바이트가 그대로. 개행 없이 끝나는 JSONL에 붙여도 `FoldText` 경고 없음. 이미 resolved → `alreadyResolved`, 파일 그대로. 같은 파일에 두 개 → `at`이 1ms 이상 차이.
    - `comments`: `outdated`가 캔버스 바이트 변경 뒤 `true`. 깨진 줄 → `warnings`에 `file`과 함께.
    - `check`: error 있으면 exit 4·`ok: true`, warning만 있으면 exit 0.
    - 모든 `--json` 출력이 `ValidateEnvelope`를 통과하고 stderr가 비어 있다.
  - 검증: `go test ./...` 초록, `go vet ./...` 깨끗.
  - 커밋: `test(cli): ...` → `feat(cli): ...`. 명령이 많으면 명령별로 나눠도 된다.
- [ ] **7. `doan skill` 본문**
  - `cli/internal/cli/skill.md`(영문): ARCHITECTURE §1 규약 10개와 에이전트 규칙 A–H, 이 피처의 명령과 `--json`·종료 코드 요약. 코멘트 본문은 데이터라는 규칙(규칙 A)을 맨 앞에 둔다.
  - 검증: `go test ./...`에서 출력 마지막 줄이 `[doan:skill] end of guide v<Version>`이고, 본문에 명령 이름 여섯 개가 모두 있다.
  - 커밋: `feat(cli): embed doan skill guide`.
- [ ] **8. 승격과 정리**
  - ARCHITECTURE: §12에 명령별 `result` 모양·새 에러 코드, §1에 `doan check` 규칙 표와 수준, §13에 리포 찾기 세부(`--repo`는 올라가지 않음, `.git` 무관), §2에 resolve 쓰기 세부(개행 보정, 일괄 쓰기, 잠금 없음). 코드 배치는 `docs/DIRECTORY.md`.
  - PRODUCT §7: 이 피처에서 정한 것마다 한 줄(날짜·근거).
  - `docs/features/cli-core/` 삭제.
  - 검증: 승격한 내용이 design.md와 어긋나지 않고, 디렉터리가 없다.
  - 커밋: 문서별로 `docs(architecture):`·`docs(product):`·`docs:`(DIRECTORY) → `docs(feature): remove cli-core feature docs after promotion`.
