# remove-comments — spec

0.1.0 정식 출시 전에 코멘트 기능(`.doan/comments/`, `doan comments`, `doan comment resolve`)을 제품에서 들어낸다. 같은 이유로 고쳐야 하는 `doan skill` 가이드의 밀린 수정을 함께 넣고, 가이드가 바뀌므로 `/agent-eval`을 돈다. 사용자 결정(2026-11-08): "코멘트 들어내고 doan skill 가이드 수정하고 eval까지 깔끔하게 돌려서 가자."

## 사용자

- **사람**: 앱에는 이미 코멘트 화면이 없다(PRODUCT §5 item 5 "The app has no comment screen"). 사람에게 보이는 변화는 다음뿐이다.
  - Move to Trash 확인 창에서 코멘트를 말하던 문장과 "comments couldn't be moved" 토스트가 사라진다.
  - Set Up 폼과 첫 실행 설정 패널의 변경 목록에서 `.gitattributes` 줄이 둘에서 하나로 준다(PRODUCT §5 item 0 'Doan files').
  - Project Settings에서 Keep out of Git으로 바꾼 직후의 안내 "Doan’s two lines stay in `.gitattributes`."가 줄 수를 말하지 않게 바뀐다(`app/src/renderer/ProjectSettingsPage.tsx` `attributesStay`).
  - `RightPanel.tsx`의 "inspect or comment on it" 문구는 앱이 그 화면을 그리지 않아서 사람에게 보이지 않는다(DESIGN "No screen shows the Inspector now"). 코드와 테스트에서만 고친다.
- **에이전트**: `doan skill` 가이드의 코멘트 규칙과 명령 두 개, `ls`의 코멘트 필드, 프리셋 20개의 "open comments를 읽고 적용한 것만 resolve" 단계가 사라진다. 에이전트는 앵커(칩)와 `doan active`로만 사람이 가리킨 대상을 받는다.
- **다른 사람의 저장소**: 이미 `.doan/comments/`가 있는 저장소는 그대로 둔다. Doan은 그 파일을 새로 읽지도, 경고하지도, 지우지도 않는다.

## 문제

- 코멘트를 만드는 화면이 없어진 뒤로 코멘트는 사람이 쓸 수 없는 기능이다. 그런데 CLI 명령, 가이드 규칙, 프리셋 단계, 스키마, fold 로직, `doan check` 규칙, Trash의 파일 이동, eval 시나리오 13개가 그대로 남아 있다.
- 가이드는 출력 예산 21,600 B 가운데 21,592 B를 쓰고 있어서(BACKLOG 'Known defects') 다음 수정을 넣을 자리가 없다. 코멘트 문단이 그 자리를 차지한다.
- `doan skill` 가이드가 CLI·PRODUCT와 네 군데에서 어긋난다.
  - viewport 단위 규칙이 `dvb`, `svb`, `lvb`를 빠뜨린다(`cli/internal/canvas/css.go`).
  - exit 2 목록에 `export_refused`, `export_too_large`, `destination_exists`가 없다.
  - 하위 폴더 캔버스를 말하면서 모든 캔버스 편집 전에 `work start`를 하라고 하는데, `work`와 `open`은 `.doan/canvases/`·`.doan/ds/` 바로 아래가 아닌 캔버스를 거부한다(`cli/internal/cli/work_rules.go`).
  - 규칙 J는 캔버스를 `doan ls` title로 부르라고 하는데, PRODUCT §5 item 2와 앱(`canvasLabel`)은 파일 이름(stem)을 쓴다(doc-check 2026-11-08).
- 0.1.0에 코멘트를 넣어 내보낸 뒤 빼면 CLI 명령과 `ls` 결과가 깨지는 변경이 된다.

## 받아들인 결과

- 저장소에 남아 git으로 팀에 공유되던 사람의 피드백 채널이 없어진다. 사람의 지시는 그 기기의 대화와, 에이전트가 캔버스 위에 남기는 메모로만 남는다. PRODUCT §1의 문제 1·2는 칩과 `doan active`로, 문제 4는 캔버스 파일과 대화로 계속 답한다.

## PRODUCT 변경 요지 (T9에서 승격)

