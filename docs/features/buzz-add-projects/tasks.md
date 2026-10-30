# buzz-add-projects — tasks

순서: 초안 → 순수 함수 → main(I/O) → 렌더러 → 정리 → 대조 → 승격. 포맷 변경이 없어 schema·fixture 단계는 없다. 아래 T 번호는 design.md '순수 함수' 번호와 함께 적는다.

## D. 초안 (`/design-draft`, 구현 전)

- [x] D1. `.doan/canvases/buzz-add-projects.html`에 페이지 초안을 새 파일로 그렸다. 프레임과 타일은 design.md '초안'대로다. 4차를 사용자가 확정했다(2026-10-30, 문구 포함).
  - 검증: `go run ./cli/cmd/doan check --json --repo .`에 이 파일의 오류가 없고, `go run ./cli/cmd/doan ls --json --repo .`에 `buzz-add-projects`의 프레임 id가 design.md '초안'과 같다. 사용자가 앱에서 초안을 확정한다.

── commit: `docs(design): buzz-add-projects draft` / `docs(design): buzz-add-projects draft revision` (완료) ──

## T. 순수 함수 (`/tdd` → `/implement`)

- [ ] T1. `addPageReturn`·`leaveLocked`(design 1·2) 테스트를 먼저 쓰고 red를 확인한 뒤 구현한다. 사례: origin Home·워크스페이스에서 Projects 탭·Cancel·Escape, 완료(신규·이미 등록), LNB 행, 페이지에서 다시 열기(무시), clone 중(cloning, 취소 중) 모든 이동 무시, cloneCancelled 뒤 이동 허용.
  - 검증: `npm --prefix app test` 통과(구현 전 red 기록).
- [ ] T2. `menuItems` 확장(design 3) 테스트를 먼저 쓴다. 사례: `addProjects` 화면의 Add Project…·Home·Quick Open·캔버스 명령, `locked`의 비활성 목록과 Settings… 활성, 기존 modal·Settings 포커스 규칙 무변경.
  - 검증: `npm --prefix app test`의 `menuState.test.ts` 통과(구현 전 red 기록, 기존 단언 무수정).
- [ ] T3. `dropFolder`(design 4)와 `homeComposer` 폴더 드롭 안내(design 7) 테스트를 먼저 쓴다. 사례: 폴더 하나, 파일 하나, 폴더 둘, 폴더와 파일, 빈 목록, 경로 없는 항목.
  - 검증: `npm --prefix app test` 통과(구현 전 red 기록).
- [ ] T4. `projectFooter`(design 5) 테스트를 먼저 쓴다. 사례: 온보딩 쓰임의 모든 phase가 지금 문구·동작과 같음, 페이지 쓰임의 choose·candidates·setup·clone·cloning·cloneCancelled 하단, `no_ready_agent` notice가 페이지에 없음.
  - 검증: `npm --prefix app test` 통과(구현 전 red 기록). 기존 `onboardingView.test.ts`·`Onboarding.test.tsx` 무수정 통과.
- [ ] T5. `addPageRequest`(design 6) 테스트를 먼저 쓴다. 사례: 각 요청 종류의 정상 모양, 알 수 없는 키, 문자열이 아닌 값, 상대 경로, 4096자 초과, 잘못된 GitHub URL.
  - 검증: `npm --prefix app test` 통과(구현 전 red 기록).

── commit: `feat(app): Add Projects page navigation, menu, drop and request rules` ──

## M. main

- [ ] M1. 페이지용 project IPC(design 'main의 페이지용 project 호출')와 File > Add Project…의 페이지 열기. 온보딩 세션·완료 기록·socket을 거치지 않는다. clone은 한 번에 하나, 취소 정리는 온보딩과 같다.
  - 검증: `npm --prefix app test`(새 IPC 단위 테스트: `fromWindow`가 아닌 요청 거부, 잘못된 요청 거부, 등록이 `projectDeps`를 거침), `npm --prefix app run typecheck`. 기존 `app/src/main/onboarding/*.test.ts`·`addProjects.test.ts`(남는 부분) 통과.

── commit: `feat(app): main handlers for the Add Projects page` ──

## U. 렌더러

