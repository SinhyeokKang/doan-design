# project-step-actions — spec

출시된 Project 단계(첫 실행과 Add Projects 페이지)의 알림과 버튼을 다시 정리한다. 폴더 오류를 카드 아래에 두고, 알림의 동작을 알림 안에 넣고, Add Projects 페이지의 제출을 "Add project" 하나로 모으고, 중간 과정 버튼을 작은 크기로 줄인다. `new-project-folder`(New folder)가 이 feature 위에 올라간다. 이 feature가 먼저 develop에 병합된다.

## 사용자

- **사람**: 첫 실행과 Add Projects 페이지에서 프로젝트를 더한다. 오류가 누른 버튼 가까이에 뜨고, 페이지에서는 무엇을 하든 오른쪽 아래 "Add project"를 누르면 추가가 끝난다.
- **에이전트**: 해당 없음. 에이전트가 읽는 글(`cli/internal/cli/skill.md:53`, `active.go:30`, `open_rules.go:82`)은 "Add Project…"·"Add Projects"만 말하고 바뀌는 라벨을 말하지 않는다. `doan onboarding` 메시지도 그렇다. 그래서 `/agent-eval`은 하지 않는다.

## 문제

- Choose folder 실패 알림이 카드가 아니라 URL 칸 뒤에 뜬다. choose 화면의 오류가 모두 한 자리(`Onboarding.tsx:560`)를 쓰기 때문이다. 누른 버튼과 오류가 멀다.
- 알림의 동작이 알림 아래 별도 줄(`.ob-state-actions`, `Onboarding.tsx:327`)에 있다. 화면 동작 줄과 구분되지 않는다.
- Add Projects 페이지의 제출이 단계마다 다른 자리와 라벨이다. 후보 목록은 하단 오른쪽 "Use this folder", 클론은 하단 오른쪽 "Clone and add", 설정은 카드 안 "Set up and add"이고, 처음 선택 화면에는 제출이 없다(`projectStep.ts:506-519`, `Onboarding.tsx:591`).
- Choose folder와 Find repository가 기본 크기라, 단계를 끝내는 하단 버튼과 무게가 같다.

## 정한 점

1. **알림 자리는 출처별로 나눈다**. 폴더에서 난 오류(Choose folder, 끌어 놓기, 첫 실행의 'Your projects')는 로컬 폴더 카드 바로 아래, 지금 끌어 놓기 알림이 쓰는 자리에 둔다. URL에서 난 오류는 지금처럼 URL 칸 뒤에 둔다. 끌어 놓기 알림과 폴더 오류는 한 자리를 쓰고 서로를 지운다(나중 것만 보인다). 끌어 놓기 알림은 지금처럼 포커스를 받지 않는다.
2. **알림이 제안하는 동작은 알림 안에 둔다**. 오류 알림과 상태 알림(클론 취소됨 등)의 동작 버튼이 `.doan-notice` 안으로 들어간다(디자인 시스템이 이미 받는다, `ds/surfaces.css:208`; Project Settings가 이렇게 쓴다, `ProjectSettingsPage.tsx:379`). 동작이 하나면 문장 옆 같은 줄, 둘 이상이면 문장 아래 줄 끝에 쌓는다. 쌓을 때는 버튼의 음수 여백을 빼서 아래 패딩 12가 남고, 문장과 버튼 줄 사이는 8이다. 알림 밖에 남는 것: 진행 줄의 Cancel("Checking repository", "Cloning…"), 클론을 멈추는 동안의 비활성 버튼 쌍, invalid_url 아래의 화면 동작 줄(Choose local folder / Find repository). 이들은 화면 버튼이다. 알림의 동작은 옆에 다시 나오지 않는다는 출시 규칙(`repeats()`, `Onboarding.tsx:506`)은 그대로다.
3. **알림 안 버튼은 모두 같은 무게**다. 인셋 알림은 `panel`, 첫 실행의 흰 알림은 `subtle`이다. 출시에서 강조(`prominent`)였던 Retry와 Use existing folder도 같은 무게가 된다. 강조는 하단 주 버튼에 모인다. Retry는 `data-consent`를 유지한다.
4. **Add Projects 페이지의 제출은 하단 오른쪽 "Add project" 하나다**. 페이지가 잠기지 않은 모든 단계에서 Cancel 줄 오른쪽에 있고, 추가할 수 있을 때만 켜진다.
   - 켜지는 때: 고른 폴더의 검사가 끝나 설정됐거나 설정할 수 있을 때, 후보 목록이 보일 때(첫 후보가 늘 미리 골라져 있다, `projectStep.ts:304`), 저장소 URL을 찾아 클론할 수 있을 때.
   - 꺼지는 때: 처음 선택 화면, 검사 중, 오류 알림이 떠 있을 때.
   - 클론 취소 뒤: 'Cloning was cancelled'는 상태 알림이고 URL은 여전히 클론할 수 있으므로 Add project가 켜진다. 누르면 다시 클론한다. 그래서 알림 안 Retry는 빼고 Choose local folder만 남긴다.
   - 누르면: 설정된 폴더나 후보는 등록하고 Home으로 간다. 설정이 필요한 폴더는 그 설정 패널에서 누른 것이 동의이고, 설정하고 등록한다. 설정이 필요한 후보는 먼저 그 설정 패널을 연다(첫 번째 누름). 거기서 다시 누른 것이 동의다. 보여 주지 않은 계획에는 동의하지 않는다(ARCHITECTURE §7 'Settings IPC'). URL은 클론한다.
   - 없어지는 것: 라벨 "Use this folder", "Clone and add", "Set up and add"와 페이지 설정 카드 안의 제출 버튼.
   - 그대로인 것: Find repository(URL을 확인하는 동작), 첫 실행의 하단 줄과 라벨(후보 "Use this folder", 클론 "Clone and continue", 완료 저장 실패 "Retry", 그 밖 "Open Doan")과 카드 안 "Set up and continue".
