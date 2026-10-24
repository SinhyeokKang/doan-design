# agent-eval — tasks

순서: 실행기(계약 고정) → 시나리오 3묶음(병렬) → 통합 · 기준 회차 · 승격. 브랜치는 `feat-agent-eval`. `── commit ──`은 커밋 경계다. 코드 경계는 `node --test eval/`과 `node eval/run.ts --self-test`가 통과해야 한다(이 기능에서 만드는 명령; task 1에서 AGENTS.md 'Commands'에 더한다).

## 1. 실행기

- design.md '실행기', '검사 계약', '판정자'대로 `eval/run.ts`, `eval/lib/*`. 가짜 앱 소켓(`runtime.v1` · `app-socket.v1`), 시간 제한 · SIGKILL, 결과 기록, `summary.md`.
- self-test 기반: 모델 대신 가짜 에이전트(시나리오 fixture를 저장소에 덮어쓰는 실행)와 가짜 판정자로 파이프라인 전체를 돈다. 이 task에서는 예시 시나리오 `eval/scenarios/_example/`(pass · fail fixture 포함)로 확인한다. 예시는 self-test 전용이고 실제 회차에는 들어가지 않는다.
- 순수 함수 테스트: 인자 파싱, 프롬프트 치환, 결과 합성(자동 검사 fail이면 판정자 무시), 판정 JSON 파싱 실패, diff 자르기, 경로 격리(저장소 안 경로 거부).
- AGENTS.md 'Commands'에 세 명령.
- 검증: `node --test eval/` 통과, `node eval/run.ts --self-test` exit 0(예시 시나리오 pass · fail 판정이 기대대로), 실제 HOME의 doan 관련 상태가 실행 전후로 같다(`app/e2e/real-state.ts`와 같은 키 목록).

── commit (`feat(eval): agent evaluation runner`) ──
── commit (`docs(agents): add eval commands`) ──

## 2. 시나리오 W1 · W2 · R5 (쓰기 · 이해)

- design.md '시나리오 형식' · '시나리오 7개'. 각 시나리오에 pass · fail fixture.
- 검증: `node eval/run.ts --self-test --scenarios W1,W2,R5` exit 0. 시드가 `doan check`를 통과한다(W2 · R5의 시드 캔버스).

── commit (`feat(eval): writing and understanding scenarios`) ──

## 3. 시나리오 R1 · R2 · R3 (코멘트 · active · 지시 무시)

- 코멘트 시드는 `schema/comment-event.v1` 형식(사람 create 이벤트, resolved 1개는 create + resolve). R2는 `selection.json`.
- 검증: `node eval/run.ts --self-test --scenarios R1,R2,R3` exit 0. 시드의 코멘트 파일이 `doan comments --json`으로 경고 없이 읽힌다.

── commit (`feat(eval): comment, active and injection scenarios`) ──

## 4. 시나리오 R4 (구현)

- 정적 fixture 앱(`web/`, 빌드 도구 없음)과 확정 캔버스.
- 검증: `node eval/run.ts --self-test --scenarios R4` exit 0.

── commit (`feat(eval): implementation scenario`) ──

## 5. 통합 · 기준 회차 · 승격

- 전체 self-test, `npm --prefix app run package`, 실제 회차 `node eval/run.ts`(전체 1회, 실패한 시나리오는 `--repeat 2`).
- `docs/USABILITY-EVAL.md`에 회차 행과 문제 행. 문제는 기록만 한다(비목표).
- ARCHITECTURE(새 `eval/`와 결과 위치), DIRECTORY, PRODUCT §7(2026-10-24 결정 줄: 루프, 기록 위치, 시나리오 형식, 실행 주기, 모델 경계 예외), `.agents/skills/agent-eval/SKILL.md`의 'Requirements'에서 "built on feat-agent-eval" 문구 정리.
- `docs/features/agent-eval/` 삭제.
- 검증: 회차 결과 파일이 있고 USABILITY-EVAL.md에 행이 있다. `grep -rn "features/agent-eval" docs AGENTS.md .agents` 결과가 없다. `go test ./...` · `npm --prefix app test` 통과(바뀌지 않았음을 확인).

── commit (문서별: `docs: record the first agent-eval round`, `docs(architecture): …`, `docs(directory): …`, `docs(product): …`, `chore(skills): …`, `docs(feature): retire agent-eval documents`) ──