- [ ] U1. 화면 모델에 `addProjects`와 origin을 더하고, 헤더 캡슐 Add Projects / Projects를 페이지 탭으로 만든다(`aria-current`, clone 중 `aria-disabled`). 진입점 세 곳(헤더, 메뉴, Home 입력창 Add Projects…)을 페이지로 바꾼다. 워크스페이스는 Home과 같은 방식으로 숨긴다. LNB 행과 Escape의 잠금을 연결한다.
  - 검증: `npm --prefix app test`(`App.test.ts`·`App.home.test.ts`·`App.history.test.ts` 등 화면·기록 테스트 통과, 페이지가 방문 기록과 `savedUiState`에 남지 않는다는 단언 추가), typecheck. design.md POSTMORTEM 함정의 `rg` 확인 결과를 커밋 메시지가 아닌 handoff에 남긴다.
- [ ] U2. `AddProjectsPage.tsx`와 페이지 세션. `ProjectScreen`·`ProjectStepSession`을 쓰임별로 넓혀 재사용한다(T4). 'Your projects' 없음, 하단 Cancel·주 버튼, 완료 뒤 Home 선택과 LNB 강조(새 폴더 목록을 기다림).
  - 검증: `npm --prefix app test`(렌더 테스트: 제목 포커스, 하단 버튼, candidates 라디오, setup 문구), typecheck.
- [ ] U3. 'Open a local folder' 카드 드롭(페이지와 온보딩 공통), 드롭 중 표시, notice, 창 전역 드롭 기본 동작 방지. Home 입력창 안내 문구.
  - 검증: `npm --prefix app test`, typecheck.
- [ ] U4. 온보딩 공유 개선(design '온보딩과의 공유' 2·3): 온보딩의 전체 폭 스크롤 컨테이너와 clone 중 이유 한 줄. 페이지와 같은 컴포넌트·규칙을 쓴다.
  - 검증: `npm --prefix app test`(`Onboarding.test.tsx`·`onboardingView.test.ts` 통과, 스크롤 컨테이너 마크업과 clone 중 줄 단언 추가), typecheck.
- [ ] U5. CSS: 페이지 패널 스크롤, 본문 열, 카드 드롭 표시, 온보딩 스크롤 영역을 초안 값으로 `styles.css`에 둔다. `.ob-scene`의 `overflow`·`native-scroll`을 옮기고 대체한 옛 규칙은 지운다. JS에서 CSS를 import하지 않는다.
  - 검증: `npm --prefix app test`(`ds/checks.test.ts` 포함), `npm --prefix app run build`.

── commit: `feat(app): open Add Projects as a shell page` / `feat(app): share Add Projects improvements with first run` ──

## R. 정리

- [ ] R1. `AddProjectsDialog.tsx`(`SetUpFolderConfirm` 포함), `DropOverlay.tsx`, 그것만 쓰던 preload API·main 채널·체크리스트 스캔 코드·CSS·테스트를 지운다. 온보딩 등록이 쓰는 `addFlow.add`·`flow.confirm` 판단은 남긴다.
  - 검증: `rg -n 'AddProjectsDialog|SetUpFolderConfirm|DropOverlay|add-dialog|folders:add-paths|folders:add-candidates' app/src` 결과 없음. `npm --prefix app test`, typecheck, build 통과.

── commit: `refactor(app): remove the Add Projects dialog and window drop` ──

## S. 대조와 실제 앱 확인

- [ ] S1. `/design-sync`로 초안과 구현을 computed style로 맞춘다. 개발·프로덕션 빌드 모두에서 페이지 열 너비와 드롭 표시를 잰다. 페이지 패널과 온보딩 스크롤 영역이 스크롤 컨테이너이고(`scrollbar-width: thin`), 스크롤바가 그 오른쪽 끝에 있는지 잰다. 온보딩은 Agent·Project 단계 모두 잰다. candidates 20개 이상에서 본문이 스크롤되어 마지막 카드와 주 버튼에 닿는지 잰다. 남는 차이는 근거와 함께 DESIGN.md에 적는다.
  - 검증: `/design-sync`의 측정 스크립트(`node .scratch/design-sync/buzz-add-projects/measure.mjs`) 결과에 기록되지 않은 차이가 없다.
