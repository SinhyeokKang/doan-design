# agent-auth — tasks

작성: 2026-10-27. 구현 전 문서이다. 체크가 없는 항목은 미완료이며 PoC 10의 문서 조사 완료와 혼동하지 않는다.

## 완료 게이트

Claude Code·Codex·Cursor·Antigravity·GitHub Copilot 다섯 플랫폼을 모두 제공한다. 플랫폼별 계정은 하나이다. 추가 구현 순서는 Cursor → Antigravity → Copilot이다. 이전 최소 3개·조건부 다섯 개 계획은 2026-10-27 사용자 결정으로 대체됐다. 하나라도 제품 통합 검증이 미완료이면 feature 완료로 처리하지 않는다.

이 feature는 부모가 아니다. 구현 분량상 여러 배치가 필요하면 아래 의존성을 기준으로 `/orchestrate`가 나눈다. 이번 구현은 OAuth·인증 보관과 새 대화·Canvas 대화의 공통 인증 실행 백엔드만 맡는다. UI와 프로젝트 연동은 소비 feature에 남긴다. 지금은 기획 단계이며 코드·패키지·전역 인증을 바꾸지 않는다.

## P. 최소 인증 PoC — 완료

2026-10-27 사용자 승인: 최소 게이트는 로그인·보관·새 프로세스의 인증 유지·요청 1회·로컬 로그아웃 격리이다. 파일 암호화는 B1, 실제 만료·갱신 경쟁·계정 교체·권한·Canvas 생성·세션 재개는 D1에서 검증한다. [PoC 결과](./poc.md)는 제품 구현 완료를 뜻하지 않는다.

- [x] P1. Claude Code 2.1.310·Codex 0.164.0의 별도 브라우저 로그인, Keychain 보관, 새 프로세스 인증·요청, 전용 항목 삭제를 확인했다.
  - 검증: `claude-lifecycle.json`, `codex-lifecycle.json`의 요청 exit 0·marker와 로그아웃·외부 메타데이터 결과를 대조했다. 현재 앱 Codex 0.163.0의 업그레이드 검증은 B2·D1에 남긴다.
- [x] P2. Cursor 2026.10.22-27dcf5f·Antigravity 1.4.8·Copilot 1.0.104의 무료 계정 로그인·전용 파일 보관·새 프로세스 요청·로컬 연결 해제를 확인했다.
  - 검증: `cursor-lifecycle.json`, `antigravity-authenticated.json`, `copilot-authenticated.json`의 marker·저장·로그아웃 결과를 대조했다. Copilot 기본 `/logout` 실패와 도안 소유 파일 삭제 뒤 미인증 결과를 구분한다. 외부 검사는 메타데이터 비교이며 서버 인증 유효성 검증은 아니다.
- [x] P3. 다섯 플랫폼 제공과 암호화 후속 구현 결정을 spec·design·tasks·PRODUCT에 반영했다.
  - 검증: 지원 집합과 UI 제외 범위가 일치한다. 아래 구현 작업에 저장 암호화·제품용 공식 인증 연결·실행 프로토콜·통합 검증을 배정했다. 추가 PoC나 지원 집합 재선정 없이 `/orchestrate`를 시작할 수 있다.

## `/orchestrate` 배치 인계

아래는 배치 소유권과 의존성이다. 시작 시 conductor가 `orch.md`에 시작 SHA·브랜치·모델과 effort·검증 상태를 기록한다. 이 문서 갱신은 orchestrate 실행이나 worker 시작을 뜻하지 않는다. P1–P3은 완료 근거이며 conductor가 인수한다. 새 UI가 없으므로 디자인 초안·화면 측정은 없다.

| 배치 | 작업 | 파일 소유 범위 | 선행 | 검증 |
|---|---|---|---|---|
| 계약 | A1–A3 | 인증 공용 타입·순수 함수·fixture, `conversation/store.ts`와 index 이행 테스트 | P 완료 | 각 A 항목의 단위·타입·Go 계약 검사 |
| 인증 저장 | B1 | main 인증 모듈과 provider 인증 adapter·테스트, 필요한 `app/runtime/` 격리 지원 | 계약 | B1의 암호화·수명·격리 검사 |
| 기본 실행 | B2 | `setupBroker.ts`, `conversation/{prepare,environment,runners,service,ownership}.ts`와 Claude·Codex adapter·테스트 | 인증 저장 | B2와 기존 외부 세션 회귀 |
| 추가 실행 | B3 | Cursor·Antigravity·Copilot adapter·테스트, 같은 conversation 실행 연결부, 필요한 의존성 manifest/lock | 기본 실행 | B3의 protocol fixture·타입 검사 |
| IPC·연결 해제 | B4–B5 | main 인증·conversation 소유권, IPC·preload·관련 공용 타입과 테스트 | 추가 실행 | B4–B5의 경쟁·sender·구독 검사 |
| 통합 | D1–D3 | `.scratch/` probe·검증 근거, 정본 문서와 소비 feature 인계 | IPC·연결 해제 | D1 실앱, D2 리뷰·공유 gate, D3 승격 |

