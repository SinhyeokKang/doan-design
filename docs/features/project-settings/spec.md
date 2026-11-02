# project-settings — spec

buzz-restyle의 자식 13번이다([부모 spec 표](../buzz-restyle/spec.md)). 공통 디자인 언어와 진행 규칙은 부모 문서를 따른다. 화면 정본은 `.doan/canvases/buzz-project-settings.html`(프레임 `alt-2-page`, `alt-2-page-problem`, `alt-2-states`, `alt-2-states-problem`, `workspace-status`, `removal-toast`)이다. 시안은 이 문서의 결정(2026-11-03)에 맞춰 `/tdd` 전에 main에서 `/design-draft`로 고친다.

## 사용자

- **사람**: 사이드바 프로젝트 메뉴(또는 Overview의 복구 메뉴)에서 Project Settings를 열고 한 워크트리의 Token CSS와 캔버스에 공유할 경로를 바꾼다. 문제가 있는 워크트리에서는 같은 화면에서 복구하거나 Doan에서 제거한다.
- **에이전트**: `doan skill` 가이드가 이 화면을 정확히 가리켜야 한다. 대상은 서비스 범위 밖 CSS를 만났을 때 사용자에게 주는 안내와 가이드의 사실 오류 네 곳이다.

## 문제 (관찰된 사실)

1. Project Settings는 다이얼로그다(PRODUCT §5 항목 0 'Project Settings', `ProjectSettingsDialog.tsx`; 640px 폭은 DESIGN 'Settings'). Agents·Notifications는 이미 흰 본문의 Settings 열에 있는데, 워크트리 설정만 모달로 떠서 시각 언어가 다르다.
2. 다이얼로그에는 Root 행, Serve라는 내부 용어, `Change…`/`Add…`처럼 말줄임표가 붙은 버튼이 있다. 다이얼로그 안의 Remove from Doan은 문제 워크트리에만 있고, 그것도 그룹이 아니라 그 워크트리 하나만 지운다(`App.tsx`의 `remove([root])`). PRODUCT §5 항목 1과 사이드바 메뉴는 그룹 전체를 지운다.
3. `doan skill` 가이드(`cli/internal/cli/skill.md`)가 사실과 다르다.
   - 7번 규칙은 서비스 승인을 "Settings › Projects"에서 하라고 안내하는데, 그런 화면은 없다(`skill_test.go`가 이 문자열을 고정한다).
   - 65행은 "All commands accept `--repo`"라고 하고 87행은 "Onboarding takes no `--repo`"라고 해서 서로 모순된다. `onboarding`은 `--repo`를 usage 오류로 거부한다(`cli/internal/cli/onboarding_test.go`).
   - `onboarding status`의 `agents`를 공급자 배열처럼 설명하지만 실제 값은 `{revision, providers}`다(`app/src/main/onboarding/service.ts`).
   - `doan init`이 `.doan/canvases/`와 `.doan/config.json`만 만든다고 하지만 `.gitattributes`에 두 줄을 더한다(`init_audit_test.go`).
   - "Doan creates the CLI link when first opened"라고 하지만 링크는 `/Applications`나 `~/Applications`에서 바로 연 패키지 앱만 만든다(PRODUCT §5 항목 0의 1).
4. DESIGN 'Projects home'(제거 토스트, 워크스페이스 상태줄, config 오류 상세)에 "buzz-ds 이전" 표시가 남아 있고, 이 자식이 다시 측정하기로 되어 있다.

## 완료 조건

1. 프로젝트 메뉴(사이드바, Overview 복구 메뉴)의 Project Settings가 다이얼로그 대신 흰 본문의 Project Settings 페이지를 연다. 헤더 탭은 Projects가 현재 탭이다. 사이드바는 Home처럼 current 행 없이 프로젝트 트리를 보이고, 들어갈 때 펼침 상태를 바꾸지 않으며, 프로젝트 행을 누르면 그 프로젝트의 Overview로 간다(2026-11-03 user). 확인: App 테스트가 메뉴 선택 뒤 페이지 제목, 탭 상태, 사이드바 current 없음을 본다. `/runtime-test`로 실제 앱에서 연다.
2. 정상 워크트리 페이지는 시안 `alt-2-page`처럼 그린다. 헤더(썸네일, 프로젝트 이름, 브랜치, `~/…` 경로와 저장 위치 안내, Show in Finder) → Token CSS(값, Change/Clear, 없으면 안내와 Choose) → Shared with canvases(설명, 경로 목록과 Remove, Add File or Folder) → Remove from Doan(설명과 버튼). Root 행과 Done은 없다. 확인: 페이지 컴포넌트 테스트, `/design-sync` 측정.
3. 값은 바로 저장된다. Token CSS의 Saving/Saved는 그 행에, Shared with canvases의 Saving/Saved는 Add File or Folder 옆에 보인다. 쓰기 실패는 Token CSS 행 아래, 또는 Shared 목록 아래에 인라인으로 보인다(2026-11-03 user). 경로 추가는 페이지 위의 확인("Share <path> with canvases?", Cancel/Share)을 거친다. 확인: 컴포넌트 테스트(`alt-2-states`의 각 상태와 Shared의 상태).
4. 헤더의 Show in Finder는 폴더가 없다고 알려진 Missing과 아직 읽는 중(Still reading)에서만 숨긴다(2026-11-03 user). 문제 워크트리 페이지는 시안 `alt-2-page-problem`·`alt-2-states-problem`처럼 Token CSS와 Shared 섹션 자리에 경고 notice 하나와 복구 동작을 보이고, Remove from Doan은 그 아래 남는다.
   - Missing: Locate. 거부되면 인라인으로 안내한다.
   - Not set up: Set Up. 설정 다이얼로그가 페이지 위에 열린다.
   - Config error: Retry, Details. 상세는 인라인으로 펼친다.
   - CLI error: Retry.
   - 아직 읽는 중: Reading settings만.
   확인: 순수 view-model 표 테스트와 컴포넌트 테스트.
