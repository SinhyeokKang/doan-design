# 서브에이전트 진행 — tasks

순서: PoC(실제 프레임, 보고 턴) → 드래프트(모습 결정) → 이벤트 형식과 순수 함수 → main 배선 → UI → 측정과 실기 확인 → 게이트 → 승격. `[commit]`은 커밋 경계다. 드래프트(T2)는 T1의 결과(실제로 오는 종류와 숫자)를 보고 그린다.

## T1. PoC: 작업 프레임 (Claude Code, Codex) — 완료(design.md 'PoC 결과')

- design.md 'PoC (T1)'대로 `.scratch/subagent-progress/`의 probe로 실제 Claude Code와 Codex를 돌린다. 실제 로그인은 복사본으로 쓴다(AGENTS.md 'Real agent sign-ins').
- 검증:
  - 경우마다 기록된 프레임이 `.scratch/subagent-progress/`에 있다. 경우는 턴 안 Agent, 백그라운드 서브에이전트, 백그라운드 명령, 병렬 둘, Doan이 끊는 세 경로(턴 Stop, 줄의 Stop, 다음 send), Codex 서브에이전트 턴이다.
  - 결과(오는 프레임, 필드, 빈도, 마지막 `task_notification`과 프로세스 끊김의 순서, 세 경로의 `stopped` 유무, `task_type` 값, Codex 항목과 0.158.0 지원)가 design.md 'PoC 결과'에 적혀 있다.
  - 임시 홈, 복사한 인증 파일, 임시 Keychain 항목이 지워져 있다(`ls`와 `security find-generic-password`로 확인).
  - probe 실행 명령(예: `node .scratch/subagent-progress/probe.mjs`)은 AGENTS.md 'Commands'에 없다. 명령 이름은 사용자 확인이 필요하다.
  - Codex 항목이 오지 않으면 spec '확정한 결정'의 Codex와 '완료 조건' 3을 "Codex 제외"로 고치고, BACKLOG에 적을 문장을 T8에 더한다.
- `[commit]` design.md와 쓸 프레임으로 줄인 fixture(`app/src/main/conversation/fixtures/`, README 항목 포함)

## T1b. PoC: 보고 턴과 살려 둔 send — 완료(design.md 'PoC 결과 (T1b)')

- design.md 'PoC (T1b)'대로 T1과 같은 방식으로 확인한다. 실제 로그인은 복사본으로 쓴다(AGENTS.md 'Real agent sign-ins').
- 검증: 경우마다 기록된 프레임이 `.scratch/subagent-progress/`에 있고, 결과와 그에 따른 설계(입력을 열어 두는 방식, 보고 턴의 표식, 보고 턴 중 send의 처리, 보고 턴의 연쇄)가 design.md 'PoC 결과 (T1b)'에 적혀 있다. 임시 홈과 복사한 인증이 지워져 있다.
- `[commit]` design.md

## T2. 드래프트와 모습 결정

- `/design-draft subagent-progress`로 design.md '드래프트 요청'의 프레임을 그린다. Claude 데스크톱 앱과 Codex 데스크톱 앱의 표시는 확인한 출처를 드래프트 머리말에 적는다.
- design.md '열린 질문'과 '정할 것'을 이 단계에서 정한다.
- 검증: `doan check --json --repo .`에 이 캔버스의 오류가 없다. `doan ls --json --repo .`의 프레임 id가 요청과 같다. 사용자가 확정한 모습과 문구가 design.md에 적혀 있다.
- `[commit]` 드래프트(develop에서는 `/design-draft`가 직접 push한다)와 design.md

## T3. 이벤트 형식과 순수 함수

- `task.done` 이벤트(`types.ts`, `store.ts` `parse`), `toSee`·`lastSeq` 제외, Agent `activity`의 `callId`, Claude 작업 리듀서, `threadItems.ts`의 작업 행, 스크린 리더 문구(design.md '순수 함수로 뺄 부분'). Codex 리듀서는 T1에서 항목을 확인했을 때만.
- red 테스트는 T1 fixture를 기다리지 않고 기존 `fixtures/claude-thinking.json`의 `task` 턴(Agent 호출과 `system/task_*` 프레임)으로 먼저 시작할 수 있다.
- 검증: `npm --prefix app test`에서 새 표 테스트가 먼저 실패(red)를 보이고 나서 통과한다. 표에 다음이 있다.
  - 병렬 시작과 순서가 다른 끝남, 레벨 신호와 `task_*`의 순서 뒤바뀜
  - 늦은 `run_id`, 같은 `taskId`의 중복 끝남, `ambient`, 모르는 `task_type`, `parentTaskId`
  - 끝남 알림이 오지 않는 작업: Doan이 멈춘 경우는 `stopped`로 기록되고, 그 밖의 경우는 기록 없이 지워진다. 어느 경우에도 진행 중으로 남지 않는다.
  - 빈 `description`과 아주 긴 `description`(512자 자르기)
  - `store.ts`가 잘못된 `task.done`을 거부하고, `task.done` 없는 기존 대화를 그대로 읽는다.
  - `task.done`이 `toSee`와 `lastSeq`에 들어가지 않는다.
  - 작업 프레임 없는 Agent 호출은 활동 단계로 남고, 작업 행은 활동 그룹을 끊는다.
  - 재시작 뒤 기록이 있는 행과 없는 행
  - 같은 render에 여러 작업이 끝날 때 스크린 리더 문구가 하나다.
