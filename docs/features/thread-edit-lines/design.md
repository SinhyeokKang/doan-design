# 스레드 편집 줄 수 — design

## 영향 범위

- **app main** (`app/src/main/conversation/`): provider 정규화(`transport.ts`의 Claude·Codex, `acp.ts`), 이벤트 타입(`types.ts`), 히스토리 검사(`store.ts` `payload`/`parse`).
- **app renderer**:
  - `threadItems.ts`: 단계와 머리 합계를 접는다.
  - `turnStatus.ts`: `lastSeq` 계산과 마지막 행의 머리를 다시 만드는 부분이다(아래 '턴 인디케이터와 머리').
  - `ConversationThread.tsx`(`Steps`, activity 머리)와 `styles.css`.
  - 캔버스 패널(`CanvasConversationPanel.tsx`), Overview(`ProjectOverview.tsx`), 프로토타입 창이 같은 스레드 컴포넌트를 쓰므로 세 곳에 함께 적용된다.
- **CLI, 스킬, 캔버스 규약, 에이전트 안내**: 바뀌지 않는다. 그래서 `/agent-eval`은 해당하지 않는다. AGENTS.md 'Workflow'의 트리거(안내, CLI 출력, `doan check` 규칙, 스킬 stub)가 모두 바뀌지 않는다.
- **형식**: 대화 히스토리 JSONL(`<userData>/conversations/<id>.jsonl`)에 필드 하나와 이벤트 타입 하나가 추가된다. 아래 '형식 변경'에서 다룬다.

## 데이터 흐름

1. 편집이 시작되면 지금처럼 `activity`(kind `edit`)를 기록한다. edit activity에만 provider의 호출 id를 `callId`(선택)로 함께 남긴다. read, command, other에는 붙이지 않는다.
   - Claude Code: assistant 프레임 `tool_use` 블록의 `id`(`transport.ts:384`).
   - Codex: fileChange 항목의 `id`(`transport.ts:555-581`). 항목 하나가 경로마다 activity를 하나씩 만든다(`transport.ts:319-320`). 그래서 키는 `callId`와 원래 `change.path`의 쌍이다. renderer가 `step()`에서 만드는 표시용 경로가 아니라 이벤트에 저장된 원래 `path`로 매칭한다.
   - ACP: `toolCallId`(`acp.ts:205`). ACP는 이미 완료 시점에만 activity를 기록하므로 activity와 결과 이벤트가 연달아 나온다.
2. 편집이 적용된 것을 확인하면 `activity.result { callId, path?, lines: { added, removed } }`를 기록한다.
   - Claude Code:
     - user 프레임 `tool_result`(`transport.ts:430`)의 최상위 `tool_use_result`(`sdk.d.ts:6573`)에서 `structuredPatch`의 `+`/`-` 줄을 센다.
     - `TransportState`에 edit 도구의 id 집합을 따로 둔다. 지금의 `state.activities`에는 모든 도구 id가 들어 있기 때문이다. 프레임에 `tool_result`가 정확히 하나이고, 그 `tool_use_id`가 이 집합에 있을 때만 센다. 결과가 여러 개인 프레임은 어느 결과의 `tool_use_result`인지 알 수 없으므로 세지 않는다.
     - `is_error`인 결과와 패치가 없는 결과는 기록하지 않는다. 새 파일 Write에서 `structuredPatch`가 비어 있으면, `type: "create"`일 때 `content`의 줄 수를 추가 줄로 센다.
     - `userModified`, MultiEdit, `replace_all`의 실제 모양은 T0에서 확인한다.
   - Codex: `item/completed`의 fileChange가 `status: "completed"`일 때, 각 `changes[].diff`를 unified diff로 센다. `changes[].kind`는 객체이므로 `kind.type`(`add`/`delete`/`update`)을 읽는다(`fixtures/codex.json:51-53`). `add`·`delete`일 때 diff가 전체 내용인지 hunk인지는 T0에서 확인한다. `declined`·`failed`는 기록하지 않는다. 한 항목에 같은 경로가 두 번 나오면 결과 이벤트도 두 번 나오고, renderer가 더한다.
   - ACP:
     - `status === "completed"`인 갱신에서 `type: "diff"` 항목의 `oldText`(없으면 빈 파일)와 `newText`를 줄 단위로 비교해 센다.
     - diff content가 completed보다 먼저 온 갱신(상태 없음, `in_progress`)에 실릴 수 있다. 그래서 `AcpTool`에 마지막 diff content를 보관하고, 완료될 때 센다. 완료 뒤에 온 content-only 갱신은 지금처럼 버린다(`acp.ts:212-217`). 실제 순서는 T0에서 확인한다.
     - Copilot의 `rawInput` apply_patch 문자열은 적용 여부를 알려주지 않으므로 쓰지 않는다.