- [ ] S2. `/runtime-test`로 바뀐 동작만 짧게 확인한다(probe `node .scratch/runtime-test/buzz-add-projects/probe.mjs`, `app/runtime/` 격리).
  - 진입점 세 곳, 숨은 창에서 Cmd+O.
  - 설정된 저장소 추가 → Home 선택·LNB 강조. 설정 안 된 저장소 → Set up → Home. 저장소 여럿인 폴더 → 하나 고르기. 이미 등록된 폴더 → Home 선택.
  - GitHub URL: 등록된 checkout 재사용(그 checkout의 `origin`을 GitHub URL로 둔 임시 저장소). clone과 Cancel 정리는 작은 공개 저장소로 확인하고, 네트워크가 막히면 미확인으로 기록한다.
  - clone 중 헤더 탭·LNB 행·Go > Home·Quick Open·Escape가 페이지를 떠나지 않음, Cancel 뒤 떠날 수 있음.
  - 드래프트가 있는 캔버스 워크스페이스에서 열고 Projects 탭·Escape로 돌아왔을 때 캔버스·뷰·드래프트·`doan active`가 그대로.
  - 카드 드롭(합성 이벤트), 여러 항목·파일 notice, 카드 밖 드롭이 아무 일도 하지 않고 창이 이동하지 않음. 온보딩 Project 단계의 카드 드롭, 온보딩 Agent·Project 단계를 낮은 창에서 끝까지 스크롤, 온보딩 clone 중 이유 한 줄. 네이티브 Finder 드롭은 가능하면 확인하고, 막히면 미확인으로 기록한다.
  - 접근성 트리: 헤더 Add Projects `aria-current`, 페이지 제목, 라디오 카드.
  - 검증: probe가 완료 표시와 함께 exit 0이고 실제 사용자 상태 전후 확인을 통과하며 스크린샷을 남긴다.
- [ ] S3. DESIGN.md에 페이지 측정값과 초안과의 차이를 새 절로 적고, 'Onboarding' 절에 공유 개선(카드 드롭, 스크롤 컨테이너, clone 중 줄)의 측정값을 더하고, 'Projects home' 절과 'Shared dialog' 줄의 Add Projects 체크리스트·다이얼로그 부분을 대체 표시한다.
  - 검증: `grep -n 'Add Projects page' docs/DESIGN.md`에 새 절이 있다. `grep -n 'add-dialog' docs/DESIGN.md`의 남은 줄은 모두 대체 표시가 있다.

── commit: `fix(app): align the Add Projects page with its draft` / `docs(design): record buzz-add-projects measurements` ──

## Z. 승격과 정리

- [ ] Z1. `node .agents/skills/verify/scripts/verify.mjs` 통과.
  - 검증: exit 0, 로그는 `.scratch/verify/`.
- [ ] Z2. 결론 승격.
  - PRODUCT §5 항목 0 First run의 Project step 문장(카드 드롭, clone 중 줄)과 헤더 문장(Add Projects / Projects가 페이지를 오간다), 항목 1의 Add Projects 문단(페이지, 하나씩, 그 자리 설정, 카드 드롭, 완료 뒤 Home, clone 중 잠금), Home 입력창 폴더 드롭 문장, 'First run registers its chosen project through the same addition flow' 문장.
  - PRODUCT §7에 buzz-add-projects 줄(확정한 결정 1~7, Buzz에 대응 화면이 없어 온보딩 Project 단계를 정본으로 삼은 점)과, 대체되는 행(2026-10-24 projects-home 결정 3, 2026-10-25 R1·'Checking… candidates'·'Scan snapshots'·'File > Add Project… (Cmd+O)')에 "(superseded 2026-10-30 by buzz-add-projects …)" 표시.
  - PRODUCT §8 후속: Git이 찾은 미등록 워크트리를 LNB에서 더하는 길.
  - ARCHITECTURE §7: 'Screens'·'Memory'의 화면 모델과 `AddProjectsDialog`·`SetUpFolderConfirm`·`DropOverlay` 언급, 메뉴 표(Add Project…)와 'Menus' 줄의 `addProjects`·`locked`, 페이지용 project IPC.
  - 부모 spec 공통 결정 6(하나씩 추가·워크트리 제안 제거라는 보존 예외)과 공통 결정 10(`AddProjectsDialog` 삭제).
  - 검증: `grep -n '^| 2026-10-30 | buzz-add-projects' docs/PRODUCT.md`에 §7 줄이 있다. `grep -n 'superseded 2026-10-30 by buzz-add-projects' docs/PRODUCT.md`에 대체 표시가 있다. `grep -n 'AddProjectsDialog\|DropOverlay' docs/ARCHITECTURE.md` 결과가 없거나 대체 설명뿐이다. `grep -n 'buzz-add-projects' docs/features/buzz-restyle/spec.md`에 공통 결정 6·10 줄이 있다.
- [ ] Z3. `docs/features/buzz-add-projects/`를 지운다.
  - 검증: `ls docs/features/buzz-add-projects` 실패.

── commit: `docs(product): promote buzz-add-projects` / `docs(architecture): promote buzz-add-projects` / `docs(feature): complete buzz-add-projects` ──
