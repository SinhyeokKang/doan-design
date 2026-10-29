# buzz-home — design

부모 [design.md](../buzz-restyle/design.md)의 공통 결정·Buzz clone 참조 규칙·CSS 싣는 방법·금지 표현·공통 함정을 따른다. 이 문서는 홈 범위의 세부만 적는다.

## 1. 레퍼런스

- Buzz(`~/code/buzz-app`, 기준 커밋 `c40dfdf4`, 2026-10-29 로컬 HEAD `ec1b9acc`): Buzz에는 홈 대화 시작 화면이 없다. 입력창 구성(도구 줄, 선택 칩, 전송 버튼)은 `src/features/messages/MessageComposer.tsx`, `ComposerModels.tsx`·`ComposerModels.module.css`의 값과 규칙을 `/design-draft` 단계에서 기준 커밋으로 다시 읽는다. Send의 accent 채움은 공통 결정 2를 따른다.
- 다른 디자인 도구의 대화 시작 화면(2026-10-29 user 요청): Bolt, v0, Lovable, Figma Make, Claude Design, Magic Patterns, Subframe, Uizard. 관찰·출처 URL·반영 여부는 §10.
- 디자인 프리셋(AGENTS.md 'Design presets in development skills'): `shape`, `harden`, `delight`를 읽었다. `delight`의 '반복되는 상호작용은 백 번째에도 거슬리지 않게', '오류·권한·막힌 작업에는 꾸밈을 넣지 않는다'를 인사 문구·그라디언트 규칙(§5)에 반영했다.

## 2. 영향받는 구성 요소

| 구성 요소 | 변경 |
|---|---|
| renderer `Home.tsx` | 프로젝트 카드·체크리스트·연결 배너 본문을 없애고 `HomeComposer`와 장식 배경을 둔다. `ProblemActions`, `useProjectComments`, `PathTip`, `ChangedTime`은 다른 화면이 쓰므로 남긴다 |
| renderer 새 파일 | `HomeComposer.tsx`(입력창), `homeComposer.ts`(순수 함수), `ConversationStrip.tsx`(임시 상태줄), `conversationStrip.ts`(상태 reducer·문구) |
| renderer `App.tsx` | 온보딩 완료 인계, 홈 대화 ID 보관, 전송 뒤 워크스페이스 이동, 첫 캔버스 자동 열기, 권한 요청 토스트 |
| renderer `ShellSidebar.tsx`·`App.tsx` 셸 | Home에도 LNB를 보인다(2026-10-29 user). Home은 워크스페이스와 같은 셸(헤더 + LNB + 흰 본문 Panel)이고 본문에 입력창이 놓인다. Home에서 LNB는 현재 프로젝트 표시(`aria-current`)가 없고, 프로젝트·캔버스 행을 누르면 지금처럼 그 워크스페이스로 간다. 추가·중복 프로젝트 강조를 LNB 행으로 옮긴다(§6). LNB 자체의 구조·동작은 바꾸지 않는다 |
| renderer CSS | 홈 레이아웃·입력창·팝오버·상태줄. `app/src/renderer/ds/`의 프리미티브를 쓰고, 대체한 projects-home 규칙은 지운다 |
| main `conversation/ipc.ts` | `newDesign`이 자유 텍스트를 받도록 넓힌다(§4.6). `model`과 첨부 ID를 받는다(§4.7, §4.8) |
| main `conversation/` runner·prompt | 고른 모델로 실행, 첨부 경로 목록을 프롬프트에 직렬화 |
| main 새 모듈 `attachments.ts` | 첨부 경로 확인(realpath·일반 파일)·썸네일, 붙여넣기 파일 쓰기·정리, 한도, IPC `attachments:*` |
| main `conversation:models` | 공급자별 모델 목록 읽기(§4.7) |
| `setup/homeAlerts.ts` | 홈이 쓰지 않게 되므로 제거한다(체크리스트·배너 모두, §6). 다른 사용처가 있으면 그 부분만 남긴다 |
| CLI `cli/internal/designskill/` | 카탈로그(`catalog.json`)의 프리셋마다 `group`을 더하고, `doan design-skill --json` 목록과 MCP `design_skill` 목록의 요약에 `group`을 싣는다(§4.4a). 요약은 `get` 결과의 `preset`에도 쓰이므로 거기에도 `group`이 생긴다. 본문·`doan skill` 가이드·스텁은 바뀌지 않는다 |
| main `designSkills.ts` | 목록 해석이 `group`을 계약 필드로 남긴다. `group`이 없는 이전 CLI 결과도 성공으로 받는다 |
| MCP·스킬·포맷(그 밖) | 변경 없음 |

## 3. 화면 구성

```
┌ Shell header (buzz-shell) ───────────────────────────────────┐
│ LNB │   [accent 타원 그라디언트 + grain, Welcome 방식]           │
│     │              What should we design today?               │
│     │                                                         │
│     │   ▣ doan-design ⌄                       ← 프로젝트 선택기   │
│     │   ┌─────────────────────────────────────────────┐      │
│     │   │ [▣ shot.png ×] [📄 brief.pdf 1.2 MB ×]        │      │
│     │   │ [✦ Document the design system ×]             │      │
│     │   │ Describe what to design, / for presets        │      │
│     │   │                                               │      │
│     │   │ +  ✦                 Claude Code · Opus ⌄  (↑) │      │
│     │   ├─────────────────────────────────────────────┤      │
│     │   │ ⎇ main ⌄   ~/code/doan-design      ← 트레이     │      │
│     │   └─────────────────────────────────────────────┘      │
│     │         오류·비활성 이유 한 줄 (role=status/alert)          │
└─────┴─────────────────────────────────────────────────────────┘
```

- 배치 출처(2026-10-29 user): 사용자가 보낸 Antigravity 입력창 스크린샷. 입력창 위에 프로젝트 드롭다운, 입력 카드 안의 `+`·모델 선택기·마이크, 카드 아래에 붙은 트레이의 워크트리 모드(Local / New Worktree)·브랜치 선택기가 있었다. 스크린샷으로만 확인했고 앱은 직접 실행하지 않았다. doan은 프로젝트 위치, 트레이, 공급자·모델 통합 선택기, placeholder의 단축 안내를 가져온다. 'New Worktree'와 브랜치 전환은 git 작업이라 가져오지 않는다(PRODUCT §3 Out of scope 6). 마이크도 넣지 않는다. macOS 받아쓰기가 textarea에서 동작하기 때문이다.
- 입력 카드 안: 위에서부터 첨부 칩·프리셋 칩, textarea, 도구 줄(`+` 첨부, `✦` 프리셋, 공급자·모델 선택기, Send). 입력 카드 밖: 위의 프로젝트 선택기, 카드 아래에 붙은 워크트리 트레이.

