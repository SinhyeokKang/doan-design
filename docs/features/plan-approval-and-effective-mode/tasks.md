# plan 승인과 실제 권한 모드 — tasks

순서: PoC → 사용자 결정 → 형식·순수 함수 → shell(I/O) → UI → 승격. `/ship bypass`나 `/orchestrate`가 아래 commit 경계를 따른다.

## 0. PoC (코드 없음, `.scratch/`)

- [ ] **P1 Claude 실제 모드**: `.scratch/`의 Agent SDK probe로 design.md 'PoC 의존' P1의 세 질문을 확인한다. 실제 로그인이 필요하면 real HOME 규칙과 유지된 provider profile을 쓴다. 프로젝트 `.claude/settings.json`에 `defaultMode`를 다섯 값으로 바꿔 가며, 모드를 넘기지 않은 턴의 `system/init`과 Plan 승인 뒤 `system/status`를 기록한다.
  - 확인: 관찰값(값별 init·status·묻는지 여부, 날짜, Claude Code 버전)을 design.md 'PoC 의존'에 적고, 확인되지 않은 값은 '표시'의 이름 목록에서 뺀다.
- [ ] **P2 Antigravity `/plan`**: `.scratch/`의 ACP probe로 Antigravity 서버 1.3.0(또는 현재 버전)에 `/plan`을 보내고, 계획과 'Proceed' 승인의 protocol 모양을 기록한다.
  - 확인: design.md 'PoC 의존' P2에 (a)·(b)·(c) 중 어느 경우인지와 frame 증거를 적는다.
- [ ] **결정 게이트**: P2 결과를 보이고 Antigravity `/plan` 범위를 사용자에게 묻는다(AskUserQuestion). 답을 spec·design·tasks에 반영한다. 이 게이트 전에는 6번을 시작하지 않는다.
  - 확인: spec.md '미정'이 비고, 6번에 할 일이 적혀 있다(또는 범위에서 뺐다고 적혀 있다).
- commit: `docs(feature): plan-approval-and-effective-mode PoC results`

## 1. 형식: index 키 (store)

- [ ] `store.ts`에서 선택 키 `claudeRunMode`를 읽고 쓴다. 모르는 값이면 그 키만 버리고, `permissionMode`가 있는 항목의 키는 쓰지 않는다. 형식 버전은 그대로다.
  - 확인: `npm --prefix app test`에서 store 테스트(모르는 값, Ask first가 아닌 항목, 키 없음) green.

## 2. 순수 함수

- [ ] `claudeRunModeOf(raw)` (`transport.ts`): 최상위 `system/init`·`system/status`만 읽는다. subagent 메시지와 모르는 값은 무시한다.
  - 확인: `npm --prefix app test`에서 transport 테스트 green(P1 실측 frame을 fixture로 쓴다).
- [ ] service의 저장·지우기 조건 함수: (턴 종류, 저장 모드, 읽은 값) → 저장 / 지우기 / 무시. Ask first init, Plan 승인 status, 다른 모드 저장 시 지우기를 다룬다.
  - 확인: `npm --prefix app test`에서 해당 테스트 green.
- [ ] `permissionTrigger`·`permissionPickerView`에 `runMode`를 더한다: 라벨 "Ask first · <이름>", aria-label, `bypassPermissions`의 warning, Ask first 설명.
  - 확인: `npm --prefix app test`에서 `permissionPicker` 테스트 green. `rendererImports.test.ts` green.
- commit: `test:`(먼저, red) → `feat(conversation): read the mode a Claude Ask first turn runs in`

## 3. shell (I/O)

- [ ] runner가 Ask first 턴의 init 값과 Plan 승인 status 값을 service로 넘기고, service가 2번 조건대로 index에 저장한다. `storeMode`가 Ask first가 아닌 모드를 저장하면 키를 지운다. `summary.ts`가 값을 renderer로 넘긴다.
  - 확인: `npm --prefix app test`에서 runners·service·summary 테스트 green. `npm --prefix app run typecheck` 통과.
- commit: `feat(conversation): keep the Claude run mode with the conversation`

## 4. UI

- [ ] `/design-draft`: trigger와 menu의 두 상태(Auto, Full access)를 `.doan/canvases/`에 그리고, 사용자가 앱에서 확인한다.
  - 확인: `doan check`·`doan ls` 통과, 사용자 확인.
- [ ] composer들이 summary의 `claudeRunMode`를 picker view에 넘긴다. 좁은 docked composer는 아이콘만 보여도 aria-label이 실제 모드를 말한다.
  - 확인: `npm --prefix app test` green. `/design-sync`로 초안과 computed style 비교. `/runtime-test`: 프로젝트 `defaultMode: "auto"` 폴더에서 Ask first 턴을 보내 trigger가 "Ask first · Auto"로 바뀌고, 앱을 다시 열어도 유지되며, Accept edits를 고르면 사라지는지 본다.
- commit: `feat(renderer): show the mode Claude Code settings run in the permission trigger`

## 5. Antigravity `/plan` (결정 게이트의 답에 따라)

- [ ] 결정 게이트에서 정한 범위를 구현한다. (a)·(b)면 `commandView.ts`의 카드를 빼고 실제 앱에서 계획과 승인이 이어지는지 확인한다. (c)면 이 기능을 나누어 새 `/feature`로 넘길지 결정 게이트에서 정한다.
  - 확인: `npm --prefix app test` green. `/runtime-test`: Antigravity에서 `/plan`을 보내고 승인까지 이어지는지 본다. `doan` CLI 출력이나 skill이 바뀌면 `/agent-eval`.
- commit: 범위에 따라 `feat:` 또는 `docs(feature):`

## 6. 최종

- [ ] `node .agents/skills/verify/scripts/verify.mjs` 통과.
- [ ] 승격: PRODUCT §5 item 1 'Permission picker'(실제 모드 표시 규칙)와, 범위에 들어갔다면 'Built-in commands'(Antigravity `/plan` 카드 제거), ARCHITECTURE §7 'Permission modes'(`claudeRunMode`를 정하고 지우는 규칙, 저장 모드 규칙은 유지)와 'Storage'(index의 `claudeRunMode` 키)를 현재 규칙으로 고쳐 쓴다(영어, 근거는 commit 메시지). BACKLOG의 "After a Claude plan approval…" 항목과, 해결했다면 'Undecided'의 Antigravity `/plan` 항목을 지운다. `docs/features/plan-approval-and-effective-mode/`를 지운다.
  - 확인: `grep -rn "plan-approval-and-effective-mode" docs/ AGENTS.md .agents/`가 비어 있다. 문서별로 commit을 나눈다(`docs(PRODUCT):`, `docs(ARCHITECTURE):`, `docs(backlog):`).
