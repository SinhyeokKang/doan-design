# agent-cli-versions — tasks

작성: 2026-10-28. [spec](./spec.md)·[design](./design.md)을 따른다. 소비자는 `docs/features/buzz-onboarding/`이며, 그쪽 tasks가 이 기능을 Install/Update 문구의 선행 조건으로 둔다.

## F. 기획

- [x] F1. spec·design·tasks를 쓰고 두 결정을 받았다: 비호환은 실행 실패를 설치 버전의 사실로 기록하고 readiness `version_incompatible` → retry로 보인다. 새 버전 실행 증거는 단위 테스트와 미검증 기록으로 대신한다(둘 다 2026-10-28 사용자 확정).
  - 검증: 문서 대조. 코드 명령은 없다.

── commit: `docs(feature): agent-cli-versions spec, design, tasks` ──

## A. 순수 함수

- [ ] A0. 구현 전 확인: 설치된 SDK 0.3.312가 `initializationResult()`의 control protocol 오류를 프로세스 종료와 구분해 노출하는지 `app/node_modules/@anthropic-ai/claude-agent-sdk`의 타입·소스에서 확인하고 design의 'Claude 신호 확인'에 결과를 적는다.
  - 검증: 확인한 파일·심볼을 design에 남긴다. 구분할 수 없으면 Claude 분류 범위를 줄인 결과를 design에 쓴다.
- [ ] A1. `parseCliVersion`·`versionStatus`·`MINIMUM_VERSIONS`를 추가하고 `supportedRuntime`·`supportedVersion`·`sessionAvailability`·legacy/Doan 연결 준비가 이를 쓰게 한다. SDK 0.3.312 정확 일치는 유지한다.
  - 검증: `/tdd`로 먼저 빨간 테스트를 본 뒤 `npm --prefix app test`. 최소 미만·같음·초과, prerelease 경계, Cursor 빌드 해시 무시, 앞뒤 텍스트, 자릿수 비교, SDK 불일치 거부를 확인한다.
- [ ] A2. `codexRolloutAccepted`(하한 0.163.0)로 `CODEX_ROLLOUT_VERSIONS`를 대체하고, `claudeOccupancy`의 registry 버전 비교를 최소 이상으로 바꾼다.
  - 검증: `npm --prefix app test`. 0.163.0·0.164.0·0.170.0 헤더 수락, 0.162.0·해석 불가 거부, 하한 ≤ Codex 최소 불변식, 다른 존재 증거 조건(유일·첫 줄·ID·cwd) 기존 테스트 통과. registry는 최소 이상 버전 수락, 미만·해석 불가는 `unknown`.
- [ ] A3. 호환성 분류 함수(Codex 응답, ACP `initialize`·`session/new`, Claude 초기화)와 readiness `version_incompatible`(순서, 기록 유지·해제)을 추가한다.
  - 검증: `npm --prefix app test`와 `npm --prefix app run typecheck`. 종료·시간 초과·`session_in_use`·`credential_override`·`session/load` 실패가 비호환이 아닌지, `version_unsupported`가 최소 미만에서만 나오는지 확인한다.

── commit: `feat(conversation): accept agent CLIs at or above the verified minimum` ──

## B. 셸(I/O) 연결

- [ ] B1. 실행기(`runners.ts`·`acpRunner.ts`)의 비호환 판정에서 공급자·버전 기록을 호출하고, facts가 기록을 반영해 `agent-auth:changed`를 내게 한다. 수락 전 거부 코드(`runtime_unsupported`/`session_unavailable`)와 수락 뒤 `turn.failed` 코드는 바꾸지 않는다. 기록이 예약 해제·그룹 정리 순서를 바꾸지 않아야 한다.
  - 검증: `npm --prefix app test`(가짜 실행기로 비호환 initialize → 기록 → readiness `version_incompatible`, 버전 변경 → 해제, 일시 종료 → 기록 없음). 이어서 `node .agents/skills/verify/scripts/verify.mjs`.
- [ ] B2. `/runtime-test`: AGENTS의 격리 dev 실행(`DOAN_CLI=... npm --prefix app run dev -- -- --user-data-dir=<tmp>`)에서 현재 설치된 최소 버전으로 공급자별 readiness가 ready이고 새 대화가 실행되는지 짧게 확인한다. 최소보다 새 버전 실행은 설치본이 없으므로 하지 않는다.
  - 검증: `/runtime-test` 결과와 스크린샷. Copilot readiness 확인은 요청 1회 비용이 드므로 사용자 확인 뒤 실행한다.

── commit: `feat(agent-auth): report runtime-incompatible CLI versions in readiness` ──

## C. 승격과 정리

- [ ] C1. 결론을 영어로 승격한다.
  - `docs/PRODUCT.md` §3 'Agent conversation foundation contract' Transport 항목: 정확한 버전 기준을 최소 버전 + 호환성 검사로 바꾼다. §6: 2026-10-28 결정과 "최소보다 새 버전의 실제 실행 미검증"을 기록한다. §7: 새 정책, Codex rollout 하한(누적 목록 행 대체), `version_incompatible` 기록 방식, 새 버전 증거 기준을 날짜·근거와 함께 행으로 추가한다.
  - `docs/ARCHITECTURE.md` §7: Transport 항목, Agent authentication 표의 버전 열(최소 버전), Versions 항목, readiness 순서, Known limits(자동 업데이트 항목 교체, 출력 문구 의존 분류의 위험, Claude 신호 한계가 있으면 추가).
  - `docs/POSTMORTEM.md` 2026-10-27 Codex presence 항목에 follow-up 한 줄(목록 → 하한)을 덧붙인다. 기존 내용은 바꾸지 않는다.
  - 검증: 문서 대조. `CODEX_ROLLOUT_VERSIONS`·`SUPPORTED_VERSIONS`·`ACP_VERSIONS`·정확한 버전을 말하는 남은 문장이 대체 기록이거나 의도한 것인지 확인한다. 검색 명령은 AGENTS Commands에 없어 정하지 않았다(사용자 확인 필요).
- [ ] C2. `docs/features/agent-cli-versions/`를 삭제한다.
  - 검증: 문서 대조. 다른 문서에 이 디렉터리로 가는 링크가 남지 않는다.

── commit: `docs: promote agent-cli-versions decisions` / `docs(agent-cli-versions): remove the finished feature directory` ──
