# project-settings — design

부모 [buzz-restyle design](../buzz-restyle/design.md)의 디자인 언어와 진행 규칙을 따른다. 이 문서는 다이얼로그를 페이지로 바꾸는 데 필요한 세부만 적는다. 결정 날짜가 2026-11-03인 항목은 `/feature`와 `/feature-review`에서 사용자가 고른 것이다.

## 영향 범위

| 구성 요소 | 변화 |
|---|---|
| 페이지 컴포넌트 | `ProjectSettingsDialog.tsx` → `ProjectSettingsPage.tsx`. `SettingsPage.tsx`의 셸 구성(헤더, 사이드바, `home-panel settings-panel` 흰 본문, 48rem 열, 제목·섹션)을 재사용한다. 잠금은 SettingsPage의 `onState`처럼 App에 보고한다 |
| App (`App.tsx`) | `screen`에 `"projectSettings"`를 더하고 `projectSettings` 상태를 `modal`에서 뺀다. 새 화면을 알아야 하는 분기: `focusCurrent` 범위·선택자, `locked()`, `savedScreen`, `shellScreen`, `leavePage`, Escape 처리, 사이드바 `locked`와 `pageLocked`, 메뉴 상태 전송, TopBar back/forward/previous. 진입점은 `openProjectSettings(root, key)` 하나다 |
| 내비게이션 (`addProjectsNav.ts`, `shellNavigation.ts`) | `PageName`에 `"projectSettings"`를 더한다. `AddPageEvent`에 잠금을 통과하는 `{ kind: "gone" }`을 더한다. `shellNavigation`의 Projects 탭 처리도 새 페이지를 안다 |
| 사이드바 (`ShellSidebar.tsx`) | Add Projects나 이 페이지가 잠긴 동안 Project Settings 항목을 `aria-disabled`와 잠금 잉크로 보인다. `ShellSidebar.interaction.test.tsx`의 "잠금 중 Project Settings 허용" 기대값을 바꾼다. 이 페이지에서는 Home처럼 current 행이 없다 |
| 메뉴 (main `menuState.ts`) | main은 바꾸지 않는다. renderer가 이 페이지를 `screen: "settings"`로 보내고 잠금을 `locked`에 넣는다. Settings 페이지와 활성화 규칙(캔버스 메뉴·New Conversation 끔, Add Project…·Home 켬)이 같아서다. 빠뜨리면 페이지 뒤에서 ⌘N·Zoom·Reload Canvas가 켜진다 |
| 토스트 | `toast.setModal`이 `modal`뿐 아니라 이 페이지의 잠금에도 멈춘다. 페이지가 모달이 아니게 되면서 Share 확인이 열린 동안 Undo 토스트가 inert 상태로 8초를 흘려보내는 것을 막는다(POSTMORTEM 2026-10-25 'Native hiding bypassed renderer-only lifetime checks'와 같은 종류) |
| 복구 라벨과 문구 | Locate…/Set Up…의 말줄임표를 뺀다. 대상은 `Home.tsx`(상태줄)·`ShellSidebar.tsx`·`ProjectOverview.tsx`의 라벨 표, 상태줄 Remove → Remove from Doan, 캔버스 복구 문구(`App.tsx`, `CanvasController.ts`) → "Use Locate above." / "Use Set Up above.". main의 시트 제목은 `"Locate…"` → `"Locate"`, `"Add to Serve"` → `"Add File or Folder"`(`app/src/main/index.ts`)로 바꾼다. 옛 표기를 쓰는 주석도 함께 고친다 |
| Config bridge (main) | 동작 변화 없음. 세션은 다이얼로그 수명 대신 페이지 수명이다(마운트 시 `startConfigSession`, 언마운트 시 `endConfigSession`). 다른 워크트리로 바뀌면 새 key로 다시 마운트해 새 세션을 연다. 잠금 중에는 전환이 막히므로 진행 중인 choice나 쓰기를 버리지 않는다 |
| CLI | 코드 변화 없음. `cli/internal/cli/skill.md` 문구와 `skill_test.go`만 바뀐다 |
| 포맷 | 없음. comment events, `.doan/config.json`, CLI 응답, `runtime.json`, 앱 소켓 메시지가 그대로이고, ui-state는 `savedScreen`이 origin만 저장하므로 바뀌지 않는다 |

