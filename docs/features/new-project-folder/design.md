# new-project-folder — design

## 흐름

```
renderer ProjectStep.newFolder()
  → main onboarding:new-folder {parent}         (저장 창, 시트, 기본 위치 = parent)
      취소 → null
      경로 → createProjectFolder(path)
               created  → {kind: "created", path}
               exists   → {kind: "exists", path}       (아무것도 만들지 않음)
               failed   → {kind: "failed", reason}     (아무것도 만들지 않음)
  ← created: inspectPath(path) — Choose folder와 같은 길
    exists : 알림 + Choose another name(저장 창 다시) · Use existing folder(inspectPath(path))
    failed : 알림 + Choose another location(저장 창 다시)
```

- 저장 창은 main에서 연다. 경로를 받은 뒤 폴더를 만드는 일도 main이 한다. renderer는 경로 문자열만 받는다.
- 기본 위치는 renderer가 정해 보낸다. 클론과 같은 규칙(`defaultDestination`의 부모)을 쓰고, main은 그 값이 절대 경로인 디렉터리일 때만 `defaultPath`로 쓴다. 아니면 HOME.

## 영향받는 컴포넌트

- **앱 main**: `app/src/main/index.ts` — `chooseFolder("project")`에 `createDirectory`(정한 점 5), 새 `onboarding:new-folder` 처리기, `senderAllowed.ts`. 폴더 만들기는 새 순수에 가까운 모듈(`onboarding/newFolder.ts`, fs 주입).
- **preload**: `newProjectFolder(parent)` 한 줄.
- **renderer**: `projectStep.ts`(새 동작과 상태), `Onboarding.tsx`의 'Open a local folder' 카드(버튼), `projectNotice`(새 알림 두 개), 포커스 복귀(`projectFocusNode`의 "the button that opened a folder sheet").
- **CLI·형식·스킬**: 바뀌지 않는다. `doan init`과 `doan onboarding`은 그대로다.

## 순수 함수로 뺄 것(`/tdd` 대상)

1. **`defaultProjectParent(projects, home)`** (`projectStep.ts`에서 뺀다): 마지막 등록 프로젝트의 부모, 없으면 HOME, HOME도 없으면 `/`. 클론의 `defaultDestination`이 이것을 쓰게 바꿔 두 규칙이 갈라지지 않게 한다.
2. **`createProjectFolder(path, fs)`** (`onboarding/newFolder.ts`): `mkdir`(재귀 아님)으로 만든다. `EEXIST` → `exists`, `ENOENT`(위치가 사라짐)·`EACCES`·`EPERM`·`EROFS` 등 → `failed`와 이유 종류. 이미 있는 것은 파일이든 폴더든 `exists`이고, Use existing folder 뒤의 검사가 파일을 "Only folders can be added."로 거부한다(기존 규칙). 경로는 절대 경로여야 하고 아니면 `failed`.
3. **`projectNotice`의 새 오류 두 개**: `folder_exists`(본문, 동작 Choose another name · Use existing folder), `folder_create_failed`(본문, 동작 Choose another location). 문구는 `/design-draft` 때 `clarify` 프리셋으로 정하고 초안에서 확인한다. 클론 `destination_exists`의 문장 틀을 따른다.
4. **`ProjectStep` 상태 전이**: `choose` → (저장 창) → `checking`(created) / `choose` + 오류(exists, failed) / `choose`(취소). 다른 동작이 진행 중이면 시작하지 않는다(`act`의 기존 규칙). `useExisting`과 같은 "이전 화면으로" 규칙을 지킨다.

## 세부 규칙

- **저장 창 옵션**: `dialog.showSaveDialog(window, {title: "New Project Folder", buttonLabel: "Create", nameFieldLabel: "Name:", defaultPath: parent, properties: ["createDirectory"]})`. 제목·버튼 문구는 초안에서 확정한다. 이미 있는 이름에서 macOS가 "Replace?"를 묻는지, 묻는다면 Replace가 무엇을 돌려주는지는 PoC로 확인한다(아래).
- **잠금**: 저장 창이 열린 동안 Add Projects 페이지는 다른 picker와 같이 잠긴다(PRODUCT §5 item 1 'Leaving'). 메뉴 활성화(`menuState`)도 picker와 같다.
- **포커스**: 저장 창이 닫히고 화면이 그대로면 New folder로 돌아온다. 알림이 뜨면 기존 규칙대로 알림으로 간다(`projectFocusTarget`).
- **등록된 프로젝트 안**: 클론과 같이 거부한다(spec 정한 점 7). 클론 위치 판단(`projects.ts` `cloneDestination`의 `inside_project`)과 같은 함수로 폴더를 만들기 전에 판단하고, 클론의 `path_unavailable` + `insideProject` 알림과 같은 문장 틀에 Choose another location을 둔다. 거부하지 않으면 검사가 바깥 저장소를 등록해 새 프로젝트 대신 기존 프로젝트가 선택되기 때문이다.
- **알림 위치**: 클론 화면이 아닌 choose 화면의 알림 자리(`ob-project-notice`)를 쓴다.

## 형식 변경

- 없다. 새 IPC 채널 하나(`onboarding:new-folder`)만 더한다. JSON Schema와 CLI 출력은 바뀌지 않는다.

## 규약 영향

- 없다. ARCHITECTURE §1과 `doan check` 규칙은 그대로다.

## 결정 영향

- PRODUCT §3 Out of scope 6(Git operations): New folder는 Git 명령을 실행하지 않는다. `git init`은 기존 Keep out of Git 동의 규칙에서만 일어난다.
- PRODUCT §3 Out of scope 7(앱은 캔버스 내용을 쓰지 않음): 빈 폴더 하나만 만들고 파일은 쓰지 않는다.
- PRODUCT §5 item 0 'Project step'과 item 1 'Add Projects' 문장에 New folder를 더한다(마지막 작업).
- ARCHITECTURE §7 'Settings IPC' 'Project addition'에 새 채널을 적는다.

## PoC 의존

- **macOS 저장 창과 이미 있는 폴더**: 이름 칸에 이미 있는 폴더 이름을 넣고 Create를 누를 때 NSSavePanel이 "Replace?"를 묻는지, Replace를 누르면 그 경로를 그대로 돌려주는지, 기존 폴더가 그대로인지. Electron의 `showOverwriteConfirmation`은 Linux 전용이라 macOS에서는 끌 수 없다. 묻는다면 사람은 Replace를 누른 뒤 Doan의 "이미 있음" 알림을 보게 되므로, 알림 문구가 그 순서를 견디는지 초안 전에 확인한다. 결과에 따라 "이미 있음" 판단을 저장 창 안에서 끝낼 방법이 있는지 본다.
- **시트**: 저장 창이 창에 붙은 시트로 열리고, 첫 실행 창(모달 위)에서도 같이 동작하는지.

## POSTMORTEM에서 가져온 것

- **2026-10-25 'An unreadable add pick was offered for set-up as a folder without repos'**: "when a filesystem probe feeds a decision, return a distinct 'unknown' (null) for errors other than ENOENT/ENOTDIR and branch on it before classifying." `createProjectFolder`는 `EEXIST`만 `exists`로 읽고, 다른 오류는 모두 `failed`다. 테스트에 권한 거부(`chmod`, root면 건너뜀)를 둔다.
- **2026-10-24 'The onboarding wizard lost keys and clicks to focus and modal stacking'**: 버튼이 스스로 비활성이 될 때 포커스가 안에 남는다고 가정하지 않는다. 저장 창이 닫힌 뒤 포커스는 `projectFocusNode` 규칙으로 정한다.