3. renderer는 키(`callId`, Codex는 `callId`+`path`)로 결과를 같은 턴의 단계에 붙인다. 같은 키의 결과가 여러 번 오면 더한다. 키가 맞는 activity가 없거나 다른 턴의 activity와 맞는 결과는 무시한다. 같은 activity 행의 줄 수를 더해 머리 합계를 만든다.
4. 턴이 끝난 뒤에 오는 결과는 생기지 않는다. 턴이 끝나면 transport(`transport.ts:336`, `:538`, `acp.ts:187`)와 service(`service.ts:693` `live.terminal`)가 이후 이벤트를 버린다. 그래서 Stop 순간 진행 중이던 편집에는 숫자가 없다(spec 완료 조건 4).

## 생산자 쪽 값 검사

`payload` 검사에 실패한 이벤트가 하나라도 있으면 `appendAll`이 예외를 던진다. 그러면 `receive`가 `failedPersistence`를 세우고 runner를 닫아(`service.ts:719`) 턴 전체가 끝난다. 그래서 정규화기는 저장소의 검사를 통과하는 값만 만든다.

- `callId`가 비어 있거나 길이 한도(`prompt.ts` `LIMITS.label`)를 넘거나 `\0`을 포함하면, `callId`를 생략하고 결과 이벤트도 만들지 않는다. 이 경우 단계는 지금처럼 숫자 없이 보인다. Cursor id에는 `\n`이 들어 있다(`fixtures/acp-cursor.json:147`). `\n`은 허용하고, 그 경우를 테스트로 고정한다.
- `activity.result.path`의 검사는 `activity`의 `path` 검사(`str`, `store.ts:124`)와 정확히 같다. 더 좁은 `LIMITS.path`를 쓰면 긴 경로 하나 때문에 턴이 끝난다.
- `added`/`removed`는 `Number.isSafeInteger`이고 0 이상이다. 세기 함수가 `null`을 내면 결과 이벤트를 만들지 않는다.

## 턴 인디케이터와 머리

- `turnStatus.ts:33`은 `canvas.drawn`을 뺀 모든 이벤트로 턴의 `lastSeq`를 올린다. stage는 `stage.seq >= lastSeq`일 때만 유효하다(`:67`). Claude `tool_result` 프레임과 Codex `item/completed`는 지금 이벤트를 만들지 않는다. 그런데 이제 `activity.result`가 새 seq를 받으면, 다른 도구가 아직 도는 중인 stage(예: Codex "Reading <path>")가 조용히 사라진다. 그래서 `activity.result`도 `canvas.drawn`처럼 `lastSeq` 계산에서 뺀다.
- `turnStatus.ts:92`는 회전하지 않는 마지막 행의 머리를 매번 `stepCount(row.steps.length)`로 다시 만든다. 그래서 문자열 머리에 합계를 붙이면 마지막 행에서는 늘 빠진다. 머리를 문자열이 아닌 구조(`{ count, lines? }` 또는 회전 문구)로 바꾸고, 그리는 쪽에서 숫자와 스크린리더 이름을 따로 다룬다.
- `seenEvents.ts` `toSee`, `state.ts`의 상태 접기, `summary.ts`에서 `activity.result`가 안 본 끝, 턴 상태, 미리보기를 바꾸지 않아야 한다. tech 리뷰에서는 지금 코드가 모르는 타입을 무시해 영향이 없다고 확인했다. 그래도 각 파일에 테스트로 고정한다.

## 순수 함수로 뺄 부분 (`/tdd` 대상)

- `countUnifiedDiff(text) → { added, removed } | null`:
  - 첫 `@@` hunk 앞의 `---`/`+++` 헤더만 건너뛰고, hunk 안의 `+`/`-` 줄을 센다. 내용이 `--`로 시작하는 삭제 줄을 헤더로 오인하지 않는다.
  - `\ No newline at end of file`은 세지 않는다.
  - hunk가 없거나, 형식이 깨졌거나, "Binary files … differ"이면 `null`이다.
- `countStructuredPatch(hunks) → { added, removed } | null`: Claude `structuredPatch[].lines`의 `+`/`-` 접두 줄을 센다.
- `countTextChange(oldText, newText) → { added, removed } | null`:
  - 줄 끝 `\r\n`과 `\n`은 같은 줄바꿈으로 본다.
  - 앞뒤 공통 줄을 먼저 잘라낸다. 남은 부분에 앞으로만 가는 Myers를 돌려 편집 거리 D만 구한다. 결과는 added = M − LCS, removed = N − LCS다.
  - 두 텍스트의 줄 수 합이 `EDIT_LINES_MAX`(20,000줄)를 넘거나, D가 `EDIT_DISTANCE_MAX`(1,000)를 넘으면 `null`이다. 이렇게 상한을 두면 계산량은 O((N+M)·D)를 넘지 않는다.
  - 원문 텍스트는 main만 받으므로 계산도 main의 정규화 단계에서 동기로 한다. 상한은 main을 멈추지 않을 만큼 작게 잡는다(T2의 시간 테스트).
  - 의존성은 추가하지 않는다(ARCHITECTURE §7 'Setup', 의존성은 요청 없이 추가하지 않는다).
