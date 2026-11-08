# fixes-0-1-2 — design

여섯 건을 배치로 나눈다. UI가 바뀌는 1·2·3은 `/design-draft`로 초안을 그린다. 근거: 2026-11-08 `/feature-review`(product·tech·QA·UX/UI).

## 초안 요청

- 경로·id: `.doan/canvases/fixes-0-1-2.html`, `doan:canvas` `fixes-0-1-2`. 기존 화면은 코드와 DESIGN대로 베끼고, 바뀌는 줄·문구·버튼만 새로 그린다(새것 표시).
- 프레임:
  - `about-notes-failed` — Settings > About, ready 상태 Version 행 아래 Release Notes 실패 줄.
  - `about-notes-failed-stacked` — 같은 자리에 행 오류(설치 실패나 멈춘 재시작)와 실패 줄이 함께 있을 때의 순서(1의 '순서').
  - `popover-unblocked` — 헤더 팝오버: 막힘("Can’t restart yet") → 열린 채 풀림("Ready to restart") 두 타일.
  - `popover-stopped-blocked` — 멈춘 재시작 팝오버가 막힘 이유로 바뀌는 두 타일.
  - `overlay-cli-error` — 문제 화면 CLI error: Details 접힘, 펼침(짧은 메시지), 펼침(긴 여러 줄 메시지), Retry 중(펼친 채 busy).
  - `cli-error-elsewhere` — 사이드바 프로젝트 메뉴의 Details와 그 토스트, Project Settings 알림의 CLI error Details. Overview 브랜치 칩 복구 메뉴는 사이드바 메뉴와 같은 목록이라 캡션으로만 적는다. Home에는 프로젝트 카드가 없다(DESIGN 'Projects home'); `homeCards.ts`의 `cardRow`가 이 세 곳의 행을 만든다.
- 확정: 초안 `bbb43f94`(독립 리뷰 반영, 메뉴 아이콘 포함)을 사용자가 2026-11-08 앱에서 확정했다.
- 문구는 spec 완료 조건과 위 1–3의 초안 문구를 쓴다. Doan clarify 프리셋으로 다듬은 결과가 다르면 초안 머리말에 적는다.

## 1. Release Notes 실패 줄 (B1, renderer)

- `app/src/renderer/SettingsAbout.tsx`의 Release Notes 처리에서 `openReleaseNotes()`가 false이거나 거부되면 About 업데이트 행 아래 줄 자리(DESIGN 'App updates' 'Lines under the row')에 실패 줄을 공용 오류 줄 모양(role 없음)으로 띄운다. 낭독은 페이지의 `announce()`로 한 번 한다(DESIGN 'App updates'의 live region 규칙). 같은 실패가 다시 나면 다시 읽는다.
- 지우는 때: 다음 시도가 성공할 때, 업데이트 상태의 `kind`나 `version`이 바뀔 때. 게이트 변화와 진행률 push로는 지우지 않는다. 늦게 끝난 앞 요청이 뒤 요청의 결과를 덮지 않게 요청마다 번호를 둔다.
- 순서: 같은 자리에 막힘 notice와 행 오류(설치 실패, 멈춘 재시작, `app/src/main/update/view.ts`의 `row.error`)가 함께 나올 수 있다. notice → 행 오류 → 실패 줄 순서로 둔다.
- main과 IPC는 바뀌지 않는다(`update:openNotes`는 이미 boolean을 돌려준다). 문구는 Doan clarify 프리셋으로 다듬고 초안에서 확정한다.

## 2. 헤더 업데이트 팝오버 (B1, renderer)

