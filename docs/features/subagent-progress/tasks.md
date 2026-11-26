# 서브에이전트 진행 — tasks

순서: PoC(실제 프레임) → 드래프트(모습 결정) → 이벤트 형식과 순수 함수 → main 배선 → UI → 측정과 실기 확인 → 승격. `[commit]`은 커밋 경계다. 드래프트(T2)는 T1의 결과(실제로 오는 종류와 숫자)를 보고 그린다.

## T1. PoC: 작업 프레임 (Claude Code, Codex)

- design.md 'PoC (T1)'대로 `.scratch/subagent-progress/`의 probe로 실제 Claude Code와 Codex를 돌린다. 실제 로그인은 복사본으로 쓴다(AGENTS.md 'Real agent sign-ins').
- 검증: 경우마다 기록된 프레임이 `.scratch/subagent-progress/`에 있다. 결과(오는 프레임, 필드, 빈도, 마지막 `task_notification`과 프로세스 끊김의 순서, Codex의 알림 유무)가 design.md 'PoC 결과'에 적혀 있다. 실행 명령은 `node .scratch/subagent-progress/probe.mjs`다(일회성 probe, 명령 미정 — 사용자 확인 필요). Codex에 알림이 없으면 spec '확정한 결정'과 '완료 조건' 3을 "Codex 제외"로 고치고 BACKLOG에 적을 문장을 T8에 더한다.
- `[commit]` design.md와 쓸 프레임으로 줄인 fixture(`app/src/main/conversation/fixtures/`, README 항목 포함)

## T2. 드래프트와 모습 결정

- `/design-draft subagent-progress`로 design.md '드래프트 요청'의 프레임을 그린다. Claude 데스크톱 앱과 Codex 데스크톱 앱의 표시는 확인한 출처를 드래프트 머리말에 적는다.
- design.md '열린 질문'(명령 작업의 설명, 하위 작업의 배치)을 이 단계에서 정한다.
- 검증: `doan check --json --repo .`에 이 캔버스의 오류가 없다. `doan ls --json --repo .`의 프레임 id가 요청과 같다. 사용자가 확정한 모습과 문구가 design.md에 적혀 있다.
- `[commit]` 드래프트(develop에서는 `/design-draft`가 직접 push한다)와 design.md

## T3. 이벤트 형식과 순수 함수

- `task.done` 이벤트(`types.ts`, `store.ts` `parse`), Claude 작업 프레임 리듀서, Agent `tool_use`와 작업의 연결, `threadItems.ts`의 작업 행, 스크린 리더 문구(design.md '순수 함수로 뺄 부분'). Codex는 T1 결과가 있을 때만.
- 검증: `npm --prefix app test`에서 새 표 테스트가 먼저 실패(red)를 보이고 나서 통과한다. 병렬 시작과 순서가 다른 끝남, 늦은 `run_id`, `ambient`, 작업 프레임 없는 Agent 호출, 재시작 뒤 끝난 행을 포함한다. `npm --prefix app run typecheck`가 통과한다.
- `[commit]` `test:` → `feat:`

## T4. main 배선

- `runners.ts`가 턴 안과 터미널 뒤의 작업 프레임을 리듀서로 넘기고, 끝난 작업을 `task.done`으로 쓴다. `service.ts`가 진행 중인 작업 목록을 살아 있는 항목에 둔다. 백그라운드 줄의 Stop과 프로세스 끊김 규칙은 바꾸지 않는다.
- 검증: `npm --prefix app test`의 기존 백그라운드 테스트(`runners.turnEnd.test.ts`, `turnEnd.test.ts`)와 새 runner 테스트(T1 fixture를 흘려 작업 목록과 `task.done`을 확인)가 통과한다.
- `[commit]`

## T5. UI

- `ConversationThread.tsx`의 작업 행과 백그라운드 줄, `styles.css`, 캔버스 패널·Overview·프로토타입 창.
- 검증: `npm --prefix app test`(`ConversationThread.background.test.tsx`를 작업 행으로 다시 쓴다), `npm --prefix app run typecheck`, `npm --prefix app run lint`가 통과한다.
- `[commit]`

## T6. 측정과 실기 확인

- `/design-sync`로 드래프트와 구현을 잰다. `/runtime-test`로 격리된 실제 앱에서 실제 Claude Code(그리고 T1에서 확인했으면 Codex)의 서브에이전트 턴과 백그라운드 작업을 돌려 본다.
- 검증: `node .scratch/design-sync/<screen>/measure.mjs`의 측정값이 드래프트와 맞고 `docs/design/conversation.md`에 적힌다. runtime-test 스크린샷에 작업 행의 진행, 끝남, 재시작 뒤 모습이 있다.
- `[commit]` 측정 기록

## T7. 검증 게이트

- 검증: `node .agents/skills/verify/scripts/verify.mjs`가 통과한다.

## T8. 승격과 정리

- spec '바뀌는 PRODUCT와 ARCHITECTURE 문장'을 지금 규칙으로 고쳐 쓴다(PRODUCT §5 item 3, §3 'Turn stages', ARCHITECTURE §7). 작업별 Stop을 `docs/BACKLOG.md`에 적는다(T1에서 Codex를 뺐으면 그것도). `docs/features/subagent-progress/`를 지운다.
- 검증: `grep -rn "No sweep, spinner or output" docs/PRODUCT.md`가 아무것도 찾지 않는다. `docs/features/subagent-progress/`가 없다.
- `[commit]` 문서별로 나눈다.
