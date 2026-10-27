# agent-auth — tasks

작성: 2026-10-27. 구현 전 문서이다. 체크가 없는 항목은 미완료이며 PoC 10의 문서 조사 완료와 혼동하지 않는다.

## 완료 게이트

Claude Code·Codex 필수, 총 3개 이상. 추가 검증·구현 순서는 Cursor → Antigravity → Copilot이다. 공식 경로로 과도한 우회 없이 가능하면 다섯 개 모두 제공한다. 다섯 개 모두의 포함·연기 근거가 있어야 하며 최소 조건 미달은 feature 미완료이다. 플랫폼별 계정은 하나이다.

이 feature는 부모가 아니다. 구현 분량상 여러 배치가 필요하면 아래 의존성을 기준으로 `/orchestrate`가 나눈다. 이번 구현은 OAuth·인증 보관과 새 대화·Canvas 대화의 공통 인증 실행 백엔드만 맡는다. UI와 프로젝트 연동은 소비 feature에 남긴다. 지금은 기획 단계이며 코드·패키지·전역 인증을 바꾸지 않는다.

## P. 실인증 PoC와 설계 고정 — 구현보다 먼저

2026-10-27 사용자 승인: 이번 PoC의 최소 게이트는 로그인·보관·새 프로세스의 인증 유지·요청 1회·로그아웃 격리이다. 실제 만료·갱신 경쟁·계정 교체·권한 허용/거절·Canvas 생성·세션 재개는 구현 통합 검증 D1로 넘긴다. 토큰 발급만으로 저장·실행까지 통과했다고 기록하지 않는다.

- [ ] P1. 다섯 후보의 공식 로그인·상태·갱신·로그아웃·필요 권한·정확한 CLI/SDK 버전을 재확인한다. 도안 전용 저장소와 외부 프로필 간 격리 방법을 표로 정리한다. 현재 Codex 0.163.0 실행 기준과 0.164.0 관측을 구분한다. 실인증 전에 공급자별 환경 허용 목록, 파일·Keychain namespace, 비밀 없는 외부 인증 전후 검사와 실패 시 정리를 확정한다. 기존 runtime 도우미의 보호 범위 부족을 보완할 재사용 지원을 정한다.
  - 검증: PRODUCT §6 PoC 10과 공식 문서를 대조하고, 각 후보에 버전·근거 링크·미확인 항목을 남긴다. 내부 전용 토큰 주입 경로를 통과로 판정하지 않는다.
- [ ] P2. Claude Code·Codex의 실제 OAuth 로그인·저장·새 프로세스의 인증 유지·요청 1회·로그아웃 격리를 검증한다. 사용자에게 필요한 브라우저 인증은 해당 실험 시 요청한다. 기존 Orca 토큰은 가져오지 않는다. 동시 갱신과 로그아웃 경쟁은 D1에서 확인할 조건으로 남긴다.
  - 검증: 아직 없는 앱 인증 기능 대신 `.scratch/`의 독립된 공식 CLI/SDK harness로 전후 상태·정리 결과를 남긴다. 2026-10-27 사용자의 PoC 시작 승인에 따라 `.scratch/agent-oauth-poc/lifecycle/login_probe.py`를 실행하며 명령·버전·결과를 근거에 남긴다. 가짜 credential 시험은 실제 OAuth 통과를 대신하지 않는다.
- [ ] P3. Cursor → Antigravity → Copilot 순으로 P2와 같은 검증표를 채운다. 도안 전용 인증 격리, 공식 동작 범위, 구현 비용을 근거로 포함·연기를 기록한다.
  - 검증: 지원 집합에 Claude Code·Codex와 추가 후보 하나 이상이 있고, 나머지 두 후보도 판정 근거가 있다. 조건 미달이면 후속 구현으로 넘어가지 않는다.
