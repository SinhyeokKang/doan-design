# project-settings — spec

buzz-restyle의 자식 13번이다([부모 spec 표](../buzz-restyle/spec.md)). 공통 디자인 언어와 진행 규칙은 부모 문서를 따른다. 화면 정본은 `.doan/canvases/buzz-project-settings.html`(프레임 `alt-2-page`, `alt-2-page-problem`, `alt-2-states`, `alt-2-states-problem`, `workspace-status`, `removal-toast`)이다.

## 사용자

- **사람**: 사이드바 프로젝트 메뉴(또는 Overview의 복구 메뉴)에서 Project Settings를 열고 한 워크트리의 Token CSS와 캔버스에 공유할 경로를 바꾼다. 문제가 있는 워크트리에서는 같은 화면에서 복구하거나 Doan에서 제거한다.
- **에이전트**: `doan skill` 가이드가 이 화면을 정확히 가리켜야 한다. 서비스 범위 밖 CSS를 만났을 때 사용자에게 안내하는 문구와, 가이드의 사실 오류 네 곳이 대상이다.

## 문제 (관찰된 사실)

1. Project Settings는 640px 다이얼로그다(PRODUCT §5 항목 0 'Project Settings', `ProjectSettingsDialog.tsx`). Agents·Notifications는 이미 흰 본문의 Settings 열에 있는데, 워크트리 설정만 모달로 떠서 시각 언어가 다르다.
2. 다이얼로그에는 Root 행, Serve라는 내부 용어, `Change…`/`Add…`처럼 말줄임표가 붙은 버튼이 있다. 정상 워크트리에서는 Remove from Doan을 할 수 없다(문제 워크트리만 복구 행에 있다).
3. `doan skill` 가이드(`cli/internal/cli/skill.md`)가 사실과 다르다.
   - 7번 규칙은 서비스 승인을 "Settings › Projects"에서 하라고 안내하는데, 그런 화면은 없다(`skill_test.go`가 이 문자열을 고정한다).
   - "All commands accept `--repo`"라고 하지만 `onboarding`은 `--repo`를 usage 오류로 거부한다(2026-11-03 직접 실행으로 확인).
   - `onboarding status`의 `agents`를 공급자 배열처럼 설명하지만 실제 값은 `{revision, providers}`다(`app/src/main/onboarding/service.ts`).
   - `doan init`이 `.doan/canvases/`와 `.doan/config.json`만 만든다고 하지만 `.gitattributes`에 두 줄을 더한다(`init_audit_test.go`).
   - "Doan creates the CLI link when first opened"라고 하지만 링크는 `/Applications`나 `~/Applications`에서 바로 연 패키지 앱만 만든다(PRODUCT §5 항목 0의 1).
4. DESIGN 'Projects home'(제거 토스트, 워크스페이스 상태줄, config 오류 상세)에 "buzz-ds 이전" 표시가 남아 있고, 이 자식이 다시 측정하기로 되어 있다.

## 완료 조건