5. 페이지는 열린 워크트리를 따라간다. Locate나 Set Up으로 루트가 바뀌면(reroot) 새 루트의 페이지를 보이고(2026-11-03 user), 상태가 바뀌면 화면을 바꾸며, 워크트리가 목록에서 사라지면 페이지를 떠난다. 사라짐은 잠금보다 우선한다. 열린 확인은 취소로 닫고 떠난다(2026-11-03 user). 확인: `projectSettingsRules`·`addProjectsNav` 테스트.
6. 페이지 이동은 Settings·Add Projects 페이지 규칙을 따른다(2026-11-03 user). Projects 탭·Back·Escape로 떠나면 origin으로 돌아가고, origin 프로젝트가 사라졌으면 Home으로 간다. Add Projects 페이지와 이 페이지 사이를 오가도, 이 페이지에서 다른 워크트리로 바꿔도 origin을 유지한다. Back/Forward 방문이 아니고, 실행 시 복원하지 않는다. 확인: `addProjectsNav` 표 테스트.
7. 선택기, 확인, 쓰기가 진행 중이면 페이지를 떠나는 모든 길이 무시되고 비활성으로 보인다. 다른 워크트리의 Project Settings와 Settings 대상도 버린다. Add Projects 페이지가 잠긴 동안에는 Project Settings 메뉴 항목이 잠금 잉크로 보이고 열리지 않는다(2026-11-03 user). Settings 페이지의 사이드바에는 프로젝트 메뉴가 없어서 그 잠금 중 진입은 닿을 수 없는 경로이므로 따로 확인하지 않는다. 확인: 내비게이션 순수 함수 테스트, App·사이드바 테스트.
8. Remove from Doan은 정상·문제 상태 모두에서 그 워크트리가 속한 그룹의 등록 워크트리 전체를 지운다(PRODUCT §5 항목 1, 2026-11-03 user). 실행 중인 대화가 없으면 바로 지우고 Undo 토스트를 띄운다. 대화가 실행 중이면 기존 제거 확인을 먼저 보인다. 확인: App 테스트.
9. 프로젝트 복구 동작의 라벨에서 끝의 말줄임표를 앱 전체에서 뺀다. 페이지(Locate, Set Up, Change), 워크스페이스 상태줄, 사이드바 프로젝트 메뉴, Overview 복구 메뉴, main의 폴더 시트 제목이 대상이다("Locate…" → "Locate", "Add to Serve" → "Add File or Folder")(2026-11-03 user). 문구도 다음처럼 바꾼다(2026-11-03 user).
   - 워크스페이스 상태줄의 Remove → Remove from Doan
   - 캔버스 복구 문구 → "Use Locate above.", "Use Set Up above."
   확인: 라벨 표와 문구를 고정하는 테스트, `grep -rn 'Locate…\|Set Up…' app/src` 결과 없음.
10. 가이드의 Project Settings 안내와 사실 오류 네 곳을 고치고 `skill_test.go`가 새 문구를 고정한다. 확인: `go test ./...`. 가이드를 바꾸므로 `/agent-eval`을 돌려 `docs/USABILITY-EVAL.md`에 기록한다. 이때 O1·O2·D12·D9가 직전 라운드보다 나빠지지 않아야 한다. 규칙 7(서비스 범위 밖 CSS)을 다루는 시나리오는 없어서 측정하지 않는다.
11. DESIGN 'Projects home'을 다시 측정하고 "buzz-ds 이전" 표시를 지운다. DESIGN에서 다이얼로그를 전제로 쓴 곳(Dialogs의 Project Settings 예외, Status pill, Add Projects 'Lock ink', 'Settings'의 Project Settings 행·Lines under a row·Group query container·미검증 목록)을 페이지 기준으로 바꾼다. 확인: `/design-sync` 측정 기록.
12. PRODUCT §5 항목 0·1·8, ARCHITECTURE §7 'Settings IPC', BACKLOG가 페이지를 현재 규칙으로 서술한다. 그 뒤 이 디렉터리를 지운다.

## 비목표

- `.doan/config.json` 포맷, `doan config` 동작, config bridge의 보안 경계(한 번 쓰는 choice, main이 경로를 만듦)는 바꾸지 않는다.
- Settings 페이지 카테고리에 Projects를 다시 넣지 않는다. 이 페이지는 사이드바에 Settings 카테고리를 보이지 않는다.
- 프로젝트 복구 동작이 아닌 메뉴 항목(`Settings…`, `Add Project…` 등)과 Set Up 다이얼로그의 `Choose…`는 바꾸지 않는다.
- 제거 토스트는 시안대로 바꾸지 않는다. 다시 측정만 한다.
- 좁은 창 레이아웃, 아주 긴 경로·브랜치, 창을 숨긴 상태는 시안이 그리지 않았다. 기존 Settings 열 규칙(그룹 inline-size 컨테이너)만 따르고 DESIGN의 미검증 목록에 남긴다.
- 규칙 7을 다루는 eval 시나리오는 이번에 더하지 않는다.
- Settings 페이지 확인 다이얼로그가 열린 동안 Undo 토스트 타이머가 흐르는 틈은 이 feature의 범위가 아니다.
