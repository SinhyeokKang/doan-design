# new-project-folder — spec

Project 단계(첫 실행과 Add Projects 페이지)의 로컬 폴더 카드에 New folder를 둔다. 누르면 macOS 저장 창에서 이름과 위치를 정한다. Doan은 그 자리에 빈 폴더를 만들고, Choose folder로 고른 폴더처럼 설정 패널로 넘어간다.

이 feature는 `project-step-actions`(Project 단계의 알림 자리·모양, 페이지의 "Add project", 버튼 크기, 오류 포커스) 위에 올라간다. 그 feature는 develop에 병합됐다(PR #196). 알림·하단 줄·포커스는 그 규칙을 따른다.

## 사용자

- **사람**: 아직 폴더가 없는 새 디자인 프로젝트를 Finder를 거치지 않고 Doan에서 시작한다.
- **에이전트**: 해당 없음. 사람이 에이전트에게 저장소를 Doan에 맞춰 달라고 하면 에이전트는 `doan onboarding project select`를 쓴다(PRODUCT §5 item 0). CLI와 `doan onboarding`은 바뀌지 않는다.

## 문제

- 빈 폴더에서 Doan 프로젝트를 시작하는 일 자체는 된다. Include in Git은 저장소가 없는 폴더에서도 설정되고, Keep out of Git은 사람이 동의하면 `git init`을 한다(PRODUCT §5 item 0 'Doan files').
- 그런데 Project 단계에서는 이미 있는 폴더만 고를 수 있다. 방법은 Choose folder, 끌어 놓기, 'Your projects', GitHub URL이다. 그래서 새 폴더는 Finder에서 먼저 만들어야 한다.
- Choose folder 창에는 macOS New Folder 버튼도 없다. 이 버튼은 클론 위치 창(Choose Where to Clone)에만 있다(`app/src/main/index.ts` `chooseFolder`).

## 정한 점

1. **창은 macOS 저장 창**이다. 이름 칸과 위치를 한 시트에서 고르고, 버튼은 Create다. Choose folder 창과 같이 창에 시트로 붙는다. 앱이 그리는 대화상자는 없다. 이 저장 창에는 macOS New Folder 버튼을 켜지 않는다. 켜면 그 버튼으로 만든 폴더 안으로 창이 들어가서, 폴더가 한 번 더 안에 생긴다.
2. **두 곳 모두**: 첫 실행의 Project 단계와 Add Projects 페이지. 두 화면은 같은 Project 단계를 쓴다. 로컬 폴더 카드에 Choose folder 다음으로 둔다(Tab 순서도 그렇다). 라벨은 "New folder"이고 말줄임표가 없으며, Choose folder와 같은 `subtle` `sm`이다. 카드 제목은 "Open a local folder"에서 "Use a folder on your Mac"으로, 설명은 "Use a project that’s already on your Mac."에서 "Choose a project folder you already have, or create a new one."으로 바꾼다.
3. **이름과 위치**: 이름 칸에는 macOS 기본 이름(영어 "Untitled", 한국어 "무제")이 선택된 채 열리고, 입력하면 그 이름이 바뀐다. Electron 저장 창은 이름 칸을 비워 둘 수 없다(작업 1 PoC). 위치는 클론과 같은 규칙을 따른다. 마지막으로 등록한 프로젝트의 부모 폴더이고, 등록된 프로젝트가 없으면 HOME이다. 이미 있음 알림의 Choose another name은 직전에 고른 위치에서 다시 연다. 프로젝트 안·실패 알림의 Change location은 그 위치가 원인이므로 기본 위치에서 연다. 직전 이름은 채우지 않는다.
4. **판단 순서**: 폴더를 만들기 전에 판단한다.
   1. 고른 위치가 설정된 Doan 프로젝트 안이면 거부한다. 등록 여부와 상관없다. 클론 위치와 같은 규칙이다.
   2. 같은 이름이 이미 있으면 알린다. 폴더면 Choose another name과 Use existing folder를 주고, 파일이나 다른 것이면 Choose another name만 준다. 어떤 경우에도 덮어쓰지 않는다.
   3. 만들 수 없으면(권한, 사라진 위치, 읽기 전용 볼륨, 너무 긴 이름 등) 실패를 알리고 Change location을 준다.
5. **Choose folder 창에 macOS New Folder 버튼을 켠다**(`createDirectory`). 클론 위치 창과 같아진다.
6. **만든 뒤의 흐름은 Choose folder와 같다**. 만든 폴더를 바로 검사(inspect)하고, 빈 폴더이므로 설정 패널(Doan files 선택 포함)로 간다. 페이지에서는 하단 "Add project"가 동의이고, 첫 실행에서는 카드 안 "Set up and continue"다(`project-step-actions`). 폴더 만들기와 Doan 설정은 별개다. 설정 전에 그만두면 빈 폴더는 디스크에 남는다.
7. **잠금은 Choose folder와 같다**. 저장 창이 열린 동안 Project 단계는 바쁜 상태(busy)이지만 페이지를 잠그지 않는다. 저장 창이 돌아왔을 때 그 화면이 이미 사라졌으면 폴더를 만들지 않는다. PRODUCT 'Leaving' 규칙은 바뀌지 않는다.
8. **포커스와 알림 모양은 `project-step-actions`를 따른다**. New folder의 알림은 폴더 출처 알림이라 카드 바로 아래에 뜨고, 동작은 알림 안에 있으며(동작 둘이면 아래 줄에 쌓음), 뜨면 포커스를 받는다. 저장 창을 취소하면 포커스는 New folder로 돌아온다. 알림 안의 Choose another name·Change location이 연 저장 창을 취소하면 그 알림이 아직 있으면 그 버튼으로, 없으면 New folder로 돌아온다.

## 완료 조건

- 첫 실행 Project 단계와 Add Projects 페이지의 로컬 폴더 카드 제목이 "Use a folder on your Mac"이고, New folder가 Choose folder 다음에 있다.
  - Tab으로 닿고, Enter나 Space로 저장 창이 열린다.
  - 다른 작업 중(busy)에는 Choose folder와 같이 비활성이다.
- New folder를 누르면 Choose folder 창과 같은 방식으로 창에 붙은 macOS 저장 창이 열린다. 이름 칸은 macOS 기본 이름이 선택된 상태이고, 위치는 정한 점 3의 기본값이다.
  - 취소하면 아무것도 바뀌지 않고 `document.activeElement`가 New folder다.
- 새 이름으로 Create를 누르면 그 위치에 빈 폴더가 생기고, 설정 패널이 그 폴더로 열린다. 페이지에서는 하단 "Add project"가 켜진다.
- 같은 이름의 폴더가 있으면 카드 바로 아래에 알림이 뜨고 포커스가 알림으로 간다. macOS가 Replace를 물어 Replace를 눌렀어도 기존 폴더와 그 내용은 그대로다.
  - Use existing folder는 그 폴더를 검사한다.
  - Choose another name은 직전 위치에서 저장 창을 다시 연다.
  - 같은 이름이 파일이면 Choose another name만 있다.
- 설정된 Doan 프로젝트 안의 위치를 고르면 폴더를 만들지 않고 거부 알림을 보인다. 같은 이름이 있어도 이 알림이 먼저다.
- 폴더를 만들 수 없으면 아무것도 만들어지지 않는다. 알림에 시도한 경로와 Change location이 있다.
- Choose folder 창에 macOS New Folder 버튼이 있다.
- PRODUCT §5 item 0 'Project step'과 item 1 'Add Projects', ARCHITECTURE §7 'Settings IPC'의 'Project addition'·'Main boundary'가 New folder를 적는다.

## 하지 않는 것

- 앱이 그리는 이름·위치 대화상자.
- 저장 창 안에서 이름을 미리 검사하기. Electron에 그런 고리가 없다.
- 템플릿, 시작 캔버스, README 같은 파일 만들기. 폴더 하나만 만든다.
- New folder에서 `git init`. 저장소 생성은 기존 Keep out of Git 동의 규칙만 따른다.
- CLI·`doan onboarding`에 폴더 만들기 추가.
- 설정을 그만둔 뒤 빈 폴더 지우기.
- 첫 실행 Project 단계의 실제 앱 확인. 격리 앱에는 로그인된 에이전트가 없어 그 단계에 닿을 수 없다(DESIGN.md). 같은 화면을 쓰는 Add Projects에서 확인하고, 첫 실행은 단위 테스트로 보고 미확인으로 기록한다.
