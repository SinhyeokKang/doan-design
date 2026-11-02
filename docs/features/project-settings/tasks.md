# project-settings — tasks

- **선행 조건**: 시안 `buzz-project-settings`를 2026-11-03 결정에 맞게 고치고 사용자가 앱에서 확인한다. main에서 `/design-draft`로 하고 `/tdd`보다 먼저 한다. 61d515e8에서 고쳤고, 사용자가 2026-11-03 chain-261103 시작 점검에서 확정했다. `/design-sync`는 이 리비전을 기준으로 한다. 고친 내용은 다음과 같다.
  - Back 활성
  - Not set up·CLI error 타일의 Show in Finder
  - 말줄임표 없는 라벨
  - 상태줄 Remove from Doan
  - "Stored in" 안내, 그리고 정상 상태에서만 보이기
  - Shared의 Saving/Saved와 오류 위치
  - Share 확인 문구
  - Read failed 문구
  - CLI error 문구를 코드의 "can’t be read or changed."에 맞춤
  - Missing 프로젝트의 사이드바를 상태줄만 보이고 그룹은 없게(PRODUCT §5 항목 1)
- **실행 경로**: `/ship` 또는 `/orchestrate`로, `feat/project-settings` 브랜치에서 한다. `/design-sync`(T9)는 그 브랜치 안에서 돈다.
- **순서**: 순수 함수 → 페이지 UI → 셸(I/O)과 연결 → 라벨 → 실제 앱 → 가이드 → eval → 측정 → 승격. 포맷 변경이 없어 스키마 단계는 없다. `──` 줄이 커밋 경계이고, 각 커밋은 typecheck와 테스트를 통과한다.

- [ ] T1. 내비게이션: `addProjectsNav.ts`에 `"projectSettings"` 페이지와 `gone` 이벤트를 더한다. 표 테스트로 고정한다.
  - 다른 페이지에서 들어오면 origin을 유지한다.
  - 잠금 중이면 `stay`다.
  - `gone`은 잠금 중에도 origin으로 간다.
  - origin 프로젝트가 사라졌으면 Home으로 간다.
  
  재진입 판정도 같은 방식으로 고정한다. 같은 root는 제목 포커스, 다른 root는 전환하고 origin을 유지, 잠금은 무시다. 확인: `npm --prefix app test` (`addProjectsNav.test.ts` 새 케이스 green), `npm --prefix app run typecheck`.
- [ ] T2. 규칙: `projectSettingsRules.ts`에 새 함수만 더한다. 기존 함수는 다이얼로그가 쓰고 있으므로 지우지 않는다.
  - `followProjectSettings`에 `leave` 분기와 reroot·확인 취소 판정을 더한다.
  - `projectSettingsLocked`, `projectSettingsPageView`, `writeErrorMessage`, 쓰기 뒤 포커스 대상 함수를 더한다.
  
  확인: `npm --prefix app test` (`projectSettingsRules.test.ts`가 시안 상태 타일마다 한 줄, `unavailable` 매핑 포함), `npm --prefix app run typecheck`.

── 커밋: `feat(app): Project Settings page rules`

- [ ] T3. 페이지 컴포넌트: `ProjectSettingsPage.tsx`를 시안대로 그린다(헤더, Token CSS, Shared with canvases, Remove from Doan, 문제 notice, Share 확인, 인라인 상태와 오류, 포커스 규칙). 이 단계에서는 App에 연결하지 않고 컴포넌트 테스트만 한다. 확인: `npm --prefix app test` (`ProjectSettingsPage.test.tsx`: 모든 상태, Shared의 Saving/Saved와 오류 위치, alertdialog 포커스 가드, 확인이 열린 채 쓰기가 끝나는 경우, 확인 중 문제 상태가 되면 확인 취소, 쓰기 뒤 포커스), `npm --prefix app run typecheck`.

── 커밋: `feat(app): Project Settings page component`

