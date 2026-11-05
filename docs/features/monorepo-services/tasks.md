# monorepo-services — tasks

선행 조건: `local-doan-files`와 `canvas-handoff`가 main에 병합된 뒤 `/tdd`(T1)를 시작한다. 시작할 때 두 feature의 병합된 모양(`doan config` 결과의 `storage`, 셋업 패널·Project Settings 구역, app-socket v5와 `workTarget`)을 다시 읽고 design §8.1과 해당 절을 고친다.

순서: 초안 → 형식 → Go 순수 함수 → CLI 저장소 규칙(나열·scope·check·댓글·경로) → CLI 후보 찾기 → guide·preset·eval scenario → app main 경로·watcher → app main 셋업·Settings → app UI → 실제 앱 확인 → agent eval → 승격.

## T0. 초안

- `/design-draft`가 `.doan/canvases/monorepo-services.html`을 그린다. 그릴 것: 첫 실행·Add Projects 셋업 패널의 서비스 목록(처음 선택 없음, 많은 줄과 스크롤 끝 Set Up, skipped·잘림, 고른 서비스가 더하는 `.doan/services/<id>/`), 서비스 쓰기 실패와 Retry, 후보 찾는 중·찾기 실패·후보 0개, Project Settings Services 구역(서비스 token CSS, Add from workspace… 대화상자의 읽는 중·후보 0개·실패와 Retry·"Added", 캔버스가 있어 Remove가 비활성인 이유, Remove 확인, 폴더 없는 서비스), 사이드바 서비스 group과 공유 group, Quick Open의 서비스 캔버스 위치(design §4).
- 검증: `doan check --json` 오류 0, `doan ls --json`에 나옴, 사용자가 앱에서 초안을 확인한다.
- **commit 경계**: `docs(design): draft monorepo service folders`

## T1. 형식

- `schema/config.v2.schema.json`과 `schema/fixtures/config/{valid,invalid}`의 v2 사례. `schema/fixtures/config/invalid/unknown-version.json`(`{"v": 2}`)과 `cli/internal/repo/config_test.go` `TestParseConfigBoundaries`의 `{"v":2,"x":1}`을 v3으로 바꾼다(design §7). app-socket v3·v4·v5 `path` pattern(공유·서비스·하위 폴더; v5는 design §8.1)과 `schema/fixtures/app-socket-v3`·`app-socket-v4`·`app-socket-v5`·`open-link/cases.json` 사례(design §2.2·§2.7·§7).
- 검증: `go test ./...`, `npm --prefix app test` green(두 쪽이 같은 fixture를 읽음). 기존 v1·v3·v4·v5 fixture는 그대로 통과하고, 바뀐 것은 v3으로 옮긴 `unknown-version` 사례뿐이다.
- **commit 경계**: `feat(formats): config v2 services and service canvas paths`

## T2. Go 순수 함수

- config v1·v2 parse와 런타임 검사, `serviceDirs`, `MetadataPath(p, serviceIDs)`, token 파일 예외(경로로 판단), 서비스 쓰기 계획, `tokenFor`, `service_not_configured` 판단, 캔버스 경로 규칙, adapter 7개, `classifyPattern`·`filterMembers`·`proposeIDs`(design §6 Go 행).
- 테스트: design §6 표의 Go 사례 전부. config에 서비스가 있고 폴더가 없는 사례(design §9). 두 branch 병합으로 생긴 중복 id → 프로젝트 전체 `invalid_config`. 디스크 폴더 이름이 id와 대소문자만 다름(`web` vs `Web`) → 폴더 없음(POSTMORTEM 2026-10-21).
- 검증: `go test ./...`, `go vet ./...` 통과.
- **commit 경계**: `feat(cli): rules for service folders and workspace members`

## T3. CLI 저장소 규칙

결정 1의 비용(design §0)을 CLI 쪽에서 모두 다룬다.

- **나열·`doan ls`**: `repo.Canvases`가 config를 받아 서비스 `canvases/`·`ds/`를 걷고(호출처 `read.go` `scanCanvases`, `export.go`), `ls` 결과에 `services`(design §2.3).
  - 테스트: `ls` deep-compare(공유·서비스·하위 폴더 캔버스의 byte 순, `services`), config에 없는 `.doan/services/x/`는 나열 안 됨, 링크된 `.doan/services`·서비스 폴더·`canvases` 각각 건너뜀, 폴더 없는 서비스, config `web`·디스크 `Web`은 나열도 서빙도 안 되고 `doan check` 경고.
