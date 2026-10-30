# buzz-add-projects — spec

부모 [buzz-restyle](../buzz-restyle/spec.md)의 자식 5번이다. 헤더 Add Projects, Cmd+O, File > Add Project…가 네이티브 폴더 선택 대신 AppShell 안의 페이지를 연다. 페이지는 온보딩 Project 단계를 재사용해 프로젝트를 하나씩 추가한다. 헤더 캡슐 Add Projects / Projects가 페이지를 오가는 탭이 되는 첫 자식이다. 선행 `buzz-shell`(PR #30)과 `buzz-onboarding`은 main에 병합됐다. 부모 공통 결정 1~14를 따른다.

## 사용자

- **사람(앱 사용자)**: 헤더 Add Projects, Cmd+O, File > Add Project…, Home 입력창의 Add Projects…로 페이지를 열고, 로컬 폴더나 GitHub URL로 프로젝트를 하나 추가한다. 설정이 필요한 폴더는 그 자리에서 설정한다. 추가가 끝나면 Home에서 그 프로젝트가 골라져 있다. 창 아무 데나 폴더를 놓아 추가하던 동작과 여러 폴더·하위 저장소 체크리스트·워크트리 제안이 없어진다. 첫 실행 Project 단계도 결정 8의 공유 개선을 받는다.
- **에이전트**: 바뀌는 것이 없다. CLI, MCP(`onboarding_*` 포함), 스킬, 공유 포맷은 그대로다. 온보딩 카드 드롭은 렌더러 입력일 뿐이고, 세션에는 지금 Choose folder와 같은 inspect 요청으로 들어가므로 socket·CLI·MCP 응답 모양이 바뀌지 않는다.

## 확정한 결정 (2026-10-30 user)

1. **하나씩 추가한다.** 페이지는 온보딩 Project 단계처럼 한 번에 프로젝트 하나를 추가한다. 여러 폴더 선택(`multiSelections`)과 하위 저장소·워크트리 체크리스트(`AddProjectsDialog`)는 없앤다. 고른 폴더 안에 저장소가 여럿이면 온보딩처럼 그중 하나를 고른다(라디오 카드). 부모 공통 결정 6(기존 기능 보존)의 예외다.
2. **폴더 드롭은 'Open a local folder' 카드에만 받는다.** 창 전체 드롭(`DropOverlay`)은 없앤다. 같은 카드 드롭을 온보딩 Project 단계에도 더한다. 드롭 중 표시는 Home 입력창의 드롭 표시(`.drop-target`: accent 점선 외곽선과 흐림)를 따른다. 폴더 하나를 놓으면 Choose folder로 고른 것과 같다.
3. **추가한 뒤에는 Home으로 간다.** 입력창 프로젝트 선택기에 그 프로젝트를 고르고 LNB 행을 강조한다. 온보딩 완료, 지금의 중복 추가와 같은 도착점이다. 워크스페이스에서 열었을 때 보이던 "Added <이름>" 토스트와 Open은 없어진다.
4. **설정이 필요한 폴더는 페이지에서 바로 설정한다.** 온보딩처럼 Set up을 눌러야 `.doan/config.json`, `.doan/canvases/`, `.gitattributes` 한 줄을 쓴다. 토큰 CSS는 고르지 않는다(나중에 Settings). "설정 없이 추가" 버튼은 없다. 예외: Set up이 실패하면(`init_failed` 등) 온보딩과 같이 폴더는 Not set up으로 LNB에 남고, 페이지는 오류와 Retry·Choose another folder를 보인다(feature-review).
5. **같은 저장소의 다른 워크트리 제안은 없앤다.** 다른 워크트리는 그 폴더를 하나씩 추가한다. 온보딩도 이 제안을 버린다(`app/src/main/index.ts:645-655`, 649행 `flow.cancel(outcome.scanId)`).
6. **Projects 탭, Back, Cancel, Escape는 origin으로 돌아간다.** origin은 'Projects 쪽 마지막 화면'(`home` 또는 `workspace`)이다. 워크스페이스면 캔버스·뷰·드래프트가 그대로다. 페이지가 열린 사이에 origin 프로젝트가 제거됐으면 Home으로 간다. Forward는 페이지에서 비활성이다(feature-review).
7. **설정을 쓰는 중과 clone 중에는 페이지를 떠날 수 없다.** 잠금은 `selecting`과 `cloning`(취소 중 포함) phase다. App의 모든 이동 함수가 한 곳에서 판정한다(design '잠금'). 페이지의 Cancel로 clone을 멈추면(온보딩과 같은 정리) 다시 떠날 수 있다. clone 중에만 이유 한 줄을 보인다(feature-review: 범위를 selecting과 이동 함수 전체로 넓혔다).
8. **온보딩 Project 단계와 한 화면을 공유한다.** 페이지를 만들며 생긴 디자인 개선은 온보딩에도 같이 들어간다. 이번에 공유하는 개선은 셋이다. (1) 'Open a local folder' 카드 드롭. (2) 스크롤 컨테이너를 560px 본문 열에서 화면 전체 폭으로 옮겨, 얇은 macOS 스타일 스크롤바(`.doan-scroll`)가 페이지는 흰 패널, 온보딩은 창의 오른쪽 끝에 나온다. 온보딩 Agent 단계도 같은 장면 구조라 함께 바뀐다. (3) clone 중에 떠날 수 없는 이유 한 줄. 일부러 다른 부분은 design.md '온보딩과의 공유'의 표에 적은 것뿐이다.
9. **main에서는 온보딩의 project 처리를 공유한다.** `OnboardingService`의 project 부분(inspect 세대와 오래된 요청 거부, busy, leftovers 기록, clone 추적, 종료 정리)을 클래스로 떼어 온보딩과 페이지가 각자 인스턴스를 갖는다. 앱 종료는 온보딩처럼 clone을 멈추고 정리하고, Cmd+W 숨김은 페이지와 clone을 유지하며, 렌더러 reload는 페이지 clone을 취소한다(feature-review).
10. **PRODUCT §3 범위 밖 6의 Git 예외를 넓힌다.** "첫 실행 온보딩의 GitHub URL clone"을 "첫 실행과 Add Projects 페이지의 GitHub URL clone"으로 바꾼다. 같은 clone 코드, 사용자의 기존 Git 자격, 정리 규칙을 쓰고, 브랜치·워크트리·fetch 같은 다른 git 동작은 여전히 범위 밖이다(feature-review). 승격 task Z2가 §3과 §7을 고친다.

## 문제 (관찰한 사실, 2026-10-30 main `c5e69484`)

- 헤더 Add Projects는 `window.doan.addProjects()` → main `addFromDialog()`(`app/src/main/index.ts:499`)로 네이티브 폴더 선택(여러 개)을 연다. Home 입력창의 Add Projects…도 같은 호출이다(`HomeComposerView.tsx:514, 517`). 결과는 토스트, 체크리스트 다이얼로그(`AddProjectsDialog`), "Set up <이름> as a Doan project?" 확인(`SetUpFolderConfirm`)으로 흩어진다.
- 헤더 캡슐의 Projects는 이동 동작이 없는 선택 표시다(`App.tsx:620`, PRODUCT §5 항목 0).
- 창 전체 드롭은 `DropOverlay`가 받아 같은 추가 흐름으로 보낸다. Home 입력창 위의 폴더 드롭은 "Drop a folder outside the message to add a project." 안내를 보인다(`homeComposer.ts:25`).
- 온보딩 Project 단계는 같은 등록 판단(main `addFlow.add`)을 쓰면서 GitHub URL 재사용·clone, 저장소 고르기, 그 자리 설정을 이미 제공한다. 이 단계는 온보딩 세션(`OnboardingService`, CLI·MCP와 공유)과 완료 기록에 묶여 있다.
- Add Projects로 추가한 설정 안 된 저장소는 Not set up으로 저장되고, 설정은 LNB 프로젝트 메뉴 Set Up…에서 따로 한다.

## 완료 조건

1. 헤더 Add Projects, Cmd+O(File > Add Project…), Home 입력창의 Add Projects…가 같은 페이지를 연다. 숨은 창이면 창을 먼저 보인다. 모달이 열려 있거나 Settings 창에 포커스가 있으면 지금처럼 비활성이다. 네이티브 폴더 선택은 페이지의 Choose folder에서만 열린다(한 폴더, `multiSelections` 없음). 페이지의 choose phase에서 Cmd+O는 Choose folder를 열고, 다른 phase에서는 비활성이다. 확인: `menuState`·탐색 단위 테스트, main 단위 테스트(숨은 창, `multiSelections` 없음), probe에서 세 진입점.
2. 페이지는 AppShell 안(헤더, LNB, 흰 본문 패널)에 있고, 헤더의 Add Projects가 `aria-current="page"`, LNB 행은 `aria-current`가 없다. 확인: 렌더 테스트, probe의 접근성 트리.
3. 페이지 본문은 확정 초안 `.doan/canvases/buzz-add-projects.html`과 일치한다. 확인: `/design-sync` 측정에서 기록되지 않은 차이가 없다.
4. 로컬 폴더: 고른 폴더가 설정된 저장소면 바로 추가되고, 설정 안 된 저장소면 Set up을 보이고, 안에 저장소가 여럿이면 하나를 고르게 하며, 저장소가 아니고 안에도 없으면 온보딩과 같이 그 폴더의 설정을 묻는다. 읽을 수 없는 폴더는 빈 폴더로 다루지 않고 `project_unavailable` 안내를 보인다. 고른 뒤 사라진 폴더, symlink 경로(canonical root로 등록), 이미 등록된 폴더, 등록된 프로젝트 안의 폴더(중첩 저장소를 만들지 않음)가 온보딩과 같다. Set up 실패는 결정 4 예외대로다. 확인: 공유 project 클래스·페이지 세션 단위 테스트, probe.
5. GitHub URL: 온보딩과 같은 규칙으로 등록된 checkout을 재사용하거나, 사용자가 고른 폴더를 확인하거나, clone한다. 기본 clone 위치와 Change, `destination_exists`, `git_missing`, 실패·취소 정리(leftovers)가 온보딩과 같다. 한 번에 clone 하나이고, 온보딩(CLI·MCP 포함) clone과 같은 부모 폴더 leftovers 기록을 공유한다. 확인: `app/src/main/onboarding/service.test.ts`·`projects.test.ts`·`race.test.ts`·`timeouts.test.ts`가 그대로 통과하고, 페이지 인스턴스 단위 테스트가 같은 오류 코드와 정리를 낸다. 렌더러 페이지 세션 테스트가 같은 `projectNotice` 문구를 고른다.
6. 추가가 끝나면(이미 등록된 폴더를 고른 경우 포함) Home으로 가서 입력창에 그 프로젝트가 골라지고 LNB 행이 강조된다. 새 폴더 목록이 등록 응답보다 늦게 와도 그 root를 고른다. 확인: 탐색 단위 테스트(held 목록 사례), probe.
7. Projects 탭, Back, 페이지 Cancel, Escape는 origin으로 돌아가고, 워크스페이스의 캔버스·뷰·드래프트·`doan active`가 그대로다. origin 프로젝트가 사라졌으면 Home이다. Forward는 비활성이다. 페이지는 Back/Forward 기록과 재시작 복원에 남지 않고, 페이지 진입은 적용 전 startup 복원을 취소한다. 편집 중인 입력(URL 필드, IME 조합)에서 Escape는 페이지를 떠나지 않는다. 확인: 탐색 단위 테스트, probe에서 드래프트가 있는 캔버스에서 열고 돌아오기.
8. `selecting`·`cloning` 중에는 페이지를 떠나는 모든 이동이 막힌다: 헤더 Add Projects·Projects 탭, Back, LNB 행과 그 키보드 활성화, 프로젝트 메뉴의 Overview·워크트리 선택, Search, Go > Home, Quick Open, Add Project…, Next/Previous Resolved Comment, Undo Remove, 토스트의 Open, 코멘트 가드의 이동, Escape. Show in Finder·Project Settings·펼치기와 Settings…는 허용한다. Cancel로 clone을 멈춘 뒤에는 떠날 수 있다. 확인: `leaveLocked`·`menuState`·탐색 단위 테스트(이동 함수마다 한 사례), probe.
9. 'Open a local folder' 카드에 폴더 하나를 놓으면 Choose folder로 고른 것과 같다. 끄는 동안 카드에 드롭 표시가 보인다. 폴더가 아닌 파일, 여러 항목은 받지 않고, 포커스를 옮기지 않는 alert로 이유를 보이며, 다음 드래그나 Choose folder에서 지운다. busy 중에는 받지 않는다(`dropEffect = "none"`). 같은 카드 드롭이 온보딩 Project 단계에서도 된다. 카드 밖이나 다른 화면에 놓은 폴더는 아무 일도 하지 않는다. 확인: 드롭 판정 단위 테스트, 카드 렌더 테스트(status 문구, busy, 창 `dragover`·`drop` 기본 동작 방지), probe(합성 드롭과 네이티브 Finder 드롭 중 가능한 것, 네이티브가 막히면 미확인 기록).
10. Home 입력창 위 폴더 드롭 안내가 새 진입점을 가리킨다. 확인: `homeComposer` 단위 테스트.
11. `AddProjectsDialog`, `SetUpFolderConfirm`, `DropOverlay`와 그것만 쓰던 체크리스트 스캔·IPC·CSS·allowlist가 남지 않는다. 온보딩과 페이지가 쓰는 한 경로 등록 판단(store, duplicate, confirm)은 남는다. 확인: `rg -n 'AddProjectsDialog|SetUpFolderConfirm|DropOverlay|add-dialog|addFromDialog|folders:add|folders:scan|folders:confirm|watchScan|addCandidates|droppedPaths' app/src` 결과 없음, 기존 onboarding 테스트 통과.
12. 온보딩 Project 단계의 기존 동작과 CLI·MCP `onboarding_*` 계약이 그대로다. 바뀌는 것은 결정 8의 공유 개선 셋뿐이다. 확인: `app/src/main/onboarding/*.test.ts`, `Onboarding.test.tsx`, `onboardingView.test.ts` 통과, `git diff --exit-code main -- app/src/main/onboarding/fixtures cli/internal` 결과 없음.
13. 온보딩이 결정 8의 공유 개선을 갖는다: Project 카드 드롭, 창 오른쪽 끝의 얇은 스크롤바(Agent·Project 단계, Welcome은 보이는 변화 없음), clone 중 이유 한 줄. 페이지와 온보딩의 Project 화면 차이는 design.md '온보딩과의 공유' 표에 있는 것뿐이다. 두 쓰임이 같은 phase 포커스 규칙(design '포커스')을 쓴다. 확인: 공용 `ProjectScreen`과 포커스 훅의 렌더 테스트(두 쓰임), `/design-sync`의 온보딩 스크롤 컨테이너와 Welcome 측정, probe에서 온보딩 카드 드롭.
14. 결론이 승격됐다. PRODUCT §3 범위 밖 6(결정 10), §5 항목 0(헤더, First run Project step의 공유 개선)·항목 1(Add Projects, Home 입력창 드롭 안내), 이 feature의 결정 1~10이 대체하는 본문의 삭제(design.md '포맷·컨벤션·결정 영향'), §6 Open questions(미등록 워크트리 후속), ARCHITECTURE §7(화면 모델, 메뉴 상태, 공유 project 클래스; 채널·allowlist는 코드가 정본), DESIGN.md(페이지 측정값, Projects home 절의 Add Projects 부분 교체, Onboarding 절의 공유 개선), 부모 spec 공통 결정 6·10. 확인: tasks Z의 grep.
15. `node .agents/skills/verify/scripts/verify.mjs` 통과.

## 비목표

- 여러 폴더 한 번에 추가, 하위 저장소 여러 개 체크, 같은 저장소 워크트리 일괄 추가(결정 1·5).
- Git이 찾은 미등록 워크트리를 LNB 워크트리 선택에 보이는 일. 후속으로 남긴다(PRODUCT §3 범위 밖 6의 워크트리 생성과는 별개).
- 설정할 때 토큰 CSS 고르기. Settings > Projects에 있다.
- Settings 페이지와 헤더 Settings 탭의 이동(`buzz-settings`). 이 자식에서 Settings는 지금처럼 별도 창을 연다.
- 헤더 캡슐 탭의 화살표 키 이동(부모 '가져오지 않는 Buzz 동작'). 부모 비목표의 "페이지 탭"은 Buzz의 문서 페이지 탭이고, 이 자식의 헤더 캡슐 탭과 다르다.
- Locate…(사라진 프로젝트 다시 찾기)의 네이티브 폴더 선택. 그대로 둔다.
- 온보딩의 'Your projects' 목록을 페이지에 두는 일. 등록된 프로젝트는 이미 LNB에 있다.
- CLI·MCP에서 프로젝트를 추가하는 새 명령.
- 기존 `.doan/canvases/` 초안 갱신(공통 결정 11). 온보딩에 들어가는 공유 개선은 `buzz-onboarding.html`을 고치지 않고 새 초안의 `states-onboarding-drop` 타일로 그린다.
