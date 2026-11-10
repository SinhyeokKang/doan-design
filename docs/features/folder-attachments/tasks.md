# 폴더 첨부 작업

1번 기능이다. 뒤의 기능은 이 기능 문서의 완료 여부와 별도로 자기 결정을 확인한다.

- [ ] 1. 실제 선택창·Finder 입력·제공자 전달 PoC를 수행하고 지원 경계를 기록한다. 검증: 격리 환경에서 `DOAN_CLI=<abs path to doan> npm --prefix app run dev -- -- --user-data-dir=<tmp>`로 확인하며 AGENTS.md의 HOME·SHELL·에이전트 설정 격리를 적용한다.
- [ ] 2. `/feature-review` 후 UI 초안을 `/design-draft`로 확인하고 사용자 확인을 받는다. 검증: `doan check --repo . --json`, `doan ls --repo . --json`.
- [ ] 3. 기존 대화 기록 호환 fixture와 폴더 attachment 타입을 정하고 순수 함수 회귀 테스트를 작성한다. 검증: `npm --prefix app test`로 혼합 한도·표시·프롬프트·복원 사례를 확인한다.
- [ ] 4. main 검사·수락 재검사·제공자 전달과 세 입력창을 구현한다. 검증: `npm --prefix app test`와 짧은 실제 앱 probe로 내부·외부 폴더, 소실·종류 변경, 큐·Send now를 확인한다. **구현 커밋 경계**.
- [ ] 5. 첫 구현의 `/design-sync`·`/runtime-test`·코드 검토 후 정적 게이트를 통과한다. 검증: `node .agents/skills/verify/scripts/verify.mjs`와 작업 1의 격리 앱 probe.
- [ ] 6. PRODUCT의 폴더 금지 규칙과 ARCHITECTURE의 첨부 형식을 구현된 현재 규칙으로 영문 갱신하고 이 기능 디렉터리를 삭제한다. 검증: 완료 조건별 증거와 남은 실제 제공자 검증을 대조한다. **문서별 커밋 경계**.