- **서빙 범위·export 경계**: `defaultServeDirs`(config를 받음)·`MetadataPath(p, serviceIDs)`·서비스 token CSS(design §2.4).
  - 테스트: `scope`에 서비스 세 디렉터리와 서비스 token, 링크된 경우마다 `scope`와 `canvases`를 함께 단언(POSTMORTEM 2026-10-31), `serve`에 `.doan/services`나 `.doan/services/web`을 적어도 그 자체는 범위 밖, config에 없는 `.doan/services/x/canvases`를 `serve`에 적어도 범위 밖, `config --add-serve .doan/services/web` 거절.
  - export: 서비스 캔버스가 서비스 assets와 공유 token CSS를 담아 나감, `.doan/services/web/assets` 밖의 서비스 폴더 파일은 거절, `-o`가 `.doan/services/...` 안이면 `usage_error`(`cli/internal/export/exporttest` seed에 서비스 캔버스 추가).
- **`doan check` token 판단**: `hardcoded_color`의 서비스 token, `token_css_not_found`의 서비스 token, `service_not_configured` 경고(design §2.5).
  - 테스트(`cli/internal/check/check_test.go`): 서비스 token 예외, 최상위·서비스 token 파일이 `undefined_token`·`hardcoded_color`에서 빠지고 캔버스 순서를 바꿔도 결과가 같음(`cssSeen`), 서비스 token 없음 → 최상위, 여러 서비스가 닿는 CSS 파일의 finding 한 번, 공유 token CSS를 저장소 상대로 링크한 서비스 캔버스에 `path_outside_repo`·`css_not_served` 없음, 없는 서비스 token → `.doan/config.json`의 finding.
- **댓글**: `OrphanFiles`·`ls` `orphans`·`doan comments`의 `canvasPath`가 서비스 캔버스를 봄(design §2.6).
  - 테스트: 서비스 캔버스의 댓글 파일이 고아가 아님, 서비스 캔버스 id가 공유 캔버스와 겹치면 `duplicate_canvas_id`, `comment resolve`가 서비스 캔버스 댓글에 동작.
- **`doan config` 서비스 쓰기**(design §2.9).
  - 테스트: 결과 deep-compare(`storage`와 함께, design §8.1), 서비스 없는 config 바이트·mtime 그대로, v1 → v2, 마지막 서비스 빼면 v1, 캔버스 있는 서비스 빼기 거절, 경로에 링크가 있으면 거절, `--add-service`의 `<path>`가 없거나 디렉터리가 아니면 `usage_error`, `<path>`가 on-disk spelling으로 저장됨, 폴더 만들기 실패 → config 그대로, 재시도.
- **work·open 경로**: `workCanvasPath`·`canvasLink`·`open_rules.go`의 넓힌 규칙(design §2.7).
  - 테스트: `doan work start .doan/services/web/canvases/home.html`이 `usage_error`가 아님, `work start`는 config에 없는 서비스 경로도 받음(나열 확인 없음, design §2.7), `open`의 서비스 경로와 config에 없는 서비스 경로(`canvas_not_found`), 공유 하위 폴더 경로(결정 16), `work done`의 `links`.
- 검증: `go test ./...`, `go vet ./...` 통과.
- **commit 경계**: `feat(cli): list, serve and check service canvases` · `feat(cli): manage services with doan config` · `feat(cli): accept service canvas paths in work and open`(세 commit)

## T4. CLI 후보 찾기

- 펼치기·대체 검색과 `doan detect-services`, `doan help` 한 줄(design §3).
- 테스트(임시 디렉터리): 결과 deep-compare, adapter별 실제 파일, 건너뛰는 이름·링크·manifest 없음·깊이 3·바깥이 이김, EACCES → `unreadable`(root로 돌면 건너뜀), 대소문자·NUL·ENOTDIR·링크 루프(POSTMORTEM 2026-10-21), 201개 → 200개와 `truncated`, 기존 config id와 겹치는 제안 id, 메시지에 절대 경로 없음.
- 검증: `go test ./...`, `go vet ./...` 통과.
- **commit 경계**: `feat(cli): detect workspace members a folder declares`

## T5. guide·preset·eval scenario

- `cli/internal/cli/skill.md`의 서비스 규칙, 서비스 캔버스의 상대 링크 예, `doan config` 서비스 플래그, `work start`·`open` 줄의 경로, `service_not_configured` 대처. 배치 디렉터리를 말하는 preset의 한 문장. 새 eval scenario(`eval/scenarios/<id>/`, seed·rubric·checks와 pass·fail fixture)(design §5).
- 검증: `go test ./...`(guide·preset 테스트), `node --test 'eval/**/*.test.ts'`, `node eval/run.ts --self-test --scenarios <id>`가 `self-test PASS`와 exit 0.
- **commit 경계**: `feat(skill): tell agents where a service's canvases go`

## T6. app main: 경로·watcher

결정 1의 비용(design §0)을 앱 쪽에서 다룬다.

