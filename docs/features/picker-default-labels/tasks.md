# picker-default-labels — tasks

시작 전: design '결정' 1–6(사람, 2026-11-06)을 따른다. 시작 조건: fast-mode가 main에 병합된 뒤(같은 `modelPickerView`의 `effort`와 `EffortPicker`를 고친다, design §1). turn-activity와는 고치는 파일이 겹치지 않는다.

순서: UI 초안 → 순수 함수 → 배선 → 실제 앱 확인 → 문서 승격. 형식(schema·fixture) 변경은 없다.

## D. UI 초안

- [x] D1. `/design-draft picker-default-labels`: design §8대로 `.doan/canvases/picker-default-labels.html`(frame `triggers`, `menus`, `docked-widths`, `settings`)을 그린다. 글은 `doan design-skill clarify --json`을 읽고 design §5를 다듬는다.
  - 검증: `doan check --json --repo .`에 이 캔버스의 finding이 없고, `doan ls --json --repo .`가 canvas id `picker-default-labels`와 frame 네 개를 보인다.
- [x] D2. 사람이 앱에서 초안을 확인했다(2026-11-06, round 4).
  - 검증: 명령 미정 — 사람 확인 필요. design §8 상태가 "사람 확인(날짜)"이고, 다듬은 글이 design §5에 있다.

커밋 경계: D1·D2(`docs(design): picker-default-labels draft`).

## A. 순수 함수(`/tdd` → `/implement`)

모든 A 작업은 새 테스트가 구현 전 red였음을 기록한다.

- [ ] A1. main: `parseClaudeModels`의 `resolvedModel` 읽기, `default` 행 이름, 짝 행 빼기(design §2 1).
  - 검증: `npm --prefix app test`에서 `models.test.ts`가 통과한다. 새 경우: 2026-11-06 모양(`default`→`opus`, `default` 행 이름 "Opus 5.5", `opus` 행 없음, `default` 플래그·id 유지), 맞는 행 없음(그대로), `resolvedModel` 없음(그대로), 같은 `resolvedModel`을 가진 행이 둘(첫 행만 짝).
- [ ] A2. renderer 모델·노력 글: `modelPickerView`의 "Model"·`isDefault`·접근성 이름, renderer `ModelOption.defaultEffort`, 노력 트리거 글과 `unset` 행·접근성 이름, `dockedPicker`(design §2 2·3·5).
  - 검증: `npm --prefix app test`에서 `homeComposer.test.ts`·`dockedRules.test.ts`가 통과한다. 새 경우:
    - 목록 읽기 전·실패("Model", 메뉴 행 "Default"), provider 전환 뒤 새 목록을 읽기 전, 다른 provider 그룹의 기본 표시.
    - 고정 기본값이 Last used보다 먼저(POSTMORTEM 2026-11-02), 기존 대화의 저장 모델이 목록에 있음·없음(예전 `"opus"`)·없음(저장 안 됨).
    - Codex `defaultEffort` 있음("Medium")·없음("Effort"), Claude("Effort"), 고른 레벨, `unset` 행이 고르지 않은 상태에서 selected이고 options에 들어가지 않음.
    - ACP: Copilot 중복 `auto`를 걸러 낸 뒤 기본 표시가 한 행에만 있음, Antigravity의 effort-as-model id 세 개 중 `currentModelId` 행만, `currentModelId`가 목록에 없으면 표시 없음.
- [ ] A3. 권한 글: `permissionPickerView`의 "Ask first"와 provider별 설명(design §2 4).
  - 검증: `npm --prefix app test`에서 `permissionPicker.test.ts`가 통과한다. 새 경우: Claude·Codex·ACP 설명, ACP에서 Ask first만 남으면 picker가 없다는 규칙(`options.length < 2`) 유지.
- [ ] A4. Settings 글과 Model 메뉴 행(design §2 6).
  - 검증: `npm --prefix app test`에서 새 순수 함수의 테스트와 `SettingsAgents.test.tsx`가 통과한다. 새 경우: `Default · <모델>`·`Default · <레벨>`·모를 때 `Default`, 맨 위 Default 행과 그 설명, Claude `default` 행이 Settings 메뉴에만 없음, Default 행을 고르면 고정이 풀림, 저장된 Claude `"default"`가 고정 안 함으로 읽힘.

