# prototype-frame-links — tasks (상위 feature)

상위 feature는 `/ship`·`/orchestrate`로 돌리지 않는다. 아래 작업은 리드가 대화 안에서 하거나 하위 feature로 넘긴다.

- [ ] 1. 하위 1 `/feature prototype-link-convention` → `/feature-review`. spec 공통 결정과 design.md '하위 1의 범위'를 따른다. 화면이 없어 초안은 없다. 검증: `docs/features/prototype-link-convention/{spec,design,tasks}.md`가 커밋되어 있고, '하위 1의 범위'의 모든 항목이 그 spec이나 design에 있다.
- [ ] 2. 하위 2 `/feature prototype-link-play` → `/feature-review` → `/design-draft`(토스트, 이동, 묶음별 프레임 서랍, 사용자가 앱에서 확인). 하위 1의 `/feature-review`가 반영되면 시작한다. 검증: 문서 커밋과 초안 확인 기록.
- [ ] 3. 하위 3 `/feature prototype-link-export` → `/feature-review`. 하위 1의 `/feature-review`가 반영되면 시작한다. 검증: 문서 커밋.
- [ ] 4. 세 하위를 한 `/chain`으로 잇는다(1 → 2 → 3, 사이에 릴리스 없음). 하위 2는 `chain-261114-2` 링크 3(`canvas-edit-awareness`)의 가이드 변경이 병합된 뒤 시작한다. 검증: 체인 파일이 커밋되어 있다.
- [ ] 5. 하위 1 구현. 검증: PR이 develop에 병합되었다.
- [ ] 6. 하위 2 구현. 검증: PR이 develop에 병합되었고 그 PR이 `/agent-eval` 결과를 담는다.
- [ ] 7. 하위 3 구현. 검증: PR이 develop에 병합되었다.
- [ ] 8. 상위 feature를 지운다. 세 하위 feature가 승격을 마친 뒤 PRODUCT와 ARCHITECTURE에 spec 완료 조건이 모두 들어 있는지 확인한다. 검증: `grep -c "frames do not link to each other" docs/PRODUCT.md`가 0, `test ! -d docs/features/prototype-frame-links`.
  - 커밋 경계: `docs(prototype-frame-links): remove the parent feature`.
