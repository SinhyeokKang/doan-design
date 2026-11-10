# 대형 캔버스 렌더링 안정화 작업

- [ ] 1. PoC 시작 시 사용자에게 원본 캔버스·Export HTML을 받고 재현 동작과 환경을 확인한다. 검증: 자료와 의존 파일을 확보하고 재현 기록에 경로를 남긴다. 아직 자료 미제공이다.
- [ ] 2. 격리 앱과 Export HTML 비교 PoC로 원인을 좁히고 완료 기준·필요한 구조 변경을 사용자에게 확인한다. 검증: `DOAN_CLI=<abs path to doan> npm --prefix app run dev -- -- --user-data-dir=<tmp>`로 전후 비교의 기준 화면을 수집한다. AGENTS.md의 HOME·SHELL·에이전트 설정 격리를 적용한다. 브라우저 비교용 명령은 미정이며 사용자 확인이 필요하다.
- [ ] 3. 원인이 확인된 경계에 최소 회귀 테스트를 추가하고 red를 본 뒤 수정한다. 검증: `npm --prefix app test`에서 재현 조건과 기존 좌표·높이·재로드 불변식을 확인한다. **원인별 구현 커밋 경계**.
- [ ] 4. 같은 자료·환경·동작으로 `/runtime-test`를 실행하고 `/code-review`·`/postmortem`을 수행한다. 검증: 작업 2와 같은 격리 앱에서 전후 화면·측정 비교, `node .agents/skills/verify/scripts/verify.mjs`. 해결하지 못한 조건은 통과로 보고하지 않는다.
- [ ] 5. PRODUCT·ARCHITECTURE에 실제 변경된 현재 규칙을 영문 승격하고 관련 BACKLOG 미확인 항목을 증거에 맞춰 갱신한 뒤 이 디렉터리를 삭제한다. 검증: 재현·회귀·잔여 제한의 증거를 대조한다. **문서별 커밋 경계**.