## 화면

시안 프레임이 정본이다(`/design-draft`로 2026-11-03 결정을 반영한 뒤). 구현이 시안에서 읽어야 할 것만 적는다.

- **헤더**: 썸네일(사이드바 `shell-thumbnail`과 같은 hue), 프로젝트 이름(제목 `h1`, 도착 시 포커스), 브랜치 칩, `displayPath`로 줄인 경로. 값이 보이는 정상 상태에서만 경로 뒤에 "· Stored in .doan/config.json in this worktree. Commit it so your team gets these settings."를 붙인다. Reading, Read failed, 문제 상태는 경로만 보인다. Show in Finder는 헤더 오른쪽에 두고, Missing과 Still reading에서만 숨긴다.
- **Token CSS**: 설명 "The stylesheet canvases link for tokens.". 값이 있으면 경로와 Change/Clear, 없으면 "No token CSS. doan check won’t flag hardcoded colors."와 Choose. Saving/Saved는 값 옆의 상태 텍스트이고, 쓰기 실패는 행 아래 인라인 오류다.
- **Shared with canvases**: 설명 "Files canvases in this worktree can read, besides .doan/canvases/, .doan/ds/, .doan/assets/ and the token CSS.". 경로마다 Remove(접근 이름 "Remove <path> from Shared with canvases")가 있고, 끝에 Add File or Folder가 있다. Saving/Saved는 Add File or Folder 옆에, 쓰기 실패는 목록 아래에 둔다. 확인은 `SettingsDialog`(alertdialog)로 띄운다. 제목은 "Share <path> with canvases?", 설명은 "Canvases in this worktree will be able to read <path>.", 버튼은 Cancel과 Share다. 데이터 키(`serve`, `addServe`)와 CLI 플래그는 그대로다.
- **읽기 실패**: "Couldn’t read this worktree’s settings." 아래에 main의 메시지를 한 줄 보이고 Retry를 둔다. 그 아래 Remove from Doan이 남는다.
- **쓰기 실패 안내**: 범위 밖 경로는 "Choose a CSS file inside <name>." 또는 "Choose a file or folder inside <name>."를 붙인다. `unavailable`(세션이나 epoch 변경)은 "This worktree changed. Choose again."이다. 지금의 "Try again on Home."은 Home에 복구 동작이 없어진 뒤 틀린 안내다.
- **문제 상태**: 기존 `PROBLEMS` 문구를 notice 한 개로 보이고 복구 버튼은 notice 안에 둔다. Config error의 Details는 notice 아래에 상세를 펼친다. Locate 거부 같은 복구 피드백은 notice 아래 인라인(`role="alert"`)이다.
- **Remove from Doan 섹션**: 설명 "Doan stops listing <name> and its worktrees. Files and Git worktrees stay on disk.", 버튼 Remove from Doan. Reading과 Still reading에는 없다. 제거는 사이드바 메뉴와 같이 그룹의 모든 등록 워크트리를 넘긴다. 경로는 기존 `remove(roots)` → `homeRun.remove`(실행 중 대화 확인) → `removeNow`를 그대로 탄다. 대화가 실행 중이면 그 확인이 페이지 위에 뜬다. Cancel하면 포커스가 Remove from Doan으로 돌아가고, 확인하면 지운 뒤 페이지를 떠난다.
- **사이드바**: current 행이 없고, 들어갈 때 펼침 상태를 바꾸지 않는다. 프로젝트 행은 Home에서처럼 그 프로젝트의 Overview를 연다. 이것은 페이지를 떠나는 길이므로 잠금 중에는 막힌다.

## 이동과 잠금

