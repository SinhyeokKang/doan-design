# UX 감사 보고서 (ux-audit-261117-2)

- 실행일: 2026-11-17 (같은 날 앞선 `ux-audit-261117`과 별개 실행)
- 검토 기준: develop `f64ed332`, 워크트리 clean
- 완료 상태: **소스 검토 완료, 런타임 미관찰**. 네 관점(문구, 동작·복구, 상태 전이, 표현)이 인벤토리의 모든 화면을 검토했거나 사유를 적고 N/A로 두었다. 앱을 실행하지 않았으므로 화면 표시, 포커스 이동, hover 색에 관한 주장은 모두 미검증이다.
- 리뷰어 원본: `.scratch/ux-audit/261117/{wording,actions,states,presentation}.md` (커밋되지 않음)
- 사용한 프리셋: clarify, critique, harden, onboard, audit (`doan design-skill`, CLI 0.1.15). doan MCP 서버는 연결되지 않았지만 CLI로 읽었다.

## 확인하지 못한 것

- 런타임 관찰은 없다. 특히 아래 항목은 소스만 근거로 삼았다.
  - F1: Retry를 누른 뒤 포커스가 body로 떨어지는지
  - F7: 비활성 버튼에 hover했을 때 채움색이 바뀌는지
  - F2: 프로토타입 창이 빈 채로 남는지
- UpdateHeaderButton과 AgentUsageButton의 동작은 grep으로만 확인했다.
- postmortem 2026-11.md:175-181(클론 취소 분기)은 코드만 확인했고, 앱에서 다시 실행해 보지 않았다.
- 리드가 소스를 직접 다시 확인한 것은 F1(SettingsAbout·SettingsNotifications), F2, F3, F5, F7, F9(앱 메뉴), F10(ReplaceDraftDialog), D1(Move to Trash), D5(Check for Updates)다. 나머지는 리뷰어가 양쪽 file:line을 제시했지만 리드가 다시 확인하지 않았다.

## 발견 (심각도 순)

### 복구 경로가 깨짐

**F1. 설정·스레드의 Retry가 누르자마자 사라져 포커스를 잃는다** (확정 불일치, 동작·상태 관점)
- 해당 위치:
  - `SettingsAbout.tsx:202-203`: `load(true)`가 `:107`에서 `setFailed(false)`를 호출한다.
  - `SettingsAgents.tsx:196-198,262-263,285`
  - `SettingsNotifications.tsx:41,47`: `retry`가 저장 응답 전에 `setFailed(null)`을 호출한다.
  - `ConversationThread.tsx:834-838`
  - Home·도킹 입력창의 Retry: `HomeComposerView.tsx:604`, `DockedComposer.tsx:536`
  - 버디 저장 Retry: `SettingsGeneral.tsx:84-92`, `Onboarding.tsx:725`
- 대조: `ListRetryButton.tsx:10-20`과 `ProjectSettingsPage.tsx:383-385`, `ProblemOverlay.tsx:37-42`는 Retry를 마운트한 채 aria-busy와 스피너를 보여 주고 포커스를 지킨다.
- 규칙: DESIGN.md:71 'Busy action', postmortem 2026-10 'UX S'(Retry가 사라지며 포커스를 잃은 사례).
- 영향: 키보드나 VoiceOver 사용자는 Retry 직후 위치를 잃는다. 재시도가 다시 실패하면 같은 안내가 다시 나타나지만, 그 사이 포커스는 body에 있다(미검증).
- 최소 수정: 설정 저장 Retry를 `ListRetryButton`과 같은 busy 모델로 바꾼다. 여러 곳에 반복되므로 공유 helper 하나로 묶는다.

