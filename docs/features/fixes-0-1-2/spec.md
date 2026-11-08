# fixes-0-1-2 — spec

0.1.2에 넣을 작은 수정 여섯 건을 한 feature로 묶는다. 사용자 결정(2026-11-08): "6개 묶어서 feature로. 배치로 묶을 수 있는건 한 feature로." 정식 사본에서 정식 사본으로의 자동 업데이트(0.1.1 사본 → 0.1.2)는 이 feature가 아니라 0.1.2 릴리스 단계에서 확인한다.

## 사용자

- **사람**: Settings > About의 업데이트 행, 헤더의 Restart to Update 팝오버, 프로젝트 문제 상태(CLI error, Config error)를 보여 주는 모든 곳, 텍스트 편집 메뉴의 Look Up 항목에서 달라진다.
- **에이전트**: `context`, `shape`, `generate`, `audit` 프리셋 본문을 따라 일하는 에이전트가 Onboarding 셋업에서 token CSS를 묻지 않고, `audit`가 `doan check`의 규칙 범주를 빠짐없이 안다.
- **메인테이너**: 부하가 걸린 전체 테스트에서 가끔 실패하던 테스트 두 개가 안정된다.

## 문제 (BACKLOG에서 가져온다)

1. **Release Notes ↗가 실패해도 아무 일도 없다.** main이 릴리스 페이지를 열지 못하면(`openReleaseNotes`가 false나 거부) 화면에 아무것도 나타나지 않는다(BACKLOG 'Known defects', `app/src/renderer/SettingsAbout.tsx:143`).
2. **헤더 업데이트 팝오버가 연 순간의 문구에 머문다.** 턴이 끝나도 "Can’t restart yet"가 팝오버를 닫을 때까지 남고, 멈춘 재시작의 팝오버는 막힘 이유로 바뀌지 않는다. 두 팝오버(Agent usage와 업데이트)가 함께 열려 있을 때 하나를 닫으면 헤더의 `-webkit-app-region: no-drag`가 지워져, 열린 다른 팝오버 위를 누르면 창이 끌린다(BACKLOG 'Known defects', `app/src/renderer/UpdateHeaderButton.tsx`).
3. **CLI error가 이유를 보여 주지 않는다.** "The doan command failed while reading it."만 있고 명령이 낸 메시지는 어디에도 없다. Config error의 Show in Finder는 프로젝트 폴더를 여는데 macOS는 `.doan/`을 숨기므로 고칠 파일이 보이지 않는다. 이 항목은 BACKLOG 'Undecided' 첫 항목으로 "결정 없음"이었고, 이 feature에서 결정한다(사용자, 2026-11-08): CLI error는 CLI 메시지를 Details로 보여 주고, Config error의 Show in Finder는 `.doan/config.json`을 선택해 보여 준다. PRODUCT §5 item 3 'Problem states'로 승격한다.
4. **Look Up 항목 이름에 칩의 화면 낭독기 전용 글이 섞인다**(`Look Up “Look atFrame Second frame…”`, BACKLOG 'Known defects', `app/src/main/editMenu.ts` `lookUpLabel`).
5. **테스트 두 개가 부하에서 가끔 실패한다**: `app/src/main/thumbnails.test.ts`의 "the walk limit counts empty directories"와 `f.changed` 대기, `app/src/renderer/quickOpen.test.ts`의 50 ms 성능 테스트(BACKLOG 'Known defects').
6. **프리셋이 가이드·PRODUCT와 어긋난다.** `context`, `shape`, `generate`는 셋업 때 token CSS 경로를 먼저 물으라고 한다. 그런데 Onboarding 셋업 경로(PRODUCT §5 item 0, 가이드 'Onboarding')는 묻지 않는다. 사람이 `doan init`을 지목했을 때만 묻는다(가이드 Commands, PRODUCT CLI item 8). `audit`의 `doan check` 설명은 실제 규칙보다 좁다(BACKLOG 'Known defects', `cli/internal/designskill/presets/`).

## 완료 조건

1. Release Notes ↗가 실패하면 About 업데이트 행 아래에 실패 줄이 나타나고 화면 낭독기가 한 번 읽는다. 포커스는 Release Notes ↗에 남는다. 다음 시도가 성공하거나 업데이트 상태 종류·버전이 바뀌면 사라진다. 별도 버튼은 없다. 초안 문구: "Couldn’t open the release notes in your browser. Try again, or find Doan <version> on GitHub Releases."
2. 헤더 팝오버가 열린 동안 막힘 상태가 바뀌면 문구가 따른다. 막힘이 풀리면 팝오버는 열린 채 다시 시작할 수 있다는 문구(초안: "Ready to restart" / "The conversation finished. Restart now, or Doan updates when you quit.")를 보이고, 멈춘 재시작이 막히면 막힘 이유를 보인다. 바뀐 문구는 화면 낭독기가 한 번 읽고 포커스는 옮기지 않는다. 열린 팝오버가 하나라도 있으면 헤더의 no-drag가 유지된다(닫는 순서, 열린 채 버튼이 사라지는 경우 포함).
3. CLI error는 Config error가 Details를 보여 주는 모든 곳(문제 화면, Home 카드, 사이드바 프로젝트 메뉴, Overview 복구 메뉴, Project Settings)에서 Details로 CLI 메시지를 보여 준다. 메시지는 비지 않는다. CLI가 메시지를 내지 않으면 실행 실패의 짧은 설명이 들어간다. Config error인 프로젝트의 Show in Finder는 어디서 누르든 `.doan/config.json`을 Finder에서 선택해 보여 주고, 파일이 없으면 지금처럼 프로젝트 폴더를 연다(숨김 파일 표시를 끈 Finder에서 확인한다).
4. Look Up 항목 이름에는 화면에 보이는 글만 들어간다(칩은 보이는 이름). 사전 창이 찾는 글도 같은지 PoC에서 확인하고, 다르면 그것도 맞춘다.
5. 두 테스트가 같은 것을 재면서 부하에 흔들리지 않는다. 고치기 전에 부하 실패를 재현하고, 같은 부하에서 고친 뒤 연속 3번 통과한다(tasks T7).
6. 네 프리셋이 위 셋업 규칙을 따르고 `audit`가 `doan check`의 규칙 범주를 빠짐없이 말한다. `/agent-eval`(D1, D8, D9, D11d, D12, Claude Code·Codex)에서 직전 라운드보다 나빠진 시나리오가 없다(tasks T10의 정의).
- PRODUCT §5 item 0 'Updates'(Release Notes 실패 줄), item 3 'Problem states'(CLI error Details, Show in Finder 대상), 'Text edit menu'(Look Up 이름)와 ARCHITECTURE, DESIGN이 바뀐 동작을 말하고, 해당 BACKLOG 항목은 지워지거나 남은 부분만 남는다.
- `node .agents/skills/verify/scripts/verify.mjs --eval` 통과.

## 비목표

- About 자동 확인 스위치의 pending 상태, 메뉴나 About에서 시작한 재시작 팝오버의 포커스(BACKLOG 같은 항목의 나머지).
- Details에 보이는 CLI 메시지의 선택·복사(BACKLOG에 새 항목으로 남긴다).
- CLI error·Config error의 다른 복구 동작, Set Up 실패(`InitOutcome`)의 화면.
- 다른 플래키 테스트, 성능 개선 자체.
- 다른 프리셋의 본문 수정.
