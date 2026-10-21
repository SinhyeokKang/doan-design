# formats — tasks

명령: AGENTS.md 'Commands' 절이 아직 비어 있다. TS·Go 테스트 명령은 **명령 미정 — 사용자 확인 필요**. 이 피처가 처음으로 코드를 깔므로, 첫 코드 태스크 전에 TS·Go 프로젝트 위치와 테스트 명령을 정해 'Commands' 절에 적는다.

1. **PoC 5: `merge=union`** (`.scratch/`)
   - 두 브랜치가 같은 JSONL 끝에 각자 `create`·`delete` 이벤트를 붙이고 머지한다.
   - 검증: 충돌 없이 머지되고, 양쪽 줄이 다 남는다. 결과를 PRODUCT §6에 적는다(관찰과 날짜).
   - 커밋: PRODUCT §6 갱신만(`docs(product):`).
2. **TS·Go 위치와 테스트 명령 정하기**
   - 검증: AGENTS.md 'Commands' 절에 명령이 있고, 빈 테스트가 양쪽에서 돈다.
   - 커밋: `chore:` 골격 + `docs:` AGENTS.md.
3. **스키마 세 개 + 유효·무효 픽스처**
   - 검증: TS·Go 검증기가 모든 픽스처에 같은 판정을 낸다(유효는 통과, 무효는 실패).
   - 커밋: `feat(formats): add v1 schemas and fixtures`.
4. **접기 픽스처** (`schema/fixtures/fold/<case>/`)
   - 케이스: 기본 생성·수정·resolve·다시 open · 줄 순서 섞기 · 중복 이벤트 · 삭제 후 이벤트 · 에이전트 수정 거부 · 모르는 `v` · create 전 이벤트 · 같은 `at` 동률.
   - 검증: 픽스처 파일만 있고, 테스트는 red.
   - 커밋: `test(formats): add fold fixtures` (red 커밋).
5. **TS 접기 구현**
   - 검증: TS 접기 테스트가 모든 케이스에서 기대 JSON과 바이트 단위로 같다.
6. **Go 접기 구현**
   - 검증: Go 접기 테스트가 같은 기대 JSON과 바이트 단위로 같다.
   - 커밋(5·6): `feat(formats): implement event folding in TS and Go`.
7. **정본 승격**
   - 결론(스키마 위치, 필드, 접기 규칙, 경고 코드, 종료 코드)을 ARCHITECTURE §11·§12에 올리고 PRODUCT §7 결정 기록에 날짜·근거를 남긴다. `docs/features/formats/`를 지운다.
   - 커밋: `docs(product):` + 디렉터리 삭제.
