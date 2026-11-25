# 스레드 편집 줄 수 — design

## 영향 범위

- **app main** (`app/src/main/conversation/`): provider 정규화(`transport.ts`의 Claude·Codex, `acp.ts`), 이벤트 타입(`types.ts`), 히스토리 검사(`store.ts` `payload`/`parse`).
- **app renderer**: `threadItems.ts`(단계와 머리 합계 접기), `ConversationThread.tsx`(`Steps`, activity 머리), `styles.css`. 캔버스 패널, Overview, 프로토타입 창이 같은 스레드 컴포넌트를 쓰므로 세 곳에 함께 적용된다.
- **CLI, 스킬, 캔버스 규약**: 바뀌지 않는다.
- **형식**: 대화 히스토리 JSONL(`<userData>/conversations/<id>.jsonl`)에 필드 하나와 이벤트 타입 하나가 추가된다. 아래 '형식 변경'에서 다룬다.

## 데이터 흐름

1. 편집이 시작되면 지금처럼 `activity`(kind `edit`)를 기록한다. 여기에 provider의 호출 id를 `callId`(선택)로 함께 남긴다.
   - Claude Code: assistant 프레임 `tool_use` 블록의 `id`(`transport.ts:381`).
   - Codex: fileChange 항목의 `id`(`transport.ts:555-581`). 항목 하나가 경로마다 activity를 하나씩 만들므로 `callId`와 `path`를 함께 키로 쓴다.
   - ACP: `toolCallId`(`acp.ts:144`). ACP는 이미 완료 시점에만 activity를 기록하므로 activity와 줄 수 이벤트가 연달아 나온다.
2. 편집이 적용된 것을 확인하면 `activity.lines { callId, path?, added, removed }`를 기록한다.
   - Claude Code: user 프레임 `tool_result`(`transport.ts:430`)의 `tool_use_result`에서 `structuredPatch`의 `+`/`-` 줄을 센다. `is_error`인 결과와 패치가 없는 결과는 기록하지 않는다. `userModified`인 결과도 `structuredPatch`가 실제로 적용된 내용인지 T0에서 확인한 뒤 같은 규칙으로 센다. 새 파일 Write는 `structuredPatch`가 비어 있을 수 있으므로 `type: "create"`이면 `content`의 줄 수를 추가 줄로 센다. 실제 모양은 T0 PoC로 확인한다.
   - Codex: `item/completed`의 fileChange가 `status: "completed"`일 때 각 `changes[].diff`를 unified diff로 센다. `kind`가 `add`/`delete`인 경우 diff가 전체 내용인지 hunk인지는 T0에서 확인한다. `declined`·`failed`는 기록하지 않는다.
   - ACP: `status === "completed"`인 갱신의 `content[]`에서 `type: "diff"` 항목의 `oldText`(없으면 빈 파일)와 `newText`를 줄 단위로 비교해 센다. Copilot의 `rawInput` apply_patch 문자열은 적용 여부를 알려주지 않으므로 쓰지 않는다.
3. renderer는 `callId`(Codex는 `callId`+`path`)로 줄 수를 단계에 붙이고, 같은 activity 행의 줄 수를 더해 머리 합계를 만든다. 같은 키의 줄 수 이벤트가 두 번 오면 나중 것을 쓴다.

## 순수 함수로 뺄 부분 (`/tdd` 대상)

- `countUnifiedDiff(text) → { added, removed } | null`: 첫 `@@` hunk 앞의 `---`/`+++` 헤더만 건너뛰고, hunk 안의 `+`/`-` 줄을 센다. 내용이 `--`로 시작하는 삭제 줄을 헤더로 오인하지 않는다. `\ No newline at end of file`은 세지 않는다. hunk가 없거나 형식이 깨졌으면 `null`이다.
- `countStructuredPatch(hunks) → { added, removed } | null`: Claude `structuredPatch[].lines`의 `+`/`-` 접두 줄을 센다.
- `countTextChange(oldText, newText) → { added, removed } | null`: 줄 단위 최소 편집 거리(Myers). 의존성을 추가하지 않는다(ARCHITECTURE §7 'Home tests without a DOM': 요청 없이 의존성을 추가하지 않는다). 두 텍스트의 줄 수 합이 한도(`EDIT_LINES_MAX`, 초기값 20,000줄)를 넘거나 편집 거리가 한도를 넘으면 `null`이다. 줄 수를 모른다는 뜻이며 UI에는 숫자가 나오지 않는다.
- `editLinesLabel({ added, removed }) → { text, name }`: `text`는 `+12 −3`(마이너스는 U+2212), `name`은 "12 lines added, 3 removed"다. 0인 쪽을 표시하는 규칙은 `/design-draft`에서 정하고 이 함수에 고정한다.
- `threadItems`의 접기: 단계에 `lines`를 붙이고 머리 합계를 계산한다. 줄 수가 하나도 없으면 머리에 합계가 없다.

## 형식 변경

