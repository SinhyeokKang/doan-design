# seen-local 작업

1. `canvas-seen.json` v3 `parseLocalSeen`·`localSeenText`와 테스트.
   - 케이스: v1·v2 변환, 손상 JSON, `v` > 3, `unseen:"new"`·`"migrated"`.
   - 검증: `npm --prefix app test` 에서 `canvasSeen.test.ts` 통과.
2. `migrateRoot`·`absorbFirst`·`judge`·`markShown`·`mergeRoots`를 로컬 기록 기준으로 바꾸고 테스트.
   - 케이스: 유효한 공유 기록 복사, 손상·충돌·`v` > 1·마커 없음 → 마지막 판정, legacy 변환, 새 판정 → `unseen:"new"`, ID 없음·중복 ID, 첫 목록 기준선, 재등록(기록 유지), 별칭 병합.
   - 검증: `npm --prefix app test` 에서 `canvasSeen.test.ts` 통과.
3. `parseGitSignal`·`resolveGitDir`·`settlePending`과 테스트(새 파일 `gitSignal.test.ts`).
   - 케이스: 일반 체크아웃, worktree `gitdir:`, detached HEAD, 저장소 아님, `FETCH_HEAD`·`ORIG_HEAD` 변경, 같은 브랜치 커밋(신호 불변), 신호 변화가 유예 전 2초 안·유예 중·유예 뒤인 경우.
   - 검증: `npm --prefix app test` 에서 `gitSignal.test.ts` 통과.
   - — 커밋 경계 —
4. `readState.ts`·`watch.ts`·`copyRoots`를 연결한다.
   - 보여 준 캔버스는 로컬 파일에만 쓴다.
   - 전환은 root마다 한 번만 한다.
   - git 파일은 `readRegularFileSync`로 읽고 부모 디렉터리를 감시한다.
   - 손상 파일은 옆으로 옮기고 토스트, 더 새 파일은 메모리 판정과 토스트, 쓰기 실패는 툴팁과 Retry.
   - 지울 것 목록을 지운다.
   - 검증: `npm --prefix app test` 에서 `readState.test.ts` 통과. 다음 테스트를 포함한다.
     - 캔버스를 보여도 root 아래 파일이 바뀌지 않는다.
     - 재시작 뒤 첫 목록의 새 캔버스에 점이 없다.
     - 재시작 전 켜진 새 캔버스 점이 남는다.
     - 브랜치 전환 직후 들어온 캔버스에 점이 없다.
     - 커밋 직후에도 점이 켜진다.
     - git 파일이 FIFO여도 멈추지 않는다.
   - 추가 검증: `npm --prefix app run typecheck`, `npm --prefix app run lint`.
   - — 커밋 경계 —
5. 실제 앱 확인. 이 단계는 커밋을 만들지 않는다. `git`은 검증자가 셸에서 실행하고, 앱은 실행하지 않는다.
   - 준비: `.doan/seen/`이 있는 임시 git 저장소를 등록한다.
   - 확인할 것:
     - 캔버스를 연 뒤 `git status`가 깨끗하다.
     - 전환 전에 켜져 있던 점이 유지된다.
     - 앱이 켜진 채 캔버스를 추가하면 약 2초 뒤 점이 켜진다.
     - 캔버스를 추가하고 바로 커밋해도 점이 켜진다.
     - 캔버스가 더 많은 브랜치로 전환해도 점이 켜지지 않는다.
     - 재시작해도 상태가 같다.
   - 검증: `/runtime-test`(AGENTS.md 'Workflow').
6. 전체 게이트. 이 단계는 커밋을 만들지 않는다.
   - 검증: `node .agents/skills/verify/scripts/verify.mjs`.
7. 결론을 현재 규칙으로, 영문으로 옮기고(근거는 커밋 메시지) 디렉터리를 지운다. 문서마다 커밋을 나눈다.
   - 7a. `docs/PRODUCT.md` §5 item 1 'Canvas notice': 정의 문장, 기록 위치 문단, 첫 등록·새 캔버스 문장, 기록 삭제 문장, 실패 문장. — 커밋
   - 7b. `docs/ARCHITECTURE.md`: 첫머리 'Project directory', §7 'Seen canvases', §11 기기 로컬 파일 목록. — 커밋
   - 7c. `docs/features/seen-local/` 삭제. — 커밋
   - 검증: `grep -n "\.doan/seen\|seen/" docs/PRODUCT.md docs/ARCHITECTURE.md`의 결과는 'Seen canvases'의 전환 문장 한 곳뿐이다. 그리고 `grep -n "appeared since\|lives with the project" docs/PRODUCT.md`의 결과가 없다.
