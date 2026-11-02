# terminal-agent-activity — tasks

## S. 형식

- [ ] T1. `schema/app-socket.v3.schema.json`(`work` 요청)과 `schema/fixtures/app-socket-v3/` valid·invalid fixture, CLI 응답 envelope의 `work` 결과. TS·Go 양쪽 fixture 테스트.
  - 검증: `go test ./...`, `npm --prefix app test` green.

── commit: `feat(schema): app-socket v3 work request` ──

## T. 순수 함수 (`/tdd` → `/implement`)

- [ ] T2. Go `workTarget`: 캔버스·ds 경로, 아직 없는 파일 허용, root 밖·심볼릭 링크·`.html` 아님·다른 디렉터리 거부. 세션 식별자 선택(sessions.go 규칙과 같은 입력 표).
  - 검증: `go test ./...`.
- [ ] T3. TS `applyWork`·`expireWork`: 시작·끝·만료(신호와 mtime 중 늦은 것), 앱 자신의 세션 무시, 익명 세션, 두 세션이 같은 캔버스, 목록에 없는 경로.
  - 검증: `npm --prefix app test`.
- [ ] T4. 행 상태 자리 합성에 터미널 작업 중 추가(권한 > 작업 중 > 안 본 것).
  - 검증: `npm --prefix app test`.

── commit: `feat(cli): doan work rules` / `feat(app): terminal work state` ──

## U. 셸·UI

- [ ] T5. `doan work start|done` 명령: socket 전송, 짧은 시간 제한, 앱이 없으면 `delivered: false`와 exit 0.
  - 검증: `go test ./...`. 앱 없이 실행해 즉시 exit 0인지 테스트로 확인한다.
- [ ] T6. 앱 socket 서버의 v3 `work` 처리, 활동 상태 → renderer IPC, 만료 타이머.
  - 검증: `npm --prefix app test`, `npm --prefix app run typecheck`.
- [ ] T7. 사이드바 스피너, Agent indicator의 Stop 없는 변형과 notice 문구(clarify 프리셋).
  - 검증: `npm --prefix app test`.
- [ ] T8. 가이드(`cli/internal/cli/skill.md`)에 두 명령과 부르는 때.
  - 검증: `go test ./...`(스킬 테스트가 `doan work start`를 확인).

── commit: `feat(cli): doan work` / `feat(sidebar): terminal agent working spinner` / `feat(canvas): agent indicator for terminal sessions` / `docs(skill): doan work` ──

## R. 확인

- [ ] T9. `/agent-eval`: 캔버스 하나를 고치게 하고 `work start`(편집 전)와 `work done`(끝)을 불렀는지 재는 새 시나리오와 pass/fail fixture. 앱 대화 쪽 세션 식별자 확인(design.md 'PoC 의존')도 여기서 기록한다.
  - 검증: `node eval/run.ts --self-test` `self-test PASS`. `npm --prefix app run package` 뒤 실제 라운드 결과를 `docs/USABILITY-EVAL.md`에 기록한다.
- [ ] T10. `/runtime-test`: 격리된 HOME·userData에서 앱을 켜고 `doan work start|done`을 직접 불러 스피너·indicator가 뜨고 사라지는지, 만료, 아직 없는 경로가 생길 때, 앱이 꺼졌을 때 명령이 바로 끝나는지 본다.
  - 검증: runtime-test 스크린샷과 상태 로그.
- [ ] T11. `node .agents/skills/verify/scripts/verify.mjs --eval` 통과.

## Z. 정리

- [ ] Z1. PRODUCT §5 item 1 행 상태 자리, item 2 'Agent indicator'(터미널, Stop 없음), ARCHITECTURE §1 'Agent rules'(`doan work`), §4(app-socket v3, 앱 없이 성공하는 명령), §7 'Shell activity'(새 출처), §12 CLI 명령 목록을 현재 규칙으로 고친다. BACKLOG 'Showing where the agent is working…'에서 이 feature가 다룬 부분을 고친다. `docs/features/terminal-agent-activity/`를 지운다.
  - 검증: `go run ./cli/cmd/doan check --repo .` 오류 수가 늘지 않는다.

── commit: `docs(product): terminal agent activity` / `docs(architecture): doan work and app-socket v3` / `docs(backlog): …` / `docs(feature): remove terminal-agent-activity` ──
