# formats — design

## 영향 받는 구성 요소

- 형식: 코멘트 이벤트 · `.doan/config.json` · CLI 응답 봉투(세 스키마 모두 이 피처에서 처음 만든다)
- CLI(Go): 스키마 검증 + `parseLines` + `fold` 패키지
- 앱(TS): 같은 검증 + 같은 `parseLines` + `fold` 모듈
- `doan mcp` · 스킬: 봉투를 어떻게 쓸지는 3번 `mcp`에서 정한다

## 파일 배치 (Q1 확정, 2026-10-21)

```
schema/
  comment-event.v1.schema.json
  config.v1.schema.json
  cli-envelope.v1.schema.json
  fixtures/
    comment-event/{valid,invalid}/*.json
    config/{valid,invalid}/*.json
    cli-envelope/{valid,invalid}/*.json
    fold/<case>/{events.jsonl,expected.json}
```

TS·Go 코드 위치는 tasks 2에서 사용자 확인을 받아 정한다. 이 피처는 두 쪽에 "검증 + 접기" 모듈 하나씩만 둔다. 위치를 정할 때의 제약:

- Go `//go:embed`는 상위 디렉터리를 가리킬 수 없다. Go 모듈이 `schema/`를 포함하는 위치에 있거나, 복사 단계를 둬야 한다.
- JSON Schema draft와 TS·Go 검증 라이브러리를 함께 정한다. 두 라이브러리가 같은 판정을 내는지는 검증된 가정이 아니므로, tasks 3의 픽스처 판정이 그 검증이다. 라이브러리마다 다르게 구현될 수 있는 `format`에는 기대지 않고 `pattern`을 쓴다.

## 1. 코멘트 이벤트 (v1)

`.doan/comments/<캔버스 id>.jsonl`의 한 줄. 이벤트와 `target`(하위 객체 포함) 모두 `additionalProperties: false`다. 필드를 추가하면 `v`를 올린다.

공통 필드:

| 필드 | 형 | 설명 |
|---|---|---|
| `v` | `1` | 형식 버전 |
| `id` | string | 이벤트 id. `evt_` + 소문자 UUIDv4(Q2 확정, 2026-10-21). `pattern`으로 고정한다. 순서는 `at`이 정하므로 id에 시간이 필요 없다 |
| `at` | string | RFC 3339 UTC, 밀리초까지(`2026-10-21T10:02:00.000Z`). `pattern: ^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$`로 고정해 문자열 비교로 정렬할 수 있게 한다 |
| `type` | `create` · `edit` · `delete` · `resolve` · `reopen` | |
| `comment` | string | 코멘트 id. `cmt_` + 소문자 UUIDv4. `create` 이벤트가 정한다 |
| `by` | object | `{kind: "human", name, email?}` 또는 `{kind: "agent", name}` |

- 사람의 `name`은 필수, `email`은 선택이다. git config에 `user.email`이 비어 있을 수 있다. `name`도 비어 있을 때 앱이 어떻게 할지는 7번 `comments-ui`가 정한다.
- 에이전트의 `name`은 `pattern: ^[a-z0-9-]+$`인 문자열이다(`claude-code`, `codex` 등). 다른 에이전트도 CLI를 쓰므로(PRODUCT §2) enum으로 고정하지 않는다. ARCHITECTURE §2 문구 수정은 tasks 0.

`type`별 추가 필드:

- `create`: `body`(string, 비어 있지 않음), `canvasHash`(`sha256:<hex>` — 캔버스 파일 바이트), `target`
  - `target.frame`(선택): 프레임 id(`data-doan-frame`).
  - `target.element`(선택): `doanId`(선택), `selector`, `html`(outerHTML 조각, 최대 2,000 코드 포인트. 넘치면 서로게이트 쌍을 끊지 않고 잘라 저장하고 `element.truncated: true`를 둔다 — Q3 확정, 2026-10-21), `text`(텍스트 인용, 선택)
  - 둘 다 없으면 캔버스 코멘트, `frame`만 있으면 프레임 코멘트, `element`가 있으면 요소 코멘트다. 캔버스 규약(ARCHITECTURE §1)은 프레임을 강제하지 않는다.
- `edit`: `body`
- `delete` · `resolve` · `reopen`: 추가 필드 없음

`by.kind`별 허용 `type`은 스키마가 아니라 접기 규칙이 판정한다(아래). 스키마는 모양만 본다.

