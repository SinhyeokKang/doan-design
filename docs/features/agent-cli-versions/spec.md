# agent-cli-versions — spec

작성: 2026-10-28. 상태: feature 초안. 구현은 시작하지 않는다.

## 배경과 결정

2026-10-28 사용자 결정(buzz-onboarding feature-review 중 다른 세션): 에이전트 CLI의 정확한 버전 고정을 **검증된 최소 버전 + 실행 시점 호환성 검사**로 바꾼다. 최소 버전 이상이면 받아들이고, 실행 중 프로토콜·세션 형식 검사가 실패할 때만 거부한다.

현재 계약은 [ARCHITECTURE §7 'Agent authentication'](../../ARCHITECTURE.md#agent-authentication-2026-10-28-agent-auth)의 Versions·Known limits, 같은 절 'Agent conversation runtime and IPC'의 Transport 항목, PRODUCT §3 'Agent conversation foundation contract'와 §7의 2026-10-28 행에 있다.

## 사용자

- **사람**: 온보딩·Settings에서 공급자 상태를 본다. CLI가 없으면 Install, 설치된 버전이 최소보다 낮으면 Update 안내를 받는다. "CLI가 고정 버전보다 새로우니 Doan을 업데이트하라"는 경우는 더 이상 없다.
- **에이전트**: 직접 쓰는 기능은 없다. Doan 연결과 shell 연결(legacy external) 양쪽에서 최소 버전 이상인 Claude Code·Codex·Cursor·Copilot이 대화를 실행한다.

## 문제 (관찰된 사실)

- Claude Code 2.1.312 + Agent SDK 0.3.312, Codex 0.164.0(`SUPPORTED_VERSIONS`, `app/src/main/conversation/sessions.ts`), Cursor `2026.10.22-27dcf5f`, Copilot `1.0.105`(`ACP_VERSIONS`, `app/src/main/conversation/prepare.ts`)와 정확히 같아야 한다. Cursor는 빌드 접미사까지 같아야 한다. 다른 버전은 readiness `version_unsupported`이고 실행은 `runtime_unsupported`(새 세션) 또는 `session_unavailable`(저장된 대화)로 거부된다.
- Cursor와 Copilot은 스스로 업데이트한다(ARCHITECTURE §7 Known limits). 그래서 사용자가 아무것도 하지 않아도 그 공급자가 실행되지 않게 된다.
- buzz-onboarding은 최소 한 공급자가 ready여야 끝나고 Skip이 없다(2026-10-28 사용자 확정). CLI가 자동 업데이트된 사용자는 온보딩을 마칠 수 없다.
- 정확한 버전 비교가 다른 곳에도 있다. Claude 세션 registry(`sessions/<pid>.json`)의 `version`이 2.1.312와 다르면 occupancy가 `unknown`이 되어 재개할 수 없다(`io.ts` `claudeOccupancy`). Codex rollout 헤더는 누적 목록 `CODEX_ROLLOUT_VERSIONS`(0.163.0, 0.164.0)에 있어야 한다(`io.ts`). 최소 버전 정책에서는 목록에 없는 새 버전이 만든 rollout을 Doan이 다시 찾지 못한다.

## 완료 조건

1. Claude Code·Codex·Cursor·Copilot의 설치 버전이 공급자별 최소 버전 이상이면 readiness가 버전 때문에 막히지 않는다. 낮으면 `version_unsupported` → update이다. 버전 출력을 읽을 수 없으면 지금처럼 `version_unknown` → retry이다.
2. 최소 버전은 현재 검증된 고정 버전이다: Claude Code 2.1.312, Codex 0.164.0, Cursor 2026.10.22(빌드 접미사 무시), Copilot 1.0.105. 번들 Agent SDK 0.3.312와 Antigravity ACP 서버 1.3.0(Doan이 내려받는 sha 고정본)은 정확한 버전을 유지한다.
3. 최소 버전 이상인 CLI가 실행 시점 호환성 검사에 실패하면 실행이 새 세션은 `runtime_unsupported`, 저장된 대화는 `session_unavailable`로 거부된다. 실패는 그 설치 버전의 사실로 기록되고 readiness가 `version_incompatible` → retry가 된다(2026-10-28 사용자 확정). retry는 버전을 다시 읽는다. 버전이 바뀌었거나 앱을 다시 시작하면 기록이 사라진다. 사전 탐지(readiness 시점 handshake)는 하지 않으므로, 첫 실행 전까지는 ready로 보인다.
4. 호환성 검사는 명시적인 프로토콜 형식 증거만 비호환으로 본다. 프로세스 종료·시간 초과·로그인·rate limit·session_in_use 같은 기존 오류는 기존 코드를 유지하고 비호환을 기록하지 않는다.
5. 최소 버전 이상인 버전이 만든 세션도 다시 찾는다. Codex rollout 헤더는 하한(0.163.0) 이상의 `cli_version`을, Claude registry는 최소 버전 이상의 `version`을 받아들인다. 그 밖의 세션 존재 증거 조건은 바뀌지 않는다.
6. shell 연결(legacy external) 경로의 resume 미리보기·실행도 같은 최소 버전 규칙을 쓴다.
7. 버전 비교·호환성 분류·readiness 판정은 단위 테스트로 고정한다. 현재 설치된 최소 버전으로 실제 앱 probe를 한다. 최소보다 새 버전의 실제 실행은 이 Mac에 없어 PRODUCT §6에 미검증으로 남긴다(2026-10-28 사용자 확정). 새 버전이 설치되면 그때 확인한다.
8. PRODUCT(§3 계약, §6 증거, §7 결정 로그)와 ARCHITECTURE §7이 새 정책을 기록한다.

## 비목표

- 최대 버전·검증된 상한·"새 버전 경고"를 두지 않는다.
- readiness 시점의 사전 호환성 probe를 하지 않는다(사용자 확정 2026-10-28).
- Doan이 공급자 CLI를 설치·업데이트·다운그레이드하지 않는다. Antigravity 서버 다운로드는 기존 예외 그대로다.
- Status DTO에 설치 버전이나 최소 버전 숫자를 노출하지 않는다. readiness cause에 값 하나만 추가한다.
- 로그인·상태·로그아웃 출력 파싱(Claude 링크, `cursor-agent status --format json`, Copilot 로그인 출력 등)의 버전별 변화는 비호환 기록 대상이 아니다. 기존 `sign_in_failed`·`check_failed`로 남는다.
- 번들 SDK 버전 정책, Antigravity 서버 버전 정책은 바꾸지 않는다.
- 온보딩 Install/Update 문구와 화면은 buzz-onboarding이 맡는다.
