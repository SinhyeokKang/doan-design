# fixes-0-1-2 — design

여섯 건은 서로 코드가 겹치지 않아 배치로 나눈다. UI가 바뀌는 1·2·3은 `/design-draft`로 초안을 그린다(`.doan/canvases/fixes-0-1-2.html`).

## 1. Release Notes 실패 줄 (앱, renderer)

- `SettingsAbout.tsx`의 Release Notes 처리에서 `openReleaseNotes()`가 false이거나 거부되면 About 업데이트 행 아래 이유 줄 자리(`.update-reason-*`, DESIGN 'App updates' 'Lines under the row')에 실패 줄을 띄운다. 새 시도가 성공하거나 업데이트 상태가 바뀌면 지운다.
- 상태는 renderer 지역 상태다. main과 IPC는 바뀌지 않는다(`update:openNotes`는 이미 boolean을 돌려준다).
- 문구는 Doan clarify 프리셋으로 쓰고 초안에서 확정한다. 기존 실패 줄의 말투(About의 다른 이유 줄)를 따른다.

## 2. 헤더 업데이트 팝오버 (앱, renderer)

- `UpdateHeaderButton.tsx`는 팝오버를 연 순간의 문구를 고정한다. 문구를 스냅샷(`gate`, `state`)에서 매번 계산하도록 바꾼다. 막힘이 풀리면 막힘 문구가 사라지고(팝오버는 열린 채 지금 상태를 말한다), 멈춘 재시작이 막히면 막힘 이유로 바뀐다. 변하는 문구는 기존 live region 규칙을 따른다.
- 헤더의 inline `-webkit-app-region: no-drag`는 지금 두 팝오버가 각자 켜고 끈다. 열린 팝오버 수를 세는 한 곳(예: 헤더가 가진 카운터나 훅)으로 모아 마지막 팝오버가 닫힐 때만 지운다.
- 순수 함수: 스냅샷 → 팝오버 문구(`update/view.ts` 계열), no-drag 카운터.

## 3. 문제 화면 (앱, main + renderer)

- `main/folderState.ts`의 `cliError`는 지금 `reason`만 가진다. CLI 봉투의 `error.message`(있으면)와 실행 실패(spawn 오류, 시간 초과, 종료 코드)의 짧은 설명을 `message`로 담는다. 메시지는 데이터로만 다루고 HTML로 그리지 않는다(ARCHITECTURE §3 'Untrusted text').
- `problemView.ts`의 `cliError` 장면에 Config error와 같은 `details` 동작을 더하고, App의 Details 처리가 `cliError`의 `message`도 보여 주게 한다. 버튼 순서는 Retry, Details, Remove로 초안에서 정한다.
- Config error의 Show in Finder는 `revealProject(root)` 대신 `.doan/config.json`을 Finder에서 선택해 보여 준다(`shell.showItemInFolder`). 파일이 없으면 지금처럼 프로젝트 폴더를 연다. main의 새 IPC는 `senderAllowed`의 기존 규칙과 root 검사(설정 파일은 등록된 root 안에서만)를 따른다.
- 순수 함수: CLI 실행 결과 → `cliError` message, `problemView`의 장면과 동작.

## 4. Look Up 이름 (앱, main + renderer)

- Electron의 `context-menu` `selectionText`는 칩의 `sr-only` 글을 포함한다. 칩 필드(`data-chip-field`)에서 메뉴가 열릴 때 renderer가 화면에 보이는 선택 글(칩은 보이는 이름, `sr-only` 제외)을 main에 넘기고, `lookUpLabel`은 그 글을 쓴다. 칩 필드가 아니면 지금처럼 `selectionText`를 쓴다.
- Look Up 동작 자체(macOS 사전 창)는 바꾸지 않는다. 이름만 바뀐다.
- 순수 함수: 선택 범위의 DOM 조각 → 보이는 글.

## 5. 테스트 두 개 (앱 테스트)

- `thumbnails.test.ts`: walk 한도 테스트와 `f.changed` 대기가 시간(타이머·짧은 대기)에 기대는 부분을 찾아 사건(호출된 경로, 완료 신호)을 기다리게 바꾼다. 테스트가 재는 것은 바꾸지 않는다.
- `quickOpen.test.ts`의 50 ms 테스트: 시간 대신 일의 양(비교 횟수 같은 셀 수 있는 값)을 재거나, 시간 한도를 남기되 여러 번 재서 가장 빠른 값으로 판단한다. 제품 목표(1000 캔버스 × 50 frame을 빠르게)는 그대로 지킨다.

## 6. 프리셋 (CLI 내장 지침, `/agent-eval` 대상)

- `cli/internal/designskill/presets/context.md`, `shape.md`, `generate.md`: "token CSS를 먼저 묻는다"를 "Doan 가이드의 Onboarding 절대로 셋업한다(token CSS를 묻지 않고, 사람이 말한 경로는 넘긴다)"로 바꾼다(r3 doc-check 근거 문안: `.scratch/doc-check/261108/r3-skills-b-guide.md` F1).
- `audit.md`: `doan check` 설명을 실제 규칙(구현 경로, 링크·서빙 CSS, 토큰, 직접 색, viewport 높이 단위, 외부 리소스)으로 넓힌다.
- `notices/MODIFICATIONS.md`에 적고, 프리셋 본문을 담은 fixture(`schema/fixtures/cli-envelope/design-skill/`)를 다시 만든다. 출력 예산 테스트(`skillOutputBudget`, 프리셋 크기)를 통과해야 한다.
- `/agent-eval`: 프리셋을 쓰는 시나리오(D10g, D10h, D11d, D11e, D13 등 `eval/scenarios/`에서 확인)를 Claude Code와 Codex로 돌린다.

## 결정

- **D1. 실패 줄은 About에만 둔다.** 헤더 팝오버에는 Release Notes가 없다(DESIGN 'App updates').
- **D2. CLI error의 메시지는 Details로 접어 둔다.** Config error와 같은 모양이라 새 패턴이 없다. 메시지가 길거나 기술적이어서 기본으로 펼치지 않는다.
- **D3. Show in Finder는 config 파일을 선택해 보여 준다.** 사람이 고칠 파일이 그것이다. 파일이 없으면 폴더를 연다.
- **D4. 여섯 건을 한 PR로 낸다.** 0.1.2의 내용이 이것뿐이고 서로 겹치지 않는다.

## 형식·규약·결정 영향

- 형식 변경 없음(`ls` 결과, 소켓, 스키마 그대로). 앱 내부 `FolderState`의 `cliError`에 필드가 하나 는다.
- ARCHITECTURE §1·`doan check` 규칙 변경 없음. 가이드(`skill.md`) 변경 없음, 프리셋 본문만 바뀐다.

## POSTMORTEM에서 가져올 함정

- 2026-10-29 "Codex cut the middle out of the doan guide": 프리셋 본문을 바꾸면 출력 예산과 끝 표시를 다시 본다.
- 2026-11-08(remove-comments) 문맥의 eval 기록: 프리셋 시나리오 재측정은 패키지된 CLI로 한다.
- `rg -n 'thumbnails|quickOpen|waitFor' docs/POSTMORTEM.md`로 이 테스트들의 이전 함정을 구현 전에 확인한다.

## PoC 의존

- 4: renderer가 메뉴가 열리기 전에 보이는 선택 글을 main에 넘길 수 있는지(현재 칩 필드 메뉴 흐름이 renderer를 거치는지)는 구현 첫 단계에서 확인한다. 안 되면 main에서 `selectionText`의 sr-only 부분을 지울 수 있는 다른 신호를 찾는다.
