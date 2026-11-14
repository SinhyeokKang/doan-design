# project-step-actions — design

## 초안

- 초안은 `.doan/canvases/new-project-folder.html` 하나를 `new-project-folder`와 같이 쓴다. 출시된 Project 단계를 다시 설계하는 초안이므로, AGENTS.md 'Workflow'의 redesign 예외에 따라 이 feature가 병합될 때까지 바뀐 부분의 `/design-sync` 기준이다. 출시된 초안(`doan-onboarding.html`, `doan-add-projects.html`, `keep-out-git-init.html`, `local-doan-files.html`, `config-error-source.html`)은 고치지 않는다.
- 이 feature가 맡는 프레임: `card-busy`(하단 줄과 버튼 크기. 그 타일의 New folder 버튼은 "new-project-folder에서 들어옴"으로 둔다), `shipped-notices-choose`, `shipped-notices-url`, `shipped-notices-setup`, `shipped-notices-clone`, `shipped-notices-complete`, 그리고 다른 프레임의 하단 줄·버튼 크기·알림 모양. New folder 자체(버튼, 저장 창, New folder 알림 네 가지)는 `new-project-folder`가 맡는다.
- 사용자가 2026-11-14 앱에서 초안을 시각적으로 확인했다. 그 뒤 부작용 점검으로 고칠 타일(알림 동작 반복, 후보 목록·설정 동의·잠긴 하단 줄·진행 줄 타일, 포커스 문구)을 그리는 중이다. 고친 초안을 다시 확인받는다.

## 영향받는 컴포넌트

앱 renderer만 바뀐다. main, preload, IPC, 형식, CLI, guide는 그대로다.

- `app/src/renderer/projectStep.ts`
  - `ProjectError`에 renderer 전용 `source: "folder" | "url"`. `failed()`(`:482`)가 부른 쪽에서 받아 정한다. `inspectPath`(`:272`)·`useListed`(`:188`)·폴더에서 시작한 재검사는 `folder`, `inspectUrl`(`:260`)과 URL 화면은 `url`. 오류 코드는 출처를 알려 주지 못한다(같은 코드가 양쪽에서 난다).
  - 끌어 놓기 알림(`dropNotice`, `:119`, `drop()` `:171-174`)과 폴더 출처 오류가 서로를 지운다.
  - `projectFooter`(`:506-519`): 페이지(`addPage`)는 잠기지 않은 모든 단계에서 `primary: { label: "Add project", action, disabled }`. `action`은 단계에 따라 `select`(후보), `setUp`(설정, 렌더할 때의 `inspectionId`를 싣는다), `clone`. 잠긴 동안은 지금처럼 `null`. 첫 실행 분기는 그대로.
  - 페이지의 설정된 폴더 바로 추가(`:284-286`)를 첫 실행에만 남긴다.
  - 설정이 필요한 후보의 첫 누름은 설정 패널로 간다(지금 `runSelect`가 동의 없이 가는 길, `:335-336`). 같은 화면의 둘째 누름이 `setUp(inspectionId)`(`:216-222`)다.
  - `setUpLabel`(`:521-523`)의 페이지 분기를 없앤다.
- `app/src/renderer/Onboarding.tsx`
  - `ProjectNoticeView`(`:320-334`): 동작을 알림 안에 둔다. 하나면 한 줄, 둘 이상이면 쌓는 배치. 버튼 무게는 알림 표면에 따라 `panel`/`subtle`, Retry는 `data-consent`(`:328`).
  - `ProjectScreen`의 알림 자리: 폴더 출처 오류는 카드 아래 자리(지금 끌어 놓기 알림 `:533`), URL 출처는 URL 칸 뒤(`:560`). `access_failed`의 두 버튼(`:545-548`)은 `sm`.
  - Find repository(`:561`)는 `sm`. Choose folder(`LocalFolderCard`, `:392`)도 `sm`.
  - 설정 패널의 카드 안 제출(`:591`)은 페이지에서 그리지 않는다. 첫 실행에서는 그대로 둔다. 페이지에서는 `Footer`(`:336-340`)의 주 버튼이 `data-consent`와, Keep out of Git일 때 `aria-describedby={GIT_INIT_ID}`(`:269`, `:589`)를 갖는다.
  - `projectFocusNode`(`:410-424`): 시트를 연 버튼으로 돌아가는 분기에 `state.error === null` 조건을 더한다. 알림 안 버튼이 연 시트를 취소했을 때의 돌아갈 곳(spec 정한 점 8).
- `app/src/renderer/styles.css`: `.ob-recovery`, `.ob-url-action`, 알림 아래의 `.ob-state-actions`·`submit-only` 규칙 중 고아가 되는 것을 지운다. 쌓는 배치는 디자인 시스템 알림에 둔다.
- `app/src/renderer/ds/surfaces.css`: `.doan-notice`에 쌓는 배치(동작 줄의 block 여백 0, 문장과의 간격 `--space-2`). 한 줄 배치(`:208`)는 그대로.