- [ ] P4. 포함 후보마다 최소 인증 게이트의 결과와 실행 기반의 공식 API를 정리한다. 권한·중단·세션 재개·도안 도구 연결의 미검증 항목을 D1에 인계한다.
  - 검증: P2·P3의 비밀 없는 결과에서 로그인·저장·새 프로세스 인증 유지·요청 1회·로그아웃 격리를 대조한다. 실제 공급자 요청을 수행할 환경·계정이 없으면 미실행으로 남긴다.
- [ ] P5. PoC 결과로 이 feature의 지원 집합·저장소·버전·IPC·오류·이행 방식과 runtime 지원 표를 고정하고 `/feature-review`를 거친다. 사용자 결정인 최소 3개·추가 순서는 PRODUCT §7로 승격할 내용에 포함한다.
  - 검증: 명세·설계·작업의 지원 집합이 같고 미해결 기술 조건이 구현 task를 막지 않는다. UI 초안과 측정은 소비 feature가 맡는다. 지원 수·우선순위는 문서 게이트이며 앱 정책 함수로 만들지 않는다.

── commit: `docs(agent-auth): record authenticated provider evidence and approved design` ──

## A. 포맷·fixture·순수 함수

- [ ] A1. 인증 상태·readiness·계정 식별·시도 세대·비밀 없는 DTO 계약과 fixture를 먼저 작성한다.
  - 검증: `/tdd` 후 `npm --prefix app test`에서 오래된 콜백, 실패한 읽기, 저장 미완료, 계정 불일치 사례가 red임을 확인한다.
- [ ] A2. 장치 로컬 인증 metadata v1, conversation index v2와 v1 읽기 fixture를 작성한다. legacy 외부 대화는 새 도안 계정으로 자동 귀속시키지 않는다. 기존 undo journal의 `{id, previous}` 포맷·이벤트·공유 sessions 스키마는 유지한다.
  - 검증: `npm --prefix app test`로 기존 journal과 v1/v2 index의 미완료 복구, v2 왕복, 미지 버전·손상·전환 중 실패·기록 보존을 확인하고 `go test ./...`로 공유 계약이 그대로인지 확인한다.
- [ ] A3. 설계의 순수 함수를 구현한다. 공급자 타입과 외부 세션 runtime 타입을 분리하고 모든 분기에 명시적 오류를 둔다.
  - 검증: A1·A2 테스트와 `npm --prefix app run typecheck` 통과. 비밀이 DTO·직렬화 fixture에 포함되지 않는다.

── commit: `feat(agent-auth): define account state and conversation ownership` ──

## B. main I/O와 공급자 실행

- [ ] B1. 전용 프로필·보안 저장·공식 로그인 프로세스·상태 확인·갱신·취소·로그아웃을 구현한다. main의 작업 잠금과 시도 수명, 자식 환경 정리, 늦은 콜백 차단, 앱 종료 정리를 연결한다.
  - 검증: `npm --prefix app test`로 지연 결과·저장 실패·삭제 실패·spawn 실패·종료 불확실성·동시 창 요청·환경 충돌을 확인한다. 테스트는 실제 계정 저장소에 접근하지 않는다.
- [ ] B2. 필수 Claude Code·Codex의 실행 준비를 새 도안 계정 연결에 맞춘다. 새 대화와 Canvas 대화가 공통 인증 경로를 쓰도록 계정 소유권을 저장하고 start/send/resume에서 재확인한다. 기존 외부 세션 경로와 점유 거부를 유지한다.
  - 검증: `npm --prefix app test`로 계정 교체 중 prepare·send, 재인증, legacy 외부 프로필, 다른 configDir, 잘못된 세션·workspace와 종료 후 늦은 응답을 확인한다.
- [ ] B3. P5에서 선택한 추가 공급자를 Cursor → Antigravity → Copilot 순서로 연결한다. 실제 메시지·권한·중단·재개와 종료를 기존 대화 경계에 맞춘다. 로그인만 된 공급자를 지원 완료로 세지 않는다.
  - 검증: `npm --prefix app test`와 `npm --prefix app run typecheck`로 공급자별 실제 protocol fixture의 정상·오류·부분 출력·취소·권한 거절·세션 충돌을 확인하고 P4의 공식 API와 미검증 목록와 대조한다.
