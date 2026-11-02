# permission-mode — tasks

선행: `/ship` 묶음의 #3(메뉴 z-index)과 #6(고르기만 해도 마지막 사용·Settings에 저장)이 main에 들어온 뒤 시작한다.

## P. PoC (`.scratch/permission-mode/`, 커밋하지 않는다. 관찰은 이 문서와 커밋 메시지에 남긴다)

- [ ] P1. Claude: Doan profile과 임시 저장소에서 SDK `permissionMode` 네 값(`default`·`acceptEdits`·`plan`·`bypassPermissions`)으로 파일 편집 턴을 돌린다. 승인 요청 여부, 편집 결과, `bypassPermissions`에 추가 옵션이 필요한지, `plan` 승인 뒤 모드, '기본'에서 적용되는 설정의 출처를 기록한다.
  - 검증: command undecided — needs user confirmation (실제 Claude 계정과 모델 요청을 쓴다).
- [ ] P2. Codex 0.163.0 app-server: `turn/start`의 `approvalPolicy`·`sandboxPolicy` override가 다음 턴과 `thread/resume`에 남는지, override 없이 보낸 턴이 무엇을 쓰는지, '기본'으로 되돌리는 방법, `read-only`에서 편집 요청의 결과를 기록한다.
  - 검증: command undecided — needs user confirmation (실제 Codex 계정과 모델 요청을 쓴다).
- [ ] P3. ACP: Cursor·Antigravity·Copilot의 `session/new` 응답 `modes`와 `session/set_mode` 동작을 기록하고, 공통 id 대응표를 design.md에 채운다.
  - 검증: command undecided — needs user confirmation (실제 계정을 쓴다).
- [ ] P4. P1–P3 결과로 design.md의 모드 대응표와 '기본(내 설정)'의 범위를 확정한다. 대응이 어긋나면(예: Codex가 되돌릴 수 없음) 사용자에게 묻는다.
  - 검증: design.md에 "P2에서 확인" 같은 미확정 표시가 남지 않는다.

── commit: `docs(feature): permission-mode PoC results` ──

## T. 순수 함수 (`/tdd` → `/implement`)

- [ ] T1. `permissionOptions`, `claudePermission`, `codexPermission`, `acpModeFor`, `permissionTrigger`.
  - 검증: `npm --prefix app test` green, 각 provider·모드 조합과 ACP 대응 없음(빈 목록)을 테스트가 덮는다.
- [ ] T2. 대화 metadata(`store.ts`), `preferences.ts`, `restore/uiState.ts`의 `permissionMode` 읽기·검증. 알 수 없는 id는 '기본'. 새 필드가 있는 파일을 옛 검증이 거부하는지 확인하고, 거부하면 그 형식의 `v` 처리를 사용자에게 묻는다.
  - 검증: `npm --prefix app test` green.

── commit: `feat(conversation): permission mode rules` ──

## S. 셸 (main)

- [ ] S1. `service.ts` `TurnChoice`·send extras·저장된 choice에 `permissionMode`. `ipc.ts`에서 공통 id로 검증.
  - 검증: `npm --prefix app test` green (`service.test.ts`, `ipc.test.ts`에 새 케이스).
- [ ] S2. `runners.ts`: Claude `query()` 옵션, Codex `thread/start`·`turn/start`. `acpRunner.ts`: P3에 따라 `session/set_mode`. POSTMORTEM의 Codex dispatcher 검색을 다시 돌린다.
  - 검증: `npm --prefix app test` green (`runners.test.ts`, `acpRunner.test.ts`의 fake 서버가 받은 파라미터를 확인).

── commit: `feat(conversation): pass the chosen permission mode` ──

## U. UI

- [ ] U1. `/design-draft`: 도구 줄의 권한 모드 피커(닫힘·열림·'모두 허용' 경고색)와 Settings 'New conversations'의 Permission 행. 사용자가 앱에서 초안을 확인한다.
  - 검증: `go run ./cli/cmd/doan check --repo .` 오류 없음, 사용자 확인.
- [ ] U2. `ComposerParts.tsx` `PermissionPicker`, Home·Overview·캔버스 패널 입력창, Settings 행, 마지막 사용 쓰기.
  - 검증: `npm --prefix app test` green, `npm --prefix app run typecheck` 통과.
- [ ] U3. `/design-sync`로 초안과 대조하고 `/runtime-test`로 확인: 세 입력창에서 피커가 열리고 고른 값이 다음 입력과 Settings에 남는다. Claude·Codex로 '편집 자동 승인' 턴이 승인 요청 없이 편집한다.
  - 검증: `node .agents/skills/verify/scripts/verify.mjs` 통과, runtime-test 스크린샷.

── commit: `feat(composer): permission mode picker` ──

## Z. 정리

- [ ] Z1. PRODUCT §3 'Resume and permissions'와 §5 item 0 'New conversations'·item 1 Composer(도구 줄), ARCHITECTURE §7 'Agent conversation runtime and IPC'·'Permissions and terminals', DESIGN(피커·경고색 측정값)을 현재 규칙으로 고친다. ACP에서 확인하지 못한 것은 BACKLOG에 남긴다. `docs/features/permission-mode/`를 지운다.
  - 검증: `grep -n "no forced bypass" docs/PRODUCT.md` 결과 없음, `ls docs/features/permission-mode` 실패.

── commit: `docs(product): permission mode picker` / `docs(architecture): permission mode` / `docs(design): permission picker` / `docs(feature): remove permission-mode` ──