- 입력창은 흰 `surface-panel` 위에 놓인다. 그라디언트는 본문 Panel 안 배경에만 쓰고 LNB·헤더에는 번지지 않는다. 세부 값은 `/design-draft`에서 정한다.
- 입력창 폭은 본문 폭을 따라 줄어든다. 최소 창 폭에서도 도구 줄이 넘치지 않게, 좁으면 선택기 라벨을 아이콘과 짧은 이름으로 줄인다(`/design-draft`에서 기준 폭 확정).

### 3.1 입력창 UI 품질 기준 (2026-10-29 user: "매우 신경써줘")

- `/design-draft`는 입력창을 정적 한 장이 아니라 상태별 프레임으로 그린다: 빈 입력(포커스 전·후), 여러 줄·최대 높이 스크롤, 한도 근접·초과, 첨부 칩(이미지·파일·확인 중·거절·사라진 파일), 프리셋 칩, 프리셋 팝오버(추천 묶음·검색·결과 없음·읽는 중·실패·이전 CLI), `/` 단축, 입력창 위 프로젝트 선택기(문제 프로젝트 비활성·빈 상태), 공급자·모델 통합 선택기(준비·확인 전·미준비 공급자 묶음, 모델 목록·Default만·읽는 중), 워크트리 트레이(하나·여럿·문제 root·git 아님), 드롭 대상 강조, 전송 중, 거절 오류, 좁은 폭.
- 모든 컨트롤에 default·hover·focus-visible·pressed·disabled를 그린다(`harden` 프리셋). 아이콘만 있는 버튼은 툴팁과 접근 가능한 이름을 가진다.
- 키보드만으로 모든 기능을 쓸 수 있다: Tab 순서(프로젝트 선택기 → 입력 → 도구 줄 왼쪽에서 오른쪽 → Send → 트레이), 팝오버의 ↑/↓·Enter·Escape, Escape는 열린 팝오버만 닫고 초안을 지우지 않는다. 상태 변화(첨부 거절, 전송 실패, 프리셋 읽기 실패)는 `role="status"`/`alert`로 알린다.
- 구현 뒤 `/design-sync`에서 위 상태를 실제 앱에서 computed style로 측정한다. 실제 앱에서 만들 수 없는 상태는 마크업 렌더로 측정하고 DESIGN.md에 '실제 앱 미도달'로 적는다(buzz-onboarding과 같은 방식).
- `/ux-audit`의 문구·상태 관점으로 홈과 기존 화면(온보딩 Agent 단계, Quick Open)의 용어가 맞는지 확인하는 task를 둔다.

## 4. 입력창 기능

### 4.1 텍스트

- 여러 줄 `textarea`. 내용에 따라 높이가 늘고, 정해진 줄 수를 넘으면 안에서 스크롤한다(넘칠 만큼의 실제 입력으로 스크롤 도달 확인, POSTMORTEM 2026-10-25 checklist).
- Enter는 보내고 Shift+Enter는 줄을 바꾼다. IME 조합 중(`event.nativeEvent.isComposing` 또는 keyCode 229)에는 Enter로 보내지 않는다.
- 최대 32,768 UTF-16 code unit(대화 IPC 한도). 프리셋 머리말을 더한 최종 텍스트 기준이다. 한도의 90%부터 남은 글자 수를 보이고, 넘으면 Send를 막는다.
- 초안은 앱이 실행되는 동안 renderer 메모리에 남는다. 홈을 떠났다 돌아와도 텍스트·프리셋·선택이 그대로다. 재시작 뒤에는 비어 있다(spec 비목표).

### 4.2 프로젝트 선택기와 워크트리 트레이 (2026-10-29 user: Antigravity 배치)

- **프로젝트 선택기**는 입력창 위에 놓인다(`▣ <project> ⌄`, 프로젝트 썸네일 + 이름). LNB와 같은 묶음·순서로 저장소(프로젝트 묶음) 단위를 고른다(`groupProjects`).
- **워크트리 트레이**는 입력 카드 아래에 붙은 줄이다. 고른 프로젝트의 등록된 워크트리를 브랜치 이름(분리된 HEAD면 `detached <7자 SHA>`)과 경로(`~/…` 축약)로 보이고, 워크트리가 둘 이상일 때만 ⌄로 고를 수 있다. 고르는 단위는 root다. 브랜치는 읽기 전용이다. 새 워크트리 만들기와 브랜치 전환은 없다(Out of scope 6). git이 아닌 프로젝트는 경로만 보인다.
- `list`가 아닌 root(Missing, Not set up, Config error, CLI error, 읽는 중)는 칩과 함께 비활성으로 보이고, '이 프로젝트를 고치려면 LNB의 프로젝트 메뉴를 쓴다'는 문구를 단다. 묶음의 모든 root가 비활성이면 프로젝트 선택기에서 그 프로젝트도 같은 칩으로 비활성이다. 홈에서 복구 동작을 다시 만들지 않는다.
- 기본 선택 순서(root 기준): (1) 온보딩 완료 기록의 root(인계), (2) 지금 로드된 워크스페이스 root, (3) 이 기기에서 마지막으로 홈에서 보낸 root, (4) LNB 순서의 첫 healthy root. 프로젝트를 바꾸면 그 프로젝트에서 LNB가 기억하는 워크트리(`selectedRoot`), 없으면 첫 healthy root가 트레이에 선택된다. (3)은 기존 ui-state에 한 키를 더해 저장한다(§8).
- 프로젝트가 없으면 프로젝트 선택기 자리에 Add Projects…를 두고, 트레이는 그리지 않고, Send는 '프로젝트를 추가하면 보낼 수 있다'로 막는다. 창 전체 폴더 드롭은 그대로 쓴다.

### 4.3 공급자·모델 선택기 — 공급자 (2026-10-29 user: 연결 안 된 공급자는 그리지 않는다, 모델과 한 선택기)

- 도구 줄의 `+`·프리셋 버튼·모델·effort는 모두 `--text-standard` 글자·아이콘이고, 모델과 effort는 평소에는 채움 없는 sm 버튼이라 hover·열림에서만 바탕이 보인다(2026-10-29 user).
- 공급자와 모델은 도구 줄의 한 선택기다(2026-10-29 user). 공급자는 **로고로만** 보이고 이름은 접근 가능한 이름과 툴팁에 둔다. 모델만 텍스트로 보인다. 닫혀 있을 때 `[로고] <model label> ⌄`(모델이 Default면 `[로고] Default ⌄`)이다. effort는 별도 캡슐이다(§4.7). 로고는 온보딩이 쓰는 `app/src/renderer/public/provider-logos/`를 재사용한다. 펼치면 공급자별 묶음(머리에 로고와 공급자 이름) 아래 그 공급자의 모델 행이 있고, 모델 행을 고르면 공급자와 모델이 함께 정해진다. 모델 목록이 아직 없는 공급자는 'Default' 행 하나이고, 묶음을 펼칠 때 목록을 읽는다(§4.7).

