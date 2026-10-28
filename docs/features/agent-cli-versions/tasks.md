# agent-cli-versions — tasks

작성: 2026-10-28. feature-review 반영(2026-10-28). [spec](./spec.md)·[design](./design.md)을 따른다. 소비자는 buzz-onboarding이다. 로컬 main의 `docs/features/buzz-onboarding/tasks.md` F6이 이 feature의 main 병합을 Install·Update 조건과 상태 대응 표 갱신의 선행 조건으로 둔다. 그 커밋은 이 브랜치의 기준인 origin/main(`df51680`)에는 아직 없다.

커밋 규칙: A·B 그룹은 `/ship`·`/orchestrate`의 순서대로 `test:` 커밋(빨간 테스트) 뒤에 `feat:` 커밋을 둔다. C 그룹은 문서별로 커밋한다.

## F. 기획

- [x] F1. spec·design·tasks를 쓰고 두 결정을 받았다: 비호환은 실행 실패를 설치 버전의 사실로 기록하고 readiness `version_incompatible` → retry로 보인다. 새 버전 실행 증거는 단위 테스트와 미검증 기록으로 대신한다(둘 다 2026-10-28 사용자 확정).
  - 검증: 문서 대조. 코드 명령은 없다.
- [x] F2. `/feature-review`(product·tech·QA·UX/UI)를 하고 일곱 결정과 일괄 수정을 받았다(2026-10-28 사용자 확정). 결정은 기록 해제, 버전 원인의 retry, legacy 미기록, handshake만 기록, 오류 코드 유지, core 비교, registry 고정 하한이다.
  - 검증: 문서 대조. 코드 명령은 없다.

── commit: `docs(feature): agent-cli-versions spec, design, tasks` / `docs(feature): agent-cli-versions apply review feedback` ──

## A. 순수 함수

- [ ] A1. `parseCliVersion`·`versionStatus`·`MINIMUM_VERSIONS`를 추가하고, legacy 준비(`prepare.ts:40–41`)와 Doan 연결 준비(`prepare.ts:95·145`), `supportedRuntime`·`sessionAvailability`, `facts.ts`가 이를 쓰게 한다. SDK 정확 일치는 실행 시점 인자를 없애고 테스트 불변식으로 옮긴다. `ToolFacts`에 내부 `installed`를 더한다.
  - 검증: `/tdd`로 먼저 빨간 테스트를 본 뒤 `npm --prefix app test`.
    - 최소 미만·같음·초과와 자릿수 비교
    - 접미사(`-27dcf5f`, `-beta.1`, `+build`) 무시, 접미사 없는 Cursor, 네 CLI의 실제 출력
    - exit 0인데 버전이 없으면 `unknown`
    - `installed`가 Status DTO에 없음, Antigravity는 `versionStatus`를 거치지 않음, SDK 상수 = `app/package.json` 버전
  - 뒤집히는 기존 테스트도 함께 고친다. 거부 케이스는 최소 미만 값(`2.1.311`, `0.162.0`, `2026.10.21`, `1.0.104`)으로 바꾸고, 초과 값은 수락 케이스로 옮긴다.
    - `facts.test.ts:13–18`(`9.9.9`)
    - `account.test.ts:147–160`(`2026.10.23-0aa1111`), `account.test.ts:255`
    - `prepare.test.ts:70–71`(SDK)
    - `sessions.test.ts`의 정확 버전 케이스
- [ ] A2. `storedVersionAtLeast`와 두 하한(Codex rollout 0.163.0, Claude registry 2.1.312)으로 `CODEX_ROLLOUT_VERSIONS`와 registry 정확 비교를 대체한다. `io.ts:86–90`·`prepare.ts:90–91·108–110` 주석과 `fixtures/README.md`를 고친다. fixture README에는 "fixture는 0.163.0·0.164.0과 현재 최소 버전에서 왔고, 그보다 새 버전은 미검증"을 쓴다.
  - 검증: `npm --prefix app test`.
    - rollout 헤더: 0.163.0·0.164.0·0.170.0 수락, 0.162.0·`v0.164.0`·`0.164.0 x`·숫자·null 거부
    - 기존 `prepare.test.ts:43–49`의 `wrong-version`(0.165.0)은 수락 케이스로 옮기고 0.162.0 거부를 추가한다
    - `prepare.test.ts:64–65`의 목록 불변식은 하한 ≤ 최소 불변식으로 바꾼다
    - 다른 존재 증거 조건(유일·첫 줄·ID·cwd) 기존 테스트 통과
    - registry: 2.1.312 이상 수락. 다른 세션의 하한 미만·형식 불일치 record 하나가 프로필 전체를 `unknown`으로 만드는지 확인한다(의도된 fail closed).
- [ ] A3. handshake 판정 함수와 readiness·actions·기록 적용(`version_incompatible` 순서, 버전 원인의 `retry` action, facts `installed`와 기록의 일치·불일치)을 추가한다.
  - 검증: `npm --prefix app test`와 `npm --prefix app run typecheck`.
    - Codex `initialize` error·비객체, `thread/start` id 없음, ACP `initialize` 형식·`protocolVersion`·auth method·`session/new` id 없음 → incompatible
    - 다음은 incompatible이 아니다: 재개(`thread/resume`·`session/load`·`loadSession` 없음), 종료, 시간 초과, 쓰기 실패, 버퍼·큐 한도, `session_in_use`, `credential_override`, Claude, Antigravity
    - `version_unsupported`는 최소 미만에서만 나온다
    - 연결 없는 공급자의 버전 원인에서 `actions`가 signIn과 retry를 함께 가진다