- 문구 계산은 이미 순수 함수 `header()`(`app/src/main/update/view.ts`)에 있다. 바꿀 것은 `UpdateHeaderButton.tsx`가 연 순간의 `shown`을 고정하지 말고 스냅샷마다 `header.popover`를 읽는 것이다.
- `header()`는 ready이고 막히지 않은 상태에서 `popover: null`을 돌려준다. 팝오버가 열린 동안 막힘이 풀린 경우를 위한 문구("Ready to restart" 제목과 "No conversation is running or waiting anymore. Restart now, or Doan updates when you quit." — clarify로 정했다: 게이트는 여러 대화와 답을 기다리는 질문을 포함하고, 멈춘 턴은 끝난 것이 아니다)를 `header()`에 더한다. 팝오버는 열린 채 이 문구를 보인다.
- 팝오버 본문을 polite live region으로 감싸 문구가 바뀔 때 한 번 읽게 한다. 포커스는 옮기지 않는다. 업데이트 상태가 사라져(failed, none) 버튼이 없어지면 팝오버도 닫힌다.
- no-drag: 헤더 요소마다(헤더는 화면마다 하나씩 mount된다, `App.tsx`) 열린 팝오버 수를 세는 카운터(WeakMap)를 공용 훅으로 두고 `AgentUsageButton.tsx`와 `UpdateHeaderButton.tsx`가 함께 쓴다. 마지막 팝오버가 닫히거나 열린 채 unmount될 때만 지운다. 같은 팝오버의 open이 겹쳐도 한 번만 센다.

## 3. 문제 상태 (B2, main + renderer)

- `cliError`는 이미 `reason`을 renderer까지 가져간다(`app/src/main/folderState.ts:34`, `app/src/main/view.ts`). 오류 봉투(`ok:false`)는 exit 0일 때만 `cliError`가 되고 그 밖은 `error` 종류다. 따라서:
  - main: `reason`이 빈 문자열이 되는 경우(JSON 파싱 실패이고 stderr가 없을 때, `stderr.split(...)[0] ?? ""`)를 막는다. spawn 오류, 시간 초과, 종료 코드마다 짧은 설명을 채운다(초안 문구: "Couldn’t start doan: <error>", "doan didn’t answer within <n> seconds.", "doan exited with code <n> without a message.", 그리고 exit 0인데 답을 읽을 수 없고 stderr도 없을 때 "doan answered, but Doan couldn’t read the answer."). main은 stderr의 첫 줄만 넘기므로 긴 메시지는 한 줄이 감겨 보이는 경우다.. `initOutcome`의 기존 기본 문구와 같은 방식이다.
  - renderer: `problemView.ts`의 `cliError` 장면에 `details` 동작(Retry, Details, Remove 순서)과 `detail: entry.reason`을 더한다. App의 Details 처리(`App.tsx`의 `action("details")`와 `lastDetail`)가 `error`와 `cliError`를 모두 다루게 한다. Retry 중에는 Details가 열린 채 마지막 메시지를 유지하고, 결과가 다른 종류가 되면 기존 규칙대로 닫힌다.
  - 같은 Details를 Config error가 이미 Details를 보여 주는 곳에 똑같이 더한다: 사이드바 프로젝트 메뉴(토스트, PRODUCT "the row's project menu keeps the same recovery"), Overview 브랜치 칩 복구 메뉴(`ProjectOverview.tsx`), Project Settings(`projectSettingsRules.ts`). 세 곳의 행은 `homeCards.ts`의 `cardRow`가 만든다.
  - 메시지는 데이터로만 다루고 HTML로 그리지 않는다(ARCHITECTURE §3 'Untrusted text'). 기존 `<pre>` 패턴(`ProblemOverlay.tsx`)을 쓴다.
  - 프로젝트 메뉴(사이드바 `ShellSidebar.tsx`, Overview 브랜치 칩 복구 메뉴 `ProjectOverview.tsx`)의 Retry와 Details 항목에 다른 항목처럼 아이콘을 단다: Retry는 lucide `RotateCw`, Details는 `Info`(사용자, 2026-11-08 초안 검토). Config error와 CLI error 모두에 해당한다.
