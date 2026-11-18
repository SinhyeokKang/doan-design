# 코드베이스 감사 — 2026-11-19 (audit-loop 2라운드)

- 실행일: 2026-11-19
- 기준: `develop` HEAD `31a7a1b92`(1라운드 PR #275~#290 merge 직후). 작업 트리는 clean이고 develop push CI는 green이다.
- 범위: 코드베이스 전체. 1라운드 PR이 바꾼 파일 181개를 먼저, 가장 깊게 봤다. 그 뒤로 바뀌지 않은 파일은 1라운드 coverage를 이어받았고, 2026-11-18 이후 새로 생긴 postmortem 규칙만 다시 적용했다.
- 완료 상태: **정적 감사 완료**. 1차 wave는 4관점 리뷰어 4개였고, 2차 wave는 partial로 남은 셀을 맡은 리뷰어 1개였다.
- 보안 관련 finding은 이 report에 싣지 않는다. 같은 날 `/sec-audit` 2회차에서 로컬 report로 따로 다룬다(`/sec-audit` 'Disclosure').
- 원자료: `.scratch/audit/261119/` (`r2-p1~p4-*.md`, `r2-w2-coverage.md`)

## 미검토 영역과 실행 한계

- 테스트·빌드·앱은 실행하지 않았다.
- 실행 확인이 필요한 항목:
  - R2-06, R2-07의 타이밍 경합
  - R2-12의 대소문자·NFD 경로
  - R2-01~R2-04의 비활성 창 focus
  - R2-09의 원인 메커니즘

## 1라운드 수정 확인

| 판정 | finding |
|---|---|
| 닫힘 | R1-01, 03, 05, 06, 10(일부), 11, 12(일부), 13, 14, 15~26, 28, 33(코드상), 34, 37, 38, 39, 40 |
| 불완전 | R1-02 실행 직후 경로(R2-07), R1-04 계열 새 위치 3곳(R2-01~R2-04), R1-10 정리 경합(R2-06), R1-12 목록 null(R2-08), R1-31 judge home(R2-17), R1-32 나머지(R2-16) |

## Findings

### Medium

**R2-01 — 비활성 창에서 App `focusCurrent`가 focus를 바로 옮긴다** (w2 W2-03)
- 터미널 agent가 CLI로 first run을 끝내면 Home composer나 `focusCurrent`로 focus가 넘어간다(`App.tsx:661-669`). 바깥 변경으로 닫히는 dialog(Set Up, 제거 확인, Move to Trash)와 백그라운드에서 만료되는 toast도 같은 경로를 탄다.
- 이 흐름은 PRODUCT line 136에 문서화돼 있고, 이때 Doan은 설계상 비활성이다(ARCHITECTURE line 369).
- 기준: POSTMORTEM 2026-11-17 activation focus 규칙.
- 수정: `focusCurrent`를 `focusThroughActivation`으로 감싼다.

**R2-02 — 첫 실행 Onboarding의 로그인 뒤 focus 넘기기에 activation guard가 없다** (p3 P3-04)
- `Onboarding.tsx:203-220`이 Settings > Agents에서 고친 것과 같은 구조다.

**R2-09 — real-DOM suite가 CI에서 반복해서 실패한다** (p3 P3-01·02·03, p4 P4-R2-01)
- (a) Electron 종료가 5초를 넘으면, SIGKILL로 종료를 확인하고 폴더까지 지운 뒤에도 suite를 실패시킨다(`electronDom.ts:22, 52-65`, `harness.ts:32-47`). CI run 44312922401에서는 테스트 4,281개가 모두 통과했는데 이것 하나로 실패했다.
- (b) `exportViewer.test.ts:1933`이 상한 없는 poll에서 20초 동안 멈춘다. CI 두 번(44254835901, 44369336689)에서 재현됐다. frame이 goto 메시지보다 먼저 navigate하는 경합으로 추정한다.
- (c) 테스트 한도 20초가 단계별 대기(15초씩)의 합보다 짧다.
- 주석은 "파일당 한 번 launch"라고 하지만 실제 launch는 6번이다.
- 수정:
  - 종료가 확인되면 경고만 남긴다. `CLOSE_MS`는 약 12초로 한다.
  - poll을 `bounded`로 감싸고, 경합이 허용하는 결과만 assert한다.
  - real-DOM `describe`에 60초 한도를 준다.
  - 파일당 launch는 1회로 줄인다.

### Low

| id | 내용 | 근거 | 출처 |
|---|---|---|---|
| R2-03 | ProjectSettingsPage의 `shape` 재그리기 복구와 확인 취소 시 `focusTitle`이 비활성 창에서 focus를 옮긴다 | `ProjectSettingsPage.tsx:286-297` | w2 W2-04 |
| R2-04 | `ListRetryButton`과 `ComposerParts`의 Retry 뒤 focus 복구가 activation 경로를 거치지 않는다 | | p4 P4-R2-06 |
| R2-05 | 앱 대화 안에서 실행한 `doan remove`·`doan onboarding`이 "앱이 꺼져 있음"으로 보고된다. ARCHITECTURE §4 v7(line 304)과 `cliRemove.ts`·`remove_rules.go`·`onboarding.go` 주석은 이전 동작을 쓴다 | | p1 P1R2-01 |
| R2-06 | timeout된 inspector 읽기가 정리할 때 `started === ticket`을 한 번만 확인한다. `CSS.disable`을 기다리는 사이 시작한 다음 읽기를 `DOM.disable`이 끌 수 있다 | `inspector.ts:168-170` | p3 P3-05 |
| R2-07 | 실행 직후 사라진 worktree의 `rootsLeft`가 draft store가 만들어지기 전에 돌아 `discardRootStarts`를 건너뛸 수 있다 | `index.ts:1275` | p3 P3-06 |
| R2-08 | `withoutUnlisted`가 대화 목록이 null(로딩 중이거나 실패)일 때 id 없는 행의 기억을 지운다 | `uiState.ts`, ARCHITECTURE §7 line 511 | w2 W2-06 |
| R2-10 | real-state `USER_DATA`에 `conversation-runtime.json`이 빠졌다. 완전성 테스트가 상수로 조합한 이름을 잡지 못한다 | `app/runtime/real-state.ts` | p1, p2 |
| R2-11 | `index.test.ts`가 `index.ts`를 import할 때 실제 `/bin/launchctl getenv`를 실행해 test worker의 CA를 바꾼다 | | p2 B-9 |
| R2-12 | `workTarget`이 root를 바이트로 비교해, 대소문자나 NFD가 디스크와 다르면 `doan work`·`open`·`handoff`를 거절한다. `work done`은 그 경로를 조용히 건너뛴다. `config --remove-serve`도 같은 종류의 오판을 한다(R1-33과 같은 부류) | `work_rules.go:32`, `config.go:184` | w2 W2-01·02 |
| R2-13 | viewer `lib.js`의 `toolShortcut` 복사본에 `inOpenList`가 없다. 비교 테스트의 target에 `closest`가 없어 이 차이를 보지 못한다 | | p4 P4-R2-02 |
| R2-14 | "메뉴나 목록이 열림"을 정하는 selector가 네 벌이다(`OPEN_LIST`, `overlayOpen`, star prompt, `canvasControlFocus`). presets popover와 `/` 목록에서 판정이 갈린다 | PRODUCT.md:298 | p4 P4-R2-03 |
| R2-15 | `ConversationThread`의 TurnIndicator가 native visibility를 보지 않는다. 창을 닫아도 1초마다 다시 렌더된다 | | p4 P4-R2-05 |
| R2-16 | R1-32 나머지가 BACKLOG에도 report에도 없다: Codex `exec_command`의 제어 흐름, Python `-c`/`-m`, heredoc 안 백틱. 앞뒤 공백이 있는 한 단어 변수도 bash 방식으로 읽는다 | `eval/lib/transcript.ts` | w2 W2-05, PR #285 |
| R2-17 | eval Codex judge home이 아직 `/tmp`에 있다 | `eval/run.ts:40,44,220` | p2 B-6 |
| R2-18 | ARCHITECTURE §14 'Handoff scenarios'가 아직 `codexRuleText()`라고 쓴다 | | p2 B-8 |
| R2-19 | 서명 빌드의 CLI가 Go 1.27.0으로 빌드된다(`go.mod`에 `toolchain` 줄이 없음). 로컬은 1.27.3이다 | `go.mod`, v0.1.20 sign 로그 | sec 2회차 CI 리뷰 |
| R2-20 | never-served 규칙이 Go `Withheld`와 TS `withheld`에 따로 있는데, 두 언어 테스트가 각자 표를 써서 공유 fixture가 없다(ARCHITECTURE §11) | | p4 P4-R2-04 |

## 수정 배치

| 배치 | 브랜치 | finding |
|---|---|---|
| R2A | `fix/activation-focus-rest` | R2-01, R2-02, R2-03, R2-04 |
| R2B | `fix/realdom-test-harness` | R2-09 |
| R2C | `fix/round1-followups` | R2-06, R2-07, R2-08, R2-10, R2-11, R2-18 |
| R2D | `fix/open-list-unify` | R2-13, R2-14, R2-15 |
| R2E | `fix/cli-root-spelling` | R2-12, R2-19, R2-20 |
| R2F | `fix/eval-reader-rest` | R2-16, R2-17 |

R2-05는 보안 배치(Codex 규칙)와 같은 파일을 고치므로 그 배치에서 처리한다.

## Coverage

| 모듈 | 상태 |
|---|---|
| 1라운드에서 바뀐 파일(181개) | 4관점 완료 |
| `filepath.Rel` 14곳, `transcript.ts`·`uiState.ts` diff, App·ProjectSettingsPage focus | 2차 wave 완료 |
| renderer 중 UI만 바뀐 diff | 계약 관점 partial(경계·lifecycle·유지보수는 완료) |
| `acp.ts`·`dispatcher.ts` 내부 | permission 경로만 다시 읽음 |
| 바뀌지 않은 파일 | 1라운드 coverage를 이어받았고, 새 postmortem 규칙을 적용 |

## Postmortem 적용 점검

2026-11-18 이후 항목 15건을 리뷰어별 원자료에 기록했다. 위반이나 공백이 있는 항목은 아래와 같고, 나머지는 준수한다.
- activation focus → R2-01~R2-04
- 회귀 방지용 연결 테스트 → R2-13(viewer 복사본)