- **`canvasPath.ts`와 사용처**: `canvasDir`·`canvasKind`·`canvasService`와 사용처 11곳(design §4.6). 각 사용처 테스트에 서비스 경로 사례: Move to Trash 경계와 댓글 동반(`canvasTrash.test.ts`), 썸네일, 대화 activity의 `insideDesign`, `conversation/store.ts` `validCanvas`(서비스 캔버스에 묶인 대화 기록)와 새 앱이 서비스 캔버스 대화가 든 index를 읽는 사례, Quick Open, composer 제안.
- **work·open·링크**: `runtime.ts`의 `start` 검사, `deepLinks.ts`의 `canvas` 검사를 T1 fixture로(design §2.7).
- **watcher**: config 없이 `.doan/services`를 늘 재귀로 보는 watcher(없으면 걸지 않음), `doanDirs`에 `services`, 경로 모양으로 행 `rev`·`servedRev`·다시 읽기 분류, 링크 무시(design §4.5). 테스트: 서비스 캔버스 저장 → 그 행 `rev`만, 서비스 assets 저장 → `servedRev`, 서비스 assets 디렉터리를 지웠다 다시 만듦(POSTMORTEM 2026-10-22 'A served directory wiped…'), `.doan/services` 자체 삭제(POSTMORTEM 2026-10-22 'Filtering root `fs.watch` events…'), 서비스 추가 뒤 config 변경으로 다시 읽기.
- 검증: `npm --prefix app test`, `npm --prefix app run typecheck` 통과.
- **commit 경계**: `feat(app): treat service canvases like other canvases`

## T7. app main: 셋업·Settings

- `detect-services`·`ls` `services`·`config` 결과 reader(TS reader 테스트로 T3·T4 결과 고정), `ProjectAdder` inspection에 후보 묶기(창 전용), 셋업 뒤 `config --add-service` 창 전용 IPC, Settings IPC의 서비스 더하기·token CSS·Remove(design §4.1·§4.2).
- 테스트:
  - inspection 조건: 창이 시작한 inspection에서 셋업 필요한 고른 폴더 자신일 때만 `detect-services`, `list`·하위 저장소 여럿·URL clone·CLI가 이끄는 inspection에서는 부르지 않음.
  - `detect-services` 실패·시간 초과 → inspection과 셋업은 그대로 진행되고 이유 한 줄.
  - socket `project inspect` 응답 그대로(기존 v2 fixture 통과), 첫 실행 `status`의 operation이 v2 schema를 지킴.
  - 다른 inspection의 id, member가 아닌 값, 오래된 `inspectionId` 거절. renderer 값으로 path·config 경로를 만들지 않음.
  - 셋업 성공 뒤 서비스 쓰기 실패 → 등록·셋업 유지, Retry가 서비스 쓰기만 다시.
  - Settings Add from workspace…: main이 `detect-services` 결과를 page session에 묶고 renderer는 id만 보냄, 다른 page session·replaced renderer의 id 거절, 새 channel이 `senderAllowed.ts` 허용 목록에 있음.
  - 서비스 쓰기 뒤 folder 목록과 `servedRev` 변경을 main 테스트로 고정(POSTMORTEM 2026-11-03).
- 검증: `npm --prefix app test`, `npm --prefix app run typecheck` 통과.
- **commit 경계**: `feat(app): set up and manage services`

## T8. app UI

- 셋업 패널 서비스 목록(`projectStep.ts`, `ProjectScreen`), Project Settings Services 구역, `sidebarGroups.ts` 확장과 `ShellSidebar.tsx` 서비스 group, Quick Open 위치 표시(design §4).
- `app/src/restore/uiState.ts` `parseGroups`와 `app/src/renderer/shellNavigation.ts` `reconcileProjects`가 `service:<id>`·`shared` 닫힘을 받음(design §4.3).
- 테스트: `projectStep.test.ts`(목록, 처음 선택 없음, 고른 수와 바뀌는 파일, 찾는 중·찾기 실패·후보 0개, 서비스 쓰기 실패·Retry·넘어가기, 키보드: Tab으로 목록, Space로 체크, 실행·실패 뒤 Retry focus), `ProjectSettingsPage.test.tsx`·`projectSettingsRules.test.ts`(Services 구역, Add from workspace… 읽는 중·0개·실패와 Retry, Remove 비활성 이유, 폴더 없는 서비스, 대화상자와 Remove 확인 동안 잠금), `sidebarGroups.test.ts`·`ShellSidebar.test.tsx`(서비스 없음 → 지금 그대로, 서비스 group, ds 먼저, 닫힘 기억, 폴더 없는 서비스의 빈 group), `uiState.test.ts`(서비스 group 닫힘이 저장 뒤 남음, 잘못된 group id는 버림), `shellNavigation.test.ts`(`reconcileProjects`가 서비스 group 닫힘을 이어받음, worktree마다 서비스가 다른 project), `AddProjectsPage.test.tsx`·`Onboarding.test.tsx` 정적 markup.
- 검증: `npm --prefix app test`, `npm --prefix app run typecheck`, `npm --prefix app run build` 통과.
- **commit 경계**: `feat(app): show services in setup, Project Settings and the sidebar`