- agent-auth의 다섯 공급자 중 **저장된 연결이 있는 공급자만** 정해진 순서로 보인다. 연결이 없는 공급자(`not_connected`, 즉 상태 DTO의 phase `disconnected`)는 목록에 없다. 로그인·설치 동작은 홈에 두지 않는다.
- 연결은 있지만 지금 실행할 수 없는 공급자(재인증, 버전 미달·불명, 확인 전, 도구 누락)는 상태 문구와 함께 비활성 행으로 보인다. 문구는 공용 view-model `agentAuthView.ts`에서 가져오고 새로 쓰지 않는다. 복구 버튼은 두지 않는다(2026-10-29 user).
- 고를 수 있는 공급자는 `readiness.ready`이거나 cause가 `unverified`인 공급자다(`selectableProvider`, 순수 함수). 재시작 직후에는 연결된 공급자가 모두 `unverified`/retry로 보이기 때문이다(ARCHITECTURE §7). 이 상태의 실행은 main이 먼저 확인을 돌리고(`createAccountPrepare`, `conversation/prepare.ts` 116–121행), Copilot은 첫 실행이 확인을 대신한다. 확인이 실패하면 거절 코드로 돌아오고, §4.5의 복구 문구를 보인다. 기본값은 이 기기에서 마지막으로 홈에서 보낸 공급자다. 그 공급자가 준비되지 않았으면 순서상 첫 준비된 공급자다.
- 준비된 공급자가 없으면 Send를 막고 이유를 보인다. 연결된 공급자가 하나도 없으면 홈에서 로그인할 길이 없다. 이 한계는 buzz-settings가 계정 UI를 만들 때까지 남는다. PRODUCT §7과 부모 C9에 인계로 적는다.

### 4.4 디자인 프리셋 선택기 (2026-10-29 user)

- 도구 줄의 프리셋 버튼이 Radix Popover를 연다. 위에 검색 입력, 아래에 목록이 있다. 입력이 비어 있을 때 맨 앞에서 `/`를 치면 같은 목록이 열리고, 이어 치는 글자가 검색어가 된다. 고르면 `/검색어`는 지워진다.
- 목록은 `designSkills.list()`를 팝오버를 처음 열 때(또는 `/`를 처음 칠 때) 한 번 읽고, 그 실행 동안 결과를 재사용한다. 실패하면 다음에 열 때 다시 읽는다. renderer에 카탈로그 사본을 두지 않는다.
- 검색: 제목·id·설명에 대해 NFC 정규화·대소문자 무시, 모든 토큰 일치. 순위는 Quick Open과 같은 방식(접두 > 단어 시작 > 부분 문자열)을 쓴다.
- 목록 구성: 검색창 아래에 그룹 탭 한 줄(`Suggested`, Start, Review, Refine, Content, Explore, §4.4a)을 두고 고른 탭의 프리셋만 보인다. 기본 탭은 Suggested('<project>에 맞는 프리셋')이다. 처음에는 추천 아래에 그룹 묶음을 이어 붙였는데, 목록 높이 안에 추천과 Start만 들어가고 추천 프리셋이 두 번 나와서 탭으로 바꿨다(1차 초안 수정). 검색어가 있으면 탭과 상관없이 전체에서 순위대로 찾고, 행 오른쪽에 그룹 이름을 메타데이터로 보인다. 탭은 ←/→로 옮기고, 목록은 ↑/↓로 옮긴다. 추천이 비면 Suggested 탭을 숨기고 Start를 기본으로 한다. 이전 CLI(`group` 없음)에서는 탭이 없다.
- 맨 위 '<project>에 맞는 프리셋' 묶음(최대 3개, 검색어가 없을 때만): 순수 함수 `suggestedPresets(entry)`.
  - 캔버스 0개 → `context`, `shape`
  - id나 파일 이름이 `design-system`인 캔버스가 없음 → `document`
  - 캔버스가 있음 → `critique`, `polish`
  - CLI 목록에 없는 id는 건너뛴다. 규칙이 id를 참조하는 것은 카탈로그 사본이 아니다(제목·설명은 항상 CLI 결과에서 읽는다).
- 행은 한 줄로 제목과 `scope`(CLI 목록의 2~3단어 주제, 예: `design review`, `edge-case states`)를 보이고, description과 id는 툴팁에만 둔다(2026-10-29 user). description은 93~148자의 에이전트용 문장이라 팝오버 폭에서 잘려 읽히지 않았다(1차 초안).
- accent(2026-10-29 user): 고른 프리셋 칩에만 쓴다(새 역할 `--surface-accent-subtle` violet 3 채움 + `--text-accent-subtle` violet 11 글자, 앵커 칩과 같은 연한 채움 + 진한 글자 방식)에만 쓴다. 도구 줄 프리셋 버튼, 그룹 탭, 추천 프롬프트 칩(`quiet`, §4.4b)은 무채색이다. 진한 accent 채움은 Send뿐이라 Send가 가장 강한 accent로 남는다. 공통 결정 2의 accent 자리에 더하는 예외라서 PRODUCT §7과 부모 공통 결정 2 요약에 기록한다.
- 고른 프리셋은 입력 위에 칩(제목, × 제거)으로 보인다. 프리셋을 고르고 입력이 비어 있으면 placeholder가 `Which canvas or screen? Add details…`로 바뀐다. `critique`·`polish`·`harden`·`audit` 등 많은 프리셋이 사람이 지목한 디자인을 다루는데 홈에는 선택한 캔버스가 없어서, 프리셋만 보내면 에이전트가 대상을 되묻는 왕복이 생기기 때문이다. 어떤 프리셋이 대상을 요구하는지는 UI가 알 수 없으므로(ARCHITECTURE §7) 모든 프리셋에 같은 문구를 쓴다. 하나만 고를 수 있고 새로 고르면 바뀐다. Backspace를 빈 입력 맨 앞에서 누르면 칩이 지워진다.
- 상태: 읽는 중(spinner, '프리셋을 불러오는 중'), 실패(`cli_error`의 `reason`별 문구와 Retry, `request_refused`는 Retry 없이 문구만), 이전 CLI(`list()`가 `usage_error` → '이 doan CLI에는 디자인 프리셋이 없다. Doan을 업데이트한다'), 검색 결과 없음. 어느 실패에서도 프리셋 없이 보낼 수 있다.

### 4.4b 추천 프롬프트 (2026-10-29 user)

같은 날의 '상태 기반 제안 카드 없음' 결정을 대체한다.

