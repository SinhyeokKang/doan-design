# fixes-0-1-2 — tasks

`/orchestrate`로 구현한다. 배치 B1(업데이트 화면: 1·2) ∥ B2(문제 상태: 3) ∥ B4(테스트: 5) ∥ B5(프리셋: 6), B3(Look Up: 4)는 (b)면 병렬, (a)면 B2 뒤(design '배치와 파일'). 각 배치는 `/tdd` → 구현 → `/code-review` → 필요하면 `/refactor` 순서다. 초안 `.doan/canvases/fixes-0-1-2.html`을 사용자가 앱에서 확정한 뒤 시작한다.

## 0. 초안

- [ ] T0. `/design-draft`: 1(About 실패 줄과 다른 줄이 함께 있을 때의 순서), 2(팝오버: 막힘 → 풀림 "Ready to restart", 멈춤 → 막힘), 3(CLI error Details 접힘·펼침, 긴 메시지, Retry 중; Home 카드와 Project Settings의 Details)을 그린다. 독립 리뷰를 거친 뒤 사용자가 앱에서 확정한다.
  - 검증: `doan check --json`의 finding이 그리기 전과 같다(새 오류 없음).

── commit: `docs(design): fixes-0-1-2 draft` ──

## B1. 업데이트 화면

- [ ] T1. `/tdd`:
  - `header()`: 팝오버가 열린 동안 막힘 해제 → "Ready to restart" 문구, 멈춘 재시작 → 막힘 이유, 상태가 failed·none이면 팝오버 없음.
  - no-drag 카운터: A 닫고 B 닫기, B 닫고 A 닫기, 마지막 닫기에서만 해제, 열린 채 unmount되면 감소, 같은 팝오버 open 중복은 한 번.
  - About 실패 줄: false와 거부 둘 다 나타남, 연속 실패에 다시 읽힘, 다음 성공이나 `kind`·`version` 변화에 사라짐, 게이트·진행률 push로는 그대로, 늦게 끝난 앞 요청이 뒤 결과를 덮지 않음.
  - 검증: `npm --prefix app test`가 새 사례에서만 실패한다.
- [ ] T2. 구현하고 `/design-sync`로 초안과 맞춘다.
  - 검증: `npm --prefix app run typecheck`, `npm --prefix app run lint`, `npm --prefix app test` 통과.

## B2. 문제 상태

- [ ] T3. `/tdd`:
  - CLI 실행 결과 → `reason`: 봉투에 메시지 없음, JSON이 아닌 stdout, stderr만 있음, stderr도 없음, spawn 오류, 시간 초과, 종료 코드 — 모두 비지 않은 문장.
  - `problemView`의 `cliError`에 `details`와 `detail`. Home 카드·Overview 복구 메뉴·Project Settings·사이드바 메뉴의 `cliError` Details.
  - 긴 메시지, 여러 줄, 제어 문자·ANSI·HTML이 글자로만 그려진다.
  - `folders:reveal`: `error` 항목이면 `.doan/config.json` 선택, 파일이 없으면 폴더, `.doan/`이 없으면 폴더, 다른 종류면 폴더, renderer는 root만 넘김(경로를 받지 않음).
  - 검증: `npm --prefix app test`가 새 사례에서만 실패한다.
- [ ] T4. 구현하고 `/design-sync`.
  - 검증: typecheck, lint, test 통과.

## B3. Look Up

- [ ] T5. PoC(design 4): (b) 먼저, 안 되면 (a). 사전 창이 찾는 글도 확인한다. 결과(쓴 방식, 사전 창 글)를 design 4에 한 줄 적는다.
  - 검증: design 4에 결과 줄이 있다.
- [ ] T6. `/tdd`: 칩만, 칩+글, 여러 줄에 걸친 선택(블록 경계 공백), 칩 필드가 아닌 곳(`selectionText` 그대로), canvas iframe(지금대로). 검증: 새 사례에서만 실패.
- [ ] T7a. 구현. 검증: typecheck, lint, test 통과.