- `editLinesLabel({ added, removed }) → { text, name }`:
  - `text`는 `+12 −3`이다. 마이너스는 U+2212이고, 0도 그대로 쓴다(`+12 −0`). 천 단위는 쉼표로 묶는다(`+12,345`).
  - `name`은 "12 lines added, 3 removed"다. 단수형은 "1 line added, 1 removed"다.
- 머리 이름 함수: "6 steps, 42 lines added, 10 removed"를 만든다.
- `threadItems`의 접기: 키로 결과를 단계에 붙이고, 같은 키는 더하고, 머리 합계를 계산한다. 줄 수가 하나도 없으면 머리에 합계가 없다.

## 형식 변경

- 대상은 TS 전용 형식인 대화 히스토리다. JSON Schema 원본(ARCHITECTURE §11)에는 이 형식이 없고, Go 코드는 이 JSONL을 읽지 않는다. 검사 기준은 `store.ts` `payload`와 그 테스트다.
- `activity`에 선택 필드 `callId`를 추가한다. 이전 Doan의 검사는 모르는 키를 거부하지 않으므로(`store.ts:124`) 이 필드만으로는 롤백 호환이 깨지지 않는다.
- 새 이벤트 `activity.result { callId, path?, lines: { added, removed } }`를 추가한다. 이벤트 envelope의 `v`는 1로 유지한다(`canvas.drawn` 추가와 같은 방식이다). 나중의 inline diff는 이 이벤트에 선택 필드를 더하는 방식으로 붙인다.
- **롤백 비용(사용자 승인)**: 이전 Doan은 모르는 이벤트 타입이 든 히스토리 전체를 읽지 못한다(`store.ts:137`, `:436`). 업그레이드 후 편집이 있었던 대화 거의 전부가 여기에 해당한다. 이 사실을 ARCHITECTURE 'Device-local storage and limits'의 같은 목록에 추가한다.
- 크기: 숫자 두 개와 id뿐이라 256 MiB 히스토리 한도(`io.ts:6`)에 의미 있는 영향이 없다.

## 규약과 결정에 미치는 영향

- ARCHITECTURE §1 'Conventions'와 `doan check` 규칙: 영향이 없다.
- 구조적 결정(서빙 범위, sandbox iframe, GitHub 토큰, git 명령): 영향이 없다. Doan은 provider가 준 내용만 센다. 편집 전후 파일을 디스크에서 다시 읽지 않는다.
- PRODUCT §5 item 3의 activity 행 규칙에 줄 수 표시를 추가한다. 승격할 때 다음 세 가지를 함께 적는다.
  - 진행 중인 머리에는 합계를 붙이지 않는다.
  - 턴이 진행되는 동안 합계가 늘어난다.
  - 늦게 도착한 숫자는 알리지 않는다.
- `canvas.drawn`과 handoff 판정(`drawn.ts`), `turnHadActivity`는 `activity`의 경로만 쓴다(`service.ts:713-714`). `activity.result`는 이 판정에 쓰지 않는다.

## UI (`/design-draft`에서 확정)

- 펼친 단계: `Pencil` 아이콘, "Edited", 경로 뒤에 `+N −M`을 붙인다.
  - 숫자는 `flex: none`이고 줄바꿈하지 않는다. 경로가 먼저 ellipsis로 잘린다.
  - 단계와 머리는 280 패널(좌우 16 안쪽 여백을 뺀 248 열, overlay 스크롤바 기준)에서도 한 줄이다. 그래야 숫자가 늦게 도착해도 스크롤 높이가 바뀌지 않는다.