- [ ] B4. 계정 로그아웃·교체에 실행 종료와 소유권 잠금을 연결한다. 기록은 유지하며 새 계정에서 이전 대화를 자동 실행하지 않는다. 같은 계정 재인증도 식별자·프로필·세션을 확인한다.
  - 검증: `npm --prefix app test`로 실행 중 로그아웃 거부, 중단 후 그룹 잔존, 실패한 삭제, 계정 교체 뒤 재개 거부, 동일 계정 재인증과 대화 기록 보존을 확인한다.
- [ ] B5. 인증 IPC와 preload를 연결한다. 주 창·Settings만 상태·인증 동작을 허용하고 토큰 없는 revision 상태를 공유한다. 소유 창·시도 ID로 취소 범위를 제한하고 창 종료·앱 종료 시 정리한다. 화면 코드는 변경하지 않는다.
  - 검증: `npm --prefix app test`로 잘못된 sender/frame·플랫폼·attemptId 거부, snapshot/event 역전과 구독 해제를 확인한다. `npm --prefix app run typecheck` 통과.

── commit: `feat(agent-auth): connect isolated provider authentication and runtimes` ──

## D. 통합 검증과 문서 승격

- [ ] D1. `/runtime-test`로 구현된 Electron main/preload 경로를 격리한 소비자 probe에서 확인한다. 포함된 각 플랫폼마다 OAuth 복귀·취소·실제 만료 복구·동시 갱신/로그아웃 경쟁·계정 교체·로그아웃·외부 계정 격리와 새 대화·Canvas 대화의 실제 캔버스 생성, 권한 허용·거절, 중단, 재시작 후 같은 세션 재개를 검증한다. dev와 패키지의 CLI 탐색·인증 저장 경계도 확인한다. P 단계 harness 결과로 이 검증을 대신하지 않는다.
  - 검증: `npm --prefix app run package`와 AGENTS의 격리된 dev/패키지 실행으로 상태·결과·세션·정리 근거를 남긴다. P1에서 확정한 환경·Keychain 격리와 외부 인증 전후 검사를 적용한다. 보완한 재사용 지원은 `node --test 'app/runtime/*.test.ts'`로 검증한다. 전체 e2e나 새 화면별 영구 suite는 만들지 않는다.
- [ ] D2. `/code-review` 후 수정 사항을 검증하고 필요한 `/postmortem`을 기록한다. CLI/MCP 출력·도구 설명·가이드·스킬을 변경했다면 `/agent-eval`을 수행한다.
  - 검증: `node .agents/skills/verify/scripts/verify.mjs` 통과. eval 변경이 있으면 `--eval`을 추가한다. agent-eval 조건에 해당하면 패키징 후 `node eval/run.ts`의 변경 범위 결과를 남긴다. 미실행을 통과로 기록하지 않는다.
- [ ] D3. 다섯 후보 최종 판정과 필수 두 플랫폼·총 3개 하한을 확인한다. PRODUCT §2·§3·§5·§6·§7에 지원 집합·한 계정·우선순위와 후속 온보딩·홈 방향을 구현 상태와 구분해, ARCHITECTURE에 인증·IPC·저장·버전 이행·실행기와 Copilot 포함 시 제한된 GitHub 인증 예외를 승격한다. 필요한 DIRECTORY를 갱신하고 buzz-onboarding/buzz-home/buzz-settings/buzz-conversation에 인증 API와 실행 계약을 인계한 뒤 이 feature 디렉터리를 삭제한다.
  - 검증: 영어 정본과 실제 지원 집합·프로토콜·백엔드 상태를 대조한다. 미지원 후보·미검증 제한·외부 세션 인계의 비목표가 보존돼 있고, `node .agents/skills/verify/scripts/verify.mjs`의 최종 통과 및 해당 변경의 런타임 근거가 PR에 있다.

── commit: `docs(agent-auth): promote verified authentication contracts` ──