**F2. 프로토타입 창의 첫 읽기가 실패하면 빈 창으로 남는다** (확정 불일치, 상태 관점)
- `prototype/PrototypeWindow.tsx:119`: `api.read()`의 거부를 `() => {}`로 무시한다. `view`가 null로 남아 장면이 그려지지 않고, Reload·모드·Export가 비활성으로 남는다(`:500-515`).
- 대조: 캔버스 로드 실패는 오류를 보여 준다(`App.tsx:2605`). 스레드 읽기 실패는 안내와 Retry를 보여 준다(`ConversationThread.tsx:834-836`).
- 영향: 원인도 다음 동작도 없는 빈 창이다. 이후 `onChanged` 알림이 와야만 회복된다.
- 최소 수정: 읽기 실패 상태를 두고, 메인 창의 오류 안내와 Retry를 쓴다.

### 상태를 오해하게 함

**F3. CLI 미설치 상태가 Home 선택 목록과 New conversations에서 "Not available right now"로 뭉개진다** (확정 불일치, 문구 관점)
- Settings Agents 행은 `cli_missing`을 "Not installed"와 Install로 보여 준다(`agentAuthView.ts:82`).
- `providerShortStatus`(`agentAuthView.ts:198-207`)에는 미설치 분기가 없어 기본값으로 떨어진다.
- `SettingsAgents.tsx:166-172`의 `unavailable()`은 주석에서 "picker와 같은 원인"이라고 하지만 따로 구현되어 있다. 이 함수에서도 미설치는 "isn’t available right now"가 된다.
- 원인은 전송이 거부될 때에야 "isn’t installed on this Mac"으로 드러난다(`homeComposer.ts:142`).
- `reauth_required`인데 phase가 `reauthRequired`가 아니면 picker에서도 "Not available right now"가 된다.
- 최소 수정: 원인 문구를 `providerShortStatus` 한 곳에서 만들고 "Not installed" 분기를 추가한다. `unavailable()`도 이 결과를 쓴다.

**F4. 휴지통 확인 창에서 plan을 읽는 동안 Move to Trash가 이유 없이 비활성이다** (확정 불일치, 상태 관점)
- `CanvasTrashDialog.tsx:10-17`, `App.tsx:1421-1430`: aria-disabled만 있고, 이유 줄도 스피너도 aria-busy도 없다.
- 대조: `ConversationDeleteDialog.tsx:31,66-67`은 항상 이유나 busy 상태를 보여 준다.
- 규칙: DESIGN.md:70 'Unavailable but focusable'.

**F5. 알림 스위치 저장에 늦은 결과를 막는 장치가 없다** (확정 불일치, 상태 관점)
- `SettingsNotifications.tsx:36-40`: 요청 번호가 없다. 빠르게 두 번 토글하면, 먼저 보낸 저장의 실패가 나중에 도착해 다른 스위치 아래에 실패 안내를 띄울 수 있다(미검증).
- 대조: `SettingsAbout.tsx:105-110`과 `Onboarding.tsx:248-249`는 요청 번호로 늦은 응답을 버린다. 이것이 postmortem 2026-10의 요구다.

**F6. 목록 읽기 실패의 오류 표현이 네 가지다** (확정 불일치, 표현 관점)
- 같은 `LIST_FAILED_TEXT` + Retry인데 화면마다 표현이 다르다.
  - Overview 첫 읽기 실패: `doan-notice error` + 아이콘(project.md:31). 이것만 규칙을 따른다.
  - 오른쪽 패널 `.rp-error`(`CanvasConversationList.tsx:108`, `styles.css:1451`): 아이콘 없음, text-subtle.
  - 대화 메뉴 `.conv-error`(`ProjectOverview.tsx:397`, `CanvasConversationPanel.tsx:200`, `styles.css:1395`): 아이콘 없음, text-subtle.
  - 사이드바 `.shell-canvas-error`(`styles.css:639`): 아이콘 없음, metadata 색. canvas.md:234에 측정값은 있지만 예외로 등록되어 있지는 않다.
- 규칙: DESIGN.md:111-114(모든 오류에 CircleAlert 아이콘).
- 결정 필요: 좁은 목록용 오류 형태를 DESIGN에 예외로 추가할지, 코드를 규칙에 맞출지.

