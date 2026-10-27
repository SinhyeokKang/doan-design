# doan-design-skills — design

작성일: 2026-10-27. [spec](./spec.md)의 백엔드 범위를 구현하기 위한 설계이다. 함수·API 이름은 아래 계약을 기준으로 구현 시 기존 명명 규칙에 맞춘다.

## 1. 레퍼런스와 재구성 원칙

레퍼런스는 [pbakaus/impeccable](https://github.com/pbakaus/impeccable/tree/d34c87e1a00989ae8dbdd7f6b30b70f23319e860), 커밋 `d34c87e1a00989ae8dbdd7f6b30b70f23319e860`이다. 이 머신의 읽기용 클론은 `~/code/impeccable`이며 제품 런타임 경로로 사용하지 않는다.

2026-10-27 확인한 범위는 `skill/SKILL.src.md`의 24개 명령, `skill/reference/`의 41개 Markdown, `skill/agents/`의 4개 역할 문서이다. README의 기능 소개보다 실제 스킬 소스를 기준으로 한다. 참고했다는 이유로 역할 에이전트·엔진을 설치하거나 자동 실행하지 않는다.

아래 표는 전체 원본의 대응표이며 공개 카탈로그 목록이 아니다.

| 원본 명령 | 도안에서 참고할 지침 |
|---|---|
| craft | 별도 공개 프리셋에서 제외한다. 새 디자인 지침은 일반 도안 가이드와 shape에 합치고 원본 별칭 출처를 기록한다 |
| shape | 목적·사용자·상태·범위 정리. 사용자 요청 없이 구현하지 않는다 |
| init | 디자인에 필요한 제품 맥락 확인. `doan init`과 다른 프리셋이며 프로젝트 초기화나 문서 덮어쓰기를 자동 실행하지 않는다 |
| document | 요청받은 기존 디자인 규칙 문서화. 사용자의 기존 문서와 경로를 존중한다 |
| extract | 요청받은 토큰·반복 패턴 정리. 앱 코드 수정은 별도 사용자 범위 안에서만 한다 |
| critique | 요청한 디자인 검토. 종합 자동 평가나 자동 수정으로 확장하지 않는다 |
| audit | 요청한 접근성·반응형 등 점검. 실제 확인한 항목과 미확인 항목을 구별하고 원본 검사기가 있다고 가정하지 않는다 |
| polish | 기존 정체성과 기능을 유지하며 마무리 |
| bolder | 요청한 범위에서 시각적 강조 강화 |
| quieter | 과도한 시각적 강조 완화 |
| distill | 불필요한 복잡성 줄이기 |
| harden | 오류·긴 문구·누락 상태 등 보강 |
| onboard | 첫 사용·빈 상태·다음 행동 설계 |
| animate | 요청한 목적에 맞는 모션 |
| colorize | 의미와 대비를 고려한 색 사용 |
| typeset | 글꼴·타이포그래피 위계 개선 |
| layout | 배치·간격·그룹 관계 개선 |
| delight | 기능을 방해하지 않는 표현 개선 |
| overdrive | 사용자가 요청한 표현·효과 탐색. 제공되지 않는 도구나 자산을 있다고 주장하지 않는다 |
| clarify | 의미를 보존하며 문구·행동·오류 안내 명확화 |
| adapt | 요청한 화면 크기·사용 환경에 맞게 조정 |
| optimize | 요청한 디자인 구현의 성능 점검·개선. 측정하지 않은 효과를 주장하지 않는다 |
| live | 별도 공개 프리셋에서 제외한다. 선택 대상의 반복 개선 지침은 polish·generate에 합치고 상주 서버·poll loop는 가져오지 않는다 |
| generate | 요청받은 대안 생성 지침. 비교·채택 UI나 자동 분기 관리는 만들지 않는다 |

2026-10-27 리뷰 결정: 전체 원본을 참고하되 도안에 맞는 것만 공개한다. 위 24개 이름을 모두 노출할 의무는 없다. craft·live는 위와 같이 통합하고, 나머지도 A1에서 독립된 사용자 의도와 정적 지침으로서의 효용을 확인해 공개 여부를 정한다. 통합·제외는 대응표에 이유와 반영 위치를 남긴다. 공개하지 않는 원본 이름을 조회 alias로 몰래 유지하지 않는다. 최종 공개 카탈로그를 fixture로 고정하고 agent-eval도 그 목록을 사용한다.

공통 문서도 빠짐없이 검토한다. `routing`, `new-work`, `craft-floor`, 작업 모드, `operate`, 플랫폼 가이드 등은 해당 프리셋의 필요한 지침으로 합친다. `hooks`, `doctor`, `live-setup`, `region-map`, `visualize`, `component-review` 및 역할 문서는 디자인 판단 지침과 원본 도구 의존 절차를 구별한다. 불필요한 관리 명령을 도안 프리셋으로 새로 만들지 않는다. 이식 대조표에 각 소스의 반영 위치 또는 미반영 사유를 남긴다. “전부 레퍼런스”를 “원본 런타임 기능 전부 구현”으로 해석하지 않는다.

`LICENSE`, `NOTICE.md`, 관련 저작권·출처를 함께 확인·보존한다. 원본 NOTICE는 iOS/Android 지침이 ehmo의 MIT 라이선스 작업에서 파생됐다고 명시하므로 해당 내용을 사용할 때 이 출처와 관련 라이선스도 추적한다. 각 재구성 본문에 변경 사실과 원본 커밋을 기록한다. Apache-2.0 한 줄로 모든 파생 고지를 대체하지 않는다.

## 2. 하나의 정본과 세 조회 경로

```text
CLI에 포함된 카탈로그 + 정적 Markdown
  ├─ doan design-skill [id] --json
  ├─ MCP design_skill({id?}) → 같은 CLI 처리 경로
  └─ 앱 main → bundled CLI → preload 조회 API → 후속 buzz-restyle UI

설치된 doan 스킬 → doan skill → 짧은 목록 → 선택한 본문 조회 → 기존 에이전트 작업
앱의 기존 대화 전송 → 가이드 조회 안내 → 같은 발견·매핑 흐름
```

- 기존 `doan skill`의 인자 없는 호출과 `{version, body}` 결과를 유지한다. 가이드에 짧은 프리셋 목록·조회 방법·매핑 규칙을 추가한다. 목록은 카탈로그에서 생성해 별도 복사본을 관리하지 않는다.
- `doan design-skill`은 목록, `doan design-skill <id>`는 해당 본문을 반환한다. repo 초기화·앱 실행·선택이 필요 없는 순수 읽기 명령이다. `doan init`의 의미는 바뀌지 않는다.
- MCP `design_skill`은 optional string `id` 하나를 받으며 `additionalProperties: false`, `readOnlyHint: true`이다. 기존 MCP처럼 CLI 결과 envelope를 text와 structuredContent 양쪽에 반환한다. resources/prompts/sampling은 추가하지 않는다.
- 앱 main은 기존 CLI 실행·타임아웃·패키지 경로 선택을 재사용한다. 개발용 PATH와 패키지용 bundled CLI의 기존 구분을 유지한다. 새 설치·다운로드 경로를 만들지 않는다.
- 정본은 제품 소스 안에 포함한 텍스트이다. 사용자 프로젝트 문서나 로컬 Impeccable 클론을 기본 지침으로 자동 로드하지 않는다. 프로젝트 내용은 기존 에이전트가 작업 맥락으로 읽는다.

### 조회 결과 계약

목록의 `result`:

```json
{"version":"<doan version>","presets":[{"id":"clarify","title":"Clarify copy","description":"Clarify labels, errors, and next actions without changing meaning.","scope":"copy"}]}
```

단건의 `result`:

```json
{"version":"<doan version>","preset":{"id":"clarify","title":"Clarify copy","description":"Clarify labels, errors, and next actions without changing meaning.","scope":"copy"},"body":"<complete adapted Markdown>","sources":[{"repository":"https://github.com/pbakaus/impeccable","commit":"d34c87e1a00989ae8dbdd7f6b30b70f23319e860","path":"skill/reference/clarify.md"}]}
```

`scope`는 짧은 적용 범위 설명이며 권한이나 자동 파일 선택 조건이 아니다. 정렬은 카탈로그의 고정 순서이다. 빈 ID·알 수 없는 ID·잘못된 타입·추가 인자는 기존 `usage_error`로 실패하며 임의 파일 조회로 해석하지 않는다. 본문 끝에는 ID와 버전을 포함한 완전성 마커를 둔다. 마커가 없으면 일부 출력으로 작업을 시작하지 않는다. 필요한 공통 내용은 빌드 시 본문에 합쳐 끊어진 상대 경로나 원본 placeholder를 남기지 않는다.

### 앱용 API

- preload `designSkills.list()`와 `designSkills.get(id)`를 제공한다. main 창의 신뢰된 최상위 문서에서만 허용하고 캔버스 iframe·다른 창의 호출은 거부한다.
- 성공과 유효한 CLI 실패는 기존 v1 envelope를 그대로 전달한다. 앱에서 발생한 실패도 `{v: 1, ok: false, error: {code, message, nextSteps}}`로 반환한다. 호출자 거부는 `request_refused`, CLI 실행 불가는 `cli_unavailable`, 시간 초과는 `cli_timeout`, JSON·result 형식 오류는 `invalid_response`, 알 수 없는 envelope v는 `unsupported_version`, 유효한 envelope 없이 비정상 종료하면 `cli_failed`이다. 검증된 CLI의 `usage_error` 등은 그대로 보존한다.
- 명령 미지원은 기존 CLI의 `usage_error`와 nextSteps로 전달하며, stderr 문구만으로 구버전이라고 단정하지 않는다. `result.version`은 출처 표시용이며 앱/CLI semver가 다르다는 이유만으로 거부하지 않는다. 기존 CLI 실행기는 재사용하지만 도메인별 오류 union을 공통 오류형으로 간주하지 않는다. 실패를 빈 목록으로 위장하거나 자동 반복하지 않는다.
- 이 API는 모델을 호출하거나 대화를 만들지 않고 파일도 수정하지 않는다. 프리셋 ID를 받는 임의 명령 실행 IPC를 만들지 않는다.
- 이번 feature는 UI 전송 형식이나 선택기 상태를 정의하지 않는다. 후속 UI는 이 목록·본문을 사용하고 사용자의 명시 프리셋 요청을 기존 대화 경로로 전달한다. 별도의 요청 가공 API는 필요성이 확정되기 전에는 추가하지 않는다.

## 3. 발견·설치·자연어 매핑

기존 공유 stub `~/.agents/skills/doan/SKILL.md`와 Claude 설정 디렉터리의 상대 링크를 그대로 사용한다. 설치는 앱 온보딩/Settings Connections의 기존 과정이며 앱 파일을 복사하는 순간 백그라운드로 전역 파일을 쓰는 새 동작이 아니다. stub에는 디자인 프리셋의 발견 가능성을 짧게 표현하고 전체 지침은 넣지 않는다. 기존 stub도 `doan skill`을 읽으므로 새 가이드에 접근한다. 수정한 stub 충돌은 기존 확인·재확인 규칙을 유지한다.

기존 에이전트가 가이드의 다음 규칙을 수행한다.

1. 사용자가 명시한 도안 프리셋이 있으면 그 항목을 조회한다. 존재하지 않으면 없는 기능임을 알리고 임의로 비슷한 ID를 실행하지 않는다.
2. 그렇지 않으면 요청 목적·대상·부정을 목록의 설명과 비교한다. 명백히 적합한 항목만 선택한다. 결과를 크게 달리하는 모호함만 사용자에게 묻는다.
3. 적합한 항목이 없으면 본문을 읽지 않고 원래 요청을 처리한다. “이 버튼을 왼쪽으로 4px 이동” 같은 구체적인 단순 편집에 전체 polish를 강제하지 않는다.
4. 본문 조회와 실제 작업을 구분한다. 검토 요청은 보고로 끝내고, 수정은 요청된 범위에서만 한다. 프리셋 선택이 없는 일반 대화에 자동 진단을 시작하지 않는다.
5. 원문과 기존 제약이 지침보다 우선한다. 프리셋 간 자동 handoff·강제 subagent·엔진 실행을 제거한다. 실제 사용할 수 없는 브라우저·검사 도구는 미검증으로 보고한다.

앱의 `turnPrompt`에는 도안 가이드에서 필요한 디자인 프리셋을 찾도록 하는 고정된 짧은 안내를 추가한다. 사용자 `userText`를 재작성하지 않고 `anchorData`의 비신뢰 경계를 유지한다. 전체 목록·본문을 turn마다 main에서 붙이지 않는다. 이미 읽은 동일 버전의 가이드는 대화 문맥에서 재사용하고 읽지 않았거나 문맥을 잃은 경우 조회한다. 별도 모델 호출·분류 endpoint·매핑 캐시는 없다. 따라서 “앱이 전송 전에 매핑 결과를 미리 보여준다”는 기능은 제공하지 않는다.

### 가이드·본문을 조회할 수 없을 때

앱 main이 bundled CLI로 목록을 읽을 수 있다는 사실은 대화 에이전트의 PATH나 MCP 등록을 보장하지 않는다. 고정 안내에도 shell 조회 불가 시 등록된 doan MCP `skill`·`design_skill`을 사용하도록 적는다. 승인 거부 후 같은 요청을 반복하거나 설정을 바꾸지 않는다. 두 경로가 모두 없거나 거부되면 프리셋을 적용하지 못했다고 알리고 Settings > Connections의 연결·복구를 안내한다.

명시 프리셋 요청은 해당 지침 없이 적용했다고 주장하거나 다른 지침으로 대체하지 않고 조회 불가를 보고한다. 프리셋이 선택 사항인 일반 요청은 그 제약을 밝히고 기존 권한·도안 규약으로 가능한 작업만 계속한다. 선택 대상·캔버스 규약도 확인할 수 없으면 추측으로 진행하지 않는다. 자동 설치·PATH 변경·MCP 등록·권한 변경은 하지 않는다.

## 4. 영향과 순수 함수

| 영역 | 변경 |
|---|---|
| CLI Go | 정적 카탈로그·Markdown 포함, 목록/단건 조회, 가이드·도움말 확장 |
| MCP | `design_skill` 하나와 기존 `skill` 안내 확장, CLI parity |
| 설치 | 기존 stub의 설명 확장. 기존 설치 위치·권한·충돌 처리 유지 |
| 앱 main/preload | 목록·본문 읽기 API와 결과 검증. renderer UI 없음 |
| 대화 백엔드 | 고정 가이드 조회 안내 추가. 사용자 원문·앵커·전송·권한·저장 계약 유지 |
| eval | 실제 발견·매핑·부정·미일치·범위 보존 시나리오 |

`/tdd` 대상:

- 카탈로그 검증: ID 유일성, 안정 순서, 본문·출처 누락, placeholder·미해결 참조.
- 목록 투영과 ID 조회: 목록에 본문이 섞이지 않음, 잘못된 ID 거부, 공통 지침 합성과 끝 마커.
- MCP 인자→CLI 인자 변환 및 동일 envelope 반환.
- 앱의 CLI 결과 해석: 정상·명령 미지원·unknown envelope v·잘못된 result·실행 오류를 위 오류 계약대로 구분하고 빈 성공으로 바꾸지 않음.
- 프롬프트 조립: 가이드 안내는 고정 영역, 원문은 byte-for-byte 유지, 앵커는 데이터 영역, 비디자인 대화에 강제 매핑 없음.

자연어 판단 자체를 문자열 일치 함수로 구현하거나 unit test의 단일 정답 키워드로 판정하지 않는다. 실제 에이전트 평가에서 동의어·부정·명시 요청 우선순위와 작업 결과를 판단한다.

## 5. 포맷·규약·경계

- CLI envelope `v: 1`을 유지한다. 명령별 result는 ARCHITECTURE §11 예외대로 Go가 유일한 생산자이며 새 JSON Schema는 만들지 않는다. 목록·단건·오류의 공용 예제 fixture를 Go와 TS가 함께 읽는다.
- `.doan/config.json`, comment events, runtime/socket/session schemas, 대화 이벤트·Start/Send 입력 구조는 변경하지 않는다. 대화 텍스트에 가이드를 안내하는 것은 저장된 사용자 메시지 형식 변경이 아니다.
- 캔버스 규약·ID·`doan check` 규칙은 바꾸지 않는다. 검토·수정 지침은 기존 규약과 사용자 범위를 따른다.
- 정적 레퍼런스는 HTTP 캔버스 serving scope로 노출하지 않는다. sandbox iframe·파일 경계·no Git operations·권한 승인 계약도 그대로이다.
- 새 영구 상태·카탈로그 서버·외부 의존성·인증은 없다. 버전 갱신은 앱/CLI 릴리스에 묶고 자동 upstream 동기화는 없다.

## 6. 회귀 예방 근거

[POSTMORTEM](../../POSTMORTEM.md)에서 확인한 항목을 이 작업의 검증에 연결한다.

- 2026-10-24 설치 경쟁: “create missing targets exclusively and keep rename only for confirmed replacements”. stub 설명 갱신이 기존 파일 충돌·승인·재확인 보호를 우회하지 않게 한다.
- 2026-10-24 설치 경로 별칭: “test identical as well as distinct destinations”. 공유 스킬과 Claude 경로가 같은 실제 디렉터리인 경우 및 symlink 부모를 기존 회귀 검사로 보호한다.
- 2026-10-24 eval 출력 잘림: “keep extracted calls separate from raw output”. 프리셋 본문이 길어져도 실제 목록/본문 조회 근거가 judge 입력에서 사라지지 않아야 한다.
- 2026-10-27 대화 준비 경쟁: “recheck current metadata and live execution identity after preparation and opening, before acceptance”. 안내 추가를 이유로 대화 admission 바깥에서 새 비동기 모델/조회 단계를 만들지 않는다.
- 2026-10-27 canvas 경로: “resolve an ID to exactly one listed canvas before preparation and final admission”. 프리셋은 선택 대상을 새로 추정하지 않으며 기존 대상 검증을 우회하지 않는다.

## 7. 검증과 후속 UI 인계

추가 PoC는 필요 없다. `.scratch/design-tools-poc/`의 2026-10-27 실험은 재구성한 `clarify` 한 개에 대해 stdio MCP와 별도 브라우저 UI의 응답 일치, 선택 프레임 밖 byte 보존, ID 유지, `doan check` 오류·경고 0개를 확인했다. 수정 실행자는 현재 Codex 세션이었으며 정식 앱 통합·별도 에이전트 자동 실행·자연어 매핑 성공률을 검증하지 않았다. 이 근거를 확대 해석하지 않는다.

실제 제품 구현은 다음으로 검증한다.

- CLI/MCP/앱 공용 fixture와 설치 회귀 검사, 전체 shared verify gate.
- 임시 HOME·설정·userData·DOAN_RUNTIME에서 실제 Electron preload의 목록/본문 조회와 호출자 경계. 새 화면 없이 짧은 `.scratch/` probe로 확인한다.
- 패키지에 포함된 CLI로 앱 없이 목록/본문 조회, 설치 stub의 발견 경로 확인.
- agent-eval: Claude Code·Codex가 명시 ID, 자연어 일치, 미일치, 부정, 복합 요청, 검토 전용, 빈 design 디렉터리에서 생성하는 필수 사례를 통과해야 한다. 이름을 알려주지 않는 발견·본문 조회는 shell 전용과 MCP 전용(`mcp: true`, `shellCli: false`)으로 각각 확인한다. 가이드 조회 불가와 본문 조회 거부도 실제 미적용·연결 안내를 확인한다. 사례별 허용 선택·필수 조회·금지 수정·미일치 시 본문 미조회를 정하고 자동 검사 실패 또는 judge partial/fail은 미완료로 남긴다. 타당한 여러 선택을 허용하되 무단 수정은 별도로 실패 처리한다.
- 이전 stub 호환성은 별도 격리 확인으로 검증한다. 현재 eval runner는 매번 최신 stub을 복사하므로 일반 평가 통과로 이전 stub 발견을 입증할 수 없다. 이전 릴리스 stub과 새 CLI를 함께 둔 환경에서 가이드→프리셋 조회를 실제로 확인한다. 이를 위해 전체 runner를 확장할 필요는 없다.
- 목록/단건 UTF-8 크기와 실제 조회 횟수를 기록한다. 별도 모델 호출이 없다는 구조적 근거와 실제 과다 조회 여부를 구분한다.

`buzz-restyle`에는 API 예제, 사용 가능한 ID·설명, 일반 오류/구버전 상태, 기존 대화와의 연결 지점을 인계한다. 선택기의 위치, 검색, 선택 후 전송 여부, 명시 프리셋 표시 방식은 UI feature가 결정한다. 이번에는 `/design-draft`·`/design-sync`를 실행하지 않는다.