- 접힌 머리: "6 steps · +42 −10".
- 숫자 두 개는 실제 공백이 든 inline 한 덩어리(`+12 −3`)이고, `role="img"`와 `aria-label`로 이름을 붙인다. 이렇게 하면 복사 텍스트에 이름이 섞이지 않는다(`sr-only` span은 복사에 섞이고, 일반 span의 `aria-label`은 이름으로 인정되지 않는다). 머리 버튼은 `aria-label`에 전체 이름을 둔다.
- 글꼴(사용자 결정, 드래프트 1차): 숫자는 항상 sans(`--type-family`)다. 단계에서는 경로와 같은 caption 크기, 머리에서는 머리의 body-sm 크기다. 경로만 mono로 남는다.
- 머리의 "·"는 양옆 간격을 4로 줄여, 같은 화면의 텍스트 점("Denied · Edit")과 비슷하게 읽히게 한다.
- 색(사용자 결정, 드래프트 1차): 추가는 새 역할 토큰 `--text-diff-added`(`--green-11` #218358, 흰 배경 4.72:1), 삭제는 `--text-diff-removed`(`--red-11` #ce2c31, 5.21:1)다. 기존 `--text-success`(green-12)와 `--text-danger`(red-12)는 렌더링해 보니 회색 글자와 거의 구분되지 않았다. accent는 쓰지 않는다(`ds/checks.test.ts`의 accent 위치 검사).
- 숫자는 tabular figures를 쓴다.
- 프로토타입 창의 대화 패널은 캔버스 패널과 같은 규칙을 따른다.

## 드래프트 요청

- 캔버스: `.doan/canvases/thread-edit-lines.html`, id `thread-edit-lines`, 폭 1664(turn-activity와 같다).
- 프레임:
  - `steps`: 펼친 행의 단계. 패널 347 기준으로 줄 수가 있는 편집, 새 파일(`+48 −0`), 캔버스 편집, 줄 수를 모르는 편집(거부), 결과가 아직 오지 않은 편집, 읽기·명령 단계와 섞인 행을 그린다.
  - `heads`: 접힌 머리. 합계, 일부만 아는 행의 합계, 줄 수가 없는 행(지금과 같음), 진행 중 머리(합계 없음), 단수 `1 step`, `+0 −0`을 그린다.
  - `widths`: 패널 최소 폭 280에서 긴 경로와 큰 숫자(`+12,345 −2,048`), Overview 720을 그린다. 프로토타입 창의 대화 패널은 캔버스 패널과 같은 규칙이므로 따로 그리지 않는다.
  - `copy`: 보이는 텍스트, 스크린리더 이름, 복사 텍스트의 표.
- `/design-sync`가 비교할 프레임은 `steps`, `heads`, `widths`이고, `copy`는 문구 기준이다.
- 사용자가 2026-11-25에 앱에서 드래프트를 확인하고 확정했다.

## PoC 의존성

편집 결과 데이터의 실제 모양은 provider마다 아직 실기로 확인되지 않았다. T0에서 먼저 확인한다.

- Claude Code: SDK 타입(`sdk-tools.d.ts` `FileEditOutput`/`FileWriteOutput`)에는 있다. 하지만 최소 지원 버전 2.1.284와 현재 버전에서 user 프레임에 `tool_use_result`가 실제로 오는지는 녹화된 픽스처가 없다.
- Codex: 픽스처의 `diff`가 합성 값이다(`fixtures/codex.json:54`). unified diff인지, 헤더가 있는지, `add`일 때 어떤 모양인지 모른다.
- Cursor: 픽스처의 `oldText`/`newText` 값이 이상하다(`"-- /dev/null"`, `"++ b//repo/hello.txt\nhi"`, `fixtures/acp-cursor.json:180-187`). 실제 값인지 녹화 오류인지 확인한다.
- Copilot: 완료된 편집이 녹화된 픽스처가 없다.
- Antigravity: 편집 프레임이 녹화된 픽스처가 없다.

PoC는 AGENTS.md 'Real agent sign-ins'에 따라 실제 로그인을 임시 홈에 복제해 실행하고, 끝나면 복제본을 지운다. 녹화한 프레임은 `fixtures/`에 넣고 경로와 내용은 더미로 바꾼다.

## postmortem에서 가져온 주의점

- 2026-11 (`docs/postmortem/2026-11.md:919`): 실제 Codex 기록 없이 만든 픽스처로는 결함을 잡지 못했다. → 줄 수 계산은 T0에서 녹화한 실제 프레임으로 고정한다. 합성 픽스처만으로 통과시키지 않는다.
- 2026-10 (`docs/postmortem/2026-10.md:211`): 히스토리 바이트 한도를 읽기와 쓰기에서 함께 쓴다. → 새 이벤트도 같은 `append` 경로와 한도를 지난다.
- 2026-10 (`docs/postmortem/2026-10.md:896-902`): TS와 Go가 같은 입력을 다르게 해석했다. → 이 형식은 TS 전용이라 Go 쪽 구현이 없다. 다만 `added`/`removed`의 정수 검사는 `Number.isSafeInteger`로 하고, `1e400`과 음수, 소수를 거부하는 테스트를 둔다.

## 읽은 design preset

- `shape`: 기존 화면을 확장하는 경우다. 시각 체계를 상속하고, 새 내용과 상태만 정한다.
- `clarify`: 숫자 표시와 스크린리더 이름의 문구를 정할 때 썼다. 화면 문구는 `/design-draft`에서 다시 확인한다.