**F7. aria-disabled 버튼이 hover와 press 때 채움색을 바꾼다** (확정 불일치, 표현 관점)
- `ds/controls.css:97-100,112-113`: prominent·subtle·panel의 hover/press 규칙은 `:not(:disabled)`만 제외한다. `[data-disabled]`를 제외하는 것은 accent(`:106,:119`)뿐이다.
- 비활성 규칙(`:121`)의 우선순위가 이보다 낮아서, `data-disabled` 버튼에 hover하면 hover 색이 이긴다(시각 미검증).
- 영향받는 곳: `CanvasTrashDialog.tsx:30`, `ConversationDeleteDialog.tsx:65-66`, `ProjectSetupDialog.tsx:105-106`.
- 이미 화면별 패치로 같은 문제를 막는 곳이 있다: `styles.css:442`(toast), `:637-638`, `:1342`. 공유 결정이 흩어져 있다는 신호다.
- 최소 수정: ds/controls.css의 hover/press 규칙에서 `[data-disabled]`도 제외한다. 화면별 패치는 그 뒤에 제거한다.

**F8. 프로젝트 문제 상태의 문구가 화면마다 다르다** (확정 불일치, 문구 관점)
- 찾을 수 없음(notFound)의 문구:
  - "<name> is missing / was moved or deleted": `problemView.ts:45`
  - "Doan can’t find this folder": `projectSettingsRules.ts:71`
  - "This folder is no longer available.": `Onboarding.tsx:304`
- 같은 '사용할 수 없음' 한 줄 안내:
  - "<project> isn’t available. Fix it from its menu in the sidebar.": `homeComposer.ts:138`
  - "Project is unavailable. … then try again.": `quickOpen.ts:361`, 프로젝트 이름 없음
  - main의 기본 대화상자 "Can’t open project": `main/index.ts:778`
- 읽는 중 문구도 세 가지다.
  - "<project> is still being read.": `homeComposer.ts:89`
  - "Project is still being read. Try again shortly.": `App.tsx:190`, `quickOpen.ts:360`
  - "Reading <name>": `problemView.ts:32,86`
- Home composer가 원인을 하나로 묶는 것은 PRODUCT §5에 정해진 의도된 차이다. 하지만 toast는 프로젝트 이름까지 빠진다.
- 최소 수정: `homeComposer.unavailableProject`와 `quickOpen.unavailableCanvasMessage`를 한 곳에서 만든다.

**F9. 같은 의미에 다른 용어** (확정 불일치, 문구 관점, 경미)
- 로그인 만료: "connection expired"(`agentAuthView.ts:93`)와 "sign-in expired"(`agentAuthView.ts:204`, `mcpConnectorsView.ts:69`, `SettingsAgents.tsx:168`)가 섞여 있다.
- 재확인 동작: "Retry"(`agentAuthView.ts:84-85,112`)와 "Check again"(`:95,136`)이 섞여 있다. Onboarding Project 단계는 본문이 "then retry"인데 버튼은 "Check again"이다(`Onboarding.tsx:314,318`).
- Add Projects 페이지: 앱 메뉴는 "Add Project…"(`main/index.ts:514`), 헤더와 PRODUCT는 "Add Projects"(`App.tsx:2557`, PRODUCT.md:62,139)다.

### 접근성·표현 (경미)

**F10. 초안 교체 확인 창이 alertdialog가 아니다** (확정 불일치)
- `ReplaceDraftDialog.tsx:6`, `HomeComposerView.tsx:611`: `aria-label`만 있고 `role="alertdialog"`와 `aria-describedby`가 없다.
- 다른 확인 창은 모두 이 role을 쓴다: `CanvasTrashDialog.tsx:24`, `ConversationDeleteDialog.tsx:56`, `SettingsDialog.tsx:19`, `SettingsMcpConnectors.tsx:262`.
- 규칙: docs/design/canvas.md:237, canvas-conversation.md:109.
- postmortem 2026-10-30의 포커스 가드가 이 role로 확인 창을 찾는다면 두 창을 놓친다. 이 영향은 리드가 확인하지 않았다.