- 대상은 TS 전용 형식인 대화 히스토리다. JSON Schema 원본(ARCHITECTURE §11)에는 이 형식이 없다. 검사 기준은 `store.ts` `payload`와 그 테스트다.
- `activity`에 선택 필드 `callId`(비어 있지 않은 문자열, 길이 제한은 `prompt.ts`의 `LIMITS`에서 고른다)를 추가한다. 이전 Doan의 검사는 모르는 키를 거부하지 않으므로(`store.ts:124`) 이 필드만으로는 롤백 호환이 깨지지 않는다.
- 새 이벤트 `activity.lines { callId, path?, added, removed }`를 추가한다. `added`와 `removed`는 0 이상의 안전한 정수다. 이벤트 envelope의 `v`는 1로 유지한다(`canvas.drawn` 추가와 같은 방식이다).
- **롤백 비용(사용자 승인)**: 이전 Doan은 모르는 이벤트 타입이 든 히스토리 전체를 읽지 못한다(ARCHITECTURE 'Device-local storage and limits'). 이 사실을 ARCHITECTURE의 같은 목록에 추가한다.
- 크기: 숫자 두 개와 id뿐이라 256 MiB 히스토리 한도(`io.ts:6`)에 의미 있는 영향이 없다.

## 규약과 결정에 미치는 영향

- ARCHITECTURE §1 'Conventions'와 `doan check` 규칙: 영향이 없다.
- 구조적 결정(서빙 범위, sandbox iframe, GitHub 토큰, git 명령): 영향이 없다. Doan은 파일을 읽지 않고 provider가 준 내용만 센다. 편집 전후 파일을 디스크에서 다시 읽지 않는다.
- PRODUCT §5 item 3의 activity 행 규칙(단계 문구, 접힌 머리, 진행 중 머리)에 줄 수 표시를 추가한다. 진행 중인 머리(인디케이터 문구로 회전할 때)에는 합계를 붙이지 않는다. 머리가 단계 수를 보여줄 때만 붙이므로 회전 문구와 겹치지 않는다(`/feature-review`에서 다시 확인한다).
- `canvas.drawn`과 handoff 판정(`drawn.ts`)은 `activity`의 경로만 쓴다. `activity.lines`는 이 판정에 쓰지 않는다.

## UI (`/design-draft`에서 확정)

- 펼친 단계: `Pencil` 아이콘, "Edited", 경로 뒤에 `+N −M`. 기존 단계 줄의 높이와 줄바꿈 규칙을 유지한다. 긴 경로가 잘려도 숫자는 남는다.
- 접힌 머리: "6 steps · +42 −10".
- 색: 추가는 `--text-success`, 삭제는 `--text-danger` 후보다. 두 토큰은 이미 있다(`tokens.css:231`, `:233`). accent는 쓰지 않는다(`ds/checks.test.ts`의 accent 위치 검사). 패널 배경에서의 대비는 draft에서 측정한다.
- 숫자는 tabular figures를 쓴다.

## PoC 의존성

- 편집 결과 데이터의 실제 모양은 provider마다 아직 실기로 확인되지 않았다. T0에서 먼저 확인한다.
  - Claude Code: SDK 타입(`sdk-tools.d.ts` `FileEditOutput`/`FileWriteOutput`)에는 있지만, 최소 지원 버전 2.1.284와 현재 버전에서 user 프레임에 `tool_use_result`가 실제로 오는지는 녹화된 픽스처가 없다.
  - Codex: 픽스처의 `diff`가 합성 값이다(`fixtures/codex.json:54`). unified diff인지, 헤더가 있는지, `add`일 때 어떤 모양인지 모른다.
  - Cursor: 픽스처의 `oldText`/`newText` 값이 이상하다(`"-- /dev/null"`, `"++ b//repo/hello.txt\nhi"`, `fixtures/acp-cursor.json:180-187`). 실제 값인지 녹화 오류인지 확인한다.
  - Copilot: 완료된 편집이 녹화된 픽스처가 없다.
  - Antigravity: 편집 프레임이 녹화된 픽스처가 없다.
- PoC는 AGENTS.md 'Real agent sign-ins'에 따라 실제 로그인을 임시 홈에 복제해 실행하고, 끝나면 복제본을 지운다. 녹화한 프레임은 `fixtures/`에 넣고 경로와 내용은 더미로 바꾼다.

## postmortem에서 가져온 주의점

- 2026-11 (`docs/postmortem/2026-11.md:668`, `:919`): 정규화기의 테스트 픽스처가 우리가 상상한 모양뿐이고 실제 에이전트의 출력이 아니어서 결함을 놓쳤다. → 줄 수 계산은 T0에서 녹화한 실제 프레임으로 고정한다. 합성 픽스처만으로 통과시키지 않는다.
- 2026-10 (`docs/postmortem/2026-10.md:211`): 히스토리 바이트 한도를 읽기와 쓰기에서 함께 쓴다. → 새 이벤트도 같은 `append` 경로와 한도를 지난다.
- 2026-10 (`docs/postmortem/2026-10.md:896-902`): TS와 Go가 같은 입력을 다르게 해석했다. → 이 형식은 TS 전용이라 Go 쪽 구현이 없다. 다만 `added`/`removed`의 정수 검사는 `Number.isSafeInteger`로 하고, `1e400`과 음수, 소수를 거부하는 테스트를 둔다.

## 읽은 design preset

- `shape`: 기존 화면을 확장하는 경우다. 시각 체계를 상속하고, 새 내용과 상태만 정한다.
- `clarify`: 숫자 표시와 스크린리더 이름의 문구를 정할 때 썼다. 화면 문구는 `/design-draft`에서 다시 확인한다.
