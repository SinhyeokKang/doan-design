# formats — design

## 영향 받는 구성 요소

- 형식: 코멘트 이벤트 · `.doan/config.json` · CLI 응답 봉투(세 스키마 모두 이 피처에서 처음 만든다)
- CLI(Go): 스키마 검증 + 이벤트 접기 패키지
- 앱(TS): 같은 검증 + 같은 접기 모듈
- `doan mcp` · 스킬: 영향 없음(봉투를 그대로 쓴다)

## 파일 배치 (Q1 확정, 2026-10-21)

```
schema/
  comment-event.v1.schema.json
  config.v1.schema.json
  cli-envelope.schema.json
  fixtures/
    comment-event/{valid,invalid}/*.json
    config/{valid,invalid}/*.json
    cli-envelope/{valid,invalid}/*.json
    fold/<case>/{events.jsonl,expected.json}
```

TS·Go 코드 위치는 `cli-core`·`app-shell`에서 정한다. 이 피처는 두 쪽에 "검증 + 접기" 모듈 하나씩만 둔다.

## 1. 코멘트 이벤트 (v1)

`.doan/comments/<캔버스 id>.jsonl`의 한 줄. 공통 필드:

| 필드 | 형 | 설명 |
|---|---|---|
| `v` | `1` | 형식 버전 |
| `id` | string | 이벤트 id. `evt_` + UUIDv4(Q2 확정, 2026-10-21). 순서는 `at`이 정하므로 id에 시간이 필요 없다 |
| `at` | string | RFC 3339 UTC, 밀리초까지(`2026-10-21T10:02:00.000Z`) |
| `type` | `create` · `edit` · `delete` · `resolve` · `reopen` | |
| `comment` | string | 코멘트 id. `cmt_` + UUIDv4. `create` 이벤트가 정한다 |
| `by` | object | `{kind: "human", name, email}` 또는 `{kind: "agent", name: "claude-code" \| "codex"}` |

`type`별 추가 필드:

- `create`: `body`(string, 비어 있지 않음), `canvasHash`(`sha256:<hex>` — 캔버스 파일 바이트), `target`
  - `target.frame`: 프레임 id(`data-doan-frame`). 필수.
  - `target.element`(선택 — 없으면 프레임 코멘트): `doanId`(선택), `selector`, `html`(outerHTML 조각, 최대 2,000자. 넘치면 잘라 저장하고 `truncated: true`를 둔다 — Q3 확정, 2026-10-21), `text`(텍스트 인용, 선택)
  - `target.point`(선택): 요소(없으면 프레임) 안의 정규화 좌표 `{x, y}`, 0–1. 핀을 놓을 자리.
- `edit`: `body`
- `delete` · `resolve` · `reopen`: 추가 필드 없음

`by.kind`별 허용 `type`은 스키마가 아니라 접기 규칙이 판정한다(아래). 스키마는 모양만 본다.

## 2. 접기 (순수 함수 — `/tdd` 대상)

`fold(events[]) → {comments[], warnings[]}`

1. `v`가 1이 아닌 이벤트는 버리고 경고 `unknown_version`.
2. 스키마에 맞지 않는 줄은 버리고 경고 `invalid_event`(줄 번호).
3. 이벤트 `id`로 중복 제거.
4. `(at, id)` 오름차순 정렬 — 같은 `at`이면 `id` 사전순. 줄 순서는 쓰지 않는다.
5. 차례로 적용:
   - `create`: 코멘트 생성, `status: open`. 이미 있는 `comment`면 무시 + 경고 `duplicate_create`.
   - `create` 전의 다른 이벤트는 무시 + 경고 `orphan_event`.
   - `edit`·`delete`·`reopen`을 에이전트가 냈으면 무시 + 경고 `agent_not_allowed`.
   - `edit`: `body` 교체, `updatedAt` 갱신.
   - `resolve`: `status: resolved`, `resolvedBy`·`resolvedAt` 기록. 이미 resolved면 그대로.
   - `reopen`: `status: open`, `resolvedBy`·`resolvedAt` 제거.
   - `delete`: 코멘트를 지운 것으로 표시. 이후 그 코멘트의 이벤트는 무시(경고 없음).
6. 지운 코멘트를 뺀 나머지를 `createdAt` → `comment` 순으로 정렬해 돌려준다.

접은 코멘트 하나의 모양: `{id, status, body, target, canvasHash, createdBy, createdAt, updatedAt, resolvedBy?, resolvedAt?}`.

픽스처 비교를 위해 출력 JSON은 키를 정렬하고 들여쓰기 2칸으로 직렬화한다. TS·Go 둘 다 이 직렬화를 쓴다.

## 3. `.doan/config.json` (v1)

| 필드 | 형 | 설명 |
|---|---|---|
| `v` | `1` | |
| `tokens` | string[] | 토큰 CSS 경로(리포 루트 기준). `doan check`의 미정의 변수·하드코딩 색 판정과 서빙에 쓴다 |
| `serve` | string[] | `design/` 밖에서 캔버스가 쓸 추가 서빙 경로(선택, 기본 `[]`) |

모르는 필드는 오류로 본다(`additionalProperties: false`) — 오타를 조용히 넘기지 않으려는 것이다. 경로는 리포 루트 밖(`..`)이나 절대 경로를 허용하지 않는다(서빙 범위 결정, ARCHITECTURE §3).

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

- 코멘트 접기 경고(`unknown_version` 등)는 실패가 아니라 `result.warnings`로 돌려준다.
- 에이전트는 봉투를 파싱하지 않고도 종료 코드만으로 다음 행동을 고를 수 있다.
- 봉투에도 형식 버전 `v`를 둔다(Q5 확정, 2026-10-21 사용자). 세 형식 모두 `v`를 갖는다.

## 형식 변경

세 스키마 모두 새로 만든다(v1). 기존 형식이 없으므로 이전 호환은 없다.

## 규약 영향

없음. 캔버스 규약(ARCHITECTURE §1)은 건드리지 않는다.

## 결정 영향

- 추가만 하는 이벤트 · union 머지 · `at` 정렬 · 작성자 기록 · 형식 버전 `v`(ARCHITECTURE §2 'Comment storage')를 그대로 스키마와 접기 규칙으로 옮긴다.
- 수정·삭제는 사람만(PRODUCT §5)을 접기 규칙으로 강제한다.
- 서빙 범위(ARCHITECTURE §3)를 config 경로 검증으로 강제한다.

## PoC 의존

- PRODUCT §6 PoC 5(`merge=union`): 이 피처의 삭제 이벤트·중복 제거 설계가 union 머지에 기댄다. 첫 태스크로 둔다.