**F11. Retry의 보조기술용 이름이 세 방식으로 갈린다** (확정 불일치)
- `SettingsAbout.tsx:194`: 화면 라벨은 "Retry"인데 이름은 "Save the automatic-check choice again"이다. DESIGN.md:75(이름은 화면 라벨로 시작한다)를 어긴다.
- 다른 곳은 수식어가 없거나(`SettingsAbout.tsx:157,203` 등), `aria-describedby`를 쓴다(`BuddyPicker.tsx:166`).

**F12. 남은 옛 스타일과 토큰 밖 값** (확정, 경미)
- `ProjectSetupDialog.tsx:65,105,106`의 `btn`/`btn primary` 클래스에는 대응하는 CSS 규칙이 없다. 다른 다이얼로그는 `doan-button`만 쓴다.
- `styles.css:49,53`의 옛 `.row`/`.err` 기본 규칙은 다른 규칙이 덮어써서 쓰이지 않는다.
- `RightPanel`과 `Inspector` 컴포넌트(`RightPanel.tsx:12,48`)는 어디서도 import되지 않는 죽은 코드다. 앱이 쓰는 것은 `CanvasConversations`뿐이다. 이 컴포넌트들의 CSS(`styles.css:134-157`)도 함께 남아 있다. PRODUCT §5 항목 4는 캔버스 페이지에 Inspector를 보이지 않는다고 정한다. 그래서 글자 크기를 맞출 대상이 아니라 지울 대상이다. 선택값 수집은 PRODUCT에 따라 그대로 둔다.

## 결정이 필요한 것 (미정 제품 판단)

- **D1. 파괴적 확인 창이 닫히는 시점.**
  - 바로 닫힘: Move to Trash(`App.tsx:1435-1445`), MCP Remove(`SettingsMcpConnectors.tsx:145-148`). 결과는 toast로 알린다.
  - 응답이 올 때까지 busy로 열려 있음: 대화 삭제(`App.tsx:1466-1470`), 버디 전환(PRODUCT.md:142), MCP Add.
  - PRODUCT.md:214에도 DESIGN에도 이 기준이 없다.
  - 권고: 실패할 수 있는 확인은 열어 둔 채 busy로 두는 쪽으로 통일한다. 실패를 같은 자리에서 복구할 수 있기 때문이다.
- **D2. 캔버스 로드 실패에 앱 안 Retry가 없다** (`App.tsx:2605`, "Run doan check"만 안내). 목록 읽기 실패와 설정 읽기 실패에는 Retry가 있다.
- **D3. StorageChoice 라디오는 클론 중에 native `disabled`를 쓴다** (`StorageChoice.tsx:21,34`). 그래서 포커스를 잃는다. ProjectSetupDialog는 이 이유로 aria-disabled를 쓴다(`:104-106`). DESIGN.md:70은 어느 쪽인지 정하지 않는다.
- **D4. 이름 인용 방식.** 대화 삭제는 이름을 60자에서 자른다(`conversationDelete.ts:18-24`). 캔버스 휴지통은 전체 이름을 줄바꿈한다(`canvasRowMenu.ts:13`).
- **D5. 문서에 없는 의도된 차이.**
  - 첫 실행의 클론 취소 안내는 Retry를 두고, Add Projects 페이지는 두지 않는다. 근거는 코드 주석(`Onboarding.tsx:342-346`)뿐이다.
  - Onboarding은 연결된 에이전트를 비활성 버튼 "Connected"로 보여 준다(`agentAuthView.ts:79`). 문서 근거가 없다.
  - 업데이트를 받을 수 없는 빌드의 메뉴 "Check for Updates…"는 About만 연다(`main/update/view.ts:167`).

## 일관성이 확인된 것