공용 타입·conversation 파일이 겹치므로 기본 순서는 표대로 직렬이다. 독립 파일로 분리한 뒤에만 conductor가 `orch.md`에서 병렬 소유권을 확정한다. 테스트는 해당 구현 배치 소유이다. 의존성 추가·버전 고정은 해당 배치가 공식 계약을 확인하고 수행한다. 통합에서 발견한 코드 수정은 소유 배치로 돌린다.

## A. 포맷·fixture·순수 함수

- [x] A1. 인증 상태·readiness·계정 식별·시도 세대·비밀 없는 DTO 계약과 fixture를 먼저 작성한다.
  - 검증: `/tdd` 후 `npm --prefix app test`에서 오래된 콜백, 실패한 읽기, 저장 미완료, 계정 불일치 사례가 red임을 확인한다.
- [x] A2. 장치 로컬 인증 metadata v1, conversation index v2와 v1 읽기 fixture를 작성한다. legacy 외부 대화는 새 도안 계정으로 자동 귀속시키지 않는다. 기존 undo journal의 `{id, previous}` 포맷·이벤트·공유 sessions 스키마는 유지한다.
  - 검증: `npm --prefix app test`로 기존 journal과 v1/v2 index의 미완료 복구, v2 왕복, 미지 버전·손상·전환 중 실패·기록 보존을 확인하고 `go test ./...`로 공유 계약이 그대로인지 확인한다.
- [x] A3. 설계의 순수 함수를 구현한다. 공급자 타입과 외부 세션 runtime 타입을 분리하고 모든 분기에 명시적 오류를 둔다.
  - 검증: A1·A2 테스트와 `npm --prefix app run typecheck` 통과. 비밀이 DTO·직렬화 fixture에 포함되지 않는다.

── commit: `feat(agent-auth): define account state and conversation ownership` ──

## B. main I/O와 공급자 실행

- [x] B1. 다섯 플랫폼의 전용 프로필·암호화 보관·공식 로그인 프로세스·상태 확인·갱신·취소·로그아웃을 구현한다. Cursor·Antigravity·Copilot의 공급자 파일과 암호화 저장소 사이에 생성·갱신 반영·삭제·비정상 종료 복구를 연결한다. Antigravity 원격 환경 모사와 Copilot Keychain 차단은 PoC 전용이다. 제품에서 사용할 공식 저장 경로를 확인하고 외부 인증 공유나 OS 초기화 경고 없이 연결한다. main의 작업 잠금과 시도 수명, 자식 환경 정리, 늦은 콜백 차단, 앱 종료 정리를 연결한다.
  - 검증: `npm --prefix app test`로 지연 결과·저장 실패·삭제 실패·spawn 실패·종료 불확실성·동시 창 요청·환경 충돌을 확인한다. 암호화 왕복·키 접근 실패·평문 잔존 복구·갱신 반영·삭제 실패를 검사한다. 테스트는 실제 계정 저장소에 접근하지 않는다. `node --test 'app/runtime/*.test.ts'`로 확장한 환경 허용 목록·외부 상태 보호를 검증한다.
- [x] B2. Claude Code·Codex의 실행 준비를 새 도안 계정 연결에 맞춘다. 새 대화와 Canvas 대화가 공통 인증 경로를 쓰도록 계정 소유권을 저장하고 start/send/resume에서 재확인한다. 기존 외부 세션 경로와 점유 거부를 유지한다.
  - 검증: `npm --prefix app test`로 계정 교체 중 prepare·send, 재인증, legacy 외부 프로필, 다른 configDir, 잘못된 세션·workspace와 종료 후 늦은 응답을 확인한다.
