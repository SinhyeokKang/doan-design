# project-settings — design

부모 [buzz-restyle design](../buzz-restyle/design.md)의 디자인 언어와 진행 규칙을 따른다. 이 문서는 다이얼로그를 페이지로 바꾸는 데 필요한 세부만 적는다.

## 영향 범위

| 구성 요소 | 변화 |
|---|---|
| App renderer | `ProjectSettingsDialog.tsx` → `ProjectSettingsPage.tsx`. `SettingsPage.tsx`의 셸 구성(헤더, 사이드바, `home-panel settings-panel` 흰 본문, 48rem 열, 제목·섹션)을 재사용한다. `App.tsx`의 `screen`에 `"projectSettings"`를 더하고, `projectSettings` 상태를 모달 판정(`modal`)에서 뺀다. 헤더 탭은 Projects를 현재 탭으로, 사이드바는 프로젝트 트리를 보인다 |
| 내비게이션 | `addProjectsNav.ts`의 `PageName`에 `"projectSettings"`를 더한다. `pageEnter`·`addPageReturn`·`locked()`·저장 화면(`savedScreen`)·포커스 범위 선택자(`currentScreen` 분기)가 새 페이지를 안다 |
| 규칙 | `projectSettingsRules.ts`: `close` → `leave`, `problemActionCloses` 삭제(Set Up이 페이지 위에 열림), `closedFocus` 삭제(떠날 때 포커스는 다른 페이지와 같은 origin 복원), `canCloseProjectSettings` → 페이지 잠금 판정 |
| 복구 라벨 | Locate…/Set Up…의 말줄임표를 앱 전체에서 뺀다(2026-11-03 user): 워크스페이스 상태줄(`Home.tsx`의 `labels`), 사이드바 메뉴(`ShellSidebar.tsx`), Overview 복구 메뉴(`ProjectOverview.tsx`), 페이지. 캔버스 복구 문구(`App.tsx`, `CanvasController.ts`)는 "Use Locate to find it.", "Use Set Up to set it up."으로 바꾼다. 지금 문구의 "on Home"은 Home에 Set Up이 없어진 뒤 틀린 안내다 |
| Config bridge (main) | 동작 변화 없음. 세션은 다이얼로그 수명 대신 페이지 수명이다(마운트 시 `startConfigSession`, 언마운트 시 `endConfigSession`). 다른 워크트리의 페이지로 바뀌면 컴포넌트를 다시 마운트해 새 세션을 연다 |
| CLI | 코드 변화 없음. `cli/internal/cli/skill.md` 문구와 `skill_test.go`만 바뀐다 |
| 포맷 | 없음 (comment events, `.doan/config.json`, CLI 응답, `runtime.json`, 앱 소켓 메시지 그대로) |

## 화면

시안 프레임과 주석이 정본이다. 구현이 시안에서 읽어야 할 것만 적는다.

- **헤더**: 썸네일(사이드바 `shell-thumbnail`과 같은 hue), 프로젝트 이름(제목, `h1`, 도착 시 포커스), 브랜치 칩, `displayPath`로 줄인 경로. 정상·Reading·Read failed 상태는 경로 뒤에 "· Saved to .doan/config.json in this worktree. Commit it so your team gets these settings."를 붙인다. 문제 상태는 경로만 보인다. Show in Finder는 헤더 오른쪽에 있다.
- **Show in Finder 노출**: Missing과 Still reading에서만 숨긴다(2026-11-03 user, 시안 주석의 규칙). 시안의 Not set up·CLI error 타일은 Show in Finder가 빠져 있으므로 `/design-sync` 전에 시안을 이 결정에 맞춰 고친다(T9).
- **Token CSS**: 설명 "The stylesheet canvases link for tokens.". 값이 있으면 경로와 Change/Clear, 없으면 "No token CSS. doan check won’t flag hardcoded colors."와 Choose.
- **Shared with canvases**: 설명 "Files canvases in this worktree can read, besides .doan/canvases/, .doan/ds/, .doan/assets/ and the token CSS.". 경로마다 Remove, 끝에 Add File or Folder. 확인은 `SettingsDialog`(alertdialog)를 쓰되 제목 "Share <path> with canvases?", 설명 "Canvases in this worktree will be able to read its files.", 동사 Share. 데이터 키(`serve`, `addServe`)와 CLI 플래그는 그대로다.
- **상태 표시**: Saving/Saved는 해당 행의 값 옆 상태 텍스트(시안은 말줄임표 없음). 쓰기 실패는 그 행 아래 인라인 오류. 읽기 실패는 "Couldn’t read this project’s settings."와 Retry, 그 아래 Remove from Doan.
- **문제 상태**: 기존 `PROBLEMS` 문구를 notice 한 개로 보이고 복구 버튼은 notice 안에 둔다. Config error의 Details는 notice 아래에 상세를 펼친다. Locate 거부 같은 복구 피드백은 notice 아래 인라인이다.
- **Remove from Doan 섹션**: 설명 "Doan stops listing <name> and its worktrees. Files and Git worktrees stay on disk.", 버튼 Remove from Doan. Reading·Still reading에는 없다. 기존과 같이 확인 없이 지우고 8초 Undo 토스트를 띄운다.