- 에이전트 로그인·설치·업데이트·로그아웃: 첫 실행과 설정이 `AgentStepSession`·`agentAuthView`를 함께 쓴다(`Onboarding.tsx:787`, `SettingsAgents.tsx:53`). Sign out이 설정에만 있는 것은 PRODUCT.md:130,146과 맞는다.
- 삭제 용어: Delete(대화), Move to Trash(캔버스), Remove from Doan(프로젝트)은 효과가 달라서 이름이 다르다. PRODUCT §5와 맞는다.
- 파괴적 확인 버튼 배치: prominent 확인 버튼과 autofocus된 subtle Cancel.
- 늦은 응답 가드: trash plan seq, About 읽기 카운터, Agents·Onboarding·MCP의 watch ref, ProjectSetupDialog의 `live`.
- 포커스 복귀: `beforeModal`, QuickOpen의 opener, 프로토타입 창의 패널·export·삭제 경로.
- Toast: 슬롯이 하나라 쌓이지 않고, Retry는 그 자리에서 실행되며 포커스를 지킨다. 유형 색 없이 중립이다.
- 포커스 링은 모두 2px border-focus다. 포커스 표시를 대체 없이 지운 컨트롤은 없다.
- 긴 이름(캔버스 헤더, 프로토타입 이름, 프로젝트 경로)의 잘림이 일관된다.
- 색 띠나 두꺼운 왼쪽 줄은 없다.
- 프로토타입 창의 Retry/Close/Details와 목록 오류는 메인 창과 같다.

## 공유 소스 권고 (구체적 불일치가 있는 것만)

1. 설정 저장용 Retry helper 하나를 `ListRetryButton` 모델로 만든다. F1, F11이 해당한다.
2. 에이전트를 쓸 수 없는 원인 문구를 `providerShortStatus` 한 곳에서 만든다. F3, F9가 해당한다.
3. 프로젝트 문제 한 줄 문구를 한 곳에서 만든다. F8이 해당한다.
4. ds/controls.css의 비활성 hover/press 제외를 고친다. F7이 해당한다.

## 커버리지

`소스` = 소스 검토, `런타임` = 런타임 관찰. 런타임 관찰은 모든 칸에서 하지 않았다.

| 화면 / 상태 | 문구 | 동작·복구 | 상태 전이 | 표현 | 런타임 |
|---|---|---|---|---|---|
| Onboarding (Welcome·Buddy·Agent·Project·버디 화면·StorageChoice) | 소스 | 소스 | 소스 | 소스 | 미관찰 |
| Shell 사이드바 (메뉴, Update, AgentUsage, StarPrompt, Toast, HomeCredit) | 소스 | 소스 (Update·AgentUsage는 grep만) | 소스 (HomeCredit N/A: 비동기 상태 없음) | 소스 | 미관찰 |
| Home (Home, Composer, Docked, Doany, BubbleAdd) | 소스 | 소스 (Doany N/A) | 소스 | 소스 (Doany 모션 N/A: 골든 테스트) | 미관찰 |
| Add projects (AddProjectsPage, ProjectSetupDialog) | 소스 | 소스 | 소스 | 소스 | 미관찰 |
| Project overview·settings | 소스 | 소스 | 소스 | 소스 | 미관찰 |
| Canvas (Header, Tools, Agent, Trash, ReplaceDraft, ProblemOverlay, NameTip, QuickOpen) | 소스 | 소스 (NameTip N/A) | 소스 (CanvasAgent N/A) | 소스 (CanvasAgent glow N/A) | 미관찰 |
| Conversation (RightPanel, 패널·목록, Thread·Line·Strip, Composer, 링, Delete, ErrorDetails, codeChips) | 소스 | 소스 (링·codeChips N/A) | 소스 | 소스 | 미관찰 |
| Settings (General, Agents, MCP, Notifications, About) | 소스 | 소스 | 소스 | 소스 | 미관찰 |
| Prototype 창 (Window, Conversation, Playing, ClosedFocus) | 소스 | 소스 | 소스 | 소스 | 미관찰 |
| main 프로세스 문자열·기본 대화상자 | 소스 (기본 대화상자 1곳은 리드가 확인) | N/A (renderer 밖) | N/A | N/A | 미관찰 |
| AlertIcon, tooltip | N/A (문구 없음) | N/A (동작 없음) | tooltip Esc는 사용처에서 확인 | 소스 | 미관찰 |

## 구현 배치

