# terminal-agent-activity — tasks

## P. PoC

- [ ] T0. Claude Code hook PoC(design.md 'PoC 의존' T0). 설치된 Claude Code를 사용자 로그인 그대로 쓰고, 기록용 hook은 `--settings`로 넘긴 `.scratch/` 임시 파일에만 둔다(사용자 `settings.json`은 건드리지 않는다, 사용자 승인). `.scratch/`의 임시 repo에서 캔버스 파일 하나를 고치게 하는 짧은 실행 몇 번으로 stdin을 저장한다.
  - 검증: command undecided — 실행 명령은 AGENTS.md 'Commands'에 없다(사용자가 방식은 승인했다). 결과(이벤트 이름, 필드, 설정 경로, 간격)를 design.md에 적는다.
- [ ] T0b. Codex hook 지원 확인. 공식 문서와 설치된 CLI(`codex --help`, 설정 문서)로 확인한다. 없으면 spec 비목표로 옮긴다.
  - 검증: 결과를 design.md에 적는다.

── commit: `docs(feature): terminal-agent-activity PoC results` ──

## S. 형식

- [ ] T1. `schema/app-socket.v3.schema.json`과 `schema/fixtures/app-socket-v3/` valid·invalid fixture. TS·Go 양쪽 fixture 테스트.
  - 검증: `go test ./...`, `npm --prefix app test` green.

── commit: `feat(schema): app-socket v3 activity request` ──

## T. 순수 함수 (`/tdd` → `/implement`)

- [ ] T2. Go `hookActivity`: 편집 도구 경로 → 캔버스 판정(실제 경로, root 안, `.doan/canvases|ds/*.html`), 비캔버스·Bash·깨진 stdin은 메시지 없음.
  - 검증: `go test ./...`.
- [ ] T3. TS `mergeClaudeHooks`: 빈 파일, 다른 hook 보존, 이미 있음(쓰지 않음), 경로 갱신, 깨진 JSON(건너뜀).
  - 검증: `npm --prefix app test`.
- [ ] T4. TS `applyActivity`·`expireActivity`: 턴 시작·캔버스 편집·Stop·SessionEnd, 만료, 앱 자신의 세션 무시, 같은 캔버스를 두 세션이 고치는 경우.
  - 검증: `npm --prefix app test`.
- [ ] T5. 행 상태 자리 합성에 터미널 작업 중 추가(권한 > 작업 중 > 안 본 것).
  - 검증: `npm --prefix app test`.

── commit: `feat(cli): doan hook claude` / `feat(agent-setup): Claude Code activity hooks` / `feat(app): terminal activity state` ──

## U. 셸·UI

- [ ] T6. `doan hook claude` 명령: socket 전송, 짧은 시간 제한, 항상 출력 없이 exit 0.
  - 검증: `go test ./...`. 앱 없이 실행해 즉시 exit 0인지 테스트로 확인한다.
- [ ] T7. 앱 socket 서버의 v3 `activity` 처리, 활동 상태 → renderer IPC, Agent setup 설정 병합 연결, About 결과 항목.
  - 검증: `npm --prefix app test`, `npm --prefix app run typecheck`.
- [ ] T8. 사이드바 스피너, 캔버스 페이지 Agent indicator의 Stop 없는 변형과 notice 문구(clarify 프리셋).
  - 검증: `npm --prefix app test`.

── commit: `feat(sidebar): terminal agent working spinner` / `feat(canvas): agent indicator for terminal sessions` ──

## R. 확인

- [ ] T9. `/runtime-test`: 격리된 HOME·`CLAUDE_CONFIG_DIR`·userData에서 앱을 켜고, `doan hook claude`에 기록한 stdin을 순서대로 넣어 스피너·indicator가 뜨고 사라지는지, 만료, 앱 꺼짐 시 hook이 즉시 끝나는지 본다. 실제 Claude Code로 한 번 확인할지는 T0 결과를 보고 사용자에게 묻는다.
  - 검증: runtime-test 스크린샷과 상태 로그.
- [ ] T10. `node .agents/skills/verify/scripts/verify.mjs` 통과.

## Z. 정리

- [ ] Z1. PRODUCT §5 item 0 'Agent setup'(Claude hook), item 1 행 상태 자리, item 2 'Agent indicator'(터미널, Stop 없음), ARCHITECTURE §4(app-socket v3), §7 'Shell activity'(hook 출처)·'Agent setup'(설정 병합)을 현재 규칙으로 고친다. BACKLOG 'Showing where the agent is working…'에서 이 feature가 다룬 부분을 고친다. `docs/features/terminal-agent-activity/`를 지운다.
  - 검증: `go run ./cli/cmd/doan check --repo .` 오류 수가 늘지 않는다.

── commit: `docs(product): terminal agent activity` / `docs(architecture): activity hooks and app-socket v3` / `docs(backlog): …` / `docs(feature): remove terminal-agent-activity` ──