- [ ] T4. 셸 연결과 다이얼로그 삭제(한 커밋):
  - `App.tsx`에 `projectSettings` 화면, `openProjectSettings`, design '영향 범위'의 App 분기를 더한다.
  - 페이지 잠금 보고와 토스트 일시정지를 넣는다.
  - 메뉴 상태는 `screen: "settings"`와 `locked`로 보낸다.
  - 그룹 단위 제거로 바꾸고, reroot 때 App root와 origin을 동기화한다.
  - `shellNavigation.ts`의 Projects 탭을 처리한다.
  - `ShellSidebar.tsx`는 잠금 중 Project Settings를 `aria-disabled`로 바꾸고, 이 페이지에서 current 행을 없앤다.
  - `ProjectSettingsDialog.tsx`와 그 테스트, 다이얼로그 전용 규칙(`problemActionCloses`, `closedFocus`, `canCloseProjectSettings`)을 지운다.
  - 다이얼로그를 쓰던 App 테스트를 다시 쓴다(`App.settings.test.tsx`의 "even while Add Projects is locked", `App.terminalWork.test.tsx`의 다이얼로그 cancel·busy 링크 테스트는 `ProjectSetupDialog`로 옮긴다).
  
  새 케이스는 다음과 같다.
  - 홈·워크스페이스·Add Projects에서 들어오기
  - Projects 탭·Back·Escape·사이드바 행으로 떠나기
  - 같은 페이지에서 다른 워크트리로 바꾸기
  - 잠금 중 바깥 진입점 차단(다른 워크트리의 Project Settings, Settings…, 로그인 토스트, 알림 클릭)
  - 잠기지 않은 페이지에 `doan://` 링크가 오면 떠나고, 잠긴 페이지에 오면 버림
  - Add Projects 잠금 중 메뉴 항목 비활성
  - 잠금 중 제거되면 떠남(`gone`)
  - Locate·Set Up reroot 뒤 origin 유지
  - Set Up 다이얼로그가 바깥에서 닫힐 때 포커스
  - A→B로 빠르게 두 번 들어왔을 때 A 세션의 늦은 응답이 B에 쓰이지 않음
  - 실행 중 대화가 있을 때 제거 확인과 Cancel 뒤 포커스
  - 메뉴 상태 전송값, 잠금 중 토스트 멈춤
  
  확인: `npm --prefix app test` (`App.settings.test.tsx`, `App.terminalWork.test.tsx`, `ShellSidebar.interaction.test.tsx`, `shellNavigation.test.ts` green), `npm --prefix app run typecheck`, `npm --prefix app run build`.

── 커밋: `feat(app): Project Settings opens as a page`

- [ ] T5. 복구 라벨과 문구: `Home.tsx`(상태줄, Remove → Remove from Doan)·`ShellSidebar.tsx`·`ProjectOverview.tsx`의 라벨 표, 캔버스 복구 문구(`App.tsx`, `CanvasController.ts` → "Use Locate above." / "Use Set Up above."), main 시트 제목(`app/src/main/index.ts`의 "Locate…" → "Locate", "Add to Serve" → "Add File or Folder")을 바꾼다. 기존 기대값(`CanvasController.test.ts`, `ShellSidebar.interaction.test.tsx`, `projectSettingsRules.test.ts`)과 옛 표기 주석(`projectSettingsRules.ts`, `ProjectSetupDialog.tsx`, `main/index.ts`, `configBridge.ts`, `preload/index.ts`)도 고친다. 확인: `npm --prefix app test`, `grep -rn 'Locate…\|Set Up…\|Add to Serve' app/src` 결과 없음.

── 커밋: `feat(app): recovery labels drop the ellipsis`

- [ ] T6. 실제 앱 확인: `/runtime-test`로 다음을 짧게 확인한다.
  - 메뉴 → 페이지
  - 값 변경과 Saved
  - Share 확인
  - Missing의 Locate
  - Remove from Doan 뒤 origin 복귀
  - 잠금 중 이탈 불가
  - 페이지 뒤의 메뉴 상태
  
  확인: probe가 완료 표시와 함께 exit 0으로 끝나고, 실제 상태가 실행 전후 같으며, 스크린샷을 기록한다.