배치 하나는 컨덕터 하나가 `/ship`으로 맡는다. 리드가 컨덕터를 띄울 때 주는 브리프에는 다음을 적는다.
- 배치 번호와 이 절의 작업 목록
- 근거가 되는 발견 절
- 그 배치의 캔버스
- 파일이 겹치는 컨덕터

화면이 바뀌는 배치는 배치별 캔버스에 as is / to be로 그렸다. 컨덕터는 캔버스를 to be의 기준으로 쓰고, `/runtime-test`로 결과를 확인할 때 대조한다. 캔버스 노트에는 근거 줄 번호, 바꿀 속성, 테스트할 상태가 있다. to be는 아직 코드에 없다. "Proposed copy"로 표시된 문구는 컨덕터가 다듬을 수 있다.

| 배치 | 브랜치 | 항목 | 캔버스 |
|---|---|---|---|
| B1 Retry·확인 창 처리 중 | `fix/ux-retry-busy` | F1, F4, F11, D1 | `ux-audit-261117-2-b1` |
| B2 문구 통일 | `fix/ux-wording-sources` | F3, F8, F9 | 없음 (문구만 바뀐다) |
| B3 오류 표시·버튼 상태 | `fix/ux-error-presentation` | F6, F7, F12 | `ux-audit-261117-2-b3` |
| B4 늦은 결과·빈 창 | `fix/ux-late-state` | F2, F5, F10, D2, D3 | `ux-audit-261117-2-b4` |

**순서와 겹침**
- B1과 B2는 둘 다 `SettingsAgents.tsx`를 고친다. 그래서 B1을 머지한 뒤 B2를 시작한다.
- B3와 B4는 B1과 동시에 돌려도 된다. B3는 `ds/controls.css`와 `styles.css`를 고치고, B4는 프로토타입 창, 알림 설정, 초안 교체 확인 창을 고친다.
- B3의 F7(비활성 hover)을 고치면 B1의 처리 중 버튼 모습에도 영향이 간다. 그래서 B3를 나중에 머지하는 쪽이 B1의 캔버스와 다시 대조한다.

**결정 대기**
- B1의 D1(파괴적 확인 창은 응답이 올 때까지 열어 둔다)은 리드가 권고한 것이고, 아직 확정되지 않았다. B1을 시작하기 전에 사용자가 확정해야 한다.
- B3의 F6(좁은 목록의 오류 형태)은 캔버스를 보고 사용자가 정한다.

**모든 배치 공통**
- 끝나면 `/verify`를 돌린다.
- 런타임 미확인 항목은 그 배치의 `/runtime-test`로 확인한다.
- 바뀐 규칙은 PRODUCT, DESIGN, `docs/design/*.md`에 지금 규칙으로 적는다.
- 버그 수정은 `/postmortem` 대상인지 판단한다.

### B1 Retry·확인 창 처리 중
1. F1: 설정 저장 Retry를 누르면, 응답이 올 때까지 안내와 버튼을 그대로 둔다. 버튼은 aria-busy와 스피너를 보여 준다. 이 처리는 `ListRetryButton` 모델의 helper 하나로 만든다.
   - 대상: `SettingsAbout.tsx`, `SettingsAgents.tsx`, `SettingsNotifications.tsx`, `SettingsGeneral.tsx`, `Onboarding.tsx:725`, `ConversationThread.tsx:834-838`, `HomeComposerView.tsx:604`, `DockedComposer.tsx:536`
2. F11: Retry의 보조기술용 이름은 "Retry"로 시작한다. 무엇을 다시 하는지는 `aria-describedby`로 연결한다.
3. F4: 휴지통 plan을 읽는 동안 Move to Trash는 busy 상태를 보여 준다. 읽지 못하면 그 이유 줄을 보여 준다.
4. D1: Move to Trash와 MCP Remove는 응답이 올 때까지 열린 채 busy로 남는다. 실패하면 창 안에 안내와 다시 시도를 보여 준다.