- 입력과 칩이 모두 비어 있을 때만 입력창(트레이) 아래 가운데에 칩 3개를 보인다. 칩은 줄바꿈(flex-wrap)되므로 문장을 짧게 줄이지 않는다(2026-10-29 user). 한 칩이 입력창 폭보다 길면 말줄임표로 자르고 툴팁에 전체 문장을 둔다. 하나라도 채워지면 숨긴다. 프로젝트가 없거나 준비된 공급자가 없으면 보이지 않는다.
- 내용은 순수 함수 `suggestedPrompts(entry)`가 정한다. 프리셋은 `suggestedPresets`와 같은 규칙이고, 대상이 필요한 프리셋에는 캔버스 이름을 채운다(§4.4의 '대상 되묻기' 왕복을 줄인다).
  - 캔버스 0개 → `Gather design context`(context), `Shape a first screen`(shape), `Document the design system`(document)
  - 캔버스 있음 → `Document the design system of <project>`(design-system 캔버스가 없을 때만), `Critique the <가장 최근에 바뀐 캔버스> canvas`(critique), `Polish the details of <그다음으로 최근 캔버스, 없으면 같은 캔버스>`(polish)
  - CLI 목록에 없는 프리셋은 건너뛰고, 3개가 안 되면 있는 만큼만 보인다.
- 칩은 sm 버튼의 새 공용 변형 `quiet`이다(2026-10-29 user). 배경은 헤더 캡슐과 같은 `--affordance-backdrop-hover`(hover·pressed는 `--affordance-backdrop-pressed`)이고, 아이콘과 글자는 `--text-standard`다(accent로 칠했다가 같은 날 되돌림). 아이콘은 그 프리셋 그룹의 아이콘이다. 칩 문구는 대상까지 담고(`Critique the buzz-onboarding canvas`), 채우는 문장은 경로까지 명시한다. 예를 들어 `Critique the buzz-onboarding canvas`를 누르면 Critique 프리셋 칩과 `Critique the buzz-onboarding canvas (.doan/canvases/buzz-onboarding.html).`이 채워지고 포커스는 입력 끝에 간다. 바로 보내지 않는다.
- 프로젝트를 바꾸면 다시 계산한다. 같은 방문 동안 프로젝트가 같으면 바뀌지 않는다.

### 4.4a 프리셋 그룹 (2026-10-29 user)

20개를 한 목록으로 보이면 `critique` 프리셋 자신의 '선택지 8개 이상은 과부하' 기준을 넘는다. upstream(Impeccable, `SOURCES.md`)에는 분류가 없어서 doan이 사람이 하려는 일 기준으로 정한다.

| group | 프리셋(카탈로그 순서) |
|---|---|
| Start | context, shape, document, extract |
| Review | critique, audit |
| Refine | polish, bolder, quieter, layout, typeset, colorize |
| Content | distill, clarify, harden, onboard |
| Explore | adapt, animate, delight, generate |

- `group`은 표시 이름 문자열이다(영어 UI 문구, 위 다섯 값). 카탈로그 쪽 계약이므로 renderer에 그룹 표를 두지 않는다.
- 아이콘(lucide, 2026-10-29 user): Suggested·프리셋 버튼 `pencil-sparkles`, Start `compass`, Review `scan-eye`, Refine `paintbrush`, Content `text-align-start`, Explore `shapes`. 그룹 이름→아이콘 짝은 renderer에 두고, 모르는 그룹은 `pencil-sparkles`로 대체한다. 고른 프리셋 칩과 추천 프롬프트 칩은 그 그룹의 아이콘을 쓴다.
- 그룹 순서는 카탈로그에서 그 그룹이 처음 나오는 순서이고, 그룹 안의 순서는 카탈로그 순서다. 지금 카탈로그 순서에서 위 표의 순서가 그대로 나온다. 카탈로그 순서(PRODUCT §5 Skills 13)는 바꾸지 않는다.
- CLI 테스트: 모든 프리셋이 다섯 값 중 하나를 가지며 각 그룹이 비지 않는다. 그룹이 카탈로그 안에서 연속하지 않아도 되지만, 지금 카탈로그는 연속한다는 것도 고정한다(앞의 순서 규칙이 표와 같아지는 조건).
- 이전 CLI(`group` 없음): 그룹 탭 없이 추천과 'All presets' 한 목록으로 보인다. 오류가 아니다.

### 4.5 보내기

- 최종 텍스트(`composeRequest`, 순수 함수):
  - 프리셋 없음: 사용자 텍스트 그대로(앞뒤 공백 제거).
  - placeholder: `Describe what to design, / for presets`. 공급자 이름 대신 단축을 알린다(Antigravity의 "@ to mention, / for actions").
- 프리셋 있음: ``Use the doan design preset `<id>` (<title>).`` 한 줄, 빈 줄, 사용자 텍스트. 사용자 텍스트가 비어 있으면 첫 줄만 보낸다. 에이전트는 `PRESET_GUIDANCE`의 '사용자가 이름을 댄 프리셋' 규칙으로 읽는다. 이 형식은 PRODUCT §7에 기록한다.
- 홈에서 보낸 요청에는 마지막에 고정 문장 `This request was sent from Doan's Home without a canvas selection. Do not take its target from doan active; if it needs a canvas, find it from the request or ask.`을 붙인다(2026-10-29 user). 홈으로 가도 로드된 워크스페이스의 선택과 `doan active`가 유지되므로(PRODUCT §5 항목 1), 프리셋의 '가리키는 말은 `doan active`로 찾는다' 규칙 때문에 다른 프로젝트 캔버스의 이전 선택이 대상으로 잡힐 수 있다. 이 문장도 `composeRequest`가 만들고 PRODUCT §7에 기록한다.
- `sendAvailability`(순수 함수)가 Send의 활성 여부와 이유 한 줄을 정한다: 프로젝트 없음·healthy 아님, 준비된 공급자 없음, 텍스트와 프리셋이 모두 비어 있음, 한도 초과, 같은 root에서 홈이 시작한 대화가 아직 끝나지 않음, 전송 중.
- 같은 root에 진행 중인 홈 대화가 있으면 그 줄에 Open을 둔다. 한 프로젝트에 홈 대화를 동시에 두 개 두지 않는 이유는 임시 상태줄이 하나만 보여 다른 대화의 권한 요청이 가려지기 때문이다.
- 호출: `startConversation({root, mode: "newDesign", runtime, text})`. 전송 중에는 입력을 읽기 전용으로 두고 Send에 spinner를 보인다.
- 성공: 초안을 비우고, 마지막 root·공급자를 저장하고, 그 root의 워크스페이스(Overview)로 이동한다. 기존 전환 보호를 통과해야 이동한다. 전환이 거절되면 홈에 남아 상태줄 대신 토스트 'Started in <project>' + Open을 보인다.
- 거절: 입력을 유지하고 입력창 아래에 `startErrorView(code)`의 문구를 보인다. 공급자 계열 코드(`not_logged_in`, `cli_missing`, `runtime_unsupported`, `no_agent`)는 그 공급자의 `readiness.action`을 복구로 쓴다(ARCHITECTURE §7). `busy`는 잠시 뒤 다시 보내기, `credential_override`는 저장소 `.claude/settings*.json`의 API 키 설정 때문이라는 설명, `cli_install_failed`는 Antigravity 서버 다운로드 실패와 Retry, `project_not_open`·`bad_request`·`rate_limited`·`unknown`은 각자 문구. 자동 재시도는 없다.

### 4.6 `newDesign` 자유 텍스트 (main 변경)