- `npm --prefix app run typecheck`가 통과한다.
- `[commit]` `test:` → `feat:`

## T4. main 배선

- `runners.ts`가 턴 안과 터미널 뒤의 작업 프레임을 리듀서로 넘긴다. `service.ts`가 진행 중 목록을 메모리 전용 push로 보내고, 끝난 작업을 따로 울타리를 친 쓰기로 `task.done`에 쓴다(design.md 'app (main)'). 백그라운드 줄의 Stop과 프로세스 끊김 규칙은 바꾸지 않는다. Codex는 T1에서 항목을 확인했을 때만 `dispatcher.ts`에 배선한다.
- 검증: `npm --prefix app test`가 통과한다.
  - 기존 백그라운드 테스트(`runners.turnEnd.test.ts`, `turnEnd.test.ts`)가 그대로 통과한다.
  - 새 runner·service 테스트가 T1 fixture를 흘려 다음을 확인한다: 진행 push, 턴 안과 턴 뒤의 `task.done`이 띄운 턴의 id로 쓰임, 다음 send가 같은 live를 쓸 때 새 턴에 붙지 않음, 작업이 도는 중의 send가 프로세스를 끊지 않음, 마지막 작업이 끝난 뒤 보고 턴이 사람 메시지 없는 턴으로 기록됨, 줄의 Stop 뒤에는 보고 턴이 없음, 대화 삭제·앱 종료 중에는 쓰지 않음, 쓰기 실패가 runner를 닫지 않음.
  - Codex를 배선했다면 Codex fixture로 같은 확인을 한다.
- `[commit]`

## T5. UI

- `ConversationThread.tsx`의 펼칠 수 있는 작업 행과 백그라운드 줄, `styles.css`. 캔버스 패널, Overview, 프로토타입 창.
- 검증: `npm --prefix app test`, `npm --prefix app run typecheck`, `npm --prefix app run lint`가 통과한다.
  - `ConversationThread.background.test.tsx`를 작업 행이 있는 줄로 다시 쓴다.
  - 펼침 버튼의 `aria-expanded`, Tab·Space·Return, 잘린 설명의 스크린 리더 텍스트를 확인한다.
  - 같은 대화를 세 화면에 띄울 때 작업 행과 경과 시간이 같다.
  - 경과 시간의 초 단위 다시 그리기가 `ConversationThread.memo.test.tsx`와 `rerender.test.tsx`의 다시 그리기 가정을 깨지 않는다(fake timer).
- `[commit]`

## T6. 측정과 실기 확인

- `/design-sync`로 드래프트와 구현을 잰다. `/runtime-test`로 격리된 실제 앱에서 실제 Claude Code(그리고 T1에서 확인했으면 Codex)를 돌려 본다.
- 검증:
  - `node .scratch/design-sync/<screen>/measure.mjs`의 측정값이 드래프트와 맞고 `docs/design/conversation.md`에 적힌다.
  - runtime-test 스크린샷에 다음 장면이 있다: 병렬 둘의 진행, 하나가 먼저 끝남, 실패, 줄의 Stop 뒤 멈춤, 턴 뒤 진행, 재시작 뒤 기록 있는 행, 진행 중 앱 종료 뒤 기록 없는 모습.
- `[commit]` 측정 기록

## T7. 검증 게이트

- 검증: `node .agents/skills/verify/scripts/verify.mjs`가 통과한다.

## T8. 승격과 정리

- spec '바뀌는 PRODUCT와 ARCHITECTURE 문장'을 지금 규칙으로 고쳐 쓴다(PRODUCT §3 Out of scope 4의 보고 턴 예외 포함). 작업별 Stop을 `docs/BACKLOG.md`에 적는다(T1에서 Codex를 뺐으면 그것도). 새 fixture를 `fixtures/README.md`에 적었는지 확인한다. `docs/features/subagent-progress/`를 지운다.
- 검증:
  - `grep -rn "No sweep, spinner or output" docs/PRODUCT.md`가 아무것도 찾지 않는다.
  - `grep -n "task.done" docs/ARCHITECTURE.md`가 되돌림 비용 문단과 쓰기 경로에서 찾는다.
  - `grep -n -i "per-task stop\|stop_task" docs/BACKLOG.md`가 작업별 Stop 항목을 찾는다.
  - PRODUCT §3 Out of scope 4에 보고 턴 예외가 있다(`grep -n "report turn" docs/PRODUCT.md`).
  - `docs/features/subagent-progress/`가 없다.
- `[commit]` 문서별로 나눈다.