### B2 문구 통일
1. F3: `providerShortStatus`에 미설치("Not installed") 분기를 넣는다. `SettingsAgents.unavailable()`은 이 함수의 결과를 쓴다.
2. F8: 프로젝트 문제 한 줄 문구를 한 곳에서 만들고, 문구에 프로젝트 이름을 넣는다. 대상은 `homeComposer.ts`, `quickOpen.ts`, `App.tsx:190`이다.
3. F9: 로그인 만료는 "sign-in expired"로, 재확인 동작은 한 라벨로, 앱 메뉴는 "Add Projects…"로 맞춘다.

### B3 오류 표시·버튼 상태
1. F7: `ds/controls.css`의 hover/press 규칙에서 `[data-disabled]`도 제외한다. 화면별 패치(`styles.css:442,637-638,1342`)는 제거한다.
2. F6: 목록 읽기 실패에 AlertIcon과 danger 문구를 쓴다. 대상은 `.rp-error`, `.conv-error`, `.shell-canvas-error`다.
3. F12: `btn` 클래스와 쓰이지 않는 `.row`·`.err` 규칙을 지운다. 화면은 바뀌지 않는다. Inspector 제거는 전용 브랜치 `refactor/remove-inspector`가 맡는다(아래 결정).

### B4 늦은 결과·빈 창
1. F2: 프로토타입 창의 첫 읽기 실패에 오류 안내와 Retry를 보여 준다. 메인 창의 오류 안내 패턴을 쓴다.
2. F5: 알림 스위치 저장에 요청 번호를 넣는다.
3. F10: 초안 교체 확인 창에 `role="alertdialog"`와 `aria-describedby`를 붙인다.
4. D2: 캔버스 로드 실패(`App.tsx:2605`)에 Retry를 둔다.
5. D3: StorageChoice 라디오를 aria-disabled로 바꾼다(`StorageChoice.tsx:21,34`).

## 사용자 결정 (2026-11-17)

사용자는 "가능한 표준에 맞추고, 그 외에는 다 괜찮다"고 답했다. 이 답에 따라 각 항목을 다음과 같이 정했다.
- **D1:** 파괴적 확인 창은 대화 삭제처럼 응답이 올 때까지 열린 채 busy로 남는다. Move to Trash와 MCP Remove도 같다. 실패하면 창 안에 안내를 보여 주고 확인 버튼으로 다시 시도한다(B1).
- **F6:** 좁은 목록의 읽기 실패도 DESIGN.md:111-114 표준(AlertIcon + danger 문구)을 따른다. 행 밀도는 유지한다(B3).
- **D2:** 캔버스 로드 실패에도 목록·설정 읽기 실패처럼 앱 안 Retry를 둔다. "Run doan check" 안내는 그대로 둔다(B4).
- **D3:** StorageChoice 라디오는 ProjectSetupDialog처럼 aria-disabled를 써서 포커스를 지킨다(B4).
- **D4:** 이름 인용 방식은 지금대로 둔다. 바꿀 표준이 없다.
- **D5:** 문서에 없던 의도된 차이 세 가지를 지금 동작대로 PRODUCT·DESIGN에 적는다. 각 배치의 문서 승격 단계에서 해당 화면을 고치는 배치가 맡는다.
  - 첫 실행의 클론 취소 Retry
  - Onboarding의 Connected 버튼
  - 업데이트를 받을 수 없는 빌드의 Check for Updates 메뉴
- 캔버스의 제안 문구는 확정했다. 컨덕터가 다듬을 때도 뜻은 유지한다.
- **Inspector 전체 제거:** 사용자가 Inspector를 통째로 지우기로 했다. 다시 넣을 때는 그때의 앱에 맞춰 새로 만든다. 지울 대상은 다음과 같다.
  - UI(`RightPanel`·`Inspector`)와 그 CSS
  - 선택 시 값을 모으는 경로(CDP collector `main/inspector.ts`, `inspect` API)
  - PRODUCT §5-4와 ARCHITECTURE 'Selection and inspector'의 해당 문구, BACKLOG의 Inspector 위치 항목

  선택 자체와 `doan active`는 남긴다. 전용 브랜치 `refactor/remove-inspector`에서 진행한다.