## 이동과 잠금

- **들어가기**: 사이드바 프로젝트 메뉴와 Overview 복구 메뉴의 Project Settings는 App의 `openProjectSettings(root, key)` 하나로 들어온다. 홈이나 워크스페이스에서 들어오면 그 화면이 origin이다. 잠기지 않은 Settings·Add Projects 페이지에서 들어오면 origin을 유지한다(`pageEnter` 규칙). 그 페이지가 잠겨 있으면 메뉴 항목은 잠금 잉크로 보이고 열리지 않는다(2026-11-03 user). 지금 다이얼로그가 Add Projects 잠금 중에도 열리던 예외는 없어진다.
- **같은 페이지에서 다른 워크트리**: 잠금이 없으면 페이지를 그 워크트리로 바꾸고 origin은 유지한다.
- **떠나기**(2026-11-03 user, Settings와 같게): Projects 탭, Back, Escape는 `addPageReturn`으로 origin에 돌아간다(origin 프로젝트가 제거됐으면 Home). Escape는 확인 다이얼로그가 열려 있으면 그 다이얼로그가 먼저 닫힌다. Back/Forward 방문을 만들지 않고 실행 시 복원하지 않는다.
- **목록에서 사라짐**: 페이지의 워크트리가 목록에서 없어지면(Remove from Doan, 다른 곳의 제거) `followProjectSettings`가 `leave`를 돌려주고 페이지는 `addPageReturn`의 목적지로 간다. Undo는 페이지를 다시 열지 않는다.
- **잠금**: 선택기 시트, Share 확인, 쓰기가 진행 중이면 `locked()`가 참이다. Add Projects 잠금과 같이 떠나는 길(헤더 탭, Back, Search, 사이드바 행, 메뉴의 Overview·워크트리 항목, Settings…)은 무시되고 잠금 잉크로 보인다. Show in Finder와 프로젝트 펼치기는 된다. 잠금 중 도착한 `doan://` 링크와 알림 클릭은 기존 페이지 잠금 규칙(링크 버림, 창만 앞으로)을 따른다.
- **Set Up**: Not set up 페이지의 Set Up은 페이지를 닫지 않고 `ProjectSetupDialog`를 페이지 위에 연다. 설정이 끝나 워크트리가 정상이 되면 페이지가 설정 화면으로 바뀌고 다시 읽는다. 다이얼로그가 닫히면 포커스는 Set Up 버튼(없으면 페이지 제목)으로 돌아간다.
- **창 숨김**: 페이지와 진행 중인 작업은 그대로 남는다.

## 순수 함수로 뺄 부분 (/tdd 대상)

1. `pageEnter` / `addPageReturn` (`addProjectsNav.ts`): `"projectSettings"` 페이지 추가, 페이지 간 이동 시 origin 유지, 잠금 시 `stay`.
2. `followProjectSettings` (`projectSettingsRules.ts`): 사라진 워크트리 → `leave`, reroot → 새 루트와 다시 읽기, 상태 변화 → 화면 전환.
3. `projectSettingsPageView(entry, readState)` (신규, `projectSettingsRules.ts`): 헤더의 경로·저장 안내·Show in Finder 노출, notice 문구, 복구 동작 목록, Remove 섹션 노출을 상태별로 정한다. 시안의 상태 타일 전부(정상, Reading, Read failed, Missing, Not set up, Config error, CLI error, Still reading)가 표 테스트 한 줄씩이다.
4. `projectSettingsLocked({picking, confirming, writing})`: 기존 `canCloseProjectSettings`의 반대.
5. `writeErrorMessage(section, message, name)`: 지금 컴포넌트 안의 정규식 안내(“Choose a CSS file inside <name>.”)를 꺼낸다.
6. 복구 라벨 표: 지금 `Home.tsx`·`ShellSidebar.tsx`·`ProjectOverview.tsx`·`ProjectSettingsDialog.tsx`가 각자 가진 `RowAction` 라벨 표를 바꾸며 말줄임표가 없는지, 캔버스 복구 문구가 같은 라벨을 쓰는지 고정한다. 표를 하나로 합칠지는 Remove/Remove from Doan 차이가 있어 구현 때 정한다(합치지 않아도 된다).

