# 폴더 첨부 구현 전 PoC

작업 1 중 구현 전 부분이다. 2026-11-11 이 Mac(macOS, Electron 45.0.0, Node 24.22.0)에서 확인했다. 구현 후 실제 앱 probe와 제공자 실제 읽기는 배치 S가 맡는다.

## 방법

- 최소 Electron PoC(`.scratch/poc-folder/`)를 만들었다. 이 작업트리에는 `app/node_modules`가 없어서, 같은 버전(`app/package.json`의 `electron` 45.0.0)이 설치된 메인 체크아웃의 Electron 바이너리를 썼다. userData는 임시 디렉터리로 지정했고 실제 `~/Library/Application Support/doan`은 건드리지 않았다.
- PoC main은 받은 경로마다 `lstat`·`stat`·`realpath.native`와 `O_RDONLY|O_NONBLOCK|O_NOFOLLOW` open 후 `fstat`만 실행한다. 폴더 내용은 `readdir`하지 않는다. 결과는 `.scratch/poc-folder/log.jsonl`에 남겼다.
- 픽스처: 프로젝트 안 `fixtures/project/`에 `a.txt`(파일), `sub/`, `empty/`(빈 폴더), `x.png/`(이름이 `.png`인 폴더), `link-to-outside`(프로젝트 밖 폴더를 가리키는 심볼릭 링크)를 두었다. 프로젝트 밖 폴더는 세션 scratchpad의 `outside-folder/`다.
- 선택창은 `orca computer`로 조작했다. Finder 드래그는 `orca computer drag`가 창 밖으로 놓지 못해서 CGEvent 전역 마우스 드래그(`tools/drag.swift`)로 했다. Finder 복사는 Finder 창에서 실제 ⌘C를 보냈다.
- 제공자 전달은 코드를 읽고, 현재 `turnPrompt`·`resolveFencePaths`에 폴더 레코드를 넣어 실행했다(`tools/provider-probe.ts`, 결과 `provider-probe.out`).

## 1. 선택창

`dialog.showOpenDialog(win, { properties: ["openFile", "openDirectory", "multiSelections"] })` 하나로 파일과 폴더를 함께 선택할 수 있다.

| 확인 | 결과 |
|---|---|
| 혼합 선택 | `project/` 안에서 ⌘A로 5개를 선택해 열었다. `filePaths` 5개가 돌아왔다: `empty`, 링크 대상 경로, `sub`, `x.png`, `a.txt` |
| ⌘⇧G | 경로 입력창이 열리고, 폴더 경로를 입력하면 그 폴더로 이동해 선택한다. 그대로 열기를 누르면 그 폴더 경로 하나가 돌아온다 |
| 폴더 | 입력 경로 그대로, `stat.isDirectory()` true |
| `x.png` 폴더 | 일반 폴더와 같다. 경로 `…/x.png`, 디렉터리 |
| 빈 폴더 | 일반 폴더와 같다 |
| 프로젝트 밖 폴더 | `/private/tmp/…/outside-folder`. 제한 없이 돌아온다 |
| 심볼릭 링크 폴더 | **링크 경로가 아니라 해석된 대상 경로**가 돌아온다. 목록에서 링크를 고르든 ⌘⇧G로 링크 경로를 입력하든 같다 |
| 취소 | `canceled: true`, `filePaths: []` |

- 현재 코드(`app/src/main/index.ts` `attachments:choose`)는 `["openFile", "multiSelections"]`와 제목 `Attach Files`를 쓴다. `openDirectory`를 추가하고 제목을 design.md의 `Attach Files or Folders`로 바꾸면 된다.
- 선택창이 링크를 미리 해석하므로, 선택창으로 추가한 첨부에는 "원래 입력 경로의 링크 대상 변경"을 검사할 입력 경로가 남지 않는다. 이 경로의 재검사는 대상의 canonical path와 `dev/ino`로만 한다.

## 2. Finder 드롭

Finder에서 폴더를 끌어 PoC의 드롭 영역에 놓았다. `sub` 하나, 그리고 5개를 한꺼번에 끌어 두 번 확인했다.

| 값 | 폴더 | `x.png` 폴더 | 링크 폴더 | 파일 `a.txt` |
|---|---|---|---|---|
| `dataTransfer.types` | `["Files"]` | 같음 | 같음 | 같음 |
| `File.type` | `""` | **`"image/png"`** | `""` | `"text/plain"` |
| `File.size` | 디렉터리 항목 크기(64·96) | 96 | 대상 폴더의 96 | 3 |
| `webUtils.getPathForFile` | 절대 경로 | 절대 경로 | **링크 경로 그대로** | 절대 경로 |
| drop 시 `webkitGetAsEntry()` | `isDirectory: true` | `isDirectory: true` | `isDirectory: true` | `isFile: true` |
| dragenter 시 `webkitGetAsEntry()` | `null` | `null` | `null` | `null` |
| `file.slice(0,1).arrayBuffer()` | `NotFoundError` | `NotFoundError` | `NotFoundError` | 성공 |
| main `lstat` | 디렉터리 | 디렉터리 | 링크 | 파일 |
| main `stat` | 디렉터리 | 디렉터리 | 디렉터리 | 파일 |
| main `O_NOFOLLOW` open + `fstat` | 디렉터리 | 디렉터리 | **`ELOOP`** | 파일 |

