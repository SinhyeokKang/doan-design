# 단일 프레임 프로토타입 작업

- [ ] 1. 2번의 프레임 선택 계약을 확인하고, 격리 앱 PoC로 단일 프레임·모션·입력·모달·반응형·상대 자산·중첩과 수명 경계를 검증한다. 지원 속성·가이드·형식 버전을 고정한다. 검증: `DOAN_CLI=<abs path to doan> npm --prefix app run dev -- -- --user-data-dir=<tmp>`; AGENTS.md의 HOME·SHELL·에이전트 설정 격리를 적용한다. 미검증 구성을 지원으로 표시하지 않는다.
- [ ] 2. `/feature-review` 후 도구 바·서랍 메타·크기 버블·프로토타입 로딩/실패/소실 초안을 `/design-draft`로 작성해 사용자 확인을 받는다. 검증: `doan check --repo . --json`, `doan ls --repo . --json`.
- [ ] 3. 관례와 필요한 schema·TS/Go fixture를 먼저 고정하고 순수 실행 조건·창 수명·요청 검증을 `/tdd`로 작성한다. 검증: `go test ./...`, `npm --prefix app test`. **계약 커밋 경계**.
- [ ] 4. sandbox 창·제공/주입·실행·재로드·복구를 구현한 뒤 UI를 연결한다. 검증: `npm --prefix app test`, 작업 1의 격리 앱에서 세 진입 상태(서랍 이동, 도구 바 실행, 버블 실행)와 차단 동작을 확인한다. **구현 커밋 경계**.
- [ ] 5. `/design-sync`·`/runtime-test`·`/code-review`와 가이드/검사 변경에 대한 `/agent-eval`을 수행한다. 검증: `npm --prefix app run package`, `node eval/run.ts` 및 `node .agents/skills/verify/scripts/verify.mjs`. 실제 agent-eval의 계정·환경 조건은 해당 스킬을 따른다.
- [ ] 6. PRODUCT·ARCHITECTURE에 구현된 지원 계약·UI·수명·격리 규칙을 영문 승격하고 이 디렉터리를 삭제한다. 검증: 완료 조건·공통 fixture·실제 앱·에이전트 증거를 대조한다. **문서별 커밋 경계**.
