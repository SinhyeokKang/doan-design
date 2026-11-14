# new-project-folder — tasks

`/feature-review` → `/design-draft`(사용자가 앱에서 확인) → `/ship`. 프롬프트·guide·CLI 출력이 바뀌지 않으므로 `/agent-eval`은 하지 않는다.

- [ ] 1. PoC(`.scratch/new-project-folder/`, design.md 'PoC 의존'): 격리 앱(임시 userData·HOME·SHELL)에서 `dialog.showSaveDialog`를 시트로 열고, 이미 있는 폴더 이름으로 Create, Replace/Cancel, 새 이름 Create를 네이티브 입력으로 확인한다. 첫 실행 창에서도 시트가 붙는지 본다. 검증: `node .scratch/new-project-folder/poc.mjs`가 완료 줄을 찍고 exit 0이며, 관찰(통과·실패·날짜)이 design.md에 적혀 있다.
  - 커밋 경계: 결과에 따라 design.md를 고친 문서 커밋.
- [ ] 2. `/design-draft`: `.doan/canvases/new-project-folder.html`에 'Open a local folder' 카드의 New folder(첫 실행과 Add Projects), 저장 창이 열린 동안의 잠긴 페이지, 이미 있음 알림, 만들기 실패 알림, 만든 뒤의 설정 패널. 문구는 `clarify` 프리셋으로 정한다. 검증: `doan check --repo . --json`, `doan ls --repo . --json`, 그리고 사용자가 앱에서 초안을 확인한다.
  - 커밋 경계: 초안.
- [ ] 3. `/tdd`: design.md '순수 함수' 1–4를 고정하고 red를 확인한다. 검증: `npm --prefix app test`가 새 테스트에서만 실패한다.
  - `defaultProjectParent`: 등록된 프로젝트가 있을 때·없을 때·HOME이 없을 때. 클론 `defaultDestination`의 기존 테스트가 가드.
  - `createProjectFolder`: 만듦, 이미 있는 폴더, 이미 있는 파일, 사라진 위치, 권한 거부(root면 건너뜀), 상대 경로, 등록된 프로젝트 안(만들지 않음).
  - `projectNotice`의 `folder_exists`·`folder_create_failed`.
  - `ProjectStep.newFolder`: 취소, 만듦 → 검사, 이미 있음 → 알림 → Use existing folder → 검사, 다른 이름 → 저장 창 다시, 실패, 다른 동작 중 무시.
- [ ] 4. `/implement`: 순수 함수. 검증: `npm --prefix app test`, `npm --prefix app run typecheck`.
  - 커밋 경계: 순수 함수와 테스트.
- [ ] 5. main·preload: `onboarding:new-folder` 처리기(저장 창 → `createProjectFolder`), `chooseFolder("project")`의 `createDirectory`, `senderAllowed.ts`, preload. 검증: `npm --prefix app test`, `npm --prefix app run typecheck`, `npm --prefix app run lint`.
  - 커밋 경계: main.
- [ ] 6. UI: 'Open a local folder' 카드의 New folder, 잠금·포커스·알림. 검증: `npm --prefix app test`, `npm --prefix app run typecheck`, `npm --prefix app run lint`, `npm --prefix app run build`.
  - 커밋 경계: UI.
- [ ] 7. `/design-sync`로 초안과 실제 앱을 맞춘다(새 버튼과 두 알림). DESIGN.md 'Add Projects page'에 잰 값을 적는다. 검증: `node .scratch/design-sync/new-project-folder/measure.mjs`의 모든 행이 차이 0이거나 문서화된 차이뿐이다.
  - 커밋 경계: `/design-sync` 수정과 DESIGN.md.
- [ ] 8. `/runtime-test`: 격리 앱(임시 userData·HOME·SHELL)에서 네이티브 입력으로 확인한다. 검증: `node .scratch/runtime-test/new-project-folder/probe.mjs`가 완료 줄을 찍고 exit 0이다(스크린샷 포함).
  - Add Projects: New folder → 저장 창의 위치가 마지막 등록 프로젝트의 부모 → 새 이름 Create → 폴더가 생기고 설정 패널(Include in Git 기본) → 설정하면 Home에 그 프로젝트.
  - 취소 → 아무것도 바뀌지 않고 `document.activeElement`가 New folder.
  - 이미 있는 이름 → 알림, 폴더 내용 그대로 → Use existing folder → 검사.
  - 쓸 수 없는 위치 → 실패 알림, 아무것도 만들어지지 않음. 등록된 프로젝트 안의 위치 → 거부 알림, 아무것도 만들어지지 않음.
  - Choose folder 창에 New Folder 버튼.
  - 첫 실행 Project 단계에서 New folder → 설정 패널.
- [ ] 9. `/code-review` → `/refactor` → `/verify`. 검증: `node .agents/skills/verify/scripts/verify.mjs`.
  - 커밋 경계: `/refactor` 수정.
- [ ] 10. 결론을 승격하고 `docs/features/new-project-folder/`를 삭제한다. 문서마다 커밋한다. 검증: `test ! -d docs/features/new-project-folder`, `grep -c "New folder" docs/PRODUCT.md`가 1 이상.
  - PRODUCT §5 item 0 'Project step'(New folder, 기본 위치, 이미 있음, Choose folder 창의 New Folder)과 item 1 'Add Projects'.
  - ARCHITECTURE §7 'Settings IPC' 'Project addition'에 `onboarding:new-folder`와 main이 폴더를 만든다는 규칙.
  - 커밋 경계: 문서 승격.