- [x] B3. Cursor → Antigravity → Copilot 모두 연결한다. 정확한 공식 SDK/CLI API와 버전을 확인해 고정하고 문서화한다. 실제 메시지·권한·중단·재개와 종료를 기존 대화 경계에 맞춘다. 로그인만 된 공급자를 지원 완료로 세지 않는다.
  - 검증: `npm --prefix app test`와 `npm --prefix app run typecheck`로 공급자별 실제 protocol fixture의 정상·오류·부분 출력·취소·권한 거절·세션 충돌을 확인하고 design의 공식 API와 PoC의 미검증 목록을 대조한다. 권한·중단·재개 API가 확인되지 않으면 우회나 플랫폼 제외 없이 해당 작업 미완료로 보고한다.
- [ ] B4. 계정 로그아웃·교체에 실행 종료와 소유권 잠금을 연결한다. Copilot은 기본 `/logout`에 의존하지 않고 소유 실행 종료 뒤 전용 인증을 삭제하고 미인증 상태를 확인한다. 인증 없는 설정 파일 재생성은 허용한다. 기록은 유지하며 새 계정에서 이전 대화를 자동 실행하지 않는다. 같은 계정 재인증도 식별자·프로필·세션을 확인한다.
  - 검증: `npm --prefix app test`로 실행 중 로그아웃 거부, 중단 후 그룹 잔존, 실패한 삭제, 계정 교체 뒤 재개 거부, 동일 계정 재인증과 대화 기록 보존을 확인한다.
- [ ] B5. 인증 IPC와 preload를 연결한다. 주 창·Settings만 상태·인증 동작을 허용하고 토큰 없는 revision 상태를 공유한다. 소유 창·시도 ID로 취소 범위를 제한하고 창 종료·앱 종료 시 정리한다. 화면 코드는 변경하지 않는다.
  - 검증: `npm --prefix app test`로 잘못된 sender/frame·플랫폼·attemptId 거부, snapshot/event 역전과 구독 해제를 확인한다. `npm --prefix app run typecheck` 통과.

── commit: `feat(agent-auth): connect isolated provider authentication and runtimes` ──

## D. 통합 검증과 문서 승격

- [ ] D1. `/runtime-test`로 구현된 Electron main/preload 경로를 격리한 소비자 probe에서 확인한다. 다섯 플랫폼 모두에서 OAuth 복귀·취소·실제 만료 복구·동시 갱신/로그아웃 경쟁·계정 교체·로그아웃·외부 계정 격리와 새 대화·Canvas 대화의 실제 캔버스 생성, 권한 허용·거절, 중단, 재시작 후 같은 세션 재개를 검증한다. dev와 패키지의 CLI 탐색·인증 저장 경계도 확인한다. P 단계 harness 결과로 이 검증을 대신하지 않는다.
  - 검증: `npm --prefix app run package`와 AGENTS의 격리된 dev/패키지 실행으로 상태·결과·세션·정리 근거를 남긴다. B1에서 구현한 환경·저장소 격리와 외부 인증 전후 검사를 적용한다. 보완한 재사용 지원은 `node --test 'app/runtime/*.test.ts'`로 검증한다. 전체 e2e나 새 화면별 영구 suite는 만들지 않는다.
- [ ] D2. `/code-review` 후 수정 사항을 검증하고 필요한 `/postmortem`을 기록한다. CLI/MCP 출력·도구 설명·가이드·스킬을 변경했다면 `/agent-eval`을 수행한다.
  - 검증: `node .agents/skills/verify/scripts/verify.mjs` 통과. eval 변경이 있으면 `--eval`을 추가한다. agent-eval 조건에 해당하면 패키징 후 `node eval/run.ts`의 변경 범위 결과를 남긴다. 미실행을 통과로 기록하지 않는다.
- [ ] D3. 다섯 플랫폼 모두의 제품 통합 검증을 확인한다. PRODUCT §2·§3·§5·§6·§7에 지원 집합·한 계정·암호화 보관과 후속 온보딩·홈 방향을 구현 상태와 구분해, ARCHITECTURE에 인증·IPC·저장·버전 이행·실행기와 Copilot에 한정된 GitHub 인증 예외를 승격한다. 필요한 DIRECTORY를 갱신하고 buzz-onboarding/buzz-home/buzz-settings/buzz-conversation에 인증 API와 실행 계약을 인계한 뒤 이 feature 디렉터리를 삭제한다.
  - 검증: 영어 정본과 실제 지원 집합·프로토콜·백엔드 상태를 대조한다. 미검증 제한·외부 세션 인계의 비목표가 보존돼 있고, `node .agents/skills/verify/scripts/verify.mjs`의 최종 통과 및 해당 변경의 런타임 근거가 PR에 있다.

── commit: `docs(agent-auth): promote verified authentication contracts` ──
