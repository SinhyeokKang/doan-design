# agent-cli-versions — spec

작성: 2026-10-28. 상태: feature-review 반영(2026-10-28). 구현은 시작하지 않는다.

## 배경과 결정

2026-10-28 사용자 결정(buzz-onboarding feature-review 중 다른 세션): 에이전트 CLI의 정확한 버전 고정을 **검증된 최소 버전 + 실행 시점 호환성 검사**로 바꾼다. 최소 버전 이상이면 받아들이고, 실행 중 프로토콜 형식 검사가 실패할 때만 거부한다. 같은 결정에서 사용자는 이 정책의 PRODUCT·ARCHITECTURE 기록을 이 feature가 맡도록 정했다(main의 buzz-onboarding design 'agent-auth 인계'). 그래서 마지막 작업 C1 전까지 PRODUCT에는 아직 기록이 없다.

현재 계약은 [ARCHITECTURE §7 'Agent authentication'](../../ARCHITECTURE.md#agent-authentication-2026-10-28-agent-auth)의 Versions·Known limits, 같은 절 'Agent conversation runtime and IPC'의 Transport 항목, PRODUCT §3 'Agent conversation foundation contract', §7의 2026-10-27 agent-conversation D1 행("exact verified versions only, no unverified range")과 2026-10-28 행에 있다.

## 사용자

- **사람**: 온보딩·Settings에서 공급자 상태를 본다. CLI가 없으면 Install, 설치된 버전이 최소보다 낮으면 Update 안내를 받는다. "CLI가 고정 버전보다 새로우니 Doan을 업데이트하라"는 경우는 더 이상 없다. 사전 탐지가 없으므로 비호환은 첫 실행에서 드러난다. 실제로 이 상태를 보는 곳은 온보딩보다 홈의 첫 대화와 Settings이다. 유일한 공급자가 비호환이면 사람은 다른 공급자에 로그인하거나 CLI 버전을 바꾼 뒤 다시 확인해야 한다. 이 복구 경로의 화면은 buzz-conversation·buzz-settings가 맡는다.
- **에이전트**: buzz-onboarding이 계획한 `doan onboarding status`로 공급자 readiness를 받으므로 새 cause도 그 경로로 받는다. 실행 측면에서는 Doan 연결의 네 공급자(Claude Code·Codex·Cursor·Copilot)와 shell 연결(legacy external)의 Claude Code·Codex가 최소 버전 이상에서 대화를 실행한다.

## 문제 (관찰된 사실)

- 설치된 CLI 버전이 Claude Code 2.1.312, Codex 0.164.0(`SUPPORTED_VERSIONS`, `app/src/main/conversation/sessions.ts`), Cursor `2026.10.22-27dcf5f`, Copilot `1.0.105`(`ACP_VERSIONS`, `app/src/main/conversation/prepare.ts`)와 정확히 같아야 한다. Cursor는 빌드 접미사까지 같아야 한다. 다른 버전은 readiness `version_unsupported`이고 실행은 거부된다.
- Cursor와 Copilot은 스스로 업데이트한다(ARCHITECTURE §7 Known limits). 그래서 사용자가 아무것도 하지 않아도 그 공급자가 실행되지 않게 된다.
- buzz-onboarding은 최소 한 공급자가 ready여야 끝나고 Skip이 없다(2026-10-28 사용자 확정). CLI가 자동 업데이트된 사용자는 온보딩을 마칠 수 없다.
- 정확한 버전 비교가 다른 곳에도 있다. Claude 세션 registry(`sessions/<pid>.json`)의 `version`이 2.1.312와 다르면 occupancy가 `unknown`이 되어 재개할 수 없다(`io.ts` `claudeOccupancy`). Codex rollout 헤더는 누적 목록 `CODEX_ROLLOUT_VERSIONS`(0.163.0, 0.164.0)에 있어야 한다(`io.ts`). 최소 버전 정책에서는 목록에 없는 새 버전이 만든 rollout을 Doan이 다시 찾지 못한다.
- `--version`이 exit 0인데 출력에서 버전을 찾지 못하면 지금은 `version_unsupported` → update이다(`agentAuth/facts.ts`). 업데이트가 답이라는 근거가 없다.

## 완료 조건

1. Claude Code·Codex·Cursor·Copilot의 설치 버전이 공급자별 최소 버전 이상이면 readiness가 버전 때문에 막히지 않는다. 비교는 첫 `x.y.z`(core)로만 하고 접미사(`-beta`, Cursor 빌드 해시 등)는 비교하지 않는다. 낮으면 `version_unsupported` → update이다. 출력에서 버전을 찾지 못하면 `version_unknown` → retry이다. 이것은 지금 동작(`version_unsupported`)을 바꾸는 것이다(2026-10-28 사용자 확정).
2. 최소 버전은 현재 검증된 고정 버전이다: Claude Code 2.1.312, Codex 0.164.0, Cursor 2026.10.22, Copilot 1.0.105. 번들 Agent SDK 0.3.312와 Antigravity ACP 서버 1.3.0(Doan이 내려받는 sha 고정본)은 정확한 버전을 유지한다.
3. Doan 연결 실행에서 새 세션 handshake가 비호환 증거를 내면 실행이 거부된다. 오류 코드는 지금 각 지점의 코드를 유지한다(2026-10-28 사용자 확정). 거부를 반환하기 **전에** 그 설치 버전을 비호환으로 기록하고 `agent-auth:changed`를 발행한다. readiness는 `version_incompatible` → retry가 된다.
4. 비호환 증거는 새 세션 handshake의 프로토콜 형식 위반뿐이다(2026-10-28 사용자 확정). Codex `initialize`·`thread/start`, ACP(Cursor·Copilot) `initialize`·`session/new`가 대상이다. Claude, Antigravity, 재개(`thread/resume`·`session/load`), 턴 중 오류, legacy external 실행은 기록하지 않는다(legacy 제외도 2026-10-28 사용자 확정). 프로세스 종료·시간 초과·로그인·rate limit·`session_in_use`는 기존 코드를 유지한다.
5. 기록은 실행을 미리 막지 않는다. 같은 버전이라도 다음 실행은 다시 시도한다. 다음 경우에 기록이 지워지고 readiness가 갱신된다(2026-10-28 사용자 확정): 실행 준비가 기록과 다른 설치 버전을 읽을 때, 같은 버전의 handshake가 성공할 때, 앱을 다시 시작할 때.
6. 버전 원인(`version_unknown`·`version_incompatible`)일 때 `actions`에 retry가 들어간다. 그 상태의 `agent-auth:check`는 tool facts만 다시 읽고 상태 확인(Copilot은 모델 요청 1회)을 하지 않는다(2026-10-28 사용자 확정).
7. 최소 버전 이상인 버전이 만든 세션도 다시 찾는다. Codex rollout 헤더는 고정 하한 0.163.0 이상의 `cli_version`을 받아들인다. Claude registry는 고정 하한 2.1.312 이상의 `version`을 받아들인다(2026-10-28 사용자 확정). 두 하한은 최소 버전을 올려도 따라 올라가지 않는다. 그 밖의 세션 존재 증거 조건은 바뀌지 않는다.
8. shell 연결(legacy external) 경로의 resume 미리보기·실행도 같은 최소 버전 규칙을 쓴다.
9. 버전 비교·호환성 분류·기록·readiness 판정은 단위 테스트로 고정한다. 현재 설치된 최소 버전으로 실제 앱 probe를 한다. 공급자마다 readiness cause가 `version_*`가 아니고 새 대화 1회가 `turn.done`에 도달해야 한다. Claude(legacy external)·Codex는 저장된 대화 재개 1회를 확인한다. 최소보다 새 버전의 실제 실행은 이 Mac에 없어 PRODUCT §6에 미검증으로 남긴다(2026-10-28 사용자 확정). 새 버전이 설치되면 그때 확인한다.
10. PRODUCT(§3 계약, §6 증거, §7 결정 로그)와 ARCHITECTURE §7이 새 정책을 기록한다.

## 비목표

- 최대 버전·검증된 상한·"새 버전 경고"를 두지 않는다.
- readiness 시점의 사전 호환성 probe를 하지 않는다(2026-10-28 사용자 확정).
- 기존 오류 코드를 정리하거나 통일하지 않는다.
- Doan이 공급자 CLI를 설치·업데이트·다운그레이드하지 않는다. Antigravity 서버 다운로드는 기존 예외 그대로다.
- Status DTO에 설치 버전이나 최소 버전 숫자를 노출하지 않는다. readiness cause 값 하나와 버전 원인의 retry action만 추가한다.
- 로그인·상태·로그아웃 출력 파싱(Claude 링크, `cursor-agent status --format json`, Copilot 로그인 출력 등)의 버전별 변화는 비호환 기록 대상이 아니다. 기존 `sign_in_failed`·`check_failed`로 남는다.
- 번들 SDK 버전 정책, Antigravity 서버 버전 정책은 바꾸지 않는다.
- 온보딩 Install/Update 문구와 상태 대응 표는 buzz-onboarding F6이, 홈·Settings의 비호환 복구 화면은 buzz-conversation·buzz-settings가 맡는다.