- [ ] T7. 가이드: `cli/internal/cli/skill.md`의 Project Settings 안내와 사실 오류 네 곳(design '가이드 수정')을 고치고 `skill_test.go`의 "Settings › Projects" 고정을 새 문구로 바꾼다. 확인: `go test ./...`, `go vet ./...`.

── 커밋: `fix(cli): guide points to Project Settings and matches the CLI`

- [ ] T8. `/agent-eval`: T7 커밋에서 패키지를 빌드(`npm --prefix app run package`)하고 `node eval/run.ts --scenarios O1,O2,D12,D9 --round <name>`을 돌려 `docs/USABILITY-EVAL.md`에 기록한다. 규칙 7을 다루는 시나리오는 없어서 측정하지 않았다고 적는다. 확인: 네 시나리오가 각자 직전 라운드보다 나빠지지 않음.

── 커밋: `docs(eval): project-settings guide round`

- [ ] T9. `/design-sync`: 고친 시안 `buzz-project-settings`와 페이지를 computed style로 맞춘다. 다음 DESIGN 항목을 다시 측정한다.
  - 'Settings'의 Project Settings 행, Lines under a row, Group query container, 미검증 목록
  - Dialogs의 Project Settings 예외, Status pill, Add Projects 'Lock ink'
  - 'Projects home'(제거 토스트, 상태줄, config 오류 상세). 측정 뒤 "buzz-ds 이전" 표시를 지운다.
  
  skill이 정한 대로 코드 수정을 먼저 커밋하고, 독립 `/code-review`와 게이트(test, typecheck, build, `/runtime-test`)를 거친 뒤 문서를 커밋한다. 확인: `node .scratch/design-sync/buzz-project-settings/measure.mjs`의 모든 행이 일치하거나 DESIGN에 기록됨.

── 커밋: `fix(app): …`(측정에서 고친 것이 있을 때), `docs(design): Project Settings page and Projects home remeasured`

- [ ] T10. 승격: 다음을 현재 규칙으로 고친다.
  - PRODUCT §5 항목 0: 'Settings page'의 페이지 사이 origin과 Settings… 잠금, 'Project Settings'의 페이지·이동·잠금·사이드바·Remove from Doan·Show in Finder, 항목 0의 2 `Set Up…`
  - PRODUCT §5 항목 1: Add Projects 잠금 중 Project Settings 비활성, 'Remove from Doan'의 위치·그룹 범위·복구 라벨·상태줄 라벨
  - PRODUCT §5 항목 8: `Set Up…`
  - ARCHITECTURE §7 'Settings IPC': 'Page and dialog', 'Config bridge'의 dialog session → 페이지 세션, 'Project Settings dialog' → 페이지
  - `docs/BACKLOG.md`: 잠금 중 링크 버림 항목의 "Project Settings while it works" → 잠긴 Project Settings 페이지
  
  그 뒤 이 디렉터리를 지운다. 부모 `docs/features/buzz-restyle/`는 건드리지 않는다. 병합 뒤 하네스 경로로 부모의 C13 체크, spec 표 13번 상태, design 'DESIGN.md 절과 담당'의 Projects home 행을 갱신한다(부모 design의 진행 규칙).
  
  확인:
  - `node .agents/skills/verify/scripts/verify.mjs` 통과
  - `grep -n 'ProjectSettingsDialog\|Project Settings dialog\|Locate…\|Set Up…' docs/PRODUCT.md docs/ARCHITECTURE.md docs/DESIGN.md docs/BACKLOG.md` 결과 없음
  - `grep -n '^> buzz-ds 이전' docs/DESIGN.md`에 'Projects home'이 없음
  - `docs/features/project-settings/` 없음

── 커밋: 문서마다 하나씩 (`docs(PRODUCT): …`, `docs(ARCHITECTURE): …`, `docs(BACKLOG): …`, `docs(feature): …`)