## 순수 함수로 뺄 것(`/tdd` 대상)

1. `projectFooter(use, state, …)`: 페이지 단계별 주 버튼(라벨 하나, `action`, `disabled`), 잠긴 동안 `null`, 첫 실행 분기 불변.
2. 오류 출처: `failed()`가 정하는 `source`와, 화면이 알림을 어디에 둘지 고르는 함수(카드 아래 / URL 뒤 / 단계 화면).
3. 끌어 놓기 알림과 폴더 오류의 자리 공유 규칙.
4. `projectNotice`(`Onboarding.tsx:278-318`)의 동작 목록과 배치(한 줄 / 쌓기), 버튼 무게.
5. `projectFocusNode`의 새 조건.
6. 후보 → 설정 패널 → 동의의 두 번 누름 전이, 페이지에서 설정된 폴더를 바로 추가하지 않는 전이.

## 세부 규칙

- **동의 토큰**: 페이지의 "Add project"가 설정 단계에서 부르는 `setUp`은 렌더할 때 본 `inspectionId`를 싣는다. 누를 때 상태를 다시 읽지 않는다. 그래야 다시 계획된 새 계획에 동의하지 않는다(ARCHITECTURE §7 'Settings IPC', `ARCHITECTURE.md:352`).
- **자동 포커스**: `data-consent`가 있는 버튼에는 자동 포커스가 가지 않는 규칙(`recoveryControl`, `Onboarding.tsx:165`)이 "Add project"에도 적용된다.
- **바뀌는 포커스**: 오류가 있으면 시트를 연 버튼이 아니라 알림으로 간다. 해당하는 흐름은 Choose folder, Change(클론 위치), URL 화면의 Choose existing folder, 저장 방식 라디오로 다시 계획한 경우의 실패다. 클론 취소 알림(`role=status`)은 지금처럼 첫 사용 가능한 조작으로 가고, 끌어 놓기 알림은 받지 않는다.
- **"Add project"를 누른 뒤**: 설정이면 진행 줄(페이지 잠김, 하단 줄 없음), 실패하면 알림. 클론이면 진행 줄, 취소되면 첫 사용 가능한 조작.

## 형식 변경

- 없다. IPC, JSON Schema, fixture, CLI 출력이 바뀌지 않는다.

## 규약 영향

- 없다.

## 결정 영향(승격 대상)

- PRODUCT §5 item 0 'Project step'(`PRODUCT.md:138`): 알림 자리, 알림 안 동작, 버튼 크기.
- PRODUCT §5 item 0 'Doan files'(`:183`): 페이지에서 동의 버튼은 "Add project"이고 `git init` 줄이 그 설명이다.
- PRODUCT §5 item 1 'Add Projects'(`:213`): 하단 "Add project" 하나, 켜지는 때, 설정이 필요한 후보의 두 번 누름, "A set-up repository is added at once"를 페이지에서 바꿈.
- PRODUCT 'Leaving'(`:214`): 바뀌지 않는다(잠긴 동안 하단 줄 없음).
- ARCHITECTURE §7 'Settings IPC'(`:352`): 페이지 하단 주 버튼이 그 화면이 렌더한 inspection의 동의 토큰을 싣는다는 문장.
- DESIGN.md 'Notices'(`:160-169`): "Only a thread notice differs"와 정렬 문장에 쌓는 배치를 더한다.

## DESIGN.md에서 다시 잴 값

- 'Onboarding': 'Project choose'(Find repository 크기, `:315`), 'Repository access error'(`:318`, 40 높이 전폭 줄이 알림 안으로), 'Cancelled and failed clone'(`:338`), 'A notice's actions are never repeated'(`:343`, 규칙은 유지, 모양 변경), Reference 문단(출시 초안이 더는 코드와 맞지 않음).
- 'Add Projects page': 'Column'(`:501`, "…the last card and Use this folder"), 'Drop notices'(`:503`, 자리 공유), 'Choose another folder under a local setup'(`:515`).
- 설정 패널: 'Setup panel line'(`:1455`, 설명 대상이 "Add project"로), "First run's button label… 'Set up and add'"(`:1467`).

## PoC 의존

- 없다. 알림 안 버튼과 동의 토큰은 출시된 패턴이다.

## POSTMORTEM

- **2026-10-24 'The onboarding wizard lost keys and clicks to focus and modal stacking'**: 버튼이 스스로 비활성이 될 때 포커스가 안에 남는다고 가정하지 않는다. "Add project"를 누르면 하단 줄이 사라지므로(잠김) 포커스는 진행 줄로 간다.
- **2026-10-25 'An unreadable add pick was offered for set-up as a folder without repos'**: 출처 판단은 오류 코드가 아니라 부른 쪽에서 정한다(위 '오류 출처').