## T9. 실제 앱 확인

- `/runtime-test`: 격리된 앱에서 임시 모노레포(pnpm workspace 서비스 둘과 라이브러리 하나, `packages/ui/tokens.css`)를 Add Projects로 추가해 서비스 둘을 셋업한다. 확인: `.doan/services/<id>/{canvases,ds,assets}`와 config v2, 사이드바 서비스 group, 서비스 캔버스가 공유 token CSS와 서비스 assets로 렌더됨, 서비스 캔버스 저장과 서비스 assets 변경의 live reload, `doan work start`·`doan open`·`doan://` 링크가 서비스 캔버스에 닿음, 서비스 캔버스의 Export와 Move to Trash(댓글 동반), Project Settings에서 서비스 더하기·서비스 token CSS·Remove 비활성과 빈 서비스 Remove, 서비스 쓰기 실패와 Retry, 200줄 목록의 스크롤 끝 Set Up과 실행 중 focus. 첫 실행 경로도 한 번. 서비스 없는 기존 프로젝트의 사이드바와 config 바이트가 그대로인지.
- 이전 CLI 동작(design §2.8): 이 기능 이전에 빌드한 CLI(설치된 `doan` 또는 main에서 `go build -o <tmp>/doan ./cli/cmd/doan`)로 v2 프로젝트에 `ls`·`check`·`init`을 돌려 `unsupported_version`과 config가 그대로인 것을 기록한다.
- 이전 앱 동작(design §2.8, 결정 6): 사람이 받아들인 비용으로 기록한다. 같은 기기에서 앱을 내리면 서비스 캔버스에 묶인 대화가 있는 동안 대화 index 전체가 `invalid`로 읽히고, 앱을 다시 올리면 돌아온다.
- `/design-sync`: 세 화면을 T0 초안과 computed style로 맞추고 DESIGN.md에 적는다.
- 검증: probe 결과와 screenshot, `node .agents/skills/verify/scripts/verify.mjs --eval` 통과.
- **commit 경계**: `docs(design): record monorepo service measurements`(DESIGN.md), 고친 코드는 `fix:`로 따로.

## T10. agent eval

- `npm --prefix app run package` 뒤 `/agent-eval`로 T5 scenario와 guide 회귀 scenario를 Claude Code와 Codex로 돌리고 USABILITY-EVAL.md에 적는다(AGENTS.md: guide·CLI 출력 변경 뒤 필수).
- 검증: `node eval/run.ts --scenarios <id>,W1 --agents claude,codex` 결과가 rubric을 통과. 실패는 `/ship`이나 `/feature`로 고친다.
- **commit 경계**: `docs(eval): record monorepo service placement round`

## T11. 문서 승격과 feature 디렉터리 삭제

- PRODUCT.md(영문): spec '바뀌는 PRODUCT·ARCHITECTURE 결정'의 PRODUCT 항목. 이전 Doan과의 호환(design §2.8, 대화 기록 전체를 읽지 못하는 앱 내리기 포함)을 현재 규칙으로. §5 item 9의 CLI 명령 목록에 `doan detect-services`.
- ARCHITECTURE.md(영문): 같은 절의 ARCHITECTURE 항목. §1 'Project directory'에 서비스 폴더와 config가 서비스를 정한다는 규칙, §3 서빙 범위·`MetadataPath`, §13 Listing·Watching의 `.doan/services` 링크 규칙. §7 'Settings IPC'(config bridge의 서비스 쓰기와 Add from workspace… 새 channel, `senderAllowed.ts`, 잠금 목록). ui-state의 사이드바 group 닫힘 id(`service:<id>`, `shared`).
- BACKLOG.md(영문): design §11 후보 중 사용자가 남기기로 한 것.
- DIRECTORY.md: 새 Go 패키지 디렉터리 한 줄.
- `docs/features/monorepo-services/`를 지운다.
- 검증: `/doc-check`로 고친 문서만 확인한다(문서만 바뀌므로 targeted check). 디렉터리 삭제 뒤 남은 참조를 찾는 명령은 AGENTS.md 'Commands'에 없다 — 명령 미정, 사용자 확인 필요.
- **commit 경계**: 문서마다 하나씩(`docs(product): …`, `docs(architecture): …`, `docs(backlog): …`, `docs(directory): …`), 마지막에 `docs(feature): remove finished monorepo-services documents`.