지금 `newDesign`은 한 줄 `subject`(최대 500 code point)만 받고 텍스트를 `promptSentence(root, subject)`로 바꾼다(`conversation/ipc.ts`). 홈 요청은 여러 줄이라 이 형식에 맞지 않는다.

- 변경: `newDesign`은 `subject`가 있으면 지금과 같이 동작하고(FirstPrompt 경로 유지), `subject`가 없으면 `text`를 그대로 사용자 텍스트로 쓴다. 둘 다 없거나 텍스트가 공백뿐이면 `bad_request`. 다른 검증(텍스트 한도, runtime 필수, canvas 금지)은 그대로다.
- 대화 제목은 지금처럼 `(subject ?? text).slice(0, 512)`이다. 프리셋을 고르면 머리말 문장이 제목 앞부분이 되지만 제목 계산은 바꾸지 않는다. 제목을 어떻게 보일지는 buzz-conversation이 정한다.
- 이 변경은 IPC 요청 형식의 확장이다. `conversation:start` 표(ARCHITECTURE §7)를 갱신한다.

### 4.7 공급자·모델 선택기 — 모델과 effort (2026-10-29 user)

- §4.3의 통합 선택기 안 공급자 묶음의 행이다. 고른 공급자가 실행 중에 알려준 모델 목록만 보인다. renderer와 main에 모델 목록을 하드코딩하지 않는다. 목록을 읽지 못하거나 공급자가 목록을 주지 않으면 'Default' 하나만 보이고 비활성 이유를 툴팁에 단다.
- 출처 후보(구현 전 PoC P1에서 공급자별로 확인한다. 기억으로 정하지 않는다):
  - Claude Code: 번들 Agent SDK 0.3.312의 `Query.supportedModels(): Promise<ModelInfo[]>`와 `setModel()`(`sdk.d.ts` 3096, 2979행 확인). 시작 옵션의 `model`도 후보.
  - Codex: direct app-server의 모델 목록 RPC와 `thread/start`·`turn/start`의 모델 인자. 0.164.0에서 존재·형식 확인 필요.
  - Cursor·Copilot·Antigravity(ACP): `session/new` 결과의 모델 정보와 모델 변경 요청. 기록된 `initialize` fixture에는 모델 정보가 없다(`acp-cursor.json`, `acp-copilot.json`). 세션을 만들어야 목록이 나오는 경우의 비용과 Copilot 요청 비용을 확인한다.
- 새 main API `conversation:models {runtime}` → `{models: {id, label, default, efforts?: string[]}[]} | {error}`. 결과는 공급자의 연결 세대·설치 버전이 바뀔 때까지 main이 메모리에 보관한다. 목록을 얻으려고 모델 요청(과금 요청)을 쓰는 공급자는 사람이 선택기를 열 때만 읽는다.
- 선택: `startConversation`의 `model?: string`. main은 마지막으로 받은 그 공급자의 목록에 있는 id만 받는다(그 외 `bad_request`). 고른 모델은 index 메타데이터에 남겨 같은 대화의 다음 send가 같은 모델을 쓴다(buzz-conversation이 소비). index 버전을 올릴지 선택 필드로 v2에 더할지는 `/tdd`에서 기존 판독기를 읽고 정한다.
- 기본값: 공급자별로 이 기기에서 마지막으로 고른 모델(ui-state `home.models[provider]`). 목록에 없으면 공급자 기본값.
- **effort**(2026-10-29 user): 모델과 나눈 별도 컨트롤이다. 고른 모델이 effort 단계를 알려줄 때만 모델 선택기 오른쪽에 effort 캡슐(`◔ High ⌄`, Gauge 아이콘은 Buzz `ComposerModels.tsx`의 effort 아이콘과 같다)이 생기고, 누르면 그 모델의 단계만 담은 compact 메뉴가 열린다. 모델 선택기 안에서는 effort를 고르지 않고, effort를 지원하는 모델 행에 'Effort' 표시만 단다. 단계가 없는 모델로 바꾸면 캡슐이 사라지고, 다시 돌아오면 그 모델에 마지막으로 고른 단계가 돌아온다. 단계를 알려주지 않는 모델·공급자에는 effort UI가 없다. Claude Agent SDK 0.3.312의 `ModelInfo.supportsEffort`·`supportedEffortLevels`(low/medium/high/xhigh/max)와 시작 옵션 `effort`(`sdk.d.ts` 1433·1965행 확인)가 출처 후보다. Codex·ACP 공급자의 effort 출처는 P1에서 확인한다. `startConversation`에 `effort?: string`을 더하고, main은 그 모델의 마지막 목록에 있는 단계만 받는다. 기본값은 모델별로 마지막에 고른 단계, 없으면 공급자 기본값(값을 보내지 않음)이다.

### 4.8 첨부 (2026-10-29 user: 파일을 보내지 않고 로컬 경로를 알려준다)

첨부는 파일 전송이 아니다. 에이전트는 사람의 Mac에서 실행되므로, doan은 파일의 로컬 경로를 요청에 적고 에이전트가 자기 도구로 그 파일을 읽는다. 참고: Orca 1.4.243 `out/shared/agent-session-attachments.js`의 "local pastes write in place, and agents receive only host paths"(설치 번들 확인, 2026-10-29). 경로가 없는 붙여넣기 내용만 Orca처럼 userData에 쓴다(Orca 디렉터리 `agent-session-attachments`, 상한 50 MB).