- renderer는 drop 이벤트 안에서 `webkitGetAsEntry().isDirectory`로 폴더를 구분할 수 있다(현재 `ComposerParts.tsx`가 이미 이 값으로 폴더를 거부한다). dragenter·dragover에서는 `null`이라 구분할 수 없다.
- `File.type`은 이름의 확장자에서 나온다. `x.png` 폴더가 `image/png`로 보이므로 종류 판단에 쓰면 안 된다. `File.size`도 폴더 크기가 아니다.
- 확정 판단은 main이 한다. `realpath.native` 후 `O_RDONLY|O_NONBLOCK|O_NOFOLLOW`로 열고 `fstat().isDirectory()`를 보면 폴더 내용을 읽지 않고 구분한다. 디렉터리 fd에서는 `readSync`를 하지 않아야 한다(현재 `readChecked`는 regular file이 아니면 `not_file`을 던진다).
- 링크 폴더는 드롭 경로가 링크 자체다. 현재 `check()`처럼 `realpath` 후 대상을 열면 디렉터리로 판정된다. 입력 경로를 바로 `O_NOFOLLOW`로 열면 `ELOOP`가 난다.

## 3. Finder 복사·붙여넣기

Finder에서 `sub`를 ⌘C하고 PoC의 contenteditable에 ⌘V했다. 5개를 함께 복사한 경우도 확인했다.

- renderer `paste` 이벤트: `clipboardData.types`는 `["Files"]`뿐이다. `getData("text/plain")`은 빈 문자열이다. `clipboardData.files`에 폴더 `File`이 있고, `getPathForFile`이 절대 경로를 준다. paste 이벤트에서도 `items[i].webkitGetAsEntry().isDirectory`가 true다. `File.type`·`File.size`·읽기 결과는 드롭과 같다(`x.png` 폴더는 `image/png`, 링크는 링크 경로).
- main 클립보드(Electron 45 `clipboard.read()`): 항목 types는 `text/plain`(이름, 여러 개면 `\r` 구분), `text/uri-list`(`file:///…` URL, `\r\n` 구분), 그리고 `electron application/osclipboard;format="…"` raw 형식들이다. raw 형식에는 `NSFilenamesPboardType`(경로 plist), `Apple URL pasteboard type`, `CorePasteboardFlavorType 0x6675726C`(`file:///.file/id=…` 참조 URL), `com.apple.finder.noderef`, 아이콘(`com.apple.icns`, TIFF)이 있다. `public.file-url` 이름으로는 조회되지 않는다. macOS `clipboard info`에는 아이콘 이미지(PNG·JPEG·TIFF·GIF 등)도 보인다.
- Electron 45의 `clipboard`에는 `availableFormats`·`readBuffer`가 없다(`clear`, `has`, `readText`, `writeText`, `read`, `write`만 있다). 메인에서 raw 형식을 확인하려면 `has('electron application/osclipboard;format="…"')`나 `read()` 항목의 `getType`을 쓴다.
- 현재 Doan 붙여넣기(`HomeComposerView.tsx` `pasteAction`, `DockedComposer.tsx`): text가 비어 있고 files가 있으므로 `"files"`가 되어 `addFiles`로 간다. `addFiles`는 `File.type`으로 초안 칩의 종류(`image`/`file`)를 추정하고 `addAttachmentFiles`가 `getPathForFile` 경로를 main `attachments:add-paths`로 보낸다. 폴더는 main `check()`에서 `not_file`로 거부된다. 이 동작은 코드와 PoC 관찰을 합친 판단이며, 실제 Doan 앱에서는 실행하지 않았다.
- 폴더 경로를 얻는 데 main 클립보드는 필요 없다. 드롭과 같은 `getPathForFile` 경로로 충분하다.
- 클립보드 보존: `app/runtime/clipboard.ts`의 `saveClipboard`·`restoreClipboard`를 그대로 JS로 옮겨 썼다. probe 전 일반 pasteboard는 비어 있고 find pasteboard 항목(`electron application/findtext`)만 있었다. 첫 회차는 저장 → 복사·붙여넣기 → 복원 후 지문(형식별 sha256 앞 16자)이 같았다(`same: true`). 둘째 회차는 저장 클릭이 반영되지 않은 채 Finder 복사가 먼저 실행됐다. 그래서 `NSPasteboard.general.clearContents()`로 직전에 확인한 빈 상태로 되돌린 뒤 다시 저장·복원해 지문이 첫 회차와 같음을 확인했다. find pasteboard 지문은 처음부터 끝까지 같았다. 로그에 한 번 찍힌 find pasteboard 텍스트는 지웠고, probe는 그 값을 기록하지 않도록 고쳤다.

