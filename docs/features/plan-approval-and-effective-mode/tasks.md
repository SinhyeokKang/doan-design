# plan 승인과 실제 권한 모드 — tasks

두 줄기로 나뉜다. **Claude 줄기**: P1 → 초안 → 순수 함수와 store → shell → UI. **Antigravity 줄기**: P2 → 결정 게이트 → 구현. Claude 줄기는 결정 게이트를 기다리지 않는다. `/ship bypass`나 `/orchestrate`가 아래 commit 경계를 따르고, 한 번에 한 단계씩 진행한다.

실제 앱이나 로그인한 agent가 필요한 확인(P1, P2, `/runtime-test`)은 real HOME 로그인 규칙과 유지된 provider profile(`.scratch/provider-profile/userData`, 복사해서 쓴다)을 쓰고, 그 밖에는 AGENTS.md 'Commands'의 격리 명령을 따른다. 확인이 막히면 건너뛰지 않고 사용자에게 넘긴다.

## Claude 줄기

### C0. PoC P1 (코드 없음, `.scratch/`)

- [ ] `.scratch/`의 Agent SDK probe로 design.md 'PoC 의존' P1의 질문을 모두 확인한다. 프로젝트 `.claude/settings.json`의 `defaultMode`를 다섯 값으로 바꿔 가며, 모드를 넘기지 않은 턴의 `system/init`, Plan 승인 뒤 `system/status`, steer 뒤 init을 frame째 기록한다.
  - 확인: 관찰값(값별 init·status·묻는지 여부, 날짜, Claude Code와 SDK 버전)을 design.md 'PoC 의존'에 적는다. 확인된 값만 남도록 spec.md 완료 조건과 design.md '표시'의 이름 목록을 고쳐 쓴다. 기록한 frame을 C2 fixture로 쓸 수 있게 `.scratch/`에 둔다.
- commit: `docs(feature): plan-approval-and-effective-mode P1 results`

### C1. UI 초안