- **들어가기**: 사이드바 프로젝트 메뉴와 Overview 복구 메뉴의 Project Settings는 App의 `openProjectSettings(root, key)`로 들어온다. 홈이나 워크스페이스에서 들어오면 그 화면이 origin이다. 잠기지 않은 Add Projects 페이지에서 들어오면 origin을 유지한다(`pageEnter`). Add Projects가 잠겨 있으면 메뉴 항목은 잠금 잉크로 보이고 아무 일도 하지 않는다. 지금 다이얼로그가 그 잠금 중에도 열리던 예외는 없어진다. Settings 페이지의 사이드바에는 프로젝트 메뉴가 없어서 Settings에서 바로 들어오는 경로는 없다.
- **같은 페이지에서 다시 들어오기**: 잠금이 없을 때 다른 워크트리를 고르면 `pageEnter`를 거치지 않고 root를 바꾸고, 새 key로 다시 마운트하며, origin을 유지하고 `cancelPending`한다. 같은 워크트리를 다시 고르면 Settings의 ⌘,처럼 제목에 포커스한다. 잠금 중이면 둘 다 무시한다.
- **떠나기**: Projects 탭, Back, Escape는 `addPageReturn`으로 origin에 돌아가고, origin 프로젝트가 제거됐으면 Home으로 간다. Escape는 확인 다이얼로그가 열려 있으면 그 다이얼로그가 먼저 닫는다. Back/Forward 방문을 만들지 않고 실행 시 복원하지 않는다.
- **목록에서 사라짐**: 페이지의 워크트리가 목록에서 없어지면(Remove from Doan, 다른 곳의 제거) `followProjectSettings`가 `leave`를 돌려준다. App은 `gone` 이벤트로 `addPageReturn`을 부르고, 이 이벤트는 잠금을 통과한다. 열린 Share 확인은 취소로 닫는다. 진행 중인 선택기의 결과는 세션이 끝나 `unavailable`로 버려진다. Undo는 페이지를 다시 열지 않는다.
- **reroot**: Locate나 Set Up의 `rerooted`로 루트가 바뀌면 페이지는 새 루트를 보이고 다시 읽는다. App의 `projectSettings.root`와 origin(옛 루트의 워크스페이스였다면)도 새 루트로 바꾼다. 그러지 않으면 떠날 때 `roots.includes(origin.root)`가 거짓이 되어 Home으로 간다(POSTMORTEM 2026-10-25 'Locating a project kept the old root's selection'). Set Up의 reroot 토스트는 그대로 띄운다.
- **문제 상태로 바뀜**: Share 확인이나 선택기가 열린 동안 워크트리가 문제 상태가 되면 열린 확인은 취소로 닫고 포커스를 제목으로 옮긴다. 지금 다이얼로그는 루트가 바뀔 때만 `choice`를 지운다.
- **잠금**: 선택기 시트, Share 확인, 쓰기가 진행 중이면 `locked()`가 참이다. 잠금이 시작되면 `navigationIntent`를 올리고 `cancelWorkspaceOpen`한다(`settingsReport`와 같다). Add Projects 잠금과 같이 떠나는 길은 무시되고 잠금 잉크로 보인다. 헤더 탭, Back, Search, 사이드바 행, 메뉴의 Overview·워크트리·Project Settings 항목, Settings…가 여기에 든다. Show in Finder, Remove from Doan, 프로젝트 펼치기는 계속 쓸 수 있다. 잠금 중 들어온 Settings 대상(⌘,, 로그인 토스트)은 Add Projects처럼 버린다. 큐에 넣지 않는다. `doan://` 링크와 알림 클릭은 기존 페이지 잠금 규칙대로 링크는 버리고 창만 앞으로 가져온다.
- **Set Up**: Not set up 페이지의 Set Up은 페이지를 닫지 않고 `ProjectSetupDialog`를 페이지 위에 연다. 설정이 끝나 워크트리가 정상이 되면 페이지가 설정 화면으로 바뀌고 다시 읽는다.
- **창 숨김**: 페이지와 진행 중인 작업은 그대로 남는다.

## 포커스

- 도착하면 제목(`h1`)으로 간다. 같은 워크트리를 다시 골라도 제목으로 간다.
- 쓰기가 끝나면 누른 버튼으로 돌아간다. 그 버튼이 없으면 그 섹션의 주 버튼(Token CSS는 Change나 Choose, Shared는 Add File or Folder)으로 간다. 지금 다이얼로그의 `returnFocus` 규칙을 유지한다.
  - Clear 뒤에는 Choose로 간다.
  - 경로 Remove 뒤에는 다음 경로의 Remove로, 다음이 없으면 Add File or Folder로 간다.
- Share 확인을 Cancel이나 Share로 닫으면 Add File or Folder로 돌아간다.
- Locate·Retry가 성공하거나 바깥 상태가 바뀌어 포커스된 버튼이 사라지면 제목으로 간다. 지금 다이얼로그가 Done으로 보내던 대체 대상을 대신한다.
- Set Up 다이얼로그나 제거 확인이 닫히면 모달이 닫힌 뒤 `modalClosed` → `focusAfterModal` → `focusCurrent(beforeModal)` 경로로 돌아간다. 바깥 사유(터미널 `doan init`, 폴더 이동)로 닫혀도 같다.
- 페이지를 떠나면 origin의 포커스로 간다. 워크스페이스는 `workspaceFocus`, Home은 입력창이다.

## 순수 함수로 뺄 부분 (/tdd 대상)

1. `pageEnter` / `addPageReturn` (`addProjectsNav.ts`): `"projectSettings"` 페이지와 `gone` 이벤트를 더한다. 표 테스트로 고정한다.
   - 다른 페이지에서 들어오면 origin을 유지한다.
   - 잠금 중이면 `stay`다.
   - `gone`은 잠금 중에도 origin으로 간다.
   - origin 프로젝트가 사라졌으면 Home으로 간다.
2. 페이지 재진입 판정(신규, 예: `projectSettingsReentry`): 같은 root는 제목 포커스, 다른 root에 잠금이 없으면 전환하고 origin을 유지, 잠금이면 무시.
3. `followProjectSettings` (`projectSettingsRules.ts`): 사라진 워크트리는 `leave`, reroot(Locate·Set Up)는 새 루트와 다시 읽기, 상태 변화는 화면 전환과 열린 확인 취소. origin의 reroot 반영도 여기서 판정한다.
4. `projectSettingsPageView(entry, readState)` (신규): 상태별로 헤더의 경로·저장 안내·Show in Finder 노출, notice 문구, 복구 동작 목록, Remove 섹션 노출을 정한다. 시안의 상태 타일마다 표 테스트 한 줄이다(정상, Reading, Read failed, Missing, Not set up, Config error, CLI error, Still reading).
5. `projectSettingsLocked({picking, confirming, writing})`: 지금 `canCloseProjectSettings`의 반대다.
6. `writeErrorMessage(section, reply, name)`: 지금 컴포넌트 안의 정규식 안내와 `unavailable` 문구를 꺼낸다.
7. 쓰기 뒤 포커스 대상(신규, 예: `projectSettingsFocusAfter`): 누른 버튼의 생존 여부, 섹션, Clear, 경로 Remove의 다음 항목으로 대상을 정한다.
8. 복구 라벨 표와 캔버스 복구 문구: 말줄임표가 없고 서로 같은 라벨을 쓰는지 고정한다. 표를 하나로 합칠지는 구현 때 정한다. 합치지 않아도 된다.

## 포맷 변경

없다. JSON Schema 원본(ARCHITECTURE §11)과 `v`는 그대로다.

## 컨벤션 영향

ARCHITECTURE §1 'Conventions'와 `doan check` 규칙은 바뀌지 않는다. 가이드 7번 규칙의 승인 경로 안내만 바뀐다.

## 결정 영향

- 구조 결정(서비스 범위, sandbox iframe, append-only events, 토큰 처리 없음, git 작업 없음)을 건드리지 않는다. 서비스 경로 추가는 여전히 사람의 확인 뒤 `doan config --json`만 쓴다.
- 바뀌는 PRODUCT·ARCHITECTURE 결정은 다음과 같다(사용자 승인: 2026-11-02 부모 spec 표 13번, 2026-11-03 이동·잠금·Show in Finder·말줄임표·사이드바·reroot·Shared 상태·문구).
  - PRODUCT §5 항목 0 'Project Settings': 다이얼로그에서 페이지로 바뀐다.
  - 항목 0 'Settings page': 페이지 사이 origin을 유지하고, Settings…는 이 잠금 중에 비활성이다.
  - 항목 0의 2 `Set Up…`.
  - 항목 1 'Add Projects': 잠금 중 Project Settings가 비활성이다.
  - 항목 1 'Remove from Doan': 위치(페이지)와 그룹 범위가 바뀌고, 복구 라벨과 상태줄 Remove가 바뀐다.
  - 항목 8 `doan init`의 `Set Up…`.
  - ARCHITECTURE §7 'Settings IPC': 'Page and dialog', 'Config bridge'의 dialog session, 'Project Settings dialog'.

## 가이드 수정 (`skill.md`)

| 위치 | 지금 | 바꿀 내용 |
|---|---|---|
| 규칙 7 | `(Settings › Projects or doan config --add-serve <path>)` | 사람이 Doan의 프로젝트 메뉴 › Project Settings › Shared with canvases에서 추가하거나, 승인한 뒤 `doan config --add-serve <path>` |
| Commands 서두 (65행) | All commands accept `--repo` | `onboarding`을 뺀 모든 명령 |
| onboarding status | Each agent has … | `agents`는 `{revision, providers}`이고 `providers`의 각 항목이 `provider`, `phase`, `readiness`, `actions`, `error`를 가진다 |
| `doan init` | `.doan/canvases/`와 `.doan/config.json` | `.gitattributes`에 두 줄(`merge=union`, `linguist-documentation`)을 더한다는 사실 |
| Onboarding 서두 | Doan creates the CLI link when first opened | `/Applications`나 `~/Applications`에서 연 Doan이 링크를 만든다 |

문구는 clarify preset 기준(같은 개념에 같은 이름: 화면 이름 "Project Settings", 섹션 이름 "Shared with canvases")으로 쓴다. 섹션 이름은 가이드, `skill_test.go`, eval이 고정하므로 여기서 확정한다. 가이드가 바뀌므로 `/agent-eval`을 돌린다(AGENTS.md 'Workflow').

## PoC 의존

없다. 페이지 셸, 잠금, origin, config bridge 모두 이미 출하된 경로를 재사용한다.

## POSTMORTEM 인용

- **2026-10-30 'Removing a shared dialog class silently disabled two focus guards'**: Share 확인은 클래스가 아니라 `dialog[role="alertdialog"]`로 찾는다. 확인이 열린 채 쓰기가 끝나는 테스트를 유지한다.
- **2026-10-25 'A forwarded Settings target discarded a pending setup confirmation'**: 페이지가 확인이나 쓰기를 쥐고 있으면 다른 워크트리의 Project Settings, Settings 대상, 탭 이동 모두 잠금에 막혀야 한다. 로컬 클릭뿐 아니라 바깥에서 들어오는 진입점도 테스트한다.
- **2026-10-24 'Focus did not return to the row when Set Up… closed from outside'**: Set Up 다이얼로그가 페이지 위에 열린다. 바깥 사유로 닫힐 때는 모달이 닫힌 뒤 포커스를 옮긴다. 경로는 `modalClosed` → `focusAfterModal` → `focusCurrent`다.
- **2026-10-25 'Native hiding bypassed renderer-only lifetime checks'**: 페이지 잠금이 Undo 토스트도 멈춰야 한다.
- **2026-10-25 'Locating a project kept the old root's selection'**: reroot 뒤 App의 root와 origin도 새 루트로 바꾼다.
- **2026-10-27 'Shell navigation shortcuts lost destination ownership and recovery access'**(`pageEnter` 주석): 들어갈 때 대기 중인 복원과 워크스페이스 열기를 취소한다.
- **2026-11-02 'The loaded project's row did nothing on a canvas, though PRODUCT said it opened the Overview'**: 탐색 분기가 도는 모든 화면을 테스트로 고정한다. 새 화면은 Projects 탭, 사이드바 행, Back, Escape를 각각 테스트한다.

## 참고한 preset

`shape`(기존 표면 확장: 시각 체계 고정, 목적·상태·이동만 정함), `clarify`(같은 개념에 같은 이름, 파괴 동작은 대상과 결과를 밝히고 확인 대신 Undo).