- 추가 경로: 도구 줄의 "+" 버튼(main의 파일 선택 대화상자, 여러 개), 입력창 위로 파일 드롭, 클립보드 이미지 붙여넣기. 입력창 밖으로 드롭한 폴더·파일은 지금처럼 프로젝트 추가 흐름이 받는다. 입력창 위로 폴더를 드롭하면 '폴더는 첨부할 수 없다'를 보이고 프로젝트 추가로 넘기지 않는다.
- 로컬 파일: 복사하지 않는다. 대화상자는 main이 연다. 드롭은 preload `webUtils.getPathForFile`로 경로를 얻는다(기존 `folders:add-paths`와 같은 규칙: 절대 경로 문자열만, 개수·길이 상한). main은 실제 경로(realpath)로 바꾸고 일반 파일인지 확인한 뒤 불투명 ID와 `{name, size, kind: "image" | "file", path}`를 준다. 이미지면 작은 썸네일(`nativeImage` 축소, data URL)도 준다. 사람이 고른 파일 외의 경로는 읽지 않는다. 보내는 순간 다시 확인해서, 그 사이 파일이 지워지거나 옮겨졌으면 그 칩에 이유를 보이고 전송을 막는다.
- 붙여넣은 이미지(경로 없음): preload가 바이트를 넘기고, main은 크기 상한을 확인한 뒤 `<userData>/attachments/<id>/pasted-<시각>.png`에 쓴다. doan이 만든 파일은 이것뿐이다.
- 한도: 한 요청에 10개(Figma Make와 같은 값, §10). 붙여넣기 하나는 50 MB(Orca와 같은 값). 로컬 파일 크기는 doan이 제한하지 않는다. 에이전트가 읽을 수 있는지는 공급자 몫이다. 한도를 넘은 항목만 거절하고 칩 자리에 이유를 보인다.
- 전달: 사용자 텍스트 뒤에 고정 머리말과 첨부 목록(이름, 절대 경로)을 붙인다. `turnPrompt`의 untrusted 데이터 경계 규칙에 따라 경로를 데이터로 직렬화한다. 이미지도 경로로만 넘기고, 에이전트가 파일 읽기 도구로 이미지를 볼 수 있는지 PoC P2에서 공급자별로 확인한다. 볼 수 없는 공급자에만 이미지 입력 형식(SDK 이미지 블록, ACP `promptCapabilities.image`)을 더하는 결정을 사용자에게 묻는다.
- 저장소 밖 경로는 공급자의 샌드박스·권한 설정에 따라 읽기 권한 요청을 만들 수 있다. 임시 상태줄이 그 요청에 답하게 한다(§7). doan은 권한 설정을 바꾸거나 우회하지 않는다(PRODUCT §3 'Resume and permissions').
- 수명: 로컬 파일은 doan이 건드리지 않는다. 붙여넣기 파일은 보내지 않고 칩에서 지우면 지우고, 앱 종료 때 남은 미전송 파일은 다음 시작 때 정리한다. 보낸 붙여넣기 파일은 그 대화 기록과 함께 남는다. 대화 기록처럼 보존 정책은 없고, 기기 사이에 옮겨지지 않는다.
- 기록: `user.message` 이벤트에 첨부 메타데이터(`{name, size, kind, path}`)를 더한다. 이벤트 v1에 선택 필드로 더할지는 `/tdd`에서 판독기를 읽고 정한다.
- UI: 칩은 입력 위 한 줄에 놓이고, 넘치면 가로 스크롤하지 않고 줄을 바꾼다. 이미지 칩은 썸네일, 파일 칩은 아이콘·이름·크기를 보이고 툴팁에 전체 경로(`~/…` 축약)를 단다. 칩마다 × 제거가 있다. 키보드로 칩에 가서 Delete/Backspace로 지울 수 있다.

## 5. 꾸밈 요소 (2026-10-29 user)

- **그라디언트**(2026-10-29 user, 사용자가 보낸 Gemini 홈 스크린샷 참고): Welcome과 다른 홈 전용 배경이다. 입력창 가운데(본문 패널의 가로 50%·세로 60%)에서 퍼져 나가는 가로로 긴 violet 타원이고(`--affordance-accent`를 24%→15%→6%→투명으로 섞음), grain이 없는 매끄러운 정지 화면이다. 본문 패널 모서리에서만 잘린다. Welcome 밖에서 accent 그라디언트를 쓰는 것은 공통 결정 2의 예외라서 PRODUCT §7에 기록한다. 입력창·팝오버·오류 줄은 흰 면 위에 있어 대비가 바뀌지 않는다. reduced transparency에서는 불투명도를 낮추고, `forced-colors`에서는 배경을 없앤다.
- **인사 문구**: 고정된 영어 문장 목록에서 홈에 들어올 때 하나를 고른다(`pickGreeting(pool, previous, random)`, 순수 함수). 직전 문구는 다시 고르지 않고, 같은 방문 동안 바뀌지 않으며, 애니메이션 없이 나타난다. 문구는 제품 사실을 주장하지 않는 질문형이다(2026-10-29 user). `<project>`는 프로젝트 선택기에 고른 프로젝트 이름이고, 프로젝트가 없으면 그 문구는 후보에서 빠진다:
  - What should we design today?
  - What are we making next?
  - What would you like to change?
  - What’s next for <project>?
  - Where should we start?
- 오류·권한·막힌 상태에는 꾸밈을 더하지 않는다(`delight` 프리셋).

## 6. 홈 카드가 하던 일의 행방

| 지금 홈 카드·본문의 동작 | 새 위치 |
|---|---|
| 프로젝트 목록·워크트리 행·Open 표시 | Home에도 보이는 LNB(2026-10-29 user). 홈 본문에서는 없앤다 |
| 문제 행의 Set Up…/Locate…/Retry/Details | LNB 프로젝트 메뉴(이미 있음). 홈 선택기는 비활성 + 안내만 |
| 행 단위 Remove, 카드 Remove all, Undo 토스트 | LNB 'Remove from doan'(프로젝트 전체), Settings Projects(행 단위). Undo 토스트는 그대로 |
| 추가·중복 프로젝트로 돌아가 카드 강조 | 홈에서는 추가된 첫 root를 프로젝트 선택기 선택으로 바꾸고, LNB의 그 프로젝트 행을 같은 시간(2.4초) 강조한다 |
| 'Selected for your agent: …' 표시 | 홈에서는 없앤다. Inspector의 안내 문구는 그대로 |
| 열린 코멘트·리뷰·'without a canvas' 수 | 홈에서는 없앤다. Overview·LNB 표시는 그대로 |
| 'Finish setting up doan' 체크리스트 | 없앤다. 프로젝트 없음은 프로젝트 선택기, 준비된 공급자 없음은 공급자 선택기가 보인다. CLI 링크는 Settings > Connections에만 있다 |
| 외부 CLI 연결 'Needs attention' 배너 | 없앤다(2026-10-29 user). 외부 CLI·Claude Code·Codex의 스킬·MCP·링크 상태는 Settings > Connections에서만 보인다. 앱을 열 때 따로 알리지 않는다 |
| 'No projects yet' 빈 상태 | 프로젝트 선택기의 빈 상태(§4.2) |
| 홈 진입 포커스(Open 행·첫 카드) | 입력창 textarea |

PRODUCT §5 항목 0·1과 ARCHITECTURE §7 'Home, workspace and project IPC'의 홈 서술이 바뀌므로 마지막 task에서 고친다.

## 7. 임시 대화 상태줄 (buzz-conversation이 대체)

- 위치: 워크스페이스 본문 위, 기존 project status strip과 같은 줄 계열. 그 root에서 홈이 시작한 대화 중 가장 최근 것 하나를 보인다(§4.5로 동시에 하나뿐).
- 상태(reducer `stripState(events)`, 순수 함수, `state.ts:mergeEvents`로 합친 이벤트를 받는다):
  - starting/streaming: '<Provider> is working' + 마지막 `activity.summary` 한 줄 + Stop
  - waitingPermission: `permission.request.summary` + 공급자가 준 선택지 버튼(`allow`/`allowAlways`/`deny`) + Stop
  - failed: `turn.failed.code`별 문구(§4.5와 같은 표) + Dismiss
  - interrupted: 'Stopped' + Dismiss
  - done: 'Done' + 만든 캔버스가 있으면 Open, Dismiss