## 4. 제공자 전달

다섯 제공자 모두 첨부 경로를 프롬프트 텍스트의 JSON `attachments: [{ name, kind, path }]`로 받는다(`prompt.ts` `turnPrompt`). 폴더도 같은 통로로 전달할 수 있고, 현재 코드도 `kind: "directory"` 레코드를 그대로 싣는다(`provider-probe.out`).

| 제공자 | runner와 전달 | 폴더 경로 | fence |
|---|---|---|---|
| Claude Code | `runners.ts` `openClaude`, SDK `query`. `send(prompt, turnId)`는 첨부 인자를 받지 않는다 | 프롬프트 텍스트만. 이미지 블록 없음 | 샌드박스 off: `sandbox-exec` 외부 정책(기본 허용, userData 거부, 프로필·`runtime.json`·이번 turn의 붙여넣기 디렉터리만 다시 허용). on: 플래그 tier 설정의 `denyRead: [userData]`·`allowRead` |
| Codex | `openCodex` app-server. `turn/start`와 steer의 `input`은 `[{ type: "text" }]`뿐 | 프롬프트 텍스트만 | Full access: 외부 `sandbox-exec`. 그 밖: Codex 권한 프로필 `:read-only`/`:workspace` + userData 항목 deny |
| Cursor | `acpRunner.ts` `openAcp`. `session/prompt`의 `prompt`는 text 블록 하나 | 프롬프트 텍스트만. ACP resource link는 쓰지 않는다 | 외부 `sandbox-exec` |
| GitHub Copilot | Cursor와 같다 | 같다 | 같다 |
| Antigravity | `openAcp`. text 블록 + `kind === "image"` 첨부만 image 블록 | 텍스트만. `imageBlock`은 image가 아니면 `[]`, image여도 `stat.isFile()`이 아니면 `[]`라 폴더가 블록이 되지 않는다 | 외부 `sandbox-exec` |

- `resolveFencePaths`는 첨부 경로의 부모가 `<userData>/attachments/<id>`일 때만 그 디렉터리를 연다. 프로젝트 밖 폴더와 `<userData>/attachments/<id>` 폴더 자체를 넣어도 Claude·ACP는 `attachments: []`, Codex는 항상 `<userData>/attachments`다. 폴더 첨부는 fence에 새 경로를 열지 않는다.
- 외부 `sandbox-exec` 정책은 기본 허용이라 userData 밖 폴더는 OS 수준에서 막히지 않는다. 각 제공자의 자체 도구 권한(Claude의 작업 폴더 밖 Read 승인, Codex `:read-only`의 읽기 범위, Antigravity `view_file`의 작업 공간 밖 거부)이 실제 읽기를 정한다. `acpRunner.ts` 주석은 Antigravity `view_file`이 작업 공간 밖 경로를 거부한다고 적는다. 프로젝트 밖 폴더는 Antigravity에서 읽지 못할 가능성이 있다.
- Claude Send now(`service.ts` `sendNow`)는 붙여넣은 이미지 경로만 다음 turn으로 미룬다. 폴더 경로는 해당하지 않는다.
- 깨지는 곳: `kind`를 `"image" | "file"`로 고정한 검증기와 타입이다. `conversation/types.ts` `AttachmentRecord`, `drafts.ts`·`store.ts`의 `attachment()` 검증기, `renderer/homeComposer.ts`·`threadItems.ts`의 타입이다. 검증기는 `size`도 필수로 본다. `turnPrompt`는 `kind`를 검사하지 않는다. 첫 문장은 "attachments lists local files"라서 폴더를 포함하도록 문구를 바꿔야 한다.

## 검증하지 않은 것

- 실제 Doan 앱(격리 dev 앱)의 세 입력창에서 Attach·드롭·붙여넣기를 실행하지 않았다. 현재 동작은 코드와 PoC 관찰로 판단했다.
- 다섯 제공자의 실제 읽기와 권한 거부. 로그인이 필요하고 이 배치 범위가 아니다(orch.md D1).
- `.app`·`.key` 같은 패키지. `stat`으로는 디렉터리지만 선택창·드롭에서 어떻게 오는지는 확인하지 않았다.
- Finder 외 출처(다른 파일 관리자, VS Code 탐색기 드래그)와 ⌥⌘C(경로 이름으로 복사)는 확인하지 않았다.
- 선택창 목록의 항목 클릭은 접근성 클릭으로 선택되지 않아 키보드(→, ⌘A)로 선택했다. 마우스 클릭 선택 자체는 확인하지 않았다.