- [ ] `/design-draft`: trigger와 menu의 상태(값 없음, Auto, Don't ask, P1이 확인했다면 Full access 경고)와 좁은 docked composer의 아이콘 축소를 `.doan/canvases/`에 그리고, 사용자가 앱에서 확인한다.
  - 확인: `doan check`·`doan ls` 통과, 사용자 확인. 초안의 문구가 spec·design과 같다.

### C2. store와 순수 함수

- [ ] `test:` 커밋으로 아래 테스트를 먼저 쓰고 red를 확인한다.
  - `storeIndex.test.ts`: `claudeRunMode` 읽기·쓰기. 모르는 값이면 그 키만 버린다. Ask first가 아닌 항목에 키가 있어도 그대로 읽는다. 키가 없으면 없는 대로 읽는다.
  - `transport.test.ts`: Claude 모드 reader. P1 frame으로 init·status를 읽고, subagent(`parent_tool_use_id`) 메시지와 다른 메시지는 무시한다. 지금의 `claudeReportedMode` 동작(plan 승인 → 공통 id)이 유지된다.
  - 저장 조건 함수 테스트(`service.test.ts` 또는 새 순수 모듈 테스트): Ask first로 보낸 턴의 첫 init → 저장/지우기. 같은 턴의 두 번째 init(steer) → 무시. 턴 도중 picker가 바뀌어 저장 모드가 Ask first가 아님 → 무시. 오래되거나 끝난 턴의 늦은 init → 무시. legacy-external → 무시. Plan 승인 → (저장 모드, `claudeRunMode`)를 한 번에. `claudeRunMode`가 `plan`인 Ask first 턴의 승인 → `claudeRunMode`만 바뀜. 표시 목록에 없는 값 → 지우기.
  - `permissionPicker.test.ts`: 라벨 "Ask first · Auto", aria-label, Ask first 설명, Claude가 아닌 provider와 Ask first가 아닌 저장 모드에서는 반영하지 않음, 아이콘만 보이는 trigger의 aria-label, (P1이 확인했다면) `bypassPermissions`의 `shield-alert`와 경고 속성. 알림 문구 함수: 바뀔 때만 문구, 같은 값·지워짐은 문구 없음.
  - 확인: `npm --prefix app test`에서 새 테스트가 red.
- [ ] 구현한다.
  - 확인: `npm --prefix app test` green, `rendererImports.test.ts` green, `npm --prefix app run typecheck` 통과.
- commit: `test: pin the Claude run mode rules` → `feat(conversation): read the mode a Claude Ask first turn runs in`

### C3. shell (I/O)

- [ ] `test:` 커밋으로 먼저 쓴다.
  - `runners` 테스트: Ask first로 보낸 턴만 init 값을 넘긴다.
  - `service` 테스트: 다음 다섯 경우를 확인한다.
    - Ask first 턴이 값을 저장한다.
    - plan 승인은 한 번만 저장하고 `changed`도 한 번만 나간다.
    - Accept edits로 send한 뒤 다시 Ask first를 고르면 마지막 관찰값이 보인다.
    - init 전에 실패한 턴은 값을 남긴다.
    - Send now와 queue된 send는 새 값을 만들지 않는다.
  - `summary.test.ts`: Claude doan-owned 항목에만 값이 실린다.
  - 확인: 새 테스트가 red.
- [ ] runner가 값을 service로 넘기고, service가 C2의 조건대로 index에 저장한다. plan 승인은 한 번의 저장으로 바꾼다. `summary.ts`가 값을 renderer로 넘긴다.
  - 확인: `npm --prefix app test` green, `npm --prefix app run typecheck` 통과.
- commit: `test: pin how the Claude run mode is kept` → `feat(conversation): keep the Claude run mode with the conversation`

### C4. UI

- [ ] `test:` 커밋으로 composer 테스트를 먼저 쓴다.
  - 기존 대화의 composer(`ProjectOverview`, `CanvasConversationPanel`, `DockedComposer`)가 summary의 값을 trigger에 반영한다.
  - 값이 바뀔 때 sr-only status가 한 번 알린다.
  - 확인: 새 테스트가 red.
- [ ] composer에 값을 넘긴다. `styles.css`에 경고 속성 규칙을 더하고, docked 축소 기준을 가장 긴 라벨로 다시 맞춘다.
  - 확인: `npm --prefix app test` green, `npm --prefix app run lint` 통과.
  - `/design-sync`: 초안과 computed style을 비교한다. 좁은 docked 너비에서 Permission 라벨이 Effort보다 먼저 숨는지 본다.
  - `/runtime-test`: 프로젝트 `defaultMode: "auto"` 폴더에서 Ask first 턴을 보낸다. trigger가 "Ask first · Auto"로 바뀌는지, 앱을 다시 열어도 유지되는지, Accept edits를 고르면 사라졌다가 Ask first로 돌아오면 다시 보이는지 확인한다.
- commit: `test: pin the run mode in the composers` → `feat(renderer): show the mode Claude Code settings run in the permission trigger`

## Antigravity 줄기

### A0. PoC P2와 결정 게이트

- [ ] `.scratch/`의 ACP probe로 Antigravity에 `/plan`을 보내고, 계획과 'Proceed' 승인의 protocol 모양을 기록한다.
  - 확인: design.md 'PoC 의존' P2에 (a)·(b)·(c) 중 어느 경우인지와 frame 증거를 적는다.
- [ ] **결정 게이트**: P2 결과를 보이고 Antigravity `/plan` 범위를 사용자에게 묻는다(AskUserQuestion). 답을 spec(완료 조건, '미정'), design, tasks에 반영한다. 이 게이트 전에는 A1을 시작하지 않는다.
  - 확인: spec.md '미정'이 비고, A1에 할 일이 적혀 있다(또는 범위에서 뺐다고 적혀 있다).
- commit: `docs(feature): plan-approval-and-effective-mode P2 results and scope`

### A1. 구현 (결정 게이트의 답에 따라)

- [ ] 결정 게이트에서 정한 범위를 구현한다. (a)·(b)면 `commandView.ts`의 카드를 빼고 실제 앱에서 계획과 승인이 이어지는지 확인한다. (c)면 이 줄기를 새 `/feature`로 넘길지 결정 게이트에서 정한다.
  - 확인: `test:`(red) → 구현 → `npm --prefix app test` green. `/runtime-test`: Antigravity에서 `/plan`을 보내고 승인까지 이어지는지 본다. `doan` CLI 출력이나 skill이 바뀌면 `/agent-eval`.
- commit: 범위에 따라 `test:` → `feat:`, 또는 `docs(feature):`

## 최종

- [ ] `node .agents/skills/verify/scripts/verify.mjs` 통과.
- [ ] 승격(영어, 근거는 commit 메시지, 문서별로 commit을 나눈다):
  - PRODUCT §5 item 1 'Permission picker': 실제 모드 표시 규칙. 범위에 들어갔다면 'Built-in commands'에서 Antigravity `/plan` 카드를 뺀다(`docs(PRODUCT):`).
  - ARCHITECTURE §7 'Permission modes': "read as Ask first" 줄 뒤에 `claudeRunMode`를 정하는 규칙과 표시 조건을 더한다. 'Device-local storage and limits'의 index 설명에 `claudeRunMode` 키를 더한다(`docs(ARCHITECTURE):`). `claudeModeAfterPlan` 주석도 맞게 고친다.
  - `/design-sync`가 값을 기록했다면 `docs/design/<group>.md`와 DESIGN.md 색인(`docs(design):`).
  - BACKLOG의 "After a Claude plan approval…" 항목과, 해결했다면 'Undecided'의 Antigravity `/plan` 항목을 지운다(`docs(BACKLOG):`).
  - `docs/features/plan-approval-and-effective-mode/`를 지운다(`docs(feature): remove plan-approval-and-effective-mode after promotion`).
  - 확인: `grep -rn "plan-approval-and-effective-mode" docs/ AGENTS.md .agents/ app/`가 비어 있다.