- §3 In scope 2 'Let humans point': 기존 코멘트를 말하는 마지막 문장을 지운다.
- §3 In scope 3 'Deliver': "receives the person's message with its anchors, or reads the selection (`active`) through the CLI and skills, and applies them"으로 바꾼다(코멘트 resolve 문장 삭제).
- §3 Out of scope 6: `.gitattributes`에 쓰는 줄을 한 줄로. Out of scope 7: "and its comment file when it goes with it" 삭제.
- §4 'Frames'·'Ids'에서 comment targets·comments 삭제. 'Loop' 3의 코멘트 문장 삭제, 5는 "anchors or `doan active` → edit → `doan check`".
- §5 item 1 Move to Trash의 코멘트 파일 이동, item 3·4 뷰어의 comments, item 5 'Comments' 전체, item 8 init, item 9 명령과 "instead of reporting zero comments", item 11 check.

## 완료 조건

- `doan comments`, `doan comment resolve`가 없다. `doan help`에 없고, 부르면 알 수 없는 명령(`usage_error`)이다.
- `doan ls` 결과에 `comments`, `commentsError`, `orphans`가 없고, 오류 코드 `unreadable_comments`, `comment_not_found`가 없다.
- `doan check`에 `orphan_comment_file` 규칙이 없다. `.doan/comments/`가 남은 저장소에서 `check`와 `ls`는 그 디렉터리를 새로 읽지도 경고하지도 지우지도 않는다. 서빙과 export에서는 다른 `.doan/` 메타데이터처럼 계속 제외된다(`repo/scope.go` `MetadataPath`).
- `doan init`과 `doan config --storage repo`는 `.gitattributes`에 `.doan/** linguist-documentation` 한 줄만 요구한다. 이미 있는 union 줄은 건드리지 않는다. 앱의 계획(`onboarding/projects.ts`)과 eval의 가짜 앱(`eval/lib/socket.ts`)이 같은 한 줄을 쓴다.
- `schema/comment-event.v1.schema.json`과 그 fixture, `schema/fixtures/fold/`가 없다. `app-socket.v1`의 selection `element`와 `sessions.v1`의 `at`은 같은 모양을 자기 스키마 안에 가지고(`v` 그대로), 옮긴 정의의 무효 사례가 각 스키마의 fixture로 남는다.
- Move to Trash는 캔버스 파일만 옮긴다. 확인 창과 토스트에 코멘트 문장이 없고, 캔버스 id와 같은 이름의 `.doan/comments/<id>.jsonl`이 있어도 그 파일은 바이트까지 그대로다.
- 가이드(`cli/internal/cli/skill.md`)와 프리셋 본문에 코멘트 내용이 없고, 위 '문제'의 가이드 수정 4건이 들어가 있다. 규칙은 A–E로 다시 매겨지고(design D3), 가이드 크기 테스트(`skillOutputBudget`)를 통과한다.
- 초안 `.doan/canvases/canvas-row-menu.html`, `doan-shell.html`, `local-doan-files.html`에 코멘트 상태와 두 줄 문구가 없고 `doan check`가 새 오류를 내지 않는다.
- eval: H1, H4, H6, H7, H8, R1, R3, R6b, R7b는 은퇴하고, H2, H3, R4, W2는 코멘트 시드와 확인 없이 같은 것을 잰다. `node eval/run.ts --self-test`가 `self-test PASS`. USABILITY-EVAL에 "`doan active` `html`/`text`를 통한 지시 주입을 재는 시나리오가 없다"는 이슈가 열려 있다.
- PR 병합 전에 feat 브랜치의 패키지된 CLI로 `/agent-eval` 한 라운드를 돌려 USABILITY-EVAL에 기록한다. 남은 시나리오 중 직전 라운드보다 나빠진 것이 있으면 고치고 다시 잰 뒤에 병합한다.
- PRODUCT, ARCHITECTURE, DIRECTORY, DESIGN, README, AGENTS, 개발 스킬이 코멘트 없는 현재 상태를 말하고, `docs/features/remove-comments/`는 같은 PR의 마지막 커밋에서 지워졌다.
- `node .agents/skills/verify/scripts/verify.mjs --eval` 통과.

## 비목표

- 남아 있는 `.doan/comments/` 파일의 마이그레이션·삭제·경고, 기존 `.gitattributes` union 줄 삭제.
- 코멘트를 대신할 새 기능(사람이 저장소에 메모를 남기는 기능). 필요해지면 새 feature로 다룬다.
- `doan active`의 `html`/`text`를 데이터로 다루라는 규칙의 변경(그대로 둔다).
- `doan active` 주입을 재는 새 eval 시나리오(이슈로만 남긴다).
- 쓰지 않는 코멘트 토큰(`--surface-comment`, `--text-comment`)의 삭제. DESIGN 'Defined but unused'의 미정 항목으로 그대로 둔다.
- POSTMORTEM 항목과 USABILITY-EVAL 라운드 기록의 수정.