1. 프로젝트 메뉴(사이드바, Overview 복구 메뉴)의 Project Settings가 다이얼로그 대신 흰 본문의 Project Settings 페이지를 연다. 헤더 탭은 Projects가 현재 탭이고, 사이드바는 프로젝트 트리를 그대로 보인다. 확인: App 테스트가 메뉴 선택 후 페이지 제목과 탭 상태를 본다. `/runtime-test`로 실제 앱에서 연다.
2. 정상 워크트리 페이지는 시안 `alt-2-page`처럼 그린다. 헤더(썸네일, 프로젝트 이름, 브랜치, `~/…` 경로와 저장 위치 안내, Show in Finder) → Token CSS(값, Change/Clear, 없으면 Choose와 안내) → Shared with canvases(설명, 경로 목록과 Remove, Add File or Folder) → Remove from Doan(설명과 버튼). Root 행과 Done은 없다. 확인: 페이지 컴포넌트 테스트, `/design-sync` 측정.
3. 값은 바로 저장된다. Saving/Saved가 해당 행에 보이고, 쓰기 실패는 그 행 아래에 인라인으로 보인다. 경로 추가는 페이지 위의 확인("Share <path> with canvases?", Cancel/Share)을 거친다. 확인: 컴포넌트 테스트(`alt-2-states`의 각 상태).
4. 헤더의 Show in Finder는 폴더가 없다고 알려진 Missing과 아직 읽는 중(Still reading)에서만 숨긴다(2026-11-03 user). 문제 워크트리 페이지는 시안 `alt-2-page-problem`·`alt-2-states-problem`처럼 Token CSS와 Shared 섹션 자리에 경고 notice 하나와 복구 동작을 보이고, Remove from Doan은 그 아래 남는다. Missing: Locate(거부 시 인라인 안내). Not set up: Set Up(설정 다이얼로그가 페이지 위에 열림). Config error: Retry, Details(상세는 인라인으로 펼침). CLI error: Retry. 아직 읽는 중: Reading settings만. 확인: 순수 view-model 테스트와 컴포넌트 테스트.
5. 페이지는 열린 워크트리를 따라간다. Locate로 루트가 바뀌면 새 루트를 보이고, 상태가 바뀌면 화면을 바꾸며, 워크트리가 목록에서 사라지면(제거 포함) 페이지를 떠난다. 확인: `projectSettingsRules` 테스트.
6. 페이지 이동은 Settings·Add Projects 페이지 규칙을 따른다(2026-11-03 user). origin을 기억하고, Projects 탭·Back·Escape로 떠나면 origin으로 돌아가며(origin 프로젝트가 사라졌으면 Home), Back/Forward 방문이 아니고, 실행 시 복원하지 않는다. 시안이 비활성으로 그린 Back은 활성이다. 확인: `addProjectsNav` 테스트.
7. 선택기, 확인, 쓰기가 진행 중이면 페이지를 떠나는 모든 길이 무시되고 비활성으로 보인다. Add Projects나 Settings 페이지가 잠긴 동안에는 Project Settings 메뉴 항목도 잠금 잉크로 보이고 열리지 않는다(2026-11-03 user). 확인: 내비게이션 순수 함수 테스트와 App 테스트.
8. 프로젝트 복구·설정 동작의 라벨에서 끝의 말줄임표를 뺀다. 페이지(Locate, Set Up, Change), 워크스페이스 상태줄, 사이드바 프로젝트 메뉴, Overview 복구 메뉴 모두다(2026-11-03 user). 캔버스 복구 문구도 라벨에 맞춘다("Use Locate to find it.", "Use Set Up to set it up."). 확인: 라벨 표와 문구를 고정하는 테스트.
9. 가이드의 Project Settings 안내와 사실 오류 네 곳을 고치고 `skill_test.go`가 새 문구를 고정한다. 확인: `go test ./...`. 가이드를 바꾸므로 `/agent-eval`을 돌려 `docs/USABILITY-EVAL.md`에 기록한다.
10. DESIGN 'Projects home'을 다시 측정하고 "buzz-ds 이전" 표시를 지운다. DESIGN의 다이얼로그 예외(Project Settings의 Done)와 'Settings'의 Project Settings 행을 페이지 기준으로 바꾼다. 확인: `/design-sync` 측정 기록.
11. PRODUCT §5 항목 0·1, ARCHITECTURE §7 'Settings IPC'가 페이지를 현재 규칙으로 서술하고 이 디렉터리를 지운다.

## 비목표

- `.doan/config.json` 포맷, `doan config` 동작, config bridge의 보안 경계(한 번 쓰는 choice, main이 경로를 만듦)는 바꾸지 않는다.
- Settings 페이지 카테고리에 Projects를 다시 넣지 않는다. 이 페이지는 사이드바에 Settings 카테고리를 보이지 않는다.
- 프로젝트 복구 동작이 아닌 메뉴 항목(`Settings…`, `Add Project…` 등)의 말줄임표는 바꾸지 않는다.
- 제거 토스트는 시안대로 바꾸지 않는다. 다시 측정만 한다.
- 좁은 창 레이아웃, 아주 긴 경로·브랜치는 시안이 그리지 않았으므로 기존 Settings 열 규칙(그룹 inline-size 컨테이너)만 따른다.
