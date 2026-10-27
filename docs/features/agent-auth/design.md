# agent-auth — design

작성: 2026-10-27. 이 문서는 구현 설계이며 현재 앱의 동작을 설명하는 정본은 [ARCHITECTURE](../../ARCHITECTURE.md)이다. PoC로 정할 항목은 확정된 것처럼 구현하지 않는다.

## 경계와 담당

`agent-auth`는 `buzz-restyle`의 자식이 아닌 별도 기능이다. 기존 스택인 Electron main/preload/React와 설치된 에이전트 실행 파일을 사용한다. 계정 연결 상태와 소유권은 main이 관리한다. 범용 플러그인 시스템이나 동적 공급자 등록은 만들지 않는다.

| 영역 | 변경 |
|---|---|
| main 인증 | 로그인·취소·계정 확인·인증 보관·갱신·로그아웃. 도안 전용 프로필과 시도 수명 관리 |
| `setupBroker.ts`와 실행 준비 | 도구 설치 상태와 계정 인증 상태 분리. 기존 설정 잠금과 충돌하지 않게 필요한 준비 직렬화 |
| `conversation/{prepare,environment,runners,service,ownership,store}.ts` | 새 도안 대화는 연결된 계정 사용. 추가 플랫폼 실행기, 계정 소유권 검사, 저장 호환성 |
| main IPC·preload | 주 창과 Settings의 인증 상태 읽기·변경 채널. 대화 실행은 기존처럼 주 창만 허용 |
| CLI·MCP·skills | 공개 명령과 규칙 유지. 도안 전용 실행 환경에 필요한 도구를 연결하되 전역 등록을 암묵적으로 복사하지 않는다 |
| 문서 | 완료 때 PRODUCT·ARCHITECTURE 및 디렉터리 변경 시 DIRECTORY 갱신 |

## PoC와 공급자 선택

