# project-settings — tasks

순서: 순수 함수 → 셸(I/O) → UI → 가이드 → 측정 → 승격. 포맷 변경이 없어 스키마 단계는 없다. `──` 줄이 커밋 경계다.

- [ ] T1. 내비게이션: `addProjectsNav.ts`에 `"projectSettings"` 페이지를 더하고 `pageEnter`·`addPageReturn`이 origin 유지, 잠금, 같은 페이지 재진입을 처리한다. 확인: `npm --prefix app test` (`addProjectsNav.test.ts` 새 케이스 green).
- [ ] T2. 규칙: `projectSettingsRules.ts`의 `followProjectSettings`가 `leave`를 돌려주고, `projectSettingsLocked`·`projectSettingsPageView`·`writeErrorMessage`를 더하며 `problemActionCloses`·`closedFocus`를 지운다. 확인: `npm --prefix app test` (`projectSettingsRules.test.ts`가 시안 상태 타일마다 한 줄).

── 커밋: `feat(app): Project Settings page rules`

- [ ] T3. 셸: `App.tsx`에 `projectSettings` 화면, `openProjectSettings` 진입점, `locked()`·`savedScreen`·포커스 범위 분기를 더하고 모달 판정에서 뺀다. Settings·Add Projects·워크스페이스에서의 진입과 이탈, 잠금 중 바깥 진입점(다른 워크트리의 Project Settings, Settings…, 알림 클릭) 차단을 App 테스트로 고정한다. 확인: `npm --prefix app test` (`App.settings.test.tsx` 등 green), `npm --prefix app run typecheck`.

── 커밋: `feat(app): Project Settings opens as a page`

- [ ] T4. UI: `ProjectSettingsPage.tsx`를 시안대로 그린다(헤더, Token CSS, Shared with canvases, Remove from Doan, 문제 notice, Share 확인, 인라인 상태와 오류). `ProjectSettingsDialog.tsx`와 그 테스트를 페이지 테스트로 옮기고 지운다. Set Up은 페이지 위에 다이얼로그를 연다. 확인: `npm --prefix app test` (`ProjectSettingsPage.test.tsx`: 모든 상태, alertdialog 포커스 가드), `npm --prefix app run build`.
- [ ] T5. 복구 라벨: 워크스페이스 상태줄, 사이드바 메뉴, Overview 복구 메뉴의 Locate/Set Up 라벨과 캔버스 복구 문구(`App.tsx`, `CanvasController.ts`)에서 말줄임표를 빼고 "on Home" 안내를 고친다. 기존 테스트의 `Locate…`/`Set Up…` 기대값도 바꾼다. 확인: `npm --prefix app test` (라벨·문구 고정 테스트).
- [ ] T6. 실제 앱 확인: `/runtime-test`로 메뉴 → 페이지, 값 변경과 Saved, Share 확인, Missing의 Locate, Remove from Doan 후 origin 복귀, 잠금 중 이탈 불가를 짧게 확인한다. 확인: `/runtime-test` 스크린샷과 기록.

── 커밋: `feat(app): Project Settings page in the Settings column`

- [ ] T7. 가이드: `cli/internal/cli/skill.md`의 Project Settings 안내와 사실 오류 네 곳(design '가이드 수정')을 고치고 `skill_test.go`의 "Settings › Projects" 고정을 새 문구로 바꾼다. 확인: `go test ./...`, `go vet ./...`.

── 커밋: `fix(cli): guide points to Project Settings and matches the CLI`

- [ ] T8. `/agent-eval`: 가이드 변경 뒤 패키지를 빌드(`npm --prefix app run package`)하고 `node eval/run.ts`로 라운드를 돌려 `docs/USABILITY-EVAL.md`에 기록한다. 확인: 라운드 결과 기록, 회귀 없음.

── 커밋: `docs(eval): project-settings guide round`

- [ ] T9. `/design-sync`: 먼저 시안을 결정에 맞춘다(Back 활성, Not set up·CLI error 타일의 Show in Finder, 메뉴·상태줄의 말줄임표 없는 라벨; 차이를 DESIGN에 기록하지 않고 시안을 결정에 맞춘다). 그다음 시안 `buzz-project-settings`와 페이지를 computed style로 맞추고 DESIGN의 'Settings'(Project Settings 행, 다이얼로그 예외), 'Projects home'(제거 토스트, 상태줄, config 오류 상세)을 다시 측정해 "buzz-ds 이전" 표시를 지운다. 확인: `node .scratch/design-sync/buzz-project-settings/measure.mjs` 측정 결과, DESIGN 갱신.

── 커밋: `docs(design): Project Settings page and Projects home remeasured`

- [ ] T10. 승격: PRODUCT §5 항목 0 'Project Settings'(페이지, 이동, 잠금, Remove from Doan, Show in Finder 노출), 항목 1(Remove from Doan 위치, Add Projects 잠금 중 Project Settings 비활성, 복구 라벨 `Locate`/`Set Up`), ARCHITECTURE §7 'Settings IPC'('Page and dialog', 'Project Settings dialog' → 페이지, config 세션 수명)를 현재 규칙으로 고친다. 부모 `buzz-restyle/tasks.md`의 C13을 완료로 적고 이 디렉터리를 지운다. 확인: `node .agents/skills/verify/scripts/verify.mjs` 통과, `docs/features/project-settings/` 없음.

── 커밋: 문서마다 하나씩 (`docs(PRODUCT): …`, `docs(ARCHITECTURE): …`, `docs(feature): …`)