── commit: `test(conversation): pin minimum-version and compatibility rules` / `feat(conversation): accept agent CLIs at or above the verified minimum` ──

## B. 셸(I/O) 연결

- [ ] B1. 다음을 연결한다.
  - `Prepared`(`service.ts`)에 `incompatible`·`compatible` 클로저를 더하고, `createAccountPrepare`가 145행의 설치 버전으로 만든다.
  - Codex(`runners.ts`)와 ACP(`acpRunner.ts`, Cursor·Copilot만)의 새 세션 handshake에서 클로저를 부른다. 오류를 던지기 전에 부른다.
  - AuthIpc가 기록을 보관한다. 기록하면 `changed()`를 직접 발행하고, `snapshot()`에서 적용한다.
  - 버전 원인일 때 `agent-auth:check`는 facts만 다시 읽고 `{ok: true}`를 돌려준다.
  - prepare가 기록과 다른 설치 버전을 읽으면 기록을 지우고 `refreshTools`를 부른다.
  - `index.ts`에서 연결한다. legacy `createPrepare`에는 연결하지 않는다. 오류 코드는 바꾸지 않는다. 기록이 예약 해제·그룹 정리 순서를 바꾸지 않아야 한다.
  - 검증: `npm --prefix app test`(가짜 실행기·가짜 probe). 이어서 `node .agents/skills/verify/scripts/verify.mjs`.
    - 비호환 initialize가 들어오면 IPC 거부가 반환되기 전에 기록되고 `changed`가 1회 발행된다. 이때 같은 버전 facts여도 발행된다.
    - 기록 전에 시작한 refresh가 늦게 끝나도 `version_incompatible`이 유지된다.
    - 같은 버전의 성공 handshake는 기록을 지운다.
    - prepare가 다른 설치 버전(Cursor 자가 업데이트)을 읽으면 기록이 지워진다.
    - 일시 종료나 시간 초과는 기록하지 않는다.
    - legacy Claude·Codex 실행은 기록하지 않는다.
    - Antigravity는 `initialize` 불일치에서 기록하지 않고 facts가 `supported`로 남는다.
    - Copilot `version_incompatible`에서 check를 불러도 `backend.check`가 호출되지 않는다.
- [ ] B2. `/runtime-test`: AGENTS의 격리 dev 실행(`DOAN_CLI=... npm --prefix app run dev -- -- --user-data-dir=<tmp>`)에서 현재 설치된 최소 버전으로 확인한다. 최소보다 새 버전 실행은 설치본이 없으므로 하지 않는다.
  - 통과 기준:
    - 공급자마다 readiness cause가 `version_*`가 아니고 새 대화 1회가 `turn.done`에 도달한다.
    - Claude(legacy external)·Codex는 저장된 대화 재개 1회가 `turn.done`에 도달한다.
  - 사용자 승인 대상: 격리 HOME에서 공급자마다 브라우저 로그인이 필요하다. Copilot 상태 확인·대화는 요청 비용이 든다. 두 가지 모두 실행 전에 사용자 승인을 받는다.
  - 검증: `/runtime-test` 결과와 스크린샷.

── commit: `test(agent-auth): pin incompatible-version recording` / `feat(agent-auth): report runtime-incompatible CLI versions in readiness` ──

## C. 승격과 정리

- [ ] C1. 결론을 영어로 승격한다. 문서마다 따로 커밋한다.
  - `docs/PRODUCT.md`
    - §3 'Agent conversation foundation contract' Transport 항목: 정확한 버전 기준을 최소 버전 + 호환성 검사로 바꾼다.
    - §6: 2026-10-28 결정과 B2 결과, "최소보다 새 버전의 실제 실행 미검증"을 기록한다.
    - §7: 다음 행을 날짜·근거와 함께 추가한다.
      - 새 정책. 2026-10-27 agent-conversation D1의 "exact verified versions only" 대체를 명시한다.
      - Codex rollout 하한(2026-10-28 누적 목록 행 대체)과 Claude registry 하한
      - 기록과 해제 방식, 버전 원인의 retry
      - handshake만 기록, legacy 미기록, 오류 코드 유지
      - 새 버전 증거 기준
  - `docs/ARCHITECTURE.md` §7
    - Transport 항목, Agent authentication 표의 버전 열(최소 버전), Versions 항목, readiness 순서와 actions
    - IPC errors 문단: `runtime_unsupported`·`session_unavailable` 뒤에는 공급자 readiness로 원인을 정한다.
    - Known limits: 자동 업데이트 항목을 교체하고, design '받아들이는 위험'의 다섯 항목을 추가한다.
  - `docs/POSTMORTEM.md`: 2026-10-27 Codex presence 항목에 follow-up 한 줄(목록 → 하한)을 덧붙인다. 기존 내용은 바꾸지 않는다.
  - 검증: 문서 대조. `CODEX_ROLLOUT_VERSIONS`·`SUPPORTED_VERSIONS`·`ACP_VERSIONS`·정확한 버전을 말하는 남은 문장이 대체 기록이거나 의도한 것인지 확인한다. 검색 명령은 미정이다(AGENTS Commands에 없음).
- [ ] C2. `docs/features/agent-cli-versions/`를 삭제한다.
  - 검증: 문서 대조. 다른 문서에 이 디렉터리로 가는 링크가 남지 않는다.

── commit: `docs(PRODUCT): …` / `docs(ARCHITECTURE): …` / `docs(POSTMORTEM): …` / `docs(agent-cli-versions): remove the finished feature directory` ──