기존 [PoC 10](../../PRODUCT.md#6-pre-implementation-poc-2026-10-21)의 탐색 결과를 출발점으로 쓴다. 새 공급자 패키지나 버전은 공식 문서와 실제 프로토콜을 함께 확인한 뒤 고정한다. 현재 Claude SDK 0.3.310/CLI 2.1.310, Codex 0.163.0의 실행 근거를 최신 문서만 보고 대체하지 않는다.

| 순서 | 경로 후보 | 반드시 해결할 조건 |
|---|---|---|
| 필수: Claude Code | 공식 `claude auth` + 전용 `CLAUDE_CONFIG_DIR` + 기존 Agent SDK | 브라우저 왕복·Keychain/파일 저장·갱신·도안만 로그아웃. Keychain 실패 시 평문 파일 대체를 성공으로 숨기지 않는다 |
| 필수: Codex | 공식 app-server 계정 로그인 또는 검증한 Sign in with ChatGPT 경로 | 정확한 버전과 저장소 분리. PoC에서 발견한 0.164.0의 내부 전용 `chatgptAuthTokens`를 채택하지 않는다. 0.163.0→새 버전은 별도 실행 회귀 검증 필요 |
| 추가 1: Cursor | 공식 ACP `cursor_login`과 session/new/load/prompt/cancel | `CURSOR_CONFIG_DIR`이 인증·키체인·세션을 실제로 분리하는지, 차단성 요청에 답할 수 있는지 확인 |
| 추가 2: Antigravity | 공식 인증·SDK/CLI 중 검증한 경로 | 로컬 앱 공용 인증을 도안과 분리할 수 있어야 한다. CLI headless의 확인 불가 권한 거절을 앱 권한 대화상자로 대체했다고 주장하지 않는다 |
| 추가 3: Copilot | 공식 SDK와 앱이 받은 사용자 토큰 또는 검증한 CLI 인증 | 앱 등록·필요 권한·구독 사용 가능 여부 확인. `useLoggedInUser: false`와 환경 정리로 `gh`/기존 CLI 인증 대체를 막는다 |

공식 출처: [Claude 인증](https://code.claude.com/docs/en/iam), [Claude CLI](https://code.claude.com/docs/en/cli-reference), [Codex app-server](https://learn.chatgpt.com/docs/app-server), [Codex SIWC](https://developers.openai.com/siwc/token-sharing-open-source/codex-app-server), [Cursor ACP](https://prod.cursor.com/docs/cli/acp), [Cursor 설정](https://prod.cursor.com/docs/cli/reference/configuration), [Antigravity 인증](https://antigravity.google/docs/install), [Antigravity headless](https://www.antigravity.google/docs/cli/headless/), [Copilot 인증](https://docs.github.com/en/copilot/how-tos/copilot-sdk/auth/authenticate), [Copilot SDK 계약](https://docs.github.com/en/copilot/how-tos/copilot-sdk/troubleshooting/compatibility). 확인일과 버전 차이는 PoC 10에 남아 있다. 구현 시 다시 확인한다.

각 후보마다 검증표를 남긴다: 공식 경로·버전 / 로그인·취소 / 저장·재시작 / 갱신·만료·폐기 / 로그아웃 격리 / 계정 교체 / 실제 요청 / 권한 허용·거절 / 중단·종료 / 같은 세션 재개. 판정은 `미실행`, `통과`, `실패`, `공식 경로 미확인`을 구분한다. 임의 TTL이나 만료 흉내만으로 실제 갱신 통과를 기록하지 않는다.

Cursor가 통과하면 우선 최소 3개를 구성한다. Antigravity와 Copilot도 조사하고, 공식 경로와 동일한 검증 기준을 충족하며 과도한 우회가 없으면 포함한다. 후보 미달을 감추거나 지원 수를 맞추기 위해 승인 우회를 켜지 않는다. 지원 집합·제외 근거를 문서에 확정한 뒤 구현 범위를 잠근다.

구현 전 PoC는 `.scratch/`의 독립된 공식 CLI/SDK harness로 수행한다. 아직 없는 앱 인증 IPC나 추가 공급자 실행기를 선행 조건으로 삼지 않는다. 구현 후에는 실제 Electron main/preload 경로를 별도로 검증한다.

실인증 전에 공급자별 환경 허용 목록과 파일·OS Keychain 저장소 분리를 확인한다. 현재 `app/runtime/environment.ts`는 `process.env`를 상속하고 `real-state.ts`의 보호 범위도 모든 공급자 인증 저장소를 포함하지 않는다. 기존 도우미만으로 격리됐다고 판단하지 않는다. 비밀 없는 외부 인증 상태·저장소 메타데이터를 전후 대조하고 실패 시에도 finally에서 실험 소유 프로세스·리스너·파일을 정리한다. 외부 인증 저장소는 읽기 확인만 하며 수정하거나 삭제하지 않는다.

## 인증 상태와 수명

인증 정보와 도구 준비 상태를 별도로 읽고, UI에 보여줄 실행 가능 여부를 순수 함수로 계산한다. 로그인 성공 이벤트만으로 `ready`가 되지 않는다. 저장 완료, 계정 식별, 지원 실행 버전, 필요한 도안 도구 준비가 모두 확인돼야 한다.

인증 상태는 `disconnected`, `checking`, `signingIn`, `connected`, `reauthRequired`, `signingOut`, `error`로 나눈다. 기존 정상 상태와 확인 오류는 함께 표현할 수 있어야 한다. CLI 없음·미지원 버전·도구 준비 실패는 별도의 readiness 원인이다.

한 시점에 앱 전체에서 로그인·로그아웃 쓰기 하나만 진행한다. 브라우저 인증 대기 때문에 다른 플랫폼의 기존 대화까지 중단하지는 않는다. main이 생성한 `attemptId`와 연결 세대를 모든 비동기 결과에 대조한다. 취소·로그아웃·창 종료 뒤 도착한 성공은 현재 계정으로 승격하지 않는다.

공식 CLI/SDK가 OAuth를 소유하면 인증 URL·callback·갱신을 그 경로에 맡긴다. 도안이 OAuth를 직접 소유하는 경로만 공급자가 요구하는 state·PKCE·redirect·토큰 검증을 구현한다. renderer가 임의 URL·실행 파일·config 경로를 지정할 수 없게 한다. 시스템 브라우저를 사용하고 토큰을 renderer에 전달하지 않는다.

인증 시도 프로세스와 callback listener는 생성 즉시 소유권을 등록한다. 명시적 취소, 소유 창 종료, 앱 종료 때 정리하고, 종료가 불확실하면 같은 저장소를 사용하는 다음 쓰기를 시작하지 않는다. 외부 브라우저나 Orca 프로세스는 종료하지 않는다. provider의 인증 만료는 그대로 따르며 사용자의 브라우저 조작 시간을 짧은 셸 명령 timeout과 혼동하지 않는다.

## 저장과 실행 환경

공급자별 도안 전용 프로필 하나를 userData 아래에 둔다. 폴더명·credential locator·키체인 이름은 공급자 PoC 후 고정한다. 파일 접근만 분리되고 OS Keychain 항목을 공유하면 격리 통과가 아니다. 기존 프로필의 토큰을 가져와 초기화하지 않는다.

도안 소유 토큰은 main에서만 취급하며 검증한 OS 보안 저장소를 사용한다. 공급자 런타임이 저장을 소유하면 실제 저장·갱신·삭제 방식을 기록한다. 평문 파일 fallback이 발생하는 경로는 별도 확인 없이 암호화 보관으로 간주하지 않는다. 보안 저장 실패와 로그인 실패를 구분한다. 완성되지 않은 저장을 재시작 후 연결됨으로 읽지 않는다.

비밀이 아닌 계정 메타데이터에는 플랫폼, 공급자 계정/워크스페이스 식별자, 표시 이름, 도안 연결 식별자, 프로필 참조를 둔다. 이메일만으로 계정 동일성을 판정하지 않는다. 공급자가 안정된 계정 식별자를 제공하지 않으면 같은 계정의 재개를 추정하지 않고 PoC 미달로 남긴다. 연결 식별자는 다중 계정 기능이 아니라 교체·지연 응답·기록 소유권 판별에 필요하다.

도안 실행 자식에는 검증된 executable/PATH·프로필·DOAN_RUNTIME과 필요한 환경만 구성한다. 다른 공급자 토큰, 상속된 API 키, 외부 세션 ID가 선택한 인증을 덮어쓰지 않게 한다. 비밀은 명령행 인자나 로그에 넣지 않는다. 도구가 인증 환경변수를 요구하면 그 자식에만 전달하고 진단 출력에서 제거한다.

기존 doan CLI 링크와 사용자 스킬을 무조건 덮지 않는다. 앱 내부 실행은 번들 CLI의 절대 경로와 전용 프로필의 도구 설정으로 가능한지 검증한다. 추가 플랫폼도 도안 규칙을 읽고 `doan check`까지 실행해야 한다. 지원 스킬 형식이 다르면 공식 지시문·MCP 구성 중 최소 경로를 선택하고, 가이드 자체 변경이 필요할 경우 agent-eval을 작업 범위에 포함한다.

동일 플랫폼의 여러 대화가 같은 프로필을 사용할 때 토큰 갱신을 누가 쓰는지 PoC에서 확인한다. 두 실행의 동시 갱신·로그아웃 경쟁을 검증하고 공급자의 안전한 갱신 계약 또는 main 직렬화로 보호한다. 로그인 잠금만으로 공급자 소유 갱신까지 보호된다고 가정하지 않는다.

## 계정과 대화의 연결

홈에서 시작하는 새 대화와 Canvas 안의 대화는 공통 인증 실행 경로를 사용한다. UI는 토큰을 받거나 전달하지 않고 main이 프로젝트·대화·플랫폼에 맞는 연결을 해석한다.

새 도안 대화에는 플랫폼·계정/워크스페이스·연결 식별자·프로필·세션 ID를 묶는다. start/send/resume의 I/O 전후에 이 연결이 현재 상태와 같은지 재검사한다. 인증 갱신은 같은 계정 연결을 유지한다. 다른 계정 로그인은 새 연결이며 이전 대화를 자동으로 가져오지 않는다.

로그아웃은 해당 연결의 실행기가 없거나 정리됐을 때만 진행한다. 실행 중이면 사용자에게 중단을 안내한다. 중단 선택 뒤 프로세스 그룹 종료까지 확인한다. 기록은 보존하고 인증 제거 실패 시 새 실행은 계속 차단한다. 같은 계정 재로그인 시에도 안정된 계정·워크스페이스, 프로필과 실제 세션을 모두 검증한 뒤 연결을 재결합한다.

기존 외부 세션은 `legacy-external` 출처로 구별한다. 현재 셸에서 선택한 원래 프로필과 기록·점유 상태가 맞을 때 기존 경로로 재개하며, 이 동작이 도안 전용 로그인 성공을 의미하지는 않는다. 도안 인증 실패 뒤 외부 계정으로 자동 대체하지 않는다. 기존 대화를 도안 계정으로 복사·가져오기·fork하는 작업은 별도 기능이다.

추가 공급자는 기존 `OpenRunner`의 시작·전송·중단·정리 경계에 맞춘다. 공급자별 권한 응답과 오류를 정규화하되 지원하지 않는 선택지를 만들지 않는다. 상시 허용은 실제 공급자 요청이 제공할 때만 노출한다. 권한 거절과 요청 중단은 다른 결과이며, 준비 중·실행 중·종료 후 늦은 응답을 구분한다.

## 포맷과 IPC

공유 JSON Schema의 캔버스·코멘트·config·runtime·sessions v1은 변경하지 않는다. 외부 셸 세션 기록은 기존 Claude·Codex 계약을 유지한다. 앱에서 만든 추가 공급자 대화를 지원하려고 공유 세션 스키마의 runtime 열거를 넓히지 않는다. 앱 공급자 ID와 외부 세션 기록의 두-runtime 타입을 필요한 경계에서 구분한다.

장치 로컬 인증 메타데이터는 새 v1 문서로 검증한다. 토큰·인증 코드·PKCE verifier는 이 메타데이터에 넣지 않는다. 대화 `index.json`만 계정 연결을 담는 v2로 올린다. 기존 v1은 `legacy-external`로 읽는다. `store.ts`의 undo journal은 버전·계정 metadata 없이 `{id, previous}`와 파일 길이·identity를 저장하므로 포맷을 유지한다. 기존 미완료 undo 복구를 끝낸 뒤 원자적 파일 교체로 index v2를 저장한다. 기존 이벤트 JSONL v1도 유지한다. 기존 journal과 v1/v2 index의 복구, 변환 중단, 손상 파일, 알 수 없는 index 버전은 TS fixture로 검증한다. Go와 공유 포맷을 바꾸지 않으므로 신규 Go 공용 fixture는 없다.

채널 초안은 `agentAuth:read`, `agentAuth:signIn`, `agentAuth:cancel`, `agentAuth:signOut`, `agentAuth:changed`이다. 최종 이름은 기존 IPC 명명과 대조해 고정한다. 요청은 검증한 플랫폼 ID와 opaque 시도 ID만 받는다. main에서 주 창·Settings의 main frame을 명시적으로 허용하고 iframe·thumbnail·그 밖의 창은 거부한다. 두 창에는 같은 비밀 없는 상태를 발행한다. 토큰·credential path·임의 URL을 일반 상태 DTO에 넣지 않는다.

프로젝트·캔버스·권한·대화 실행 IPC의 기존 권한 경계는 유지한다. 인증 UI가 Settings에 있다고 Settings에 대화 실행 권한을 주지 않는다. 상태 구독과 초기 읽기가 교차해도 오래된 snapshot이 새 연결 상태를 덮지 않도록 단조 증가 revision으로 합친다.

## 순수 함수와 /tdd 대상

| 대상 | 입력 → 검증할 결과 |
|---|---|
| 인증 상태 전이 | 현재 상태·시도 ID·세대·사건 → 다음 상태, 오래된 성공/실패 무시 |
| 실행 준비 판정 | 인증·버전·도구 상태 → 실행 가능 여부와 복구 행동 |
| 계정 연결 판정 | 저장된 계정·workspace·프로필·현재 연결 → 재개/재인증/거부. 이메일 일치만으로 허용하지 않음 |
| 자식 환경 구성 | 공급자·전용 프로필·필요 환경 → 충돌 자격 증명과 외부 세션 ID 없는 환경 |
| 상태 DTO | 내부 오류·상태 → 비밀 없는 계정·readiness·복구 가능 동작 |
| 버전 해석 | v1/v2 index·기존 journal → 보존된 legacy 출처 또는 유효한 계정 연결, 손상·미지 버전 거부 |

지원 집합은 PoC 후 문서에서 결정한다. 앱에는 확정된 공급자 목록과 실행 준비 판정만 두며 최소 수·우선순위를 판정하는 정책 엔진을 만들지 않는다.

## UI 경계와 기존 결정 영향

이번 feature는 UI를 변경하지 않는다. `buzz-onboarding`에 에이전트 로그인 → 로컬 폴더 또는 GitHub 레포 링크로 프로젝트 선택 → 완료 후 홈 이동이라는 사용자 결정과 인증 계약을 인계한다. 온보딩에 첫 요청 단계는 없다. `buzz-home`은 프로젝트 선택 등 대화 인풋창 UI를, `buzz-conversation`은 Canvas 대화 UI를 맡는다. GitHub 저장소 인증·검증·복제는 이 feature의 구현 범위 밖이다.

도구 설치와 계정 인증 상태를 구분한다. 전용 프로필 준비에 사용자가 요청하지 않은 전역 MCP·PATH·스킬 수정을 포함하지 않는다. UI가 없는 backend는 격리한 preload 소비자로 확인하며 디자인 초안·화면 측정은 소비 feature에서 수행한다.

PRODUCT에는 백엔드 구현 완료와 후속 온보딩·홈 방향을 구분해 승격한다. ARCHITECTURE에는 인증 관리·프로필 선택·대화 연결 계약을 반영한다. Copilot을 포함하면 GitHub 토큰 미취급 규칙에 **Copilot 에이전트 인증만** 예외를 기록한다. 원격 서비스·서버·동기화는 추가하지 않는다.

캔버스 관례, iframe sandbox, serving 범위, append-only 이벤트 규칙, CLI/MCP 출력과 `doan check` 검사는 바꾸지 않는다. 외부 세션 기록과 새 인증의 연관성을 추정하지 않는다.

## 확인한 회고와 예방

아래 인용은 [POSTMORTEM](../../POSTMORTEM.md)의 원문이다.

- 2026-10-25, **An older install failure replaced newer feedback**: “bind feedback to the latest operation as well as the live component”. 로그인 취소 후 성공, 계정 교체 후 실패, 두 창 읽기 역전도 같은 방식으로 검증한다.
- 2026-10-27, **Awaited conversation work outlived its current turn**: “recheck current metadata and live execution identity after preparation and opening, before acceptance”. 인증·계정 세대를 await 뒤 다시 확인한다.
- 2026-10-27, **A session association was mistaken for stored Codex session presence**: “A filename or empty loaded-thread list is not evidence.” 계정 일치와 세션 ID만으로 재개 가능을 표시하지 않는다.
- 2026-10-27, **SDK process death reached failure classification before group release**: “A child's exit is not proof that all descendants have exited.” 로그인 프로세스와 실행기 모두 종료 확인까지 소유권을 유지한다.
- 2026-10-24, **Setup writes to missing targets could overwrite a competitor**: “create missing targets exclusively and keep rename only for confirmed replacements”. 신규 계정 메타데이터와 도구 설정을 경쟁 쓰기로 덮지 않는다.
- 2026-10-27, **A rejected conversation replacement had already changed current history**: “validate prompt and old histories first”. metadata 버전 이행·로그아웃·계정 교체 실패가 대화 기록을 지우지 않도록 검증한다.

Orca 참고는 PRODUCT PoC 10의 정적 조사 근거에 한정한다. Orca 1.4.242의 `agent-launch-account-env.js`와 `agent-session-account-home.js`에서 프로필 라우팅과 세션 연결을 확인했다. 복수 계정 구조 전체를 도안에 가져오지 않는다.