## 포맷 변경

없다. JSON Schema 원본(ARCHITECTURE §11)과 `v`는 그대로다.

## 컨벤션 영향

ARCHITECTURE §1 'Conventions'와 `doan check` 규칙은 바뀌지 않는다. 가이드 7번 규칙의 승인 경로 안내만 바뀐다.

## 결정 영향

- 구조 결정(서비스 범위, sandbox iframe, append-only events, 토큰 처리 없음, git 작업 없음)을 건드리지 않는다. 서비스 경로 추가는 여전히 사람의 확인 뒤 `doan config --json`만 쓴다.
- ARCHITECTURE §7 'Settings IPC'의 "Page and dialog"와 "Project Settings dialog" 항목, PRODUCT §5 항목 0 'Project Settings'(다이얼로그 → 페이지), 항목 1 'Remove from Doan'(정상 워크트리의 페이지에서도 가능)과 Add Projects 잠금 중 Project Settings, 항목 1의 복구 라벨(`Locate…`, `Set Up…`)이 바뀐다. 사용자 승인: 2026-11-02 부모 spec 표 13번(시안 작업), 2026-11-03 이동·잠금·Show in Finder·말줄임표 범위.

## 가이드 수정 (`skill.md`)

| 위치 | 지금 | 바꿀 내용 |
|---|---|---|
| 규칙 7 | `(Settings › Projects or doan config --add-serve <path>)` | 사람이 Doan의 프로젝트 메뉴 › Project Settings › Shared with canvases에서 추가하거나, 승인한 뒤 `doan config --add-serve <path>` |
| Commands 서두 | All commands accept `--repo` | `onboarding`을 뺀 모든 명령 |
| onboarding status | Each agent has … | `agents`는 `{revision, providers}`이고 `providers`의 각 항목이 `provider`, `phase`, `readiness`, `actions`, `error`를 가진다 |
| `doan init` | `.doan/canvases/`와 `.doan/config.json` | `.gitattributes`에 두 줄(`merge=union`, `linguist-documentation`)을 더한다는 사실 |
| Onboarding 서두 | Doan creates the CLI link when first opened | `/Applications`나 `~/Applications`에서 연 Doan이 링크를 만든다 |

문구는 clarify preset 기준(같은 개념에 같은 이름: 화면 이름 "Project Settings", 섹션 이름 "Shared with canvases")으로 쓴다. 가이드가 바뀌므로 `/agent-eval`을 돌린다(AGENTS.md 'Workflow').

## PoC 의존

없다. 페이지 셸, 잠금, origin, config bridge 모두 이미 출하된 경로를 재사용한다.

## POSTMORTEM 인용

- **2026-10-30 'Removing a shared dialog class silently disabled two focus guards'**: Share 확인은 클래스가 아니라 `dialog[role="alertdialog"]`로 찾는다. 확인이 열린 채 쓰기가 끝나는 테스트를 유지한다.
- **2026-10-25 'A forwarded Settings target discarded a pending setup confirmation'**: 페이지가 확인이나 쓰기를 쥐고 있으면 다른 워크트리의 Project Settings, Settings 대상, 탭 이동 모두 잠금에 막혀야 한다. 로컬 클릭뿐 아니라 바깥에서 들어오는 진입점도 테스트한다.
- **2026-10-24 'Focus did not return to the row when Set Up… closed from outside'**: Set Up 다이얼로그가 페이지 위에 열리므로, 바깥 사유(터미널 `doan init`, 폴더 이동)로 닫힐 때 모달이 닫힌 뒤 포커스를 옮긴다. `modalClosed`/`focusModalPath` 경로를 쓴다.
- **2026-10-25 'Removal checked the current canvas instead of the retained draft origin'**: 페이지에서 Remove from Doan을 할 때 숨겨진 워크스페이스의 초안 보호는 기존 제거 경로(`homeRun.current.removing`)를 그대로 거친다. 페이지 전용 제거 경로를 새로 만들지 않는다.
- **2026-10-27 'Shell navigation shortcuts lost destination ownership and recovery access'**(`pageEnter` 주석): 들어갈 때 대기 중인 복원과 워크스페이스 열기를 취소한다.

## 참고한 preset

`shape`(기존 표면 확장: 시각 체계 고정, 목적·상태·이동만 정함), `clarify`(같은 개념에 같은 이름, 파괴 동작은 대상과 결과를 밝히고 확인 대신 Undo).