`body`·`html`·`text`는 데이터다(ARCHITECTURE §1 규칙 A). 앱은 이를 텍스트로만 표시하고 innerHTML로 넣지 않는다 — 7번 `comments-ui`로 넘기는 제약.

**쓰기 제약**: 앱과 CLI는 파일마다 `at = max(지금, 그 파일의 마지막 at + 1ms)`로 쓴다. 같은 밀리초에 쓴 연속 이벤트(`create` → `edit` 등)가 id 사전순 때문에 뒤집혀 orphan이 되는 것을 막는다. 구현은 2번 `cli-core`·7번 `comments-ui`.

## 2. 접기 (순수 함수 두 개 — `/tdd` 대상)

### `parseLines(text) → {events[], warnings[]}`

JSONL 텍스트를 줄 단위로 읽는다. 줄 번호는 물리적 줄 기준, 1부터 센다. 각 이벤트에 줄 번호를 붙여 돌려준다.

1. 공백뿐인 줄(끝 개행 포함)은 경고 없이 건너뛴다.
2. JSON 파싱에 실패하거나, 객체가 아니거나, `v`가 없거나 숫자가 아니면(`"1"` 포함) 버리고 경고 `invalid_event`.
3. `v`가 1이 아닌 숫자면 버리고 경고 `unknown_version`. 이 판정은 스키마 검증보다 먼저 한다.
4. v1 스키마에 맞지 않으면 버리고 경고 `invalid_event`.

### `fold(events[]) → {comments[], warnings[]}`

스키마 라이브러리에 의존하지 않고 상태만 만든다.

1. 이벤트 `id`로 중복 제거. 내용이 같으면(파싱 후 deep-equal) 하나로 합친다. 다르면 그 id의 이벤트를 모두 버리고 줄마다 경고 `conflicting_duplicate`.
2. `(at, id)` 오름차순 정렬 — 같은 `at`이면 `id` 사전순. 줄 순서는 쓰지 않는다.
3. 차례로 판정한다. 앞 단계에 걸리면 뒤 단계는 보지 않는다.
   1. **권한**: 에이전트가 `resolve` 외의 이벤트를 냈으면 무시 + 경고 `agent_not_allowed`. 사람은 다섯 가지 모두 낼 수 있다.
   2. **삭제됨**: 이미 지운 코멘트의 이벤트는 경고 없이 무시.
   3. **존재**: `create`인데 이미 있는 코멘트면 무시 + 경고 `duplicate_create`. `create`가 아닌데 코멘트가 없으면 무시 + 경고 `orphan_event`.
   4. **적용**(상태 전이):

| 이벤트 | 결과 |
|---|---|
| `create` | 코멘트 생성. `status: open`, `createdBy = by`, `createdAt = updatedAt = at` |
| `edit` | `body` 교체, `updatedAt = at`. `status`는 그대로 |
| `resolve` | open이면 `status: resolved`, `resolvedBy`·`resolvedAt` 기록. 이미 resolved면 경고 없이 무시(첫 값 유지) |
| `reopen` | resolved면 `status: open`, `resolvedBy`·`resolvedAt` 제거. 이미 open이면 경고 없이 무시 |
| `delete` | 코멘트를 지운 것으로 표시 |

`updatedAt`은 본문이 바뀐 시각이다. `resolve`·`reopen`은 바꾸지 않는다.

4. 지운 코멘트를 뺀 나머지를 `createdAt` → `comment` 순으로 정렬해 돌려준다.

### 출력 모양

- 접은 코멘트 하나: `{comment, status, body, target, canvasHash, createdBy, createdAt, updatedAt, resolvedBy?, resolvedAt?}`. 선택 필드는 없으면 키를 생략한다(`null`을 쓰지 않는다).
- 경고 하나: `{code, line, event?, comment?}`. `line`은 원인 이벤트의 줄 번호다. `event`·`comment`는 알 수 있을 때만 둔다.
- 경고는 `parseLines`와 `fold`의 것을 합쳐 `line` 오름차순으로 정렬한다. 같은 줄이면 `code` 사전순.
- 빈 목록은 `[]`다(`null`이 아니다). 빈 파일은 `{comments: [], warnings: []}`.

### 픽스처 비교

`expected.json`과 실제 출력을 각각 파싱해 deep-equal로 비교한다. 바이트 단위 비교는 하지 않는다. 키 순서, 이스케이프, 끝 개행은 비교에 영향을 주지 않는다. 배열 순서, 키 생략 여부, `[]`와 `null`의 차이는 비교에 영향을 준다.