## B4. 테스트

- [ ] T7. 고치기 전에 같은 checkout에서 `npm --prefix app test`를 4개 동시에 돌려 두 테스트의 실패를 재현하고(재현 못 하면 횟수를 기록), design 5대로 고친 뒤 같은 부하로 연속 3번 통과를 확인한다. 두 테스트에 절대 시간 한도나 기본 1 s 대기가 남지 않았는지 코드를 확인한다.
  - 검증: 재현 기록과 3번 통과 기록(명령은 AGENTS 'Commands'의 `npm --prefix app test`를 병렬로 실행).

## B5. 프리셋

- [ ] T8. 네 프리셋 본문(design 6의 문안), 필요하면 `MODIFICATIONS.md` 한 줄.
  - 검증: `go test ./...`(출력 예산, `TestFixturesMatchCatalog`)와 `npm --prefix app test`의 `designSkills.test.ts` 통과. 세 프리셋에 "token CSS path first"가 없고, `audit.md`의 설명에 design 6의 범주 여섯 개와 "finding의 `code`"가 모두 있다(command undecided — 리뷰어가 파일을 읽어 확인한다).

── commit: 배치마다 `fix(app): …` / `fix(skill): presets follow the setup rule` ──

## 마무리 (conductor)

- [ ] T9. `/runtime-test`(격리된 앱):
  - Release Notes 실패 줄: main의 `update:openNotes`가 false를 돌려주는 probe 패치로 확인한다. 스크린샷과 낭독 텍스트.
  - 팝오버 문구 변화(막힘 → 풀림)와 no-drag: 두 팝오버를 연 뒤 하나를 닫고 헤더의 computed `-webkit-app-region`을 읽는다.
  - CLI error Details(문제 화면과 Home 카드), Config error Show in Finder: `shell.showItemInFolder`에 넘어간 경로와, 숨김 파일 표시를 끈 Finder 스크린샷.
  - 칩 필드 Look Up: 메뉴 template의 label.
  - 검증: 위 기록.
- [ ] T10. `/postmortem`: 여섯 건 가운데 회귀·함정으로 남길 것(특히 테스트 두 개의 원인, no-drag 공유)을 기록한다.
- [ ] T11. `node .agents/skills/verify/scripts/verify.mjs --eval` 통과 뒤 `npm --prefix app run package`, `/agent-eval --scenarios D1,D8,D9,D11d,D12`(Claude Code·Codex, `--repeat 2`)을 feat 브랜치에서 돌려 USABILITY-EVAL에 기록한다. 비교 기준은 D1·D8·D9·D12는 `rc-full-261108`, D11d는 `rc-fix-presets-261108`. "나빠지지 않음"은 시나리오·에이전트별 결과가 pass에서 partial·fail로 내려가지 않는 것이다(판정만 바뀐 partial은 따로 적는다).
  - 검증: USABILITY-EVAL에 이 브랜치의 라운드 행이 있고 내려간 결과가 없다.
- [ ] T12. 결론 승격:
  - PRODUCT §5 item 0 'Updates', item 3 'Problem states', 'Text edit menu'.
  - ARCHITECTURE §7(App updates, 팝오버, problem states, 텍스트 편집 메뉴), §13(Show in Finder 근거)과 `main/index.ts` 주석.
  - DESIGN: 'App updates'의 "Release Notes ↗ that main could not open shows nothing." 삭제, 'Projects home' Actions 표의 CLI error 버튼 목록, 측정값.
  - BACKLOG: 여섯 항목 삭제, 같은 항목의 남은 부분(스위치 pending, 메뉴·About 재시작 팝오버 포커스)만 남김, "Details의 CLI 메시지 선택·복사" 새 항목.
- [ ] T13. 이 디렉터리를 지우고 PR을 연다(마지막 커밋).

── commit: `docs(feature): remove fixes-0-1-2` ──
