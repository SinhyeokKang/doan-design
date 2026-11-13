# usage-limit-resume — tasks

PoC → 순수 함수 → main(I/O) → UI → 문서 순서로 간다. 포맷 변경은 없다.

- [ ] 1. PoC(`.scratch/`): 실제 Doan 연결로 Claude Code 평소 턴의 `rate_limit_event` 모양과 `resetsAt` 단위를 기록하고, 한도에 걸린 계정에서 `rejected` 이벤트와 Codex `account/rateLimits/read`의 다 찬 창, 리셋 정각 전송의 수락 여부를 확인한다. 결과로 `sendAt` 여유와 fixture를 정한다. 검증: 명령 미정 — 사용자 확인 필요(한도에 걸린 실제 계정이 있어야 한다).
  - 커밋 경계: PoC 관찰은 이 문서나 커밋 메시지에 적는다.
- [ ] 2. `/feature-review` 후 `/design-draft`로 예약된 대기열 행, 실패 줄의 새 둘째 줄, 재예약된 행, 초안으로 돌아온 상태를 초안 캔버스에 그리고 사용자 확인을 받는다. 검증: `doan check --repo . --json`, `doan ls --repo . --json`.
  - 커밋 경계: 초안.
- [ ] 3. `/tdd`: PoC fixture로 `claudeLimitReset`, `codexLimitReset`, `limitState`, `sendDecision`, `sendAt`, `retryDecision`, `scheduledRowText`, `endView` 확장을 고정하고 red를 확인한다. 검증: `npm --prefix app test`가 새 테스트에서만 실패한다.
- [ ] 4. `/implement` 순수 함수. 검증: `npm --prefix app test`, `npm --prefix app run typecheck`.
  - 커밋 경계: 순수 함수와 테스트.
- [ ] 5. main: transport에서 리셋 시각 읽기, service의 한도 상태와 예약 대기열, 타이머와 `powerMonitor` resume, 재예약, 로그아웃·보관·삭제·재시작 정리. 가짜 시계로 `service.test.ts`에 예약→전송, 재예약, 초안 복귀를 고정한다. 검증: `npm --prefix app test`, `npm --prefix app run typecheck`, `npm --prefix app run lint`.
  - 커밋 경계: main.
- [ ] 6. renderer: 예약 행, 실패 줄, 요약·대기열 상태 반영. 검증: `npm --prefix app test`, `npm --prefix app run typecheck`, `npm --prefix app run lint`.
  - 커밋 경계: renderer.
- [ ] 7. `/design-sync`로 초안과 실제 앱의 예약 행·실패 줄을 맞추고 DESIGN.md를 고친다. 검증: `node .scratch/design-sync/<screen>/measure.mjs`.
- [ ] 8. `/runtime-test`: 격리 앱에서 한도 실패를 가짜 runner로 만들고 가까운 리셋 시각을 넣어, 예약 행 → 전송, 재예약, 앱 재시작 뒤 초안 복귀를 확인한다. 검증: `/runtime-test` 스크린샷과 probe 결과.
- [ ] 9. `/verify` 후 결론을 승격한다: PRODUCT §3 Out of scope 4(예외 문장), PRODUCT §5 item 3(한도 문단, 예약 행), ARCHITECTURE §7(리셋 시각 출처, 메모리 전용 한도 상태와 예약, 타이머), DESIGN.md(예약 행). 그리고 `docs/features/usage-limit-resume/`를 삭제한다. 검증: `node .agents/skills/verify/scripts/verify.mjs`.
  - 커밋 경계: 문서 승격(문서마다 커밋).