## 3. `.doan/config.json` (v1)

| 필드 | 형 | 설명 |
|---|---|---|
| `v` | `1` | |
| `tokenCss` | string | 토큰 CSS 경로(리포 루트 기준, 선택). 토큰 CSS가 없는 리포는 생략한다. `doan check`의 미정의 변수·하드코딩 색 판정과 서빙에 쓴다 |
| `serve` | string[] | `design/` 밖에서 캔버스가 쓸 추가 서빙 경로(선택, 기본 `[]`). 파일 또는 디렉터리 경로이고 glob은 쓰지 않는다 |

- 모르는 필드는 오류로 본다(`additionalProperties: false`). 오타를 조용히 넘기지 않으려는 것이다.
- 스키마는 절대 경로와 `..` 세그먼트를 거부한다(서빙 범위 결정, ARCHITECTURE §3). 정규화·심링크 검사는 스키마로 할 수 없으므로 런타임(2번 `cli-core`·로컬 서버, PRODUCT §6 PoC 4)에 둔다.

## 4. CLI 응답 봉투

- 성공: `{v: 1, ok: true, result: <명령별>}`
- 실패: `{v: 1, ok: false, error: {code, message, nextSteps: string[]}}`
- `code`는 snake_case 문자열. MVP 목록과 종료 코드(Q4 확정, 2026-10-21):

| 종료 코드 | `error.code` | 뜻 |
|---|---|---|
| 0 | — | 성공 |
| 1 | `internal_error` | 버그·예상 밖 실패 |
| 2 | `usage_error` · `repo_not_found` · `invalid_config` · `unsupported_version` | 인자·플래그 오류, `.doan/config.json` 없음, config 스키마 위반, 모르는 `v` |
| 3 | `app_not_running` · `app_protocol_mismatch` | 앱이 필요한 명령인데 앱이 없음, 앱·CLI 프로토콜 불일치 |
| 4 | (봉투는 `ok: true`) | `doan check`가 돌았고 오류 등급 발견이 있음 — `result.findings` |

- exit 4의 봉투를 `ok: true`로 두는 이유: 명령은 제대로 돌았고, 에이전트가 고치려면 발견 목록이 `result`에 있어야 한다. `error`에는 findings를 담을 자리가 없다. ARCHITECTURE §12의 'check failed'는 종료 코드로 구분한다.
- 코멘트 접기 경고(`unknown_version` 등)는 실패가 아니라 `result.warnings`로 돌려준다.
- 에이전트는 종료 코드로 실패 종류를 가르고, `error.code`와 `nextSteps`로 구체적인 다음 행동을 고른다(예: 같은 2라도 `usage_error`는 인자 수정, `repo_not_found`는 `doan init`).
- 봉투에도 형식 버전 `v`를 둔다(Q5 확정, 2026-10-21 사용자). 세 형식 모두 `v`를 갖는다. ARCHITECTURE §12 수정은 tasks 0.

## 형식 변경

세 스키마 모두 새로 만든다(v1). 기존 형식이 없으므로 이전 호환은 없다.

## 규약 영향

없음. 캔버스 규약(ARCHITECTURE §1)은 건드리지 않는다.

## 결정 영향

- 추가만 하는 이벤트 · union 머지 · `at` 정렬 · 작성자 기록 · 형식 버전 `v`(ARCHITECTURE §2 'Comment storage')를 그대로 스키마와 접기 규칙으로 옮긴다.
- 수정·삭제는 사람만, 에이전트는 resolve만(PRODUCT §5)을 접기 규칙으로 강제한다. 에이전트의 `create`도 거부한다(PRODUCT §3 Out of scope: 코멘트는 사람 → 에이전트 단방향).
- 사람의 resolve를 허용한다(2026-10-21 사용자). PRODUCT §5·§7에는 "에이전트가 resolve, 사람이 reopen"만 있으므로 tasks 0에서 기록한다.
- 서빙 범위(ARCHITECTURE §3)를 config 경로 검증으로 강제한다.

## PoC 의존

- PRODUCT §6 PoC 5(`merge=union`): 이 피처의 삭제 이벤트·중복 제거 설계가 union 머지에 기댄다. 머지는 tasks 1에서 먼저 확인하고, 머지 결과를 접기 픽스처로 써서 tasks 6에서 접은 결과까지 확인한다.