- 구독 순서는 ARCHITECTURE §7의 규칙(구독 먼저, read 뒤 seq 병합)을 지킨다.
- 이 대화가 처음 나타난 캔버스에 묶이면(`newDesign` 바인딩), 사람이 그 사이 다른 캔버스를 열지 않았을 때만 그 캔버스를 자동으로 연다. 다른 화면에 있으면 토스트 'New canvas in <project>' + Open(기존 FirstPrompt 도착 문구와 같음).
- 다른 root나 홈에 있을 때 `permission.request`가 오면 토스트 '<Provider> needs your answer in <project>' + Open. 토스트는 하나뿐이라 새 토스트가 이전 것을 바꾼다(기존 계약).
- 대화 ID는 renderer 메모리에 둔다. renderer 새로고침 뒤에는 상태줄이 사라지는 한계를 받아들이고 DESIGN.md에 적는다. 앱 재시작 뒤에는 백엔드가 끝나지 않은 턴을 crashed로 접으므로 보일 것이 없다.

## 8. 저장

- ui-state.json(design-nav)에 `home: {lastRoot?, lastProvider?}`를 더한다. 없는 root·준비되지 않은 공급자는 무시한다. 기존 키와 버전 처리를 따르고 새 파일을 만들지 않는다. 형식 버전을 올려야 하는지는 `/tdd`에서 기존 ui-state 판독기를 읽고 정한다(지금 판독기가 모르는 키를 버리는지 확인).
- 온보딩 완료 기록 v1 형식은 바꾸지 않는다. 인계는 기존 `onClose(root)` 경로에서 받는다(`App.tsx`).

## 9. 결정한 질문

- Q1. 결정(2026-10-29 user): 연결 안 된 공급자는 그리지 않는다(§4.3).
- Q1b. 결정(2026-10-29 user): 연결은 있지만 준비되지 않은 공급자는 비활성 행과 상태 문구만 보이고 복구 버튼은 두지 않는다(§4.3).
- Q2. 결정(2026-10-29 user): 외부 CLI 연결 배너는 홈에서 뺀다(§6).
- Q3. 결정(2026-10-29 user): 질문형 다섯 문구(§5).

## 10. 다른 디자인 도구 조사

2026-10-29 조사(하위 에이전트, WebFetch·로그아웃 상태 live HTML·공식 문서). lovable.dev·claude.ai/design은 Cloudflare 확인 페이지, stitch.withgoogle.com은 빈 SPA라서 첫 화면을 확인하지 못했다. 로그인한 앱 화면은 다를 수 있다. 원본 HTML은 scratchpad에만 있고 커밋하지 않는다.

| 도구 | 확인한 사실 | 출처 |
|---|---|---|
| Bolt | 고정 H1 "What will you build today?", 가운데 입력창, 아래 Website/Slides/App/Prototype 토글 칩, "+" 버튼(컨텍스트 추가), Plan 토글, 빈 입력에서 비활성인 "Build now". 입력창 아래 에이전트 선택기(Standard/Max)는 프로젝트별로 기억. 배경 CSS에 파란 radial glow | https://bolt.new, https://support.bolt.new/building/agents.md |
| v0 | 고정 H1 "What do you want to create?", placeholder "Ask v0 to build…", 첨부·skill이 입력 안의 인라인 칩, 도구 줄 모델 버튼, 초안 localStorage 자동 저장, 아래 예시 칩 4개 + Refresh | https://v0.app, https://v0.app/docs/model-picker |
| Lovable | 가운데 입력창 "Ask Lovable to create…", Send 옆 Build/Chat/Plan 모드(마지막 값 기억), "+" 메뉴의 Attach·Design(디자인 시스템, 기본값 미리 선택·제거 가능), "@"가 "+"와 같은 목록(프로젝트 최대 10개), 작업 공간은 사이드바에서 선택, 로그아웃 상태에서도 프롬프트 유지 | https://docs.lovable.dev/introduction/dashboard-overview.md, …/features/design-systems.md, …/features/chats.md |
| Figma Make | "+ → Add context"로 한 프롬프트에 파일 10개까지, 이미지 크기 상한, Design library 스타일 컨텍스트, plan mode, 진행 중 프롬프트는 대기열 | https://help.figma.com/hc/en-us/articles/31304485164695, …/31304529835671 |
| Claude Design | claude.ai 메시지 창에서 "Output > Design"을 고르거나 Design 템플릿에서 시작. 조직 디자인 시스템이 자동 적용. 결과는 대화 옆 캔버스 | https://support.claude.com/en/articles/14604416 |
| Magic Patterns | 만들 때 디자인 시스템을 드롭다운으로 고르고 마지막 값을 미리 선택, 컴포넌트는 `@` | https://www.magicpatterns.com/docs/documentation/design-systems/overview.md |
| Subframe | 홈 입력창 없음. 편집기 오른쪽 에이전트 채팅, Enter 전송, 진행 중 대기열, Esc 중단, 모델 선택기 | https://docs.subframe.com/learn/ask-ai/prompt-to-design.md |
| Uizard | 입력창이 아니라 마법사, 프롬프트 300자 제한 | https://support.uizard.io/en/articles/7728147-guide-to-autodesigner |

반영한 점:
- 가운데 입력창 위 질문형 제목 하나(Bolt·v0·Figma Make), 그 뒤 배경의 accent glow(Bolt CSS의 radial glow와 같은 계열, doan은 Welcome 방식을 재사용).
- 첨부는 도구 줄의 "+" 버튼(Bolt·Lovable·Figma Make), 고른 컨텍스트는 입력 안의 칩(v0).
- 모델 선택기는 입력창 도구 줄(v0·Bolt·Subframe), 마지막 선택 기억(Bolt·Lovable·Magic Patterns).
- 빈 입력에서 Send 비활성(Bolt). 보내면 대화가 붙은 작업 화면으로 이동(조사한 모든 도구).
- placeholder는 v0·Lovable의 브랜드 + 동사 형식 대신 Antigravity처럼 단축을 알린다(§4.5, 2026-10-29 user 배치).
- 첨부 개수 상한 10개(Figma Make와 같은 값, 공급자 한도는 P2에서 확인).

doan이 다르게 가는 점:
- 무작위 인사 문구: 확인한 도구 중 바뀌는 제목을 쓰는 곳은 없다. 사용자 요청(2026-10-29)으로 넣되, §5 규칙(방문당 한 번, 애니메이션 없음)으로 제한한다.
- 프로젝트 선택기: 다른 도구는 보내면 새 프로젝트를 만들기 때문에 홈에 선택기가 없다. doan은 기존 저장소에서 일하므로 선택기가 필요하다. Lovable이 "@"로 기존 프로젝트를 붙이는 것이 가장 가까운 사례다.
- `/` 프리셋 단축: 확인한 홈 입력창 중 `/` 선택기를 쓰는 곳은 없다(가장 가까운 것은 "@"와 "+" 메뉴). 사용자 결정(2026-10-29)으로 넣는다.
- 예시 프롬프트 칩·템플릿·커뮤니티 갤러리는 넣지 않는다(상태 기반 제안 제외, 2026-10-29 user).
- 진행 중 프롬프트 대기열(Figma Make·Subframe), 초안 자동 저장(v0)은 이번에 넣지 않는다. 대기열은 buzz-conversation 범위이고, 초안은 실행 동안만 보관한다(spec 비목표).

