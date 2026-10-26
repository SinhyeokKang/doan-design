# buzz-restyle — tasks (부모)

부모의 task는 자식 feature를 순서대로 끝내는 것이다. 각 자식의 구현 task는 그 자식의 `tasks.md`에 있다.

자식을 시작할 때:
- `/feature <slug>`로 자식 문서를 만들고, [design.md](./design.md)의 해당 조사 메모를 자식 `design.md`로 옮긴다.
- 자식 문서에 'Buzz clone 참조 규칙'을 따른다고 적는다.
- 자식이 공통 결정과 다르게 가야 하면 진행 전에 사용자에게 확인하고, 이 부모의 spec을 고친다.

각 줄의 검증은 같다: 자식 문서의 마지막 task 완료(결론 승격, 자식 디렉터리 삭제)와 PR 머지.

- [ ] 0. `buzz-ds` — 문서 있음: [`../buzz-ds/`](../buzz-ds/spec.md)
- [ ] 1. `buzz-shell`
- [ ] 2. `buzz-onboarding`
- [ ] 3. `buzz-home`
- [ ] 4. `buzz-search`
- [ ] 5. `buzz-project`
- [ ] 6. `buzz-canvas`
- [ ] 7. `buzz-inspector`
- [ ] 8. `buzz-comment`
- [ ] 9. `buzz-settings`
- [ ] 10. 부모 정리: 조사 메모가 모두 자식으로 옮겨졌는지, `docs/DESIGN.md`에 "buzz-ds 이전" 표시가 남지 않았는지 확인하고 `docs/features/buzz-restyle/`을 삭제한다.
  - 검증: `grep -n 'buzz-ds 이전' docs/DESIGN.md` 결과가 없고, 디렉터리가 없다.

── commit: `docs(feature): remove buzz-restyle after all screens` ──
