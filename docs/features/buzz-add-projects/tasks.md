# buzz-add-projects — tasks

순서: 초안 → 순수 함수 → main(I/O) → 렌더러 → 정리 → 대조 → 승격. 포맷 변경이 없어 schema·fixture 단계는 없다. 아래 T 번호는 design.md '순수 함수' 번호와 함께 적는다.

## D. 초안 (`/design-draft`, 구현 전)

- [x] D1. `.doan/canvases/buzz-add-projects.html`에 페이지 초안을 새 파일로 그렸다. 프레임과 타일은 design.md '초안'대로다. 4차를 사용자가 확정했다(2026-10-30, 문구 포함). feature-review 반영 5차는 `selecting`의 잠금 표시만 더했다.
  - 검증: `go run ./cli/cmd/doan check --json --repo .`에 이 파일의 오류가 없고 `go run ./cli/cmd/doan ls --json --repo .`의 프레임 id가 design.md '초안'과 같다.

── commit: `docs(design): buzz-add-projects draft` / `docs(design): buzz-add-projects draft revision` (완료) ──

## T. 순수 함수 (`/tdd` → `/implement`)

- [ ] T1. `addPageReturn`·`leaveLocked`(design 1·2) 테스트를 먼저 쓰고 red를 확인한 뒤 구현한다. 사례:
  - origin Home·워크스페이스에서 Projects 탭·Back·Cancel·Escape, origin 워크스페이스가 목록에서 사라짐(Home), Forward 없음.
  - 편집 중인 입력(URL 필드, IME 조합)에서 Escape 무시. 페이지 위에 Quick Open이나 다이얼로그가 열려 있으면 Escape는 그것만 닫음.
  - 완료(신규·이미 등록), LNB 행(드래프트가 있는 origin이면 draft guard 경로), Quick Open pick, Go > Home(origin과 관계없이 Home), 페이지에서 다시 열기(무시).
  - 잠금: `selecting`, `cloning`, 취소 중 모두 잠김, `cloneCancelled`·오류 뒤 풀림. 잠긴 동안 design '잠금'의 이동 함수 목록이 각각 아무 일도 하지 않음(함수마다 한 사례).
  - 페이지 진입이 적용 전 startup 복원을 취소함.
  - 검증: `npm --prefix app test` 통과(구현 전 red 기록).
- [ ] T2. `menuState` 확장(design 3) 테스트를 먼저 쓴다. 사례: `addProjects` 화면에서 choose phase의 Add Project…만 활성, Home·Quick Open 활성, 캔버스 명령·Resolved Comment 비활성, `locked`의 비활성 목록과 Settings… 활성, 기존 modal·Settings 포커스·첫 실행 규칙 무변경.
  - 검증: `npm --prefix app test`의 `menuState.test.ts` 통과(구현 전 red 기록, 기존 단언 무수정).
- [ ] T3. `dropFolder`(design 4)와 `homeComposer` 폴더 드롭 안내(design 7) 테스트를 먼저 쓴다. 사례: 폴더 하나, 파일 하나, 폴더 둘, 폴더와 파일, 빈 목록, 경로 없는 항목. 세션 쪽: busy 중 드롭 거부, inspecting 중 두 번째 빠른 드롭 거부, notice가 다음 드래그·Choose folder에서 지워짐.
  - 검증: `npm --prefix app test` 통과(구현 전 red 기록).
- [ ] T4. `projectFooter`(design 5) 테스트를 먼저 쓴다. 사례: 온보딩 쓰임의 모든 phase가 지금 문구·동작과 같음, 페이지 쓰임의 choose·candidates·setup·clone(주 버튼)·selecting·cloning(하단 없음)·cloneCancelled, `no_ready_agent` notice가 페이지에 없음.
  - 검증: `npm --prefix app test` 통과(구현 전 red 기록). 기존 `onboardingView.test.ts`·`Onboarding.test.tsx` 무수정 통과.
