# permission-mode — tasks

선행: 메뉴 z-index(PR #60)와 고르기만 해도 저장하는 규칙(PR #61)은 main에 들어왔다. 바로 시작할 수 있다.

## P. PoC (`.scratch/permission-mode/`, 커밋하지 않는다. 관찰은 이 문서와 커밋 메시지에 남긴다)

- [ ] P1. Claude: Doan profile과 임시 저장소에서 파일 편집 턴을 돌린다. SDK `permissionMode` 값은 `default`·`acceptEdits`·`plan`·`bypassPermissions`(+`allowDangerouslySkipPermissions`)다. 다음을 기록한다.
  - 각 모드에서 승인 요청이 뜨는지, 편집 결과
  - `ExitPlanMode`를 승인한 뒤 SDK가 다음 모드를 어떻게 알려 주는지
  - 폴더 settings가 bypass를 막을 때의 실패 형태와 대응할 `turn.failed` code
  - Default에서 적용되는 설정의 출처
  - 검증: design.md의 P1 칸(Plan 승인 뒤 전환, bypass 거부 code, Default의 범위)이 채워진다. 실행 command undecided — needs user confirmation (실제 Claude 계정과 모델 요청을 쓴다).
- [ ] P2. Codex 0.163.0 app-server: 다음을 기록한다.
  - Default 턴에 `config/read`로 읽은 approval·sandbox를 `turn/start`에 넘기면 사용자 설정으로 돌아가는지(`thread/resume` 뒤 포함)
  - `{type:"workspaceWrite"}`의 기본값이 사용자 network·writable_roots를 덮는지
  - Plan(`never`/`readOnly`)에서 편집 요청의 결과
  - 검증: design.md 모드 대응표의 Codex 열과 P2 칸이 채워진다. 실행 command undecided — needs user confirmation (실제 Codex 계정과 모델 요청을 쓴다).
- [ ] P3. ACP: Cursor·Antigravity·Copilot의 `session/new` 응답 `modes`와 `configOptions`의 mode 항목, `session/set_mode`·`session/set_config_option` 동작을 기록한다. 공통 id 대응표를 design.md에 채운다.
  - 검증: design.md에 ACP 대응표가 채워진다(대응이 없는 provider는 "없음"으로 적는다). 실행 command undecided — needs user confirmation (실제 계정을 쓴다).
- [ ] P4. P1–P3 결과로 design.md의 모드 대응표와 'Default의 범위'를 확정한다. 대응이 어긋나면(예: Codex가 되돌릴 수 없음) 사용자에게 묻는다.
  - 검증: design.md에 "P1에서 확인", "P2에서 확인", "P3에서 확인" 같은 미확정 표시가 남지 않는다.

── commit: `docs(feature): permission-mode PoC results` ──

## D. 초안

- [ ] D1. `/design-draft`: Home 도구 줄과 DockedComposer tray의 권한 모드 피커(닫힘, 열림과 항목 설명, Full access 경고 표시, 터미널 세션 고정 트리거, 320px 패널), Settings 'New conversations'의 Permission 행. 사용자가 앱에서 초안을 확인한다.
  - 검증: `go run ./cli/cmd/doan check --repo .` 오류 없음, `go run ./cli/cmd/doan ls --repo .`에 초안이 보인다, 사용자 확인.

── commit: `docs(design-draft): permission mode picker` ──

## T. 순수 함수 (`/tdd` → `/implement`)

- [ ] T1. `permissionOptions`, `claudePermission`, `codexPermission`, `acpModeFor`, `permissionTrigger`, 마지막 사용·Settings 기본값 규칙.
  - 검증: `npm --prefix app test` green. 테스트가 다음 경우를 덮는다.
    - 각 provider·모드 조합
    - Full access가 `allowDangerouslySkipPermissions`를 함께 낸다
    - Codex Default가 사용자 설정 값을 낸다
    - ACP 대응 없음이면 빈 목록
    - 입력창에서 provider를 바꿨는데 고른 모드를 새 provider에서 고를 수 없으면 Default
    - 모델 없이 고른 모드도 마지막 사용·Settings에 반영된다
- [ ] T2. 대화 metadata(`store.ts`), `preferences.ts`, `restore/uiState.ts`의 `permissionMode` 읽기·검증.
  - 검증: `npm --prefix app test` green. 테스트 파일은 `app/src/main/conversation/storeIndex.test.ts`·`storeRecovery.test.ts`, `app/src/main/preferences.test.ts`, `app/src/restore/uiState.test.ts`다(`app/src/main/uiState.test.ts`와 다르다). 다음 경우를 덮는다.
    - 알 수 없는 id는 그 필드만 Default로 읽는다. index 전체나 preferences 파일 전체를 깨지 않는다
    - `parsePreferencesPatch`가 `permissionMode`를 받는다
    - ui-state `permissions[provider]`의 알 수 없는 id
    - newer-Doan `preferences.json`이면 Permission도 저장하지 않는다

── commit: `feat(conversation): permission mode rules` ──

## S. 셸 (main)

- [ ] S1. `service.ts` `TurnChoice`·send extras·저장된 choice에 `permissionMode`(모델과 따로 판정). Plan 승인 뒤 저장 모드 전환. `ipc.ts`에서 공통 id로 검증.
  - 검증: `npm --prefix app test` green. 테스트 파일은 모두 `app/src/main/conversation/`에 있다.
    - `service.test.ts`: 저장된 `permissionMode`가 resume 턴의 choice로 이어진다. 모델 없는 send에서 바꾼 모드가 저장된다. `"default"` send가 metadata에서 키를 지운다. 큐 메시지가 보낼 때의 값을 쓴다.
    - `ipc.test.ts`: 알 수 없는 id를 거부한다. queue가 `permissionMode`를 받는다. legacy-external 대화의 `permissionMode`는 `bad_request`다.
- [ ] S2. `runners.ts`: Claude `query()` 옵션, Codex `turn/start`(Default 턴은 `config/read` 값). `acpRunner.ts`: P3에 따라 `session/set_mode` 또는 `session/set_config_option`. `models.ts`: ACP mode 목록. POSTMORTEM의 Codex dispatcher 검색을 다시 돌린다.
  - 검증: `npm --prefix app test` green. 테스트 파일은 모두 `app/src/main/conversation/`에 있다.
    - `runners.test.ts`: fake 서버가 받은 파라미터를 확인한다. override 뒤 Default로 돌아간 Codex 턴이 `config/read` 값을 보낸다. Full access Claude 턴에 `allowDangerouslySkipPermissions`가 실린다.
    - `acpRunner.test.ts`: `modes`가 없거나 대응이 없으면 mode를 설정하지 않는다.
    - `models.test.ts`: ACP 응답에서 mode 목록을 읽는다.

── commit: `feat(conversation): pass the chosen permission mode` ──

## U. UI

- [ ] U1. `ComposerParts.tsx` `PermissionPicker`(터미널 세션 고정 트리거 포함), Home 도구 줄과 Overview·캔버스 패널 tray, Settings 행(Last used이면 숨김), 마지막 사용 쓰기, Plan 승인 뒤 피커 갱신.
  - 검증: `npm --prefix app test` green, `npm --prefix app run typecheck` 통과. 테스트가 다음 경우를 덮는다.
    - Settings에 저장된 provider를 실행할 수 없을 때 Home 기본값과 Permission 행 경고
    - newer-Doan 파일이면 Permission 행도 저장을 막는다
    - 기존 대화의 피커가 그 대화의 저장값을 보인다
- [ ] U2. `/design-sync`로 초안과 대조하고 `/runtime-test`로 확인한다.
  - 세 입력창에서 피커가 열리고, 고른 값이 다음 입력과 Settings에 남는다.
  - provider(Claude·Codex)×모드 4개, 8칸 표에 편집 여부와 승인 요청 여부를 적는다.
  - 대화 중 바꾼 모드가 다음 턴에 적용된다. 재시작 뒤 resume한 대화가 모드를 유지한다.
  - Claude Plan 승인 뒤 피커가 바뀐다.
  - Full access 경고 표시와 터미널 세션 고정 트리거 스크린샷.
  - 검증: `node .agents/skills/verify/scripts/verify.mjs` 통과, 8칸 표와 runtime-test 스크린샷. 실계정 모델 요청 command undecided — needs user confirmation.

── commit: `feat(composer): permission mode picker` ──

## Z. 정리

- [ ] Z1. 다음을 현재 규칙으로 고치고 `docs/features/permission-mode/`를 지운다.
  - PRODUCT §3 'Resume and permissions'
  - PRODUCT §5 item 0 'New conversations', item 1 Composer(도구 줄), item 2 'New conversation'·'Terminal session'
  - ARCHITECTURE §7 'Agent conversation runtime and IPC'·'Permissions and terminals'·"Codex (default on-request/read-only)", 'Settings IPC' 'Preferences'와 index 설명의 알 수 없는 `permissionMode` 예외
  - DESIGN(피커·경고 표시 측정값)
  - ACP에서 확인하지 못한 것은 BACKLOG에 남긴다
  - 검증:
    - `grep -n "no forced bypass" docs/PRODUCT.md` 결과 없음
    - `grep -n "so the user's own permission settings apply" docs/ARCHITECTURE.md` 결과 없음
    - `grep -n -i "permission" docs/PRODUCT.md`에 §5 item 0·1·2의 새 문장이 보인다
    - `grep -n -i "permission" docs/DESIGN.md`에 피커 측정값이 있다
    - ACP 미확인 항목이 있으면 `grep -n -i "permission" docs/BACKLOG.md`에 항목이 있다
    - `ls docs/features/permission-mode` 실패

── commit: `docs(product): permission mode picker` / `docs(architecture): permission mode` / `docs(design): permission picker` / `docs(backlog): acp permission modes`(있을 때만) / `docs(feature): remove permission-mode` ──
