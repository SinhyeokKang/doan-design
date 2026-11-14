# new-project-folder — design

`project-step-actions`는 develop에 병합됐다(PR #196). 알림 자리(폴더 출처는 카드 아래)와 모양(동작은 알림 안), 페이지 하단 "Add project", 버튼 크기, 오류 포커스는 그 feature의 규칙과 코드(`error.source`, `projectFooter`, `ProjectNoticeView`, `projectFocusNode`)를 그대로 쓴다.

## 흐름

```
renderer ProjectStep.newFolder(parent)          (picking·choosing = true, dropNotice 지움)
  → main onboarding:new-folder {parent}
      저장 창(시트) → 취소 or 창·세션이 사라짐 → {kind: "cancelled"}
      경로 p → newFolderTarget(p, projectDeps)
                 inside_project → {kind: "inside_project", path, project}
                 exists         → {kind: "exists", path, directory}
                 no_parent·mkdir 실패 → {kind: "failed", path}
                 created        → {kind: "created", path}   (mkdir, 재귀 아님)
  ← created        : inspectPath(path) — Choose folder와 같은 길(검사 중 checking 표시)
    exists(폴더)    : 알림 + Choose another name(직전 위치에서 다시) · Use existing folder(inspectPath)
    exists(파일 등) : 알림 + Choose another name
    inside_project : 알림 + Change location(기본 위치에서 다시)
    failed         : 알림(경로를 detail로) + Change location
    cancelled      : choose 그대로, 포커스 New folder
```

- 저장 창은 main에서 연다. 폴더를 만드는 일도 main이 한다. renderer가 보내는 `parent`는 저장 창이 열릴 위치일 뿐이다. 폴더 경로는 네이티브 창에서 오고, 결과는 다시 inspect를 거친다.
- 새 오류는 renderer 안에만 둔다(`projectStep.ts`의 `"access_failed"`와 같다). `OnboardingOperationErrorCode`는 `schema/app-socket.v2.schema.json`과 CLI `envelope.go`가 받치므로 거기에 넣지 않는다. 넣으면 형식과 CLI가 바뀌고 `/agent-eval` 대상이 된다.

## 영향받는 컴포넌트

- **앱 main**
  - `app/src/main/index.ts`
    - `chooseFolder("project")`에 `createDirectory`를 켠다.
    - 새 `onboarding:new-folder` 처리기를 `start()` 안 `projectWork` 옆에 둔다. `projectDeps.ls`가 필요하기 때문이다.
    - 처리기는 `fromWindow(event)`를 확인하고 인자 모양을 검사한다. `parent`가 절대 경로인 디렉터리가 아니면 HOME을 쓴다.
  - `app/src/main/onboarding/projects.ts`: `newFolderTarget(path, deps)`.
  - `app/src/main/senderAllowed.ts`: `mainOnly`에 채널을 넣는다.
- **preload**: `newOnboardingFolder(parent)`. 이웃한 `chooseOnboardingFolder`를 따라 이름을 짓는다.
- **renderer**
  - `projectStep.ts`
    - `Api`, `PageCalls`, `addPageApi`에 새 호출을 더한다.
    - `newFolder`, `chooseAnotherName`, `useExistingFolder`, `newFolderElsewhere`를 더한다.
    - renderer 전용 오류 `folder_exists`·`folder_inside_project`·`folder_create_failed`를 두고, 경로를 `error.path`에, 출처를 `error.source: "folder"`에 싣는다.
    - `defaultProjectParent`를 뺀다.
  - `Onboarding.tsx`
    - 로컬 폴더 카드(`LocalFolderCard`, `Onboarding.tsx:369-411`)에 `sm` New folder를 더하고, 제목·설명을 바꾼다(spec 정한 점 2).
    - `ProjectAction`에 `chooseAnotherName`·`useExistingFolder`·`newFolderElsewhere`를 더한다.
    - `projectNotice`에 세 알림을 더한다. 알림 모양과 자리는 `project-step-actions`의 `ProjectNoticeView`가 정한다.
    - 포커스: 오류 조건은 `project-step-actions`가 이미 더했다. 이 feature는 New folder와 알림 안 버튼이 연 저장 창의 취소 경로만 더한다(spec 정한 점 8). 지금 `projectFocusNode`는 알림 버튼이 사라지면 카드의 첫 버튼(Choose folder)으로 보낸다. New folder 쪽 알림이 연 저장 창이면 New folder로 가게 한다.
  - 카드 제목을 말하는 주석과 테스트: `folderDrop.ts:1`, `App.tsx:1302`, `Onboarding.tsx:367`, `Onboarding.test.tsx:236, 266`, `AddProjectsPage.test.tsx:18`, `LocalFolderCard.interaction.test.tsx`(카드 props). DESIGN.md의 "Open a local folder"도 다시 잰다.
- **CLI·형식·스킬**: 바뀌지 않는다.

## 순수 함수로 뺄 것(`/tdd` 대상)

1. **`defaultProjectParent(projects, home)`** (`projectStep.ts`): 마지막 등록 프로젝트의 부모, 없으면 HOME, HOME도 없으면 `/`. 클론의 `defaultDestination`도 이것을 쓴다. HOME이 `/`일 때 `//repo`가 되지 않게 한다.
2. **`newFolderTarget(path, deps)`** (`projects.ts`, 실제 임시 폴더로 테스트)
   - 판단 순서
     1. 상대 경로면 `failed`.
     2. 부모를 `canonicalFolder`로 실제 경로로 바꾼다. 실패하면 `failed`(사라진 위치).
     3. `deps.ls({cwd: parent})`가 `list`이면 `inside_project`와 그 프로젝트 이름.
     4. `lstat`이 되면 `exists`와 `directory`. 깨진 심볼릭 링크도 `exists`이고 `directory: false`다.
     5. `mkdir`(재귀 아님). `EEXIST`이면 `exists`, 다른 오류(`EACCES`·`EPERM`·`EROFS`·`ENOTDIR`·`ENAMETOOLONG` 등)이면 `failed`, 성공하면 `created`와 실제 경로.
   - 이미 있는 판단을 클론(`cloneDestination`)과 달리 프로젝트 안 판단 뒤에 둔다(spec 정한 점 4).
   - 공용 조각 `canonicalFolder`·`deps.ls`는 클론과 같이 쓴다.
3. **`projectNotice`의 세 알림**: 본문과 동작. 문구는 `/design-draft` 때 `clarify` 프리셋으로 정하고 초안에서 확인한다. 동작 라벨은 기존 것을 쓴다. "Change location"(`Onboarding.tsx` 클론 알림), "Use existing folder", 그리고 새 "Choose another name"이다.
4. **`ProjectStep` 상태 전이**
   - `choose` → 저장 창 → `checking`(created) / `choose` + 오류(exists, inside_project, failed) / `choose`(cancelled).
   - 다른 동작이 진행 중이면 시작하지 않는다(`act`).
   - 저장 창이 열린 동안 `picking()`이 참이다.
   - 세션이 저장 창을 기다리는 동안 끝나면 결과를 버린다.
   - Choose another name은 직전 결과의 부모에서, Change location은 `defaultProjectParent`에서 다시 연다.
   - "이전 화면으로" 규칙은 `inspectPath`의 `back`을 따른다.
5. **포커스**: 저장 창 취소는 New folder로, 알림 안 Choose another name·Change location이 연 저장 창 취소는 그 알림 버튼(알림이 없어졌으면 New folder)으로 돌아온다. 알림이 뜨면 알림으로 가는 규칙은 `project-step-actions`의 것이다.

## 세부 규칙

- **저장 창 옵션**: `dialog.showSaveDialog(window, {message, buttonLabel: "Create", nameFieldLabel: "Name:", defaultPath: parent, showsTagField: false})`.
  - `createDirectory`는 넣지 않는다.
  - 시트에서는 `title`이 보이지 않을 수 있어 안내 문장은 `message`에 둔다(PoC에서 확인한다). 문구는 초안에서 확정한다.
  - `defaultPath`에는 디렉터리만 주어 이름 칸을 비운다.
- **잠금**: 페이지는 잠그지 않는다(spec 정한 점 7). `acting`과 `choosing`이 Add Project…를 끄는 지금 규칙이 그대로 적용된다(`menuState`). 저장 창이 돌아왔을 때 창이 없거나 세션이 끝났으면 main은 `mkdir`를 하지 않고 `cancelled`로 답한다.
- **검사 표시**: 만든 뒤 `inspectPath`가 `checking`을 보이므로 CLI `ls`(최대 10초) 동안 상태 줄이 있다.
- **알림 위치와 모양**: 폴더 출처 알림이므로 카드 바로 아래, 끌어 놓기 알림과 같은 자리이고 서로를 지운다. 동작은 알림 안에 있다(이미 있는 폴더 알림은 동작 둘이라 아래 줄에 쌓는다). 모두 `project-step-actions` 규칙이다.
- **만든 뒤**: 설정 패널에서 페이지는 하단 "Add project"가, 첫 실행은 카드 안 "Set up and continue"가 동의다.

## 초안

- 초안은 `.doan/canvases/new-project-folder.html` 하나를 `project-step-actions`와 같이 쓴다. 출시된 Project 단계를 다시 설계하는 초안이므로, AGENTS.md 'Workflow'의 redesign 예외에 따라 이 feature가 병합될 때까지 New folder 부분의 `/design-sync` 기준이다. 출시된 초안(`doan-onboarding.html`, `doan-add-projects.html`)은 고치지 않는다.
- 이 feature가 맡는 프레임(`project-step-actions`가 적용된 모양): `card-add-projects`, `card-first-run`, `save-panel`, `notice-exists-folder`, `notice-exists-file`, `notice-inside-project`, `notice-create-failed`, `after-create`. `card-busy`와 `shipped-notices-*` 다섯 프레임은 `project-step-actions`가 맡는다.
- 문구는 `clarify` 프리셋으로 정했다. 카드 제목 "Use a folder on your Mac", 설명 "Choose a project folder you already have, or create a new one.", 저장 창 message "Name your new project folder and choose where to create it.", 이미 있는 폴더 "A folder named “<name>” already exists in <~ parent>. Doan didn’t replace it. Choose another name or use the existing folder.", 폴더가 아닌 항목 "An item named “<name>” already exists in <~ parent> and isn’t a folder. Doan didn’t replace it. Choose another name.", 프로젝트 안은 클론의 출시 문장, 실패 "Couldn’t create this folder. Check folder access, then choose another location."과 시도한 절대 경로.
- 사용자가 2026-11-14 앱에서 프레임별로 초안을 확인했다(알림 자리·모양, 하단 "Add project", 버튼 크기는 그 과정에서 정해져 `project-step-actions`로 갔다). 부작용 점검으로 고친 초안도 같은 날 확인했다(chain-261114-1 시작 점검 2). `project-step-actions`는 공유 초안 중 `shipped-notices-choose` 안만 바꿨고, New folder 프레임은 그대로다(PR #196).

## 형식 변경

- 없다. 새 IPC 채널 하나(`onboarding:new-folder`)만 더한다. JSON Schema, fixture, CLI 출력은 바뀌지 않는다.

## 규약 영향

- 없다. ARCHITECTURE §1과 `doan check` 규칙은 그대로다.

## 결정 영향

- PRODUCT §3 Out of scope 6(Git operations): New folder는 Git 명령을 실행하지 않는다.
- PRODUCT §3 Out of scope 7: 빈 폴더 하나만 만들고 파일은 쓰지 않는다.
- PRODUCT §5 item 0 'Project step'과 item 1 'Add Projects'에 New folder와 카드 제목을 적는다(마지막 작업). 'Leaving'은 바뀌지 않는다.
- ARCHITECTURE §7 'Settings IPC'의 'Project addition'과 'Main boundary'에 새 채널, `parent`의 역할, 폴더를 main이 만든다는 규칙을 적는다.

## PoC 의존

- **macOS 저장 창과 이미 있는 이름**: 하나만 확인한다.
  - 이미 있는 폴더 이름으로 Create를 누르면 NSSavePanel이 Replace를 묻는가. Replace를 누르면 어떤 경로가 돌아오는가.
  - 대소문자만 다른 이름, `/`·`:`가 든 이름, `.`으로 시작하는 이름은 어떻게 되는가.
  - Electron 문서에 따르면 `showOverwriteConfirmation`은 Linux 전용이다(타입 정의에는 표시가 없고, 여기서 확인하지 않았다).
  - 재귀 없는 `mkdir`는 창이 무엇을 돌려주든 덮어쓰지 않는다. 그래서 이 PoC는 알림 문구가 Replace 다음 순서를 견디는지만 확인한다.
- **시트**: 따로 확인하지 않는다. 첫 실행은 main 창 안의 `<dialog>`(`Onboarding.tsx`)이고, Choose folder가 이미 같은 창에 시트를 붙인다.

## POSTMORTEM에서 가져온 것

- **2026-10-25 'An unreadable add pick was offered for set-up as a folder without repos'**: "when a filesystem probe feeds a decision, return a distinct 'unknown' (null) for errors other than ENOENT/ENOTDIR and branch on it before classifying." `newFolderTarget`은 `EEXIST`만 `exists`로 읽고, 다른 `mkdir` 오류는 모두 `failed`다. 테스트에 권한 거부(`chmod`, root면 건너뜀)를 둔다.
- **2026-10-24 'The onboarding wizard lost keys and clicks to focus and modal stacking'**: 버튼이 스스로 비활성이 될 때 포커스가 안에 남는다고 가정하지 않는다. 저장 창이 닫힌 뒤 포커스는 `projectFocusNode`가 정한다.
- 네이티브 입력 probe(작업 1, 8): 2026-10-27 'Native focus waits hid a locked desktop', 2026-11-13 'A native probe's ⌥-click left Option held', 2026-10-30 'A dev-build measurement started an unisolated Electron'.