5. **설정된 폴더는 페이지에서 바로 추가되지 않는다**. 지금은 설정할 것이 없는 후보 하나면 바로 등록하고 Home으로 간다(`projectStep.ts:284-286`). 페이지에서는 검사 뒤 "Add project"가 켜지고 그것을 눌러야 추가된다. 첫 실행은 지금처럼 바로 선택한다.
6. **잠긴 동안 하단 줄은 숨긴다**. 설정을 쓰는 동안(selecting), 클론 중, 클론을 멈추는 중에는 지금처럼 하단 줄이 없다(`leaveLocked`, `addProjectsNav.ts:75`; PRODUCT §5 item 1 'Leaving'). 4번의 "늘 있다"는 잠기지 않은 단계를 말한다.
7. **중간 과정 버튼은 작은 크기(`sm`)**다. 바뀌는 버튼은 Choose folder와 Find repository다. access_failed 알림의 두 버튼(Choose local folder, Retry)은 결정 2로 알림 안에 들어가면서 `sm`이 된다. 다른 중간 버튼과 알림 안 버튼은 이미 `sm`이다. 하단 줄 버튼(페이지 Cancel·Add project, 첫 실행 Back·Open Doan)은 지금 크기다. 첫 실행에도 같이 적용된다.
8. **오류 알림이 뜨면 포커스는 알림으로 간다**. 시트(Choose folder 등)를 연 버튼으로 돌아가는 지금 규칙은 오류가 없을 때만 적용한다. 그래서 Choose folder로 고른 폴더가 실패하면 버튼이 아니라 알림으로 간다. 같은 이유로 Change(클론 위치), URL 화면의 Choose existing folder, 저장 방식 라디오를 바꿔 다시 계획한 경우의 실패도 알림으로 간다. 알림 안 버튼이 연 시트를 취소하면 그 알림이 아직 있으면 그 버튼으로, 없으면 choose 화면에서는 카드의 Choose folder로, 카드가 없는 URL 화면과 클론 화면에서는 그 화면의 첫 번째 사용할 수 있는 동작으로 돌아간다(클론 취소 알림의 지금 규칙과 같다). 클론 취소 알림(상태)과 끌어 놓기 알림은 지금처럼 포커스를 가져가지 않는다.

## 완료 조건

- choose 화면에서 Choose folder·끌어 놓기·'Your projects' 실패 알림은 카드 바로 아래에, URL 오류는 URL 칸 뒤에 뜬다. 끌어 놓기 알림이 떠 있을 때 폴더 오류가 나면 끌어 놓기 알림이 없어지고, 반대도 그렇다.
- Project 단계의 모든 오류·상태 알림은 동작 버튼을 알림 안에 둔다. 동작 둘 이상이면 아래 줄 끝에 쌓이고 아래 패딩이 12다. 진행 줄의 Cancel과 화면 동작 줄은 알림 밖에 있다.
- 알림 안 버튼은 인셋 알림에서 `panel`, 첫 실행 흰 알림에서 `subtle`이다. Retry는 `data-consent`가 있다.
- Add Projects 페이지는 잠기지 않은 모든 단계에서 하단 줄이 Cancel과 "Add project"다. "Add project"는 정한 점 4대로 켜지고 꺼진다. 페이지 어디에도 "Use this folder", "Clone and add", "Set up and add"가 없다.
- 설정 패널에서 Keep out of Git을 고르면 "Add project"의 `aria-describedby`가 `git init` 줄을 가리키고, 누르면 그 화면이 보여 준 계획에만 동의한다.
- 설정이 필요한 후보는 첫 "Add project"로 설정 패널이 열리고, 거기서 누른 "Add project"로 설정된다.
- 설정된 폴더는 페이지에서 검사 뒤 "Add project"를 눌러야 추가된다. 첫 실행은 바로 선택한다.
- 잠긴 동안(설정 쓰기, 클론, 클론 멈추기) 페이지 하단 줄이 없다.
- Choose folder, Find repository, access_failed의 두 버튼은 `sm`이다.
- 첫 실행의 하단 줄과 라벨, 카드 안 "Set up and continue"는 develop과 같다.
- 오류 알림이 뜨면 `document.activeElement`가 그 알림이다.

## 하지 않는 것

- New folder(`new-project-folder`가 한다). 로컬 폴더 카드의 제목·설명 변경도 그쪽이다.
- 첫 실행의 하단 줄과 제출 방식 변경.
- Project Settings 페이지의 Set Up 대화상자.
- 디자인 시스템 알림의 한 줄 배치 변경(한 줄 배치는 그대로, 쌓는 배치만 더한다).
- 첫 실행 Project 단계의 실제 앱 확인. 격리 앱에는 로그인된 에이전트가 없어 그 단계에 닿을 수 없다(DESIGN.md 'Onboarding'). 같은 화면인 Add Projects에서 확인하고 첫 실행은 단위 테스트로 본다.