- [ ] T5. `addPageRequest`(design 6) 테스트를 먼저 쓴다. 사례: 각 요청 종류의 정상 모양, 알 수 없는 키, 문자열이 아닌 값, 상대 경로, 4096자 초과, 잘못된 GitHub URL.
  - 검증: `npm --prefix app test` 통과(구현 전 red 기록).

── commit: `test(app): …` / `feat(app): Add Projects page navigation, menu, drop and request rules` ──

## M. main

- [ ] M1. 공유 project 클래스(design 'main의 project 처리', 순수 함수 8). `OnboardingService`의 project 부분을 클래스로 떼고 서비스는 인스턴스 하나를 쓴다. 기존 서비스 테스트가 무수정으로 통과한 뒤, 클래스 단위 사례를 더한다.
  - 사례: 설정된 저장소 바로 등록, 설정 안 된 저장소의 Set up, 저장소 여럿, 저장소 아닌 폴더의 설정, 읽을 수 없는 폴더(권한 0111·0444)를 `project_unavailable`로, inspect와 select 사이에 지워진 폴더, symlink 경로가 canonical root로 등록, 이미 등록된 경로와 symlink로 등록된 경로, 등록된 프로젝트 안의 폴더(중첩 저장소를 만들지 않음), `not_candidate`·`inspection_stale`, Set up 실패 뒤 Not set up으로 남음, `destination_exists`, `git_missing`, leftovers 정리, 두 인스턴스가 같은 부모의 leftovers와 clone 대상 잠금을 공유(두 번째 clone `busy`), 종료 때 두 인스턴스의 clone 중단·정리.
  - 검증: `npm --prefix app test`(`app/src/main/onboarding/service.test.ts`·`projects.test.ts`·`race.test.ts`·`timeouts.test.ts` 무수정 통과와 새 클래스 테스트), `npm --prefix app run typecheck`. 구현 전 red 기록.
- [ ] M2. 페이지 채널과 메뉴. 페이지 인스턴스의 read·changed·inspect·select·clone·cancel 채널(`fromWindow`, `senderAllowed` main 전용), 기존 `onboarding:choose-folder` 재사용, File > Add Project…의 페이지 열기(숨은 창이면 먼저 보이기, Settings 창 포커스면 비활성), `menu:state` 파서의 `addProjects`·`locked`, 렌더러 reload·`render-process-gone` 때 페이지 clone 취소, 앱 종료 정리 연결, `flow.add`를 한 경로 판정으로 축소.
  - 검증: `npm --prefix app test`(사례: 다른 창의 요청 거부, 잘못된 요청 거부, 등록이 `projectDeps`를 거침, 숨은 창에서 Add Project…가 창을 보이고 페이지 열기를 보냄, `multiSelections` 선택이 없음, reload 때 clone 취소, `senderAllowed` 목록), typecheck. `git diff --exit-code main -- app/src/main/onboarding/fixtures cli/internal` 결과 없음.

── commit: `refactor(app): share the onboarding project adder` / `feat(app): main handlers for the Add Projects page` ──

## U. 렌더러

- [ ] U1. 화면 모델에 `addProjects`와 origin을 더하고, design '화면과 이동'의 두 값 가정 지점을 고친다. 헤더 캡슐 Add Projects / Projects를 페이지 탭으로, 진입점 세 곳(헤더, 메뉴, Home 입력창 Add Projects…)을 페이지로 바꾼다. 워크스페이스는 Home과 같은 방식으로 숨긴다. design '잠금'의 이동 함수마다 `leaveLocked` 판정을 넣고, 잠금 표시(`aria-disabled`, 프로젝트 메뉴 항목 포함)를 연결한다.
  - 검증: `npm --prefix app test`(`App.test.ts`·`App.home.test.ts`·`App.history.test.ts` 통과). 새 단언: 헤더 Add Projects `aria-current="page"`와 LNB 행에 `aria-current` 없음, 페이지가 방문 기록과 `savedUiState`에 남지 않음, 잠긴 탭·LNB 행·프로젝트 메뉴 항목의 클릭과 키보드 활성화 무시, modal이 열려 있으면 진입점 세 곳 비활성. typecheck. design '포커스'의 POSTMORTEM `rg`를 돌리고 결과를 작업 기록에 남긴다.
