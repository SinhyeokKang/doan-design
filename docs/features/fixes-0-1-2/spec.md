# fixes-0-1-2 — spec

0.1.2에 넣을 작은 수정 여섯 건을 한 feature로 묶는다. 사용자 결정(2026-11-08): "6개 묶어서 feature로. 배치로 묶을 수 있는건 한 feature로." 0.1.2는 정식 사본에서 정식 사본으로의 자동 업데이트를 처음 실제로 확인하는 릴리스이기도 하다(0.1.1 사본 → 0.1.2).

## 사용자

- **사람**: Settings > About의 업데이트 행, 헤더의 Restart to Update 팝오버, 프로젝트 문제 화면(Config error, CLI error), 텍스트 편집 메뉴의 Look Up 항목에서 달라진다.
- **에이전트**: `context`, `shape`, `generate`, `audit` 프리셋 본문을 따라 일하는 에이전트가 셋업 때 token CSS를 묻지 않고, `audit`가 `doan check`의 전체 규칙을 안다.
- **메인테이너**: 부하가 걸린 전체 테스트에서 가끔 실패하던 테스트 두 개가 안정된다.

## 문제 (BACKLOG에서 가져온다)

1. **Release Notes ↗가 실패해도 아무 일도 없다.** main이 릴리스 페이지를 열지 못하면(`openReleaseNotes`가 false) 화면에 아무것도 나타나지 않는다(BACKLOG 'Known defects', `app/src/renderer/SettingsAbout.tsx:143`).
2. **헤더 업데이트 팝오버가 연 순간의 문구에 머문다.** 턴이 끝나도 "Can’t restart yet"가 팝오버를 닫을 때까지 남고, 멈춘 재시작의 팝오버는 막힘 이유로 바뀌지 않는다. 두 팝오버(Agent usage와 업데이트)가 함께 열려 있을 때 하나를 닫으면 헤더의 `-webkit-app-region: no-drag`가 지워져, 열린 다른 팝오버 위를 누르면 창이 끌린다(BACKLOG 'Known defects', `UpdateHeaderButton.tsx`).
3. **CLI error 화면이 이유를 보여 주지 않는다.** "The doan command failed while reading it."만 있고 명령이 낸 메시지는 어디에도 없다. Config error의 Show in Finder는 프로젝트 폴더를 여는데 macOS는 `.doan/`을 숨기므로 고칠 파일이 보이지 않는다(BACKLOG 'Undecided' 첫 항목, `app/src/renderer/problemView.ts`).
4. **Look Up 항목 이름에 칩의 화면 낭독기 전용 글이 섞인다**(`Look Up “Look atFrame Second frame…”`, BACKLOG 'Known defects', `app/src/main/editMenu.ts` `lookUpLabel`).
5. **테스트 두 개가 부하에서 가끔 실패한다**: `app/src/main/thumbnails.test.ts`의 "the walk limit counts empty directories"와 `f.changed` 대기, `app/src/renderer/quickOpen.test.ts`의 50 ms 성능 테스트(BACKLOG 'Known defects').
6. **프리셋이 가이드·PRODUCT와 어긋난다.** `context`, `shape`, `generate`는 셋업 때 token CSS 경로를 먼저 물으라고 하고(PRODUCT §5 item 0과 가이드는 묻지 않는다), `audit`의 `doan check` 설명은 실제 규칙보다 좁다(BACKLOG 'Known defects', `cli/internal/designskill/presets/`).

## 완료 조건

1. Release Notes ↗가 실패하면 About의 업데이트 행 아래에 실패를 알리는 한 줄이 나타나고, 다음 시도에 성공하면 사라진다. 문구는 초안에서 확정한다.
2. 헤더 팝오버가 열린 동안 막힘 상태가 바뀌면 문구가 그 상태를 따른다(막힘이 풀리면 막힘 문구가 사라지고, 멈춘 재시작이 막히면 막힘 이유를 보인다). 팝오버 둘 중 하나를 닫아도 다른 하나가 열려 있으면 헤더의 no-drag가 유지된다.
3. CLI error 화면에 Details가 생겨 CLI가 낸 메시지를 보여 준다(Config error의 Details와 같은 방식). Config error의 Show in Finder는 `.doan/config.json`을 Finder에서 선택한 상태로 보여 준다.
4. Look Up 항목 이름에는 화면에 보이는 글만 들어간다. 칩은 화면에 보이는 이름으로 들어간다.
5. 두 테스트가 시간이나 순서에 기대지 않고 같은 것을 잰다. `npm --prefix app test`를 다른 무거운 작업과 함께 연속 3번 돌려도 통과한다.
6. 네 프리셋이 PRODUCT §5 item 0과 가이드의 셋업 규칙을 따르고 `audit`가 `doan check`의 규칙을 빠짐없이 말한다. 프리셋을 쓰는 시나리오로 `/agent-eval`을 돌려 직전 라운드보다 나빠지지 않는다.
- 해당 BACKLOG 항목은 지워지고, PRODUCT·ARCHITECTURE·DESIGN이 바뀐 동작을 말한다.
- `node .agents/skills/verify/scripts/verify.mjs --eval` 통과.

## 비목표

- About 자동 확인 스위치의 pending 상태, 메뉴나 About에서 시작한 재시작 팝오버의 포커스(BACKLOG 같은 항목의 나머지).
- CLI error의 Details 말고 다른 복구 동작, Config error의 다른 동작.
- 다른 플래키 테스트, 성능 개선 자체.
- 다른 프리셋의 본문 수정.
