# canvas-multi-conversation — tasks (상위 feature)

상위 feature는 `/ship`·`/orchestrate`로 돌리지 않는다. 아래 작업은 리드가 대화 안에서 하거나 하위 feature로 넘긴다.

- [ ] 1. 하위 1 `/feature canvas-concurrent-conversations`: spec 공통 결정 1–8과 design.md '하위 1의 범위'를 따른다. 화면 결정(보드 알림·Stop, 작업 메모, 배지, Overview 행, 프로토타입 창 메뉴)을 사용자에게 묻는다. 검증: `docs/features/canvas-concurrent-conversations/{spec,design,tasks}.md`가 커밋되어 있고, '하위 1의 범위'의 모든 항목이 그 spec이나 design에 있다.
- [ ] 2. 하위 1 `/feature-review` → `/design-draft`(사용자가 앱에서 확인). 검증: 리뷰 반영 커밋과 초안 확인 기록이 그 design.md에 있다.
- [ ] 3. 하위 1 구현(`/orchestrate` 또는 `/ship bypass`, 리드가 컨덕터를 띄움). 검증: PR이 develop에 병합되었다.
- [ ] 4. 하위 2 `/feature sidebar-canvas-conversations` → `/feature-review` → `/design-draft`. 하위 1의 `/feature-review` 반영이 커밋되면 시작한다(모델이 그때 고정된다). 하위 2 구현만 하위 1이 병합된 뒤 시작한다. 검증: 문서 커밋과 초안 확인 기록.
- [ ] 5. 하위 2 구현(하위 1 병합 뒤). 검증: PR이 develop에 병합되었다.
- [ ] 6. 하위 3 `/feature canvas-edit-awareness` → `/feature-review` → 구현. 하위 1이 병합된 뒤 시작한다. design.md '하위 3의 범위'. 검증: PR이 develop에 병합되었고 그 PR이 `/agent-eval` 결과를 담는다.
- [ ] 7. 상위 feature를 지운다. 세 하위 feature가 승격을 마친 뒤 PRODUCT와 ARCHITECTURE에 spec 완료 조건이 모두 들어 있는지 확인한다. 검증: `grep -c "one current conversation" docs/PRODUCT.md`가 0, `test ! -d docs/features/canvas-multi-conversation`.
  - 커밋 경계: `docs(canvas-multi-conversation): remove the parent feature`.