- [ ] U2. `AddProjectsPage.tsx`와 페이지 세션, 공용 포커스 훅(design '포커스'). `ProjectScreen`·`ProjectStepSession`을 쓰임별로 넓혀 재사용한다(T4). 'Your projects' 없음, 하단 Cancel·주 버튼, 인라인 Cancel의 `aria-label="Cancel check"`, 완료 뒤 Home 선택과 LNB 강조.
  - 검증: `npm --prefix app test`. 렌더·세션 사례: 제목 포커스, 폴더 시트를 닫은 뒤 연 버튼으로, 오류 뒤 alert로, 진행 중 status로(두 쓰임), 설정된 저장소 → 바로 완료, 설정 안 된 저장소 → setup, 저장소 아닌 폴더 → setup, 읽을 수 없는 폴더 → `project_unavailable` 문구, 각 오류 코드가 온보딩과 같은 `projectNotice` 문구, 등록 응답보다 폴더 목록이 늦게 오는 held 사례에서 Home이 그 root를 고름. typecheck.
- [ ] U3. 'Open a local folder' 카드 드롭(페이지와 온보딩 공통), 드롭 중 표시, notice, 창 전역 `dragover`·`drop` 기본 동작 방지. Home 입력창 안내 문구와 `dropTarget`의 `project` 분기 정리.
  - 검증: `npm --prefix app test`. 렌더 단언: 드래그 중 카드의 `role="status"` "Drop to add this folder", busy 중 `dropEffect = "none"`, 거절 notice가 `role="alert"`이고 포커스를 옮기지 않음, 창 `dragover`·`drop`의 `preventDefault`, 온보딩 카드도 같은 드롭. typecheck.
- [ ] U4. 온보딩 공유 개선(design '온보딩과의 공유' 2·3): 온보딩의 전체 폭 스크롤 컨테이너와 clone 중 이유 한 줄. 페이지와 같은 컴포넌트·규칙을 쓴다.
  - 검증: `npm --prefix app test`(`Onboarding.test.tsx`·`onboardingView.test.ts` 통과, 스크롤 컨테이너 마크업과 clone 중 줄 단언 추가), typecheck.
- [ ] U5. CSS: 페이지 패널 스크롤, 본문 열, 카드 드롭 표시, 잠금 표시, 온보딩 스크롤 영역을 초안 값으로 `styles.css`에 둔다. `.ob-scene`의 `overflow`·`native-scroll`을 옮기고 대체한 옛 규칙은 지운다. JS에서 CSS를 import하지 않는다.
  - 검증: `npm --prefix app test`(`ds/checks.test.ts` 포함), `npm --prefix app run build`.

── commit: U1·U2·U3 → `feat(app): open Add Projects as a shell page` / U4·U5 → `feat(app): share Add Projects improvements with first run` ──

## R. 정리

- [ ] R1. `AddProjectsDialog.tsx`(`SetUpFolderConfirm` 포함), `DropOverlay.tsx`, `addFromDialog`, 그것만 쓰던 preload API·`AddOutcome` import·main 채널·체크리스트 스캔 코드·`senderAllowed` 항목·CSS(`styles.css:710` 포함)·테스트를 지운다. 온보딩과 페이지가 쓰는 한 경로 판정과 `gitChildren`·`hasGitEntry`는 남긴다.
  - 검증: `rg -n 'AddProjectsDialog|SetUpFolderConfirm|DropOverlay|add-dialog|addFromDialog|folders:add|folders:scan|folders:confirm|watchScan|addCandidates|droppedPaths' app/src` 결과 없음. `npm --prefix app test`, typecheck, build 통과.

── commit: `refactor(app): remove the Add Projects dialog and window drop` ──

## S. 대조와 실제 앱 확인