- Show in Finder: 새 IPC를 만들지 않는다. 기존 `folders:reveal` 핸들러(`app/src/main/index.ts`)가 main이 아는 그 root의 항목 종류를 보고, `error`이면 `<root>/.doan/config.json`을 `shell.showItemInFolder`로 선택해 보여 주고, 파일이 없으면 지금처럼 폴더를 연다. renderer는 지금처럼 root만 넘긴다. 그래서 문제 화면, Home 카드, Overview 복구 메뉴, Project Settings 어디서 눌러도 같다.
  - 규약: `main/index.ts`의 "TS does not build `.doan/` paths" 주석과 POSTMORTEM 2026-10-22 'Guessing the repo root in TS'는 TS가 저장소 루트를 추측하지 말라는 규칙이다. `error` 항목은 `--repo <root>`가 위로 찾아 올라가지 않은 상태에서 나온 결과이므로(ARCHITECTURE §13 'Discovery') `<root>/.doan/config.json`이 그 오류의 파일이다. 앱은 파일을 읽지 않고 Finder에 위치만 넘기므로 "the app never reads config itself"(ARCHITECTURE §13)도 지킨다. 이 근거를 승격 때 ARCHITECTURE와 그 주석에 적는다.
  - 숨김 폴더 `.doan/` 안의 파일을 Finder가 선택해 보여 주는지는 T9에서 확인한다.

## 4. Look Up 이름 (B3)

- Electron `context-menu`의 `selectionText`는 칩의 `sr-only` 글을 포함한다. renderer→main으로 미리 보내는 방식은 메뉴보다 먼저 닿는다는 보장이 없어 쓰지 않는다(ARCHITECTURE §7의 DOM `contextmenu`를 쓰지 않는 이유).
- PoC 순서: (b) 칩의 kind 접두어(`app/src/renderer/chipField.ts`)를 `user-select: none` 등으로 선택에서 빼서 `selectionText`에 들어가지 않게 한다. main은 바뀌지 않는다. (a) 안 되면 main이 메뉴를 만들 때 이미 돌리는 고정 `executeJavaScript`(`editMenu.ts`의 `fieldCheckScript`와 같은 방식)로 `.sr-only`를 뺀 선택 글을 읽어 이름에만 쓴다.
- 사전 창이 찾는 글이 이름과 다른지 함께 확인한다. (b)는 둘 다 맞추고, (a)는 이름만 맞춘다.
- 순수 함수: DOM 조각 → 보이는 글((a)일 때), `lookUpLabel`.
- PoC 결과(T5): (b)를 쓴다. 격리 앱에서 `.anchor-chip .sr-only`에 `user-select: none`을 주면 `selectionText`에서 kind 접두어가 빠져 메뉴 이름이 `Look Up “Look at Frame Second frame”`에서 `Look Up “Look at Second frame”`이 됐다(칩만 선택하면 `Look Up “Second frame”`). 사전 창이 찾는 글은 macOS의 첫 찾아보기 안내가 결과를 가려 확인하지 못했다. 안내를 넘기면 실제 사용자 설정이 바뀌므로 넘기지 않았다. `showDefinitionForSelection`이 같은 선택 글을 쓰므로 같을 것으로 본다.

## 5. 테스트 두 개 (B4)

- `thumbnails.test.ts`: `countsAsChangedPastLimit`가 2001개 디렉터리를 walk하는 동안 `vi.waitFor` 기본 timeout(1 s)으로 기다린다. `f.changed`를 기다리는 대기에 명시적 timeout(testTimeout 20 s 안, 예 15 s)을 주거나 길이를 기다리는 promise helper로 바꾼다. 재는 것은 바꾸지 않는다.
- `quickOpen.test.ts`: 이미 3회 중 최솟값으로 판단하는데도 76 ms로 실패했다. 같은 실행 안에서 단순 선형 스캔 기준선과 번갈아 재고, 절대 시간 대신 기준선 대비 비율 상한으로 판단한다(부하가 둘에 같이 걸린다). 제품 코드에 계측을 넣지 않는다. 50 ms는 이 테스트의 기존 목표일 뿐 PRODUCT의 결정이 아니다.

## 6. 프리셋 (B5, CLI 내장 지침, `/agent-eval` 대상)