커밋 경계: A1, A2, A3, A4 각각.

## B. 배선

- [ ] B1. renderer: `AgentPicker`의 기본 표시, `EffortPicker`의 `unset` 행(위쪽 정렬 check), 세 composer, `DockedComposer` 고정 트리거 "Effort"·"Permission", Settings(D2 초안).
  - 검증: `npm --prefix app run typecheck`와 `npm --prefix app test`가 통과한다. 새 경우(구현 전 red 기록): `ComposerParts.test.tsx`에서 `unset` 행을 고르면 `onPick("")`이고 노력이 비며, 노력이 없으면 그 행이 체크된다. `DockedComposer.test.tsx`에서 고정 트리거 글이 "Effort"·"Permission"이고 tooltip·접근성 이름이 그대로다.
- [ ] B2. `/design-sync picker-default-labels`: 초안과 구현을 computed style로 맞추고, docked tray 단계(384·288)를 새 글로 다시 잰다. 측정값과 `docs/DESIGN.md:991`의 가장 긴 라벨 문장을 고친다.
  - 검증: `/design-sync` 보고에 불일치가 없다.

커밋 경계: B1, B2 각각.

## R. 실제 앱 확인

- [ ] R1. `/runtime-test`: 공용 로그인 프로필(사람 승인)로 확인한다. 이 프로필은 다른 feature도 쓰므로 이 feature에서 로그아웃하거나 지우지 않는다.
  - 통과 조건:
    - Claude Home 트리거가 "Opus 5.5"이고 메뉴의 그 행에 "Default" 표시가 있으며, 보낸 턴의 Claude frame에 `model: "default"`가 있다.
    - Codex 트리거가 isDefault 모델 이름과 "Medium"이고, send 턴의 `turn/start`에 그 model과 `effort: "medium"`이 있다.
    - 세 composer와 Settings의 권한이 "Ask first"다.
    - 노력 메뉴 Default 행을 고른 뒤의 send에 노력이 없다(Codex는 그 턴만 `defaultEffort`).
  - design §7의 두 확인 항목(Copilot `auto`, ACP 기본 모드가 묻는지)을 본다. 보지 못한 ACP provider는 BACKLOG.md에 적는다.
  - 검증: `/runtime-test` 보고, 스크린샷, frame 발췌.
- [ ] R2. `node .agents/skills/verify/scripts/verify.mjs`
  - 검증: 종료 코드 0.

## Z. 문서 승격

- [ ] Z1. 결론을 현재 규칙으로 올린다(영어, 근거는 커밋 메시지).
  - PRODUCT §5 item 1 'Agent and model picker'에 트리거 글("Model", Claude 기본 행 이름, 기본 표시), 노력의 기본 레벨 글과 Default 행을 적는다. 'Permission picker'의 `Default · Accept edits · …`를 `Ask first · Accept edits · …`로 바꾼다. item 0 'New conversations'에 Settings Model 메뉴의 Default 행과 `Default · <값>`을 적는다.
  - PRODUCT와 ARCHITECTURE에서 권한 모드 이름으로 쓴 "Default"를 모두 "Ask first"로 바꾼다(PRODUCT §3 'Resume and permissions', §5 item 1의 "leaves Default alone"·"Claude starts in Default", ARCHITECTURE §7 'Permission modes'의 "read as Default"·"sets Default" 등). 알려진 한계 두 개(plan 승인 뒤 `auto`, start 첫 턴의 노력)를 BACKLOG.md에 적는다.
  - ARCHITECTURE §7 'Model lists and attachments'에 Claude `default` 행 이름과 짝 행 빼기를 적는다.
  - DESIGN.md의 "Default" 문장(No projects, Effort labels, :991)과 측정값을 고친다.
  - 그 뒤 `docs/features/picker-default-labels/`를 지운다.
  - 검증: `rg -n "docs/features/picker-default-labels" docs AGENTS.md README.md`에 결과가 없다. `rg -n "\bDefault\b" docs/PRODUCT.md docs/ARCHITECTURE.md`의 남은 줄이 권한 모드를 가리키지 않는다(사람이 확인). `test ! -d docs/features/picker-default-labels`가 성공한다. `rg`·`test`는 읽기만 하는 점검이다.

커밋 경계: Z1(문서마다 따로, AGENTS.md 'Commit conventions').