- [ ] S1. `/design-sync`로 초안과 구현을 computed style로 맞춘다.
  - 개발·프로덕션 빌드 모두에서 페이지 열 너비와 드롭 표시를 잰다.
  - 페이지 패널과 온보딩 스크롤 영역이 스크롤 컨테이너이고(`scrollbar-width: thin`), 스크롤바가 그 오른쪽 끝에 있는지 잰다. 온보딩은 Agent·Project 단계 모두 잰다.
  - Welcome의 세로 가운데 정렬이 바뀌지 않았는지 잰다.
  - candidates 20개 이상에서 패널이 스크롤되어 마지막 카드와 주 버튼에 닿는지 잰다.
  - 남는 차이는 근거와 함께 DESIGN.md에 적는다.
  - 검증: `/design-sync`의 측정 스크립트(`node .scratch/design-sync/buzz-add-projects/measure.mjs`) 결과에 기록되지 않은 차이가 없다.
- [ ] S2. `/runtime-test`로 바뀐 동작만 짧게 확인한다. probe 위치는 `.scratch/runtime-test/buzz-add-projects/`이고, 명령은 미정이다(사용자 확인 필요, AGENTS 'Commands'에 runtime-test probe 명령이 없다). `app/runtime/`로 격리하고, clone은 임시 HOME의 `.gitconfig`에 `url.<로컬 bare 저장소>.insteadOf=https://github.com/`을 두어 네트워크 없이 재현한다. 원격 판정은 전역 gitconfig를 include로만 읽으므로(ARCHITECTURE §7 'First-run onboarding'의 Remotes 줄) checkout 재사용 판정에는 영향이 없다. Cancel과 잠금 확인을 위해 clone을 늦추는 장치를 둔다.
  - 진입점 세 곳, 숨은 창에서 Cmd+O, Settings 창 포커스에서 Add Project… 비활성.
  - 설정된 저장소 추가 → Home 선택·LNB 강조. 설정 안 된 저장소 → Set up → Home. 저장소 여럿인 폴더 → 하나 고르기. 이미 등록된 폴더 → Home 선택.
  - GitHub URL: 등록된 checkout 재사용, clone과 Cancel 정리.
  - selecting·cloning 중 헤더 탭·Back·LNB 행·프로젝트 메뉴 Overview·Search·Go > Home·Quick Open·Escape가 페이지를 떠나지 않음, Cancel 뒤 떠날 수 있음. clone 중 Cmd+W 뒤 다시 보이면 그대로. clone 중 앱 종료 뒤 임시 폴더와 git 프로세스가 남지 않음.
  - 드래프트가 있는 캔버스 워크스페이스에서 열고 Projects 탭·Back·Escape로 돌아왔을 때 캔버스·뷰·드래프트·`doan active`가 그대로.
  - 카드 드롭(합성 이벤트), 여러 항목·파일 notice, 카드 밖 드롭이 아무 일도 하지 않음. 온보딩 Project 단계의 카드 드롭, 온보딩 Agent·Project 단계를 낮은 창에서 끝까지 스크롤, 온보딩 clone 중 이유 한 줄. 네이티브 Finder 드롭은 가능하면 확인하고, 막히면 미확인으로 기록한다.
  - 접근성 트리: 헤더 Add Projects `aria-current`, 페이지 제목, 라디오 카드, 잠금 중 `aria-disabled`.
  - 검증: probe가 완료 표시와 함께 exit 0이고 실제 사용자 상태 전후 확인을 통과하며 스크린샷을 남긴다.
- [ ] S3. DESIGN.md에 페이지 측정값과 초안과의 차이를 새 절 'Add Projects page'로 적고, 'Onboarding' 절에 공유 개선(카드 드롭, 스크롤 컨테이너, clone 중 줄)의 측정값을 더하고, 'Projects home' 절과 'Shared dialog' 줄의 Add Projects 체크리스트·다이얼로그 부분을 대체 표시한다.
  - 검증: `grep -n '^## Add Projects page' docs/DESIGN.md`에 줄이 있다. `grep -n 'scroll container' docs/DESIGN.md`에 Onboarding 절의 줄이 있다. `grep -n 'add-dialog' docs/DESIGN.md`의 남은 줄은 모두 대체 표시가 있다.

