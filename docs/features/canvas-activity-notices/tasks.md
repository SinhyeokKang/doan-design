# 캔버스 변경 Dot 작업

- [ ] 1. 기존 미읽음을 보존하는 마이그레이션과 두 checkout의 내용 지문·메타데이터 이동·CSS/에셋 변경 PoC를 수행한다. 저장 경로·버전·충돌/손상·원자 저장 계약을 확정한다. 검증: `npm --prefix app test`에 임시 경로 fixture를 두고 변경 원인을 분리한다. 실제 앱 검증은 작업 5의 격리 실행을 사용한다.
- [ ] 2. `/feature-review` 후 Dot·말풍선·우선순위·프로젝트 집계·숨긴 사이드바·저장 실패/재시도를 `/design-draft`로 그려 사용자 확인을 받는다. 검증: `doan check --repo . --json`, `doan ls --repo . --json`.
- [ ] 3. 메타데이터 schema/fixture와 순수 판정·마이그레이션·슬롯 테스트를 먼저 작성한다. 검증: `npm --prefix app test`; Go가 읽는 형식이 생기면 `go test ./...`도 실행한다. **계약 커밋 경계**.
- [ ] 4. 지문 I/O·원자 저장·마이그레이션·읽음 IPC 후 UI를 구현한다. 검증: `npm --prefix app test`에서 모든 쓰기 중단 지점과 현재 표시 세대가 아닌 지문 거부를 확인한다. **구현 커밋 경계**.
- [ ] 5. `/design-sync`·`/runtime-test`·`/code-review`로 대량 Dot 재현 후보와 상태별 화면을 확인한다. 검증: `DOAN_CLI=<abs path to doan> npm --prefix app run dev -- -- --user-data-dir=<tmp>`에서 HOME·SHELL·에이전트 설정도 격리하고, `node .agents/skills/verify/scripts/verify.mjs`를 실행한다. 실제 버그를 재현해 고쳤으면 `/postmortem`을 기록한다.
- [ ] 6. PRODUCT·ARCHITECTURE의 기기별 저장·mtime·표시 규칙을 구현된 현재 규칙으로 영문 승격한다. 새 디렉터리가 생기면 DIRECTORY도 갱신하고 이 기능 디렉터리를 삭제한다. 검증: 머신 이동·읽음·실패·대화 분리 완료 조건과 증거를 대조한다. **문서별 커밋 경계**.
