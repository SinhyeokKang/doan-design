# picker-default-labels — tasks

시작 전: design '결정' 1–6(사람, 2026-11-06)을 따른다. 시작 조건: fast-mode가 main에 병합된 뒤(같은 `modelPickerView`의 `effort`와 `EffortPicker`를 고친다, design §1). turn-activity와는 고치는 파일이 겹치지 않으므로 순서를 묻지 않는다.

순서: UI 초안 → 순수 함수 → main 배선 → renderer 배선 → 실제 앱 확인 → 문서 승격. 형식(schema·fixture) 변경은 없다.

## D. UI 초안

- [ ] D1. `/design-draft picker-default-labels`: design §9대로 `.doan/canvases/picker-default-labels.html`(frame `triggers`, `menus`, `docked-widths`, `settings`)을 그린다. 글은 `doan design-skill clarify --json`을 읽고 design §5를 다듬는다.
  - 검증: `doan check --json --repo .`에 이 캔버스의 finding이 없고, `doan ls --json --repo .`가 canvas id `picker-default-labels`와 frame 네 개를 보인다.
- [ ] D2. 사람이 앱에서 초안을 확인한다.
  - 검증: design §9 상태가 "사람 확인(날짜)"이다. 다듬은 글이 design §5에 있다.

커밋 경계: D1·D2(`docs(design): picker-default-labels draft`).

## A. 순수 함수(`/tdd` → `/implement`)

모든 A 작업은 새 테스트가 구현 전 red였음을 기록한다.

- [ ] A1. main 목록: `parseClaudeModels`의 `resolvedModel`·`recommended`와 `default` 행 빼기, `codexRecommended`와 `config/read` 답 읽기, `parseAcpModels`의 `recommended`(design §2 1–3).
  - 검증: `npm --prefix app test`에서 `models.test.ts`가 통과한다. 새 경우: 2026-11-06 Claude 모양(`default`→`opus`), `resolvedModel`이 맞는 행 없음(추천 없음, `default` 행은 빠짐), Codex config 모델 있음·없음·목록에 없음, `config/read` 실패, ACP `currentModelId`, 추천은 많아야 한 행.
- [ ] A2. renderer 글: `modelPickerView`의 트리거 글·접근성 이름과 `ModelRow.recommended`(고정 기본값이 추천보다 먼저, POSTMORTEM 2026-11-02), 노력 트리거 글과 기본값 행, `permissionPickerView`의 "Ask first"와 provider별 설명, `dockedPicker`, Settings 행 글(design §2 4–7, §4, §5).
  - 검증: `npm --prefix app test`에서 `homeComposer.test.ts`·`dockedRules.test.ts`·`permissionPicker.test.ts`·`SettingsAgents.test.tsx`가 통과한다. 새 경우: 고른 모델, 추천 모델, 목록 없음("Model"), 고정 기본값, Codex 기본 레벨·Claude "Effort", 기본값 행을 고르면 노력 없음, 권한 세 provider 설명, Settings `Default · <값>`과 모를 때 `Default`, 저장된 Claude `default`가 고르지 않은 상태로 읽힘.

커밋 경계: A1, A2 각각.

## B. 배선

- [ ] B1. main: Codex 목록 읽기에서 `config/read {cwd}`를 부르고(같은 lease), `conversation:models` 응답에 `recommended`를 싣는다(design §1 main).
  - 검증: `npm --prefix app run typecheck`와 `npm --prefix app test`가 통과한다. `runners.test.ts`에 Codex 목록 읽기가 thread와 prompt 없이 `model/list`와 `config/read`만 부르는 경우를 더한다. `grep -rn '\.acquire(' app/src/main`의 결과가 이 작업 전과 같다(POSTMORTEM 2026-10-30).
- [ ] B2. renderer: `AgentPicker`의 Recommended 표시, `EffortPicker`의 기본값 행, 세 composer와 Settings(D2 초안).
  - 검증: `npm --prefix app run typecheck`와 `npm --prefix app test`가 통과한다. `ComposerParts.test.tsx`에 기본값 행을 고르면 `onPick`이 노력을 비우는 경우를 더한다.
- [ ] B3. `/design-sync picker-default-labels`: 초안과 구현을 computed style로 맞추고, docked tray 단계(384·288)를 새 글로 다시 잰다. 측정값은 `docs/DESIGN.md`에 적는다.
  - 검증: `/design-sync` 보고에 불일치가 없다.

커밋 경계: B1, B2, B3 각각.

## R. 실제 앱 확인

- [ ] R1. `/runtime-test`: 로그인한 Claude·Codex(공용 프로필, 사람 승인)로 Home·Overview·캔버스 panel의 세 트리거, 메뉴의 Recommended·기본값 행·Ask first를 본다. 고르지 않고 보낸 턴이 모델과 노력을 보내지 않는지 frame으로 확인한다. project `.claude/settings.json`에 `model`을 둔 경우 트리거 이름이 실제 모델과 맞는지 본다(design §8).
  - 검증: `/runtime-test` 보고와 스크린샷. 맞지 않거나 보지 못한 경우는 BACKLOG.md에 적는다.
- [ ] R2. `node .agents/skills/verify/scripts/verify.mjs`
  - 검증: 종료 코드 0.

## Z. 문서 승격

- [ ] Z1. 결론을 현재 규칙으로 올린다(영어, 근거는 커밋 메시지).
  - PRODUCT §5 item 1 'Agent and model picker'에 고르지 않았을 때의 모델·노력 글과 Recommended 표시, 노력 메뉴의 기본값 행을 적는다. 'Permission picker'의 `Default · Accept edits · …`를 `Ask first · Accept edits · …`로 바꾼다. item 0 'New conversations'의 "Model offers Default"에 Settings 행 글을 적는다.
  - ARCHITECTURE §7 'Model lists and attachments'에 `recommended`, Claude `default` 행 빼기, Codex `config/read` 읽기를 적는다.
  - DESIGN.md의 "Default" 문장(No projects, Effort labels)과 측정값을 고친다.
  - 그 뒤 `docs/features/picker-default-labels/`를 지운다.
  - 검증: `rg -n "docs/features/picker-default-labels" docs AGENTS.md README.md`에 결과가 없고, `test ! -d docs/features/picker-default-labels`가 성공한다.

커밋 경계: Z1(문서마다 따로, AGENTS.md 'Commit conventions').