## 11. 순수 함수 (`/tdd` 대상)

- `homeComposer.ts`: `suggestedPrompts`, `composeRequest`, `sendAvailability`, `defaultProject`, `defaultProvider`, `suggestedPresets`, `searchPresets`, `presetListView`(실패·이전 CLI·빈 결과), `startErrorView`, `pickGreeting`, `slashQuery`(맨 앞 `/` 판별), `isSubmitKey`(IME 포함)
- `homeComposer.ts`(첨부·모델): `attachmentLimit`(개수·크기·형식 판정), `attachmentChipView`, `modelPickerView`, `defaultModel`, `dropTarget`(입력창 위 파일/폴더 구분)
- `conversationStrip.ts`: `stripState`, `stripView`
- main `conversation/ipc.ts`: `newDesign` 요청 검증(subject 경로 유지, text 경로 추가), `model`·첨부 ID 검증
- main `conversation/prompt.ts`: 첨부 목록 직렬화(untrusted 경계)
- main `attachments.ts`: 경로 판정(절대·realpath·일반 파일), 붙여넣기 파일 이름, 한도 판정, 미전송 붙여넣기 정리 대상 선택
- main 공급자별 모델 목록 해석(`parseModels*`, PoC가 확인한 응답 형식 기준)

## 12. 형식·컨벤션·결정 영향

- **형식**: JSON Schema(ARCHITECTURE §11) 변경 없음. CLI envelope v1의 스키마는 `result` 모양을 제한하지 않는다. `doan design-skill --json` 목록 결과의 요약에 `group` 키가 더해진다(ARCHITECTURE §12 갱신, fixture 갱신). `conversation:start` IPC 요청에 `newDesign` 자유 텍스트·`model`·첨부 ID가 더해진다. 기기 로컬 형식 세 곳이 바뀔 수 있다: ui-state.json `home` 키(§8), 대화 index의 모델 필드(§4.7), 이벤트 `user.message`의 첨부 메타데이터(§4.8). 버전을 올릴지는 `/tdd`에서 각 판독기가 모르는 필드를 어떻게 다루는지 읽고 정하고, 올리면 PRODUCT §7에 단방향 이전 여부를 기록한다. 새 디렉터리 `<userData>/attachments/`(붙여넣기 파일만).
- **컨벤션**: ARCHITECTURE §1과 `doan check` 규칙 변경 없음.
- **결정**: 공통 결정 2(그라디언트는 Welcome만)에 홈 예외를 더한다. PRODUCT §5 항목 1(projects-home 홈 카드)·항목 0의 홈 체크리스트·배너 서술을 바꾼다. 프리셋 요청 문장 형식을 새로 정한다. 모두 PRODUCT §7에 기록한다. 직접 git·서버·자동 실행 결정은 건드리지 않는다. 대화는 사람이 보낼 때만 시작한다(Out of scope 4 유지).
- **PoC**: 두 개를 구현 전에 둔다. 결과는 날짜와 함께 PRODUCT §6에 기록한다. 대화·인증·프리셋 백엔드 자체는 PRODUCT §6에 실제 앱 확인 기록이 있고, 실제 토큰 만료·갱신이 관찰되지 않았다는 한계는 그대로다.
  - P1 모델·effort: 다섯 공급자 각각에서 모델 목록과 모델별 effort 단계를 얻는 방법·비용, 고른 모델·effort로 새 세션을 시작하는 방법, 같은 세션의 다음 턴이 그 값을 유지하는지. 목록이 없는 공급자는 'Default'만 보이는 것으로 확정한다.
  - P2 첨부: 다섯 공급자 각각이 요청에 적힌 저장소 밖 절대 경로의 이미지와 텍스트·PDF 파일을 읽고 이미지 내용을 볼 수 있는지, 기본 권한 설정에서 권한 요청이 생기는지, 거절되면 어떤 이벤트가 오는지.
- **후속(doan-design-skills)**: 프리셋 목록에 대상 필요 여부 필드를 더하는 일은 이번 범위가 아니다. 있으면 대상이 필요한 프리셋에만 §4.4의 placeholder를 쓸 수 있다. 지금은 공통 placeholder로 대신하고, Z1에서 PRODUCT §8 열린 질문으로 남긴다. 분류 `group`은 이번에 한다(§4.4a, 2026-10-29 user).
- **agent-eval**: CLI/MCP 목록 출력에 `group`이 더해지므로 AGENTS.md 규칙에 따라 `/agent-eval`을 돌린다(design-skill 시나리오). 가이드·스텁·본문은 바뀌지 않는다. 앱 대화 요청 문장이 새로 생기므로, 실제 공급자 하나로 '프리셋 칩을 고른 요청 → 에이전트가 그 프리셋을 읽음'을 `/runtime-test` probe에서 확인한다. 전체 `/agent-eval`은 요구하지 않는다.

## 13. 함정 (POSTMORTEM)

- **2026-10-25 static draft overflow**: 입력창의 높이 제한·팝오버 목록은 넘칠 만큼의 데이터와 실제 입력으로 스크롤 도달을 확인한다.
- **2026-10-25 Home card roving tabindex / 2026-10-27 Home return focus**: 홈 진입 포커스를 바꾸므로 `focusCurrent`·`completeNavigation`의 포커스 복귀 경로를 함께 확인한다(`rg -n 'focusCurrent|completeNavigation|restoreFocus' app/src/renderer/App.tsx`).
- **2026-10-24 모달 뒤 포커스**: 팝오버가 열린 채 다이얼로그가 뜨면 팝오버 뒤 요소에 포커스를 주지 않는다.
- **2026-10-25 action before read finishes**: 전송 직후 이동은 대상 root의 목록 읽기를 기다리고, 그 사이 사람이 다른 곳으로 이동했으면 따라가지 않는다(`rg -n 'kind !== "list"\) retur' app/src/renderer`).
- **2026-10-25 CSS JS import / cascade layer**: 새 CSS는 진입 스타일시트의 `@import`로 싣고, 대체한 projects-home 규칙은 지운다.

## 14. 초안 요청

- 캔버스: `.doan/canvases/buzz-home.html`, id `buzz-home`, 폭 2560.
- 1차(2026-10-29 user: 대표 프레임만 먼저 그려 느낌을 정한다): `home-empty`(추천 프롬프트 포함), `home-filled`, `home-presets`, `home-agent`, `home-effort`, `workspace-strip`.
- 2차: 1차가 확정되면 §3.1의 상태 목록을 상태별 프레임으로 넓힌다. `/design-sync`는 2차에 남은 프레임을 대조한다.
