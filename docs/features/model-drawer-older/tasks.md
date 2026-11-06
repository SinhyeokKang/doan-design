# model-drawer-older — tasks

0. ~~**시안**~~ — 완료. 두 안을 그려 비교했고 사용자가 같은 자리에서 펼치기를 골랐다(`.doan/canvases/model-drawer-older.html`, frame `inline`·`settings`).

1. **분류 함수** — `models.ts` `olderIds`와 `ModelOption.older`, 세 파서 적용(`unique` 뒤). fixture는 main checkout `.scratch/model-drawer-older/`의 원시 응답(`claude-models.out`, `codex-models.out`, `cursor-acp.out`)에서 ID·이름·기본 표시만 옮긴다.
   - 검증: `npm --prefix app test` (models.test.ts) green. 다음 경우를 테스트로 고정한다: 세 실측 목록의 현재/이전 결과(Claude 4/8, Codex 4/4, Cursor 25/22, Antigravity 3/0), 빈 목록, 모두 버전 없는 이름, 동점, [6] < [6, 1], 날짜 조각(`claude-haiku-4-5-20251001`과 날짜 없는 같은 세대), `[...]` 꼬리, 기본 행이 최댓값에 들어가되 버전이 작아도 접히지 않음.
   - 커밋 경계.

2. **메뉴 view** — `modelPickerView`·`settingsModelMenu`의 `older` 표시(행은 나누지 않음), renderer 쪽 `ModelOption` 사본, 펼침 상태 규칙과 scroll 보정 계산(순수 함수).
   - 검증: `npm --prefix app test` (homeComposer.test.ts, newConversationSettings.test.ts) green. 다음 경우를 고정한다: 이전 모델을 고르면 그 ID가 골라짐(Default로 돌아가지 않음, Settings `settingsModelPick` 포함), 목록을 읽기 전·읽지 못함의 Default 행에는 줄이 없음, 목록 0행(Copilot)과 이전 모델 없는 목록에는 줄이 없음, 고른 모델이 목록에 없으면 자동으로 펼치지 않음, Settings Default 행은 접히지 않음, 계정을 바꾼 뒤 다시 읽은 목록에서 분류가 다시 계산됨, 사람이 토글한 그룹은 목록 도착 때 자동으로 펼치지 않음.
   - 커밋 경계.

3. **UI** — `AgentPicker`·Settings Model 메뉴의 "Older models" 줄, 펼치기, 키보드, 접근 이름, 줄 자리 고정, 열 때 scroll.
   - 검증: `npm --prefix app test` (ComposerParts.test.tsx, SettingsAgents.test.tsx) green, `npm --prefix app run typecheck`. 줄은 sm과 xs 두 크기에서 검사한다(`ComposerParts.test.tsx`가 다른 picker를 `[undefined, "xs"]`로 검사하는 방식). 정적 렌더 테스트로 판정할 수 없는 동작(Enter·Space·→·← 토글, 메뉴가 닫히지 않음, `aria-expanded` 토글, 포커스 유지, 줄 자리)은 task 4b의 probe 항목으로 판정한다.
   - 커밋 경계.

4a. **`/design-sync`** — 시안 frame `inline`·`settings`와 구현을 computed style로 비교하고 맞춘다. `/ship` 또는 `/orchestrate` 브랜치 안에서 돈다.
   - 검증: `/design-sync` 보고와 docs/DESIGN.md 측정값 기록.

4b. **`/runtime-test`** — build한 앱을 격리해 띄우고, main의 `conversation:models` handler를 task 1 fixture를 돌려주는 handler로 바꾼다(`ipcMain.removeHandler` 뒤 `handle`. 선례: `.scratch/design-sync/buzz-shell/retired-e2e/*.ts`, DESIGN.md의 picker-default-labels 측정). Home·Overview·canvas 패널·docked·Settings에서 다음을 본다.
   - 접힘·펼침·다시 접힘, 메뉴가 닫히지 않음, 키보드(Enter·Space·→·←, 포커스 유지, 위로 열린 메뉴는 ↑·Settings는 ↓로 줄에 가장 가까운 이전 행), 접근 이름과 `aria-expanded`.
   - 줄 자리 고정: 토글 전후 줄의 viewport top이 같은지(provider 여럿, 스크롤 범위 있음). 스크롤 범위가 없는 경우(Codex 하나만 연결해 4행을 펼침)에 줄이 얼마나 움직이는지 재서 기록한다.
   - 이전 모델을 고르면 트리거가 그 이름을 보이고, 다시 열면 그 그룹이 펼친 채 체크된 행이 보임. 고른 뒤 보내기는 전송 IPC(`conversation:start`/`send`) 인자에 이전 모델 ID가 실리는지로 판정한다(실제 provider로 보내지 않는다).
   - Overview는 펼친 메뉴가 그려지는지 스크린샷으로 판정한다(POSTMORTEM 'Overview's model and effort pickers did not open', `elementFromPoint`를 근거로 삼지 않음).
   - 검증: `/runtime-test` 스크린샷과 probe 결과.

5. **승격** — PRODUCT §5 item 1 'Agent and model picker'와 item 0 'New conversations'에 접는 규칙, ARCHITECTURE §7 'Models'에 분류 규칙(이름·계열·버전·날짜 조각·기본 행)과 추정이라는 한계를 현재 규칙으로 쓴다. BACKLOG에 Copilot 유료 계정 목록 미확인, Cursor 현재 모델 25행(더 줄이는 방법 미정), 4b에서 잰 스크롤 범위 없는 경우의 줄 움직임(남았다면)을 남긴다. `docs/features/model-drawer-older/`를 지운다.
   - 검증: `test ! -e docs/features/model-drawer-older`, `grep -rn 'features/model-drawer-older' docs AGENTS.md README.md`가 결과 없음(DESIGN.md의 초안 경로 `.doan/canvases/model-drawer-older.html`은 남는다), PRODUCT·ARCHITECTURE의 새 문장이 코드와 맞는지 diff로 확인.
