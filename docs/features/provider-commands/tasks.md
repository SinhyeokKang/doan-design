# provider-commands — tasks

1. **PoC: 프로바이더별 명령 동작 표.** 격리된 프로필에서 Claude SDK, Codex app-server, ACP 세 경로에 후보 명령을 보내고 결과 이벤트를 기록한다. 결과는 design.md 'PoC 의존' 표에 적는다.
   - 확인: 표의 모든 칸이 채워진다. 실험 코드는 `.scratch/`에 둔다.
   - — 커밋 경계 (문서만) —
2. **명령 목록 파싱과 허용 목록**(`skills.ts`). 
   - 확인: `npm --prefix app test`. fixture는 SDK `commands` 실제 응답을 쓴다.
3. **보내기 조립 규칙**(명령 턴에는 고정 줄을 붙이지 않음).
   - 확인: `npm --prefix app test`.
   - — 커밋 경계 —
4. **runner 보내기**: Codex처럼 별도 요청이 필요한 명령은 runner에서 대응 요청으로 보낸다.
   - 확인: runner 단위 테스트(`npm --prefix app test`).
   - — 커밋 경계 —
5. **UI**: `/` 목록과 팝오버의 명령 행, 하이라이트, 스레드의 명령 턴 표시. `/design-draft`로 그린 드래프트를 기준으로 한다.
   - 확인: `npm --prefix app test`, `/runtime-test`로 `/compact` 한 번 보내 결과 표시 확인.
   - — 커밋 경계 —
6. **승격**: PRODUCT §5 'Project skills'와 대화 항목을 지금 규칙으로 고친다. ARCHITECTURE §7은 명령 전달 경로가 생기면 고친다. 그 뒤 `docs/features/provider-commands/`를 지운다.
   - 확인: `/doc-check` 대상 문단 대조.
