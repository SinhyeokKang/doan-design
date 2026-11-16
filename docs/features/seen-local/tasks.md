# seen-local 작업

1. `canvas-seen.json` v3 파싱·직렬화와 v1·v2 변환 순수 함수, 테스트.
   - 검증: `npm --prefix app test` 에서 `canvasSeen.test.ts` 통과.
2. `migrateRoot`·`judge`·`markShown`을 로컬 기록 기준으로 바꾸고, 공유 기록 복사·기준선·legacy·손상 기록 케이스를 테스트로 고정.
   - 검증: `npm --prefix app test` 에서 `canvasSeen.test.ts`, `seenRecords.test.ts` 통과.
3. HEAD 상태 파싱·`headChanged`·`absorbNew` 순수 함수와 테스트(일반 체크아웃, worktree의 `gitdir:`, packed-refs, detached HEAD, 저장소 아님).
   - 검증: `npm --prefix app test` 통과.
   - — 커밋 경계 —
4. `readState.ts`가 보여 준 캔버스를 로컬 파일에만 쓰고, root마다 전환을 한 번만 하도록 바꾼다. `.doan/seen/` 쓰기 경로와 공유 기록 전용 토스트를 지운다.
   - HEAD 상태를 목록 갱신마다 읽어 첫 목록·HEAD 변화 때 `absorbNew`를 적용한다.
   - 검증: `npm --prefix app test` 에서 `readState.test.ts` 통과(재시작 뒤 첫 목록과 HEAD 변화 뒤 목록의 새 캔버스에 점이 없다는 테스트, 캔버스를 보여도 root 아래 파일이 바뀌지 않는다는 테스트 포함), `npm --prefix app run typecheck`, `npm --prefix app run lint`.
   - — 커밋 경계 —
5. 실제 앱 확인: `.doan/seen/`이 있는 임시 git 저장소를 등록하고 캔버스를 연 뒤 `git status`가 깨끗하고, 전환 전 점이 유지되며, 재시작 후에도 상태가 남는지 본다. 앱이 켜진 채 캔버스를 추가하면 점이 켜지고, 다른 브랜치로 전환해 캔버스가 늘어나면 점이 켜지지 않는지 본다.
   - 검증: `/runtime-test`.
6. 전체 게이트.
   - 검증: `node .agents/skills/verify/scripts/verify.mjs`.
7. 결론을 `docs/PRODUCT.md` §5 item 1 'Canvas notice'와 `docs/ARCHITECTURE.md`(첫머리 'Project directory', §7 'Seen canvases', §11 기기 로컬 파일 목록)에 현재 규칙으로 영문으로 옮기고(근거는 커밋 메시지), `docs/features/seen-local/`을 지운다.
   - 검증: `grep -rn "\.doan/seen" docs/PRODUCT.md docs/ARCHITECTURE.md` 결과가 전환 설명 외에는 없다.
   - — 커밋 경계 —
