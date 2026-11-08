# remove-comments — spec

0.1.0 정식 출시 전에 코멘트 기능(`.doan/comments/`, `doan comments`, `doan comment resolve`)을 제품에서 들어낸다. 같은 이유로 고쳐야 하는 `doan skill` 가이드의 밀린 수정 3건을 함께 넣고, 가이드가 바뀌므로 `/agent-eval`을 돈다. 사용자 결정(2026-11-08): "코멘트 들어내고 doan skill 가이드 수정하고 eval까지 깔끔하게 돌려서 가자."

## 사용자

- **사람**: 앱에는 이미 코멘트 화면이 없다(PRODUCT §4 'Loop' 3, `app/src/main/view.ts:25`). 남은 접점은 Move to Trash 확인 창의 코멘트 문장과 "comments couldn't be moved" 토스트, 그리고 Right panel의 "inspect or comment on it" 문구다. 이것들이 사라진다.
- **에이전트**: `doan skill` 가이드의 코멘트 규칙(A 일부, B–F, H, `lastResolution` 문단)과 명령 두 개, `ls`의 코멘트 필드, 프리셋 20개의 "open comments를 읽고 적용한 것만 resolve" 단계가 사라진다. 에이전트는 앵커(칩)와 `doan active`로만 사람이 가리킨 대상을 받는다.
- **다른 사람의 저장소**: 이미 `.doan/comments/`가 있는 저장소는 그대로 둔다. Doan은 그 파일을 읽지도, 지우지도, 경고하지도 않는다.

## 문제

- 코멘트를 만드는 화면이 없어진 뒤로 코멘트는 사람이 쓸 수 없는 기능이다. 그런데 CLI 명령, 가이드 규칙 7개, 프리셋 단계, 스키마, fold 로직, `doan check` 규칙, Trash의 파일 이동, eval 시나리오 13개가 그대로 남아 있다(조사: CLI 19개 파일, 앱 30여 개 파일, eval 시나리오 13개).
- 가이드는 출력 예산 21,600 B 가운데 21,592 B를 쓰고 있어서(BACKLOG 'Known defects') 다음 수정을 넣을 자리가 없다. 코멘트 문단이 그 자리를 차지한다.
- `doan skill` 가이드는 CLI와 세 군데에서 어긋난다(BACKLOG 'Known defects', doc-check 2026-11-08):
  - viewport 단위 규칙이 `dvb`, `svb`, `lvb`를 빠뜨린다(`cli/internal/canvas/css.go`).
  - exit 2 목록에 `export_refused`, `export_too_large`, `destination_exists`가 없다.
  - 하위 폴더 캔버스를 말하면서 모든 캔버스 편집 전에 `work start`를 하라고 하는데, `work`와 `open`은 `.doan/canvases/`·`.doan/ds/` 바로 아래가 아닌 캔버스를 거부한다(`cli/internal/cli/work_rules.go`).
- 0.1.0에 코멘트를 넣어 내보낸 뒤 빼면 CLI 명령과 `ls` 결과가 깨지는 변경이 된다.

## 완료 조건

- `doan comments`, `doan comment resolve`가 없다. `doan help`에 없고, 부르면 알 수 없는 명령(`usage_error`)이다.
- `doan ls` 결과에 `comments`, `commentsError`, `orphans`가 없고, 오류 코드 `unreadable_comments`, `comment_not_found`가 없다.
- `doan check`에 `orphan_comment_file` 규칙이 없다. `.doan/comments/`가 남은 저장소에서 `check`, `ls`, `export`, 캔버스 서빙이 그 디렉터리를 무시한다(읽지 않고, 경고하지 않고, 지우지 않는다).
- `doan init`과 `doan config --storage repo`는 `.gitattributes`에 `.doan/** linguist-documentation` 한 줄만 요구한다. 이미 있는 union 줄은 건드리지 않는다. 앱 첫 실행의 계획(`onboarding/projects.ts`)과 eval의 가짜 앱이 같은 한 줄을 쓴다.
- `schema/comment-event.v1.schema.json`과 그 fixture, `schema/fixtures/fold/`가 없다. `app-socket.v1`의 selection `element`와 `sessions.v1`의 `at`은 같은 모양을 자기 스키마 안에 가진다(형태 변화 없음, `v` 그대로).
- Move to Trash는 캔버스 파일만 옮긴다. 확인 창과 토스트에 코멘트 문장이 없다.
- 가이드(`cli/internal/cli/skill.md`)와 프리셋 본문에 코멘트 내용이 없고, 밀린 수정 3건이 들어가 있다. 가이드 크기 테스트(`skillOutputBudget`)를 통과한다.
- eval: 코멘트가 핵심인 시나리오는 은퇴하고, 코멘트를 곁들여 쓰던 시나리오는 코멘트 없이 같은 것을 잰다. `node eval/run.ts --self-test`가 `self-test PASS`.
- `/agent-eval` 한 라운드를 돌려 USABILITY-EVAL에 기록한다.
- PRODUCT, ARCHITECTURE, DIRECTORY, DESIGN, README, AGENTS, 개발 스킬이 코멘트 없는 현재 상태를 말하고, `docs/features/remove-comments/`는 지워졌다.
- `node .agents/skills/verify/scripts/verify.mjs --eval` 통과.

## 비목표

- 남아 있는 `.doan/comments/` 파일의 마이그레이션·삭제·경고.
- 코멘트를 대신할 새 기능(사람이 메모를 남기는 기능). 필요해지면 새 feature로 다룬다.
- `doan active`의 `html`/`text`를 데이터로 다루라는 규칙의 변경(그대로 둔다).
- POSTMORTEM 항목과 USABILITY-EVAL 라운드 기록의 수정(이력은 그대로 둔다).
- `doan active` `html`/`text`를 통한 지시 주입을 재는 새 eval 시나리오(design D5).