── commit: `fix(app): align the Add Projects page with its draft` / `docs(design): record buzz-add-projects measurements` ──

## Z. 승격과 정리

- [ ] Z1. `node .agents/skills/verify/scripts/verify.mjs` 통과.
  - 검증: exit 0, 로그는 `.scratch/verify/`.
- [ ] Z2. 결론 승격.
  - PRODUCT §3 범위 밖 6: clone 예외를 "첫 실행과 Add Projects 페이지"로 넓힌다(spec 결정 10).
  - PRODUCT §5 항목 0: 헤더 문장(Add Projects / Projects가 페이지를 오간다), First run Project step 문장(카드 드롭, clone 중 줄, 출하된 setup 패널에 맞춘 "files setup adds" 문장).
  - PRODUCT §5 항목 1: Add Projects 문단(페이지, 하나씩, 그 자리 설정과 실패 예외, 카드 드롭, 완료 뒤 Home, origin 복귀, selecting·cloning 잠금), Home 입력창 폴더 드롭 문장, 'First run registers its chosen project through the same addition flow' 문장.
  - 대체되는 본문: design.md '포맷·컨벤션·결정 영향'의 대체 항목이 PRODUCT·ARCHITECTURE·DESIGN 본문에 남아 있으면 지우고 현재 규칙으로 고친다. 근거(spec 결정 1~10, Buzz에 대응 화면이 없어 온보딩 Project 단계를 정본으로 삼은 점)는 커밋 메시지에 쓴다.
  - PRODUCT §6 Open questions 후속: Git이 찾은 미등록 워크트리를 LNB에서 더하는 길.
  - ARCHITECTURE §7: 'Screens'·'Memory'·'Focus'의 화면 모델과 `AddProjectsDialog`·`SetUpFolderConfirm`·`DropOverlay` 언급, 남아 있는 add 채널 언급을 페이지 채널로 교체, 'Menus' 줄의 `addProjects`·`locked`, 공유 project 클래스. ARCHITECTURE에는 IPC 채널·메뉴 표·allowlist 표가 없고 `senderAllowed.ts`·`menuState.ts`를 가리키므로, 이 항목은 코드 변경만으로 맞춰진다.
  - 부모 spec 공통 결정 6(하나씩 추가·워크트리 제안 제거라는 보존 예외)과 공통 결정 10(`AddProjectsDialog` 삭제).
  - 검증:
    - `grep -nE 'AddProjectsDialog|SetUpFolderConfirm|suggested worktrees start unchecked' docs/PRODUCT.md docs/ARCHITECTURE.md` 결과가 없다.
    - `grep -n 'Add Projects page' docs/PRODUCT.md`에 §3 범위 밖 6 줄이 있다.
    - `grep -n 'dropped elsewhere they still add a project' docs/PRODUCT.md` 결과 없음.
    - `grep -n 'AddProjectsDialog\|DropOverlay\|folders:add\|onAddOutcome' docs/ARCHITECTURE.md` 결과가 없거나 대체 설명뿐이다. `grep -n 'menu:state.*addProjects' docs/ARCHITECTURE.md`에 'Menus' 줄이 있다(지금은 결과 없음).
    - 부모 spec은 한국어다. `grep -n '하나씩 추가' docs/features/buzz-restyle/spec.md`에 공통 결정 6 줄이 있고, `grep -nE 'AddProjectsDialog.*(삭제|없앴)' docs/features/buzz-restyle/spec.md`에 공통 결정 10 줄이 있다(둘 다 지금은 결과 없음).
- [ ] Z3. `docs/features/buzz-add-projects/`를 지운다.
  - 검증: `ls docs/features/buzz-add-projects` 실패.

── commit: `docs(product): promote buzz-add-projects` / `docs(architecture): promote buzz-add-projects` / `docs(feature): complete buzz-add-projects` ──