- `cli/internal/designskill/presets/context.md:10`, `shape.md:80`, `generate.md:10`을 다음으로 바꾼다:
  - context: "- When the user asked to set up Doan and the repository has no `.doan/config.json`, set it up as the Doan guide's Onboarding section describes (do not ask for token CSS; pass a path the user named). If Doan is already set up, do not repeat it. A setup request alone is not approval to write a design system."
  - shape: "- If the repository has no `.doan/config.json` and the user asked for a sketch, set Doan up as the Doan guide's Onboarding section describes."
  - generate: "- If the repository has no `.doan/config.json`, set Doan up as the Doan guide's Onboarding section describes. A project with no canvases yet is fine: you will create one."
- `audit.md`: `doan check` 설명을 범주로 쓴다: canvas metadata and ids, implementation paths, linked and served CSS, tokens and direct colors when token CSS is configured, viewport height units, external resources — 그리고 "read each finding's `code`"를 덧붙인다. 코드 이름을 늘어놓지 않는다(나중에 규칙이 늘면 어긋난다).
- `notices/MODIFICATIONS.md`(`cli/internal/designskill/notices/`)는 이미 "Doan's canvas and workflow rules"로 이런 수정을 포괄하는지 확인하고, 포괄하지 않으면 한 줄 더한다. 프리셋 본문을 담은 fixture는 `get-clarify.json`뿐이라 다시 만들 것이 없다. 출력 예산(`skillOutputBudget`, 프리셋 크기)과 `designSkills.test.ts`는 통과해야 한다.

## 배치와 파일

- B1: `SettingsAbout.tsx`, `UpdateHeaderButton.tsx`, `AgentUsageButton.tsx`, 새 공용 훅, `app/src/main/update/view.ts`(+테스트).
- B2: `app/src/main/folderState.ts`, `app/src/main/index.ts`(reveal 핸들러), `problemView.ts`, `ProblemOverlay.tsx`, `App.tsx`(Details), `homeCards.ts`, `ProjectOverview.tsx`, `projectSettingsRules.ts`(+테스트).
- B3: (b)면 `chipField.ts`·`styles.css`, (a)면 `editMenu.ts`·`app/src/main/index.ts`(context-menu). (a)이면 B2와 `main/index.ts`가 겹치므로 B2 통합 뒤에 시작한다.
- B4: 두 테스트 파일만. B5: `cli/internal/designskill/` 아래만.

## 결정

- **D1. 실패 줄은 About에만 둔다.** 헤더 팝오버에는 Release Notes가 없다.
- **D2. CLI error의 메시지는 Details로 접어 둔다.** Config error와 같은 모양이라 새 패턴이 없다. Config error가 Details를 보이는 모든 곳에 같이 둔다.
- **D3. Show in Finder는 Config error일 때 config 파일을 선택한다.** 사람이 고칠 파일이 그것이다. 판단은 main이 항목 종류로 한다.
- **D4. 막힘이 풀린 팝오버는 열린 채 다시 시작할 수 있다고 말한다.** 닫아 버리면 읽던 사람의 자리가 사라진다.
- **D5. 여섯 건을 한 PR로 낸다.**

## 형식·규약·결정 영향

- 형식 변경 없음. 앱 내부 `header()`에 팝오버 문구 하나가 는다.
- `app/src/main/index.ts`의 "TS does not build `.doan/` paths" 예외 하나(위 근거)를 ARCHITECTURE §13과 주석에 적는다.
- 가이드(`skill.md`) 변경 없음, 프리셋 본문만 바뀐다.

## POSTMORTEM에서 가져올 함정

- 2026-10-22 'Guessing the repo root in TS': 위 3의 근거.
- 2026-10-29 "Codex cut the middle out of the doan guide": 프리셋 본문을 바꾸면 출력 예산과 끝 표시를 다시 본다.
- 구현 전에 `rg -n 'thumbnails|quickOpen|waitFor|context-menu|popover|no-drag' docs/POSTMORTEM.md`로 이전 함정을 확인한다.

## PoC 의존

- 4의 (b)/(a), 사전 창이 찾는 글(T5).
- 3의 숨김 폴더 안 파일 선택(T9).
